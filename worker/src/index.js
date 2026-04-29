// Cloudflare Worker entry point. Mirrors the /v1/* surface of server/index.js.
//
// Bindings (see wrangler.toml):
//   env.DB       - D1 (auth, history, stats)
//   env.CORPUS   - R2 (training corpus)
//   env.<NAME>   - per-provider env-fallback API keys (set via `wrangler secret put`)
//   env.AUTH_SECRET, env.JWT_TTL_SECONDS

import { Hono } from "hono";
import { cors } from "hono/cors";
import { ADAPTERS, modelFor } from "./adapters.js";
import { aggregate } from "./aggregate.js";
import { textStats } from "./stats.js";
import { detectTone, proofreadForGoals } from "./features.js";
import { record, recordApplied } from "./corpus.js";
import * as auth from "./auth.js";

const app = new Hono();
app.use("*", cors());

// Decode a Bearer token (if any) onto the context for downstream handlers.
app.use("*", async (c, next) => {
  const m = (c.req.header("authorization") || "").match(/^Bearer (.+)$/);
  c.set("user", m ? await auth.verifyToken(c.env, m[1]) : null);
  await next();
});

// ---- Health & catalog ------------------------------------------------------

app.get("/v1/health", (c) => c.json({
  ok: true,
  env_enabled: ADAPTERS.filter((a) => a.keyFor({ keys: {} }, c.env)).map((a) => a.name),
  providers: ADAPTERS.map((a) => a.name),
  auth_enabled: !!c.env.DB,
  version: "0.3.0",
  runtime: "cloudflare-workers",
}));

app.get("/v1/models", (c) => c.json({
  providers: ADAPTERS.map((a) => ({
    name: a.name,
    default: a.defaultModel,
    suggestions: a.suggestedModels || [],
  })),
}));

// ---- Proofreading ----------------------------------------------------------

app.post("/v1/check", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text ?? "").toString();
  if (!text.trim()) return c.json({ models_used: [], suggestions: [] });

  const active = ADAPTERS
    .map((a) => ({ a, key: a.keyFor(body, c.env), model: modelFor(a, body) }))
    .filter((x) => !!x.key);

  const results = await Promise.allSettled(active.map((x) => x.a.run(text, x.key, x.model)));

  const perModel = [];
  for (let i = 0; i < active.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      perModel.push({ name: active[i].a.name, suggestions: r.value.suggestions });
    } else {
      console.warn(`[${active[i].a.name}] failed:`, r.reason?.message || r.reason);
    }
  }

  const suggestions = aggregate(text, perModel);
  const payload = { models_used: perModel.map((p) => p.name), suggestions };

  // Don't block the response on the corpus write.
  c.executionCtx.waitUntil(
    record(c.env, { text, suggestions, models_used: payload.models_used })
      .catch((e) => console.warn("corpus.record failed:", e.message)),
  );

  return c.json(payload);
});

app.post("/v1/applied", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { text, original, replacement } = body;
  if (!text || !original || replacement === undefined) {
    return c.json({ ok: false, error: "missing fields" }, 400);
  }

  c.executionCtx.waitUntil(
    recordApplied(c.env, { text, original, replacement })
      .catch((e) => console.warn("recordApplied failed:", e.message)),
  );

  const u = c.get("user");
  if (u && c.env.DB) {
    c.executionCtx.waitUntil(
      auth.recordHistory(c.env, u.sub, {
        text, original, replacement,
        type: body.type, explanation: body.explanation,
        confidence: body.confidence, agreed_by: body.agreed_by,
        models_used: body.models_used,
      }).catch((e) => console.warn("history record failed:", e.message)),
    );
  }
  return c.json({ ok: true });
});

// ---- Tone, goals, stats ----------------------------------------------------

app.post("/v1/tone", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text ?? "").toString();
  if (!text.trim()) return c.json({ tones: [], primary: null, summary: "" });
  try { return c.json(await detectTone(c.env, body, text)); }
  catch (e) { return c.json({ error: e.message }, 500); }
});

app.post("/v1/goals", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text ?? "").toString();
  if (!text.trim()) return c.json({ suggestions: [] });
  try { return c.json(await proofreadForGoals(c.env, body, text, body.goals || {})); }
  catch (e) { return c.json({ error: e.message }, 500); }
});

app.post("/v1/stats", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const text = (body.text ?? "").toString();
  return c.json(textStats(text));
});

// ---- Auth + history --------------------------------------------------------

const requireAuth = async (c, next) => {
  if (!c.get("user")) return c.json({ error: "auth required" }, 401);
  await next();
};

app.post("/v1/auth/signup", async (c) => {
  if (!c.env.DB) return c.json({ error: "auth not configured" }, 503);
  const { email, password } = await c.req.json().catch(() => ({}));
  if (!email || !password || password.length < 8) {
    return c.json({ error: "email and password (>=8 chars) required" }, 400);
  }
  try {
    const u = await auth.signup(c.env, email.toLowerCase().trim(), password);
    return c.json({ user: u, token: await auth.token(c.env, u) });
  } catch (e) {
    return c.json({ error: e.message }, 400);
  }
});

app.post("/v1/auth/login", async (c) => {
  if (!c.env.DB) return c.json({ error: "auth not configured" }, 503);
  const { email, password } = await c.req.json().catch(() => ({}));
  try {
    const u = await auth.login(c.env, (email || "").toLowerCase().trim(), password || "");
    return c.json({ user: u, token: await auth.token(c.env, u) });
  } catch (e) {
    return c.json({ error: e.message }, 401);
  }
});

app.get("/v1/me", requireAuth, (c) => {
  const u = c.get("user");
  return c.json({ user: { id: u.sub, email: u.email } });
});

app.get("/v1/history", requireAuth, async (c) => {
  const u = c.get("user");
  const limit = Math.min(200, Number(c.req.query("limit")) || 50);
  const offset = Math.max(0, Number(c.req.query("offset")) || 0);
  return c.json({ items: await auth.listHistory(c.env, u.sub, { limit, offset }) });
});

app.get("/v1/me/stats", requireAuth, async (c) => {
  const u = c.get("user");
  return c.json(await auth.userStats(c.env, u.sub));
});

app.get("/v1/global/stats", async (c) => c.json(await auth.globalStats(c.env)));

// Friendly 404 for anything else under /v1/*.
app.all("/v1/*", (c) => c.json({ error: "not found" }, 404));

export default app;

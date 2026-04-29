import "dotenv/config";
import express from "express";
import cors from "cors";
import { ADAPTERS } from "./adapters.js";
import { aggregate } from "./aggregate.js";
import { record, recordApplied } from "./corpus.js";
import { textStats } from "./stats.js";
import { detectTone, proofreadForGoals } from "./features.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

// Auth is optional. We dynamically import so a developer who hasn't run
// `npm install` (or doesn't want the SQLite native dep) can still boot the
// server and use the BYOK proofreading endpoints.
let auth = null;
try {
  auth = await import("./auth.js");
  app.use(auth.authMiddleware);
} catch (e) {
  console.warn("[auth] disabled — install better-sqlite3 to enable:", e.message);
}

app.get("/v1/health", (_req, res) => {
  res.json({
    ok: true,
    env_enabled: ADAPTERS.filter((a) => a.keyFor({ keys: {} })).map((a) => a.name),
    providers: ADAPTERS.map((a) => a.name),
    auth_enabled: !!auth,
    version: "0.2.0",
  });
});

// ---------- Proofreading -----------------------------------------------------

app.post("/v1/check", async (req, res) => {
  const text = (req.body?.text ?? "").toString();
  if (!text.trim()) return res.json({ models_used: [], suggestions: [] });

  const active = ADAPTERS
    .map((a) => ({ a, key: a.keyFor(req.body || {}) }))
    .filter((x) => !!x.key);

  const results = await Promise.allSettled(active.map((x) => x.a.run(text, x.key)));

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

  setImmediate(() => {
    try { record({ text, suggestions, models_used: payload.models_used }); }
    catch (e) { console.warn("corpus.record failed:", e.message); }
  });

  res.json(payload);
});

app.post("/v1/applied", (req, res) => {
  const { text, original, replacement } = req.body || {};
  if (!text || !original || replacement === undefined) {
    return res.status(400).json({ ok: false, error: "missing fields" });
  }
  try { recordApplied({ text, original, replacement }); }
  catch (e) { console.warn("corpus.recordApplied failed:", e.message); }

  if (auth && req.user) {
    try {
      auth.recordHistory(req.user.sub, {
        text, original, replacement,
        type: req.body.type, explanation: req.body.explanation,
        confidence: req.body.confidence, agreed_by: req.body.agreed_by,
        models_used: req.body.models_used,
      });
    } catch (e) { console.warn("history record failed:", e.message); }
  }
  res.json({ ok: true });
});

// ---------- Tone, goals, stats ----------------------------------------------

app.post("/v1/tone", async (req, res) => {
  const text = (req.body?.text ?? "").toString();
  if (!text.trim()) return res.json({ tones: [], primary: null, summary: "" });
  try { res.json(await detectTone(text, req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/v1/goals", async (req, res) => {
  const text = (req.body?.text ?? "").toString();
  const goals = req.body?.goals || {};
  if (!text.trim()) return res.json({ suggestions: [] });
  try { res.json(await proofreadForGoals(text, goals, req.body || {})); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/v1/stats", (req, res) => {
  const text = (req.body?.text ?? "").toString();
  res.json(textStats(text));
});

// ---------- Auth + history --------------------------------------------------

if (auth) {
  app.post("/v1/auth/signup", (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ error: "email and password (>=8 chars) required" });
    }
    try {
      const u = auth.signup(email.toLowerCase().trim(), password);
      res.json({ user: u, token: auth.token(u) });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post("/v1/auth/login", (req, res) => {
    const { email, password } = req.body || {};
    try {
      const u = auth.login((email || "").toLowerCase().trim(), password || "");
      res.json({ user: u, token: auth.token(u) });
    } catch (e) {
      res.status(401).json({ error: e.message });
    }
  });

  app.get("/v1/me", auth.requireAuth, (req, res) => {
    res.json({ user: { id: req.user.sub, email: req.user.email } });
  });

  app.get("/v1/history", auth.requireAuth, (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 50);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    res.json({ items: auth.listHistory(req.user.sub, { limit, offset }) });
  });

  app.get("/v1/me/stats", auth.requireAuth, (req, res) => {
    res.json(auth.userStats(req.user.sub));
  });

  app.get("/v1/global/stats", (_req, res) => {
    res.json(auth.globalStats());
  });
}

// ---------- Boot ------------------------------------------------------------

const port = Number(process.env.PORT || 8787);
app.listen(port, () => {
  console.log(`Qrammarly server on :${port} (${ADAPTERS.length} providers; BYOK${auth ? "; auth on" : ""})`);
});

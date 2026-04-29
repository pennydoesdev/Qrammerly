// D1-backed auth: signup/login + per-user history + stats. Mirrors the API
// surface of server/auth.js so clients (extensions, Mac app, website) can
// switch endpoints without changing payloads.

import jwt from "@tsndr/cloudflare-worker-jwt";

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

// ---- password hashing (WebCrypto, no node deps) ----------------------------

function bytesToHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function pbkdf2(password, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey, HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterStr, saltHex, hashHex] = (stored || "").split("$");
  if (scheme !== "pbkdf2" || !saltHex || !hashHex) return false;
  const salt = hexToBytes(saltHex);
  const expected = hexToBytes(hashHex);
  const got = await pbkdf2(password, salt);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

// ---- D1 helpers ------------------------------------------------------------

export async function signup(env, email, password) {
  const hash = await hashPassword(password);
  try {
    const r = await env.DB.prepare(
      "INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id, email"
    ).bind(email, hash).first();
    return { id: r.id, email: r.email };
  } catch (e) {
    if (String(e.message || e).includes("UNIQUE")) throw new Error("email already registered");
    throw e;
  }
}

export async function login(env, email, password) {
  const u = await env.DB.prepare(
    "SELECT id, email, password_hash FROM users WHERE email = ?"
  ).bind(email).first();
  if (!u) throw new Error("invalid credentials");
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) throw new Error("invalid credentials");
  return { id: u.id, email: u.email };
}

export async function token(env, user) {
  const ttl = Number(env.JWT_TTL_SECONDS || 604800);
  return jwt.sign(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + ttl },
    env.AUTH_SECRET || "dev-secret-change-me",
  );
}

export async function verifyToken(env, raw) {
  if (!raw) return null;
  try {
    const ok = await jwt.verify(raw, env.AUTH_SECRET || "dev-secret-change-me");
    if (!ok) return null;
    return jwt.decode(raw).payload;
  } catch { return null; }
}

export async function recordHistory(env, userId, p) {
  await env.DB.prepare(`
    INSERT INTO history (user_id, text, original, replacement, type, explanation,
                         confidence, agreed_by, models_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    userId, p.text, p.original, p.replacement,
    p.type ?? null, p.explanation ?? null,
    p.confidence ?? null, p.agreed_by ?? null,
    JSON.stringify(p.models_used || []),
  ).run();
}

export async function listHistory(env, userId, { limit = 50, offset = 0 } = {}) {
  const r = await env.DB.prepare(`
    SELECT id, ts, text, original, replacement, type, explanation,
           confidence, agreed_by, models_used
    FROM history WHERE user_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?
  `).bind(userId, limit, offset).all();
  return (r.results || []).map((row) => ({
    ...row,
    models_used: row.models_used ? JSON.parse(row.models_used) : [],
  }));
}

export async function userStats(env, userId) {
  const totals = await env.DB.prepare(`
    SELECT COUNT(*) AS corrections,
           COUNT(DISTINCT date(ts)) AS active_days,
           AVG(confidence) AS avg_confidence
    FROM history WHERE user_id = ?
  `).bind(userId).first();
  const byType = await env.DB.prepare(`
    SELECT type, COUNT(*) AS n FROM history
    WHERE user_id = ? AND type IS NOT NULL
    GROUP BY type ORDER BY n DESC
  `).bind(userId).all();
  const last7 = await env.DB.prepare(`
    SELECT date(ts) AS day, COUNT(*) AS n FROM history
    WHERE user_id = ? AND ts >= date('now','-7 days')
    GROUP BY day ORDER BY day
  `).bind(userId).all();
  return { ...totals, by_type: byType.results || [], last_7_days: last7.results || [] };
}

export async function globalStats(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS users FROM users").first();
  return r;
}

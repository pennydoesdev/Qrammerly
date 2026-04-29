// Tiny auth layer: signup/login with bcrypt hashing + JWT access tokens, and a
// per-user history table that records every accepted correction. The schema is
// deliberately small so the same SQLite file can be replicated and shipped
// alongside the corpus when you stand up a new node.
//
// Tables:
//   users(id, email UNIQUE, password_hash, created_at)
//   history(id, user_id, ts, text, original, replacement, type, explanation,
//           confidence, agreed_by, models_used)

import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const DB_PATH = process.env.AUTH_DB || "./data/auth.sqlite";
const SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";
const TOKEN_TTL = "7d";

let db;
function open() {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ts TEXT NOT NULL DEFAULT (datetime('now')),
      text TEXT NOT NULL,
      original TEXT NOT NULL,
      replacement TEXT NOT NULL,
      type TEXT,
      explanation TEXT,
      confidence REAL,
      agreed_by INTEGER,
      models_used TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_history_user_ts ON history(user_id, ts);
  `);
  return db;
}

export function signup(email, password) {
  const d = open();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = d.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(email, hash);
    return { id: r.lastInsertRowid, email };
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) throw new Error("email already registered");
    throw e;
  }
}

export function login(email, password) {
  const d = open();
  const u = d.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(email);
  if (!u || !bcrypt.compareSync(password, u.password_hash)) throw new Error("invalid credentials");
  return { id: u.id, email: u.email };
}

export function token(user) {
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, { expiresIn: TOKEN_TTL });
}

export function authMiddleware(req, _res, next) {
  const auth = req.headers.authorization || "";
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return next();
  try {
    req.user = jwt.verify(m[1], SECRET);
  } catch { /* invalid token: treat as anon */ }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "auth required" });
  next();
}

export function recordHistory(userId, payload) {
  const d = open();
  const stmt = d.prepare(`
    INSERT INTO history (user_id, text, original, replacement, type, explanation,
                         confidence, agreed_by, models_used)
    VALUES (@user_id, @text, @original, @replacement, @type, @explanation,
            @confidence, @agreed_by, @models_used)
  `);
  stmt.run({
    user_id: userId,
    text: payload.text,
    original: payload.original,
    replacement: payload.replacement,
    type: payload.type || null,
    explanation: payload.explanation || null,
    confidence: payload.confidence ?? null,
    agreed_by: payload.agreed_by ?? null,
    models_used: JSON.stringify(payload.models_used || []),
  });
}

export function listHistory(userId, { limit = 50, offset = 0 } = {}) {
  const d = open();
  return d.prepare(`
    SELECT id, ts, text, original, replacement, type, explanation,
           confidence, agreed_by, models_used
    FROM history WHERE user_id = ?
    ORDER BY ts DESC LIMIT ? OFFSET ?
  `).all(userId, limit, offset).map((r) => ({
    ...r, models_used: r.models_used ? JSON.parse(r.models_used) : [],
  }));
}

export function userStats(userId) {
  const d = open();
  const totals = d.prepare(`
    SELECT COUNT(*) AS corrections,
           COUNT(DISTINCT date(ts)) AS active_days,
           AVG(confidence) AS avg_confidence
    FROM history WHERE user_id = ?
  `).get(userId);
  const byType = d.prepare(`
    SELECT type, COUNT(*) AS n FROM history
    WHERE user_id = ? AND type IS NOT NULL
    GROUP BY type ORDER BY n DESC
  `).all(userId);
  const recent7 = d.prepare(`
    SELECT date(ts) AS day, COUNT(*) AS n FROM history
    WHERE user_id = ? AND ts >= date('now','-7 days')
    GROUP BY day ORDER BY day
  `).all(userId);
  return { ...totals, by_type: byType, last_7_days: recent7 };
}

export function globalStats() {
  const d = open();
  return d.prepare(`
    SELECT COUNT(*) AS users FROM users
  `).get();
}

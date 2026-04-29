-- Mirror of server/auth.js's SQLite schema. Apply with:
--   npx wrangler d1 execute qrammerly-auth --file=schema.sql

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

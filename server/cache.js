// In-memory LRU cache for /v1/check responses, keyed by sha256(text). Same
// paragraph re-checked within the TTL skips the fan-out entirely → no token
// spend.
//
// We deliberately don't include keys/models in the cache key: the suggestion
// content is what callers care about, and including those would shrink the
// hit rate significantly. The trade-off is that two callers with very
// different model loadouts share the same cached response; for a proofreading
// fan-out that's acceptable.

import crypto from "node:crypto";

const TTL_MS = 60 * 60 * 1000;   // 1 hour
const MAX_ENTRIES = 1000;

const store = new Map(); // hash -> { ts, payload }

export function hashText(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function get(hash) {
  const entry = store.get(hash);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) {
    store.delete(hash);
    return null;
  }
  // Touch to LRU-promote.
  store.delete(hash);
  store.set(hash, entry);
  return entry.payload;
}

export function set(hash, payload) {
  store.set(hash, { ts: Date.now(), payload });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
}

export function size() { return store.size; }

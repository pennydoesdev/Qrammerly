# Qrammerly Worker

Cloudflare Worker that hosts the Qrammerly `/v1/*` API at **qrammerly.com**.

## Bindings

| Binding   | What                                                  |
| --------- | ----------------------------------------------------- |
| `DB`      | D1 database (`qrammerly-auth`) — users, history, stats |
| `CORPUS`  | R2 bucket (`qrammerly-corpus`) — JSON-per-check training corpus |
| `<NAME>_API_KEY` | Per-provider env-fallback keys (set via `wrangler secret put`); BYOK still wins |
| `AUTH_SECRET` | HMAC secret for JWT signing                       |

## Local dev

```bash
npm install
npx wrangler dev
```

Hits a local D1 + R2 simulator. Set provider keys via `.dev.vars`:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AUTH_SECRET=dev-only-please-rotate
```

## Deploy

```bash
npm run deploy           # wrangler deploy
npm run schema           # apply schema.sql to qrammerly-auth D1
```

Routes (in `wrangler.toml`):

- `qrammerly.com/v1/*`
- `www.qrammerly.com/v1/*`

Pages serves the marketing site at `qrammerly.com/` and the Worker captures
the `/v1/*` paths on the same origin.

## Endpoints

Identical to `server/`:

- `GET /v1/health`
- `GET /v1/models`
- `POST /v1/check` — `{ text, keys, models }`
- `POST /v1/applied`
- `POST /v1/tone`
- `POST /v1/goals`
- `POST /v1/stats`
- `POST /v1/auth/signup` / `/v1/auth/login`
- `GET /v1/me` / `GET /v1/history` / `GET /v1/me/stats` / `GET /v1/global/stats`

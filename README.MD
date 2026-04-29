# Qrammarly

A multi-model AI proofreader. **Thirteen** language models inspect your text in
parallel and suggestions are ranked by cross-model consensus.
**Bring-your-own-keys** by default; an optional **Featherless community key**
is available behind a donation. Every accepted correction is appended to a
raw-text corpus ready to fine-tune a future internal model on Hugging Face.

Cross-platform from day one: **Chrome / Edge / Firefox / Safari** extensions, a
**macOS** app with global hotkey + Accessibility/Automation integration into
**Word, Pages, Outlook, Mail**, plus the **Chrome extension covers Gmail and
Google Docs**. The backend is **Dockerised** and load-balanceable, with
**signup/login**, **per-user history**, **stats**, **tone analysis**, and
**goals-aware proofreading**.

## Repo layout

| Path                  | What it is                                                        |
| --------------------- | ----------------------------------------------------------------- |
| `server/`             | Node aggregator, BYOK, auth, history, stats, tone, goals, corpus  |
| `chrome-extension/`   | Chrome MV3 extension                                              |
| `edge-extension/`     | Microsoft Edge (MV3, Chromium-compatible)                         |
| `firefox-extension/`  | Firefox (MV3, Gecko manifest)                                     |
| `safari-extension/`   | Safari Web Extension Resources + Xcode wrapping notes             |
| `mac-app/`            | SwiftUI macOS app w/ ⌥⌘G hotkey, AX/AppleScript text capture     |
| `website/`            | Public-facing landing page + try-widget + dashboard               |
| `infra/`              | nginx load-balancer config                                        |
| `docker-compose.yml`  | 3-replica backend + nginx in front                                |

## Brand

Wordmark: **Montserrat** 800. Palette:

| Token   | Hex       | HSL              |
| ------- | --------- | ---------------- |
| Sun     | `#FFBE0B` | 44, 100, 52      |
| Flame   | `#FB5607` | 19, 97, 51       |
| Magenta | `#FF006E` | 334, 100, 50     |
| Iris    | `#8338EC` | 265, 83, 57      |
| Sky     | `#3A86FF` | 217, 100, 61     |

The logo is a single uppercase **Q** in Montserrat 800/900 over an
Iris→Magenta→Flame gradient.

## Models (13)

| #  | Provider               | Model                              |
| -- | ---------------------- | ---------------------------------- |
| 1  | OpenAI                 | `gpt-4o`                           |
| 2  | Anthropic              | `claude-sonnet-4-6`                |
| 3  | Google                 | `gemini-1.5-pro`                   |
| 4  | Meta (via Together)    | `Llama-3.1-70B-Instruct-Turbo`     |
| 5  | Mistral                | `mistral-large-latest`             |
| 6  | Cohere                 | `command-r-plus`                   |
| 7  | DeepSeek               | `deepseek-chat`                    |
| 8  | Alibaba Qwen           | `qwen-max`                         |
| 9  | xAI                    | `grok-2-latest`                    |
| 10 | Perplexity             | `sonar`                            |
| 11 | Moonshot Kimi          | `moonshot-v1-32k`                  |
| 12 | MiniMax                | `abab6.5s-chat`                    |
| 13 | Featherless (community)| `Meta-Llama-3.1-70B-Instruct`      |

The aggregator runs every adapter concurrently, normalises each suggestion to
a common shape `{start, end, original, replacement, type, explanation}`, then
clusters overlapping spans and ranks them by how many models agree. Missing or
failing providers degrade gracefully.

## Bring your own keys (BYOK) and pick your own models

Keys live on the device. Extension stores them in `chrome.storage.local`; Mac
app stores them in `UserDefaults` (Keychain on the roadmap). Each request
includes a `keys` object the server uses transiently and never persists.
Server `.env` keys remain a fallback when the client doesn't send a value.

Each provider also accepts a per-request **model override**. The client sends
a `models` map alongside `keys`; an empty value falls back to the default.
The server exposes `GET /v1/models` so the UI can populate suggestion
datalists (the popup's *Keys & Models* tab and the Mac app's settings sheet
both render from this endpoint).

```json
{
  "text": "...",
  "keys":   { "openai": "sk-...", "anthropic": "sk-ant-..." },
  "models": { "openai": "gpt-4o-mini", "anthropic": "claude-opus-4-7" }
}
```

## Featherless community key

[Featherless.ai](https://featherless.ai) hosts hundreds of open-weight models
behind one OpenAI-compatible API. Two modes:

1. **Personal** — paste your own Featherless key in settings.
2. **Community** — donate any amount to get the rotating community token.

## Code-aware correction corpus

Every successful `/v1/check` is appended to `corpus/YYYY-MM-DD.jsonl` on the
server. Each row tags the natural language, whether the body is a code block,
and the detected programming language so trainers can filter or weight prose
vs. code:

```json
{
  "ts": "2026-04-29T19:14:02.011Z",
  "lang": "en",
  "code_block": false,
  "programming_language": null,
  "text": "Their going too the store",
  "models_used": ["openai", "anthropic", "..."],
  "corrections": [
    {"original":"Their","replacement":"They're","type":"grammar",
     "explanation":"...","confidence":0.92,"agreed_by":11,
     "applied":true}
  ]
}
```

Roll the daily JSONLs into one HF-friendly file:

```bash
node server/scripts/export-hf.js
huggingface-cli upload <user>/qrammarly-corrections corpus/dataset.jsonl
```

The schema is intentionally flat raw text so a future internal model
(`<user>/qrammarly-internal`) can be fine-tuned via
`datasets.load_dataset("json", data_files="dataset.jsonl")` directly.

## Deploying with Docker

```bash
docker compose up --build
# scale horizontally:
docker compose up --build --scale api=5
```

`docker-compose.yml` runs three Node replicas behind an nginx least-conn load
balancer (`infra/nginx.conf`). Both the corpus and SQLite auth DB live on
named volumes so any replica can read/write.

## Auth, history, stats

Optional. Enabled when `better-sqlite3` is installed (default after
`npm install`).

| Method | Path                | Notes                                         |
| ------ | ------------------- | --------------------------------------------- |
| POST   | `/v1/auth/signup`   | `{ email, password }` → `{ user, token }`    |
| POST   | `/v1/auth/login`    | `{ email, password }` → `{ user, token }`    |
| GET    | `/v1/me`            | requires Bearer token                         |
| GET    | `/v1/history`       | last N accepted corrections                   |
| GET    | `/v1/me/stats`      | per-user totals, by-type, last-7-days series  |
| GET    | `/v1/global/stats`  | total registered users                        |

## Writing features beyond grammar

| Endpoint     | What it does                                                          |
| ------------ | --------------------------------------------------------------------- |
| `/v1/check`  | Multi-model proofreading (grammar, spelling, punctuation, clarity, style) |
| `/v1/tone`   | Detects tone(s) — confident, friendly, formal, urgent, …              |
| `/v1/goals`  | Proofreads against `{ audience, formality, intent, domain }`          |
| `/v1/stats`  | Words, sentences, Flesch reading ease + grade, vocabulary diversity, reading time |

## Mac app: permissions & app compatibility

Required:

- **Accessibility** — read/write focused text in the frontmost app.
- **Automation** — AppleScript fallback for Word, Pages, Outlook, Mail.

Default global hotkey: <kbd>⌥</kbd><kbd>⌘</kbd><kbd>G</kbd>.

| App                       | Mechanism                            |
| ------------------------- | ------------------------------------ |
| Microsoft Word            | AX + Word AppleScript fallback       |
| Apple Pages               | AX + Pages AppleScript fallback      |
| Microsoft Outlook         | AX + Outlook AppleScript fallback    |
| Apple Mail                | AX                                   |
| Gmail / Google Docs / Outlook web | Browser extension preferred  |
| Notes, TextEdit, IDEs, any AX-compliant text view | AX directly |

## Running locally

```bash
# 1. Backend (no Docker)
cd server
cp .env.example .env       # paste any keys you want; missing keys are skipped
npm install
npm start                  # http://localhost:8787

# 2. Browser extensions
#    Chrome:  chrome://extensions → Load unpacked → chrome-extension/
#    Edge:    edge://extensions   → Load unpacked → edge-extension/
#    Firefox: about:debugging     → Load Temporary Add-on → firefox-extension/manifest.json
#    Safari:  see safari-extension/README.md (Xcode wrapper required)

# 3. Mac app
cd mac-app && swift run
# Grant Accessibility (and Automation if using Word/Pages/Outlook).

# 4. Website
python3 -m http.server -d website 8080
```

## API

`POST /v1/check`

```json
{
  "text": "Their going too the store",
  "keys": { "openai": "sk-...", "featherless_community": true }
}
```

Response:

```json
{
  "models_used": ["openai", "anthropic", "..."],
  "suggestions": [
    {
      "start": 0, "end": 5,
      "original": "Their", "replacement": "They're",
      "type": "grammar",
      "explanation": "Possessive 'their' should be the contraction 'they're'.",
      "confidence": 0.92,
      "agreed_by": 11
    }
  ]
}
```

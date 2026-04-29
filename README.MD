# Qrammerly

A multi-model AI grammar checker. Twelve language models inspect each sentence in
parallel and suggestions ranked by cross-model consensus are returned to the
client.

## Repo layout

| Path         | What it is                                            |
| ------------ | ----------------------------------------------------- |
| `server/`    | Node.js aggregator that fans out to 12 AI providers   |
| `extension/` | Chrome MV3 extension: underlines issues in any field  |
| `mac-app/`   | SwiftUI macOS app (menu-bar, minimal CleanShot-style) |

## Models used

Top ten frontier providers plus Kimi (Moonshot) and MiniMax:

1. OpenAI (GPT-4o)
2. Anthropic (Claude Sonnet 4.6)
3. Google (Gemini 1.5 Pro)
4. Meta Llama (via Together)
5. Mistral Large
6. Cohere Command R+
7. DeepSeek Chat
8. Alibaba Qwen
9. xAI Grok
10. Perplexity Sonar
11. Moonshot Kimi
12. MiniMax abab

The aggregator runs every adapter concurrently, normalises each suggestion to a
common shape `{start, end, original, replacement, type, explanation}`, then
clusters overlapping spans and ranks them by how many models agree. Missing or
failing providers degrade gracefully — the response always includes whatever
came back.

## Running

```bash
# 1. Backend
cd server
cp .env.example .env       # paste any keys you want; missing keys are skipped
npm install
npm start                  # http://localhost:8787

# 2. Chrome extension
# Open chrome://extensions, enable Developer mode, "Load unpacked",
# point at the extension/ directory. Pin the icon to the toolbar.

# 3. Mac app
open mac-app/Qrammerly.xcodeproj
# build & run; or `swift run` from mac-app/ if you prefer the CLI
```

## API

`POST /v1/check`

```json
{ "text": "Their going too the store" }
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

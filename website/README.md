# Qrammerly — Website

Static landing page + try-it widget + auth dashboard. No build step.

## Local dev

```bash
# Anything that serves a folder works.
python3 -m http.server -d website 8080
# or:
npx serve website
```

The page hits `http://localhost:8787` for the API in dev, and same-origin in
production. To deploy alongside the API, mount this folder behind nginx in
front of the `api` upstream — there's an example block in `infra/nginx.conf`.

## Pages / sections

- Hero with brand gradient
- Feature grid (consensus, BYOK, paragraph stepping, cache, code-aware corpus, app coverage, tone/goals)
- Try-it widget (`/v1/check`, `/v1/stats`, `/v1/tone`)
- Pricing (Self-host, Hosted soon)
- Auth (signup / login / dashboard with stats and recent corrections)

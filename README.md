# corx

A CORS proxy running on Cloudflare. Stack: **Hono + D1 + R2**.

- **Hono** — routing, CORS, upstream fetch
- **D1** — API keys, rate-limit windows, request logs, host blocklist
- **R2** — GET response cache

## Usage

```js
// Recommended (query-style)
fetch("https://corx.<you>.workers.dev/fetch?url=" + encodeURIComponent("https://api.example.com/data"))
  .then((r) => r.json());

// Path-style also works:
//   GET /proxy/https://api.example.com/data
//   GET /https://api.example.com/data
// Subdomain mode (needs wildcard domain *.your-zone):
//   GET https://api-example-com.your-zone/data
```

Options:

| Param | Effect |
| --- | --- |
| `?ttl=300` | R2 cache TTL in seconds for this GET (max 86400) |
| `?no-cache=1` | Bypass R2 cache |
| `X-Api-Key` / `Authorization: Bearer …` / `?key=…` | API key (when `REQUIRE_API_KEY=true`) |

Responses carry `X-Corx-Cache: HIT/MISS`, `X-Corx-Target`, `X-Corx-Latency-Ms`.
Preflight `OPTIONS` is answered on every route. Upstream `set-cookie` is stripped.

## Media (video / audio)

Yes — with streaming. Small responses (≤ 5 MB `GET` 200s) are buffered for the
R2 cache; everything else streams straight through untouched, so:

- Large files never blow the Worker's memory
- `Range` requests pass through and `206 Partial Content` / `Content-Range` /
  `Accept-Ranges` are preserved, so seeking in `<video>` / `<audio>` works
- Range requests always bypass the cache (a cached full body is never served
  to a seeking player)

One limitation: HLS/DASH playlists (`.m3u8`/`.mpd`) with absolute segment URLs
break out of the proxy — relative URLs (or subdomain mode) work fine.

## Quickstart

```bash
npm install

# 1. Cloudflare resources (once)
npm run db:create        # paste the database_id into wrangler.jsonc
npm run bucket:create

# 2. Local dev
cp .dev.vars.example .dev.vars   # set ADMIN_TOKEN
npm run db:migrate:local
npm run dev

# 3. Deploy
npm run db:migrate
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

## Config (`wrangler.jsonc` → `vars`)

| Var | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `*` | `*` or comma-separated origins allowed to use the proxy |
| `REQUIRE_API_KEY` | `false` | `"true"` to require an API key |
| `CACHE_TTL_SECONDS` | `3600` | Default R2 TTL for GET 200s |
| `TIMEOUT_MS` | `30000` | Upstream timeout |
| `RATE_LIMIT_PER_MIN` | `60` | Per key (or per IP) per minute |
| `MAX_BODY_BYTES` | `10485760` | Max forwarded request body |
| `ADMIN_TOKEN` (secret) | — | Bearer token for `/admin/*`, HMAC key for console sessions |
| `ACCESS_TEAM_DOMAIN` | `""` | Cloudflare Access team domain (enables Access login) |
| `ACCESS_AUD` | `""` | Access application AUD tag |
| `ADMIN_EMAILS` | `""` | Optional comma-separated allowlist for admin access |

## Admin console (SSR + Cloudflare login)

Open `https://<your-host>/console/`. Pure server-rendered pages (no JS build):
Dashboard (24h stats, cache hit rate, top hosts) · API keys (create shown once, revoke) ·
Logs · Host blocklist.

Login is Cloudflare Access (Zero Trust):

1. In Zero Trust, create an Access application in front of your admin host
   (e.g. `admin.corx.com` → this Worker) or the `/console/*` + `/admin/*` paths.
2. Configure the Worker (vars in `wrangler.jsonc`, token via secret):
   - `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
   - `ACCESS_AUD=<application AUD tag>`
   - `ADMIN_EMAILS=you@company.com` (optional allowlist)
   - `npx wrangler secret put ADMIN_TOKEN`
3. Visit `/console/` → Continue with Cloudflare. The Worker verifies the
   Access JWT itself (RS256 against the team JWKS, issuer, audience, expiry).

Local dev (no Access in front): use the token form on `/console/login`
with `ADMIN_TOKEN` from `.dev.vars` — it sets a signed 12h session cookie.
The same identity check guards the `/admin/*` JSON API (Access JWT, session
cookie, or `ADMIN_TOKEN` bearer).

## Admin API

All `/admin/*` need `Authorization: Bearer <ADMIN_TOKEN>`.

```bash
# stats (last 24h) + recent logs
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://corx.<you>.workers.dev/admin/stats
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://corx.<you>.workers.dev/admin/logs?limit=20'

# create a key (raw key shown once!)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"my-app","rateLimitPerMin":120}' \
  https://corx.<you>.workers.dev/admin/keys

# revoke / block hosts
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://corx.<you>.workers.dev/admin/keys/KEY_ID/revoke
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"hostname":"evil.example","reason":"abuse"}' \
  https://corx.<you>.workers.dev/admin/block-host
```

## How it works

```
browser ──► corx (Worker)
              ├─ CORS preflight / origin check
              ├─ SSRF guard (private IPs, metadata, .internal…) + D1 blocklist
              ├─ API key? ──► D1 api_keys
              ├─ rate limit ──► D1 rate_windows (fixed window)
              ├─ GET cache? ──► R2 corx-cache (SHA-256 of URL, TTL metadata)
              ├─ fetch upstream (timeout, size caps, header filtering)
              └─ log ──► D1 request_logs (waitUntil, pruned after 30d by cron)
```

## Project layout

```
wrangler.jsonc          bindings (D1, R2), vars, cron
migrations/0001_init.sql  D1 schema
src/
  index.ts    app wiring + cron pruning
  proxy.ts    main proxy handler
  cors.ts     origin allowlist + preflight middleware
  guard.ts    URL extraction + SSRF protection
  cache.ts    R2 GET cache
  ratelimit.ts  D1 fixed-window rate limit
  auth.ts     API key helpers
  db.ts       request logging
  admin.ts    /admin/* (keys, stats, logs, blocklist)
  access.ts   Cloudflare Access JWT verify + admin identity
  session.ts  signed session cookie for the console
  console/    SSR admin console (/console/): views + routes
  landing.ts  / docs page
test/guard.test.ts
```

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | local Worker (needs `.dev.vars` + local D1) |
| `npm run deploy` | deploy to Cloudflare |
| `npm run check` / `npm test` | typecheck / vitest |
| `npm run tail` | live logs |

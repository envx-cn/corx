# corx

A CORS proxy running on Cloudflare. Stack: **HonoX + D1 + R2**.

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
| `?ttl=300` | R2 cache TTL in seconds for this GET (capped at the global `CACHE_TTL_SECONDS` so anonymous callers can't pin entries for 24h) |
| `?no-cache=1` | Bypass R2 cache |

**Reserved query params** (`ttl`, `no-cache`, `key`, `corx-scheme`, `corx-port`) are
consumed by the proxy and stripped from the target in every mode — don't use
them as real params of the sites you proxy.

Per-key cache policy (console → API keys, or `PATCH /api/keys/:id`): each key
can set its own default TTL (`cacheTtl`, blank = global `CACHE_TTL_SECONDS`,
`0` = never store) and a `noCache` switch that skips the R2 cache entirely for
that key — handy for live data or high-churn scrapers sharing the proxy with
cache-friendly traffic.

**Cache safety:** requests carrying `Authorization` / `Cookie` headers never
read or write the cache (the key is the URL only, so user-specific responses
would leak across callers). Upstream responses marked `Cache-Control:
no-store/private/no-cache` (or varying on `Accept`/`Accept-Language`/… ) are
never stored either.
| `X-Api-Key` / `Authorization: Bearer …` / `?key=…` | API key (when `REQUIRE_API_KEY=true`) |

Responses carry `X-Corx-Cache: HIT/MISS`, `X-Corx-Target`, `X-Corx-Latency-Ms`.
Preflight `OPTIONS` is answered on every route. Upstream `set-cookie` is stripped.

**Encoding:** upstreams are asked for identity (uncompressed) bodies
(`accept-encoding: identity`), and any `Content-Encoding` header is stripped on
streamed responses too — the Workers runtime already decompresses `fetch()`
bodies, so pairing an encoding header with decoded bytes breaks browsers. One
immediate retry (300 ms) is made on transient upstream `fetch` failures; the
shared AbortController still caps the total time at `TIMEOUT_MS`.

**Media (video / audio)**

Yes — with streaming. Small responses (≤ 5 MB `GET` 200s) are buffered for the
R2 cache; everything else streams straight through untouched, so:

- Large files never blow the Worker's memory
- `Range` requests pass through and `206 Partial Content` / `Content-Range` /
  `Accept-Ranges` are preserved, so seeking in `<video>` / `<audio>` works
- Range requests always bypass the cache (a cached full body is never served
  to a seeking player)

One limitation: HLS/DASH playlists (`.m3u8`/`.mpd`) with absolute segment URLs
break out of the proxy — relative URLs (or subdomain mode) work fine.

## Landing page

`/` is a Cloudflare-styled marketing page: full-viewport hero, a **live
"Try it" demo** (a mockup-browser that rotates example URLs every 10 s and
fetches them through the real proxy — type any URL to take over), a feature
grid and a dark footer. The demo is a client island (`app/islands/cors-demo.tsx`)
and needs the `HasIslands` client script, which the landing's own full document
includes. Scroll is plain native scrolling (the page-flip scroller was removed).

The landing (and the 404 page) are **bilingual (English / 中文)**: `/en` and
`/zh` URL prefixes force a language; without a prefix it's resolved from the
`corx_lang` cookie, then the `Accept-Language` header. The nav has a zh / EN
switch. All UI copy lives in `app/lib/i18n/messages.ts` (en + zh dictionaries)
and is looked up through the typed `t()` from `app/lib/i18n/locale.ts`. API
error messages are intentionally **not** translated (developer-facing wire
format).

## Quickstart

```bash
npm install

# 1. Cloudflare resources (once)
npm run db:create        # paste the database_id into wrangler.jsonc
npm run bucket:create

# 2. Local dev (vite + Cloudflare adapter: D1/R2 bindings work locally)
cp .dev.vars.example .dev.vars   # set ADMIN_TOKEN
npm run db:migrate:local
npm run dev              # vite on :5173 (set PORT to change)

# 3. Deploy (always through the vite build — wrangler serves ./dist)
npm run db:migrate
npx wrangler secret put ADMIN_TOKEN
npm run deploy           # = vite build (client + worker) && wrangler deploy
```

Dev notes: `npm run dev:worker` runs the production bundle via
`wrangler dev` (closest to prod). Under `vite` dev, its HMR client script is
appended to proxied HTML pages — dev-only artifact, production is untouched.

## Config (`wrangler.jsonc` → `vars`)

| Var | Default | Meaning |
| --- | --- | --- |
| `ALLOWED_ORIGINS` | `*` | `*` or comma-separated origins allowed to use the **proxy routes only** (console/API never get CORS headers) |
| `REQUIRE_API_KEY` | `false` | `"true"` to require an API key |
| `CACHE_TTL_SECONDS` | `3600` | Default R2 TTL for GET 200s; also caps per-request `?ttl=` |
| `TIMEOUT_MS` | `30000` | Upstream timeout |
| `RATE_LIMIT_PER_MIN` | `60` | Per key (or per IP) per minute — cache hits are free |
| `MAX_BODY_BYTES` | `10485760` | Max forwarded request body |
| `ADMIN_TOKEN` (secret) | — | Bearer token for `/api/*`; legacy HMAC key for console sessions |
| `SESSION_SECRET` (secret) | — | HMAC key for console session cookies (falls back to `ADMIN_TOKEN`) |
| `ACCESS_TEAM_DOMAIN` | `""` | Cloudflare Access team domain (enables Access login) |
| `ACCESS_AUD` | `""` | Access application AUD tag |
| `ADMIN_EMAILS` | `""` | Optional comma-separated allowlist for admin access |

## Admin console (SSR + Cloudflare login)

Open `https://<your-host>/console/`. Server-rendered pages with islands only
where needed (stats tabs):
Dashboard (24h requests, traffic in/out, cache bandwidth saved, Requests per
hour chart, a **Breakdown** selector with vertical bar charts for status /
method / country, top hosts/keys, recent errors) · API keys (create shown once,
revoke, per-key origins/cache policy) · Logs (per-request size) · Host
blocklist · Profile · Billing.

Shell: the sidebar collapses to an icon rail on desktop — hovering a nav item
floats the real menu open without pushing the content, and the pin persists in
localStorage; on mobile there is no rail, only the topbar hamburger, which
opens the full menu as a floating drawer overlay. The topbar holds a language
switch (中文 / EN) and a user menu (Profile / Billing / Log out).

The console is bilingual too: a `?lang=zh|en` query on any console URL sets
the `corx_lang` cookie (remembered for a year) and redirects back without the
query; the topbar switch uses this. Console language resolution is cookie →
`Accept-Language` (no URL prefixes).

Login is Cloudflare Access (Zero Trust):

1. In Zero Trust, create an Access application in front of your admin host
   (e.g. `admin.corx.com` → this Worker) or the `/console/*` + `/api/*` paths.
2. Configure the Worker (vars in `wrangler.jsonc`, token via secret):
   - `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
   - `ACCESS_AUD=<application AUD tag>`
   - `ADMIN_EMAILS=you@company.com` (optional allowlist)
   - `npx wrangler secret put ADMIN_TOKEN`
3. Visit `/console/` → Continue with Cloudflare. The Worker verifies the
   Access JWT itself (RS256 against the team JWKS, issuer, audience, expiry).
   Access login no longer depends on `ADMIN_TOKEN`; if neither `SESSION_SECRET`
   nor `ADMIN_TOKEN` is set, the cookie is skipped and every request is
   authenticated by the Access JWT header directly.

Local dev (no Access in front): use the token form on `/console/login`
with `ADMIN_TOKEN` from `.dev.vars` — it sets a signed 12h session cookie.
The same identity check guards the `/api/*` JSON API (Access JWT, session
cookie, or `ADMIN_TOKEN` bearer).

## Admin API

All `/api/*` need `Authorization: Bearer <ADMIN_TOKEN>`.

```bash
# stats (last 24h) + recent logs
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://corx.<you>.workers.dev/api/stats
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://corx.<you>.workers.dev/api/logs?limit=20'

# create a key (raw key shown once!)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"my-app","rateLimitPerMin":120,"allowedOrigins":"https://app.example"}' \
  https://corx.<you>.workers.dev/api/keys

# per-key CORS origins: override the global ALLOWED_ORIGINS for callers of that key
# ("*", comma-separated origins, or "" to inherit the global). Update anytime:
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"allowedOrigins":"https://app.example, https://admin.example"}' \
  https://corx.<you>.workers.dev/api/keys/KEY_ID
# tip: browsers don't send API keys on OPTIONS preflights — pass the key via
# ?key= if preflights must be evaluated per-key, or keep the global permissive

# revoke / block hosts
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://corx.<you>.workers.dev/api/keys/KEY_ID/revoke
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"hostname":"evil.example","reason":"abuse"}' \
  https://corx.<you>.workers.dev/api/block-host
```

## How it works

```
browser ──► corx (Worker)
              ├─ CORS preflight / origin check (proxy routes only)
              ├─ SSRF guard (private/reserved IPs incl. IPv6 + CGNAT,
              │    DNS-resolved IP check via Cloudflare DoH, D1 blocklist)
              ├─ API key? ──► D1 api_keys
              ├─ GET cache? ──► R2 corx-cache (SHA-256 of URL, TTL metadata;
              │    auth'd requests & no-store/vary responses never cached)
              ├─ rate limit (misses only) ──► D1 rate_windows (fixed window)
              ├─ fetch upstream (timeout, size caps, header filtering)
              └─ log ──► D1 request_logs (waitUntil, pruned after 30d by cron)
```

## Project layout

```
wrangler.jsonc          bindings (D1, R2), vars, cron
migrations/0001_init.sql  D1 schema
app/              HonoX frontend (entry + console UI + API routes)
  server.ts     worker entry: createApp + manual mounts (proxy only).
                File routes register at createApp time, so the manual /*
                proxy catch-all is registered AFTER createApp.
  routes/api/   JSON API as file routes (Hono instances per file, guarded
                by api/_middleware.ts). /admin/* was renamed to /api/*.
  routes/console/   console pages as file routes (_renderer dash shell,
                _middleware login guard, _layout document shell, colocated
                chrome _nav/_sidebar/_topbar, and
                index/keys/logs/blocked/profile/billing/login pages
                via c.render()). The sidebar collapse pin + hover-float
                is a plain inline <script> in _layout (honox islands
                re-render their own DOM, and Chromium :has/label quirks
                make checkbox + script the reliable combo).
                Island hydration is honox-managed: the renderer uses
                <HasIslands/> so the client script loads only on pages
                that import an island.
  routes/index.ts     landing page file route (subdomain-aware)
  components/   shared presentational primitives (badges, chart, lucide,
                table) — console-only chrome lives in routes/console/
                instead (interactive bits in islands/)
  styles/       app.css = Tailwind v4 + daisyUI 5 (imported ?inline into
                <style> by landing + console shell, PostCSS-processed by the
                build; injected with dangerouslySetInnerHTML)
  client.ts     island hydration entry (builds to /static/client.js)
  islands/      interactive components (CopyButton, CorsDemo — landing
                demo, StatsTabs — dashboard Breakdown selector)
  console/      dash-style shell, pages, landing (JSX server components)
  lib/format.ts esc/humanBytes helpers
  proxy/        proxy feature: handler, guard (SSRF), subdomain mode,
                CORS, R2 cache, D1 rate limit
  lib/          shared kernel (no HTTP wiring): types, utils, API-key
                auth, Access identity, sessions, request logging,
                D1 query helpers, formatting
  proxy.ts    main proxy handler
  cors.ts     origin allowlist + preflight middleware
  guard.ts    URL extraction + SSRF protection
  cache.ts    R2 GET cache
  ratelimit.ts  D1 fixed-window rate limit
  auth.ts     API key helpers
  db.ts       request logging
  admin.ts    D1 query helpers (no routes — HTTP lives in app/routes/api/)
  access.ts   Cloudflare Access JWT verify + admin identity
  session.ts  signed session cookie for the console
  console/    SSR admin console (/console/): views + routes
  landing.ts  / docs page
test/guard.test.ts
```

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | vite dev with local D1/R2 (needs `.dev.vars`) |
| `npm run dev:worker` | production bundle via `wrangler dev` |
| `npm run build` | client (islands) + worker bundles into `./dist` |
| `npm run deploy` | build + deploy to Cloudflare |
| `npm run check` / `npm test` | typecheck / vitest |
| `npm run tail` | live logs |

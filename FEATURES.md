# CORX — Feature List

Complete inventory of what the code actually implements, grouped by area.
Derived from the source at the time of writing (`main`, post PR #14); every
area lists the files it lives in. `npm run check` (tsc) and `npm test`
(207 tests / 16 suites) pass for all of it.

See [README.md](./README.md) for usage, config and deployment; this file is the
map, not the manual.

---

## 1. Proxy core

| Feature | Detail |
| --- | --- |
| Routing modes | `?url=` on any proxy route (canonical), `/proxy/<url>`, `/<url>` (bare path), path form of `/fetch/<url>`, and DNS subdomain mode `<encoded-host>.<zone>/…` (`PROXY_ZONE`, auto-detect when blank). Precedence: `?url=` → path → subdomain. |
| Subdomain encoding | `.` → `-`, `-` → `--` (lossless), bare label gets `.com`, reserved labels (`www`, `admin`, `console`, `api`, `health`, `status`) never decode, 63-char DNS cap → 400. |
| Methods | Any method (`/fetch`, `/proxy/*` and the `/*` fallback are `app.all`). `OPTIONS` is answered by the CORS preflight before the handler runs. |
| Control params | `ttl`, `no-cache`, `key`, `corx-scheme`, `corx-port` are consumed by corx and stripped from every target form (targets can never shadow them). |
| Request hygiene | Hop-by-hop + proxy-owned headers stripped (`Host`, `Connection`, `Upgrade`, `TE`, `X-Forwarded-For`, `CF-*`, `Origin`, `Referer`, …); `X-Forwarded-For` + `X-Proxied-By: corx` added; upstream asked for `accept-encoding: identity`. |
| Upstream request | Buffered body (early `Content-Length` check, then a buffered cap; a body that fails to read is a 400 — never forwarded empty), shared `AbortController` bounded by `TIMEOUT_MS`; one 300 ms retry on transient `fetch` failure for GET/HEAD only (idempotent methods). |
| Redirects | `follow` by default; `manual` whenever a key injects headers/rules or declares allowed hosts (a cross-origin redirect must not carry custom secret headers). In-scope hops are re-validated (blocklist + DNS) and re-scoped per rule; a hop outside the allowlist is returned to the caller with an absolute `Location` and never fetched; max 5 hops; `POST`→`GET` on 301/302/303. |
| Response hygiene | `content-encoding`, `content-length`, hop-by-hop and `set-cookie` stripped (lean set on streamed responses so Range/206 survives). |
| Response markers | `X-Corx-Cache: HIT/MISS`, `X-Corx-Target`, `X-Corx-Latency-Ms` on every proxy response. |
| Streaming | Responses > 5 MiB (`CACHE_MAX_BYTES`) or non-cacheable stream straight through; a stream can never OOM the Worker (`app/proxy/cache.ts#readBounded`). |
| Media | Range requests pass through, `206`/`Content-Range`/`Accept-Ranges` preserved, seeking works in `<video>`/`<audio>`; Range always bypasses the cache. |
| Logging | Every request logged to D1 via `waitUntil` (method, pre-injection target, host, status, latency, client IP, country, key, cache flag, bytes both ways, auth via, origin, injected flag); streamed bodies are byte-counted by `countStream` when they finish or the client disconnects. |

Files: `app/proxy/handler.ts`, `app/proxy/subdomain.ts`, `app/proxy/guard.ts`.

## 2. CORS & client access

- Global `ALLOWED_ORIGINS` (`*` default) or a comma list; **per-key override**
  (blank inherits the global).
- Preflight `OPTIONS` → 204 with echoed request method/headers, `Max-Age 86400`;
  normal responses echo the origin and add `Vary: Origin` when not `*`.
- Proxy routes only: `/console/*`, `/api/*` and `/health` never emit ACAO.
- Disallowed origin → 403 JSON (still CORS-readable on malformed proxy paths).
- `withProxyCors` stamps ACAO onto error responses produced by `app.onError`.
- **Keyless access**: a granted `Origin` may call the proxy without a key via
  `keyless_origins`; explicit origins only (blank/`*` rejected), one origin per
  key (second save names the holder), cannot be combined with SSRF opt-outs,
  metered per `origin + IP`, logged as `auth_via=origin`. Documented as quota
  attribution, not authentication.

Files: `app/proxy/cors.ts`, `app/lib/auth.ts`, `app/lib/admin.ts`.

## 3. API keys & per-key policy

- Keys are `corx_<base64url>` (24 random bytes), stored as SHA-256
  (`corx:v1:` prefix) — raw values are shown once at creation and never again.
- Credential forms: `X-Api-Key`, `Authorization: Bearer …`, `?key=…`.
- `REQUIRE_API_KEY=true` rejects anonymous proxy calls with 401.
- Per-key fields: name (required), `rate_limit_per_min`, `allowed_origins`,
  `cache_ttl` (blank = global, `0` = never store), `no_cache`, `ip_check`,
  `dns_check`, `keyless`, and the injection set (below).
- Lifecycle: create, partial update (`PATCH` merges with the stored row;
  blank variable values keep the secret), revoke (kill switch), hard delete
  from the console (type the key name to confirm).
- Read paths never leak secrets: `GET /api/keys` masks variable values to
  names only (`redactKeyRow`); `key_hash` is never selected by the console.

Files: `app/lib/auth.ts`, `app/lib/admin.ts`, `app/routes/api/keys*`,
`app/routes/console/keys.tsx`, `app/islands/key-panel.tsx`.

## 4. SSRF & abuse protection

- URL validation: only `http(s)`, no embedded credentials, hostname syntax
  check, ≤ 8 KB, missing target → 400, blocked host → 403.
- Literal guard (`ip_check`, default on): private/reserved IPv4 incl. CGNAT,
  TEST-NETs, multicast, 0.0.0.0/8; all IPv6 literals; internal suffixes
  (`.internal`, `.local`, …); cloud metadata hosts/addresses
  (169.254.169.254, `metadata.google.internal`, Alibaba 100.100.100.200).
- DNS guard (`dns_check`, default on): DoH A+AAAA lookup, every answer must be
  public (catches `localtest.me`-style names and rebinding-capable names);
  30 s per-isolate cache; fail-open with Cloudflare's network-layer block as
  the real backstop.
- D1 blocklist (`blocked_hosts`, admin-managed): a blocked parent domain also
  covers its subdomains (`evil.example` blocks `api.evil.example`; a bare TLD
  entry never matches); checked on every request, including cache hits, and on
  every manual redirect hop; fail-open on DB errors.
- Rate limit: fixed 1-minute window in D1, per key / per IP / per
  `origin + IP` for keyless; cache hits are free; `X-RateLimit-Limit` +
  `X-RateLimit-Remaining` on miss responses; fail-open.
- Body cap: `MAX_BODY_BYTES` (default 10 MiB) — enforced from `Content-Length`
  before buffering and again on the buffered bytes; an unreadable body is a 400
  rather than a silently-empty forward.

Files: `app/proxy/ip.ts`, `app/proxy/guard.ts`, `app/proxy/dns-check.ts`,
`app/proxy/ratelimit.ts`.

## 5. Caching (R2)

- GET 200s ≤ 5 MiB are buffered and stored in `corx-cache` under
  `corx/v1/<sha256(GET:url)>`; everything else streams and is not stored.
- TTL resolution: `?ttl=` (shortens only, never above `CACHE_TTL_SECONDS`) →
  per-key `cache_ttl` → global default; `0` = never store; ≤ 86400 s.
- Bypass matrix (read and write): non-GET, `no_cache` key, key with header
  rules, `Range`, request `Authorization`/`Cookie`, `?no-cache=1`, request
  `Cache-Control: no-cache`.
- Store policy: honor upstream `Cache-Control` (`no-store`, `private`,
  `no-cache`, `must-revalidate`, `max-age=0`) and skip responses that `Vary`
  on caller-dependent tokens (`accept*`, `cookie`, `authorization`,
  `user-agent`, `host`, `referer`, `x-forwarded-for`, `*`); `set-cookie` and
  credentials never stored. `Vary: Origin` is intentionally cacheable — the
  proxy strips the caller's `Origin` before forwarding, so upstream can never
  vary on it (covered by a test).
- Expiry is lazy on read plus a small list-prune batch from the cron; cache
  read/write errors are non-fatal.
- Injected **param-only** keys share the cache under the effective URL, so
  different injected values never collide; injected-header keys bypass.

Files: `app/proxy/cache.ts`, `app/proxy/handler.ts`.

## 6. Upstream injection (per key)

- **Variables** (`NAME=value`, ≤ 32, names `[A-Za-z_]\w*`, values ≤ 4096,
  write-only) with `${VAR}` substitution and `\${` escapes.
- **Header rules**: `Name: value`, `!Name` (remove), `@hosts` scopes the lines
  below (`@` alone resets to key-level), `#` comments.
- **Query rules**: `name = value`, `!name`.
- Rules always win over client input; removes run before sets; per-rule
  `@hosts` narrows to a subset of the key-level allowlist.
- **Allowed target hosts is mandatory** once anything is injected (confused
  deputy guard): exact, `*.suffix` (label boundary enforced), or explicit `*`
  (≤ 32 patterns). A stored row with rules but no allowlist fails closed
  (treated as no injection).
- Header/param blocklists reject proxy-owned names (`Host`, `Content-Length`,
  `Accept-Encoding`, `CF-*`, reserved query params, …); unknown `${VAR}`
  references are rejected at save time.
- Secret hygiene: `request_logs.target_url` is the pre-injection URL, logs
  carry only the host + `injected` flag, variable values are masked on every
  read path, and the playground preview masks values as `***`.
- Manual redirect handling is force-enabled for injecting keys (see §1).

Files: `app/proxy/inject.ts`, `app/lib/admin.ts`, `app/routes/console/keys.tsx`,
`app/islands/key-panel.tsx`.

## 7. Admin API (JSON)

All `/api/*` accept a Cloudflare Access JWT, the console session cookie, or
`Authorization: Bearer <ADMIN_TOKEN>`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness probe (public): `{ ok, service, time }`. |
| `GET /api/stats` | 24 h totals, status/method/country breakdowns, hourly series, top hosts/keys, recent errors. |
| `GET /api/logs?limit=&hours=` | Request log (limit ≤ 200, window 1–168 h). |
| `POST /api/keys` | Create a key (raw key returned once). |
| `PATCH /api/keys/:id` | Partial update — policy, injection, keyless. |
| `POST /api/keys/:id/revoke` | Kill switch (keeps the row). |
| `GET /api/blocked-hosts` · `POST /api/block-host` · `DELETE /api/block-host/:hostname` | D1 host blocklist management. |

Errors are always `{ "error": … }`, intentionally untranslated; unknown
`/api/*` paths get a JSON 404 instead of the proxy's "Missing target URL".

Files: `app/routes/api/**`, `app/lib/admin.ts`, `app/lib/access.ts`.

## 8. Admin console

- SSR shell with islands only where needed (honox `<HasIslands/>`): sidebar
  (collapsible icon rail on desktop, hover-float menu, pin in `localStorage`),
  mobile hamburger drawer, topbar language switch + user menu, responsive
  tables (columns hide, hosts truncate, horizontal scroll).
- **Overview**: 24 h request/traffic/cache-saved/error cards, requests-per-hour
  chart, Breakdown tabs (status / method / country), top hosts, top keys,
  recent errors.
- **Keys**: create/edit modal panel (native `<dialog>`, state-less island so
  fields never re-render while typing) for every per-key field including
  injection editors; raw key shown once with a copy button; delete behind a
  type-the-name confirmation; revoked badge.
- **Playground**: composes a proxy request (method, route style `/fetch` /
  `/proxy/*` / bare path / simulated subdomain, headers, body, `ttl` /
  `no-cache`, Origin, simulated client IP, anonymous / stored / pasted key)
  and runs it **in-process through the real pipeline** — auth, keyless grants,
  injection, SSRF guards, rate limiting, cache and `request_logs` all apply.
  Inspects status, every header, body (pretty JSON / base64 for binary),
  latency, size, cache HIT/MISS and a masked injection preview. Six presets
  (cache, SSRF block, metadata host, CORS preflight, Range, POST echo) and
  localStorage run history.
- **Logs**: per-request rows with bytes, status, key, cache/auth-via badges,
  and a 1 h–7 d lookback slider that re-filters on release.
- **Blocklist**: inline add, removal behind a confirm dialog; blocking a domain
also covers its subdomains.
- **Profile / Billing**: identity (email, auth method) and a placeholder
  billing page.
- Login/logout: Access button when a JWT is detected, token form for local
  dev; logout confirms.
- Bilingual (en/zh) cookie-based language switching; relative timestamps with
  exact UTC on hover; copy buttons.
- WCAG AA contrast floor (`text-base-content/75`, plus overrides for daisyUI's
  own `/55–60` table-head and `.label-text` defaults), ≥24px form controls in
  the playground/logs filters.
- Errors keep the shell for authenticated console requests; the login page and
  unauthenticated paths get the standalone branded document.

Files: `app/routes/console/**`, `app/islands/**`, `app/components/**`.

## 9. Landing page, errors, branding & i18n

- Branded landing at `/` (plus `/zh`, `/en`): a ~85svh hero with a "One
  prefix" URL snippet, the live "Try it" mockup-browser demo (rotates every
  10 s, type-to-take-over; pauses off-screen, on hidden tabs and for
  reduced-motion users), a **Highlights band** (upstream secret injection,
  keyless browser access, playground introspection — each with a real config
  snippet), a compact nine-item feature list and a dark footer.
- Accessibility: WCAG AA theme tokens (UI red `#E10600` vs. the logo's
  #FD0700, darkened success/warning/info, muted text at `/75`), a visible
  focus ring on the demo URL bar, `aria-live` demo results, `aria-hidden`
  decorative icons, and a `prefers-reduced-motion` block. Mobile section
  navigation, `scroll-margin-top` anchors and `og:`/`description` meta tags.
- Bilingual resolution: URL prefix → `corx_lang` cookie → `Accept-Language`;
  landing, 404 and error pages translated; API errors are not.
- 404 strategy: fallback `/*` decides proxy vs. non-proxy → branded 404 page;
  `/api/*` 404 JSON; `/console/*` redirects to the console root.
- Error handling: `ProxyError`/`HTTPException` statuses preserved; console
  requests with an identity get the shell + error card; everyone else gets a
  self-contained branded document (no session/D1/islands needed); machine
  callers (`/api/*`, `/health`, proxy) get JSON with CORS stamped.
- Logo assets: inlined wordmark with `currentColor` ink + brand-red X
  (light/dark variants), X mark for the collapsed rail, `public/favicon.svg`.
- Tailwind v4 + daisyUI 5 inlined via `?inline` into `<style>`, themes
  `corx` (public) and `corx-dash` (console) built around the brand palette.

Files: `app/routes/index.ts`, `_landing.tsx`, `_not-found.tsx`,
`_error-page.tsx`, `app/components/site.tsx`, `status-page.tsx`,
`app/lib/i18n/**`, `app/styles/app.css`, `app/assets/**`.

## 10. Console authentication

- Cloudflare Access verification done in the Worker: RS256 against the team
  JWKS (10 min cache), `iss`, `aud`, `exp`/`nbf` with 60 s skew, optional
  `ADMIN_EMAILS` allowlist.
- Signed HMAC session cookie (`corx_session`, 12 h, HttpOnly, SameSite=Lax,
  Secure on https) for Access and dev-token logins; `SESSION_SECRET` preferred,
  `ADMIN_TOKEN` legacy fallback; Access-only deployments can skip the cookie
  and re-verify the JWT per request. Access-issued cookies carry their origin
  (`via`) and re-check `ADMIN_EMAILS` on every request, so removing an email
  invalidates its session immediately; legacy cookies without `via` keep
  working as token sessions.
- Dev login: token form on `/console/login`; the same identities guard
  `/api/*`.

Files: `app/lib/access.ts`, `app/lib/session.ts`,
`app/routes/console/_middleware.ts`, `login.tsx`, `logout.tsx`.

## 11. Operations & tooling

- Cron `0 3 * * *`: prune `request_logs` > 30 days, `rate_windows` > 2 h, and
  a 100-object batch of expired R2 entries.
- Observability enabled in `wrangler.jsonc`; `npm run tail` for live logs.
- Scripts: `dev`, `dev:worker`, `build` (client islands + worker),
  `deploy`, `db:create` / `db:migrate` / `db:migrate:local`,
  `bucket:create`, `cf-typegen`, `check` (tsc), `test` (vitest),
  `check:contrast` (WCAG AA guard: theme tokens + a low-opacity text scan).
- 217 tests across 16 suites covering the guard/IP/DNS layers, cache policy,
  injection grammar, key admin + keyless grants, CORS origins, subdomain
  encoding, media/Range, playground, stats bucketing, i18n and the assembled
  app (error pages, JSON wire format, body caps, `/fetch` CORS).
- 7 numbered D1 migrations in `migrations/` (keys → per-key origins/cache →
  log bytes → guard toggles → injection → keyless/audit).

---

## Remaining limitations

Deliberate gaps the code does not cover yet. Everything else the review
flagged has been fixed below.

1. **HLS/DASH playlists** with absolute segment URLs break out of the proxy;
   relative URLs (or subdomain mode) work.
2. **Console forms have no CSRF token.** `SameSite=Lax` on the session cookie
   blocks cross-site POSTs in current browsers; a token would make this
   explicit.
3. **Rate limiting is fixed-window** (D1-backed, fail-open) — simple and
   cross-isolate, but a burst can straddle a window boundary.

## Review follow-ups (fixed)

- **Body reads fail loudly.** A read error is a `400`, never a silently-empty
  forwarded body, and `MAX_BODY_BYTES` is checked from `Content-Length` before
  buffering (`413`).
- **Retries are GET/HEAD only**, so a POST body is never re-sent on a
  transient fetch failure.
- **Bare `/fetch` and `/proxy/*` errors carry CORS headers** so browsers can
  read them.
- **The D1 blocklist covers subdomains** of a blocked parent domain (a bare
  TLD entry never matches).
- **Access-issued sessions re-check `ADMIN_EMAILS`** on every request, so
  removing an email invalidates its cookie within milliseconds; legacy
  cookies without `via` keep working.
- **`Vary: Origin` turned out to be safe** — the proxy strips the caller's
  `Origin` before forwarding, so upstream can never vary on it (the existing
  cache test documents this). No change; the review note was withdrawn.
- **README drift fixed:** stale project-layout list, missing `PROXY_ZONE` row,
  an orphaned table row, `/fetch/<url>` and `/health` undocumented, playground
  presets listed as five (there are six).
- **Landing page highlights** the differentiators the code actually has:
  upstream secret injection, keyless browser access and playground
  introspection (with config snippets), plus streaming, bilingual console and
  self-hosting in the feature grid.

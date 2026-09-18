# CORX — Feature List

Complete inventory of what the code actually implements, grouped by area.
Derived from the source on `main`; every area lists the files it lives in.
`npm run check` (tsc) and `npm test` (vitest) pass for all of it — the same
checks `.github/workflows/verify.yml` runs on every push and pull request.

Counts are deliberately left out of this file's prose: they rot, and the
suite is the source of truth. Where a number is load-bearing (quotas, byte
caps, timeouts) it is named.

See [README.md](./README.md) for usage, config and deployment; this file is the
map, not the manual.

---

## 1. Proxy core

| Feature | Detail |
| --- | --- |
| Routing modes | `?url=` on any proxy route (canonical), `/proxy/<url>`, `/<url>` (bare path), path form of `/fetch/<url>`, and DNS subdomain mode `<encoded-host>.<zone>/…` (`PROXY_ZONE`, auto-detect when blank). Precedence: `?url=` → path → subdomain. |
| Subdomain encoding | `.` → `-`, `-` → `--` (lossless), bare label gets `.com`, reserved labels (`www`, `admin`, `console`, `api`, `health`, `status`) never decode, 63-char DNS cap → 400. |
| Methods | Any method (`/fetch`, `/proxy/*` and the `/*` fallback are `app.all`). `OPTIONS` is answered by the CORS preflight before the handler runs. |
| Control params | `corx-ttl`, `corx-no-cache`, `corx-key`, `corx-callback`, `corx-charset`, `corx-wrap`, `corx-scheme`, `corx-port` are consumed by CORX and never forwarded to a target; an unknown `corx-*` name is a 400 (namespace, not a filter — `app/lib/control.ts`). Everything else belongs to the target: a caller-supplied `?url=` / path target keeps its own `key`/`ttl`/`callback`, and only subdomain mode strips the control names (there the proxy request's query *is* the target's). |
| JSONP | `?corx-callback=fn` wraps an `application/json` response as `fn(<json>);` (`application/javascript`, `nosniff`, 2 MiB cap, body validated with `JSON.parse`). Errors are wrapped too, the name must be a JS identifier path, and the cache is always bypassed (the callback name lives in the body). |
| Body transforms | `corx-charset=<label>` re-decodes a `text/*` / JSON / XML body (any WHATWG `TextDecoder` label, unknown → 400) and re-emits it as UTF-8 with a corrected `content-type`; `corx-wrap=json` wraps the decoded text as `{"contents":"…"}` (`application/json`). Both are read up front, buffer the body (≤ `CACHE_MAX_BYTES`, else 413), refuse non-text content types (400), apply before JSONP wrapping, and are part of the cache key (`transformFingerprint`) so raw and transformed responses never share an entry. |
| Request hygiene | Hop-by-hop + proxy-owned headers stripped (`Host`, `Connection`, `Upgrade`, `TE`, `X-Forwarded-For`, `CF-*`, `Origin`, `Referer`, …); `X-Forwarded-For` + `X-Proxied-By: corx` added; upstream asked for `accept-encoding: identity`. |
| Upstream request | Buffered body (early `Content-Length` check, then a buffered cap; a body that fails to read is a 400 — never forwarded empty), shared `AbortController` bounded by `TIMEOUT_MS`; one 300 ms retry on transient `fetch` failure for GET/HEAD only (idempotent methods). |
| Redirects | `follow` by default; `manual` whenever a key injects headers/rules or declares allowed hosts (a cross-origin redirect must not carry custom secret headers). In-scope hops are re-validated (blocklist + DNS) and re-scoped per rule; a hop outside the allowlist is returned to the caller with an absolute `Location` and never fetched; max 5 hops. Method/body follow the fetch spec: 301/302 rewrite `POST`→`GET`, 303 rewrites every method but `GET`/`HEAD`, both dropping the body. In subdomain mode a `Location` on the target origin is rewritten relative (buffered and streamed paths alike) so the next hop stays inside the proxy. |
| Response hygiene | `content-encoding`, `content-length`, hop-by-hop and `set-cookie` stripped (lean set on streamed responses so Range/206 survives); per-key **response header rules** then set/remove headers for the caller (the embed recipe), before corx's own markers are written. |
| Response markers | `X-Corx-Cache: HIT/MISS`, `X-Corx-Target`, `X-Corx-Latency-Ms` on every proxy response. |
| Streaming | Responses > 5 MiB (`CACHE_MAX_BYTES`) or non-cacheable stream straight through; a stream can never OOM the Worker (`app/proxy/cache.ts#readBounded`). Unbounded streams (`text/event-stream`, `multipart/x-mixed-replace`) are never cacheable whatever their `Cache-Control`, so SSE reaches the caller chunk-by-chunk. |
| LLM APIs | The mainstream chat APIs are `POST` + SSE and work as-is: OpenAI, Azure OpenAI (`api-key`), Anthropic (`POST /v1/messages`), Gemini (`…:streamGenerateContent?alt=sse`), Ollama, and OpenAI-compatible runtimes. `X-Api-Key`/`X-Admin-Token` are stripped from *client* requests (handler.ts `STRIP_REQUEST`), so an upstream credential header such as Anthropic's `x-api-key` or `x-goog-api-key` must come from a key's header rules (`HeaderRules` with a `${VAR}`, see §6) — the browser never holds it. No key means no injection, and the public tier is GET/HEAD-only, so LLM calls require a standard key on a self-hosted instance. WebSocket/realtime APIs (OpenAI Realtime, Gemini Live) are a non-goal: `Upgrade` is hop-by-hop, and WSS is not CORS-gated, so a browser can connect directly. |
| Media | Range requests pass through, `206`/`Content-Range`/`Accept-Ranges` preserved, seeking works in `<video>`/`<audio>`; Range always bypasses the cache. |
| Logging | Every request logged to D1 via `waitUntil` (method, pre-injection target, host, status, latency, client IP, country, key, cache flag, bytes both ways, auth via, origin, injected flag); streamed bodies are byte-counted by `countStream` when they finish or the client disconnects. Configurable per deployment: `LOG_REQUESTS=false` writes no rows at all (nothing else depends on them), `LOG_RETENTION_DAYS` sets the raw window (1–365). |

Files: `app/proxy/handler.ts`, `app/proxy/subdomain.ts`, `app/proxy/guard.ts`, `app/proxy/transform.ts`.

## 2. CORS & client access

- Global `ALLOWED_ORIGINS` (`*` default) or a comma list; **per-key override**
  (blank inherits the global).
- Origin entries are canonicalized on save (`URL.origin`: lowercase host, default
  port dropped) and matched exactly, except a **loopback port wildcard**
  (`http://localhost:*`, `https://localhost:*`, `http://127.0.0.1:*`,
  `http://[::1]:*`) which covers any port on that loopback host (scheme still
  pinned). Host wildcards (`https://*.example.com`), non-loopback port wildcards
  and regexes are rejected with a 400 — a dev server on a random port is the
  real need, and a subdomain wildcard would hand the key to any subdomain of a
  possibly-shared host.
- Preflight `OPTIONS` → 204 with echoed request method/headers, `Max-Age 86400`;
  normal responses echo the origin and add `Vary: Origin` when not `*`.
- Proxy routes only: `/console/*`, `/api/*` and `/health` never emit ACAO.
- Disallowed origin → 403 JSON (still CORS-readable on malformed proxy paths).
- `withProxyCors` stamps ACAO onto error responses produced by `app.onError`.
- **Keyless access**: a granted `Origin` may call the proxy without a key via
  `keyless_origins`; explicit origins only (blank/`*` rejected), one origin per
  key (second save names the holder), cannot be combined with SSRF opt-outs,
  metered per `origin + IP`, logged as `auth_via=origin`. Documented as quota
  attribution, not authentication. A loopback port wildcard is a valid grant
  ("all localhost requests"); lookup queries the exact origin plus its
  `scheme://host:*` pattern in one indexed statement, exact grant first.

Files: `app/proxy/cors.ts`, `app/lib/auth.ts`, `app/lib/admin.ts`.

## 3. API keys & per-key policy

- Keys are `corx_<base64url>` (24 random bytes), stored as SHA-256
  (`corx:v1:` prefix) — raw values are shown once at creation and never again.
- Credential forms: `X-Api-Key`, `Authorization: Bearer …`, `?corx-key=…`.
- `REQUIRE_API_KEY=true` rejects anonymous proxy calls with 401.
- Per-key fields: name (required), `rate_limit_per_min`, `allowed_origins`,
  `cache_ttl` (blank = global, `0` = never store), `no_cache`, `ip_check`,
  `dns_check`, `keyless`, `tier` (`standard` | `public`) with the public
  daily caps `daily_limit_per_origin` / `daily_limit_per_host` /
  `daily_limit_total`, and the injection set (below).
- Public tier is validated at save time: no injection, both SSRF guards must
  stay on, and a daily total cap is required (see §12).
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
  `origin + IP` for keyless, and per IP for public keys (every caller shares
  one public key, so a per-key bucket would glob them together); cache hits are
  free; `X-RateLimit-Limit` + `X-RateLimit-Remaining` on miss responses;
  fail-open.
- Public-tier daily quotas (UTC days) per calling `Origin`, per target host
  and per key, checked *before* the cache so hits consume budget too; over cap
  → `429` + `Retry-After` + `{ scope, limit, resetAt }`; announced via
  `X-Corx-Quota-*` (see §12).
- Credentials never reach upstream: `X-Api-Key` / `X-Admin-Token` are always
  stripped (they belong to this proxy), a key presented as
  `Authorization: Bearer corx_…` is stripped once it has authenticated the
  request (`keySource` in `app/lib/auth.ts`), and for public keys `Cookie` +
  `Authorization` are stripped too. A caller's own `Authorization` still passes
  through when the CORX key came from `X-Api-Key` / `?corx-key=` — the OAuth
  pattern (a `Bearer` header takes precedence over `?corx-key=`, so use
  `X-Api-Key` for the proxy key in that case).
- Body cap: `MAX_BODY_BYTES` (default 10 MiB) — enforced from `Content-Length`
  before buffering and again on the buffered bytes; an unreadable body is a 400
  rather than a silently-empty forward.

Files: `app/proxy/ip.ts`, `app/proxy/guard.ts`, `app/proxy/dns-check.ts`,
`app/proxy/ratelimit.ts`, `app/proxy/quota.ts`.

## 5. Caching (R2)

- GET 200s ≤ 5 MiB are buffered and stored in `corx-cache` under
  `corx/v1/<sha256(GET:url)>`; everything else streams and is not stored.
- TTL resolution: `?corx-ttl=` (shortens only, never above `CACHE_TTL_SECONDS`) →
  per-key `cache_ttl` → global default; `0` = never store; ≤ 86400 s.
- Bypass matrix (read and write): non-GET, `no_cache` key, key with header
  rules, `Range`, request `Authorization`/`Cookie`, `?corx-no-cache=1`, request
  `Cache-Control: no-cache`.
- Store policy: honor upstream `Cache-Control` (`no-store`, `private`,
  `no-cache`, `must-revalidate`, `max-age=0`), never buffer an unbounded stream
  (`text/event-stream`, `multipart/x-mixed-replace` — matched on content type,
  since an SSE endpoint without `Cache-Control` is still SSE), and skip responses that `Vary`
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
  `@hosts` narrows to a subset of the key-level allowlist. A name may repeat
  across **disjoint** scopes — one key can hold a credential per target, the
  same header name included — while overlapping scopes are rejected at parse
  time (`hostScopesOverlap`), so "which rule wins" is never defined by line
  order.
- The worked multi-upstream example is code-coupled: `app/lib/docs.ts`
  (`DOCS_INJECTION_VARS` / `DOCS_INJECTION_RULES` / `DOCS_INJECTION_HOSTS`)
  renders it on `/docs` → **Upstream credentials** and `test/docs.test.ts` feeds
  the same strings to `parseVarsInput`/`parseRulesInput`/`parseHostsInput`, so
  the page cannot document a shape the save path rejects. `llms-full.txt`
  restates the per-target rule for agents.
- **Caller references** (`client: true` + optional `hosts` on a variable): the
  console has a separate **Client-referencable variables** field (`parseClientVarsInput`
  / `clientVarsToText` / `withClientVars`), the array form of `vars` carries the
  two flags for the Admin API, and the handler resolves `${NAME}` per hop
  (`clientVarMap` + `resolveClientRefs`) leaving everything it may not resolve
  literal. `assertVarHostScopes` rejects at save time any rule that could reach
  outside a scoped variable's hosts. A key with client-referencable variables
  bypasses the shared R2 cache (`handler.ts`), and the playground preview masks
  resolved values like any other secret. Resolution order is fixed — references
  first (headers per hop, query once before the cache key), then the rules, so
  rules win — and `/docs` → **Upstream credentials** spells out the two scopes
  and tabulates what a reference becomes in each case (`DOCS_CLIENT_CASES`,
  parsed by `test/docs.test.ts`).
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
- **Encrypted at rest** (`app/lib/crypto.ts`): with `INJECTION_KEK` set, each
  variable value is AES-256-GCM ciphertext (`enc:v1:<b64u(iv‖ct)>`), key derived
  from the secret with HKDF-SHA256. Names/rules/hosts stay readable (the console
  needs them). The request path decrypts at the D1 boundary and **fails closed**
  (drops injection) if a value can't be read; edit paths throw a 400 instead of
  overwriting a secret they can't see; values written before the KEK existed are
  plaintext and re-encrypted on the next save. The KEK is rotatable:
  `npm run kek:rotate` re-wraps every stored value from the old secret to the
  new one in one pass (dry-run first, backup + `--restore`, fail-closed on a
  wrong old KEK) — [README → Rotating `INJECTION_KEK`](./README.md#rotating-injection_kek).
- Manual redirect handling is force-enabled for injecting keys (see §1).
- **Response header rules** ride the same key: `Name: value`, `!Name` and
  `@hosts` scoping, applied to what the caller receives on both the buffered and
  the streamed path, matched by the host of the response's final hop. They are
  the documented embed recipe (`!X-Frame-Options`, `!Content-Security-Policy`).
  Headers corx owns — framing/transfer, `Set-Cookie`, `Access-Control-*`,
  `X-Robots-Tag`, `X-Corx-*`, rate-limit/quota — are rejected at save time, and
  their *resolved* form is part of the cache key (`responseRulesFingerprint`),
  so one key's stripped response can never be served as another key's.

Files: `app/proxy/inject.ts`, `app/lib/admin.ts`, `app/routes/console/keys.tsx`,
`app/islands/key-panel.tsx`.

## 7. Admin API (JSON)

All `/api/*` accept a Cloudflare Access JWT, the console session cookie, or
`Authorization: Bearer <ADMIN_TOKEN>`.

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Liveness probe (public): `{ ok, service, time }`. |
| `GET /api/stats` | 24 h totals, status/method/country breakdowns, hourly series, top hosts/keys, recent errors. |
| `GET /api/stats?days=` | Current vs previous N complete UTC days (1–365): requests, distinct origins, distinct keys and errors per period, their deltas, a daily series, and whether it was read from raw logs or the daily rollup. |
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
- **Overview**: a trend strip (current vs previous 7/28/90 days, led by
  distinct origins and distinct keys rather than request counts, plus a daily
  bar chart split at the period boundary), then 24 h
  request/traffic/cache-saved/error cards, requests-per-hour
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
  Inspects status, every header, latency, size, cache HIT/MISS and a masked
  injection preview across **Preview / Body / Headers / Request** tabs. Preview
  uses the same viewer as the landing demo (`components/response-preview.tsx`):
  JSON tree, sandboxed page preview, image/video/audio/PDF rendered straight
  from the replayable proxy URL (GET/HEAD only), monospace text, or a type +
  size card with *Open raw* — Body stays the raw inspector (pretty JSON, text,
  or a base64 excerpt). Six presets
  (cache, SSRF block, metadata host, CORS preflight, Range, POST echo) and
  localStorage run history.
- **Logs**: per-request rows with bytes, status, key, cache/auth-via badges,
  and a 1 h–7 d lookback slider that re-filters on release.
- **Blocklist**: inline add, removal behind a confirm dialog; blocking a domain
also covers its subdomains.
- **Profile**: identity (email, auth method) and a note that changes to the
  account happen on the upstream identity provider, not in CORX.
- Login/logout: Access button when a JWT is detected, token form for local
  dev; logout confirms.
- Bilingual (en/zh) cookie-based language switching; relative timestamps with
  exact UTC on hover; copy buttons.
- WCAG AA contrast floor (`text-base-content/75`, plus overrides for daisyUI's
  own `/55–60` table-head and `.label-text` defaults), ≥24px form controls in
  the playground/logs filters.
- **Focus treatment** (`app/styles/app.css`): daisyUI 5 rings focused controls
  with 2px of `--input-color` offset 2px *outside* the control, which in this
  palette is a near-black box. Text-entry controls (`.input`, `.textarea`,
  `.select`) drop the ring and keep the darker focused border instead, so a
  select sitting beside a text input looks the same on focus as it does. The
  `.select:open` rule is separate and deliberate — that is the state a *mouse*
  click produces (the popup being open, with `:focus` and `:focus-visible` both
  false), and an unsupported `:open` in a comma-separated selector would
  invalidate the whole rule, taking the input and textarea fixes with it.
  Controls with no border to darken (`.checkbox`, `.radio`, `.toggle`,
  `.range`, `.file-input`) and `.btn` keep a ring — it is their only focus
  affordance — recoloured to the brand red.
- Errors keep the shell for authenticated console requests; the login page and
  unauthenticated paths get the standalone branded document.

Files: `app/routes/console/**`, `app/islands/**`, `app/components/**`.

## 9. Landing page, errors, branding & i18n

- Branded landing at `/` (plus `/zh`, `/en`): two-column hero — copy on the
  left, the animated **X panel** on the right (sticky through the try-it
  screen, desktop only, 10% brand red). Hovering the mark's geometry fires a
  cross-pulse from the pointer's position; a successful proxied request from
  the demo sparks one from the centre. Then the live "Try it" mockup-browser
  demo (10 s in view / 30 s ambient off-screen, type-to-take-over, paused on
  hidden tabs and for reduced motion), a **Highlights band** (upstream secret
  injection, keyless browser access, playground introspection and a
  **console-not-just-an-endpoint** umbrella card — each with a real config
  snippet), a compact nine-item feature list and a dark footer.
- The demo **renders by content type** (`lib/preview.ts` +
  `components/response-preview.tsx`): JSON tree, sandboxed HTML preview,
  image on a checkerboard, streaming `<video>`/`<audio>` behind a play button,
  PDF viewer, monospace text, or a binary card with *Open raw* — under
  Preview / Raw / Headers tabs. Text bodies are read through a 128 KB cap that
  cancels the stream; media bodies are never read (the element points at the
  proxy URL, so a replay hits the R2 cache). Proxied HTML is always
  `<iframe sandbox="">` (never `allow-same-origin`), and documents that refuse
  framing (`X-Frame-Options: DENY`, foreign `frame-ancestors`) are detected from
  the response headers and shown as an explanation card instead of a blank box.
- **Agent entry** (`#agents`): two file cards for `/llms.txt` and
  `/llms-full.txt`, a copy-to-clipboard prompt naming this instance's origin,
  and links to the generated `robots.txt` / `sitemap.xml`. The llms files are
  served by `app/server.ts` and described in README → SEO and GEO; the band is
  the human-facing half, with the `<link rel="alternate" type="text/plain">`
  in `SiteHead` and the footer link as the machine-discoverable halves.
- **Comparison pages** (`/compare/<name>`, with `/en/` and `/zh/` URLs): dated
  comparisons against the hosted proxies CORX gets measured against
  (corsproxy.io, Corsfix, AllOrigins). `app/lib/compare.ts` is the registry — one source
  URL and read-date per competitor claim, plus a `theirs` flag on the rows the
  competitor wins — and the page renders those sources in full, so the table
  can be audited rather than believed. Every `theirs` row also states whether
  the loss is an **accepted** trade-off or **planned** work (rendered as the
  tracking-issue link); when a task lands the row flips, it is not deleted, so
  the trade-off stays visible. Cell prose lives in `compare.*` in both
  dictionaries, keyed by the row/slug unions, so a row without copy fails
  `tsc`. Not in the nav or the hero: the only inbound link is a line under the
  FAQ, and each page sits in the sitemap with its own hreflang cluster.
  `test/compare.test.ts` enforces the honesty invariants.
- **Usage page** (`/docs`, with `/en/` and `/zh/` URLs): the human-readable
  manual for the instance — the four call shapes with copyable examples built
  from the request's own origin, the whole `corx-*` table, the three auth
  tiers and where a key must not go, caching (`X-Corx-Cache`, TTL, what
  bypasses it), limits and the `429` + `Retry-After` contract, a security
  summary linking `/terms` and `#trust`, and a self-hosting pointer. The
  code-coupled half (shapes, parameter table) is data in `app/lib/docs.ts` and
  the page renders it, so it cannot advertise a param the proxy does not
  consume; `test/docs.test.ts` asserts the table equals `CONTROL_PARAMS` and
  that every fact exists in both dictionaries. Linked from the landing nav
  (not the hero), the sitemap (own hreflang cluster) and both llms files, with
  a dated `TechArticle` node in the JSON-LD graph.
- **Snippets** (`/snippets`, with `/en/` and `/zh/` URLs): the code-shaped
  half of the docs — `fetch`, axios and ky examples built from the request's
  own origin, a keyless browser example, the Vite/Next.js env-var rule
  (wrong/right in one block), a server route that holds the key, and platform
  notes for Cloudflare Pages, Vercel and Netlify. Ends with when the public
  tier is enough and what it cannot do. Snippet code lives in
  `app/lib/snippets.ts`; `test/snippets.test.ts` asserts every block is built
  from this deployment's origin, any block with `X-Api-Key` says it is
  server-side, and the public-key CTA only renders when the instance has one.
  Linked from the landing try-it section and `/docs`, in the sitemap with its
  own hreflang cluster.
- **CORS tester** (`/tools/cors-tester`, with `/en/` and `/zh/` URLs): the
  account-free diagnosis tool both competitors mine for traffic. Browser probes
  (plain `fetch`, credentials, forced preflight, opaque `no-cors`) feed a pure
  mapping (`app/lib/cors-check.ts`) that names what is missing — no
  `Access-Control-Allow-Origin`, credential/wildcard mismatch, failed
  preflight, mixed content, unreachable host — then the URL is fetched through
  this instance and rendered with the shared preview, with copyable calls
  (public key inlined when configured). The page is honest that a browser does
  not reveal *why* a fetch was blocked. Linked from the landing try-it line,
  `/docs` and every compare page, in the sitemap with its own hreflang cluster,
  `WebApplication` JSON-LD.
- **Injection demo**: the try-it demo's footer grows a "See a key get
  injected" button that runs one real request through a public demo key to
  `/demo/echo` — an echo endpoint on this Worker (`app/routes/demo/echo.ts`)
  that returns the method, path, query and headers it received. The response
  therefore shows the credential CORX attached on the way out (highlighted in
  the headers tab, and injected into the query too) while the page only ever
  held the demo key. Nothing is special-cased in the proxy: the demo key is an
  ordinary row whose host allowlist is this deployment and whose rules inject a
  fake value (`app/lib/demo.ts`, `scripts/seed-demo-key.mjs`); the button only
  renders when that row exists *and* its allowlist covers the served host, so a
  misconfigured instance hides the demo instead of rendering a button that
  would 403. `/demo/echo` is a machine surface: JSON, `no-store`, `noindex`,
  `Disallow: /demo`, and the compare pages link to the live demo only when the
  instance has one.
- **Trust band** (`#trust`): a two-card, plainly worded statement of the proxy's
  man-in-the-middle reality — the hosted public instance (free, shared,
  best-effort, not for secrets) next to self-hosting (MIT, free tier, the whole
  data path in your own account), the self-host card carrying the primary border
  and a link to the source. The hero carries a callout link to it, and the same
  message is FAQ q7 and the `## Trust model`
  section of `llms-full.txt`, so page, schema and machine file agree.
- Accessibility: WCAG AA theme tokens (UI red `#E10600` vs. the logo's
  #FD0700, darkened success/warning/info, muted text at `/75`), a visible
  focus ring on the demo URL bar, `aria-live` on the status line only (so a
  framed page or player is never announced), labelled JSON-tree toggles, `aria-hidden`
  decorative icons, and a `prefers-reduced-motion` block (the X panel's script
  bails out entirely). Mobile section navigation, `scroll-margin-top` anchors
  and `og:`/`description` meta tags.
- **Geometry:** both themes carry 2px `--radius-*` tokens, so cards, buttons,
  inputs, badges and the icon chips on them share one near-square corner
  (Cloudflare's look) instead of mixing 2px cards with 8px controls. Pill CTAs
  (`rounded-full`) are unaffected: a button shape, not a card corner. The
  console uses the same tokens on purpose — one product, one shape language —
  which is why the handful of explicit `rounded-lg`/`rounded-md` in the console
  chrome were swept to `rounded-xs` too.
- **Footer:** one band, not two — the wordmark, tagline and the copyright +
  instance origin sit in the brand column, and the four reader-facing links
  (terms, `llms.txt`, source, console) each carry a lucide icon so the row
  reads as four destinations rather than four similar words.
- **Mobile nav:** below md the section links, the language switch, GitHub and
  the console CTA collapse into a full-screen `<details>` sheet — no island,
  because this nav also renders on `/terms`, the 404 and the 5xx documents,
  which ship no client script. The summary swaps a hamburger for an X via
  `[open]`. The sheet is `100svh - 4rem` with `overflow-y-auto`, so a short
  landscape viewport scrolls rather than clipping the CTA; the CTA is
  full-width above the rule, with the language/GitHub row under it as fine
  print, and that also leaves the top row as just the logo and the menu button.
  Opening animates from CSS (`[open]`); closing cannot, because `<details>`
  hides its content the instant `open` goes away — the script adds
  `.is-closing` and removes `open` one animation later (its `EXIT_MS` must match
  the CSS duration). Three behaviours the element lacks come from a few lines
  of inline script: body scroll is locked while the sheet is open, a section
  link closes it without animating (the unlock has to happen **before** the
  browser handles the hash navigation — `<details>` queues its `toggle` event
  as a separate task, which is too late and leaves the page unscrollable), and
  an outside tap closes it. The old second row of section chips is gone, so the
  sticky nav is one 64px row at every width and the mobile `scroll-margin-top`
  override went with it.
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

Files: `app/routes/index.ts`, `_landing.tsx`, `_docs.tsx`, `docs.ts`,
`_snippets.tsx`, `snippets.ts`, `_cors-tester.tsx`, `tools/cors-tester.ts`,
`_not-found.tsx`, `_error-page.tsx`, `app/components/site.tsx`, `prose.tsx`,
`status-page.tsx`, `app/lib/docs.ts`, `app/lib/snippets.ts`,
`app/lib/cors-check.ts`, `app/islands/cors-tester.tsx`, `app/lib/i18n/**`,
`app/styles/app.css`, `app/assets/**`.

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
- **CSRF**: every mutating console form (keys, blocklist, logout) carries a
  signed, session-bound token (`app/lib/csrf.ts`, HMAC over the session cookie
  — or the Access email for cookie-less Access sessions), and the playground
  run sends the same value as `X-Corx-Csrf`. The console middleware verifies
  it before the handler and answers `403` on the console error page (JSON for
  the playground call) when it is missing or forged; the login form is exempt
  because there is no session to bind to yet.

Files: `app/lib/access.ts`, `app/lib/session.ts`, `app/lib/csrf.ts`,
`app/routes/console/_middleware.ts`, `login.tsx`, `logout.tsx`.

## 11. Operations & tooling

- Cron `0 3 * * *`: aggregate `request_logs` into `stats_daily` **before** the
  prune (the rollup is the trend's long memory; the raw rows are not), then
  prune `request_logs` past the deployment's `LOG_RETENTION_DAYS` (default 30;
  the rollup window and the stats read path follow the same value),
  `rate_windows` > 2 h,
  `quota_counters` older than yesterday, and a 100-object batch of expired R2
  entries.
- Observability enabled in `wrangler.jsonc`; `npm run tail` for live logs.
- CI: `verify.yml` on every push to `main` and every pull request (typecheck →
  tests → contrast → production build, read-only, no secrets); `deploy.yml` is
  a manual dispatch that calls that same workflow as its `verify` job, then
  applies D1 migrations and deploys. Manual by design, so a merge can never
  reach production on its own.
- Scripts: `dev`, `dev:worker`, `build` (client islands + worker),
  `deploy`, `db:create` / `db:migrate` / `db:migrate:local`,
  `db:seed:public` (local public-tier key so `/` shows the key card),
  `bucket:create`, `cf-typegen`, `check` (tsc), `test` (vitest),
  `check:contrast` (WCAG AA guard: theme tokens + a low-opacity text scan).
- The vitest suite (`test/`) covering the guard/IP/DNS layers, cache policy,
  injection grammar, key admin + keyless grants + public-tier policy, daily
  quotas, CORS origins, subdomain encoding, media/Range, playground, stats
  bucketing, i18n, the terms page and the assembled app (error pages, JSON
  wire format, body caps, `/fetch` CORS, credential stripping).
- 11 numbered D1 migrations in `migrations/` (keys → per-key origins/cache →
  log bytes → guard toggles → injection → keyless/audit → public tier +
  quota counters → daily stats rollup → response header rules → keyless
  origin normalization).

---

## 12. Public tier & terms of use

A hosted instance can publish one **public key** (`vars.PUBLIC_KEY`) so visitors
fetch URLs cross-origin from their own sites without deploying anything. It is
a reduced product, enforced in code rather than by convention:

- `GET`/`HEAD` only; `?corx-ttl=` / `?corx-no-cache=` are rejected (the
  instance owns the cache policy, default `PUBLIC_CACHE_TTL_SECONDS` = 300 s);
  subdomain mode refused; injection impossible to configure; SSRF guards forced on.
- `Cookie` / `Authorization` are stripped from the outgoing request, so the
  public key can never be used to authenticate upstream as the caller.
- Three daily quotas in UTC days — per calling `Origin` (soft: browsers set it,
  scripts can forge it), per target host (keeps the pool from becoming a
  scraper for one upstream) and per key (the real bound) — plus a per-IP minute
  limit. Counters live in `quota_counters` (bucket + period, pruned by the
  cron); the handler checks them **before** the cache, so cache hits consume
  budget and “N requests/day” stays honest.
- `429` carries `Retry-After` (seconds to UTC midnight) and a
  `{ scope, limit, resetAt }` body; every response carries
  `X-Corx-Quota-{Origin,Host,Day}-{Limit,Remaining}`, exposed cross-origin.
- Sizing is a platform-budget decision: a proxied request costs ~6–7 D1 row
  writes (log + indexes, rate window, up to three quota buckets) and the free
  plan allows 100k writes/day, so the total cap ships at 15 000/day. All these
  checks fail open, so exceeding the budget would mean serving unmetered —
  raise the cap only behind Workers Paid, log sampling or edge rate limiting.
- A public key with no `daily_limit_total` (hand-edited DB) is refused with
  `503` instead of being served unmetered.
- Console: the key panel has the tier switch + the three caps; the keys table
  badges public keys; the landing page renders the key with a copy button and
  reads its caps from D1 so the published numbers are the enforced ones.

`/terms` is the public terms document (en/zh, `?lang=` sets the cookie and
redirects): best-effort/no-SLA, prohibited uses, quotas and enforcement, what
is logged and for how long, the shared-R2-cache caveat, no-warranty/liability,
and the abuse contact. The landing page's public-key card links to it right
alongside the copy button (a reminder where it matters, not a gate a `curl`
caller never sees). The page needs no islands, session or D1, and `terms` is a
subdomain `RESERVED_LABELS` entry so `terms.<zone>` never decodes as a target.

Files: `app/proxy/quota.ts`, `app/routes/terms.tsx`, `app/routes/_terms.tsx`,
`app/routes/index.ts` (public key card), `app/routes/_landing.tsx`,
`migrations/0008_public_tier.sql`.

---

## Remaining limitations

Deliberate gaps the code does not cover yet. Everything else the review
flagged has been fixed below.

1. **HLS/DASH playlists** with absolute segment URLs break out of the proxy;
   relative URLs (or subdomain mode) work.
2. **Rate limiting is fixed-window** (D1-backed, fail-open) — simple and
   cross-isolate, but a burst can straddle a window boundary.
3. **Public-tier quotas fail open too.** A D1 write error means the request is
   allowed; the total cap is sized under the write budget so that state should
   not arise from proxied traffic, but it is not a hard guarantee. A public key
   also has no whitelist or exception process — by design.
4. **The landing page reads D1 once per view** when `PUBLIC_KEY` is set (to
   render the enforced caps). Cheap, but it is a real read on a page that is
   otherwise static.

Product **non-goals** are a separate list from the limitations above — not gaps
but deliberate scope decisions with their reasons: image transforms,
scraping/extraction and file conversion; caller-selectable egress regions; an
SLA or support commitment for the hosted instance; HLS/DASH manifest rewriting;
WebSocket/bidirectional streaming (realtime and voice APIs — WSS is not
CORS-gated, so a browser needs no proxy for it);
and control parameters as request headers. They live in README →
[Non-goals](./README.md#non-goals), so a feature request can be answered with a
pointer instead of a debate.

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
- **`X-Api-Key` / `X-Admin-Token` no longer leak upstream.** The proxy used to
  copy every non-stripped client header to the target, so a CORX key ended up
  on whatever host the caller named. Both are now stripped, and public-tier
  requests additionally drop `Cookie` + `Authorization`.
- **`X-RateLimit-*` (and the new quota headers) actually reach the wire.**
  `c.header()` before a handler returns writes to Hono's prepared headers,
  which are discarded when the handler returns a raw `Response` — every proxy
  path does. The handler now stamps pending headers onto the response object,
  so the documented rate-limit headers were silently missing before this fix.
- **Landing page highlights** the differentiators the code actually has:
  upstream secret injection, keyless browser access and playground
  introspection (with config snippets), plus streaming, bilingual console and
  self-hosting in the feature grid.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="app/assets/corx-logo-dark.svg">
    <img src="app/assets/corx-logo.svg" alt="COR X" width="300">
  </picture>
</p>

# CORX

A CORS proxy running on Cloudflare. Stack: **HonoX + D1 + R2**.

CORX is **open source and meant to be self-hosted**: you deploy your own
Worker on your own Cloudflare account, under your own hostname, with your own
keys. The repository deliberately carries no deployment's values — hostnames,
keys and admin addresses are `wrangler secret`s, not config
([`.env.production.template`](./.env.production.template) is the committed
example). A free, public instance exists as a shared, best-effort demo of the
public tier — for public data, demos and prototypes, not for secrets or private
data; nothing in this repository depends on it.

See [FEATURES.md](./FEATURES.md) for the complete, code-mapped feature list,
[CONTRIBUTING.md](./CONTRIBUTING.md) for the dev setup and repo conventions,
and [SECURITY.md](./SECURITY.md) for the threat model and how to report an
issue.

- **Hono** — routing, CORS, upstream fetch
- **D1** — API keys, rate-limit windows, request logs, host blocklist
- **R2** — GET response cache

## Trust model

A CORS proxy is a man in the middle by design: whoever operates it can read,
change and replay every request and response that passes through it. No
configuration makes that untrue, so CORX is built to be forked rather than
trusted.

- **The hosted instance is public.** Free, shared, best-effort and revocable
  without notice. It is meant for public data, demos and prototypes. The public
  tier strips `Cookie`/`Authorization`, serves from a shared cache and logs
  requests for 30 days — that reduces exposure, it is not a guarantee. Do not
  send secrets, credentials or personal data through it.
- **Your own deployment is private.** CORX is one MIT-licensed Cloudflare
  Worker (Hono + D1 + R2) that deploys to your own account on the free tier.
  The whole data path — keys, cache, logs, quotas — then stays inside an account
  you control, and the only operator you are trusting is yourself.

That trade is the product: open source, free, and honest about when not to
trust someone else's instance. The landing page says so in the hero itself,
with a pointer to the dedicated trust section.

## More than a fetch endpoint

Many open-source CORS proxies are one route: deploy, call
`/fetch?url=`, done. CORX ships the product around that route too, so a
self-hosted copy feels like a service rather than a script:

- **A console** (bilingual EN/中文) at `/console/`: a usage dashboard, a
  period-over-period trend that outlives the 30-day logs, request logs showing
  the authorizing key or keyless origin, a host blocklist and a playground
  that runs requests through the real pipeline (auth, SSRF guards, injection,
  cache).
- **Per-key policy**, not one global behaviour: name, allowed origins, rate
  limit, cache TTL / no-cache, keyless grants, SSRF-check opt-outs, upstream
  secret injection (header + query rules) and a public tier with daily quotas
  — all editable in the console without a redeploy.
- **The same Worker**: the console is server-rendered by the same Hono app and
  reads the same D1 it manages — no extra service, no third-party dashboard,
  no seat or bill. Access is Cloudflare Access, a signed session cookie or the
  admin token, and `/api/*` exposes the same operations as JSON for
  automation.

Projects that offer this much are usually commercial; here it is in the
repository, included in the free-tier deployment.

## Usage

```js
// Recommended (query-style)
fetch("https://corx.<you>.workers.dev/fetch?url=" + encodeURIComponent("https://api.example.com/data"))
  .then((r) => r.json());

// Path-style also works:
//   GET /proxy/https://api.example.com/data
//   GET /fetch/https://api.example.com/data
//   GET /https://api.example.com/data
// Subdomain mode (needs wildcard domain *.your-zone):
//   GET https://api-example-com.your-zone/data
```

Options:

| Param | Effect |
| --- | --- |
| `?corx-ttl=300` | R2 cache TTL in seconds for this GET (capped at the global `CACHE_TTL_SECONDS` so anonymous callers can't pin entries for 24h) |
| `?corx-no-cache=1` | Bypass R2 cache |
| `?corx-callback=cb` | JSONP: wrap the JSON body as `cb(<json>);` for a `<script>` tag (see below) |

Pass an API key with `X-Api-Key`, `Authorization: Bearer …`, or `?corx-key=…`
(required when `REQUIRE_API_KEY=true`).

The same facts — the four call shapes, the `corx-*` table, the auth tiers,
caching, limits and the security model — are rendered for humans at `/docs`
(also `/en/docs` and `/zh/docs`), with copyable examples built for the host
you are reading. This README remains the source of truth for deploying your
own copy.

**Control params** — `corx-ttl`, `corx-no-cache`, `corx-key`, `corx-callback`,
`corx-scheme`, `corx-port` — are consumed by the proxy and never reach the
target. `corx-*` is CORX's namespace, so an unknown name (a typo like
`corx-tt1`) is a 400 rather than a param quietly forwarded upstream. Everything
else belongs to the target: a target's own `?key=`, `?ttl=` or `?callback=` is
passed through untouched, and JSONP only happens when `corx-callback` is
present.

Subdomain mode is the one place where the two queries are the same one (the
proxy request's query *is* the target's query), so the `corx-*` names are
stripped back off the target there. A target that genuinely needs a param named
`corx-*` is best addressed with `?url=` / path mode.

Per-key cache policy (console → API keys, or `PATCH /api/keys/:id`): each key
can set its own default TTL (`cacheTtl`, blank = global `CACHE_TTL_SECONDS`,
`0` = never store) and a `noCache` switch that skips the R2 cache entirely for
that key — handy for live data or high-churn scrapers sharing the proxy with
cache-friendly traffic.

Per-key SSRF guards (console → API keys → Edit): the two guards run for every
request by default and can each be turned off for a single key — `ipCheck`
(private/reserved IP literals and internal hostnames) and `dnsCheck` (resolve
the host via DoH and reject names pointing at a non-public IP; the extra
round-trip is what trusted internal keys may want to drop). The D1 blocklist
(a blocked domain also covers its subdomains) and Cloudflare's own private-IP
rules for Workers are never bypassed. Skipping
a guard widens what that key can reach, so both default to on.

**JSONP (`?corx-callback=fn`)**

When a strict CSP blocks `fetch`/XHR, or the page runs in a sandboxed
`null`-origin context, a plain `<script>` tag still works — JSONP is the way
in. Pass `?corx-callback=fn` on a proxy request to a JSON endpoint and CORX
answers with `fn(<json>);` (a leading `/* */` comment, then the call):

```html
<script>
  function cb(data) { console.log(data); }
</script>
<script src="https://corx.example/fetch?url=https://api.example.com/data&corx-callback=cb"></script>
```

- The callback name must be a JS identifier path (`cb`, `window.app.onData`) —
  anything with quotes, brackets or whitespace is rejected at parse time.
- The upstream response must be JSON (`application/json`, `+json`, …); anything
  else is a 400. Errors are wrapped too, so the callback fires with `{ error }`
  instead of dying on a syntax error, and the body is capped at 2 MiB.
- JSONP responses are never cached (the callback name lives in the body), so
  each request hits upstream and is metered/rate-limited like any miss.

**Upstream injection (per key)**

A key can carry variables plus header/query rules that CORX applies when
forwarding — the browser never holds the upstream secret:

| Field | Editor format |
| --- | --- |
| Variables | `NAME=value` per line. Values are **write-only**: the panel shows `NAME=` and a blank value keeps the stored secret. |
| Header rules | `Name: value`, `!Name` removes, `@hosts` scopes the lines below (`@` alone resets), `${VAR}` substitutes, `\${` escapes. |
| Query rules | `name = value`, `!name` removes. |
| Response header rules | Same grammar as header rules, but applied to what the **caller receives** — see [Embed a page that refuses framing](#embed-a-page-that-refuses-framing). |

- Rules always win over client input — a `set` overrides a spoofed header, a
  `remove` drops it — and removes run before sets, so results never depend on
  line order.
- Hop-by-hop and proxy-owned headers (`Host`, `Content-Length`,
  `X-Forwarded-For`, `Accept-Encoding`, `CF-*`, …) and the reserved
  `corx-*` query params (plus their deprecated un-prefixed aliases) are rejected at
  save time, as are unknown `${VAR}` references.
- **Allowed target hosts** is mandatory once anything is injected: the key can
  only reach those hosts (exact, `*.suffix`, or an explicit `*`). This is the
  confused-deputy guard — without it the proxy would attach the secret to any
  URL a caller supplies. Per-rule `@hosts` narrows a rule further
  (multi-upstream keys).
- **Cache:** keys with header rules never read or write the shared R2 cache
  (personalized/credentialed requests, same rule as client-sent
  `Authorization`); param-only keys cache under the injected URL, so different
  secrets never share entries. Response rules *do* cache — their resolved form
  is part of the cache key, so a key that strips `X-Frame-Options` can never be
  served another key's untouched copy.
- **Redirects:** injection switches the upstream fetch to manual redirect
  handling — a cross-origin redirect keeps custom headers (e.g. `X-Api-Key`)
  per the fetch spec, which would leak secrets. In-scope redirects are followed
  with the rules re-applied per hop; a redirect that leaves the allowed hosts
  is returned to the caller with an absolute `Location` and never fetched.
  Methods and bodies follow the fetch spec: 301/302 rewrite `POST` to `GET`,
  303 rewrites every method but `GET`/`HEAD`, both dropping the body. In
  subdomain mode a `Location` on the target origin is rewritten relative — on
  buffered and streamed responses alike — so the caller's next hop stays inside
  the proxy instead of resolving against the proxy host.
- Secrets stay out of logs and errors: `target_url` in `request_logs` is the
  pre-injection URL, `X-Corx-Target` carries only the host, and variable values
  are masked on every read path (`GET /api/keys` returns names only).
- **Encrypted at rest:** with `INJECTION_KEK` set (a `wrangler secret`), variable
  values are stored as AES-256-GCM ciphertext — HKDF derives the key from the
  secret, each value gets its own random IV, and only names are readable in D1.
  Values written before the KEK existed stay plaintext and are re-encrypted on
  the next save. If the KEK is missing or wrong, injection is dropped (the
  request still works, but with no secret attached) and edits are refused rather
  than overwriting secrets that can't be read.

### Embed a page that refuses framing

A proxied HTML document that sends `X-Frame-Options: DENY` (or a CSP
`frame-ancestors` list that excludes you) cannot go into an `<iframe>` — the
browser refuses to render it, which is why the landing demo shows an explanation
card instead of a blank box. On a deployment you control, a key can strip those
responses' headers for a host you allow:

```
# Response header rules, scoped to the host you are embedding
@docs.vendor.com
!X-Frame-Options
!Content-Security-Policy
```

Same grammar as the request-side rules (`@hosts` scopes, `!Name` removes,
`Name: value` sets, `${VAR}` substitutes), applied to the response on the
buffered and streamed paths alike, matched against the host that actually
answered (so a redirect is scoped by its destination). The headers CORX owns —
`Content-Length`, `Set-Cookie`, `Access-Control-*`, `X-Robots-Tag`, `X-Corx-*`
and the rate-limit/quota headers — are rejected at save time.

**The caveat, because it matters:** re-serving someone else's document under
your own origin is an XSS-shaped decision. Stripping `X-Frame-Options` also
removes the target's own clickjacking protection, and the framed page now runs
in a frame *you* control. Sandbox it — `sandbox=""` (no `allow-same-origin`, no
`allow-scripts` unless you have read what the document does), which is exactly
what the CORX landing preview does — and only do this for hosts you trust or
own. The public tier cannot configure this at all (no injection, by policy), so
this is a self-hosting feature.

**Keyless access (per key)**

Turn on `keyless` and browsers from the key's **allowed origins** can call the
proxy without sending the key at all:

- The caller's origin is matched exactly against the origins the key already
  declares — `Origin` when the browser sends one, otherwise the `Referer`'s
  origin (`app/lib/auth.ts` → `callerOrigin`). The fallback matters: browsers
  omit `Origin` on same-origin GETs (the landing page's live demo) and on
  no-cors subresource loads (plain `<img>`/`<script>`, JSONP), which is exactly
  where a key cannot be attached conveniently. Keep an eye on
  `Referrer-Policy: no-referrer` callers — they send neither header, fall
  through to anonymous, and need `?corx-key=` instead.
- Blank and `*` are rejected (keyless needs an explicit list), and an origin
  can be granted to exactly one key — the second save fails naming the holder.
- The SSRF opt-outs (`ipCheck`/`dnsCheck` off) cannot be combined with keyless.
- Keyless requests are rate-limited per `origin + IP` (not per key), and logs
  record `auth_via = origin` plus the matched origin (the console's Logs table
  shows both as **Via** and **Caller**).
- **Honest caveat:** this is quota attribution, not authentication. Browsers
  cannot forge `Origin`/`Referer`, but non-browser clients can — it is exactly
  as strict as shipping the key in a frontend, which is the model CORX targets.
  Anyone who can forge a granted origin can do whatever the key may do
  (including injected variables), so keep the allowed hosts tight.

**Cache safety:** requests carrying `Authorization` / `Cookie` headers never
read or write the cache (the key is the URL only, so user-specific responses
would leak across callers). Upstream responses marked `Cache-Control:
no-store/private/no-cache` (or varying on `Accept`/`Accept-Language`/… ) are
never stored either. `Vary: Origin` is safe to cache here: the proxy strips the
caller's `Origin` before forwarding, so upstream can never vary on it.

Responses carry `X-Corx-Cache: HIT/MISS`, `X-Corx-Target`, `X-Corx-Latency-Ms`.
Preflight `OPTIONS` is answered on every route. Upstream `set-cookie` is stripped.

**Encoding:** upstreams are asked for identity (uncompressed) bodies
(`accept-encoding: identity`), and any `Content-Encoding` header is stripped on
streamed responses too — the Workers runtime already decompresses `fetch()`
bodies, so pairing an encoding header with decoded bytes breaks browsers. One
immediate retry (300 ms) is made on transient upstream `fetch` failures for
GET/HEAD — a re-sent POST body could double-apply side effects upstream. The
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

`/` is a branded marketing page (COR X palette: brand red #FD0700 for the
logo, slate #3E454B ink, paper canvas; near-square 2px corners on cards and
controls, Cloudflare-style, in the console too — one product, one shape
language): a two-column hero (~85svh so the demo
peeks in above the fold) — copy on the left, the animated **X panel** on the
right, where it stays `sticky` through the next screen and only scrolls away
when the Highlights band arrives. The try-it screen's heading, demo and hint
share the same left column (identical 168px left edge at 1440px). Below:
a **live "Try it" demo** (a mockup-browser that rotates example URLs — every
10 s in view, every 30 s as an off-screen ambient tick so the X keeps
generating the odd spark, paused on a hidden tab or for reduced motion; type
any URL to take over; it sends **no key** — the request works anonymously
(`REQUIRE_API_KEY=false`) or through a keyless grant for the page's own origin,
and simply reports the 401 otherwise), a **Highlights** band with real config
snippets (upstream
secret injection, keyless browser access, playground introspection), a compact
nine-item feature list, a **FAQ** band (native `<details>`, so no island is
needed and the answers are plain text in the initial HTML) and a dark footer.
The FAQ is not decoration: it is the content answer engines quote, and the same
strings feed its `FAQPage` JSON-LD (see [SEO and GEO](#seo-and-geo)). The sticky
nav links the section anchors, the **Docs** page (the rendered manual at
`/docs` — the one public link that leaves the landing) and the console.

Below the public-key card sits the **agent entry** (`id="agents"`): two file
cards (`/llms.txt`, `/llms-full.txt`), a copy-to-clipboard prompt that names
*this* instance's origin, and links to the generated `robots.txt` /
`sitemap.xml`. Both llms files already existed for crawlers; the band is where
a **human** finds out they exist. It belongs next to the public-key card — the
two are the same kind of thing, an entry point you can act on without
deploying, one for a frontend and one for an agent — and that placement keeps
the closing sequence (FAQ → CTA) uninterrupted. The band's top padding
collapses when the card renders, so the two read as one cluster instead of two
sections (80px between them against 175px to Highlights). The card is
conditional, so without `PUBLIC_KEY` the band takes the normal section padding
and follows the live demo instead. Its
machine-discoverable halves are a `<link rel="alternate" type="text/plain">` in
`<head>` and an `llms.txt` link in the footer.

### See secret injection work

The try-it demo's footer carries one button that runs the whole product in a
single click: **See a key get injected**. It sends one request through the
public demo key to `/demo/echo` — an echo endpoint on this same Worker — and the
response shows `x-corx-demo-secret` and `?demo_key=` arriving at the upstream
while the page itself only ever held the demo key. That is the difference
between CORX and a pass-through proxy, shown instead of claimed.

Nothing about it is special-cased in the proxy: the demo key is an ordinary key
row whose host allowlist is this deployment and whose header/query rules inject
a deliberately fake value (`app/lib/demo.ts`, `scripts/seed-demo-key.mjs`). The
button only renders when both exist *and* the allowlist covers the host being
served — otherwise the demo would be a button that always 403s, so it hides
itself instead (that is the normal state in local dev: the key was seeded for
the deployed host). The compare pages link to it from the same reasoning.

Seeding it locally:

```bash
# .dev.vars: DEMO_KEY = "corx_dev_demo_key"
npm run db:seed:demo -- --host localhost
```

Deployed instances: create the key in the console instead (host allowlist = the
deployment, same two rules) or run the script against the remote DB, then set
`DEMO_KEY` with `wrangler secret put DEMO_KEY`. The endpoint is a machine
surface, not a page: JSON, `no-store`, `noindex`, `Disallow: /demo`.

The demo renders the response **by content type** instead of dumping every
body into a `<pre>` (`app/lib/preview.ts` classifies, `app/islands/cors-demo.tsx`
drives it, `app/components/response-preview.tsx` renders): JSON becomes a
collapsible tree, `text/html` a sandboxed page preview, `image/*` an image on a
transparency checkerboard, `video/*`/`audio/*` a player streamed through the
proxy (`preload="none"` — nothing loads until you press play), PDFs the
browser's own viewer, text/XML a monospace body, and anything else a type +
size card with an *Open raw* link. **Preview / Raw / Headers** tabs sit under a
status line that keeps showing status, latency, size, cache HIT/MISS and
`content-type`; text bodies are read through a 128 KB cap (`readTextPrefix`
cancels the stream, so a 10 MB page is never buffered), media bodies are never
read at all (the element points at the proxy URL, which is why a repeated image
request shows `X-Corx-Cache: HIT`).

**Sandboxing:** proxied HTML only ever runs inside `<iframe sandbox="">` — no
`allow-same-origin` (the document is served from CORX's origin, so that would
hand upstream scripts our cookies, storage and admin API), no scripts, forms,
popups or top-navigation — plus `referrerpolicy="no-referrer"`. Because the
framed document's address *is* CORX, the target's own `X-Frame-Options:
SAMEORIGIN` / `frame-ancestors 'self'` pass, while `DENY` and foreign
`frame-ancestors` lists still block; those are detected from the response
headers up front (`frameBlock`) and replaced with an explanation card + *Open
raw* instead of a blank box. Relative subresources inside a framed page resolve
against the proxy host (not the target), so they 404 — subdomain mode is the
fix for that, not this preview.

The X panel (`app/components/hero-x.tsx`) is decorative (`aria-hidden`, no
pointer events): a 10% brand-red ghost mark with light that sweeps through its
silhouette. Hovering the mark's own geometry — hit-tested with
`isPointInFill`/`isPointInStroke` through `getScreenCTM`, plus a wide
transparent stroke as a halo — fires one cross-pulse whose streaks start at the
pointer's position along the diagonal and run to the far end. Every successful
proxied request from the demo dispatches `corx:request`, which sparks one from
the centre (alternating halves). Nothing overlays the copy, so clicks and text
selection are untouched, and the whole thing is desktop-only — phones keep a
clean hero. The demo is a client island (`app/islands/cors-demo.tsx`) and needs
the `HasIslands` client script, which the landing's own full document includes.
Scroll is plain native scrolling (the page-flip scroller was removed); anchors
use `scroll-margin-top` so the sticky nav never covers a heading.

**Accessibility:** UI red is `#E10600` rather than the logo's #FD0700, so
white-on-red buttons and small red text clear WCAG AA (the brand mark keeps the
pure red via `--corx-brand-red`); muted copy uses `text-base-content/75` as the
lightest allowed shade, the demo URL bar has a visible `focus-within` ring, and
`prefers-reduced-motion` disables the slide/shimmer animations and starts the
demo paused. The console follows the same floor — including daisyUI's own
table-head and form-label defaults, which sit at ~55–60% and are overridden in
`app/styles/app.css`. `npm run check:contrast` guards the theme tokens *and*
scans `app/` for sub-`/75` text utilities (decorative icons and separators are
exempt).

The landing (and the 404 / error pages) are **bilingual (English / 中文)**: `/en` and
`/zh` URL prefixes force a language; without a prefix it's resolved from the
`corx_lang` cookie, then the `Accept-Language` header.

An explicit choice is **remembered**: the `/en` and `/zh` prefixes, and every
`?lang=…` switch (nav, `/terms`, console), write the cookie — so the pages that
have no URL prefix (`/terms`, `/console/*`) and the console follow the language
you were just reading rather than your browser's `Accept-Language`. Reading the
English landing and clicking *Terms* used to land on a Chinese document whenever
`Accept-Language` said 中文. `/` writes nothing: it is the auto-detecting entry
point, not a choice. `setLangCookie` (`app/lib/i18n/hono.ts`) is the only
writer, so the name and lifetime can't drift from the reader in `locale.ts`, and
the public HTML is `Cache-Control: private` + `Vary: Accept-Language, Cookie`
so no intermediary caches one reader's language.

The nav has a zh / EN switch plus a GitHub link to the source repo (the footer
repeats it as a text link). Below `md` those two, the section links and the
console CTA all move into a full-screen menu sheet — the top row is just the
logo and the menu button, and the CTA is full-width above the sheet's rule.
Opening and closing both animate (a fade and an 8px slide); the close half needs
the script, because `<details>` hides its content the moment `open` goes away.
It is a native `<details>` with a few lines of inline script (scroll lock, close
on link tap or outside tap), not an island, because the same nav renders on
`/terms`, the 404 and the 5xx documents. All UI copy lives in
`app/lib/i18n/messages.ts`
(en + zh dictionaries) and is looked up through the typed `t()` from
`app/lib/i18n/locale.ts`. API error messages are intentionally **not**
translated (developer-facing wire format).

## SEO and GEO

Everything crawler-facing is generated from `app/lib/seo.ts`, over the
origin-independent facts in `app/lib/site-info.ts`, and parameterised by the
request's own origin — a self-hosted copy advertises its own hostname, never
one deployment's URL.

| Surface | What it is |
| --- | --- |
| `robots.txt` | Public pages open, machine surfaces closed (`/console`, `/api`, `/fetch`, `/proxy`, `/health`), absolute `Sitemap:` line. The main answer engines (GPTBot, ClaudeBot, PerplexityBot, …) are named and allowed on purpose: CORX *wants* to be read and cited, and saying so in the file makes a future "block the bots" edit argue with the list. |
| `sitemap.xml` | Every indexable URL with `lastmod`, and an `xhtml:link` hreflang cluster (`en`, `zh`, `x-default`) on each landing URL, each comparison URL and each docs URL. |
| `llms.txt` | The [llmstxt.org](https://llmstxt.org) index: title, blockquote summary, `## Docs` / `## Facts` link sections, `## Optional` tail. |
| `llms-full.txt` | The whole behaviour of the instance in one Markdown fetch — calling shapes, the `corx-*` namespace, auth tiers, caching, limits, security, console + admin API, self-hosting. |

Those four are mounted in `app/server.ts` (before `createApp`, and they give way
to the proxy on a subdomain host, where every path is a proxy path).

`<head>` on the public pages (`app/components/site.tsx` → `SiteHead`) carries a
self-canonical per URL (`/` stays `/` even when it renders 中文 — one URL, one
canonical), the hreflang cluster, an `alternate` link declaring `llms.txt` as
this site's machine-readable representation (the agent entry's discoverable
half — a crawler reading metadata should not have to parse the footer),
`robots: index, follow,
max-image-preview:large, max-snippet:-1`, Open Graph + Twitter tags with the
1200×630 `public/og.png` card (`npm run og` regenerates it), and one JSON-LD
`@graph` (`WebSite`, `Organization`, `SoftwareApplication`, `FAQPage`). The
landing FAQ renders from the same `t()` strings that feed `FAQPage`, so schema
and page cannot drift — `test/seo.test.ts` asserts that per question and answer.

Deliberately out of the index: the 404 / 5xx documents and the console
(`noindex` meta + `Disallow`), and **every proxied response**, which carries
`X-Robots-Tag: noindex` — a `/fetch?url=…` URL, or a mirror of the target,
indexed under our hostname would be pure duplicate-content pollution, and
robots.txt cannot express path-style proxy URLs.

### Comparison pages

`/compare/<name>` answers the *"X vs Y"* search with a table instead of a
slogan: one hosted CORS proxy per page (`corsproxy.io`, `Corsfix`, `AllOrigins`),
the same rows on each (auth model, upstream secrets, self-hosting, caching, request
logging, limits, price, time to first request, extras, availability), and a
"where they win" section that is rendered rather than buried in a footnote.

`app/lib/compare.ts` is the registry and the only place a competitor claim may
live: every claim carries the URL it came from and the day it was read, the
source notes are rendered on the page, and rows the competitor wins are marked
`theirs` — a table the competitor never wins reads as marketing. A `theirs` row
also carries a `status`, rendered as a small label next to the badge:

- **`accepted`** — a deliberate trade-off (a non-goal, a hosted-service
  advantage, a default difference we keep on purpose) and the default;
- **`planned`** — a real gap an open task closes, which must carry the tracking
  issue in `trackedIn` (the label is a link).

When a planned task lands, re-read the source and flip the row instead of
deleting it, so the trade-off stays visible; `test/compare.test.ts` rejects a
`planned` row without an issue URL. The pages are
bilingual with real `/en/` and `/zh/` URLs, so each is in the sitemap with its
own hreflang cluster, and their only inbound link is a line under the landing
FAQ: a long-tail entry point, never the pitch. `test/compare.test.ts` enforces
the invariants (every claim sourced and dated, ≥1 row the competitor wins, each
theirs row labelled and planned work linked, each page linked from the FAQ and
the sitemap).

`CONTENT_UPDATED` in `app/lib/site-info.ts` is the sitemap's `lastmod` and the
terms' own date; bump it whenever the public copy changes.

### Usage page (`/docs`)

`/docs` (plus `/en/docs` and `/zh/docs`) is the human-readable manual: the four
call shapes with copyable examples built from the request's own origin, the
whole `corx-*` table, the three auth tiers and where a key must not go, caching
(`X-Corx-Cache`, TTL, what bypasses it), limits and the `429` + `Retry-After`
contract, a security summary linking `/terms` and `#trust`, and a self-hosting
pointer to this README and CONTRIBUTING.md.

The parts that can drift from the code are data, not prose: `app/lib/docs.ts`
holds the call shapes and the parameter table, and `test/docs.test.ts` asserts
that table equals `CONTROL_PARAMS` (`app/lib/control.ts`), so the page cannot
advertise a parameter the proxy does not consume — or forget one it does. The
page is linked from the landing nav (not the hero), sits in the sitemap with
its own hreflang cluster, is linked from `llms.txt` and `llms-full.txt`, and
emits a dated `TechArticle` in its JSON-LD.

## Public tier (the hosted instance)

The deployed site can hand out a **public key** so anyone can fetch a URL
cross-origin from their own site without deploying anything. It is deliberately
a reduced product:

- **`GET` / `HEAD` only** — no POST/PUT/… relaying.
- **No `?corx-ttl=` / `?corx-no-cache=`** (or their legacy spellings) — the
  instance owns the cache policy (public keys default to
  `PUBLIC_CACHE_TTL_SECONDS`, 300 s).
- **No subdomain mode** — `/fetch?url=` only, which also keeps arbitrary
  third-party content off your wildcard domain.
- **No injection** — variables and header/query rules cannot be configured.
- **SSRF guards cannot be switched off** — `ipCheck`/`dnsCheck` stay on.
- **Credentials are never forwarded** — `Cookie` and `Authorization` are
  stripped from the outgoing request, so a public caller cannot use CORX to
  authenticate as themselves upstream. `X-Api-Key` / `X-Admin-Token` are
  always stripped too: they belong to this proxy, never to the target.
- **Daily quotas** — per calling `Origin`, per target host, and for the key as
  a whole, counted in UTC days, plus the usual per-minute limit (metered per
  IP for a public key, since every caller shares it). Cache hits count as well.

Usage from a third-party site (a query-string key makes it a *simple*
request, so there is no CORS preflight — and browsers don't send API keys on
`OPTIONS` anyway):

```js
const KEY = "corx_pub_…"; // published on the landing page
const r = await fetch(
  `https://corx.example/fetch?url=${encodeURIComponent(url)}&corx-key=${KEY}`,
);
```

Responses carry `X-Corx-Quota-{Origin,Host,Day}-{Limit,Remaining}`; when a cap is
hit the proxy answers `429` with `Retry-After` (seconds to UTC midnight) and a
`{ scope, limit, resetAt }` body. Limits live on the key (console → API keys,
or `PATCH /api/keys/:id`), and the landing page reads them from D1 so the
numbers it advertises are the ones being enforced.

**Sizing — the free plan is the budget.** Cloudflare's free tier gives 100k
Worker requests/day and **100k D1 rows written/day** (indexes count: a
`request_logs` insert costs ~3), plus ~33k R2 Class A and ~333k Class B per
day. A proxied request spends roughly 6–7 D1 writes (log + rate window + up to
three quota buckets), so a public key's *total* cap must stay well under 100k:
all of these checks **fail open**, and if D1 starts rejecting writes the proxy
would keep serving unmetered. The shipped defaults (15 000 total, 3 000 per
origin, 5 000 per host, 60/min per IP) sit inside that budget. Raise them with
Workers Paid ($5/mo lifts D1 to 50M writes and Workers to 10M requests per
month), or by trimming writes (log sampling, edge rate limiting) — not by
simply raising the number.

**Logging is configurable, and the trade is real.** `LOG_REQUESTS=false` stops
the `request_logs` insert at the source (`app/lib/db.ts`), so the proxy keeps
serving but the console's logs list and 24-hour stats go quiet, and the daily
trend only shows days that were logged. `LOG_RETENTION_DAYS` shortens or
lengthens the window the cron keeps (1–365): the rollup, the prune and the
stats read path all follow it, so a 7-day deployment does not report zeros for
days whose rows it deleted. Neither knob changes rate limiting, quotas or the
`X-Corx-*` markers — those are computed per request, not read back from the
log.

**Enabling it:** create a normal key in the console, tick **Public tier**, set
the caps (the total is required), copy the raw value into the `PUBLIC_KEY`
secret (`npx wrangler secret put PUBLIC_KEY`, or `--secrets-file`), and deploy.
It is a secret rather than a config var because the config file is committed —
not because the value is secret: the key is public by design and the landing
page renders it, while D1 still stores only its hash.

**Seeing it locally** takes both halves, which is the easy thing to get wrong:
`PUBLIC_KEY` set (in `.dev.vars` for local dev) **and** a matching row in the
local D1. `npm run db:seed:public` creates the row for whatever key `.dev.vars`
holds (default caps; `--key` / `--origin` / `--host` / `--total` to override),
and a dev-mode warning tells you when `PUBLIC_KEY` is set but resolves to
nothing.

Public-key traffic is logged and metered like any other key, so the console
(Logs, stats, `api_key_id`) is where you watch for abuse; blocking a host or
rotating/revoking the key takes effect immediately.

## Terms of use

`/terms` (en/zh via `?lang=`) is the public terms page: what the shared
instance is (best effort, **no SLA**), prohibited uses, the quotas and how they
are enforced, what is logged and for how long, the shared-cache caveat, the
no-warranty clause and the abuse contact. The landing page's public-key card
links to it right next to the copy button — a reminder at the moment it
matters, rather than a click-through gate a `curl` caller never sees. The page
is self-contained (no islands, no session, no D1), so it renders even when
everything else is broken.

## Quickstart

```bash
npm install

# 1. Cloudflare resources (once)
npm run db:create        # paste the database_id into wrangler.jsonc
npm run bucket:create

# 2. Local dev (vite + Cloudflare adapter: D1/R2 bindings work locally)
cp .dev.vars.example .dev.vars   # set ADMIN_TOKEN (+ INJECTION_KEK to encrypt secrets)
npm run db:migrate:local
npm run db:seed:public           # optional: public-tier key, so / shows the key card
npm run dev              # vite on :5173 (set PORT to change)

# 3. Deploy (always through the vite build — wrangler serves ./dist)
npm run db:migrate
npx wrangler secret put ADMIN_TOKEN
npx wrangler secret put INJECTION_KEK          # optional: encrypt injected secrets at rest
# deployment values — copy the committed example and fill in your own:
#   cp .env.production.template .env.production
#   npx wrangler deploy --secrets-file .env.production      # bootstrap once
npx wrangler secret put PROXY_ZONE             # subdomain mode suffix
npx wrangler secret put PUBLIC_KEY             # optional: public-tier key
npx wrangler secret put ACCESS_TEAM_DOMAIN     # optional: Access login
npx wrangler secret put ACCESS_AUD
npx wrangler secret put ADMIN_EMAILS           # optional: admin allowlist
npm run deploy           # = vite build (client + worker) && wrangler deploy
```

`.env.production` is gitignored; only the value-free template is committed, so
the repository stays free of one deployment's values. The file lists every
deployment secret with what it does, including the ones most people skip
(`SESSION_SECRET`, `INJECTION_KEK`) and why they are worth setting.

Secrets are never touched by `wrangler deploy` (only `wrangler secret delete`
removes them), so they survive every deploy — while plain-text `vars` are
rewritten from `wrangler.jsonc` on each one. That split is why everything that
isn't a random identifier lives in a secret: the repository stays free of
personal data, and the deployed values can't be clobbered by a config edit.

### Continuous integration

`.github/workflows/verify.yml` is the gate: on every push to `main` and every
pull request it runs typecheck → tests → contrast check → production build, on a
read-only checkout with no secrets. Nothing here talks to Cloudflare, so it is
safe (and useful) to run on forks.

`.github/workflows/deploy.yml` is started **by hand** — Actions → Deploy → *Run
workflow* (pick the branch, optionally tick `skip_migrations`) — so nothing
reaches production on its own. Add `push: { branches: [main] }` under `on:` to
make merges deploy automatically. Its `verify` job is `verify.yml` itself
(`uses: ./.github/workflows/verify.yml`), so the deploy gate cannot drift from
the merge gate; after it passes, the run does D1 migrations → `wrangler deploy`
and leaves the worker URL and version id in the run summary. It needs two values
on the organization, both **granted to this repository**:

| Kind | Name | Value |
| --- | --- | --- |
| secret | `CF_WORKER_TOKEN` | API token with Account → **Workers Scripts: Edit**, **Account Settings: Read**, **D1: Edit** (add Zone → **Workers Routes: Edit** + **Zone: Read** once a custom domain or route is attached) |
| variable | `CF_ACCOUNT_ID` | the Cloudflare account id |

Wrangler reads them as `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, which
the workflow sets. **Worker secrets are not passed through CI** — they live on
the Worker and every deploy inherits them, so the token is the only credential
the pipeline needs. Migrations run before each deploy and are idempotent
(wrangler skips the ones the database has already seen); `skip_migrations` ships
code without touching the database.

The trade-off of a manual trigger: nothing forces a deploy after a merge, so
the live version can drift from `main` until you run it — but the code that
reaches `main` has already passed the same checks the deploy would run.

Dev notes: `npm run dev:worker` runs the production bundle via
`wrangler dev` (closest to prod). Under `vite` dev, its HMR client script is
appended to proxied HTML pages — dev-only artifact, production is untouched.

## Config

Non-secret knobs live in `wrangler.jsonc` → `vars`. Rows marked **(secret)**
live in `wrangler secret put` (or `.dev.vars` locally) instead: they describe
this one deployment, so keeping them out of the committed config keeps the
repository free of one deployment's values — and of anything personal. Secrets
survive every deploy (only `wrangler secret delete` removes them), while plain
vars are rewritten from the config file each time.

| Var | Default | Meaning |
| --- | --- | --- |
| `PROXY_ZONE` (secret) | `""` | Suffix for subdomain mode (`example.corx.com` → `example.com`); empty = auto-detect from the request Host |
| `ALLOWED_ORIGINS` | `*` | `*` or comma-separated origins allowed to use the **proxy routes only** (console/API never get CORS headers) |
| `REQUIRE_API_KEY` | `false` | `"true"` to require an API key |
| `CACHE_TTL_SECONDS` | `3600` | Default R2 TTL for GET 200s; also caps per-request `?corx-ttl=` |
| `TIMEOUT_MS` | `30000` | Upstream timeout |
| `RATE_LIMIT_PER_MIN` | `60` | Per key (or per IP) per minute — cache hits are free |
| `MAX_BODY_BYTES` | `10485760` | Max forwarded request body (early Content-Length check, then a buffered cap; an unreadable body is rejected, never forwarded empty) |
| `LOG_REQUESTS` | `true` | `false`/`0`/`off`/`no` writes **nothing** to `request_logs`: no per-request rows, no per-day trend. Rate limiting, quota headers and `X-Corx-*` markers are unaffected. The hosted instance logs (it says so in /terms); a self-hosted deployment may not want to |
| `LOG_RETENTION_DAYS` | `30` | Days of raw `request_logs` kept before the cron prune (1–365; junk falls back to 30). The daily rollup (`stats_daily`) follows the same window, and the console's stats read raw rows only while they exist — a shorter value means the trend comes from the rollup sooner |
| `ADMIN_TOKEN` (secret) | — | Bearer token for `/api/*`; legacy HMAC key for console sessions |
| `SESSION_SECRET` (secret) | — | HMAC key for console session cookies (falls back to `ADMIN_TOKEN`) |
| `INJECTION_KEK` (secret) | — | Encrypts injected variable values at rest (AES-256-GCM via HKDF). Empty = plaintext. Losing it makes stored secrets unreadable |
| `ACCESS_TEAM_DOMAIN` (secret) | `""` | Cloudflare Access team domain (enables Access login) |
| `ACCESS_AUD` (secret) | `""` | Access application AUD tag |
| `ADMIN_EMAILS` (secret) | `""` | Optional comma-separated allowlist for admin access |
| `PUBLIC_KEY` (secret) | `""` | Raw value of the public-tier key, rendered on the landing page (public by design — a secret only to keep deployment values out of the repo; D1 stores only its hash). Empty = no public key advertised |
| `PUBLIC_CACHE_TTL_SECONDS` | `300` | Default R2 TTL for public-tier GETs; public keys reject `corx-ttl` |
| `DEMO_KEY` (secret) | `""` | Raw value of the injection-demo key shown on the landing page. Its host allowlist must cover this deployment (that is also the check that hides the demo), and its rules inject a fake credential into `/demo/echo` — see [See secret injection work](#see-secret-injection-work) |

## Admin console (SSR + Cloudflare login)

Open `https://<your-host>/console/`. Server-rendered pages with islands only
where needed (stats tabs):
Dashboard (a **Trend** strip comparing the current 7/28/90-day period with the
previous one — distinct origins and distinct keys first, because a single
crawler can dominate requests, plus a daily bar chart split at the period
boundary; the window ends yesterday so both periods are complete. Below it,
the 24h requests, traffic in/out, cache bandwidth saved, Requests per
hour chart, a **Breakdown** selector with vertical bar charts for status /
method / country, top hosts/keys, recent errors) · API keys (create and edit
in a modal panel — name, rate limit, per-key origins/cache policy, keyless
access, allowed target hosts and upstream injection (variables + header/query
rules); the raw key is shown once; delete asks you to type the key name) ·
Playground (compose a proxy request — method, route style `/fetch` /
`/proxy/*` / bare path / simulated subdomain, headers, body, `ttl` / `no-cache`,
Origin, simulated client IP, anonymous / stored / pasted key — and inspect the
full response: status, every header, body (pretty JSON, base64 for binary),
latency, size, cache HIT/MISS and an injection preview with secrets masked.
Runs execute in-process through the real pipeline, so auth, SSRF guards, rate
limiting, caching and `request_logs` all apply, while stored keys never expose
their raw value; one-click presets cover cache, SSRF blocks, the metadata
host, CORS preflight, Range and POST echo, and recent runs stay in
localStorage) ·
Logs (per-request size, plus the **Via** — presented key / keyless / anon — and
**Caller** origin that authorized it, with a 1h–7d lookback **Window** slider
that re-filters on release) · Host
blocklist (add inline — blocking a domain also covers its subdomains — remove behind a confirm dialog; logout confirms too) ·
Profile.

Timestamps are rendered relative ("5m ago") with the exact UTC value on hover,
and the console tightens itself on small screens: secondary table columns are
hidden, long hosts truncate, and every page stays inside the viewport (tables
scroll horizontally on their own).

Shell: the sidebar collapses to an icon rail on desktop — hovering a nav item
floats the real menu open without pushing the content, and the pin persists in
localStorage; on mobile there is no rail, only the topbar hamburger, which
opens the full menu as a floating drawer overlay. The topbar holds a language
switch (中文 / EN) and a user menu (Profile / Billing / Log out).

Uncaught errors on browser-facing routes render the same branded style as the
404. An authenticated console request keeps the shell — sidebar, topbar, user
menu — with an error card as the page content; public pages (and console
requests without an identity) get the standalone full-document variant with
the big status digits and a `status · path · UTC time` reference line. That
fallback is self-contained (no session, D1 or island hydration), so it still
renders when the failure is in exactly those layers. Machine callers keep
JSON: `/api/*`, `/health` and every proxy route return `{ "error": … }`.

The console is bilingual too: a `?lang=zh|en` query on any console URL sets
the `corx_lang` cookie (remembered for a year) and redirects back without the
query; the topbar switch uses this. Console language resolution is cookie →
`Accept-Language` (no URL prefixes).

Login is Cloudflare Access (Zero Trust):

1. In Zero Trust, create an Access application in front of your admin host
   (e.g. `admin.corx.com` → this Worker) or the `/console/*` + `/api/*` paths.
2. Configure the Worker:
   - `ACCESS_AUD=<application AUD tag>` → **secret**
     (`npx wrangler secret put ACCESS_AUD`)
   - `ACCESS_TEAM_DOMAIN=https://<team>.cloudflareaccess.com` → **secret**
     (`npx wrangler secret put ACCESS_TEAM_DOMAIN`): it names your login
     endpoint, and keeping it out of the repository also keeps the team name
     (often a personal handle) out of the git history
   - `ADMIN_EMAILS=you@company.com` → **secret** (optional allowlist; PII)
   - `npx wrangler secret put ADMIN_TOKEN`
   - Set the Access pair or neither: a deployment with only one of
     `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` logs `Cloudflare Access login is off`
     and falls back to token login (see `access.ts`).
   - Local dev keeps all three in `.dev.vars` (gitignored).
3. Visit `/console/` → Continue with Cloudflare. The Worker verifies the
   Access JWT itself (RS256 against the team JWKS, issuer, audience, expiry).
   Access login no longer depends on `ADMIN_TOKEN`; if neither `SESSION_SECRET`
   nor `ADMIN_TOKEN` is set, the cookie is skipped and every request is
   authenticated by the Access JWT header directly.

Local dev (no Access in front): use the token form on `/console/login`
with `ADMIN_TOKEN` from `.dev.vars` — it sets a signed 12h session cookie.
The same identity check guards the `/api/*` JSON API (Access JWT, session
cookie, or `ADMIN_TOKEN` bearer).

Logging out clears the `corx_session` cookie, and — when `ACCESS_TEAM_DOMAIN` is
set — also hands the browser to `https://<team>.cloudflareaccess.com/cdn-cgi/access/logout`.
Without that hand-off the Access session would survive the logout and the next
request would be re-authenticated by the still-valid JWT (the user lands back in
the console and it looks like logout did nothing). Our own endpoint can't revoke
an Access session: only the edge can.

## Admin API

All `/api/*` need `Authorization: Bearer <ADMIN_TOKEN>`.

```bash
# stats (last 24h) + recent logs
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://corx.<you>.workers.dev/api/stats
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://corx.<you>.workers.dev/api/logs?limit=20'
# same endpoint, but only the last 24h (1–168 = 7 days):
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://corx.<you>.workers.dev/api/logs?limit=50&hours=24'
# each row carries api_key_id / auth_via (“key” | “origin” | “”) / origin,
# i.e. which credential (if any) authorized the request

# period over period (1–365 complete UTC days): current vs previous, with
# requests / distinct origins / distinct keys / errors and their deltas, a
# daily series, and whether it came from raw logs or the daily rollup. Read
# origins and keys first — request counts are noise. The window ends
# yesterday, so both periods are complete and directly comparable.
curl -H "Authorization: Bearer $ADMIN_TOKEN" 'https://corx.<you>.workers.dev/api/stats?days=28'

# create a key (raw key shown once!; "name" is required)
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"my-app","rateLimitPerMin":120,"allowedOrigins":"https://app.example"}' \
  https://corx.<you>.workers.dev/api/keys

# per-key CORS origins: override the global ALLOWED_ORIGINS for callers of that key
# ("*", comma-separated origins, or "" to inherit the global). Update anytime:
# ipCheck / dnsCheck turn the SSRF guards off for this key (default true):
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"allowedOrigins":"https://app.example","cacheTtl":"300","ipCheck":false}' \
  https://corx.<you>.workers.dev/api/keys/KEY_ID
# tip: browsers don't send API keys on OPTIONS preflights — pass the key via
# ?corx-key= if preflights must be evaluated per-key, or keep the global permissive

# upstream injection + the host allowlist it requires (values are write-only):
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"allowedHosts":"api.vendor.com, *.vendor.com",
       "vars":[{"name":"UPSTREAM_TOKEN","value":"sk-live-…"}],
       "headerRules":"Authorization: Bearer ${UPSTREAM_TOKEN}",
       "paramRules":"api_key = ${UPSTREAM_TOKEN}"}' \
  https://corx.<you>.workers.dev/api/keys/KEY_ID

# keyless access: these origins may call without presenting the key
# (blank/"*" origins are rejected; one key per origin)
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"keyless":true,"allowedOrigins":"https://app.example"}' \
  https://corx.<you>.workers.dev/api/keys/KEY_ID

# public tier: shared, limited, GET/HEAD-only key for the hosted instance.
# dailyLimitTotal is required; injection and SSRF opt-outs are rejected.
curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"tier":"public","dailyLimitPerOrigin":3000,"dailyLimitPerHost":5000,"dailyLimitTotal":15000}' \
  https://corx.<you>.workers.dev/api/keys/KEY_ID
# revoke (kill switch; the console's Delete removes the row for good) / block hosts
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://corx.<you>.workers.dev/api/keys/KEY_ID/revoke
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"hostname":"evil.example","reason":"abuse"}' \
  https://corx.<you>.workers.dev/api/block-host
```

## How it works

```
browser ──► CORX (Worker)
              ├─ CORS preflight / origin check (proxy routes only)
              ├─ identity: presented key → keyless Origin grant → anonymous
              ├─ SSRF guard (private/reserved IPs incl. IPv6 + CGNAT,
              │    DNS-resolved IP check via Cloudflare DoH, D1 blocklist)
              ├─ API key? ──► D1 api_keys
              ├─ host allowlist (per key; mandatory with injection)
              ├─ inject params (effective URL) + headers (rules always win)
              ├─ GET cache? ──► R2 corx-cache (header-rule keys bypass;
              │    auth'd requests & no-store/vary responses never cached)
              ├─ rate limit (misses only) ──► D1 rate_windows (fixed window)
              ├─ fetch upstream (timeout, size caps, header filtering,
              │    manual redirects when the key injects/bounds hosts)
              └─ log ──► D1 request_logs (waitUntil; skipped entirely when
                          LOG_REQUESTS=false; the cron rolls each day
                           into stats_daily before pruning raw rows)
```

## Project layout

```
wrangler.jsonc          bindings (D1, R2), vars, cron
migrations/       numbered D1 migrations (0001…0009)
app/              HonoX frontend (entry + console UI + API routes)
  server.ts     worker entry: createApp + manual mounts (proxy only).
                File routes register at createApp time, so the manual /*
                proxy catch-all is registered AFTER createApp.
  routes/api/   JSON API as file routes (Hono instances per file, guarded
                by api/_middleware.ts). /admin/* was renamed to /api/*.
  routes/console/   console pages as file routes (_renderer dash shell,
                _middleware login guard, _layout document shell, colocated
                chrome _nav/_sidebar/_topbar, and
                index/keys/logs/blocked/profile/login pages
                via c.render()). The sidebar collapse pin + hover-float
                is a plain inline <script> in _layout (honox islands
                re-render their own DOM, and Chromium :has/label quirks
                make checkbox + script the reliable combo).
                Island hydration is honox-managed: the renderer uses
                <HasIslands/> so the client script loads only on pages
                that import an island. Console forms that need a panel
                (API keys) use a state-less island around a native
                <dialog class="modal">: showModal() puts it in the top
                layer from anywhere in the table, and with no state the
                form fields are never re-rendered while typing. A second
                dialog (delete confirmation) is a sibling of the first,
                never a descendant — daisyUI's .modal-box is scaled, which
                would reposition a fixed-position child. The <honox-island>
                wrapper is made display:contents in app.css so an island's
                own root is what participates in layout (flex rows, daisyUI
                menu items). Confirm dialogs (logout, blocklist remove) are
                deliberately NOT islands: routes/console/_confirm.tsx renders
                them server-side and the Doc's inline script wires
                [data-corx-confirm] → showModal() and reparents the dialog to
                <body> (a closed dropdown is display:none), so they keep
                working even when island hydration doesn't.
  routes/index.ts     landing page file route (subdomain-aware)
  routes/terms.tsx    public terms page (+ colocated _terms.tsx markup); its
                own document, no islands/session/D1. "terms" is in the
                subdomain RESERVED_LABELS so terms.<zone> never decodes
                as a proxy target.
  routes/demo/echo.ts the injection demo's echo upstream: returns the
                method, path, query and headers it received, so the
                landing demo can show the credential CORX attached.
  routes/compare/     /compare/<name> comparison pages: [name].tsx plus the
                en/ and zh/ variants call _compare.tsx (page + handler),
                which reads the registry in lib/compare.ts. Not in the nav:
                linked from the landing FAQ and the sitemap only.
  routes/docs.ts      /docs usage page (+ docs under en/ and zh/), all three
                calling _docs.tsx (page + handler), which renders the call
                shapes and corx-* table from lib/docs.ts. Linked from the
                landing nav, the sitemap and the llms files.
  components/   shared presentational primitives (badges, chart, lucide,
                table, logo) plus the response viewers (response-preview,
                json-tree) used by both the landing demo and the playground —
                console-only chrome lives in routes/console/ instead
                (interactive bits in islands/)
  assets/       corx-logo.svg + corx-logo-dark.svg (wordmark, light/dark
                variants — the README header uses the pair via <picture>) and
                corx-mark.svg (the X, for the collapsed sidebar rail). The
                wordmark is inlined via ?raw by components/logo.tsx; app.css
                then paints .corx-ink with currentColor and .corx-x with
                --corx-brand-red, so one file works on light and dark chrome.
                public/favicon.svg is the square X icon and public/og.png
                the 1200×630 social card (Vite copies public/ into dist/,
                which wrangler serves verbatim; scripts/make-og.mjs renders
                the card through headless Chromium). The same
                directory carries one-off root files that must be fetchable
                verbatim — currently the WeChat domain-verification token at
                /ba1a95316b1fc4eb1e373ef870dfc69a.txt (a plain 40-byte text
                file, no trailing newline; Workers Assets answers it before
                the Worker, so no route or handler is involved).
  styles/       app.css = Tailwind v4 + daisyUI 5 (imported ?inline into
                <style> by landing + console shell, PostCSS-processed by the
                build; injected with dangerouslySetInnerHTML). Themes
                data-theme="corx" (public pages) and "corx-dash" (console)
                carry the logo palette: --corx-brand-red/slate/paper plus
                slate-tinted neutrals.
  client.ts     island hydration entry (builds to /static/client.js)
  islands/      interactive components (CopyButton, CorsDemo — landing
                demo, KeyPanel, LogsRange, Playground, StatsTabs)
  proxy/        proxy feature: handler, guard (SSRF), dns-check, ip
                classification, subdomain mode, CORS, R2 cache,
                D1 rate limit, daily quotas (quota), inject
                (variables + rules)
  lib/          shared kernel (no HTTP wiring): types, utils, API-key
                auth, Access identity, sessions, request logging,
                D1 query helpers, admin key/log queries, playground
                spec, response-preview classification (preview),
                formatting, i18n dictionaries, SEO/GEO
                (seo: canonical/hreflang/JSON-LD + robots.txt,
                sitemap.xml, llms.txt, llms-full.txt; site-info: the
                origin-independent facts those all quote; compare: the
                /compare registry — competitor name, source URLs and the
                day each claim was read; docs: the /docs page's code-coupled
                half — call shapes and the corx-* table the test checks
                against control.ts; demo: the injection demo — the
                echo endpoint's path/header names and the "should the
                landing show the button" check)
test/           vitest suites (guard, ip, dns-check, cache, inject,
                admin, origins, subdomain, media, playground, preview,
                stats, i18n, nav, access, quota, public tier, error
                pages, seo, compare, docs, integration)
```

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | vite dev with local D1/R2 (needs `.dev.vars`) |
| `npm run db:seed:public` | seed the local D1 with a public-tier key (`PUBLIC_KEY` from `.dev.vars`), so `/` renders the public-key card |
| `npm run db:seed:demo` | seed the local D1 with the injection-demo key (host allowlist = this deployment), so `/` renders the "See a key get injected" button — `-- --host <host>`, see [See secret injection work](#see-secret-injection-work) |
| `npm run dev:worker` | production bundle via `wrangler dev` |
| `npm run build` | client (islands) + worker bundles into `./dist` |
| `npm run deploy` | build + deploy to Cloudflare |
| `npm run check` / `npm test` | typecheck / vitest |
| `npm run og` | regenerate `public/og.png` (needs a Chromium: `npx playwright install chromium` or `CHROMIUM_PATH`) |
| `npm run check:contrast` | WCAG AA guard: theme tokens in `app/styles/app.css` + a scan for sub-`/75` text utilities in `app/` |
| `npm run tail` | live logs |

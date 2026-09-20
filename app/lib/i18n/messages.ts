/**
 * corx i18n dictionaries (en / zh).
 *
 * Nested objects, looked up by dot-path keys via t() in locale.ts. The `en`
 * dictionary is the source of truth for the key shape: `zh` must mirror it
 * exactly (type-checked by LocaleMessage/MessageKey).
 *
 * API error messages (app/proxy/*, app/lib/*) are intentionally NOT
 * internationalized — they're developer-facing wire formats.
 */

const en = {
  lang: {
    zh: "中文",
    en: "EN",
  },
  site: {
    openConsole: "Open console",
    tryIt: "Try it",
    publicKey: "Public key",
    features: "Features",
    highlights: "Highlights",
    faq: "FAQ",
    docs: "Docs",
    tagline: "CORS proxy, served from the edge",
    console: "Console",
    terms: "Terms",
    github: "GitHub",
    githubAria: "View the CORX source on GitHub",
    menu: "Menu",
    ogAlt: "The CORX wordmark — CORS proxy, served from the edge",
    copyright: "© {year} CORX",
  },
  terms: {
    title: "Terms of use",
    updated: "Last updated {date}",
    lead:
      "This page covers the public CORX instance at {origin}: a free, best-effort service maintained as a personal project. By using the public key or the public pages you agree to these terms. If you do not agree, do not use them.",
    s1Title: "What this service is",
    s1Body:
      "A shared CORS proxy run by a single Cloudflare Worker with a small D1 database and an R2 cache. There is no SLA, no support commitment and no uptime target: the service may be slow, rate-limited, changed, suspended or shut down at any time without notice. Anything you depend on deserves its own deployment.",
    s2Title: "Prohibited uses",
    s2Body:
      "Phishing, malware, ransomware, fraud or deceptive content.\nContent that is illegal wherever it can be reached, including child sexual abuse material.\nSpam, credential stuffing, account takeover or automated abuse of a target site.\nDenial-of-service, stress testing third parties, or anything that degrades a service you do not own.\nScraping or bulk extraction that violates the target's own terms or robots directives.\nBypassing paywalls, DRM, authentication or any access control.\nProbing, scanning or reaching private, internal or reserved network addresses.\nCryptomining, large-scale file mirroring, or using the proxy as storage or a CDN.\nSending credentials or personal data: the public key refuses to forward Cookie and Authorization headers, and working around that is a breach of these terms.",
    s3Title: "Quotas and enforcement",
    s3Body:
      "The public key is limited per calling site, per target host and for the instance as a whole, per UTC day, plus a per-minute limit per IP. Limits return 429 with a Retry-After header, and cached responses count too — the quota is about requests, not upstream load. When limits are hit or abuse is detected we may throttle, rotate or disable the public key, or block hosts, origins and IPs, immediately and without notice. The public instance has no whitelist and no exception process; self-host if you need one.",
    s4Title: "Data and privacy",
    s4Body:
      "We log every request: IP, country, method, target URL, status, latency, caller Origin and which key was used. Logs are kept for 30 days and used for abuse handling and capacity planning.\nSuccessful GET responses are stored in a shared cache and may be served to another user. Never route private, personal or authenticated data through the public instance.\nDo not send secrets, tokens, cookies or personal data. Stripping Cookie and Authorization is a safety net, not permission to send them.\nThe public pages set no cookies beyond remembering your language choice.",
    s5Title: "No warranty, limited liability",
    s5Body:
      'The service is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, availability, accuracy and non-infringement. To the maximum extent permitted by law, the operator is not liable for any direct, indirect, incidental, special or consequential loss — including lost data, profits or business — arising from the use of, or inability to use, this service.',
    s6Title: "Changes",
    s6Body:
      "These terms, the quotas and the feature set may change at any time; the version on this page is the current one, and continued use after a change means you accept it. CORX itself is open source: for guarantees, advanced features and no shared quotas, run your own instance.",
    s7Title: "Report abuse",
    s7BodyA: "Report abuse, illegal content or security issues to",
    s7BodyB: "Include the full request URL when you can.",
    back: "Back to CORX",
  },
  // The /compare/<name> pages. Structure, sources and dates live in
  // app/lib/compare.ts; only prose lives here, and both locales must carry the
  // same keys. This is the one page in the project with a marketing risk, so
  // the rule is: say what a source says, and admit the row we lose.
  compare: {
    table: { topic: "Topic", us: "CORX" },
    theirs: "They win this row",
    status: {
      accepted: "Accepted trade-off",
      planned: "Planned",
      plannedHint: "Tracked in an open issue",
    },
    link: { site: "Website", docs: "Documentation" },
    checked: "Last checked {date}",
    wins: { title: "Where {name} wins" },
    sources: {
      title: "Sources",
      note:
        "Every {name} cell above comes from their own documentation, read on the date shown — follow the links and check them. The CORX column describes this repository (README.md and FEATURES.md) and the same day's code.",
      ours: "CORX's own column:",
    },
    cta: "Both are about a line of code away. Try the public key on the landing page first, and self-host when the traffic matters.",
    ctaLink: "Back to the landing page",
    demo: "See it live: run a real injection from the landing demo.",
    tester: "Test any URL's CORS in your browser",
    back: "Back to home",
    row: {
      auth: "Auth model",
      secrets: "Upstream secrets",
      scoping: "Credential scoping",
      hosting: "Self-hosting",
      caching: "Caching",
      logging: "Request logging",
      limits: "Limits",
      price: "Price",
      setup: "Time to first request",
      extras: "Beyond proxying",
      availability: "Availability",
    },
    us: {
      auth: "Per-key (`X-Api-Key` or Bearer), keyless access for granted origins, or a hosted instance's shared public key. Keys are stored as hashes in your own D1.",
      secrets:
        "Header and query rules live in D1 — AES-256-GCM ciphertext when `INJECTION_KEK` is set — and are applied server-side, only on the hosts the key allows. The browser never receives the value; a variable the key exposes can be referenced by name (`${NAME}`), which is how a caller picks a credential it never holds.",
      scoping:
        "Two levels: a rule carries the hosts it may apply to (`@api.a.com`), and a **variable** carries the hosts it may ever resolve toward — that second scope bounds operator rules and caller references alike, and a rule that could reach outside it is a 400 at save time. A caller can reference only the variables the key exposes, and only toward those hosts; everything else is forwarded literally, so an unexposed name is indistinguishable from a nonexistent one.",
      hosting:
        "MIT, one Cloudflare Worker with D1 and R2, deployed to your own account; the free plan covers small deployments.",
      caching:
        "R2 GET cache, adjusted per request with `corx-ttl` / `corx-no-cache` and capped per key; keys that inject request headers never share it, and a key's resolved response header rules are part of the cache key.",
      logging:
        "Every request lands in your D1 — target, host, status, latency, caller origin, key, IP, country. The raw window is yours to set (30 days by default, `LOG_RETENTION_DAYS`) and logging can be switched off entirely (`LOG_REQUESTS=false`); the daily aggregate keeps the trend.",
      limits:
        "Your own per-key rate limits and daily quotas, or the shared public tier's. Self-hosted, the ceiling is your Cloudflare plan.",
      price: "Free and MIT-licensed. You pay Cloudflare for what the Worker serves; there is no subscription and no seat count.",
      setup:
        "Deploy a Worker to your own account (about ten minutes), or copy a hosted instance's public key and send GET/HEAD inside its daily quota.",
      extras: "Proxying only: fetch, cache, inject, log, response header rules (strip `X-Frame-Options` / CSP for hosts you control), text re-encoding (`corx-charset`) and a JSON envelope (`corx-wrap`), plus a public CORS tester. No image transforms, scraping or file conversion.",
      availability:
        "Self-hosted: as available as your own Cloudflare account. The public instance is best-effort, with no SLA and no support commitment.",
    },
    "corsproxy-io": {
      title: "CORX vs corsproxy.io",
      description:
        "An honest comparison of CORX and corsproxy.io: auth model, upstream secret injection, self-hosting, caching, logging, limits and price — every competitor claim dated and sourced.",
      lead:
        "Both are CORS proxies, and both will unblock a browser request. The difference is what happens to the upstream credential: corsproxy.io is a hosted service you sign up for, CORX is a Worker you deploy whose point is holding an API key the browser never sees.",
      wins:
        "If your browser app has no secret to hide, corsproxy.io is the lower-effort choice: no deployment, a free tier, a support address, an uptime commitment on paid plans and extras like image transforms and a scraping API. When CORX's secret injection is not what you need, their hosted plan is simply less to run.",
      // What each source actually says, shown under its URL. Written as the
      // audit trail, so it stays close to the source's own wording.
      src: {
        auth: "The homepage's own fetch sample carries `?key=YOUR_API_KEY`, and its FAQ answers \"How do I get an API key?\" with creating a free account.",
        secrets:
          "Header overrides are query parameters (`reqHeaders=authorization:Bearer%20TOKEN`), so the value comes from the caller; the homepage FAQ advises against exposing upstream secrets in browser code.",
        scoping:
          "Header overrides travel as request parameters, so what is attached to a target is chosen by the caller on each request — the service holds no rule that binds a credential to a host.",
        hosting: "No repository, source download or self-host path is linked anywhere on the site or in the docs.",
        caching:
          "Default 1-hour TTL for GET/HEAD, `ttl=` overrides require the Production plan, and the cache is per data centre rather than global.",
        logging:
          "Collects the requested URL, user agent, IP, timestamps and request counts plus the account email; states that bodies and headers are not logged.",
        limits:
          "Free: 10,000 requests + 1 GB per month, 1 MB files, browser requests only (no server-side requests, no Production features). Hobby: 250k requests + 25 GB. Production: unlimited requests, 1 GB files.",
        price:
          "Free / Hobby $5 / Production $29 per month, plus a free unlimited plan for open-source and educational projects on request.",
        setup: "The documented path is: create an account, copy the key, prefix the URL. Nothing to deploy, nothing to operate.",
        extras: "Lists image transformations (beta), header rewrites, an advanced cache and a web-scraping API as plan features.",
        availability: "99.9% monthly uptime commitment on Hobby, 99.99% on Production; the free tier is best-effort with no SLA.",
      },
      row: {
        auth: "Account and API key on every call (`?key=…`), the free tier included; domain authorization on paid plans.",
        secrets:
          "No server-side secret store. Header overrides are query parameters (`reqHeaders=authorization:Bearer TOKEN`), so the value comes from the caller — their own FAQ says to keep upstream secrets out of browser code.",
        scoping:
          "Whatever the caller sends, to whichever target it names: there is no server-side credential to scope and no per-target binding to configure.",
        hosting: "Closed source, hosted only: there is no self-host path.",
        caching:
          "Edge cache with a 1-hour default TTL; `ttl=` overrides need the Production plan, and the cache is per data centre rather than global.",
        logging:
          "Their privacy policy lists the requested URL, user agent, IP, timestamps and request counts, plus your account email. Bodies and headers are not logged.",
        limits:
          "Free: 10,000 requests + 1 GB per month, 1 MB files, browser requests only. Hobby $5: 250k requests + 25 GB. Production $29: unlimited* requests, 1 GB files.",
        price: "$0 free tier, $5 Hobby, $29 Production per month — and free unlimited for open-source and educational projects on request.",
        setup: "Create an account, prefix the URL, done: no deployment and no infrastructure to own.",
        extras: "Image transformations (beta), a web-scraping API, header rewrites and file conversion on the paid plans.",
        availability:
          "99.9% monthly uptime commitment on Hobby, 99.99% on Production; the free tier is best-effort with no SLA.",
      },
    },
    corsfix: {
      title: "CORX vs Corsfix",
      description:
        "An honest comparison of CORX and Corsfix: both inject upstream secrets server-side and both are open source — the differences are ownership, logging, limits and price, with every competitor claim dated and sourced.",
      lead:
        "Corsfix is the fair fight: like CORX it keeps upstream API keys out of the browser with server-side secret variables, and like CORX it is open source with a self-hosting path. Both also let a caller reference a stored secret — `{{SECRET_NAME}}` there, `${NAME}` here — so the difference is the bound: their application-wide target list, versus a per-variable host scope that constrains the operator's own rules too. What else differs is where everything lives — their dashboard and servers, or your own Cloudflare account — and what each one defaults to.",
      wins:
        "Corsfix wins where a managed product should: it logs no request URLs, headers or bodies at all (CORX logs to your own D1 by default — with a configurable window, including off), it publishes an availability figure with paid support behind it, and localhost needs no account whatsoever. Pick CORX when the secrets, the cache and the log rows should sit in your own account, and when paying Cloudflare suits you better than a subscription.",
      src: {
        auth: "Production traffic is authorised by adding your website's domain in the dashboard; `x-corsfix-key` is documented as a fallback, and localhost needs no registration.",
        secrets:
          "`{{SECRET_NAME}}` variables can be used in query parameters and request headers; secrets are encrypted at rest and decrypted in memory only when a request uses them.",
        scoping:
          "Two settings per application: Origin Domains (which sites may use the proxy) and Target Domains (which domains may be fetched), the latter defaulting to *All domains*; both use exact matching, and \"Corsfix validates requests based on the Origin header and target domain.\"",
        hosting:
          "`git clone github.com/corsfix/corsfix`, Docker Compose with MongoDB and Redis, your own VPS — the docs cover logs, updates and domain configuration.",
        caching:
          "The `x-corsfix-cache` request header takes `10s`/`10m`/`2h`/`1d` (invalid values default to one hour, capped at one day); GET only, and cached responses do not count against plan throughput.",
        logging:
          "\"We do not log or store access logs (no URL, headers, or body)\" — only aggregate performance metrics; error diagnostics are purged after 30 days, and WAF logs (source IP, user agent, path) exist only for requests that breach a rule, purged in under 72 hours.",
        limits:
          "Throughput is 60/120/180 RPM per IP on Hobby/Growth/Scale with 25/100/500 GB monthly outbound transfer; the requests themselves are unlimited. Free tier: localhost at 60 RPM, production trial 1 GB + 3 web apps.",
        price:
          "$5 Hobby, $9 Growth and $19 Scale per month, or $29/year for the text-only Lite proxy at lite.corsfix.com; prices exclude VAT.",
        setup:
          "Local development takes no account, no key and one URL prefix; production takes adding the domain in the dashboard and a plan sized for the traffic.",
        extras:
          "JSONP, request/response header overrides and every file type; also region selection, a CORS tester and platform integration guides.",
        availability:
          "The homepage claims \">99.9% availability, based on live data\", backed by paid plans, support and 30-day refunds. CORX's hosted instance carries no SLA at all.",
      },
      row: {
        auth: "Dashboard domain whitelist — no key in the browser — with `x-corsfix-key` as a documented fallback; localhost needs no registration at all.",
        secrets:
          "`{{SECRET_NAME}}` variables in query parameters or request headers, encrypted at rest and decrypted in memory per request. Managed from their dashboard, not from your own database.",
        scoping:
          "Origin Domains and Target Domains are set per application — Target Domains defaults to *All domains* and is exact-matched — so the target list, not the secret, bounds where a credential can go.",
        hosting: "Open source too (`github.com/corsfix/corsfix`): Docker Compose with MongoDB and Redis on your own VPS.",
        caching:
          "`x-corsfix-cache` header with a duration (`10m`, `2h`, `1d`; invalid values default to one hour, capped at a day); GET only, and cached responses do not count against the plan's throughput.",
        logging:
          "Their privacy policy: no access logs at all — no URL, headers or body. Only aggregate performance metrics, error diagnostics purged after 30 days, and WAF logs (IP, user agent, path) for requests that breach a rule.",
        limits:
          "Requests are unlimited on every plan, but throughput is per IP (60/120/180 RPM) and monthly outbound transfer is metered (25/100/500 GB). Free: localhost at 60 RPM, production trial 1 GB + 3 web apps. Lite: 600 RPM shared, text only, ≤1 MB.",
        price: "$5 Hobby, $9 Growth, $19 Scale per month; $29/year for the text-only Lite proxy; free for localhost and a production trial. VAT not included.",
        setup: "For local development: nothing at all — no registration, no key, one prefix. For production: add the domain in the dashboard and pick a plan for the traffic.",
        extras:
          "JSONP, header overrides and all file types; also region selection, a CORS tester and platform guides.",
        availability:
          "Publishes a >99.9% availability figure from live data, with paid support and refunds behind it. CORX's hosted instance has no SLA — self-hosting is the answer it gives instead.",
      },
    },
    allorigins: {
      title: "CORX vs AllOrigins",
      description:
        "An honest comparison of CORX and AllOrigins: auth model, upstream secret injection, self-hosting, caching, logging, limits and price — every competitor claim dated and sourced.",
      lead:
        "AllOrigins is the simplest CORS proxy around: a free, open-source Node service with `/get` and `/raw`, no key and no account. CORX solves the next problem — holding an upstream credential server-side that the browser never sees.",
      wins:
        "AllOrigins asks nothing of you: no account, no key, no deploy, one URL. For pulling public pages into a hobby project that is genuinely less friction than CORX's public tier, which starts with copying a key — and its MIT Node server runs anywhere Node runs, Cloudflare or not.",
      src: {
        auth: "The README documents `url`, `charset` and `callback` and nothing about keys or accounts; neither does the site.",
        secrets:
          "`/get` and `/raw` forward the request as it arrives — there is no credential store in the hosted service or in the code.",
        scoping:
          "The README and the code document no credential handling at all — the request is forwarded as it arrives, so there is nothing on the server to bind to a target.",
        hosting:
          "MIT-licensed Node/Express: `git clone`, `npm install`, `npm start`. The repository's last push is 2023-02-26 (checked via the GitHub API).",
        caching: "The site and the README describe `charset`, `raw` and `callback` only — no cache controls and no TTL are documented.",
        logging:
          "The repository depends on `@logdna/logger`, so a self-hosted copy can ship logs to LogDNA (Mezmo). Nothing about the hosted instance's retention is published.",
        limits: "No quota, rate limit or fair-use policy is documented for the hosted instance.",
        price: "MIT license, free to use and self-host; the README carries a PayPal donate button for the maintainer.",
        setup: "One URL, no key, no account: `api.allorigins.win/raw?url=…` is the whole setup.",
        extras: "Beyond proxying, the documented surface is `charset` conversion and a JSONP `callback`.",
        availability:
          "Community-run, no published SLA, last push 2023-02-26. On 2026-09-17 every request we made to `https://api.allorigins.win/raw?url=…` from our network answered 5xx (500/522).",
      },
      row: {
        auth: "None documented: no key, no account, no quota page. `/get` and `/raw` are open.",
        secrets:
          "Nothing to inject with: the proxy forwards the request as it receives it, so any credential would have to come from the caller. Neither the service nor the code has a secret store.",
        scoping:
          "No credential model to scope: the proxied request carries whatever the caller set, and nothing is bound to a target server-side.",
        hosting:
          "Open source (MIT) Node/Express: `git clone && npm install && npm start`. No Cloudflare account needed, any Node host works. The repository's last push was 2023-02-26.",
        caching: "Not documented: the README and the site cover `charset`, `raw` and `callback`, with no cache controls.",
        logging:
          "Not documented for the hosted instance. The repository depends on `@logdna/logger`, so a self-hosted copy can ship logs to LogDNA (Mezmo) when configured.",
        limits: "Not documented: no daily, monthly or per-minute quota is published.",
        price: "Free and MIT-licensed, with a PayPal donate button in the README for the maintainer.",
        setup: "One URL, no key, no account: `api.allorigins.win/raw?url=…` and you are done.",
        extras: "None documented beyond proxying, `charset` conversion and JSONP `callback`.",
        availability:
          "Community-run with no published SLA, and the repository has not been pushed since 2023-02-26. When we checked on 2026-09-17 the hosted API answered 5xx from our network.",
      },
    },
  },
  // The /docs page: the human-readable manual. Code-coupled facts (call
  // shapes, the corx-* table) live in app/lib/docs.ts; only prose lives here,
  // and both locales must carry the same keys.
  docs: {
    title: "Usage",
    back: "Back to home",
    updated: "Last updated {date}",
    lead:
      "This page is the manual for the instance at {origin}: the four ways to call the proxy, every control parameter, the auth tiers, what the cache does, the limits you will hit and the security model behind it. README.md in the repository stays the source of truth for deploying your own copy.",
    toc: {
      aria: "On this page",
      call: "Call shapes",
      params: "Control parameters",
      auth: "Authentication",
      upstream: "Upstream credentials",
      caching: "Caching",
      limits: "Limits and errors",
      security: "Security",
      selfhost: "Self-hosting",
    },
    call: {
      title: "Calling the proxy",
      lead:
        "Every shape below resolves to the same request through the same pipeline — auth, SSRF guards, upstream injection, cache, logging. CORS preflight (`OPTIONS`) is answered before the proxy runs, so browser `fetch` just works.",
      note:
        "GET and HEAD responses are cached and counted; every other method passes straight through, uncached. A caller-supplied target keeps its own query string: the target's own `key`, `ttl` or `callback` parameters are forwarded untouched, and CORX only consumes names it owns.",
      snippets:
        "Copy-paste examples for fetch, axios and ky — and for Cloudflare Pages, Vercel and Netlify — live on the snippets page.",
      tester: "Or test a URL's CORS from your browser with the CORS tester.",
      query: {
        title: "Query parameter (recommended)",
        desc:
          "The shape this documentation uses everywhere: the target URL, percent-encoded, in `?url=`. Works on `/fetch` and on every other proxy route.",
      },
      path: {
        title: "Path",
        desc:
          "The target appended after `/proxy/`. Easy to read and to paste into a browser; the target's own query string survives after the first `?`.",
      },
      bare: {
        title: "Bare path",
        desc:
          "The same as `/proxy/`, one segment shorter: any path that is not a CORX page and looks like a URL is proxied.",
      },
      subdomain: {
        title: "Subdomain mode",
        desc:
          "When the deployment has a wildcard zone, a target gets a hostname of its own: dots become hyphens and hyphens double (`api.example.com` → `api-example-com.<zone>`). The request's query string is the target's query string, so the `corx-*` names are stripped back off.",
      },
    },
    params: {
      title: "The corx-* namespace",
      lead:
        "`corx-*` is CORX's namespace: these parameters are consumed by the proxy and never reach the target. Everything else belongs to the target and is forwarded untouched. A `corx-*` name that is not in this table is a 400, never a param quietly forwarded upstream.",
      col: { param: "Parameter", effect: "Effect" },
      note:
        "Subdomain and path modes are the two places where the proxy request's query is also the target's, so the `corx-*` names are stripped back off there. A target that genuinely needs a `corx-*` parameter is best addressed with `?url=`.",
    },
    param: {
      ttl:
        "Cache TTL in seconds for this GET response. Capped by the deployment's maximum (and by a public key's own TTL) so no caller can pin an entry for a day.",
      noCache:
        "Bypass the R2 cache for this request: fetch upstream, return, do not store. Range requests, JSONP and credentialed requests bypass it anyway.",
      key: "The API key for this request. Equivalent to `X-Api-Key` or `Authorization: Bearer`. Public-tier keys cannot control the cache.",
      callback:
        "JSONP: wrap an `application/json` body as `fn(<json>);` (max 2 MiB) for a `<script>` tag when CSP blocks `fetch`. JSONP never caches.",
      charset:
        "Re-decode a text, JSON or XML response with this label and re-emit it as UTF-8 — the fix when an upstream mislabels its charset. An unknown label is a 400.",
      wrap:
        "Wrap a text body as `{\"contents\":\"…\"}` with `application/json`, so `r.json()` works for HTML too. Binary responses are refused with a 400; the wrapper is part of the cache key.",
      scheme: "Subdomain mode: the target scheme. Defaults to `https`; `http` is the only other accepted value.",
      port: "Subdomain mode: the target port (1–65535), appended unless it is the scheme's default (80 for http, 443 for https).",
    },
    auth: {
      title: "Authentication",
      lead: "Three ways in — roughly the order a self-hosted deployment turns them on.",
      formsNote: "All three are equivalent; use whichever survives your client or tooling. The credential CORX authenticated with is never forwarded upstream: a corx-shaped `X-Api-Key` or `Authorization: Bearer corx_…` is always consumed, even when the key is unknown. Any other value in `X-Api-Key` is your own upstream credential (BYOK) and is forwarded untouched — present the CORX key via `Authorization: Bearer corx_…` or `?corx-key=` alongside it (a corx-shaped `X-Api-Key` takes precedence).",
      key: {
        title: "API key (per caller)",
        body:
          "Created in the console as `corx_<random>` and stored only as a SHA-256 hash — the raw value is shown once. A key can carry allowed origins, a per-minute rate limit, a cache TTL, keyless grants, allowed hosts, SSRF-check opt-outs and upstream injection. Send it in any of the forms below.",
      },
      keyless: {
        title: "Keyless origin grants",
        body:
          "Enable keyless access on a key and browsers from its allowed origins call the proxy without carrying the key at all. The grant matches the `Origin` header (or the `Referer`'s origin for same-origin GETs) and is metered per visitor IP, so one embedded site cannot drain the key. Origins are canonicalized on save (lowercase host, default port dropped), and the one wildcard form is a loopback port — `http://localhost:*` covers any localhost port, so a dev server on a random port needs a single entry. Host wildcards (`https://*.example.com`) and regexes are rejected. An origin is a convenience, not a credential — scripts can forge it — so pair it with allowed hosts and a rate limit.",
      },
      public: {
        title: "Public tier",
        body:
          "A hosted instance may publish a shared key on its landing page. It is deliberately reduced: GET and HEAD only, daily quotas per calling site / per target host / per instance, no cache control, no injection and no subdomain mode; `Cookie` and `Authorization` are stripped before forwarding. Fine for public data, demos and prototypes.",
      },
      where: {
        title: "Where the key goes — and where it must not",
        body:
          "Server-side only. A key in a browser bundle, a public repository or a page source is a key you have given away; a site that needs to call the proxy from a browser should use a keyless origin grant (or the public key, if the data really is public). Never send credentials or personal data through a shared instance at all.",
      },
    },
    upstream: {
      title: "Upstream credentials",
      lead:
        "A key can hold the upstream API credentials your app needs and attach them server-side: the browser never receives the value. Rules decide what goes where by target host, and a variable you expose can also be referenced by the caller itself.",
      ways: {
        title: "How a credential is attached",
        body:
          "Variables (`NAME=value`) hold the values; header and query rules use them. An `@host` line scopes the rules below it, so one key can carry a different credential per upstream — including the usual shape, the same header name with a different value per host (`Authorization` for two vendors). Header rules set or remove request headers (`Authorization: Bearer ${VENDOR_KEY}`, `!X-Debug`); query rules do the same with URL parameters (`api_key = ${VENDOR_KEY}`) for APIs that authenticate that way. Rules always win over what the caller sent, so a browser cannot spoof an injected header, and which rule applies is decided by the target host, not by the caller.",
      },
      client: {
        title: "Letting the caller reference a variable",
        body:
          "Exposure is per variable — `client: true` on the Admin API, the **Client-referencable variables** field in the console — and it names the hosts the caller may reference it toward. A caller then writes `${VENDOR_KEY}` in a header or query param of its own request; the proxy substitutes the value before forwarding. The caller only ever learns the name it wrote, never the value, and a variable you do not expose stays invisible to it.",
      },
      scoping: {
        title: "Two scopes, and both must allow the host",
        body:
          "A rule's `@hosts` says where *that rule* applies; a variable's own hosts say where *that variable* may ever resolve. The second bounds the first: a rule that could resolve a scoped variable toward another host is rejected at save time — including a key-level rule, because it can reach every allowed host. Patterns are the same everywhere: an exact host, `*.suffix` (label boundary), or `*`, so `*.vendor.com` covers `api.vendor.com` and nothing covers the apex `vendor.com` implicitly. Client references are evaluated per redirect hop, so a variable scoped to one host does not resolve after a redirect to another.",
      },
      order: {
        title: "Order, and what happens when nothing matches",
        body:
          "On the way out, caller references resolve first and the key's rules run afterwards, removes before sets. A rule therefore always beats what the caller asked for — `!X-Debug` deletes it, a `set` replaces it — so a browser cannot spoof an injected header. Anything the proxy will not resolve (unknown name, private variable, host outside the scope) is forwarded exactly as written. That keeps the feature additive (a key with no exposed variable behaves exactly as before) and makes an unexposed name indistinguishable from a nonexistent one, so callers cannot probe what a key holds. Headers CORX owns — a corx-shaped `X-Api-Key`, `X-Admin-Token` and the hop-by-hop set — are dropped before anything resolves; a non-corx `X-Api-Key` (including a `${VAR}` reference) is the caller's own upstream credential and is forwarded. A vendor requiring one of these names (Anthropic's `x-api-key`) is therefore covered either way: BYOK from a trusted server, or a rule when the browser must never hold the secret.",
      },
      example: {
        title: "One key, three upstreams",
        body:
          "The console's key page edits the variables as rows (each with a Client toggle and a host scope) next to the Header / Query / Response rules fields and the allowed-hosts field; the Admin API takes them as `vars` (with `client` and `hosts` per variable), `headerRules`, `paramRules`, `responseRules` and `allowedHosts`.",
        varsLabel: "Variables",
        clientVarsLabel: "Client-referencable variables",
        rulesLabel: "Header rules",
        hostsLabel: "Allowed target hosts (required with any injection)",
        note:
          "Every `@host` must fall inside the allowed-hosts list, and the list is mandatory once anything is injected — that is the guard that stops a caller from pointing your credential at a host of their choosing. A rule outside the list is never attached.",
      },
      matrix: {
        title: "What a caller's reference becomes",
        lead:
          "For the example above: `VENDOR_KEY` is exposed for `api.vendor.com` only, `PRIVATE_KEY` is not exposed, and a header rule sets `Authorization` for `api.vendor.com`.",
        sent: "Caller sends",
        host: "Target host",
        received: "Upstream receives",
        inScope: "Exposed, and the host is inside the variable's scope → resolved.",
        outOfScope: "Inside the key's allowlist, but outside the variable's scope → left as written.",
        privateVar: "Not exposed to callers at all → left as written.",
        unknown: "No such variable → left as written, exactly like a private one.",
        ruleWins: "The rule applies afterwards → its value wins over the caller's reference.",
      },
      uses: {
        title: "What it is for",
        body:
          "The common case is one front end calling several providers — an LLM at one vendor, payments or maps at others — each with its own key and no secret in the page. It also covers an API that authenticates with a query parameter instead of a header, and the same upstream with different keys per environment (one key per environment, or a variable per deployment). With client references the page can even choose which of several credentials to use without ever holding one — the pattern a browser-side app needs once it talks to more than one provider.",
      },
      keys: {
        title: "One key or several",
        body:
          "Everything above puts every upstream in a single key — one allowed-hosts union, one rate limit and one allowed-origins list shared by all of them, and one secret store to rotate. Split into one key per upstream when you want separate limits or origins, when a leak should reach only one vendor, or when the same host needs different credentials on different paths (rules are scoped by host, not by path). Keyless access grants an origin exactly one key, so a page that calls several upstreams without carrying a key gets all of them from that key's rules — and, for the variables you exposed, can reference them.",
      },
      rails: {
        title: "Cache and safety",
        body:
          "Secrets are encrypted at rest when `INJECTION_KEK` is set, masked everywhere they are read (console, logs, playground preview), and the request log stores the pre-injection URL. A key with header rules never reads or writes the R2 cache, because its responses are key-specific, while a key that injects only query parameters still caches under the effective URL. A key with any client-referencable variable does not use the shared cache at all: the reference is caller-supplied and a redirect can resolve it on a later hop, so no response through that key can be proven free of a secret. The public tier cannot inject at all — it is GET/HEAD only — so upstream credentials mean a self-hosted instance and a standard key. Treat an exposed variable as public to anyone who can call the key.",
      },
    },
    caching: {
      title: "Caching",
      lead:
        "GET responses are cached in R2 and served from the edge, so a repeated request usually never reaches upstream. `X-Corx-Cache: HIT|MISS` on every response says which path it took.",
      hitTitle: "Cache markers",
      hit:
        "`X-Corx-Cache` is the header to watch while debugging: `MISS` means upstream answered (and the response was stored), `HIT` means R2 answered. `X-Corx-Target` names the upstream host, and `X-Corx-Latency-Ms` is the time the proxy spent.",
      ttlTitle: "TTL",
      ttl:
        "The deployment's default TTL applies unless `?corx-ttl=` lowers or raises it, up to the cap. A key can pin its own default TTL, or `0` to never store; the public tier cannot set a TTL at all.",
      bypassTitle: "What bypasses the cache",
      bypass:
        "Always bypassing the shared cache: non-GET/HEAD methods, requests carrying `Authorization` or `Cookie`, `?corx-no-cache=1`, JSONP (`corx-callback`), Range requests, and keys that inject upstream headers. Keys with response header rules do cache — their resolved rules are part of the cache key, so a rewritten response is never served to another key.",
    },
    limits: {
      title: "Limits and errors",
      lead:
        "Two independent limits protect an instance: a per-minute rate limit per key (or per IP for anonymous calls), and the public tier's daily quotas.",
      rate:
        "The per-minute limit is counted on the key, or on the caller IP without one. Cache hits count too, and the D1-backed checks fail open during a database incident rather than taking the proxy down.",
      quota:
        "A public key's daily counters run per calling site, per target host and for the instance as a whole, in UTC days. Cache hits count as well — the quota is about requests, not upstream load. `X-Corx-Quota-{Origin,Host,Day}-{Limit,Remaining}` reports where you stand.",
      response:
        "Over either limit the proxy answers `429` with a JSON body (`{ error, scope, limit, resetAt }`) and `Retry-After` — seconds until the window or the UTC day resets. Ordinary responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Every machine-facing path (the proxy, `/api/*`, `/health`) answers errors as JSON `{ error }`; browser pages get a branded HTML document.",
    },
    security: {
      title: "Security",
      lead:
        "CORX is a CORS proxy, so it is a man in the middle by construction: whoever operates an instance can read, change and replay everything passing through it. The guards below reduce what an untrusted caller can reach; they do not make a shared instance safe for secrets.",
      ssrf:
        "SSRF guards: private, link-local, CGNAT, multicast and reserved IP literals are blocked, the host is resolved over DoH and re-checked so a name cannot rebind to a private address, and a D1 blocklist covers whole hosts and their subdomains. A trusted key can opt out of the IP/hostname and DNS checks; the blocklist and Cloudflare's own rules are never bypassed.",
      headers:
        "Header hygiene: hop-by-hop and proxy-owned headers (`Host`, `Connection`, `X-Forwarded-For`, `CF-*`, …) are stripped on the way in and out, `Set-Cookie` is never forwarded, and the public tier strips `Cookie` and `Authorization` before forwarding.",
      visibility:
        "What a proxy can see: the target URL, the request and response bodies, and the caller's IP, `Origin` and country. A hosted instance logs requests and rolls them into a per-day aggregate; a self-hosted deployment chooses whether and how long (`LOG_REQUESTS`, `LOG_RETENTION_DAYS`).",
      trust:
        "So the honest way to run CORX is self-hosting: one MIT-licensed Worker in an account you control. A hosted instance is a shared, best-effort demo — read the terms of use and the trust model before sending it traffic.",
      termsLink: "Terms of use",
      trustLink: "Trust model",
    },
    selfhost: {
      title: "Self-hosting",
      lead:
        "Every limit on this page — quotas, rate limits, retention, allowed hosts — is a setting on a Worker you control once you deploy your own copy. The README covers the ten-minute deployment (D1 + R2 + `wrangler deploy`); CONTRIBUTING.md covers local development and the checks a change has to pass.",
      readme: "Deployment guide",
      contributing: "Contributing guide",
    },
  },
  // The /snippets page: copy-paste code for the frameworks and platforms users
  // actually arrive from. Snippet code lives in app/lib/snippets.ts; only prose
  // lives here, and both locales must carry the same keys.
  snippets: {
    title: "Framework and platform snippets",
    back: "Back to home",
    updated: "Last updated {date}",
    lead:
      "The same endpoint from the code you actually write: `fetch`, axios and ky, the browser-safe patterns (keyless grant, server route), and what to do on Cloudflare Pages, Vercel and Netlify. Every example runs against {origin} — point the base URL at your own deployment and the rest still holds.",
    toc: {
      aria: "On this page",
      libraries: "Client libraries",
      browser: "Browser code",
      server: "Server route",
      risk: "Key safety",
      platforms: "Deploy platforms",
      public: "Public tier",
    },
    group: {
      libraries: {
        title: "Client libraries",
        lead:
          "The proxy is one URL prefix, so any HTTP client works; these are the three most people reach for. All three examples run server-side, where the key belongs — in a browser, use the keyless pattern below instead.",
      },
      browser: {
        title: "Browser code — with no credential",
        lead:
          "A key in a browser bundle is a published key. These patterns are the safe ones: an origin grant on the server's key, a streamed read that needs no credential at all, and the environment-variable rule that keeps the key out of the build.",
      },
      server: {
        title: "A server route that holds the key",
        lead:
          "When the browser needs private data it asks your own backend, and your backend asks CORX. This is the BFF pattern, and it is the same code on every platform below.",
      },
    },
    block: {
      fetch: {
        title: "fetch (Node, Bun, Deno)",
        desc: "One request, one header. On the server the key is an environment variable, not a build-time constant.",
      },
      axios: { title: "axios", desc: "The target goes in `params`, so axios URL-encodes it for you." },
      ky: { title: "ky", desc: "Small, fetch-based and promise-first; `.json()` parses the response." },
      keyless: {
        title: "Keyless origin grant",
        desc:
          "Grant the page's origin on a key in the console and the browser calls the proxy with no credential at all. Metering follows the visitor IP, so one embedded site cannot drain the key.",
      },
      stream: {
        title: "Streaming a response (SSE / LLM)",
        desc:
          "`res.body` is a live stream: read it chunk by chunk and tokens appear as they are generated instead of after the last one. The proxy forwards `text/event-stream` unbuffered, so a keyless grant works too. An LLM chat API is `POST` with a server-held key — see the server route below.",
      },
      viteEnv: {
        title: "Vite / React environment variables",
        desc:
          "Only `VITE_*` values are public — which is exactly what decides what may live in one. Next.js's `NEXT_PUBLIC_*` and SvelteKit's `PUBLIC_*` are the same rule under different names.",
      },
      serverRoute: {
        title: "Next.js route handler (adapts to any server)",
        desc:
          "Put the key in `CORX_KEY` on the server only. The response streams through, so a large file is never buffered twice.",
      },
    },
    risk: {
      title: "Where the key must not go",
      body:
        "In a browser bundle, a `VITE_*` / `NEXT_PUBLIC_*` variable, a public repository, a page source, a mobile app binary — anywhere a visitor can read it. A leaked key spends your quota and reaches every host and origin it allows, under your identity. Browser code gets a keyless grant or talks to your own server; nothing else.",
      docs: "Authentication, in detail",
    },
    platforms: {
      title: "Deploy platforms",
      lead: "CORX is a plain HTTPS endpoint, so every platform reaches it the same way. What differs is only where the secret lives.",
      pages:
        "Cloudflare Pages — a Pages Function (`functions/api/corx.ts`) reads the key from `context.env.CORX_KEY`; `npx wrangler pages secret put CORX_KEY` stores it. Pages and a self-hosted CORX are the same account, and the browser can call the Worker directly when a keyless grant covers the site.",
      vercel:
        "Vercel — a Serverless or Edge Function (or the Next.js route above) reads `process.env.CORX_KEY` from Project → Environment Variables. Never put it in `NEXT_PUBLIC_*`: those values are inlined into the browser bundle.",
      netlify:
        "Netlify — a Function reads the key from Site configuration → Environment variables. No adapter, no plugin: it is one `fetch` to a URL.",
    },
    public: {
      title: "When the public tier is enough",
      body:
        "The shared key a hosted instance publishes on its landing page is meant for this: public data, demos, prototypes. It is GET and HEAD only, with daily quotas, no TTL control, no injection and a shared cache — and because it is public by design, inlining it in a page is fine. Anything private, credentialed or quota-sensitive belongs on your own deployment with your own key.",
      landing: "Get the public key",
      selfhost: "How to self-host",
    },
  },
  // The /tools/cors-tester page: the browser-side diagnosis. Probe results and
  // snippets come from app/lib/cors-check.ts; only prose lives here.
  corsTester: {
    title: "CORS tester",
    back: "Back to home",
    lead:
      "Paste a URL and see what your browser actually does with it: whether a cross-origin `fetch` succeeds, and if it does not, which part of the CORS handshake is missing. The tool then runs the same URL through this CORX instance and gives you the call to paste.",
    invalid: {
      empty: "Paste a URL first.",
      invalid: "That does not parse as a URL.",
      scheme: "Only http and https URLs can be tested.",
      self: "That is this site's own origin — a same-origin request says nothing about CORS.",
    },
    result: {
      allowOrigin: "Access-Control-Allow-Origin: {value}",
      allowCredentials: "Access-Control-Allow-Credentials: {value}",
      none: "not sent",
    },
    probe: {
      title: "What the browser reported",
      cors: "Cross-origin fetch",
      opaque: "Opaque probe (mode: no-cors)",
      credentials: "With credentials",
      preflight: "Preflighted request",
      pass: "completed",
      fail: "blocked",
      skip: "not reached",
    },
    finding: {
      ok: {
        title: "CORS already works",
        body:
          "The browser could read this response, so nothing needs a proxy for CORS. (One can still help with edge caching, hiding upstream credentials or limiting your callers — but CORS is not the problem here.)",
      },
      "missing-allow-origin": {
        title: "No `Access-Control-Allow-Origin` for this page",
        body:
          "The server answered — the opaque probe completed — but the browser refused to hand the response to this page. The header is either missing or names other origins. That is exactly what a proxy fixes: it adds the header on the way back.",
      },
      unreachable: {
        title: "The request never completed",
        body:
          "Even an unreadable probe failed, so nothing answered: check the hostname, the port, the network, or a page CSP (`connect-src`) blocking this origin. A proxy cannot fix a target that does not answer.",
      },
      "mixed-content": {
        title: "Blocked as mixed content",
        body:
          "This page is https and the target is http, so the browser refuses the request before sending it. Use the target's https endpoint, or fetch it through CORX — the proxied URL is https.",
      },
      credentials: {
        title: "Credentialed requests are refused",
        body:
          'The plain fetch worked, but the same request with `credentials: "include"` did not. Usually that means `Access-Control-Allow-Origin: *`, which browsers refuse to combine with credentials — the target must name your origin exactly and send `Access-Control-Allow-Credentials: true`. A self-hosted CORX can forward credentials; the public tier strips them.',
      },
      preflight: {
        title: "The preflight fails",
        body:
          "A simple GET works, but a request with a custom header does not, so the OPTIONS preflight is the blocker (`Access-Control-Allow-Headers`/`-Methods` do not cover it). Through a proxy the request is same-origin, and there is no preflight to fail.",
      },
      framing: {
        title: "The document refuses to be framed",
        body:
          "The proxied response still carries `X-Frame-Options` or a CSP `frame-ancestors` list, so it cannot go into an `<iframe>`. For a host you control, a self-hosted key can strip those headers for that host — sandbox the frame yourself.",
      },
    },
    proxied: {
      title: "The same URL through CORX",
      note: "This instance answered {status}. Preview below; the exact call is under it.",
      failed: "The proxied request failed: {error} — copy the call below and try it where your code runs.",
    },
    fix: {
      title: "The call to paste",
      lead:
        "All three are the same request. The browser form is only safe with the public key (or an origin granted on a key); a private key belongs on the server.",
      proxyUrl: "Proxy URL",
      browser: "Browser (fetch)",
      server: "Server (fetch, with a key)",
    },
    island: {
      urlAria: "URL to test",
      urlPh: "https://api.example.com/data",
      run: "Test it",
      running: "Testing…",
      note:
        "The probes run in your browser. The proxied request goes through this instance — subject to its terms, quotas and logging, so do not paste private URLs here.",
    },
    how: {
      title: "How the test works",
      body:
        "Your browser fetches the URL up to three ways: a plain cross-origin request, the same with credentials, and one with a custom header that forces a preflight. When the plain request is blocked, an opaque `no-cors` probe runs too — it cannot be read, but completing proves the server answered, which separates missing CORS headers from an unreachable host. Browsers deliberately hide *why* a request was blocked, so the verdict is inferred from those probes, not read from an error.",
    },
    frames: {
      title: "Frames are a separate question",
      body:
        "CORS decides whether `fetch` may read a response. Whether a page can be shown in an `<iframe>` is decided by the target's `X-Frame-Options` and CSP `frame-ancestors`, which CORX does not strip by default. A self-hosted key can, for a host you control.",
      link: "The embed recipe",
    },
    docs: {
      auth: "Authentication, in detail",
      snippets: "Framework snippets",
    },
    more: { title: "Keep reading" },
  },
  landing: {
    title: "CORX — Free, open-source CORS proxy on Cloudflare",
    meta: {
      description:
        "Free, open-source CORS proxy on Cloudflare's edge: a public key with no signup, or self-host the MIT-licensed Worker for private quotas, logs and keys.",
    },
    hero: {
      h1a: "Fetch any URL,",
      h1b: "without CORS.",
      sub: "CORX is an edge CORS proxy. Prefix any URL and fetch it cross-origin — responses are cached at the edge, rate-limited, guarded against SSRF, and upstream secrets never leave the server.",
      prefix: "One prefix:",
      noDeploy: "No deploy? Use the public key",
      tryLive: "Try it live",
      openConsole: "Open console",
      trustNote: "Don't trust a proxy with secrets — not even this one. CORX is open source and free to self-host.",
      trustCta: "Read the trust model",
    },
    publicKey: {
      title: "Use it without deploying",
      sub:
        "Free to use from your own site with this shared public key: cross-origin GET/HEAD only, daily quotas, best effort. Injection, cache control, subdomain mode and per-key limits need your own deployment.",
      keyLabel: "Public key",
      usageLabel: "Usage",
      copyNoteA: "Using this key means you accept the",
      copyNoteB: "— no phishing, malware, spam, illegal or abusive traffic, and never send credentials through it.",
      termsLink: "terms of use",
      limitsTitle: "Daily limits (UTC)",
      limitOrigin: "Per calling site",
      limitHost: "Per target host",
      limitTotal: "Whole instance",
      perDay: "{n}/day",
      unavailable: "This instance has no public key configured.",
    },
    tryit: {
      title: "Try it live",
      sub: "Examples rotate every 10s and load straight through the proxy. Type any URL to take over.",
      hint: "Same as GET {origin}/fetch?url=…. Every request goes through the edge proxy — watch the status, latency, size and cache HIT/MISS badges update as examples rotate.",
      snippets: "Using React, Vue, axios or ky? Copy-paste snippets",
      tester: "Test a URL's CORS",
    },
    highlights: {
      title: "Built for real apps, not toy demos",
      sub: "The details that keep secrets, browser callers and debugging under control.",
      injection: {
        title: "Secrets stay on the edge",
        desc: "Attach variables and header/query rules to a key and CORX injects them upstream, scoped per target host — so one key can hold a different credential for each vendor. A variable you expose can be referenced by the page as `${NAME}` without the value ever reaching the browser; values are masked in the console and logs.",
      },
      keyless: {
        title: "Keyless browser access",
        desc: "Grant an origin to a key and its visitors call the proxy without shipping a key. Grants are per-origin, metered per visitor IP, and logged for audit.",
      },
      playground: {
        title: "Inspect every hop",
        desc: "Run any request through the real pipeline from the console playground — auth, SSRF guards, injection, cache — and read the full response plus a masked injection preview.",
      },
      console: {
        title: "A console, not just an endpoint",
        desc: "Most self-hosted proxies hand you a URL and stop there. CORX ships the product around it: a bilingual dashboard for usage and a period-over-period trend, per-key policy, request logs, a host blocklist and a playground that runs through the real pipeline.",
      },
    },
    trust: {
      title: "You trust someone. Choose who.",
      sub: "A CORS proxy is a man in the middle by design: whoever runs it can read, change and replay everything that passes through. CORX does not hide that. It is built so the honest answer to “can I trust it?” is not “yes” — it is “you don't have to”.",
      hosted: {
        title: "The hosted instance — free, public, best-effort",
        desc: "A shared demo of the public tier: no sign-up, daily quotas, revocable without notice. Fine for public data, demos and prototypes — not for secrets, credentials or private data. The public tier strips Cookie and Authorization, serves from a shared cache and logs requests for 30 days; those reduce exposure, they are not a guarantee.",
      },
      self: {
        title: "Your own deployment — free, private",
        desc: "One MIT-licensed Cloudflare Worker with D1 + R2. Deploy it to your own account on the free tier and the whole data path stays inside it: your keys, your logs, your limits, no third party in the middle. Read the source, fork it, change it — that is the point.",
        cta: "Get the source",
        deploy: "Deploy to Cloudflare",
        deployHint:
          "One click: Cloudflare clones the repository to your GitHub, creates the D1 database and R2 bucket in your account, and deploys it — the free plan is enough.",
      },
      note: "No accounts, seats or bills from us. Where trust matters, self-hosting is the intended way to run CORX.",
    },
    features: {
      title: "Everything you need at the edge",
      simple: {
        title: "Simple by design",
        desc: "One URL prefix works from any origin — no SDK, no config, no special headers.",
      },
      cached: {
        title: "Edge-cached",
        desc: "Responses are cached in R2 and served from the edge, with TTL control, a no-cache escape hatch and per-key policy.",
      },
      ssrf: {
        title: "SSRF-safe",
        desc: "Private ranges, DNS rebinding and a D1 blocklist are stopped at the edge — per-key opt-outs for trusted callers.",
      },
      keys: {
        title: "API keys",
        desc: "Per-key origins, rate limits, cache TTL and keyless grants — revoke any key in one click.",
      },
      analytics: {
        title: "Usage analytics",
        desc: "Requests, traffic, latency and error rates, charted per hour inside the console.",
      },
      subdomain: {
        title: "Subdomain mode",
        desc: "Give every target its own host: example.com becomes example-com.your.host.",
      },
      streaming: {
        title: "Media-ready streaming",
        desc: "Large files, Range requests and SSE (LLM chat APIs) stream straight through — seeking in video and audio just works, and tokens arrive as they are generated.",
      },
      console: {
        title: "Bilingual console",
        desc: "Manage keys, watch logs, run requests in English or 中文 — with a playground that mirrors the real pipeline.",
      },
      selfHosted: {
        title: "Yours to self-host",
        desc: "Deploy on your own Cloudflare account with D1 + R2 — no accounts, seats or bills from us.",
      },
    },
    cta: {
      title: "Ship your first proxy call in 60 seconds",
      sub: "Head to the console, grab an API key, and start fetching.",
      btn: "Open console",
    },
    // The FAQ is also emitted as FAQPage JSON-LD from these same strings, so
    // the answers an answer engine quotes are the answers a human can read.
    // Keep each one self-contained: it may be quoted without its question.
    faq: {
      title: "CORX FAQ",
      sub: "The questions a proxy has to answer before it sees production traffic.",
      q1: "What is CORX?",
      a1: "CORX is an open-source CORS proxy that runs on Cloudflare's edge. Prefix any URL with /fetch?url= and the response comes back with CORS headers, so browser code can read APIs that never set them — with R2 edge caching, rate limiting and SSRF guards built in.",
      q2: "How do I call it?",
      a2: "Four equivalent shapes: /fetch?url=<encoded>, /proxy/<url>, /<url> (path style), or subdomain mode where api.example.com becomes api-example-com.<your zone>. GET and HEAD are cached; every other method passes straight through uncached.",
      q3: "Do I need an API key?",
      a3: "Not for this hosted instance: copy the public key from this page and send GET/HEAD requests within its daily quotas. Your own deployment can use per-caller keys, keyless access for granted origins, or no auth at all behind its own network.",
      q4: "Can I send cookies, tokens or personal data?",
      a4: "Not through the public key: it strips Cookie and Authorization before forwarding, responses may be served from a shared cache, and requests are logged for 30 days. Keep private or authenticated traffic on your own deployment.",
      q5: "What happens when I hit the limits?",
      a5: "You get 429 with a Retry-After header. Requests are counted per calling site, per target host, per instance and per minute, and cached responses count too — the quota is about requests, not upstream load.",
      q6: "Can I self-host it?",
      a6: "Yes. CORX is MIT-licensed TypeScript for Cloudflare Workers, D1 and R2: deploy it to your own account and the quotas, limits and logs are yours. The repository README covers the whole deployment.",
      q7: "Can I trust the hosted instance with my traffic?",
      a7: "Only with data you would hand to a stranger. A proxy sees — and can change — everything passing through it, and on a hosted instance the operator is that stranger. Use the public key for public data, demos and prototypes; when the traffic matters, self-host CORX and the only operator left in the path is you.",
      q8: "Does CORX come with an admin console?",
      a8: "Yes — a bilingual (English/中文) console with a usage dashboard and a period-over-period trend, per-key policy (rate limits, allowed origins, cache TTL, keyless grants, upstream injection, public-tier quotas), request logs, a host blocklist and a playground that runs requests through the real pipeline. Most self-hosted proxies are just a fetch endpoint; this is the product around it, in the same Worker.",
      q9: "Is CORX free?",
      a9: "Yes, both halves. The hosted instance gives you a public key with no account — GET/HEAD, daily quotas, best effort. Self-hosting is free too: CORX is MIT-licensed and runs on Cloudflare's free plan; if you outgrow that you pay Cloudflare ($5/mo Workers Paid), not us. There is no paid tier, no seat count and no subscription.",
      // The comparison pages' only entry point besides search. Dated answer to
      // "how is this different from X", not a pitch.
      compare: "Comparing it with another hosted proxy?",
    },
    // The agent entry. This instance already publishes llms.txt /
    // llms-full.txt (app/lib/seo.ts); the section is where a *human* finds out.
    // Its machine-discoverable halves are the <link rel="alternate"> in
    // SiteHead and the footer link.
    agents: {
      title: "Built to be read by agents",
      sub: "This instance describes itself in llms.txt, so a coding agent can pick up the calling conventions, auth tiers, caching and limits in one fetch instead of reading the site.",
      indexDesc: "The index: what CORX is, how to call it, and where to look next.",
      fullDesc: "The full reference in one document: calling shapes, quotas, the security model, self-hosting.",
      promptLabel: "Or paste this into your agent",
      prompt: "Read {origin}/llms-full.txt, then use {origin}/fetch?url=<url> to fetch URLs cross-origin.",
      more: "Also generated for this host:",
    },
  },
  notfound: {
    title: "404 — Not found · CORX",
    h1: "404 — Page not found",
    sub: "We can't find the page you were looking for. It may have been moved, renamed, or never existed.",
    takeHome: "Take me home",
    openConsole: "Open console",
    noMatch: "No CORX route matches {path}",
  },
  errorpage: {
    title: "{code} — Server error · CORX",
    h1: "{code} — Something went wrong",
    sub: "The request failed unexpectedly on our side. Nothing you did — head back and try again in a moment.",
    backConsole: "Back to console",
    consoleTitle: "Server error",
    ref: "Reference: {code} · {path} · {time}",
  },
  console: {
    nav: {
      overview: "Overview",
      keys: "API keys",
      playground: "Playground",
      logs: "Logs",
      blocked: "Blocklist",
    },
    title: {
      overview: "Overview",
      keys: "API keys",
      playground: "Playground",
      logs: "Logs",
      blocked: "Blocklist",
      profile: "Profile",
      login: "Sign in",
    },
    sidebar: {
      collapse: "Collapse sidebar",
    },
    topbar: {
      openSidebar: "Open sidebar",
      profile: "Profile",
      logout: "Log out",
      logoutTitle: "Log out?",
      logoutBody: "The session cookie is cleared — and you are signed out of Cloudflare Access when it sits in front of the console.",
      account: "Account",
      session: "Session",
    },
    csrf: {
      failed: "The form could not be verified — its CSRF token was missing or invalid. Reload the console page and try again.",
    },
    overview: {
      last24hTitle: "Last 24 hours",
      requests: "requests",
      trafficOut: "traffic out",
      servedFromCache: "served from cache ({hits} hits)",
      trafficIn: "traffic in",
      avgLatency: "avg latency (max {max} ms)",
      errorRate: "error rate ({n})",
      apiKeys: "API keys",
      blockedHosts: "blocked hosts",
      perHour: "Requests per hour",
      topHosts: "Top hosts",
      topKeys: "Top API keys by traffic",
      breakdown: "Breakdown",
      recentErrors: "Recent errors",
      host: "Host",
      key: "Key",
      requestsRight: "Requests",
      traffic: "Traffic",
      time: "Time",
      method: "Method",
      status: "Status",
      error: "Error",
      noData: "no data",
      none: "none 🎉",
      anonymous: "anonymous",
    },
    trend: {
      title: "Trend",
      days: "{n}d",
      hint: "Current {days}-day period vs the one before it. Origins and keys are counted per UTC day and summed, so a returning caller counts once a day.",
      previous: "prev {n}",
      origins: "Distinct origins",
      keys: "Distinct keys",
      requests: "Requests",
      errors: "Errors",
      new: "new",
      flat: "0%",
      daily: "Daily requests ({days}d vs {days}d)",
    },
    keys: {
      newKey: "New key created — copy it now, it won't be shown again.",
      createFailed: "Failed to create key",
      saveFailed: "Failed to save key",
      deleteFailed: "Failed to delete key",
      deleteMismatch: "Name doesn't match “{name}” — the key was not deleted.",
      name: "Name",
      ratePerMin: "Rate / min",
      allowedOrigins: "Allowed origins",
      cacheTtl: "Cache TTL (s)",
      noCache: "No-cache",
      noCacheShort: "skip the R2 cache",
      create: "Create key",
      edit: "Edit",
      createTitle: "Create API key",
      createdTitle: "Key created",
      continueInjection: "Continue to injection",
      policy: "Policy",
      save: "Save",
      saving: "Saving…",
      badgeRevoked: "revoked",
      showRevoked: "Show revoked ({n})",
      hideRevoked: "Hide revoked",
      revoke: "Revoke key",
      revokeFailed: "Failed to revoke key",
      revokeMismatch: "Name doesn't match “{name}” — the key was not revoked.",
      revokeTitle: "Revoke API key?",
      revokeHint:
        "Revoking is immediate: requests using this key start failing. The row is kept for its logs. Type {name} to confirm.",
      revokedHint: "This key is revoked — it no longer authenticates. Delete it to remove the row.",
      view: "View",
      checks: "Safety checks",
      advanced: "Advanced policy",
      presets: "Presets",
      presetLocal: "Local development",
      presetPublic: "Public tier",
      rateDefault: "blank = {value}/min",
      originsDefault: "blank = global ({value})",
      cacheDefault: "blank = global {ttl}s (public tier {publicTtl}s)",
      ipCheck: "IP check",
      ipCheckHint: "Block private/reserved IP literals and internal hostnames.",
      dnsCheck: "DNS check",
      dnsCheckHint: "Resolve the host via DoH and block names that point at a non-public IP.",
      keyless: "Keyless access",
      keylessHint: "The allowed origins above can use this key without sending it. A loopback port wildcard (http://localhost:*) covers every port on that host. Origin is a convenience, not a credential — non-browser clients can forge it.",
      publicTier: "Public tier",
      publicTierHint:
        "The shared key for this hosted instance: GET/HEAD only, no cache control, no subdomain mode, credentials never forwarded, and the daily quotas below. Safe to hand out.",
      dailyLimits:
        "Daily quotas in UTC days. Blank = unlimited, except the total, which is required — it is what keeps this instance inside its Cloudflare budget.",
      dailyLimitPerOrigin: "Per origin / day",
      dailyLimitPerHost: "Per target host / day",
      dailyLimitTotal: "Total / day (required)",
      dailyLimitPh: "e.g. 3000",
      badgePublic: "public",
      allowedHosts: "Allowed target hosts",
      allowedHostsPh: "api.vendor.com, *.vendor.com — comma or space separated (required for injection)",
      injection: "Upstream injection",
      injectionHint: "Variables are injected into headers/params on the way out. One rule per line; @hosts scopes the lines below, !Name removes, ${var} inserts a variable. The same header can be set once per host (@host1 / @host2), so one key can hold a credential per upstream.",
      injectionHostsHint:
        "Needs at least one allowed target host (Advanced policy) — the save is rejected without one.",
      injectionLink: "Injection",
      logsLink: "Logs",
      playgroundLink: "Playground",
      filterPh: "Filter by name, host or origin",
      filter: "Filter",
      filterClear: "Clear",
      emptyMatch: "no keys match this filter",
      headLastUsed: "Last used",
      lastUsedHint: "Last used comes from the raw logs, kept {days} days — a dash means no request in that window, not necessarily never used.",
      back: "Back to keys",
      varsHint:
        "One row per variable. A blank value keeps the stored secret; Client lets a caller send `${NAME}` itself, only toward the hosts given; clearing the name removes the variable.",
      varName: "Name",
      varNamePh: "VENDOR_KEY",
      varValue: "Value",
      varValuePh: "blank = keep",
      varClient: "Client",
      varClientHint: "Callers may send `${NAME}` themselves — only toward the hosts listed.",
      varHosts: "Hosts",
      varHostsPh: "blank = any allowed host",
      addVar: "+ Add variable",
      removeVar: "Remove",
      preview: "Preview",
      previewHint: "What upstream receives for a sample request with the saved configuration — secrets are masked as ***.",
      previewVars: "Variables",
      previewSample: "Sample request",
      previewUpstream: "Upstream receives",
      previewHeaders: "Headers",
      previewNone: "none",
      previewEmpty: "Nothing to preview yet — add a variable or a rule.",
      saveInjection: "Save injection",
      vars: "Variables",
      headerRules: "Header rules",
      headerRulesPh: "Authorization: Bearer ${UPSTREAM_TOKEN}",
      paramRules: "Query rules",
      paramRulesPh: "api_key = ${UPSTREAM_TOKEN}",
      responseRules: "Response header rules",
      responseRulesPh: "!X-Frame-Options\n!Content-Security-Policy",
      responseRulesHint:
        "Applied to what the caller receives, not to the upstream request. Same grammar: Name: value, !Name removes, @hosts scopes, ${var} inserts. Use it to embed a page (strip X-Frame-Options / CSP frame-ancestors) — sandbox the iframe yourself; re-serving someone else's document is your call.",
      danger: "Danger zone",
      dangerHint: "Deleting a key is permanent — requests using it start failing immediately.",
      delete: "Delete key",
      deleteTitle: "Delete API key?",
      deleteHint: "This permanently deletes the key. Type {name} to confirm.",
      deleteConfirm: "key name",
      namePh: "my-app",
      ratePh: "120 (blank = default)",
      originsPh: "* or https://app.example, http://localhost:* (blank = global)",
      ttlPh: "blank = global",
      cacheTtlTitle: "TTL seconds (blank = global, 0 = never store)",
      noCacheTitle: "Skip the R2 cache entirely for this key",
      noCacheValue: "no-cache",
      ttlValue: "TTL {ttl}s",
      global: "global",
      default: "default",
      headName: "Name",
      headRate: "Rate/min",
      headOrigins: "Allowed origins",
      headCache: "Cache",
      headCreated: "Created",
      empty: "no keys yet",
      badgeKeyless: "keyless",
      badgeInject: "inject {n}",
      hint: "Per-key origins override the global {code} for requests using that key. Browsers don't send API keys on {opt} preflights — pass the key via {query} if preflights must be per-key.",
      hintInjection: "Injection: a key with variables or rules must declare its allowed target hosts, and requests with header rules never use the shared cache. Keyless requests are rate-limited per origin + IP.",
    },
    playground: {
      sub: "Compose a request against the live proxy pipeline — method, headers, body, auth, cache and the SSRF guards all apply. Every run is logged like a real call.",
      request: "Request",
      response: "Response",
      run: "Run",
      running: "Running…",
      url: "Target URL",
      urlPh: "https://api.example.com/data",
      method: "Method",
      route: "Route style",
      routeFetch: "/fetch?url= (query)",
      routeProxy: "/proxy/ (path)",
      routeRaw: "/ (bare path)",
      routeSubdomain: "subdomain (simulated)",
      auth: "Auth & client",
      key: "API key",
      keyNone: "Anonymous (no key)",
      keyRaw: "Paste a raw key",
      keyRawPh: "corx_… (sent to this worker only, never stored)",
      origin: "Origin",
      originPh: "https://app.example (optional)",
      clientIp: "Client IP",
      clientIpPh: "203.0.113.7 (optional)",
      headers: "Request headers",
      headerName: "Name",
      headerValue: "Value",
      addHeader: "Add header",
      removeHeader: "Remove header",
      body: "Body",
      bodyPh: '{"hello":"world"}',
      bodyHint: "Sent as-is — add a Content-Type header if the upstream needs one.",
      cache: "Cache",
      ttl: "TTL (s)",
      ttlPh: "blank = default",
      noCache: "no-cache",
      presetsHint: "Presets only fill the form — press Run to fire.",
      empty: "Run a request to inspect the raw response — status, headers, body, cache and key decisions.",
      tabPreview: "Preview",
      tabBody: "Body",
      tabHeaders: "Headers",
      tabRequest: "Effective request",
      pretty: "Pretty JSON",
      truncated: "Truncated at {n} — the proxy keeps streaming; the log records the rest.",
      binary: "binary body (base64 preview)",
      copyBody: "Copy body",
      copyCurl: "Copy as cURL",
      copied: "Copied",
      rerun: "Run again",
      failed: "Request failed",
      injection: "Injection preview",
      injectionHint: "Secrets are masked — this shows what the key attaches on the way out.",
      ignored: "Dropped by the composer (fetch-forbidden): {list}",
      history: "History",
      historyEmpty: "no runs yet",
      clear: "Clear",
      historyHint: "Click a row to load it back into the form.",
      presetCache: "Cache MISS→HIT (run twice)",
      presetSsrf: "SSRF literal block",
      presetMetadata: "Metadata IP block",
      presetPreflight: "CORS preflight",
      presetRange: "Range request",
      presetEcho: "POST echo",
    },
    logs: {
      title: "Request logs",
      window: "Window",
      keyFilter: "key: {name}",
      keyFilterClear: "clear",
      refresh: "Refresh",
      truncated: "Showing the newest {n} rows in this window — narrow it to see older entries.",
      headTime: "Time",
      headMethod: "Method",
      headHost: "Host",
      headStatus: "Status",
      headLatency: "Latency",
      headCc: "CC",
      headVia: "Via",
      headCaller: "Caller",
      headCache: "Cache",
      headSize: "Size",
      headError: "Error",
      empty: "no logs",
      hit: "HIT",
      miss: "MISS",
      viaKey: "key",
      viaOrigin: "keyless",
      viaAnon: "anon",
    },
    blocked: {
      title: "Host blocklist",
      sub: "Extra SSRF blocks on top of the built-in private-range protection. Blocking a domain also covers its subdomains.",
      hostname: "Hostname",
      reason: "Reason",
      hostnamePh: "evil.example",
      reasonPh: "abuse",
      block: "Block host",
      remove: "Remove",
      removeTitle: "Remove from blocklist?",
      removeBody: "Requests to {host} will be allowed again through the proxy.",
      headHostname: "Hostname",
      headReason: "Reason",
      headAdded: "Added",
      empty: "empty",
    },
    profile: {
      viaAccess: "Signed in via Cloudflare Access",
      viaToken: "Signed in via admin token",
      email: "Email",
      authMethod: "Auth method",
      hint: "Console access is controlled by your deployment's Access policy or {code}. Changes to the account (email, permissions) happen on the upstream identity provider, not here.",
    },
    login: {
      consoleTitle: "CORX console",
      detected: "Detected Access identity:",
      unknown: "unknown",
      continueAccess: "Continue with Cloudflare",
      noAccess: "No Cloudflare Access session detected on this request. In production, put an Access application in front of the admin host — then this button signs you in.",
      accessTitle: "Available behind Cloudflare Access",
      or: "or",
      tokenHint: "Local development without Access: paste {code}.",
      adminToken: "Admin token",
      signIn: "Sign in",
      errAccess: "No valid Cloudflare Access identity on this request.",
      errToken: "Invalid token.",
      errMisconfig: "Server misconfigured: SESSION_SECRET (or ADMIN_TOKEN) is not set.",
      verifying: "verifying on sign-in",
    },
  },
  corsDemo: {
    urlAria: "URL to proxy",
    urlPh: "https://api.example.com/…",
    go: "Go",
    error: "error",
    cache: "cache {value}",
    truncated: "… (truncated)",
    requestFailed: "Request failed: {err}",
    waiting: "Waiting for the first request…",
    autoRotating: "Auto-rotating examples every 10s",
    manualMode: "Manual mode — type a URL and press Go",
    pause: "Pause",
    resume: "Resume",
    tabPreview: "Preview",
    tabRaw: "Raw",
    tabHeaders: "Headers",
    // Injection demo (app/lib/demo.ts): the button sits in the demo's footer,
    // the note explains the run, the badge marks the header CORX attached.
    injectBtn: "See a key get injected",
    injectNote:
      "Two credentials, one request: the browser sent the public demo key, and CORX attached `{header}` from its own encrypted storage before the request left the edge. The echo upstream shows it arrived — the browser never held it. (The value is fake; it exists to make the mechanism visible.)",
    injectBadge: "injected by CORX",
  },
  /** Shared response-viewer copy (landing demo + console playground). */
  preview: {
    openRaw: "Open raw",
    imageAlt: "Image returned by the proxy",
    mediaHint: "Streamed through the proxy — press play (Range requests are forwarded).",
    frameHint: "Sandboxed preview · scripts disabled",
    frameBlocked: "This site refuses to be embedded ({reason})",
    frameBlockHint:
      "That header is the target's own clickjacking protection. A self-hosted CORX can strip it for hosts you control — and then sandbox the iframe yourself:",
    frameBlockDoc: "the embed recipe",
    binary: "Binary body · {type} · {bytes}",
    array: "Array",
    object: "Object",
  },
  statsTabs: {
    aria: "Breakdown",
    byStatus: "By status",
    byMethod: "By method",
    byCountry: "By country",
    noData: "no data",
  },
  copy: {
    copy: "Copy",
    copied: "Copied",
  },
  ui: {
    cancel: "Cancel",
    close: "Close",
  },
  time: {
    now: "just now",
    minutes: "{n}m ago",
    hours: "{n}h ago",
    days: "{n}d ago",
  },
} as const;

export type Locale = "en" | "zh";
export const LOCALES: Locale[] = ["en", "zh"];
export const DEFAULT_LOCALE: Locale = "en";

/** Structure of the en dictionary, with values widened to string (so `zh`
    can hold any translation while still mirroring the en key shape). */
type DeepStrings<T> = { [K in keyof T]: T[K] extends string ? string : DeepStrings<T[K]> };
export type Messages = DeepStrings<typeof en>;
export type MessagesOf<L extends Locale> = L extends "en" ? typeof en : typeof zh;

type FlattenKeys<T, P extends string = ""> = {
  [K in keyof T]: T[K] extends string
    ? P extends ""
      ? K & string
      : `${P}.${K & string}`
    : FlattenKeys<T[K], P extends "" ? (K & string) : `${P}.${K & string}`>;
}[keyof T];

export type MessageKey = FlattenKeys<Messages>;

const zh: Messages = {
  lang: {
    zh: "中文",
    en: "EN",
  },
  site: {
    openConsole: "打开控制台",
    tryIt: "体验一下",
    publicKey: "公共 key",
    features: "功能特性",
    highlights: "亮点功能",
    faq: "常见问题",
    docs: "文档",
    tagline: "边缘 CORS 代理",
    console: "控制台",
    terms: "使用条款",
    github: "GitHub",
    githubAria: "在 GitHub 上查看 CORX 源码",
    menu: "菜单",
    ogAlt: "CORX 标识——边缘 CORS 代理",
    copyright: "© {year} CORX",
  },
  terms: {
    title: "使用条款",
    updated: "最后更新 {date}",
    lead:
      "本页适用于 CORX 的公共实例 {origin}：一个以个人项目形式免费提供的尽力而为的服务。使用公共 key 或公共页面，即表示你同意本条款；如不同意，请勿使用。",
    s1Title: "服务说明",
    s1Body:
      "共享 CORS 代理，由单个 Cloudflare Worker 配合小型 D1 数据库与 R2 缓存运行。没有 SLA、没有支持承诺、没有可用性目标：服务可能随时变慢、被限流、变更、暂停或停止，且不另行通知。任何你依赖的东西，都应当自行部署。",
    s2Title: "禁止用途",
    s2Body:
      "钓鱼、恶意软件、勒索软件、欺诈或误导性内容。\n在其可访问地区属于违法的内容，包括儿童性虐待材料。\n垃圾信息、撞库、账号盗用，或对目标站点的自动化滥用。\n拒绝服务攻击、对第三方做压力测试，或任何损害非自有服务的行为。\n违反目标站点自身条款或 robots 指令的抓取与批量提取。\n绕过付费墙、DRM、鉴权或任何访问控制。\n探测、扫描或访问私有、内网与保留网段地址。\n挖矿、大规模镜像文件，或把代理当作存储 / CDN 使用。\n传输凭证或个人数据：公共 key 拒绝转发 Cookie 与 Authorization 头，绕过该限制同样违反本条款。",
    s3Title: "配额与执行",
    s3Body:
      "公共 key 按调用方站点、目标站点以及实例总量三重限制，均为 UTC 自然日，另有每 IP 每分钟限流。超限返回 429 与 Retry-After 头；缓存命中同样计数——配额约束的是请求，而不是上游压力。达到上限或检测到滥用时，我们可能立即限流、轮换或停用公共 key，或封禁主机、来源与 IP，且不另行通知。公共实例没有白名单，也没有申诉流程；有需要请自行部署。",
    s4Title: "数据与隐私",
    s4Body:
      "每个请求都会记录：IP、国家、方法、目标 URL、状态码、延迟、调用方 Origin 以及所用的 key。日志保留 30 天，用于滥用处理与容量规划。\n成功的 GET 响应会写入共享缓存，可能被其他用户读取。请勿通过公共实例传输私有、个人或需要鉴权的数据。\n请勿传输密钥、令牌、Cookie 或个人数据。剥离 Cookie 与 Authorization 是安全网，不是发送它们的许可。\n除记住语言选择外，公共页面不设置任何 Cookie。",
    s5Title: "无担保与责任限制",
    s5Body:
      "服务按“现状”提供，不作任何明示或默示担保，包括适销性、特定用途适用性、可用性、准确性与不侵权。在法律允许的最大范围内，运营者不对因使用或无法使用本服务而产生的任何直接、间接、附带、特殊或后果性损失（包括数据、利润或业务损失）承担责任。",
    s6Title: "变更",
    s6Body:
      "本条款、配额与功能范围可能随时变更；本页版本即为当前版本，变更后继续使用即视为接受。CORX 本身是开源的：如需担保、高级功能以及不与他人共享的配额，请自行部署。",
    s7Title: "滥用举报",
    s7BodyA: "如需举报滥用、违法内容或安全问题，请联系",
    s7BodyB: "，并尽量附上完整的请求 URL。",
    back: "返回 CORX",
  },
  // /compare/<name> 页面。结构与来源、日期在 app/lib/compare.ts，这里只放文案；
  // 两种语言必须键位一致。这是全站最容易被读成营销的页面，规则是：只写来源
  // 里写过的内容，并且大方承认我们输的那一行。
  compare: {
    table: { topic: "对比项", us: "CORX" },
    theirs: "这一项它更好",
    status: {
      accepted: "有意取舍",
      planned: "计划补齐",
      plannedHint: "由跟踪中的 issue 负责",
    },
    link: { site: "官网", docs: "文档" },
    checked: "核查于 {date}",
    wins: { title: "{name} 更好的地方" },
    sources: {
      title: "信息来源",
      note:
        "上表中关于 {name} 的每一个格子都来自其官方文档，并标注了读取日期——点开链接即可自行核对。CORX 一列描述的是本仓库（README.md 与 FEATURES.md）以及同一天的代码。",
      ours: "CORX 一列的来源：",
    },
    cta: "两者都只差一行代码。先在首页用公共 key 试试；流量重要时再自托管。",
    ctaLink: "回到首页",
    demo: "看它跑起来：在首页演示里真实执行一次注入。",
    tester: "在浏览器里测试任意 URL 的 CORS",
    back: "返回首页",
    row: {
      auth: "鉴权模型",
      secrets: "上游密钥",
      scoping: "凭证作用域",
      hosting: "自托管",
      caching: "缓存",
      logging: "请求日志",
      limits: "限额",
      price: "价格",
      setup: "从零到第一个请求",
      extras: "代理之外",
      availability: "可用性",
    },
    us: {
      auth: "支持按 key 鉴权（`X-Api-Key` 或 Bearer）、为已授权来源免密钥访问，或使用托管实例的公共 key；密钥以哈希形式存放在你自己的 D1 中。",
      secrets:
        "上游 header / query 规则存放在 D1（设置 `INJECTION_KEK` 后为 AES-256-GCM 密文），在服务端按白名单主机注入。浏览器始终拿不到密钥值；如果 key 暴露了某个变量，调用方可以按名字引用它（`${NAME}`）——这就是调用方挑选一个自己并不持有的凭证的方式。",
      scoping:
        "两层：规则自带它可生效的 host（`@api.a.com`），而**变量**自带它最多能解析到的 host——第二层同时约束操作方规则与调用方引用，规则一旦可能越界，保存时就 400。调用方只能引用这个 key 暴露出去的变量、且只能发往那些 host；其余一律原样转发，因此「未暴露」与「不存在」无法区分。",
      hosting: "MIT 许可，单个 Cloudflare Worker 配 D1 与 R2，部署到你自己的账号；小规模使用免费套餐即可。",
      caching:
        "R2 GET 缓存，可用 `corx-ttl` / `corx-no-cache` 按请求调整、按 key 封顶；注入请求头的 key 不与他人共享缓存，解析后的响应头规则也是缓存键的一部分。",
      logging:
        "每个请求都写入你自己的 D1：目标、主机、状态码、延迟、调用方 Origin、key、IP、国家。保留窗口由你决定（默认 30 天，`LOG_RETENTION_DAYS`），也可以完全关闭（`LOG_REQUESTS=false`）；按天聚合保留趋势。",
      limits: "按 key 的频率限制与每日配额由你自己设定，或使用公共档位的共享配额；自托管时上限就是你 Cloudflare 套餐的上限。",
      price: "免费、MIT 许可。只为 Worker 的实际用量向 Cloudflare 付费，没有订阅，也不按席位计费。",
      setup: "把 Worker 部署到自己的账号（约十分钟）；或复制托管实例的公共 key，在每日配额内发 GET/HEAD。",
      extras: "只做代理：转发、缓存、注入、日志、响应头规则（为你控制的主机去掉 `X-Frame-Options` / CSP），外加文本重编码（`corx-charset`）、JSON 包装（`corx-wrap`）与公开的 CORS 测试器。不做图片处理、网页抓取/提取或文件转换。",
      availability: "自托管：可用性取决于你自己的 Cloudflare 账号。公共实例是尽力而为，没有 SLA，也没有支持承诺。",
    },
    "corsproxy-io": {
      title: "CORX 对比 corsproxy.io",
      description:
        "CORX 与 corsproxy.io 的诚实对比：鉴权模型、上游密钥注入、自托管、缓存、日志、限额与价格——每条关于对方的结论都附来源与核查日期。",
      lead:
        "两者都是 CORS 代理，都能解开浏览器的跨域限制。区别在于上游凭证怎么处理：corsproxy.io 是注册即用的托管服务，CORX 是你自己部署的 Worker——它的核心能力就是替你保管浏览器永远看不到的上游密钥。",
      wins:
        "如果你的浏览器应用没有需要隐藏的密钥，corsproxy.io 是更省事的选择：不用部署、有免费额度、有支持邮箱，付费档还带可用性承诺，以及图片转换、抓取 API 等附加能力。当你不需要 CORX 的密钥注入时，他们托管方案的运维成本确实更低。",
      // 每个来源到底写了什么，展示在对应链接下方；写成核查记录，尽量贴着原文。
      src: {
        auth: "官网自己的 fetch 示例就带 `?key=YOUR_API_KEY`，FAQ 里「如何获取 API key」的答案是注册一个免费账号。",
        secrets:
          "Header 覆盖走查询参数（`reqHeaders=authorization:Bearer%20TOKEN`），值由调用方提供；官网 FAQ 也建议不要把上游密钥写进浏览器代码。",
        scoping:
          "Header 覆盖以请求参数形式发送，因此给某个目标附带什么由调用方在每次请求时决定——服务端没有任何把凭证绑定到 host 的规则。",
        hosting: "官网与文档没有链接任何仓库、源码下载或自托管入口。",
        caching: "GET/HEAD 默认 TTL 一小时；`ttl=` 覆盖需要 Production 档；缓存按数据中心而非全局。",
        logging: "记录请求 URL、User-Agent、IP、时间戳与请求计数，以及账号邮箱；声明不记录请求体与 header。",
        limits:
          "免费档：每月 1 万次请求 + 1 GB、单文件 1 MB、仅限浏览器请求（不含服务端请求与 Production 功能）。Hobby：25 万次 + 25 GB。Production：请求不限量、单文件 1 GB。",
        price: "免费 / Hobby $5 / Production $29 每月；开源与教育项目可申请免费不限量。",
        setup: "官方给出的路径是：注册账号、复制 key、给 URL 加前缀。不用部署，也不用运维。",
        extras: "套餐里列出图片转换（beta）、header 重写、高级缓存与网页抓取 API。",
        availability: "Hobby 承诺 99.9%、Production 99.99% 的月度可用性；免费档尽力而为，无 SLA。",
      },
      row: {
        auth: "每次调用都要账号 + API key（`?key=…`），免费档也一样；付费档支持域名授权。",
        secrets:
          "没有服务端密钥存储。Header 覆盖是查询参数（`reqHeaders=authorization:Bearer TOKEN`），值由调用方提供——他们自己的 FAQ 也建议不要把上游密钥写进浏览器代码。",
        scoping:
          "调用方发什么、就发往它指定的哪个目标：服务端没有可限定作用域的凭证，也没有按目标绑定的配置。",
        hosting: "闭源，仅托管，没有自托管路径。",
        caching: "边缘缓存，默认 TTL 一小时；`ttl=` 覆盖需要 Production 档；缓存按数据中心而非全局，新地区首次请求仍需回源。",
        logging: "隐私政策列出的记录项：请求 URL、User-Agent、IP、时间戳与请求计数，以及账号邮箱；不记录请求体与 header。",
        limits:
          "免费档：每月 1 万次请求 + 1 GB，单文件 1 MB，仅限浏览器请求。Hobby $5：25 万次 + 25 GB。Production $29：请求不限*，单文件 1 GB。",
        price: "免费档 $0，Hobby $5/月，Production $29/月；开源与教育项目可申请免费不限量。",
        setup: "注册账号、给 URL 加前缀，结束：不用部署，也不用运维任何东西。",
        extras: "付费档提供图片转换（beta）、网页抓取 API、header 重写与文件转换。",
        availability: "Hobby 承诺 99.9%、Production 99.99% 的月度可用性；免费档尽力而为，无 SLA。",
      },
    },
    corsfix: {
      title: "CORX 对比 Corsfix",
      description:
        "CORX 与 Corsfix 的诚实对比：两者都在服务端做密钥注入，也都开源——差别在于数据归属、日志、限额与价格；每条关于对方的结论都附来源与核查日期。",
      lead:
        "Corsfix 是同一量级的对手：和 CORX 一样用服务端密钥变量把上游 API key 挡在浏览器之外，也一样开源、有自托管路径。两边也都允许调用方引用已存储的密钥——他们写 `{{SECRET_NAME}}`，我们写 `${NAME}`——所以差别在边界：他们是 application 级的目标列表，我们是逐变量的 host 作用域，而且后者同样约束操作方自己的规则。其他差异在于东西放在哪里——他们的面板和服务器，还是你自己的 Cloudflare 账号——以及各自的默认行为。",
      wins:
        "Corsfix 赢在一个托管产品应该赢的地方：它完全不记录请求 URL、header 与 body（CORX 默认写入你自己的 D1，窗口可配置、也可关闭），它公布了可用性数据且背后有付费支持，本地开发甚至不需要账号。如果你希望密钥、缓存与日志留在自己的账号里，并且更愿意把钱付给 Cloudflare 而不是订阅制服务，那就选 CORX。",
      src: {
        auth: "生产环境靠在面板添加网站域名来授权；文档把 `x-corsfix-key` 作为备用方案；localhost 无需注册。",
        secrets: "`{{SECRET_NAME}}` 变量可用于查询参数与请求头；密钥静态加密，仅在请求用到时在内存中解密。",
        scoping:
          "每个 application 两个设置：Origin Domains（哪些站点可以用代理）与 Target Domains（可以抓取哪些域名），后者默认 *All domains*；两者都精确匹配，「Corsfix validates requests based on the Origin header and target domain」。",
        hosting:
          "`git clone github.com/corsfix/corsfix`，用 Docker Compose 带起 MongoDB 与 Redis，跑在自己的 VPS 上；文档覆盖日志、升级与域名配置。",
        caching:
          "请求头 `x-corsfix-cache` 接受 `10s`/`10m`/`2h`/`1d`（非法值默认一小时，最长一天）；仅支持 GET，命中缓存的响应不计入套餐吞吐。",
        logging:
          "「我们不记录也不存储访问日志（不记录 URL、header 与 body）」——只保留聚合性能指标；错误诊断信息 30 天后清理；WAF 日志（来源 IP、User-Agent、路径）只在请求触发规则时产生，72 小时内清理。",
        limits:
          "Hobby/Growth/Scale 的吞吐为每 IP 60/120/180 RPM，月出站流量 25/100/500 GB；请求数本身不限。免费档：localhost 60 RPM，生产试用 1 GB + 3 个 web app。",
        price: "Hobby $5、Growth $9、Scale $19 每月，或 lite.corsfix.com 的纯文本 Lite 套餐 $29/年；价格不含增值税。",
        setup: "本地开发什么都不用：不要账号、不要 key，加一个 URL 前缀即可；生产环境则是在面板添加域名并为流量选一个套餐。",
        extras: "JSONP、header 覆盖与全文件类型；另有区域选择、CORS 测试工具与各平台接入指南。",
        availability: "首页声称「基于实时数据 >99.9% 可用性」，背后是付费套餐、支持渠道与 30 天退款。CORX 的托管实例则完全没有 SLA。",
      },
      row: {
        auth: "面板里的域名白名单——浏览器里不放 key；文档给出 `x-corsfix-key` 作为备用；localhost 连注册都不需要。",
        secrets:
          "`{{SECRET_NAME}}` 变量可用于查询参数或请求头，静态加密、按请求在内存中解密。密钥存在他们的面板里，而不是你自己的数据库里。",
        scoping:
          "Origin Domains 与 Target Domains 按 application 设置——Target Domains 默认为 *All domains* 且精确匹配——所以限定凭证去向的是目标列表，而不是 secret 本身。",
        hosting: "同样开源（`github.com/corsfix/corsfix`）：用 Docker Compose 在自己的 VPS 上带起 MongoDB 与 Redis。",
        caching:
          "请求头 `x-corsfix-cache` 指定时长（`10m`、`2h`、`1d`；非法值默认一小时，最长一天）；仅 GET，且命中缓存的响应不计入套餐吞吐。",
        logging:
          "他们的隐私政策：完全不记访问日志——不记 URL、header 与 body。只有聚合性能指标，错误诊断 30 天后清理，WAF 日志（IP、User-Agent、路径）仅针对触发规则的请求。",
        limits:
          "各套餐请求数均不限，但吞吐按 IP 计（60/120/180 RPM），月出站流量也有限额（25/100/500 GB）。免费：localhost 60 RPM，生产试用 1 GB + 3 个 web app。Lite：600 RPM 共享、仅文本、≤1 MB。",
        price: "Hobby $5、Growth $9、Scale $19 每月；纯文本 Lite 代理 $29/年；localhost 与生产试用免费。不含增值税。",
        setup: "本地开发什么都不用——不注册、不用 key，一个前缀就够；生产环境则要在面板加域名，并按流量选套餐。",
        extras: "JSONP、header 覆盖与全文件类型；另有区域选择、CORS 测试工具与平台指南。",
        availability: "公布「>99.9%」的实时可用性数据，背后有付费支持与退款承诺。CORX 的托管实例没有 SLA——它给出的答案是自托管。",
      },
    },
    allorigins: {
      title: "CORX 对比 AllOrigins",
      description:
        "CORX 与 AllOrigins 的诚实对比：鉴权模型、上游密钥注入、自托管、缓存、日志、限额与价格——每条关于对方的结论都附来源与核查日期。",
      lead:
        "AllOrigins 是市面上最简单的 CORS 代理：免费、开源的 Node 服务，只有 `/get` 与 `/raw`，不用 key、不用账号。CORX 解决的是下一个问题：在服务端替你保管浏览器拿不到的上游凭证。",
      wins:
        "AllOrigins 什么都不需要你提供：无账号、无 key、无需部署，一个 URL 就够。如果只是给业余项目抓公开页面，它确实比 CORX 的公共档更省事（后者要先复制 key）；而且它是 MIT 许可的 Node 服务，只要跑得动 Node 就行，不一定非上 Cloudflare。",
      src: {
        auth: "README 只记录 `url`、`charset`、`callback` 三个参数，没有任何 key 或账号相关内容；官网也一样。",
        secrets: "`/get` 与 `/raw` 原样转发收到的请求——托管服务与代码里都没有凭证存储。",
        scoping: "README 与代码完全没有描述凭证处理——请求原样转发，服务端没有可绑定到目标的东西。",
        hosting: "MIT 许可的 Node/Express：`git clone`、`npm install`、`npm start`。仓库最后一次推送为 2023-02-26（经 GitHub API 核查）。",
        caching: "官网与 README 只描述 `charset`、`raw` 与 `callback`——没有缓存控制，也没有 TTL 说明。",
        logging: "仓库依赖 `@logdna/logger`，自托管版本可以把日志写入 LogDNA（Mezmo）。托管实例的保留策略没有任何公开说明。",
        limits: "托管实例没有公布配额、频率限制或公平使用政策。",
        price: "MIT 许可，免费使用与自托管；README 里有给维护者的 PayPal 打赏按钮。",
        setup: "一个 URL，无 key、无账号：`api.allorigins.win/raw?url=…` 就是全部步骤。",
        extras: "除代理之外，记录在案的只有 `charset` 转换与 JSONP `callback`。",
        availability: "社区维护，无公布的 SLA，最后一次推送为 2023-02-26。2026-09-17 当天，我们从本网络对它托管 API 的每次请求都返回 5xx（500/522）。",
      },
      row: {
        auth: "未记录任何鉴权：没有 key、没有账号、没有配额页面，`/get` 与 `/raw` 直接开放。",
        secrets: "无从注入：代理原样转发收到的请求，凭证只能由调用方携带；托管服务与代码里都没有密钥存储。",
        scoping: "没有可限定作用域的凭证模型：转发的请求里带什么由调用方决定，服务端不会把任何东西绑定到目标。",
        hosting: "开源（MIT）Node/Express：`git clone && npm install && npm start`，不需要 Cloudflare 账号，任何 Node 主机都能跑。仓库最后一次推送停在 2023-02-26。",
        caching: "未见说明：README 与官网只描述 `charset`、`raw`、`callback`，没有缓存控制。",
        logging: "托管实例没有日志说明；仓库依赖 `@logdna/logger`，自托管版本配置后可以写入 LogDNA（Mezmo）。",
        limits: "未见说明：没有公布任何每日、每月或每分钟的配额。",
        price: "免费、MIT 许可，README 里有给维护者的 PayPal 打赏按钮。",
        setup: "一个 URL，无 key、无账号：贴上 `api.allorigins.win/raw?url=…` 就完事。",
        extras: "除代理、`charset` 转换与 JSONP `callback` 外没有其他记录在案的能力。",
        availability: "社区维护，没有公布的 SLA，仓库自 2023-02-26 起没有推送。我们 2026-09-17 核查时，托管 API 从我们的网络访问全部返回 5xx。",
      },
    },
  },
  // /docs 页面：给人看的使用手册。与代码绑定的部分（调用形态、corx-*
  // 参数表）在 app/lib/docs.ts；这里只有文案，两个语言必须保持相同的键。
  docs: {
    title: "使用文档",
    back: "返回首页",
    updated: "最后更新 {date}",
    lead:
      "本页是 {origin} 实例的说明书：四种调用方式、全部控制参数、鉴权层级、缓存行为、会遇到的限额，以及背后的安全模型。自托管自己的一份，以仓库里的 README.md 为准。",
    toc: {
      aria: "本页目录",
      call: "调用方式",
      params: "控制参数",
      auth: "鉴权",
      upstream: "上游凭证",
      caching: "缓存",
      limits: "限额与错误",
      security: "安全",
      selfhost: "自托管",
    },
    call: {
      title: "调用代理",
      lead:
        "下面四种写法最终都会走同一条链路：鉴权、SSRF 防护、上游注入、缓存、日志。CORS 预检（`OPTIONS`）在进入代理前就已应答，浏览器的 `fetch` 可以直接用。",
      note:
        "GET 和 HEAD 响应会被缓存并计入配额，其他方法一律直接透传、不缓存。调用方自带的目标会完整保留自己的查询串：目标自己的 `key`、`ttl`、`callback` 参数原样转发，CORX 只消费属于自己的名字。",
      snippets: "fetch、axios、ky 以及 Cloudflare Pages、Vercel、Netlify 的可复制示例，都在代码示例页。",
      tester: "或者用 CORS 测试器直接在浏览器里测试任意 URL。",
      query: {
        title: "查询参数（推荐）",
        desc: "本文档统一使用的写法：目标 URL 经过百分号编码后放进 `?url=`。`/fetch` 和任何其他代理路由都支持。",
      },
      path: {
        title: "路径式",
        desc: "把目标接在 `/proxy/` 之后，便于阅读，也能直接粘进浏览器；目标自己的查询串在第一个 `?` 之后完整保留。",
      },
      bare: {
        title: "裸路径",
        desc: "与 `/proxy/` 相同，只是少一段：任何不是 CORX 页面、又看起来像 URL 的路径都会走代理。",
      },
      subdomain: {
        title: "子域名模式",
        desc: "部署绑定了泛解析域名时，每个目标可以拥有自己的主机名：点变连字符、连字符翻倍（`api.example.com` → `api-example-com.<zone>`）。该请求的查询串就是目标的查询串，因此 `corx-*` 名字会被剔除。",
      },
    },
    params: {
      title: "corx-* 命名空间",
      lead:
        "`corx-*` 是 CORX 的命名空间：这些参数由代理消费，绝不会转发给目标。其余参数都归目标所有，原样转发。表中没有的 `corx-*` 名字会直接 400，而不会被悄悄转发。",
      col: { param: "参数", effect: "作用" },
      note:
        "子域名和路径式调用里，代理请求的查询串同时也是目标的查询串，因此 `corx-*` 名字会被剔除。如果目标确实需要一个叫 `corx-*` 的参数，请改用 `?url=`。",
    },
    param: {
      ttl:
        "本次 GET 响应的缓存 TTL（秒）。会被部署上限（以及公共 key 自身的 TTL）压低，避免调用方把条目钉死一整天。",
      noCache:
        "本次请求跳过 R2 缓存：直接回源、返回，且不写入缓存。Range 请求、JSONP 和携带凭证的请求本来就会绕过缓存。",
      key: "本次请求使用的 API key，等价于 `X-Api-Key` 或 `Authorization: Bearer`。公共档位不能控制缓存。",
      callback:
        "JSONP：当 CSP 拦住 `fetch` 时，把 `application/json` 响应包成 `fn(<json>);`（上限 2 MiB）供 `<script>` 使用。JSONP 永不缓存。",
      charset:
        "用指定编码重新解码文本、JSON 或 XML 响应，并以 UTF-8 重新输出——上游把编码标错时的救命参数。未知编码名返回 400。",
      wrap:
        "把文本响应包成 `{\"contents\":\"…\"}`（`application/json`），让 HTML 也能用 `r.json()`。二进制响应会直接 400；包装方式属于缓存键的一部分。",
      scheme: "子域名模式：目标协议。默认 `https`，另一个可选值是 `http`。",
      port: "子域名模式：目标端口（1–65535），若不是该协议的默认端口（http 为 80、https 为 443）则拼接在主机名之后。",
    },
    auth: {
      title: "鉴权",
      lead: "三种进入方式，大致就是自托管部署逐步启用的顺序。",
      formsNote: "三种形式完全等价，用你手头客户端支持的那种即可。CORX 认证所用的凭证绝不会转发到上游：`corx_` 形态的 `X-Api-Key` 或 `Authorization: Bearer corx_…` 一律被消费，即使 key 无效也不例外。`X-Api-Key` 里的其他值则是你自己的上游凭证（BYOK），原样转发——请同时用 `Authorization: Bearer corx_…` 或 `?corx-key=` 携带 CORX key（`corx_` 形态的 `X-Api-Key` 优先）。",
      key: {
        title: "API key（按调用方）",
        body:
          "在控制台创建的 key 形如 `corx_<随机串>`，库里只存 SHA-256 哈希，原始值只展示一次。它可以携带允许来源、每分钟频率限制、缓存 TTL、免密钥授权、允许主机、SSRF 检查开关和上游注入。用下面任意一种形式发送即可。",
      },
      keyless: {
        title: "免密钥来源授权",
        body:
          "给 key 开启免密钥（keyless）后，其允许来源的浏览器调用代理时完全无需携带 key。授权按 `Origin` 匹配（同源 GET 时回退到 `Referer` 的来源），并按访客 IP 计量，因此单个嵌入站点无法耗尽整个 key。允许来源在保存时会规范化（主机小写、省略默认端口），唯一的通配形式是 loopback 端口——`http://localhost:*` 覆盖 localhost 的所有端口，随机端口的开发服务器只需一条。主机通配（`https://*.example.com`）和正则会被拒绝。来源是便利措施而非凭证——脚本可以伪造——请配合允许主机和频率限制使用。",
      },
      public: {
        title: "公共档位",
        body:
          "托管实例可能在落地页公开一个共享 key，它是刻意削减过的：仅 GET/HEAD、按调用站点／目标站点／整个实例的每日配额、不能控制缓存、不能注入、不支持子域名模式；转发前会剥掉 `Cookie` 和 `Authorization`。适合公开数据、演示和原型。",
      },
      where: {
        title: "key 该放在哪，绝不能放在哪",
        body:
          "只能放在服务端。出现在浏览器打包产物、公开仓库或页面源码里的 key，就等于已经泄露；需要从浏览器调用代理的站点应该使用免密钥来源授权（如果数据确实是公开的，就用公共 key）。无论如何，都不要让凭证或个人数据经过共享实例。",
      },
    },
    upstream: {
      title: "上游凭证",
      lead:
        "一个 key 可以保管应用需要的上游 API 凭证并在服务端注入：浏览器拿不到凭证值。规则按目标 host 决定发什么、发到哪；如果你把某个变量暴露出去，调用方自己也可以在请求里引用它。",
      ways: {
        title: "凭证是怎么附上去的",
        body:
          "变量（`NAME=value`）保存值，header 规则与 query 规则引用它们。`@host` 行给它下面的规则限定作用域，因此一个 key 可以为每个上游携带不同的凭证——包括最常见的形态：同一个 header 名在不同 host 上用不同的值（两个厂商都用 `Authorization`）。header 规则用于设置或删除请求头（`Authorization: Bearer ${VENDOR_KEY}`、`!X-Debug`）；query 规则对应 URL 参数（`api_key = ${VENDOR_KEY}`），适用于用参数鉴权的 API。规则始终覆盖调用方发来的内容，浏览器无法伪造注入的 header；用哪条规则由目标 host 决定，而不是由调用方决定。",
      },
      client: {
        title: "允许调用方引用变量",
        body:
          "暴露是逐变量的——API 上是 `client: true`，控制台是 **客户端可引用变量** 字段——并在其中写明允许调用方把它发往哪些 host。调用方随后在自己请求的 header 或 query 里写 `${VENDOR_KEY}`，代理在转发前替换。调用方只知道它自己写的名字，永远拿不到值；你没有暴露的变量对它完全不可见。",
      },
      scoping: {
        title: "两层作用域，且两层都必须允许该 host",
        body:
          "规则的 `@hosts` 决定*这条规则*在哪里生效；变量自己的 hosts 决定*这个变量*最多能解析到哪里。后者约束前者：任何可能把被作用域限制的变量解析到别的 host 的规则，保存时就会被拒绝——包括 key 级规则，因为它能覆盖所有允许主机。两处的 pattern 语法一致：精确 host、`*.suffix`（标签边界）或 `*`；`*.vendor.com` 覆盖 `api.vendor.com`，而两者都不覆盖 `vendor.com` 本身。客户端引用按每一次重定向跳求值，所以作用域只到某个 host 的变量，在跳到别的 host 之后不会解析。",
      },
      order: {
        title: "顺序，以及不匹配时会发生什么",
        body:
          "转发时先解析调用方引用，再施加该 key 的规则（先 remove 后 set）。因此规则永远赢得过调用方——`!X-Debug` 会删掉它，`set` 会覆盖它——浏览器无法伪造注入的 header。代理不解析的内容（未知名字、私有变量、作用域外的 host）一律原样转发。这既保证功能是纯增量的（没有暴露任何变量的 key 行为与从前完全一致），也让「未暴露」和「不存在」表现一致，调用方无法探测 key 里有什么。代理自己拥有的 header——`corx_` 形态的 `X-Api-Key`、`X-Admin-Token` 以及 hop-by-hop 那一组——在处理任何引用之前就被丢弃；非 `corx_` 形态的 `X-Api-Key`（包括 `${VAR}` 引用）是调用方自己的上游凭证，会原样转发。所以需要这两个名字的厂商（如 Anthropic 的 `x-api-key`）两条路都通：可信服务端 BYOK 直通，或浏览器永不持有密钥时的规则注入。",
      },
      example: {
        title: "一个 key，对接三个上游",
        body:
          "控制台的 key 页面把变量做成逐行编辑（每行带“客户端”开关与主机作用域），旁边是 Header / Query / Response 规则字段和允许主机字段；Admin API 对应 `vars`（每个变量可带 `client` 与 `hosts`）、`headerRules`、`paramRules`、`responseRules`、`allowedHosts`。",
        varsLabel: "变量（Variables）",
        clientVarsLabel: "客户端可引用变量（Client-referencable variables）",
        rulesLabel: "Header 规则（Header rules）",
        hostsLabel: "允许目标主机（配置注入时必填）",
        note:
          "每条 `@host` 都必须落在允许主机列表内，而只要配置了注入，该列表就是必填的——这道守卫防止调用方把你的凭证指向它自己选的 host。不在列表内的规则永远不会被附加。",
      },
      matrix: {
        title: "调用方的引用最终变成什么",
        lead:
          "以上面的配置为例：`VENDOR_KEY` 只对 `api.vendor.com` 暴露，`PRIVATE_KEY` 未暴露，并且有一条针对 `api.vendor.com` 设置 `Authorization` 的 header 规则。",
        sent: "调用方发送",
        host: "目标 host",
        received: "上游收到",
        inScope: "已暴露，且该 host 在变量作用域内 → 解析。",
        outOfScope: "在 key 的白名单内，但在变量作用域之外 → 原样保留。",
        privateVar: "未对调用方暴露 → 原样保留。",
        unknown: "不存在该变量 → 原样保留，与私有变量表现一致。",
        ruleWins: "规则随后生效 → 以规则值为准，覆盖调用方的引用。",
      },
      uses: {
        title: "用途",
        body:
          "最常见的是同一个前端调用多个服务——一家厂商的 LLM、另外几家的支付或地图 API——各自一个 key，页面里没有任何密钥。它同样适用于用查询参数而非 header 鉴权的 API，以及同一上游在不同环境用不同 key 的情况（每个环境一个 key，或用变量保存该部署的值）。配合客户端引用，页面甚至可以在多个凭证之间选择用哪一个，而始终不持有任何一个——这是浏览器端应用对接多家厂商后需要的模式。",
      },
      keys: {
        title: "一个 key 还是多个",
        body:
          "以上做法把所有上游放进同一个 key，也就意味着它们共享一份允许主机并集、一份频率限制和一份允许来源列表，以及一个需要轮换的密钥库。当你需要各自独立的限额或来源、希望泄漏时只波及一家厂商、或同一个 host 的不同路径需要不同凭证（规则按 host 而不是按路径限定作用域）时，就拆成每个上游一个 key。免密钥访问只给一个来源授权一个 key，所以不带 key 调用多个上游的页面，拿到的就是那一个 key 的规则——而你暴露出的那些变量，它也可以引用。",
      },
      rails: {
        title: "缓存与安全",
        body:
          "设置 `INJECTION_KEK` 后密钥静态加密，在所有读取路径（控制台、日志、playground 预览）都以掩码显示，请求日志记录的是注入前的 URL。带 header 规则的 key 完全不读写 R2 缓存，因为它的响应与 key 相关；只用 query 参数注入的 key 仍然缓存，按生效后的 URL 作为缓存键。而只要 key 里有任何客户端可引用变量，就完全不使用共享缓存：引用由调用方提供，且重定向可能在后续跳才解析，因此经这个 key 的任何响应都无法证明不含密钥。公共档位完全不能注入——它只支持 GET/HEAD——所以上游凭证意味着自托管实例加 standard key。被暴露的变量等同于「谁能调用这个 key，谁就能引用它」，请谨慎放开。",
      },
    },
    caching: {
      title: "缓存",
      lead:
        "GET 响应会缓存在 R2 并从边缘返回，重复请求通常根本到不了上游。每个响应上的 `X-Corx-Cache: HIT|MISS` 会告诉你走了哪条路。",
      hitTitle: "缓存标记",
      hit:
        "调试时最该盯的就是 `X-Corx-Cache`：`MISS` 表示响应来自上游（并已写入缓存），`HIT` 表示由 R2 直接返回。`X-Corx-Target` 给出上游主机名，`X-Corx-Latency-Ms` 是代理消耗的时间。",
      ttlTitle: "TTL",
      ttl:
        "默认使用部署的 TTL，除非用 `?corx-ttl=` 调低或调高（不超过上限）。key 也可以设定自己的默认 TTL，或设成 `0` 表示永不写入；公共档位完全不能设置 TTL。",
      bypassTitle: "哪些请求绕过缓存",
      bypass:
        "以下情况一定绕过共享缓存：非 GET/HEAD 方法、携带 `Authorization` 或 `Cookie`、`?corx-no-cache=1`、JSONP（`corx-callback`）、Range 请求，以及会注入上游请求头的 key。带响应头规则的 key 仍然会缓存——其解析后的规则属于缓存键的一部分，改写过的响应绝不会返回给另一个 key。",
    },
    limits: {
      title: "限额与错误",
      lead: "有两层彼此独立的限制在保护实例：按 key（匿名时按 IP）的每分钟频率限制，以及公共档位的每日配额。",
      rate:
        "每分钟限制按 key 计数，匿名调用按 IP 计数。命中缓存的请求同样计入；底层 D1 故障时这些检查会放行（fail open），以免代理整体不可用。",
      quota:
        "公共 key 的每日计数按调用站点、目标站点和整个实例三个维度，以 UTC 自然日为单位。命中缓存也计入——配额算的是请求数，不是上游压力。`X-Corx-Quota-{Origin,Host,Day}-{Limit,Remaining}` 会报告你的剩余额度。",
      response:
        "触碰任一限制时，代理返回 `429`，JSON body 形如 `{ error, scope, limit, resetAt }`，并带 `Retry-After`——距离窗口或 UTC 零点重置的秒数。普通响应也会带 `X-RateLimit-Limit` 和 `X-RateLimit-Remaining`。所有面向机器的路径（代理、`/api/*`、`/health`）出错都是 JSON `{ error }`；浏览器页面则是带品牌的 HTML 错误文档。",
    },
    security: {
      title: "安全",
      lead:
        "CORX 是 CORS 代理，因此本质上就是中间人：运行实例的人可以读取、修改并重放经过它的所有内容。下面的防护只能限制不可信调用方能碰到什么，并不能让共享实例变得适合承载机密。",
      ssrf:
        "SSRF 防护：私有、链路本地、CGNAT、组播和保留网段的 IP 字面量会被拦截；主机名会通过 DoH 解析并复核，防止重绑定到内网；D1 黑名单按域名及其子域生效。可信的 key 可以关掉 IP/主机名检查和 DNS 检查，但黑名单与 Cloudflare 自身的规则永远不会被绕过。",
      headers:
        "请求头卫生：逐跳头和代理自有头（`Host`、`Connection`、`X-Forwarded-For`、`CF-*` 等）在进出两个方向都会被剥掉，`Set-Cookie` 不会转发，公共档位在转发前剥离 `Cookie` 和 `Authorization`。",
      visibility:
        "代理能看到什么：目标 URL、请求与响应体，以及调用方的 IP、`Origin` 与国家/地区。托管实例会记录请求并汇总成每日聚合；自托管可以自行决定是否记录、保留多久（`LOG_REQUESTS`、`LOG_RETENTION_DAYS`）。",
      trust:
        "所以运行 CORX 最诚实的方式就是自托管：一个 MIT 许可的 Worker，放在你自己掌控的账号里。托管实例只是共享的尽力而为演示——在把流量交给它之前，请先读一读使用条款和信任模型。",
      termsLink: "使用条款",
      trustLink: "信任模型",
    },
    selfhost: {
      title: "自托管",
      lead:
        "本页上的每一项限制——配额、频率、保留时长、允许主机——在自托管之后都是你自己 Worker 上的设置。README 覆盖了约十分钟的部署流程（D1 + R2 + `wrangler deploy`）；CONTRIBUTING.md 写明了本地开发和改动必须通过的检查。",
      readme: "部署指南",
      contributing: "贡献指南",
    },
  },
  // /snippets 页面：给真正在写代码的人用的可复制片段。片段代码在
  // app/lib/snippets.ts；这里只有文案，两个语言必须保持相同的键。
  snippets: {
    title: "框架与平台代码示例",
    back: "返回首页",
    updated: "最后更新 {date}",
    lead:
      "把同一个端点写进你真正在写的代码：`fetch`、axios、ky，浏览器安全模式（免密钥授权、服务端路由），以及 Cloudflare Pages、Vercel、Netlify 各自怎么接。本页所有示例都以 {origin} 为基址——换成你自己的部署地址，规则不变。",
    toc: {
      aria: "本页目录",
      libraries: "客户端库",
      browser: "浏览器代码",
      server: "服务端路由",
      risk: "密钥安全",
      platforms: "部署平台",
      public: "公共档位",
    },
    group: {
      libraries: {
        title: "客户端库",
        lead: "代理就是一个 URL 前缀，任何 HTTP 客户端都能用；下面是最常用的三个。三个示例都跑在服务端——那才是 key 该在的地方；浏览器里请改用下面的免密钥写法。",
      },
      browser: {
        title: "浏览器代码——不携带任何凭证",
        lead: "打进浏览器包的 key 等于已经公开。下面这些模式才是安全的：用服务端 key 做来源授权、完全不需要凭证的流式读取，以及把 key 挡在构建产物之外的环境变量规则。",
      },
      server: {
        title: "在服务端持有 key 的路由",
        lead: "浏览器需要私有数据时，先问自己的后端，后端再去问 CORX。这就是 BFF 模式，对下面所有平台都是同一段代码。",
      },
    },
    block: {
      fetch: {
        title: "fetch（Node、Bun、Deno）",
        desc: "一次请求、一个请求头。在服务端，key 是环境变量，而不是构建期常量。",
      },
      axios: { title: "axios", desc: "目标放进 `params`，axios 会替你完成 URL 编码。" },
      ky: { title: "ky", desc: "基于 fetch 的轻量 Promise 客户端；`.json()` 直接解析响应。" },
      keyless: {
        title: "免密钥来源授权",
        desc: "在控制台把页面的来源授权给某个 key，浏览器调用代理时完全不用携带凭证。计量按访客 IP 计，因此单个嵌入站点不会耗尽 key。",
      },
      stream: {
        title: "流式读取响应（SSE / LLM）",
        desc: "`res.body` 是实时流：按块读取，token 生成即到达，而不是等最后一个 token 才返回。代理对 `text/event-stream` 不做缓冲，因此免密钥授权也能用。LLM 对话接口是 `POST` 且需要服务端持有密钥——见下面的服务端路由。",
      },
      viteEnv: {
        title: "Vite / React 环境变量",
        desc: "只有 `VITE_*` 是公开的——这恰好决定了什么能放进去。Next.js 的 `NEXT_PUBLIC_*`、SvelteKit 的 `PUBLIC_*` 只是换了名字的同一条规则。",
      },
      serverRoute: {
        title: "Next.js route handler（任何服务端都能改）",
        desc: "把 key 只放进服务端的 `CORX_KEY`。响应是流式透传的，大文件不会被缓冲两次。",
      },
    },
    risk: {
      title: "key 绝不能放在哪",
      body: "浏览器包、`VITE_*` / `NEXT_PUBLIC_*` 变量、公开仓库、页面源码、移动 App 二进制——任何访客能读到的地方。泄露的 key 会以你的身份消耗配额，并触达它允许的每一个主机和来源。浏览器代码只有两条路：免密钥授权，或走你自己的服务端。",
      docs: "鉴权细节",
    },
    platforms: {
      title: "部署平台",
      lead: "CORX 只是一个普通 HTTPS 端点，所有平台的调用方式完全一样；区别只有密钥放在哪。",
      pages: "Cloudflare Pages——Pages Function（`functions/api/corx.ts`）从 `context.env.CORX_KEY` 读取 key，用 `npx wrangler pages secret put CORX_KEY` 写入。Pages 和自托管 CORX 在同一个账号里；如果 key 的来源授权覆盖了站点，浏览器也可以直接调用 Worker。",
      vercel: "Vercel——Serverless/Edge Function（或上面的 Next.js 路由）从 Project → Environment Variables 读取 `process.env.CORX_KEY`。绝不要放进 `NEXT_PUBLIC_*`：那些值会被内联进浏览器包。",
      netlify: "Netlify——Function 从 Site configuration → Environment variables 读取 key。不需要适配器或插件：就是对 URL 的一次 `fetch`。",
    },
    public: {
      title: "什么时候公共档位就够了",
      body: "托管实例在落地页公开的共享 key 就是为这类场景准备的：公开数据、演示、原型。它仅支持 GET/HEAD，有每日配额，不能控制 TTL、不能注入，且使用共享缓存——因为它在设计上就是公开的，内联到页面里没有问题。任何私有、带凭证或对配额敏感的需求，都请用自己的部署和自己的 key。",
      landing: "获取公共 key",
      selfhost: "如何自托管",
    },
  },
  // /tools/cors-tester 页面：浏览器侧的诊断。探测结论与代码片段在
  // app/lib/cors-check.ts；这里只有文案。
  corsTester: {
    title: "CORS 测试器",
    back: "返回首页",
    lead:
      "粘贴一个 URL，看看你的浏览器实际会怎样处理它：跨域 `fetch` 能否成功；如果不能，是 CORS 握手的哪一环缺失。随后工具会把同一个 URL 跑过这个 CORX 实例，并给出可以直接粘贴的调用。",
    invalid: {
      empty: "请先粘贴一个 URL。",
      invalid: "这不像是一个合法的 URL。",
      scheme: "只能测试 http 和 https 的 URL。",
      self: "这是本站自己的来源——同源请求说明不了 CORS。",
    },
    result: {
      allowOrigin: "Access-Control-Allow-Origin: {value}",
      allowCredentials: "Access-Control-Allow-Credentials: {value}",
      none: "未发送",
    },
    probe: {
      title: "浏览器的报告",
      cors: "跨域 fetch",
      opaque: "不透明探测（mode: no-cors）",
      credentials: "携带凭证",
      preflight: "预检请求",
      pass: "完成",
      fail: "被拦截",
      skip: "未执行",
    },
    finding: {
      ok: {
        title: "CORS 已经可用",
        body:
          "浏览器能读到这个响应，因此 CORS 层面不需要代理。（代理仍然可以帮助你做边缘缓存、隐藏上游凭证或限制调用方——但问题不在 CORS。）",
      },
      "missing-allow-origin": {
        title: "响应里没有给本站的 `Access-Control-Allow-Origin`",
        body:
          "服务器确实有响应——不透明探测完成了——但浏览器拒绝把响应交给本页面。该 header 要么缺失，要么写的是别的来源。这正是代理能修复的：它在回程补上这个 header。",
      },
      unreachable: {
        title: "请求根本没有完成",
        body:
          "连不可读的探测都失败了，说明没有任何响应：检查主机名、端口、网络，或者页面 CSP（`connect-src`）是否拦截了该来源。目标本身不响应的话，代理也无能为力。",
      },
      "mixed-content": {
        title: "被混合内容拦截",
        body:
          "本页是 https、目标是 http，浏览器在发送前就拒绝了。请改用目标的 https 端点，或者通过 CORX 获取——代理地址是 https。",
      },
      credentials: {
        title: "携带凭证的请求被拒绝",
        body:
          '普通 fetch 成功，但同样的请求带上 `credentials: "include"` 就失败了。通常意味着 `Access-Control-Allow-Origin: *`——浏览器不允许通配符与凭证共存：目标必须精确列出你的来源并返回 `Access-Control-Allow-Credentials: true`。自托管的 CORX 可以转发凭证；公共档位会剥离它们。',
      },
      preflight: {
        title: "预检失败",
        body:
          "简单 GET 能过，但带自定义请求头的请求过不了——问题出在 OPTIONS 预检（`Access-Control-Allow-Headers`/`-Methods` 没有覆盖它）。走代理之后请求变成同源，就没有预检可失败了。",
      },
      framing: {
        title: "该文档拒绝被嵌入",
        body:
          "经过代理后响应仍然带着 `X-Frame-Options` 或 CSP `frame-ancestors`，因此无法放进 `<iframe>`。对于你自己控制的主机，自托管的 key 可以按主机剥掉这些 header——iframe 请自行加 sandbox。",
      },
    },
    proxied: {
      title: "同一个 URL 走 CORX",
      note: "本实例返回了 {status}。预览如下，具体调用在下面。",
      failed: "代理请求失败：{error}——复制下面的调用，到你的代码运行的地方再试一次。",
    },
    fix: {
      title: "可以粘贴的调用",
      lead: "三种形式是同一个请求。浏览器形式只在公共 key（或已授权来源）下安全；私有 key 只能放在服务端。",
      proxyUrl: "代理 URL",
      browser: "浏览器（fetch）",
      server: "服务端（fetch，带 key）",
    },
    island: {
      urlAria: "要测试的 URL",
      urlPh: "https://api.example.com/data",
      run: "测试",
      running: "测试中…",
      note: "探测在你的浏览器里执行。代理请求会经过本实例——受其条款、配额与日志约束，请不要在这里粘贴私有 URL。",
    },
    how: {
      title: "测试怎么做的",
      body:
        "浏览器最多会用三种方式抓取该 URL：普通跨域请求、携带凭证的同一请求，以及一个带自定义请求头、会触发预检的请求。普通请求被拦截时，还会补一次不透明的 `no-cors` 探测——它读不到内容，但能完成就说明服务器有响应，从而把「缺 CORS header」与「主机不可达」区分开。浏览器刻意不告诉页面请求为何被拦截，所以结论是从这些探测推断出来的，而不是从错误里读出来的。",
    },
    frames: {
      title: "嵌入是另一个问题",
      body:
        "CORS 决定 `fetch` 能否读取响应；页面能否放进 `<iframe>` 由目标的 `X-Frame-Options` 与 CSP `frame-ancestors` 决定，CORX 默认不会剥掉它们。自托管的 key 可以为某个你控制的主机去掉。",
      link: "嵌入做法",
    },
    docs: {
      auth: "鉴权细节",
      snippets: "框架代码示例",
    },
    more: { title: "延伸阅读" },
  },
  landing: {
    title: "CORX — 免费开源的 Cloudflare CORS 代理",
    meta: {
      description:
        "免费开源的边缘 CORS 代理：公共 key 无需注册，或自托管 MIT 许可的 Worker，自定配额、私有日志与密钥注入。",
    },
    hero: {
      h1a: "抓取任意 URL，",
      h1b: "告别 CORS。",
      sub: "CORX 是一个边缘 CORS 代理。给任意 URL 加个前缀即可跨域抓取——响应缓存在边缘、有限流保护、内置 SSRF 防护，上游密钥永不离开服务端。",
      prefix: "一个前缀：",
      noDeploy: "不想部署？直接使用公共 key",
      tryLive: "在线体验",
      openConsole: "打开控制台",
      trustNote: "别把机密交给代理——包括这一个。CORX 开源、免费，可以自己部署。",
      trustCta: "了解信任模型",
    },
    publicKey: {
      title: "无需部署，直接使用",
      sub:
        "用这个公共 key 就能在自己的站点上免费使用：仅跨域 GET/HEAD、有每日配额、尽力而为。上游注入、缓存控制、子域模式和按 key 配置需要自行部署。",
      keyLabel: "公共 key",
      usageLabel: "用法",
      copyNoteA: "使用该 key 即表示你接受",
      copyNoteB: "——禁止钓鱼、恶意软件、垃圾信息、违法或滥用流量，并且绝不要通过它传输凭证。",
      termsLink: "使用条款",
      limitsTitle: "每日配额（UTC）",
      limitOrigin: "每个调用站点",
      limitHost: "每个目标站点",
      limitTotal: "整个实例",
      perDay: "{n}/天",
      unavailable: "本实例未配置公共 key。",
    },
    tryit: {
      title: "在线体验",
      sub: "示例每 10 秒轮换，直接通过代理加载。输入任意 URL 即可接管。",
      hint: "等价于 GET {origin}/fetch?url=…。每个请求都经过边缘代理——观察状态码、延迟、体积和缓存 HIT/MISS 徽标随示例实时更新。",
      snippets: "在用 React、Vue、axios 或 ky？这里有可复制的代码示例",
      tester: "测试某个 URL 的 CORS",
    },
    highlights: {
      title: "为真实应用而建，而非玩具演示",
      sub: "这些细节让密钥、浏览器调用方与调试都尽在掌控。",
      injection: {
        title: "密钥留在边缘",
        desc: "给密钥绑定变量与请求头/查询参数规则，CORX 在转发时注入，并按目标主机限定作用域——同一个 key 可给每家厂商各带一套凭证。你选择暴露的变量还能被页面以 `${NAME}` 引用，而值从不进入浏览器；变量值在控制台和日志中始终打码。",
      },
      keyless: {
        title: "浏览器免密钥访问",
        desc: "把一个来源授权给某个密钥，其访客无需携带密钥即可调用代理。授权按来源隔离、按访客 IP 计量，并写入审计日志。",
      },
      playground: {
        title: "每一步都可检视",
        desc: "在控制台演练场把请求跑过真实链路——鉴权、SSRF 防护、注入、缓存——并查看完整响应与打码后的注入预览。",
      },
      console: {
        title: "不只是接口，还有控制台",
        desc: "多数自托管代理只给你一个 URL 就结束了。CORX 把围绕它的产品也一并给你：中英双语仪表盘（用量与周期对比趋势）、按 key 的策略、请求日志、主机黑名单，以及跑真实链路的演练场。",
      },
    },
    trust: {
      title: "你总得信任某一方——不如自己选",
      sub: "CORS 代理本质上就是中间人：谁运行它，谁就能读取、修改并重放经过它的每一个请求和响应。CORX 不掩饰这一点——它被设计成让“能信任它吗？”的诚实答案不是“能”，而是“你不需要信任”。",
      hosted: {
        title: "托管实例——免费、公开、尽力而为",
        desc: "公共档位的共享演示：无需注册、每日配额、可随时撤销。适合公开数据、演示和原型——不要用于机密、凭证或隐私数据。公共档位会剥离 Cookie 与 Authorization、从共享缓存返回，并保留 30 天日志；这些只是降低暴露面，不是保证。",
      },
      self: {
        title: "自己部署——免费、私密",
        desc: "一个 MIT 许可的 Cloudflare Worker，配 D1 + R2。用免费额度部署到你自己的账号，整条数据链路就都在你手里：你的密钥、你的日志、你的限额，中间没有第三方。读源码、fork、随意改——这正是它的意义。",
        cta: "获取源码",
        deploy: "部署到 Cloudflare",
        deployHint: "一键完成：Cloudflare 会把仓库克隆到你的 GitHub，在你的账号里创建 D1 与 R2，并直接部署——免费套餐即可。",
      },
      note: "我们不收账号费、席位费或账单。在信任重要的场合，自托管才是运行 CORX 的预期方式。",
    },
    features: {
      title: "边缘所需，一应俱全",
      simple: {
        title: "设计简洁",
        desc: "一个 URL 前缀即可从任意源站使用——无需 SDK、无需配置、无需特殊请求头。",
      },
      cached: {
        title: "边缘缓存",
        desc: "响应缓存在 R2 并从边缘返回，支持 TTL 控制、无缓存逃生通道和每密钥策略。",
      },
      ssrf: {
        title: "SSRF 防护",
        desc: "私有网段、DNS 重绑定和 D1 黑名单都在边缘拦截——可信调用方可按密钥关闭单项检查。",
      },
      keys: {
        title: "API 密钥",
        desc: "每个密钥独立配置允许来源、频率限制、缓存 TTL 与免密钥授权——一键吊销。",
      },
      analytics: {
        title: "用量分析",
        desc: "在控制台内按小时查看请求数、流量、延迟与错误率图表。",
      },
      subdomain: {
        title: "子域名模式",
        desc: "让每个目标拥有独立域名：example.com 变成 example-com.your.host。",
      },
      streaming: {
        title: "流式媒体",
        desc: "大文件、Range 请求与 SSE（LLM 对话接口）直接流式透传——视频、音频拖动进度条即可播放，token 也是生成即到达。",
      },
      console: {
        title: "双控制台",
        desc: "用中文或英文管理密钥、查看日志、发起请求——演练场完全复刻真实链路。",
      },
      selfHosted: {
        title: "自托管",
        desc: "部署在你自己的 Cloudflare 账号上，使用 D1 + R2——没有我们的账号、席位或账单。",
      },
    },
    cta: {
      title: "60 秒发出你的第一个代理请求",
      sub: "进入控制台，拿到 API 密钥，开始抓取。",
      btn: "打开控制台",
    },
    // 同一批文案同时生成 FAQPage JSON-LD（见 app/routes/_landing.tsx），
    // 因此答案引擎引用到的内容与人类看到的一致。每条答案都写完整：
    // 它可能被单独摘录，不带着问题一起出现。
    faq: {
      title: "常见问题",
      sub: "在让一个代理承接生产流量之前，它得先回答这些问题。",
      q1: "CORX 是什么？",
      a1: "CORX 是一个运行在 Cloudflare 边缘的开源 CORS 代理。把任意 URL 拼在 /fetch?url= 之后，响应就会带着 CORS 头返回，浏览器代码因此能读取那些没有设置 CORS 的 API——并且自带 R2 边缘缓存、频率限制与 SSRF 防护。",
      q2: "怎么调用？",
      a2: "四种等价写法：/fetch?url=<编码后的 URL>、/proxy/<url>、/<url>（路径式），以及子域名模式——api.example.com 变成 api-example-com.<你的域名>。GET 和 HEAD 会被缓存，其他方法一律直接透传。",
      q3: "需要 API 密钥吗？",
      a3: "用本托管实例不需要：在页面复制公共 key，在每日配额内向 GET/HEAD 请求即可。自建部署可以用按调用方区分的密钥、为已授权来源开启免密钥访问，或者干脆不鉴权、靠自己的网络隔离。",
      q4: "可以传递 Cookie、token 或个人信息吗？",
      a4: "公共 key 不行：它会在转发前剥掉 Cookie 和 Authorization，响应可能来自共享缓存，请求日志保留 30 天。私有或带鉴权的流量请放在你自己的部署上。",
      q5: "触发限额会怎样？",
      a5: "会返回 429 和 Retry-After 头。限额按调用站点、目标站点、整个实例以及每分钟分别计算，命中缓存的请求也计入——配额算的是请求数，而不是上游压力。",
      q6: "可以自托管吗？",
      a6: "可以。CORX 是 MIT 许可的 TypeScript 项目，运行在 Cloudflare Workers + D1 + R2 上：部署到你自己的账号，配额、限额和日志都归你所有。仓库 README 覆盖了完整部署流程。",
      q7: "可以把流量托付给托管实例吗？",
      a7: "只适合你愿意交给陌生人的数据。代理能看到——也能修改——经过它的所有内容，而托管实例的运营方就是那个陌生人。公开数据、演示和原型可以用公共 key；一旦流量重要，就自托管 CORX，那时链路上唯一的运营方就是你自己。",
      q8: "CORX 带管理控制台吗？",
      a8: "带。它是一个中英双语控制台：用量仪表盘与周期对比趋势、按 key 的策略（频率限制、允许来源、缓存 TTL、免密钥授权、上游注入、公共档位配额）、请求日志、主机黑名单，以及跑真实链路的演练场。多数自托管代理只是一个 fetch 接口，而这里是围绕它的一整套产品，全部包含在同一个 Worker 中。",
      q9: "CORX 免费吗？",
      a9: "免费，而且两边都免费。托管实例提供公共 key、无需注册——仅限 GET/HEAD，有每日配额，尽力而为。自托管同样免费：CORX 是 MIT 许可，跑在 Cloudflare 免费套餐上；额度不够时你付给 Cloudflare（$5/月的 Workers Paid），而不是付给我们。没有付费档、没有席位费、没有订阅。",
      // 对比页除搜索之外的唯一入口：给「它和 X 有什么不同」一个有日期的回答，而不是推销。
      compare: "想和其他托管代理对比？",
    },
    agents: {
      title: "为 agent 而写",
      sub: "本站点通过 llms.txt 自我描述：编码 agent 一次抓取即可获得调用方式、鉴权层级、缓存策略与限额，无需通读整个站点。",
      indexDesc: "索引：CORX 是什么、如何调用、接下来看哪里。",
      fullDesc: "完整参考：调用形态、配额、安全模型与自托管。",
      promptLabel: "或者把这段粘贴给你的 agent",
      prompt: "读取 {origin}/llms-full.txt，然后用 {origin}/fetch?url=<url> 跨域抓取 URL。",
      more: "同样按当前主机名生成：",
    },
  },
  notfound: {
    title: "404 — 页面不存在 · CORX",
    h1: "404 — 页面不存在",
    sub: "找不到你要访问的页面。它可能已被移动、重命名，或从未存在过。",
    takeHome: "返回首页",
    openConsole: "打开控制台",
    noMatch: "CORX 没有匹配 {path} 的路由",
  },
  errorpage: {
    title: "{code} — 服务器错误 · CORX",
    h1: "{code} — 出错了",
    sub: "这次请求在我们这边意外失败了，不是你的问题——返回后再试一次即可。",
    backConsole: "返回控制台",
    consoleTitle: "服务器错误",
    ref: "参考信息：{code} · {path} · {time}",
  },
  console: {
    nav: {
      overview: "概览",
      keys: "API 密钥",
      playground: "演练场",
      logs: "日志",
      blocked: "黑名单",
    },
    title: {
      overview: "概览",
      keys: "API 密钥",
      playground: "演练场",
      logs: "日志",
      blocked: "黑名单",
      profile: "个人资料",
      login: "登录",
    },
    sidebar: {
      collapse: "收起侧边栏",
    },
    topbar: {
      openSidebar: "打开侧边栏",
      profile: "个人资料",
      logout: "退出登录",
      logoutTitle: "退出登录？",
      logoutBody: "会话 cookie 会被清除；如果控制台前面配置了 Cloudflare Access，也会一并退出 Access。",
      account: "账户",
      session: "会话",
    },
    csrf: {
      failed: "表单校验失败——CSRF 令牌缺失或无效。请刷新控制台页面后重试。",
    },
    overview: {
      last24hTitle: "最近 24 小时",
      requests: "请求数",
      trafficOut: "出站流量",
      servedFromCache: "缓存命中（{hits}）",
      trafficIn: "入站流量",
      avgLatency: "平均延迟（最大 {max} ms）",
      errorRate: "错误率（{n}）",
      apiKeys: "API 密钥",
      blockedHosts: "拦截主机",
      perHour: "每小时请求数",
      topHosts: "热门主机",
      topKeys: "按流量排名的 API 密钥",
      breakdown: "分布明细",
      recentErrors: "最近错误",
      host: "主机",
      key: "密钥",
      requestsRight: "请求数",
      traffic: "流量",
      time: "时间",
      method: "方法",
      status: "状态",
      error: "错误",
      noData: "暂无数据",
      none: "没有 🎉",
      anonymous: "匿名",
    },
    trend: {
      title: "趋势",
      days: "{n} 天",
      hint: "当前 {days} 天与上一周期对比。来源与密钥按 UTC 自然日去重后求和，因此同一调用方每天各计一次。",
      previous: "上期 {n}",
      origins: "独立来源",
      keys: "使用中的密钥",
      requests: "请求数",
      errors: "错误数",
      new: "新增",
      flat: "0%",
      daily: "每日请求数（{days} 天 vs {days} 天）",
    },
    keys: {
      newKey: "新密钥已创建——请立即复制，之后不再显示。",
      createFailed: "创建密钥失败",
      saveFailed: "保存密钥失败",
      deleteFailed: "删除密钥失败",
      deleteMismatch: "名称与“{name}”不一致——密钥未被删除。",
      name: "名称",
      ratePerMin: "频率 / 分钟",
      allowedOrigins: "允许来源",
      cacheTtl: "缓存 TTL（秒）",
      noCache: "无缓存",
      noCacheShort: "跳过 R2 缓存",
      create: "创建密钥",
      edit: "编辑",
      createTitle: "创建 API 密钥",
      createdTitle: "密钥已创建",
      continueInjection: "继续配置注入",
      policy: "策略",
      save: "保存",
      saving: "保存中…",
      badgeRevoked: "已吊销",
      showRevoked: "显示已吊销（{n}）",
      hideRevoked: "隐藏已吊销",
      revoke: "吊销密钥",
      revokeFailed: "吊销密钥失败",
      revokeMismatch: "名称与“{name}”不一致——密钥未被吊销。",
      revokeTitle: "吊销 API 密钥？",
      revokeHint: "吊销立即生效：使用该密钥的请求会立刻失败。记录会保留以便追溯日志。请输入 {name} 以确认。",
      revokedHint: "该密钥已吊销——不再用于鉴权。如需移除记录，请删除。",
      view: "查看",
      checks: "安全检查",
      advanced: "高级策略",
      presets: "预设",
      presetLocal: "本地开发",
      presetPublic: "公共档位",
      rateDefault: "留空 = {value}/分钟",
      originsDefault: "留空 = 全局（{value}）",
      cacheDefault: "留空 = 全局 {ttl}s（公共档位 {publicTtl}s）",
      ipCheck: "IP 检测",
      ipCheckHint: "拦截私有/保留 IP 字面量与内网主机名。",
      dnsCheck: "DNS 检查",
      dnsCheckHint: "通过 DoH 解析主机，拦截指向非公网 IP 的域名。",
      keyless: "免密钥访问",
      keylessHint: "上面的允许来源无需携带密钥即可使用该密钥。loopback 端口通配（http://localhost:*）覆盖该主机的所有端口。Origin 只是便利手段，不是凭证——非浏览器客户端可以伪造它。",
      publicTier: "公共档位",
      publicTierHint:
        "面向本站访客的共享 key：仅 GET/HEAD、不支持缓存控制、不支持子域模式、不转发凭证，并受下方每日配额约束。可以放心分发。",
      dailyLimits:
        "每日配额（UTC 自然日）。留空 = 不限制；但总量必填——它是把本实例控制在 Cloudflare 额度内的那道闸。",
      dailyLimitPerOrigin: "每来源站点/天",
      dailyLimitPerHost: "每目标站点/天",
      dailyLimitTotal: "总量/天（必填）",
      dailyLimitPh: "如 3000",
      badgePublic: "公共",
      allowedHosts: "允许的目标主机",
      allowedHostsPh: "api.vendor.com, *.vendor.com——逗号或空格分隔；配置注入时必填",
      injection: "上游注入",
      injectionHint: "变量会在转发时注入到 Header / Query。每行一条规则；@hosts 为下方规则限定作用域，!Name 表示删除，${var} 插入变量。同一个 header 可以在不同 host 下各设一次（@host1 / @host2），因此一个 key 能为每个上游各带一套凭证。",
      injectionHostsHint: "至少需要一个允许的目标主机（在“高级策略”中）——否则变量和规则会被拒绝保存。",
      injectionLink: "注入",
      logsLink: "日志",
      playgroundLink: "调试台",
      filterPh: "按名称、主机或来源筛选",
      filter: "筛选",
      filterClear: "清除",
      emptyMatch: "没有匹配该筛选的密钥",
      headLastUsed: "最近使用",
      lastUsedHint: "“最近使用”来自原始日志（保留 {days} 天）——短横线表示该窗口内没有请求，不代表从未使用。",
      back: "返回密钥列表",
      varsHint: "每个变量一行。值留空表示保持已存储的密钥；“客户端”表示允许调用方自行发送 `${NAME}`（仅限所列主机）；清空名称即移除该变量。",
      varName: "名称",
      varNamePh: "VENDOR_KEY",
      varValue: "值",
      varValuePh: "留空 = 保持",
      varClient: "客户端",
      varClientHint: "允许调用方自行发送 `${NAME}`——仅限所列主机。",
      varHosts: "主机",
      varHostsPh: "留空 = 任意允许主机",
      addVar: "+ 添加变量",
      removeVar: "移除",
      preview: "预览",
      previewHint: "已保存配置下，上游对示例请求实际收到的内容——密钥值以 *** 遮蔽。",
      previewVars: "变量",
      previewSample: "示例请求",
      previewUpstream: "上游收到",
      previewHeaders: "请求头",
      previewNone: "无",
      previewEmpty: "暂无可预览内容——请先添加变量或规则。",
      saveInjection: "保存注入配置",
      vars: "变量",
      headerRules: "Header 规则",
      headerRulesPh: "Authorization: Bearer ${UPSTREAM_TOKEN}",
      paramRules: "Query 规则",
      paramRulesPh: "api_key = ${UPSTREAM_TOKEN}",
      responseRules: "响应头规则",
      responseRulesPh: "!X-Frame-Options\n!Content-Security-Policy",
      responseRulesHint:
        "作用于调用方收到的响应，不发给上游。语法相同：Name: value 设置，!Name 删除，@hosts 限定作用域，${var} 插入变量。可用于嵌入页面（去掉 X-Frame-Options / CSP frame-ancestors）——iframe 请自行加 sandbox；重发他人文档的风险由你承担。",
      danger: "危险操作",
      dangerHint: "删除不可撤销——使用该密钥的请求会立即开始失败。",
      delete: "删除密钥",
      deleteTitle: "删除 API 密钥？",
      deleteHint: "这会永久删除该密钥。请输入 {name} 以确认。",
      deleteConfirm: "密钥名称",
      namePh: "my-app",
      ratePh: "120（留空 = 默认）",
      originsPh: "* 或 https://app.example、http://localhost:*（留空 = 全局）",
      ttlPh: "留空 = 全局",
      cacheTtlTitle: "TTL 秒数（留空 = 全局，0 = 从不存储）",
      noCacheTitle: "该密钥完全跳过 R2 缓存",
      noCacheValue: "no-cache",
      ttlValue: "TTL {ttl}s",
      global: "全局",
      default: "默认",
      headName: "名称",
      headRate: "频率/分钟",
      headOrigins: "允许来源",
      headCache: "缓存",
      headCreated: "创建时间",
      empty: "还没有密钥",
      badgeKeyless: "免密钥",
      badgeInject: "注入 {n}",
      hint: "使用该密钥的请求，其允许来源会覆盖全局的 {code}。浏览器在 {opt} 预检中不会发送 API 密钥——如需按密钥预检，请通过 {query} 传递密钥。",
      hintInjection: "注入：配置了变量或规则的密钥必须声明允许的目标主机，且带有 Header 规则的请求不会使用共享缓存。免密钥请求按来源 + IP 单独限流。",
    },
    playground: {
      sub: "在真实代理流水线上组合请求——方法、请求头、请求体、鉴权、缓存与 SSRF 防护全部生效。每次运行都会像真实调用一样写入日志。",
      request: "请求",
      response: "响应",
      run: "运行",
      running: "运行中…",
      url: "目标 URL",
      urlPh: "https://api.example.com/data",
      method: "方法",
      route: "路由风格",
      routeFetch: "/fetch?url=（查询参数）",
      routeProxy: "/proxy/（路径）",
      routeRaw: "/（裸路径）",
      routeSubdomain: "子域名（模拟）",
      auth: "鉴权与客户端",
      key: "API 密钥",
      keyNone: "匿名（不带密钥）",
      keyRaw: "粘贴原始密钥",
      keyRawPh: "corx_…（仅发送到本 Worker，不会存储）",
      origin: "Origin",
      originPh: "https://app.example（可选）",
      clientIp: "客户端 IP",
      clientIpPh: "203.0.113.7（可选）",
      headers: "请求头",
      headerName: "名称",
      headerValue: "值",
      addHeader: "添加请求头",
      removeHeader: "删除请求头",
      body: "请求体",
      bodyPh: '{"hello":"world"}',
      bodyHint: "原样发送——上游需要时请自行添加 Content-Type 请求头。",
      cache: "缓存",
      ttl: "TTL（秒）",
      ttlPh: "留空 = 默认",
      noCache: "no-cache",
      presetsHint: "预设只填充表单——点击“运行”才会发出请求。",
      empty: "运行一次请求即可查看原始响应——状态、响应头、响应体、缓存与密钥决策。",
      tabPreview: "预览",
      tabBody: "响应体",
      tabHeaders: "响应头",
      tabRequest: "实际请求",
      pretty: "格式化 JSON",
      truncated: "已在 {n} 处截断——代理仍在继续流式传输，日志会记录其余部分。",
      binary: "二进制响应体（base64 预览）",
      copyBody: "复制响应体",
      copyCurl: "复制为 cURL",
      copied: "已复制",
      rerun: "再次运行",
      failed: "请求失败",
      injection: "注入预览",
      injectionHint: "密钥值已打码——这里展示该密钥在出站时实际附加的内容。",
      ignored: "被编排器丢弃（fetch 禁止）：{list}",
      history: "历史记录",
      historyEmpty: "暂无运行记录",
      clear: "清空",
      historyHint: "点击某一行可载回表单。",
      presetCache: "缓存 MISS→HIT（运行两次）",
      presetSsrf: "SSRF 字面量拦截",
      presetMetadata: "元数据 IP 拦截",
      presetPreflight: "CORS 预检",
      presetRange: "Range 请求",
      presetEcho: "POST 回显",
    },
    logs: {
      title: "请求日志",
      window: "时间窗口",
      keyFilter: "密钥：{name}",
      keyFilterClear: "清除",
      refresh: "刷新",
      truncated: "仅显示该时间窗口内最新的 {n} 条——缩小时间窗口可查看更早的记录。",
      headTime: "时间",
      headMethod: "方法",
      headHost: "主机",
      headStatus: "状态",
      headLatency: "延迟",
      headCc: "CC",
      headVia: "身份",
      headCaller: "调用方",
      headCache: "缓存",
      headSize: "体积",
      headError: "错误",
      empty: "暂无日志",
      hit: "命中",
      miss: "未命中",
      viaKey: "密钥",
      viaOrigin: "免密",
      viaAnon: "匿名",
    },
    blocked: {
      title: "主机黑名单",
      sub: "在内置私网段防护之上，额外添加的 SSRF 拦截规则。拦截某个域名会同时覆盖其子域名。",
      hostname: "主机名",
      reason: "原因",
      hostnamePh: "evil.example",
      reasonPh: "滥用",
      block: "加入黑名单",
      remove: "移除",
      removeTitle: "从黑名单移除？",
      removeBody: "移除后，指向 {host} 的请求将重新允许通过代理访问。",
      headHostname: "主机名",
      headReason: "原因",
      headAdded: "添加时间",
      empty: "空",
    },
    profile: {
      viaAccess: "通过 Cloudflare Access 登录",
      viaToken: "通过管理员令牌登录",
      email: "邮箱",
      authMethod: "认证方式",
      hint: "控制台访问由部署时的 Access 策略或 {code} 控制。账号相关修改（邮箱、权限）发生在上游身份提供商，而不是这里。",
    },
    login: {
      consoleTitle: "CORX 控制台",
      detected: "检测到 Access 身份：",
      unknown: "未知",
      continueAccess: "使用 Cloudflare 继续",
      noAccess: "此请求未检测到 Cloudflare Access 会话。生产环境中，请在管理主机前配置 Access 应用——届时此按钮即可登录。",
      accessTitle: "需在 Cloudflare Access 之后使用",
      or: "或",
      tokenHint: "无 Access 的本地开发：粘贴 {code}。",
      adminToken: "管理员令牌",
      signIn: "登录",
      errAccess: "该请求没有有效的 Cloudflare Access 身份。",
      errToken: "令牌无效。",
      errMisconfig: "服务器配置错误：未设置 SESSION_SECRET（或 ADMIN_TOKEN）。",
      verifying: "登录时验证中",
    },
  },
  corsDemo: {
    urlAria: "要代理的 URL",
    urlPh: "https://api.example.com/…",
    go: "Go",
    error: "错误",
    cache: "缓存 {value}",
    truncated: "…（已截断）",
    requestFailed: "请求失败：{err}",
    waiting: "等待第一个请求……",
    autoRotating: "示例每 10 秒自动轮换",
    manualMode: "手动模式——输入 URL 并按 Go",
    pause: "暂停",
    resume: "继续",
    tabPreview: "预览",
    tabRaw: "原始",
    tabHeaders: "响应头",
    // 注入演示（app/lib/demo.ts）：按钮在演示框底部，说明解释这次请求，
    // 徽标标出由 CORX 注入的那个 header。
    injectBtn: "看一次密钥注入",
    injectNote:
      "一次请求，两个凭证：浏览器只带了公开的演示 key，`{header}` 是 CORX 在请求离开边缘前从自己的加密存储中取出并注入的。echo 上游证明它确实到达——浏览器从未持有这个值。（这个值是假的，存在的意义只是让机制可见。）",
    injectBadge: "由 CORX 注入",
  },
  /** Shared response-viewer copy (landing demo + console playground). */
  preview: {
    openRaw: "打开原始链接",
    imageAlt: "代理返回的图片",
    mediaHint: "通过代理流式返回——点播放即可（Range 请求会被转发）。",
    frameHint: "沙箱预览 · 已禁用脚本",
    frameBlocked: "该站点禁止被嵌入（{reason}）",
    frameBlockHint: "这个响应头是目标站点自己的点击劫持防护。自托管部署可以为你控制的主机去掉它——iframe 请自行加 sandbox：",
    frameBlockDoc: "嵌入做法",
    binary: "二进制响应体 · {type} · {bytes}",
    array: "数组",
    object: "对象",
  },
  statsTabs: {
    aria: "分布明细",
    byStatus: "按状态",
    byMethod: "按方法",
    byCountry: "按国家",
    noData: "暂无数据",
  },
  copy: {
    copy: "复制",
    copied: "已复制",
  },
  ui: {
    cancel: "取消",
    close: "关闭",
  },
  time: {
    now: "刚刚",
    minutes: "{n} 分钟前",
    hours: "{n} 小时前",
    days: "{n} 天前",
  },
};

/** Walk a dot-path through a dictionary, returning undefined on any miss. */
function getPath(dict: object, key: string): unknown {
  let cur: unknown = dict;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Lookup a message (with optional {var} interpolation), en as fallback. */
export function lookup<L extends Locale>(locale: L, key: MessageKey, vars?: Record<string, string | number>): string {
  const found = getPath(locale === "zh" ? zh : en, key);
  const fallback = getPath(en, key);
  const raw = typeof found === "string" ? found : typeof fallback === "string" ? fallback : key; // never throw
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m: string, k: string) => (k in vars ? String(vars[k]) : m));
}

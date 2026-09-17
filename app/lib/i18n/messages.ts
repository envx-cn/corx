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
    updated: "Last updated 2026-09-14",
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
    back: "Back to home",
    row: {
      auth: "Auth model",
      secrets: "Upstream secrets",
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
        "Header and query rules live in D1 — AES-256-GCM ciphertext when `INJECTION_KEK` is set — and are applied server-side, only on the hosts the key allows. The browser never receives the value.",
      hosting:
        "MIT, one Cloudflare Worker with D1 and R2, deployed to your own account; the free plan covers small deployments.",
      caching:
        "R2 GET cache, adjusted per request with `corx-ttl` / `corx-no-cache`, capped per key, and never shared by keys that inject headers.",
      logging:
        "Every request lands in your D1 — target, host, status, latency, caller origin, key, IP, country. Raw rows are pruned after 30 days; the daily aggregate stays.",
      limits:
        "Your own per-key rate limits and daily quotas, or the shared public tier's. Self-hosted, the ceiling is your Cloudflare plan.",
      price: "Free and MIT-licensed. You pay Cloudflare for what the Worker serves; there is no subscription and no seat count.",
      setup:
        "Deploy a Worker to your own account (about ten minutes), or copy a hosted instance's public key and send GET/HEAD inside its daily quota.",
      extras: "Proxying only: fetch, cache, inject, log. No image transforms, scraping or file conversion.",
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
        "Corsfix is the fair fight: like CORX it keeps upstream API keys out of the browser with server-side secret variables, and like CORX it is open source with a self-hosting path. What differs is where everything lives — their dashboard and servers, or your own Cloudflare account — and what each one defaults to.",
      wins:
        "Corsfix wins where a managed product should: it logs no request URLs, headers or bodies at all (CORX keeps 30 days of request logs in your own D1), it publishes an availability figure with paid support behind it, and localhost needs no account whatsoever. Pick CORX when the secrets, the cache and the log rows should sit in your own account, and when paying Cloudflare suits you better than a subscription.",
      src: {
        auth: "Production traffic is authorised by adding your website's domain in the dashboard; `x-corsfix-key` is documented as a fallback, and localhost needs no registration.",
        secrets:
          "`{{SECRET_NAME}}` variables can be used in query parameters and request headers; secrets are encrypted at rest and decrypted in memory only when a request uses them.",
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
          "JSONP, request/response header overrides and every file type are CORX features too; region selection, a CORS tester and the platform integration guides are theirs.",
        availability:
          "The homepage claims \">99.9% availability, based on live data\", backed by paid plans, support and 30-day refunds. CORX's hosted instance carries no SLA at all.",
      },
      row: {
        auth: "Dashboard domain whitelist — no key in the browser — with `x-corsfix-key` as a documented fallback; localhost needs no registration at all.",
        secrets:
          "`{{SECRET_NAME}}` variables in query parameters or request headers, encrypted at rest and decrypted in memory per request. Managed from their dashboard, not from your own database.",
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
          "JSONP, header overrides and all file types — CORX has those too. Region selection, a CORS tester and platform guides are theirs; nothing here changes the model.",
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
  landing: {
    title: "CORX — CORS proxy on Cloudflare",
    meta: {
      description:
        "CORX is an edge CORS proxy on Cloudflare: fetch any URL cross-origin with R2 caching, upstream secret injection, keyless browser access and SSRF guards.",
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
    },
    highlights: {
      title: "Built for real apps, not toy demos",
      sub: "The details that keep secrets, browser callers and debugging under control.",
      injection: {
        title: "Secrets stay on the edge",
        desc: "Attach variables and header/query rules to a key; CORX injects them upstream. The browser never holds the token, and values are masked in the console and logs.",
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
        desc: "Large files and Range requests stream straight through — seeking in video and audio just works.",
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
      editTitle: "Edit key",
      save: "Save",
      checks: "Safety checks",
      ipCheck: "IP check",
      ipCheckHint: "Block private/reserved IP literals and internal hostnames.",
      dnsCheck: "DNS check",
      dnsCheckHint: "Resolve the host via DoH and block names that point at a non-public IP.",
      keyless: "Keyless access",
      keylessHint: "The allowed origins above can use this key without sending it. Origin is a convenience, not a credential — non-browser clients can forge it.",
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
      allowedHostsPh: "api.vendor.com, *.vendor.com (required for injection)",
      injection: "Upstream injection",
      injectionHint: "Variables are injected into headers/params on the way out. One rule per line; @hosts scopes the lines below, !Name removes, ${var} inserts a variable.",
      vars: "Variables",
      varsPh: "UPSTREAM_TOKEN=sk-live-… (blank = keep the stored value)",
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
      originsPh: "* or https://app.example (blank = global)",
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
    updated: "最后更新 2026-09-14",
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
    back: "返回首页",
    row: {
      auth: "鉴权模型",
      secrets: "上游密钥",
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
        "上游 header / query 规则存放在 D1（设置 `INJECTION_KEK` 后为 AES-256-GCM 密文），在服务端按白名单主机注入。浏览器始终拿不到密钥值。",
      hosting: "MIT 许可，单个 Cloudflare Worker 配 D1 与 R2，部署到你自己的账号；小规模使用免费套餐即可。",
      caching:
        "R2 GET 缓存，可用 `corx-ttl` / `corx-no-cache` 按请求调整，按 key 封顶；带 header 注入规则的 key 不与他人共享缓存。",
      logging:
        "每个请求都写入你自己的 D1：目标、主机、状态码、延迟、调用方 Origin、key、IP、国家。原始日志 30 天后清理，按天聚合长期保留。",
      limits: "按 key 的频率限制与每日配额由你自己设定，或使用公共档位的共享配额；自托管时上限就是你 Cloudflare 套餐的上限。",
      price: "免费、MIT 许可。只为 Worker 的实际用量向 Cloudflare 付费，没有订阅，也不按席位计费。",
      setup: "把 Worker 部署到自己的账号（约十分钟）；或复制托管实例的公共 key，在每日配额内发 GET/HEAD。",
      extras: "只做代理：抓取、缓存、注入、记日志。不做图片转换、抓取提取或文件转换。",
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
        "Corsfix 是同一量级的对手：和 CORX 一样用服务端密钥变量把上游 API key 挡在浏览器之外，也一样开源、有自托管路径。不同的是东西放在哪里——他们的面板和服务器，还是你自己的 Cloudflare 账号——以及各自的默认行为。",
      wins:
        "Corsfix 赢在一个托管产品应该赢的地方：它完全不记录请求 URL、header 与 body（CORX 会在你自己的 D1 里保留 30 天请求日志），它公布了可用性数据且背后有付费支持，本地开发甚至不需要账号。如果你希望密钥、缓存与日志留在自己的账号里，并且更愿意把钱付给 Cloudflare 而不是订阅制服务，那就选 CORX。",
      src: {
        auth: "生产环境靠在面板添加网站域名来授权；文档把 `x-corsfix-key` 作为备用方案；localhost 无需注册。",
        secrets: "`{{SECRET_NAME}}` 变量可用于查询参数与请求头；密钥静态加密，仅在请求用到时在内存中解密。",
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
        extras: "JSONP、header 覆盖与全文件类型 CORX 也有；区域选择、CORS 测试工具与各平台接入指南是他们的。",
        availability: "首页声称「基于实时数据 >99.9% 可用性」，背后是付费套餐、支持渠道与 30 天退款。CORX 的托管实例则完全没有 SLA。",
      },
      row: {
        auth: "面板里的域名白名单——浏览器里不放 key；文档给出 `x-corsfix-key` 作为备用；localhost 连注册都不需要。",
        secrets:
          "`{{SECRET_NAME}}` 变量可用于查询参数或请求头，静态加密、按请求在内存中解密。密钥存在他们的面板里，而不是你自己的数据库里。",
        hosting: "同样开源（`github.com/corsfix/corsfix`）：用 Docker Compose 在自己的 VPS 上带起 MongoDB 与 Redis。",
        caching:
          "请求头 `x-corsfix-cache` 指定时长（`10m`、`2h`、`1d`；非法值默认一小时，最长一天）；仅 GET，且命中缓存的响应不计入套餐吞吐。",
        logging:
          "他们的隐私政策：完全不记访问日志——不记 URL、header 与 body。只有聚合性能指标，错误诊断 30 天后清理，WAF 日志（IP、User-Agent、路径）仅针对触发规则的请求。",
        limits:
          "各套餐请求数均不限，但吞吐按 IP 计（60/120/180 RPM），月出站流量也有限额（25/100/500 GB）。免费：localhost 60 RPM，生产试用 1 GB + 3 个 web app。Lite：600 RPM 共享、仅文本、≤1 MB。",
        price: "Hobby $5、Growth $9、Scale $19 每月；纯文本 Lite 代理 $29/年；localhost 与生产试用免费。不含增值税。",
        setup: "本地开发什么都不用——不注册、不用 key，一个前缀就够；生产环境则要在面板加域名，并按流量选套餐。",
        extras: "JSONP、header 覆盖与全文件类型 CORX 也有；区域选择、CORS 测试工具与平台指南是他们的，不影响产品模型。",
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
  landing: {
    title: "CORX — Cloudflare 上的 CORS 代理",
    meta: {
      description:
        "CORX 是运行在 Cloudflare 上的边缘 CORS 代理：给任意 URL 加前缀即可跨域抓取，支持 R2 缓存、上游密钥注入、浏览器免密钥访问与 SSRF 防护。",
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
    },
    highlights: {
      title: "为真实应用而建，而非玩具演示",
      sub: "这些细节让密钥、浏览器调用方与调试都尽在掌控。",
      injection: {
        title: "密钥留在边缘",
        desc: "给密钥绑定变量与请求头/查询参数规则，CORX 会在转发时注入——浏览器拿不到 token，变量值在控制台和日志中始终打码。",
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
        desc: "大文件与 Range 请求直接流式透传——视频、音频拖动进度条即可播放。",
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
      editTitle: "编辑密钥",
      save: "保存",
      checks: "安全检查",
      ipCheck: "IP 检测",
      ipCheckHint: "拦截私有/保留 IP 字面量与内网主机名。",
      dnsCheck: "DNS 检查",
      dnsCheckHint: "通过 DoH 解析主机，拦截指向非公网 IP 的域名。",
      keyless: "免密钥访问",
      keylessHint: "上面的允许来源无需携带密钥即可使用该密钥。Origin 只是便利手段，不是凭证——非浏览器客户端可以伪造它。",
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
      allowedHostsPh: "api.vendor.com, *.vendor.com（配置注入时必填）",
      injection: "上游注入",
      injectionHint: "变量会在转发时注入到 Header / Query。每行一条规则；@hosts 为下方规则限定作用域，!Name 表示删除，${var} 插入变量。",
      vars: "变量",
      varsPh: "UPSTREAM_TOKEN=sk-live-…（留空 = 保持已有值）",
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
      originsPh: "* 或 https://app.example（留空 = 全局）",
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

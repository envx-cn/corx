/**
 * SEO + GEO (generative-engine optimisation) helpers.
 *
 * Pure functions only — no JSX, no request context — so the landing page, the
 * terms page and the crawler files all derive their URLs, structured data and
 * prose from one place, and so they can be unit-tested without a Worker.
 *
 * Three audiences, deliberately served differently:
 *
 *  - Classic crawlers   → canonical + hreflang in <head>, sitemap.xml, robots.txt
 *  - Social previews    → Open Graph / Twitter meta + the 1200×630 card
 *  - Answer engines/LLMs → JSON-LD (@graph), llms.txt, llms-full.txt, and FAQ
 *    copy that exists as *visible* text on the page (never schema-only markup)
 *
 * Everything is origin-parameterised: a self-hosted copy advertises its own
 * hostname, never corx.dev or one deployment's URL. Facts live in
 * `site-info.ts`; only *prose that must match the rendered page* is passed in.
 */
import { ABUSE_EMAIL, CONTENT_UPDATED, GITHUB_URL, LICENSE, REPO_DOCS } from "./site-info.js";
import type { Locale } from "./i18n/locale.js";

/** Open Graph locales (og:locale wants `lang_TERRITORY`, unlike hreflang). */
export const OG_LOCALE: Record<Locale, string> = { en: "en_US", zh: "zh_CN" };

/**
 * The social card (`public/og.png`), regenerated with `npm run og`. One card
 * for every page and both locales: it is brand + tagline, not page-specific, so
 * there is nothing to translate.
 */
export const OG_IMAGE = { path: "/og.png", width: 1200, height: 630 } as const;

/** One question/answer pair, already localised by the caller. */
export type Faq = { q: string; a: string };

/** Absolute URL for a site-relative path. `path` is always a leading-slash form. */
export function absUrl(origin: string, path: string): string {
  return `${origin}${path}`;
}

/**
 * The hreflang cluster for the landing page: the two explicit language URLs
 * plus `x-default` (the auto-detecting root, which is what an unknown-language
 * searcher should land on).
 */
export function landingAlternates(origin: string): Array<{ hreflang: string; href: string }> {
  return [
    { hreflang: "en", href: absUrl(origin, "/en") },
    { hreflang: "zh", href: absUrl(origin, "/zh") },
    { hreflang: "x-default", href: absUrl(origin, "/") },
  ];
}

/**
 * Serialise a JSON-LD document for a <script type="application/ld+json"> tag.
 * `<` is escaped so a `</script>` inside any string can't close the tag early
 * (the escaping is valid JSON and parsed back unchanged).
 */
export function jsonLd(nodes: unknown[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes }).replace(/</g, "\\u003c");
}

/**
 * The landing page's structured data.
 *
 * Kept in one `@graph` so the nodes can reference each other by `@id` instead
 * of repeating the project's identity: WebSite (the document), Organization
 * (who runs it), SoftwareApplication (what it is, and where the code lives) and
 * FAQPage (the visible FAQ section — same strings, so markup and page can't
 * drift).
 */
export function landingJsonLd(opts: {
  origin: string;
  locale: Locale;
  description: string;
  /** Visible FAQ pairs, in page order. */
  faq: Faq[];
  /** Feature names shown in the page's feature grid. */
  features: string[];
}): unknown[] {
  const { origin, locale } = opts;
  const root = absUrl(origin, "/");
  const website = `${root}#website`;
  const org = `${root}#organization`;
  const app = `${root}#software`;
  return [
    {
      "@type": "WebSite",
      "@id": website,
      url: root,
      // The brand, not the page title: the title describes a *document*, and
      // the site node is the thing every page in the graph hangs off.
      name: "CORX",
      // Kept lowercase on purpose: it is the spelling people actually type.
      alternateName: "corx",
      description: opts.description,
      inLanguage: locale,
      publisher: { "@id": org },
      about: { "@id": app },
    },
    {
      "@type": "Organization",
      "@id": org,
      name: "CORX",
      url: root,
      logo: { "@type": "ImageObject", url: absUrl(origin, "/favicon.svg") },
      sameAs: [GITHUB_URL],
    },
    {
      "@type": "SoftwareApplication",
      "@id": app,
      name: "CORX",
      alternateName: "corx",
      url: root,
      description: opts.description,
      applicationCategory: "DeveloperApplication",
      applicationSubCategory: "CORS proxy",
      operatingSystem: "Cloudflare Workers",
      programmingLanguage: "TypeScript",
      inLanguage: locale,
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: LICENSE.url,
      codeRepository: GITHUB_URL,
      softwareHelp: REPO_DOCS.readme,
      featureList: opts.features,
      publisher: { "@id": org },
    },
    {
      "@type": "FAQPage",
      "@id": `${root}#faq`,
      inLanguage: locale,
      isPartOf: { "@id": website },
      mainEntity: opts.faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    },
  ];
}

/** The terms document's structured data: a dated WebPage, not a product page. */
export function termsJsonLd(opts: {
  origin: string;
  locale: Locale;
  title: string;
  description: string;
}): unknown[] {
  return [
    {
      "@type": "WebPage",
      "@id": `${absUrl(opts.origin, "/terms")}#webpage`,
      url: absUrl(opts.origin, "/terms"),
      name: opts.title,
      description: opts.description,
      inLanguage: opts.locale,
      dateModified: CONTENT_UPDATED,
      isPartOf: { "@id": `${absUrl(opts.origin, "/")}#website` },
      publisher: { "@id": `${absUrl(opts.origin, "/")}#organization` },
    },
  ];
}

// --- Crawler files ---------------------------------------------------------

/**
 * Paths crawlers must stay out of: the proxy itself (a machine surface, not
 * content — and an open proxy indexed under our hostname is exactly the SEO
 * pollution this file exists to prevent), the admin console and its API.
 */
const DISALLOW = ["/console", "/api", "/fetch", "/proxy", "/health"] as const;

/**
 * Answer engines allowed on purpose. `User-agent: *` already covers them, but
 * naming them makes the intent auditable — this project *wants* to be read and
 * cited, so a future "block the AI crawlers" edit has to argue with this list.
 * The list is a courtesy sample, not an allow-list: unknown agents fall under
 * `*` and get the same rules.
 */
const AI_AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
] as const;

/** `User-agent: X` + the shared rules. Longer Allow beats the `/` rule; the
    Disallow entries beat it too, because robots.txt matches the longest path. */
function robotsGroup(agent: string): string {
  return [`User-agent: ${agent}`, "Allow: /", ...DISALLOW.map((p) => `Disallow: ${p}`)].join("\n");
}

/** robots.txt for one origin: public pages open, machine surfaces closed. */
export function robotsTxt(origin: string): string {
  return [
    `# CORX — ${origin}`,
    "# Public pages (/, /en, /zh, /terms, /llms.txt) are open to every crawler.",
    "# The proxy is a machine surface, not content: keep it, the console and the",
    "# admin API out of the index and out of the crawl budget.",
    "",
    robotsGroup("*"),
    "",
    "# Answer engines, explicitly welcome (see app/lib/seo.ts). Same rules.",
    ...AI_AGENTS.map((agent) => `\n${robotsGroup(agent)}`),
    "",
    `Sitemap: ${absUrl(origin, "/sitemap.xml")}`,
    "",
  ].join("\n");
}

/** Public, indexable pages: path + sitemap hints. Landing is in three URLs
    because /zh and /en are real, linkable, hreflang-declared documents. */
const SITEMAP_PAGES = [
  { path: "/", changefreq: "weekly", priority: "1.0", alternates: true },
  { path: "/en", changefreq: "weekly", priority: "0.9", alternates: true },
  { path: "/zh", changefreq: "weekly", priority: "0.9", alternates: true },
  { path: "/terms", changefreq: "monthly", priority: "0.5", alternates: false },
] as const;

/** Minimal XML text escape (origins are hostnames, but never trust that). */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** sitemap.xml with xhtml:link alternates, one cluster per language URL. */
export function sitemapXml(origin: string): string {
  const alternates = landingAlternates(origin)
    .map((a) => `    <xhtml:link rel="alternate" hreflang="${xml(a.hreflang)}" href="${xml(a.href)}"/>`)
    .join("\n");
  const urls = SITEMAP_PAGES.map((page) =>
    [
      "  <url>",
      `    <loc>${xml(absUrl(origin, page.path))}</loc>`,
      `    <lastmod>${CONTENT_UPDATED}</lastmod>`,
      `    <changefreq>${page.changefreq}</changefreq>`,
      `    <priority>${page.priority}</priority>`,
      page.alternates ? alternates : "",
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n"),
  ).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}

/**
 * The llms.txt index (see llmstxt.org): a title, a one-line summary as a
 * blockquote, then link sections an answer engine can follow to get the detail
 * it actually needs. Deliberately short — the long form is /llms-full.txt, and
 * the repository stays the source of truth for prose.
 */
export function llmsTxt(origin: string): string {
  return `# CORX

> CORX is an open-source CORS proxy that runs entirely on Cloudflare's edge. Prefix any URL with
> /fetch?url= and fetch it cross-origin — with R2 edge caching, per-key auth, upstream secret
> injection, keyless browser access and SSRF guards.

CORX is a single Cloudflare Worker (Hono + HonoX) backed by D1 (keys, rate windows, request logs,
host blocklist) and R2 (GET response cache). It is MIT-licensed, self-hostable in one account, and
has no accounts, seats or bills of its own. This file is served by the instance at ${origin};
every URL below is absolute and current for that instance.

## Docs

- [Landing page](${absUrl(origin, "/")}): the pitch, a live demo that proxies real URLs from the
  browser, the shared public key and its daily quotas, the feature list and the FAQ.
- [Terms of use](${absUrl(origin, "/terms")}): quotas, prohibited uses, logging and liability for
  this hosted instance. Read it before sending traffic.
- [Usage and options](${REPO_DOCS.readmeRaw}): calling conventions, the \`corx-*\` query namespace,
  caching and the full deployment guide — Markdown in the repository.
- [Feature list](${REPO_DOCS.featuresRaw}): every implemented feature mapped to the code that
  implements it.
- [Security policy](${REPO_DOCS.security}): the threat model (SSRF guards, injection at rest,
  cache isolation) and the limitations that are accepted rather than fixed.
- [Contributing](${REPO_DOCS.contributing}): self-hosting setup, the checks a change must pass and
  the repo conventions.
- [Full reference](${absUrl(origin, "/llms-full.txt")}): this instance's behaviour in one document,
  for agents that would rather not crawl the site.
- [Source repository](${GITHUB_URL}): TypeScript, MIT, issues and pull requests welcome.

## Calling the proxy

Four equivalent call shapes on ${origin}: query (\`/fetch?url=\`), path (\`/proxy/<url>\`), bare
path (\`/<url>\`) and subdomain mode. GET and HEAD are cacheable; every other method passes straight
through uncached.

- \`GET ${absUrl(origin, "/fetch?url=")}<url-encoded target>\` — the documented, recommended shape.
- \`GET ${absUrl(origin, "/proxy/")}<target>\` and \`GET ${absUrl(origin, "/")}<target>\` — path style.
- Subdomain mode, when the deployment has a wildcard zone: \`api-example-com.<zone>/path\`.
- Options are namespaced \`corx-*\` (\`corx-ttl\`, \`corx-no-cache\`, \`corx-callback\`, \`corx-key\`,
  \`corx-scheme\`, \`corx-port\`); unknown names are rejected with 400, never forwarded upstream.

## Facts

- License: ${LICENSE.spdx} (${LICENSE.url}).
- Stack: Cloudflare Workers, Hono/HonoX, D1, R2. No Node-only APIs.
- Auth: API keys per caller, keyless access by granted \`Origin\`, or a shared public key with
  daily quotas. GET and HEAD only on the public tier.
- Safety: SSRF guard (private ranges, DNS rebinding, D1 blocklist), 30-day request logs, no
  credentials forwarded on the public tier.
- Trust: a CORS proxy is a man in the middle by design. CORX is MIT-licensed and meant to be
  self-hosted — a hosted instance is a free, shared, best-effort demo, not a place for secrets or
  private data.
- Contact: ${ABUSE_EMAIL} for abuse, security or content reports.

## Optional

- [Sitemap](${absUrl(origin, "/sitemap.xml")}) — indexable pages and hreflang alternates.
- [robots.txt](${absUrl(origin, "/robots.txt")}) — what is deliberately closed to crawlers.
`;
}

/**
 * llms-full.txt: the whole behaviour of this instance in one Markdown document,
 * so an agent can answer "what does corx do / how do I call it / can I self-host
 * it" from a single fetch. Facts here mirror README.md and the code — when the
 * behaviour changes, this file changes with it (and CONTENT_UPDATED moves).
 */
export function llmsFullTxt(origin: string): string {
  const root = absUrl(origin, "/");
  return `# CORX — full reference for answer engines

> CORX is an open-source CORS proxy that runs entirely on Cloudflare's edge (Hono + Workers + D1 +
> R2). Prefix any URL with /fetch?url= and fetch it cross-origin, with R2 edge caching, per-key
> auth, upstream secret injection, keyless browser access and SSRF guards.

Served by the instance at ${origin} (generated in app/lib/seo.ts, updated ${CONTENT_UPDATED}).
README.md and FEATURES.md in the repository are the source of truth for prose; the short index is at
${absUrl(origin, "/llms.txt")}.

## What it is

One Cloudflare Worker that forwards HTTP requests to an arbitrary upstream and returns the response
with permissive CORS headers, so browser code can read APIs that never set them. D1 stores API keys
(hashed), rate-limit windows, request logs and the host blocklist; R2 stores the GET response cache.
Everything is deployable to a single Cloudflare account: \`wrangler d1 create\`, \`wrangler r2 bucket
create\`, \`npm run deploy\`. License: ${LICENSE.spdx}.

## Calling the proxy

| Shape | Example |
| --- | --- |
| Query (recommended) | \`GET ${absUrl(origin, "/fetch?url=")}https%3A%2F%2Fapi.example.com%2Fdata\` |
| Path | \`GET ${absUrl(origin, "/proxy/")}https://api.example.com/data\` |
| Bare path | \`GET ${root}https://api.example.com/data\` |
| Subdomain (wildcard zone) | \`GET https://api-example-com.<zone>/data\` |

GET and HEAD are forwarded and cacheable; other methods pass through but are never cached. Request
bodies are capped (10 MiB by default) and streaming responses — media, Range requests — are piped
through unbuffered.

### Query parameters

Every \`corx-*\` parameter is namespaced, so it can never collide with the target's own query.

| Param | Effect |
| --- | --- |
| \`corx-ttl=<seconds>\` | R2 cache TTL for this GET, capped by the deployment max |
| \`corx-no-cache=1\` | Bypass the cache for this response |
| \`corx-callback=<fn>\` | JSONP: wrap a JSON body as \`fn(<json>);\` for a <script> tag |
| \`corx-key=<key>\` | API key for this request (headers work too) |
| \`corx-scheme=http\\|https\` | Subdomain mode: force the target scheme |
| \`corx-port=<n>\` | Subdomain mode: target port |

## Authentication

- **API key** — \`x-api-key: <key>\`, \`Authorization: Bearer <key>\` or \`?corx-key=<key>\`. Keys are
  stored as SHA-256 hashes. A key carries allowed origins, a per-minute rate limit, a cache TTL, an
  allowed-host list, SSRF-check opt-outs and encrypted header/query injection rules.
- **Keyless browser access** — grant an origin to a key and its visitors call the proxy without
  shipping one. The grant matches on \`Origin\` (or \`Referer\` for same-origin GETs) and is metered
  per visitor IP, so one site cannot drain the whole key.
- **Public tier** — a hosted instance may publish a shared key on its landing page: GET and HEAD
  only, daily quotas per calling site / per target host / per instance, no cache control, no
  injection, no subdomain mode, and \`Cookie\`/\`Authorization\` are stripped before forwarding.
- No key and no matching grant: 401.

## Caching

- GET responses are cached in R2 and served from the edge; \`x-corx-cache: HIT|MISS\` reports which.
- Requests carrying \`Authorization\` or \`Cookie\` never read or write the shared cache, and neither
  do JSONP responses or keys with injection rules.
- TTL is capped by the deployment default to stop a caller pinning entries for a day;
  \`corx-no-cache=1\` opts a request out entirely, and the public tier cannot set a TTL at all.

## Limits and errors

- Defaults: 60 requests/minute per IP plus per-key limits; the hosted public tier adds daily quotas
  and is shared, best-effort and revocable without notice.
- Over quota: \`429\` with \`Retry-After\`; cached responses count too.
- Every machine-facing path (the proxy, \`/api/*\`, \`/health\`) answers errors as JSON
  \`{ "error": "…" }\`; browser-facing pages get a branded HTML page with a real status code.

## Security

- SSRF guard: hostname/IP-literal blocking for private, link-local, CGNAT, multicast and reserved
  ranges, DNS-resolution checks against rebinding, per-key opt-outs and a D1 blocklist.
- Hop-by-hop headers are stripped on the way in and out; \`Set-Cookie\` is not forwarded; the public
  tier strips credentials.
- Requests are logged (IP, country, method, target URL, status, latency, caller origin, key), rolled
  into a per-day aggregate by a nightly cron, and the raw rows pruned after 30 days — the aggregate
  keeps the long-term trend (\`/api/stats?days=\`).

## Trust model

A CORS proxy is a man in the middle by construction: its operator sees — and can change — every
request and response that passes through it. That is not a vulnerability to patch, it is what a
proxy is, so CORX is built to be forked rather than trusted. It is one MIT-licensed Cloudflare
Worker (Hono + D1 + R2) that deploys to a single account on the free tier; after that the only
operator in the data path is you.

A hosted instance (such as ${origin}) is free, shared, best-effort and revocable without notice. It
suits public data, demos and prototypes — not secrets, credentials or private data. The public tier
strips \`Cookie\`/\`Authorization\`, serves from a shared cache and logs requests for 30 days; those
reduce exposure, they are not a guarantee. When the traffic matters, self-host.

## Console and admin API

The bilingual (English/中文) console at ${absUrl(origin, "/console/")} manages keys, logs, analytics,
the blocklist and a playground that runs requests through the real pipeline. It is behind a session
cookie (optionally Cloudflare Access) and is not indexed. The same operations are available as JSON
for automation, authenticated with the admin token: \`/api/keys\`, \`/api/keys/:id\`,
\`/api/keys/:id/revoke\`, \`/api/logs\`, \`/api/stats\`, \`/api/blocked-hosts\`, \`/api/block-host\`,
\`/health\`.

## Public pages

- ${root} — landing page, live demo, public key card, FAQ.
- ${absUrl(origin, "/en")} and ${absUrl(origin, "/zh")} — explicit English and Chinese URLs.
- ${absUrl(origin, "/terms")} — terms of use, quotas and prohibited uses.
- ${absUrl(origin, "/llms.txt")}, ${absUrl(origin, "/llms-full.txt")}, ${absUrl(origin, "/sitemap.xml")},
  ${absUrl(origin, "/robots.txt")} — machine-readable surfaces.

## Contact

Abuse, security or content reports: ${ABUSE_EMAIL} — include the full request URL when you can.
`;
}

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
import { COMPARISONS } from "./compare.js";
import type { CompareSlug } from "./compare.js";
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
 * The hreflang cluster for one /compare page: the same three-URL shape as the
 * landing page — prefixed documents that canonicalise to themselves, plus the
 * auto-detecting root as x-default.
 */
export function compareAlternates(origin: string, slug: CompareSlug): Array<{ hreflang: string; href: string }> {
  return [
    { hreflang: "en", href: absUrl(origin, `/en/compare/${slug}`) },
    { hreflang: "zh", href: absUrl(origin, `/zh/compare/${slug}`) },
    { hreflang: "x-default", href: absUrl(origin, `/compare/${slug}`) },
  ];
}

/**
 * The hreflang cluster for the /docs page: the same three-URL shape as the
 * landing and the comparison pages — prefixed documents that canonicalise to
 * themselves, plus the auto-detecting root as x-default.
 */
export function docsAlternates(origin: string): Array<{ hreflang: string; href: string }> {
  return [
    { hreflang: "en", href: absUrl(origin, "/en/docs") },
    { hreflang: "zh", href: absUrl(origin, "/zh/docs") },
    { hreflang: "x-default", href: absUrl(origin, "/docs") },
  ];
}

/** The hreflang cluster for /snippets: the same three-URL shape as /docs. */
export function snippetsAlternates(origin: string): Array<{ hreflang: string; href: string }> {
  return [
    { hreflang: "en", href: absUrl(origin, "/en/snippets") },
    { hreflang: "zh", href: absUrl(origin, "/zh/snippets") },
    { hreflang: "x-default", href: absUrl(origin, "/snippets") },
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

/**
 * A comparison page's structured data.
 *
 * Defined through the @ids the landing page's graph already publishes (WebSite,
 * Organization, SoftwareApplication), so the comparison hangs off the same
 * entity rather than inventing a parallel one. `dateModified` is the day the
 * competitor claims were last read from their sources — that date is the whole
 * honesty mechanism of these pages, so it is the one the crawler sees too.
 */
export function compareJsonLd(opts: {
  origin: string;
  locale: Locale;
  slug: CompareSlug;
  title: string;
  description: string;
  /** Competitor name and site, linked as a second entity the page is about. */
  name: string;
  site: string;
  /** ISO day the competitor claims were read. */
  checked: string;
}): unknown[] {
  const url = absUrl(opts.origin, `/compare/${opts.slug}`);
  return [
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      url,
      name: opts.title,
      description: opts.description,
      inLanguage: opts.locale,
      dateModified: opts.checked,
      isPartOf: { "@id": `${absUrl(opts.origin, "/")}#website` },
      publisher: { "@id": `${absUrl(opts.origin, "/")}#organization` },
      about: [
        { "@id": `${absUrl(opts.origin, "/")}#software` },
        { "@type": "WebSite", name: opts.name, url: opts.site },
      ],
    },
  ];
}

/**
 * The /docs page's structured data: a dated TechArticle — a document *about*
 * the software, not a second product page — hanging off the @ids the landing
 * graph already publishes.
 */
export function docsJsonLd(opts: {
  origin: string;
  locale: Locale;
  /** Canonical path of this document ("/docs", "/en/docs", "/zh/docs"). */
  path: string;
  title: string;
  description: string;
}): unknown[] {
  const url = absUrl(opts.origin, opts.path);
  return [
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      url,
      headline: opts.title,
      description: opts.description,
      inLanguage: opts.locale,
      dateModified: CONTENT_UPDATED,
      isPartOf: { "@id": `${absUrl(opts.origin, "/")}#website` },
      publisher: { "@id": `${absUrl(opts.origin, "/")}#organization` },
      about: { "@id": `${absUrl(opts.origin, "/")}#software` },
    },
  ];
}

/**
 * The /snippets page's structured data: a dated TechArticle like /docs, but
 * `about` the endpoint's practical use — frameworks and deploy platforms.
 */
export function snippetsJsonLd(opts: {
  origin: string;
  locale: Locale;
  /** Canonical path of this document ("/snippets", "/en/snippets", "/zh/snippets"). */
  path: string;
  title: string;
  description: string;
}): unknown[] {
  const url = absUrl(opts.origin, opts.path);
  return [
    {
      "@type": "TechArticle",
      "@id": `${url}#article`,
      url,
      headline: opts.title,
      description: opts.description,
      inLanguage: opts.locale,
      dateModified: CONTENT_UPDATED,
      isPartOf: { "@id": `${absUrl(opts.origin, "/")}#website` },
      publisher: { "@id": `${absUrl(opts.origin, "/")}#organization` },
      about: { "@id": `${absUrl(opts.origin, "/")}#software` },
    },
  ];
}

// --- Crawler files ---------------------------------------------------------

/**
 * Paths crawlers must stay out of: the proxy itself (a machine surface, not
 * content — and an open proxy indexed under our hostname is exactly the SEO
 * pollution this file exists to prevent), the admin console and its API.
 */
const DISALLOW = ["/console", "/api", "/fetch", "/proxy", "/health", "/demo"] as const;

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
    "# Public pages (/, /en, /zh, /docs, /en/docs, /zh/docs, /snippets,",
    "# /en/snippets, /zh/snippets, /terms, /compare/*, /llms.txt) are open to",
    "# every crawler.",
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

/** Public, indexable pages: path + sitemap hints. Landing and compare pages
    exist as three URLs each (/zh and /en plus the auto-detecting root), so each
    carries its own hreflang cluster; /terms has no translated URL (its language
    is a cookie and ?lang=), so it has none. */
interface SitemapPage {
  path: string;
  changefreq: string;
  priority: string;
  alternates?: Array<{ hreflang: string; href: string }>;
}

function sitemapPages(origin: string): SitemapPage[] {
  const landing = (path: string, priority: string): SitemapPage => ({
    path,
    changefreq: "weekly",
    priority,
    alternates: landingAlternates(origin),
  });
  const docs = (path: string): SitemapPage => ({
    path,
    changefreq: "monthly",
    priority: "0.8",
    alternates: docsAlternates(origin),
  });
  const snippets = (path: string): SitemapPage => ({
    path,
    changefreq: "monthly",
    priority: "0.7",
    alternates: snippetsAlternates(origin),
  });
  return [
    landing("/", "1.0"),
    landing("/en", "0.9"),
    landing("/zh", "0.9"),
    // The human-facing usage page: the four call shapes, the corx-* table,
    // auth, caching, limits and security, in one document per language.
    docs("/docs"),
    docs("/en/docs"),
    docs("/zh/docs"),
    // The long-tail entry point for "corx + framework": real code per language.
    snippets("/snippets"),
    snippets("/en/snippets"),
    snippets("/zh/snippets"),
    // Long-tail entry points: not featured anywhere, but real documents with a
    // real cluster — a "vs" search should land on the sourced version.
    ...COMPARISONS.flatMap((c) =>
      ["", "/en", "/zh"].map((prefix) => ({
        path: `${prefix}/compare/${c.slug}`,
        changefreq: "monthly",
        priority: "0.6",
        alternates: compareAlternates(origin, c.slug),
      })),
    ),
    { path: "/terms", changefreq: "monthly", priority: "0.5" },
  ];
}

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
  const urls = sitemapPages(origin)
    .map((page) => {
      const alternates = (page.alternates ?? [])
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${xml(a.hreflang)}" href="${xml(a.href)}"/>`)
        .join("\n");
      return [
        "  <url>",
        `    <loc>${xml(absUrl(origin, page.path))}</loc>`,
        `    <lastmod>${CONTENT_UPDATED}</lastmod>`,
        `    <changefreq>${page.changefreq}</changefreq>`,
        `    <priority>${page.priority}</priority>`,
        alternates,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
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
  // Built from the registry so a new comparison page cannot be forgotten here.
  const comparisons = COMPARISONS.map(
    (c) => `[CORX vs ${c.name}](${absUrl(origin, `/compare/${c.slug}`)})`,
  ).join(", ");
  return `# CORX

> CORX is an open-source CORS proxy that runs entirely on Cloudflare's edge. Prefix any URL with
> /fetch?url= and fetch it cross-origin — with R2 edge caching, per-key auth, upstream secret
> injection, keyless browser access and SSRF guards.

CORX is a single Cloudflare Worker (Hono + HonoX) backed by D1 (keys, rate windows, request logs,
host blocklist) and R2 (GET response cache). It is MIT-licensed, self-hostable in one account, and
has no accounts, seats or bills of its own. This file is served by the instance at ${origin};
every URL below is absolute and current for that instance.

## Docs

- [Usage guide](${absUrl(origin, "/docs")}): the human-readable manual for this instance — the
  four call shapes, the \`corx-*\` parameter table, the three auth tiers, caching, limits and the
  security summary. Also at /en/docs and /zh/docs.
- [Framework and platform snippets](${absUrl(origin, "/snippets")}): copy-paste \`fetch\`/axios/ky
  examples, the key-hygiene rules for browser code, and how to call this instance from Cloudflare
  Pages, Vercel and Netlify. Also at /en/snippets and /zh/snippets.
- [Landing page](${absUrl(origin, "/")}): the pitch, a live demo that proxies real URLs from the
  browser, the shared public key and its daily quotas, the feature list and the FAQ.
- [Terms of use](${absUrl(origin, "/terms")}): quotas, prohibited uses, logging and liability for
  this hosted instance. Read it before sending traffic.
- Comparisons: ${comparisons} — dated, sourced differences against the hosted CORS proxies CORX is
  compared with, including the rows the other service wins.
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
  \`corx-charset\`, \`corx-wrap\`, \`corx-scheme\`, \`corx-port\`); unknown names are rejected with 400, never
  forwarded upstream.

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
| \`corx-charset=<label>\` | Re-decode a text/JSON/XML body with this label and re-emit it as UTF-8 |
| \`corx-wrap=json\` | Wrap a text body as \`{"contents":"…"}\` with application/json |
| \`corx-key=<key>\` | API key for this request (headers work too) |
| \`corx-scheme=http\\|https\` | Subdomain mode: force the target scheme |
| \`corx-port=<n>\` | Subdomain mode: target port |

## Authentication

- **API key** — \`x-api-key: <key>\`, \`Authorization: Bearer <key>\` or \`?corx-key=<key>\`. Keys are
  stored as SHA-256 hashes. A key carries allowed origins, a per-minute rate limit, a cache TTL, an
  allowed-host list, SSRF-check opt-outs and encrypted header/query injection rules. It can also
  carry **response header rules** — headers corx sets or removes on the way back to the caller
  (the documented embed recipe: strip \`X-Frame-Options\`/CSP \`frame-ancestors\` for a host you
  control, then sandbox the iframe yourself). The headers corx owns are rejected at save time, and a
  key's resolved response rules are part of the cache key.
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
  do JSONP responses or keys with request header rules. Keys with response header rules do cache:
  those rules are part of the cache key, so a rewritten response is never served to another key.
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
  into a per-day aggregate by a nightly cron, and the raw rows pruned after 30 days by default — the
  aggregate keeps the long-term trend (\`/api/stats?days=\`). Self-hosted deployments choose both:
  \`LOG_REQUESTS=false\` writes no request rows at all, and \`LOG_RETENTION_DAYS\` (1–365) sets the
  raw window; the rollup and the stats read path follow it.

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

## Injection demo

The landing page runs one live demonstration of the thing that separates CORX from a plain pass-through
proxy: a public demo key, allowlisted to this Worker's own echo endpoint, proxies to
\`${absUrl(origin, "/demo/echo")}\` — an endpoint that returns the method, path, query and headers it
received. The response therefore shows the credential CORX injected on the way out, while the browser
only ever held the public demo key. The demo key is ordinary key data (\`DEMO_KEY\` plus
\`scripts/seed-demo-key.mjs\`), and the injected value is deliberately fake. The echo endpoint is a
machine surface: JSON, \`no-store\`, \`noindex\`, excluded from robots.txt.

## Public pages

- ${root} — landing page, live demo (including the injection demo, below), public key card, FAQ.
- ${absUrl(origin, "/en")} and ${absUrl(origin, "/zh")} — explicit English and Chinese URLs.
- ${absUrl(origin, "/docs")} — the human-readable usage guide (also ${absUrl(origin, "/en/docs")}
  and ${absUrl(origin, "/zh/docs")}): call shapes, the \`corx-*\` table, auth tiers, caching,
  limits, security and self-hosting.
- ${absUrl(origin, "/snippets")} — framework and platform snippets (also
  ${absUrl(origin, "/en/snippets")} and ${absUrl(origin, "/zh/snippets")}): fetch, axios and ky
  examples, browser key hygiene, and Cloudflare Pages / Vercel / Netlify notes.
- ${absUrl(origin, "/terms")} — terms of use, quotas and prohibited uses.
- ${COMPARISONS.map((c) => `${absUrl(origin, `/compare/${c.slug}`)} (vs ${c.name})`).join(", ")} —
  dated comparisons against other hosted CORS proxies, every competitor claim linked to its source.
- ${absUrl(origin, "/llms.txt")}, ${absUrl(origin, "/llms-full.txt")}, ${absUrl(origin, "/sitemap.xml")},
  ${absUrl(origin, "/robots.txt")} — machine-readable surfaces.

## Contact

Abuse, security or content reports: ${ABUSE_EMAIL} — include the full request URL when you can.
`;
}

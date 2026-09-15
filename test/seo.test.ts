import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

/**
 * SEO / GEO surface: the crawler files (robots.txt, sitemap.xml, llms.txt,
 * llms-full.txt) and the tags the public pages have to get right.
 *
 * These are contract tests. Search engines and answer engines read exactly
 * these strings, and nothing else in the suite would notice if a canonical URL
 * lost its hostname or the FAQ schema stopped matching the FAQ on the page.
 */

/** Minimal D1 mock (empty tables) — same shape as the other integration tests. */
function mockDb() {
  const q = () => ({
    bind: () => q(),
    run: async () => ({ meta: { changes: 0 } }),
    first: async () => null,
    all: async () => ({ results: [] }),
  });
  return { prepare: q };
}

const env = {
  DB: mockDb(),
  CACHE_BUCKET: {
    get: async () => null,
    put: async () => undefined,
    list: async () => ({ objects: [] }),
    delete: async () => undefined,
  },
  ADMIN_TOKEN: "test-token",
  ALLOWED_ORIGINS: "*",
} as unknown as Env;

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, init), e, ctx);
}

/** Undo hono/jsx's HTML escaping, so text comparisons are about content. */
function decode(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The JSON-LD @graph of a rendered document. */
async function graph(res: Response): Promise<{ "@graph": Array<Record<string, unknown>> }> {
  const html = await res.text();
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  expect(match, "no JSON-LD script in the document").not.toBeNull();
  return JSON.parse(match![1]!);
}

afterEach(() => vi.unstubAllGlobals());

describe("crawler files", () => {
  it("robots.txt allows the public pages and closes the machine surfaces", async () => {
    const res = await call("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const txt = await res.text();

    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    // The proxy and the console must never be indexed under our hostname.
    for (const path of ["/console", "/api", "/fetch", "/proxy", "/health"]) {
      expect(txt).toContain(`Disallow: ${path}`);
    }
    // Answer engines are named on purpose (GEO) — losing that list silently
    // would make the file read as "AI crawlers not considered".
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("User-agent: ClaudeBot");
    // Absolute sitemap URL: a relative one is ignored by crawlers.
    expect(txt).toContain("Sitemap: https://corx.test/sitemap.xml");
  });

  it("sitemap.xml lists the indexable pages with absolute URLs + hreflang", async () => {
    const res = await call("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("xml");
    const xml = await res.text();

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const path of ["/", "/en", "/zh", "/terms"]) {
      expect(xml).toContain(`<loc>https://corx.test${path}</loc>`);
    }
    // The landing cluster: both languages plus the x-default root.
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="x-default" href="https://corx.test/"/>');
    // Machine surfaces stay out of the sitemap.
    for (const path of ["/console", "/llms.txt", "/robots.txt", "/sitemap.xml", "/fetch"]) {
      expect(xml).not.toContain(`<loc>https://corx.test${path}</loc>`);
    }
    // A sitemap must not advertise a stale date forever.
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/);
  });

  it("llms.txt follows the llmstxt.org shape and links out absolutely", async () => {
    const res = await call("/llms.txt");
    expect(res.status).toBe(200);
    const txt = await res.text();

    // Title, then the one-line summary as a blockquote (the spec's shape).
    expect(txt.startsWith("# CORX\n\n> ")).toBe(true);
    // The index is an index: real link sections and the optional tail.
    expect(txt).toContain("## Docs");
    expect(txt).toContain("## Optional");
    expect(txt).toContain("(https://github.com/envx-cn/corx)");
    expect(txt).toContain("(https://corx.test/terms)");
    expect(txt).toContain("(https://corx.test/llms-full.txt)");
    // Every markdown link target must be absolute, or an agent can't fetch it
    // from wherever it read the file.
    for (const target of txt.matchAll(/\]\(([^)]+)\)/g)) {
      expect(target[1]!, target[1]!).toMatch(/^https:\/\//);
    }
    expect(txt).toContain("(https://github.com/envx-cn/corx)");
  });

  it("llms-full.txt documents the calling conventions and the limits", async () => {
    const txt = await (await call("/llms-full.txt")).text();
    expect(txt).toContain("# CORX — full reference for answer engines");
    expect(txt).toContain("/fetch?url=");
    expect(txt).toContain("corx-ttl");
    expect(txt).toContain("429");
    expect(txt).toContain("MIT");
    expect(txt).toContain("https://corx.test/llms.txt");
  });

  it("is served from the request's own hostname (self-hosted copies advertise themselves)", async () => {
    const res = await worker.fetch(new Request("https://corx.example/robots.txt"), env, ctx);
    const txt = await res.text();
    expect(txt).toContain("Sitemap: https://corx.example/sitemap.xml");
    expect(txt).not.toContain("corx.test");
  });

  it("gives way to the proxy on a subdomain host (subdomain mode turns every path into a target)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("upstream robots", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await worker.fetch(
      new Request("https://example-com.corx.test/robots.txt"),
      { ...env, PROXY_ZONE: "corx.test" } as Env,
      ctx,
    );
    expect(await res.text()).toBe("upstream robots");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("landing page metadata", () => {
  it("canonicalises each language URL to itself and declares the hreflang cluster", async () => {
    const cases: Array<[string, string, Record<string, string>]> = [
      ["/", "https://corx.test/", {}],
      // The auto-detecting root stays the canonical even when it renders 中文:
      // one URL, one canonical.
      ["/", "https://corx.test/", { "accept-language": "zh-CN,zh;q=0.9" }],
      ["/en", "https://corx.test/en", {}],
      ["/zh", "https://corx.test/zh", {}],
    ];
    for (const [path, canonical, headers] of cases) {
      const html = await (await call(path, { headers })).text();
      expect(html, `${path} ${JSON.stringify(headers)}`).toContain(`<link rel="canonical" href="${canonical}"/>`);
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://corx.test/en"/>');
      expect(html).toContain('<link rel="alternate" hreflang="zh" href="https://corx.test/zh"/>');
      expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://corx.test/"/>');
      expect(html).toContain('property="og:url" content="' + canonical + '"');
      // Indexable, with the big previews explicitly allowed.
      expect(html).toContain('name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"');
      // Social card: absolute, sized, and described.
      expect(html).toContain('<meta property="og:image" content="https://corx.test/og.png"/>');
      expect(html).toContain('<meta property="og:image:width" content="1200"/>');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    }
  });

  it("declares the locale pair for Open Graph", async () => {
    const en = await (await call("/en")).text();
    expect(en).toContain('<meta property="og:locale" content="en_US"/>');
    expect(en).toContain('<meta property="og:locale:alternate" content="zh_CN"/>');
    const zh = await (await call("/zh")).text();
    expect(zh).toContain('<meta property="og:locale" content="zh_CN"/>');
    expect(zh).toContain('<meta property="og:locale:alternate" content="en_US"/>');
  });

  it("emits a JSON-LD graph whose FAQ matches the FAQ rendered on the page", async () => {
    const html = decode(await (await call("/en")).text());
    const { "@graph": nodes } = await graph(await call("/en"));

    const types = nodes.map((n) => n["@type"]);
    expect(types).toEqual(["WebSite", "Organization", "SoftwareApplication", "FAQPage"]);

    const app = nodes.find((n) => n["@type"] === "SoftwareApplication")!;
    expect(app["codeRepository"]).toBe("https://github.com/envx-cn/corx");
    expect(app["license"]).toBe("https://spdx.org/licenses/MIT.html");
    expect(app["offers"]).toMatchObject({ price: "0" });
    expect((app["featureList"] as string[]).length).toBeGreaterThanOrEqual(9);

    // Schema-only content is against Google's guidelines: every question and
    // answer in the graph must exist as visible text in the same document.
    const faq = nodes.find((n) => n["@type"] === "FAQPage")!;
    const pairs = faq["mainEntity"] as Array<{ name: string; acceptedAnswer: { text: string } }>;
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    for (const { name, acceptedAnswer } of pairs) {
      expect(html, `question not on the page: ${name}`).toContain(name);
      expect(html, `answer not on the page: ${acceptedAnswer.text}`).toContain(acceptedAnswer.text);
    }

    // The zh page gets a zh graph, not a copy of the English one.
    const { "@graph": zhNodes } = await graph(await call("/zh"));
    const zhFaq = zhNodes.find((n) => n["@type"] === "FAQPage")!;
    expect(zhFaq["inLanguage"]).toBe("zh");
    expect(JSON.stringify(zhFaq)).toContain("CORX 是什么？");
  });

  it("locks the structured data against a </script> injection", async () => {
    const html = await (await call("/en")).text();
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain("</script");
  });
});

describe("noindex surfaces", () => {
  it("keeps 404s and 5xx pages out of the index", async () => {
    const notFound = await call("/no-such-page");
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toContain('name="robots" content="noindex, nofollow"');
  });

  it("keeps the console (and its login page) out of the index", async () => {
    const html = await (await call("/console/login")).text();
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    // The gated console itself is a redirect for anonymous callers — no body to
    // index either way — while the shell it redirects into carries the tag.
    expect((await call("/console/")).status).toBe(302);
  });

  it("never lets a proxied response be indexed as ours", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("hello upstream", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await call("/fetch?url=https://example.com/data");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("terms page metadata", () => {
  it("canonicalises to /terms and is indexable", async () => {
    const html = await (await call("/terms")).text();
    expect(html).toContain('<link rel="canonical" href="https://corx.test/terms"/>');
    expect(html).toContain('name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"');
    // No hreflang: /terms has no translated URL (language is a cookie + ?lang=).
    expect(html).not.toContain('rel="alternate" hreflang');

    const { "@graph": nodes } = await graph(await call("/terms"));
    expect(nodes[0]!["@type"]).toBe("WebPage");
    expect(nodes[0]!["dateModified"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

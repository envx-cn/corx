import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { SNIPPET_GROUPS, SNIPPETS, snippetsOf } from "../app/lib/snippets.js";
import { makeT } from "../app/lib/i18n/locale.js";

/**
 * The /snippets surface: the copy-paste examples (#50) and the contract that
 * keeps them correct — every block is built from the request's own origin (a
 * self-hosted copy must never advertise another deployment), every label
 * exists in both dictionaries, and every page advertises the same hreflang
 * cluster + sitemap treatment as /docs and /compare.
 */

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

afterEach(() => vi.unstubAllGlobals());

describe("snippet registry", () => {
  it("keeps ids unique and every group populated", () => {
    const ids = SNIPPETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const group of SNIPPET_GROUPS) {
      expect(snippetsOf(group).length, group).toBeGreaterThan(0);
    }
    // Every snippet belongs to a rendered group; a stray group would vanish.
    expect(SNIPPETS.every((s) => SNIPPET_GROUPS.includes(s.group))).toBe(true);
  });

  it("has real prose for every block, in both languages", () => {
    for (const locale of ["en", "zh"] as const) {
      const t = makeT(locale);
      for (const snippet of SNIPPETS) {
        for (const key of [snippet.titleKey, snippet.descKey]) {
          const text = t(key);
          expect(text, `${locale} ${key} fell back to the key`).not.toBe(key);
          // Titles can be product names as short as "ky"; descriptions carry the prose.
          expect(text.length, `${locale} ${key}`).toBeGreaterThanOrEqual(2);
        }
      }
    }
  });

  it("builds every block against the requesting deployment, never a fixed host", () => {
    for (const snippet of SNIPPETS) {
      const code = snippet.code("https://corx.test");
      expect(code, snippet.id).toContain("https://corx.test");
      expect(code, snippet.id).not.toContain("corx.dev");
      expect(code, snippet.id).not.toContain("envx.cn");
      // The key-hygiene rule the whole page exists for: examples that carry a
      // server key say where it must not live.
      if (/\bX-Api-Key\b/.test(code)) {
        expect(code, snippet.id).toContain("server-side env var");
      }
    }
  });
});

describe("snippets page contract", () => {
  it("renders at all three URLs with canonical, cluster and indexable robots", async () => {
    const cases: Array<[string, string]> = [
      ["/en/snippets", "https://corx.test/en/snippets"],
      ["/zh/snippets", "https://corx.test/zh/snippets"],
    ];
    for (const [path, canonical] of cases) {
      const res = await call(path);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`);
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://corx.test/en/snippets"/>');
      expect(html).toContain('<link rel="alternate" hreflang="zh" href="https://corx.test/zh/snippets"/>');
      expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://corx.test/snippets"/>');
      expect(html).toContain('name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"');
      expect(html).toContain('<meta property="og:image" content="https://corx.test/og.png"/>');
    }
    const root = await (await call("/snippets")).text();
    expect(root).toContain('<link rel="canonical" href="https://corx.test/snippets"/>');
  });

  it("renders every snippet from the registry, against this origin", async () => {
    const html = decode(await (await call("/en/snippets")).text());
    for (const snippet of SNIPPETS) {
      const code = snippet.code("https://corx.test");
      expect(html, snippet.id).toContain(code.split("\n")[0]!);
      expect(html, snippet.id).toContain(code.split("\n").at(-1)!);
    }
    // The libraries the issue names, plus the server route.
    for (const needle of ["fetch", "axios", "ky", "X-Api-Key", "VITE_CORX_KEY", "process.env.CORX_KEY!"]) {
      expect(html).toContain(needle);
    }
  });

  it("covers key hygiene, the platforms and the public-tier caveat", async () => {
    const en = await (await call("/en/snippets")).text();
    expect(en).toContain("Where the key must not go");
    expect(en).toContain('href="/docs#auth"');
    for (const platform of ["Cloudflare Pages", "Vercel", "Netlify"]) {
      expect(en).toContain(platform);
    }
    // The honest half: GET/HEAD, quotas, no injection, shared cache.
    expect(en).toContain("When the public tier is enough");
    expect(en).toContain("GET and HEAD only");
    expect(en).toContain("no injection");
    expect(en).toContain('href="/docs#selfhost"');
  });

  it("links the public key only when the instance has one", async () => {
    const without = await (await call("/en/snippets")).text();
    expect(without).not.toContain('href="/#public-key"');

    const withKey = await (
      await call("/en/snippets", {}, { ...env, PUBLIC_KEY: "corx_pub_test" } as Env)
    ).text();
    expect(withKey).toContain('href="/#public-key"');
  });

  it("is translated, not carried over", async () => {
    const zh = await (await call("/zh/snippets")).text();
    expect(zh).toContain('<html lang="zh"');
    expect(zh).toContain("框架与平台代码示例");
    expect(zh).toContain("key 绝不能放在哪");
    expect(zh).not.toContain("Where the key must not go");
  });

  it("turns ?lang= into the prefixed URL and remembers /en, /zh", async () => {
    const redirect = await call("/snippets?lang=zh");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/zh/snippets");
    expect(redirect.headers.get("set-cookie")).toContain("corx_lang=zh");

    const en = await call("/en/snippets");
    expect(en.headers.get("set-cookie")).toContain("corx_lang=en");
  });

  it("emits a dated TechArticle hanging off the shared site graph", async () => {
    const html = await (await call("/en/snippets")).text();
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const graph = JSON.parse(match![1]!);
    const article = graph["@graph"][0];
    expect(article["@type"]).toBe("TechArticle");
    expect(article["url"]).toBe("https://corx.test/en/snippets");
    expect(article["inLanguage"]).toBe("en");
    expect(article["dateModified"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(article["isPartOf"]["@id"]).toBe("https://corx.test/#website");
    expect(article["about"]["@id"]).toBe("https://corx.test/#software");
  });

  it("gives way to the proxy on a subdomain host, prefixed URLs included", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("upstream snippets", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await worker.fetch(
      new Request("https://example-com.corx.test/zh/snippets"),
      { ...env, PROXY_ZONE: "corx.test" } as Env,
      ctx,
    );
    expect(await res.text()).toBe("upstream snippets");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("snippets discovery", () => {
  it("is in the sitemap with its own hreflang cluster", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    for (const path of ["/snippets", "/en/snippets", "/zh/snippets"]) {
      expect(xml).toContain(`<loc>https://corx.test${path}</loc>`);
    }
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://corx.test/snippets"/>',
    );
  });

  it("is linked from llms.txt, llms-full.txt, /docs and the landing", async () => {
    const index = await (await call("/llms.txt")).text();
    expect(index).toContain("(https://corx.test/snippets)");
    const full = await (await call("/llms-full.txt")).text();
    expect(full).toContain("https://corx.test/snippets");
    expect(full).toContain("https://corx.test/en/snippets");

    const docs = await (await call("/en/docs")).text();
    expect(docs).toContain('href="/snippets"');

    const landing = await (await call("/en")).text();
    expect(landing).toContain('href="/snippets"');
    expect(landing).toContain("Copy-paste snippets");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { CONTROL_PARAMS } from "../app/lib/control.js";
import { DOCS_CLIENT_CASES, DOCS_CLIENT_VARS, DOCS_INJECTION_HOSTS, DOCS_INJECTION_RULES, DOCS_INJECTION_VARS, DOCS_PARAMS, DOCS_SHAPES, docsShapeExample } from "../app/lib/docs.js";
import { parseClientVarsInput, parseHostsInput, parseRulesInput, parseVarsInput } from "../app/proxy/inject.js";
import { makeT } from "../app/lib/i18n/locale.js";

/**
 * The /docs surface: the human-readable usage page and the contract that keeps
 * it honest — the parameter table must equal the namespace the proxy actually
 * enforces, every documented fact must exist in both dictionaries, and the
 * three URLs must carry the same canonical + hreflang + sitemap treatment as
 * the landing and /compare pages.
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

describe("docs registry", () => {
  it("documents exactly the control params the proxy owns, in order", () => {
    // The whole point of app/lib/docs.ts: the page cannot advertise a param the
    // proxy does not consume, or forget one it does.
    expect(DOCS_PARAMS.map((p) => p.name)).toEqual([...CONTROL_PARAMS]);
  });

  it("has real prose for every row and shape, in both languages", () => {
    for (const locale of ["en", "zh"] as const) {
      const t = makeT(locale);
      for (const param of DOCS_PARAMS) {
        const desc = t(param.desc);
        expect(desc, `${locale} ${param.desc} fell back to the key`).not.toBe(param.desc);
        expect(desc.length, `${locale} ${param.name}`).toBeGreaterThan(20);
      }
      for (const id of DOCS_SHAPES) {
        for (const key of [`docs.call.${id}.title`, `docs.call.${id}.desc`] as const) {
          const text = t(key);
          expect(text, `${locale} ${key} fell back to the key`).not.toBe(key);
        }
      }
    }
  });

  it("builds each shape's sample against the requesting deployment", () => {
    const examples = DOCS_SHAPES.map((id) => docsShapeExample("https://corx.test", id));
    expect(new Set(examples).size).toBe(DOCS_SHAPES.length);
    expect(examples[0]).toContain("https://corx.test/fetch?url=");
    expect(examples[1]).toContain("https://corx.test/proxy/https://api.example.com/data");
    expect(examples[2]).toContain("https://corx.test/https://api.example.com/data");
    // Subdomain mode's zone is the deployment's own, so the sample must not
    // pretend to know it.
    expect(examples[3]).toContain("<zone>");
    for (const example of examples) expect(example).not.toContain("corx.dev");
  });

  it("ships a multi-upstream injection example the real parser accepts", () => {
    // The /docs upstream section prints these three fields, so they must be
    // exactly what the save path accepts — otherwise the page documents a shape
    // the console would reject with a 400.
    const vars = parseVarsInput(DOCS_INJECTION_VARS.join("\n"));
    const rules = parseRulesInput(
      DOCS_INJECTION_RULES.join("\n"),
      "header",
      new Set(vars.map((v) => v.name)),
    );
    const hosts = parseHostsInput(DOCS_INJECTION_HOSTS);

    // The point of the section: the same header name on two hosts, each with
    // its own variable (the `Authorization` shape the fix in #78 unblocked).
    const authorization = rules.filter((r) => r.name === "Authorization");
    expect(authorization).toHaveLength(2);
    expect(authorization.map((r) => r.hosts)).toEqual([["api.openai.com"], ["api.vendor.com"]]);
    // And every scoped rule sits inside the allowlist the page prints.
    for (const rule of rules) {
      for (const host of rule.hosts ?? []) expect(hosts, rule.name).toContain(host);
    }
  });

  it("ships a caller-reference example consistent with the variables and hosts around it", () => {
    // The page shows a fourth field next to the others, so the exposure it
    // documents must be valid against that same example.
    const names = new Set(parseVarsInput(DOCS_INJECTION_VARS.join("\n")).map((v) => v.name));
    const exposed = parseClientVarsInput(DOCS_CLIENT_VARS.join("\n"));
    expect([...exposed.keys()]).toEqual(["VENDOR_KEY"]);
    const hosts = parseHostsInput(DOCS_INJECTION_HOSTS);
    for (const [name, scopes] of exposed) {
      expect(names, name).toContain(name);
      for (const host of scopes) expect(hosts, `${name} → ${host}`).toContain(host);
    }
    // Every row of the "what a caller's reference becomes" table is one of the
    // cases the prose explains, in the reader's language.
    expect(DOCS_CLIENT_CASES.length).toBeGreaterThanOrEqual(4);
    for (const row of DOCS_CLIENT_CASES) expect(row.why.startsWith("docs.upstream.matrix.")).toBe(true);
  });

  it("explains the scoping rules in both languages", () => {
    for (const locale of ["en", "zh"] as const) {
      const t = makeT(locale);
      for (const row of DOCS_CLIENT_CASES) {
        const why = t(row.why);
        expect(why, `${locale} ${row.why} fell back to the key`).not.toBe(row.why);
        expect(why.length, `${locale} ${row.why}`).toBeGreaterThan(10);
      }
      for (const key of [
        "docs.upstream.scoping.title",
        "docs.upstream.order.title",
        "docs.upstream.matrix.title",
      ] as const) {
        expect(t(key), `${locale} ${key} fell back to the key`).not.toBe(key);
      }
    }
  });
});

describe("docs page contract", () => {
  it("renders at all three URLs with canonical, cluster and indexable robots", async () => {
    const cases: Array<[string, string]> = [
      ["/en/docs", "https://corx.test/en/docs"],
      ["/zh/docs", "https://corx.test/zh/docs"],
    ];
    for (const [path, canonical] of cases) {
      const res = await call(path);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`);
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://corx.test/en/docs"/>');
      expect(html).toContain('<link rel="alternate" hreflang="zh" href="https://corx.test/zh/docs"/>');
      expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://corx.test/docs"/>');
      expect(html).toContain('name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"');
      expect(html).toContain('<meta property="og:image" content="https://corx.test/og.png"/>');
    }

    // The x-default URL is canonical to itself, whatever language it renders.
    const root = await (await call("/docs")).text();
    expect(root).toContain('<link rel="canonical" href="https://corx.test/docs"/>');
  });

  it("renders the parameter table and every call shape from the registry", async () => {
    const html = decode(await (await call("/en/docs")).text());
    for (const param of DOCS_PARAMS) {
      expect(html, param.name).toContain(param.name);
      expect(html, param.example).toContain(param.example);
    }
    for (const id of DOCS_SHAPES) {
      const example = docsShapeExample("https://corx.test", id);
      expect(html, id).toContain(example);
    }
    // The key forms the auth section documents.
    for (const form of ["X-Api-Key", "Authorization: Bearer", "corx-key"]) {
      expect(html).toContain(form);
    }
    // The multi-upstream example, field by field.
    for (const block of [
      DOCS_INJECTION_VARS.join("\n"),
      DOCS_INJECTION_RULES.join("\n"),
      DOCS_INJECTION_HOSTS,
    ]) {
      expect(html).toContain(block);
    }
  });

  it("covers the auth, caching, limits, security and self-hosting facts", async () => {
    const en = decode(await (await call("/en/docs")).text());
    // Auth tiers + where the key must not go + the credential-forwarding rule.
    expect(en).toContain("Keyless origin grants");
    expect(en).toContain("Public tier");
    expect(en).toContain("Where the key goes");
    expect(en).toContain("never forwarded upstream");
    // Upstream credentials: the ways, the worked example and when to split keys.
    expect(en).toContain("Upstream credentials");
    expect(en).toContain("How a credential is attached");
    expect(en).toContain("Letting the caller reference a variable");
    expect(en).toContain("Two scopes, and both must allow the host");
    expect(en).toContain("What a caller's reference becomes");
    expect(en).toContain("One key or several");
    expect(en).toContain("Cache and safety");
    // Caching, with the marker header a caller can check.
    expect(en).toContain("X-Corx-Cache");
    expect(en).toContain("What bypasses the cache");
    // Limits and the 429 contract.
    expect(en).toContain("429");
    expect(en).toContain("Retry-After");
    expect(en).toContain("X-Corx-Quota-");
    // Security summary linking /terms and the landing trust section.
    expect(en).toContain("SSRF guards");
    expect(en).toContain('href="/terms"');
    expect(en).toContain('href="/#trust"');
    // Self-hosting pointer to the repository prose.
    expect(en).toContain("README.md");
    expect(en).toContain("wrangler deploy");
  });

  it("is translated, not carried over", async () => {
    const zh = decode(await (await call("/zh/docs")).text());
    expect(zh).toContain('<html lang="zh"');
    expect(zh).toContain("使用文档");
    expect(zh).toContain("调用代理");
    expect(zh).toContain("上游凭证");
    expect(zh).toContain("允许调用方引用变量");
    expect(zh).toContain("两层作用域");
    expect(zh).toContain("调用方的引用最终变成什么");
    expect(zh).toContain("绝不会被转发到上游");
    expect(zh).toContain("一个 key 还是多个");
    expect(zh).toContain("哪些请求绕过缓存");
    expect(zh).not.toContain("What bypasses the cache");
    expect(zh).not.toContain("One key or several");
  });

  it("turns ?lang= into the prefixed URL and remembers /en, /zh", async () => {
    const redirect = await call("/docs?lang=zh");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/zh/docs");
    expect(redirect.headers.get("set-cookie")).toContain("corx_lang=zh");

    const en = await call("/en/docs");
    expect(en.headers.get("set-cookie")).toContain("corx_lang=en");
  });

  it("emits a dated TechArticle hanging off the shared site graph", async () => {
    const html = await (await call("/en/docs")).text();
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const graph = JSON.parse(match![1]!);
    const article = graph["@graph"][0];
    expect(article["@type"]).toBe("TechArticle");
    expect(article["url"]).toBe("https://corx.test/en/docs");
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
        return new Response("upstream docs", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await worker.fetch(
      new Request("https://example-com.corx.test/zh/docs"),
      { ...env, PROXY_ZONE: "corx.test" } as Env,
      ctx,
    );
    expect(await res.text()).toBe("upstream docs");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("docs discovery", () => {
  it("is in the sitemap with its own hreflang cluster", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    for (const path of ["/docs", "/en/docs", "/zh/docs"]) {
      expect(xml).toContain(`<loc>https://corx.test${path}</loc>`);
    }
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://corx.test/docs"/>',
    );
  });

  it("is linked from llms.txt and llms-full.txt", async () => {
    const index = await (await call("/llms.txt")).text();
    expect(index).toContain("(https://corx.test/docs)");
    const full = await (await call("/llms-full.txt")).text();
    expect(full).toContain("https://corx.test/docs");
    expect(full).toContain("https://corx.test/en/docs");
  });

  it("is linked from the landing nav, not the hero", async () => {
    const html = await (await call("/en")).text();
    expect(html).toContain('href="/docs"');
    expect(html).toContain(">Docs<");
  });
});

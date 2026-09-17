import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { buildCorsCalls, corsFindings, testerTarget } from "../app/lib/cors-check.js";

/**
 * The public CORS tester (#54): the probe-result → finding mapping (what the
 * page tells a visitor), the generated calls, the page contract, and the
 * discovery links. The probes themselves run in a browser and are exercised by
 * hand; everything that decides what the page *says* is testable here.
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

afterEach(() => vi.unstubAllGlobals());

describe("testerTarget", () => {
  const page = "https://corx.test";

  it("accepts http(s) URLs and normalises them", () => {
    expect(testerTarget("https://api.example.com/data", page)).toEqual({
      target: "https://api.example.com/data",
    });
    expect(testerTarget("  http://example.com/x?y=1  ", page)).toEqual({
      target: "http://example.com/x?y=1",
    });
  });

  it("rejects empty, unparseable, non-http and same-origin input", () => {
    expect(testerTarget("", page)).toEqual({ error: "empty" });
    expect(testerTarget("not a url", page)).toEqual({ error: "invalid" });
    expect(testerTarget("ftp://example.com/x", page)).toEqual({ error: "scheme" });
    expect(testerTarget("data:text/plain,hi", page)).toEqual({ error: "scheme" });
    expect(testerTarget("https://corx.test/fetch", page)).toEqual({ error: "self" });
  });
});

describe("corsFindings", () => {
  const base = { corsOk: false, opaqueOk: false, credentialedOk: null, preflightOk: null, mixedContent: false };

  it("reports mixed content before anything else", () => {
    expect(corsFindings({ ...base, mixedContent: true, corsOk: true })).toEqual(["mixed-content"]);
  });

  it("separates an unreachable target from a CORS block", () => {
    expect(corsFindings({ ...base, opaqueOk: true })).toEqual(["missing-allow-origin"]);
    expect(corsFindings(base)).toEqual(["unreachable"]);
  });

  it("headlines `ok` when the plain fetch works, with caveats after it", () => {
    expect(corsFindings({ ...base, corsOk: true, credentialedOk: true, preflightOk: true })).toEqual(["ok"]);
    // Untested variants do not turn into findings.
    expect(corsFindings({ ...base, corsOk: true })).toEqual(["ok"]);
    // A working plain fetch still reports what a credentialed/preflighted
    // caller would hit — after the verdict, not instead of it.
    expect(corsFindings({ ...base, corsOk: true, credentialedOk: false, preflightOk: true })).toEqual([
      "ok",
      "credentials",
    ]);
    expect(corsFindings({ ...base, corsOk: true, credentialedOk: true, preflightOk: false })).toEqual([
      "ok",
      "preflight",
    ]);
    expect(corsFindings({ ...base, corsOk: true, credentialedOk: false, preflightOk: false })).toEqual([
      "ok",
      "credentials",
      "preflight",
    ]);
  });
});

describe("buildCorsCalls", () => {
  const target = "https://api.example.com/data?q=1&x=2";

  it("encodes the target into the proxy URL", () => {
    const calls = buildCorsCalls("https://corx.test", target);
    expect(calls.proxiedUrl).toBe(`https://corx.test/fetch?url=${encodeURIComponent(target)}`);
    expect(calls.proxiedUrl).not.toContain(target); // the query is encoded, not raw
  });

  it("inlines a public key when the instance has one", () => {
    const calls = buildCorsCalls("https://corx.test", target, "corx_pub_abc");
    expect(calls.proxiedUrl).toContain("&corx-key=corx_pub_abc");
    expect(calls.browser).toContain("corx_pub_abc");
    // The server form never uses the public key: it is the private-key path.
    expect(calls.server).toContain("X-Api-Key");
    expect(calls.server).toContain("process.env.CORX_KEY");
    expect(calls.server).not.toContain("corx_pub_abc");
  });

  it("falls back to an anonymous browser call without a key", () => {
    const calls = buildCorsCalls("https://corx.test", target);
    expect(calls.proxiedUrl).not.toContain("corx-key");
    expect(calls.browser).toContain("keyless");
    expect(calls.browser).not.toContain("X-Api-Key");
  });

  it("advertises the requesting deployment, never a fixed host", () => {
    const calls = buildCorsCalls("https://corx.example", target, "k");
    for (const code of [calls.proxiedUrl, calls.browser, calls.server]) {
      expect(code).toContain("https://corx.example");
      expect(code).not.toContain("corx.dev");
      expect(code).not.toContain("corx.test");
    }
  });
});

describe("cors tester page contract", () => {
  it("renders at all three URLs with canonical, cluster and indexable robots", async () => {
    const cases: Array<[string, string]> = [
      ["/en/tools/cors-tester", "https://corx.test/en/tools/cors-tester"],
      ["/zh/tools/cors-tester", "https://corx.test/zh/tools/cors-tester"],
    ];
    for (const [path, canonical] of cases) {
      const res = await call(path);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`);
      expect(html).toContain('<link rel="alternate" hreflang="en" href="https://corx.test/en/tools/cors-tester"/>');
      expect(html).toContain('<link rel="alternate" hreflang="zh" href="https://corx.test/zh/tools/cors-tester"/>');
      expect(html).toContain(
        '<link rel="alternate" hreflang="x-default" href="https://corx.test/tools/cors-tester"/>',
      );
      expect(html).toContain('name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"');
      expect(html).toContain('<meta property="og:image" content="https://corx.test/og.png"/>');
    }
    const root = await (await call("/tools/cors-tester")).text();
    expect(root).toContain('<link rel="canonical" href="https://corx.test/tools/cors-tester"/>');
  });

  it("ships the tool markup and the honest explanation as text", async () => {
    const html = await (await call("/en/tools/cors-tester")).text();
    // The island's form and its labels are server-rendered (hydrated in place).
    expect(html).toContain("honox-island");
    expect(html).toContain('placeholder="https://api.example.com/data"');
    expect(html).toContain("Cross-origin fetch");
    expect(html).toContain("Opaque probe");
    expect(html).toContain("The preflight fails");
    // The static sections are real content for crawlers, not island-only.
    expect(html).toContain("How the test works");
    expect(html).toContain("Frames are a separate question");
    expect(html).toContain('href="/docs#auth"');
    expect(html).toContain('href="/snippets"');
    expect(html).toContain("#embed-a-page-that-refuses-framing");
  });

  it("inlines the public key only when the instance has one", async () => {
    const without = await (await call("/en/tools/cors-tester")).text();
    expect(without).not.toContain("corx_pub_test");

    const withKey = await (
      await call(
        "/en/tools/cors-tester",
        {},
        { ...env, PUBLIC_KEY: "corx_pub_test" } as Env,
      )
    ).text();
    // Island props carry it; it is public by design and belongs in the snippet.
    expect(withKey).toContain("corx_pub_test");
  });

  it("is translated, not carried over", async () => {
    const zh = await (await call("/zh/tools/cors-tester")).text();
    expect(zh).toContain('<html lang="zh"');
    expect(zh).toContain("CORS 测试器");
    expect(zh).toContain("预检失败");
    expect(zh).not.toContain("The preflight fails");
  });

  it("turns ?lang= into the prefixed URL and remembers /en, /zh", async () => {
    const redirect = await call("/tools/cors-tester?lang=zh");
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("/zh/tools/cors-tester");
    expect(redirect.headers.get("set-cookie")).toContain("corx_lang=zh");

    const en = await call("/en/tools/cors-tester");
    expect(en.headers.get("set-cookie")).toContain("corx_lang=en");
  });

  it("describes the tool as a free WebApplication in JSON-LD", async () => {
    const html = await (await call("/en/tools/cors-tester")).text();
    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const graph = JSON.parse(match![1]!);
    const tool = graph["@graph"][0];
    expect(tool["@type"]).toBe("WebApplication");
    expect(tool["url"]).toBe("https://corx.test/en/tools/cors-tester");
    expect(tool["applicationCategory"]).toBe("DeveloperApplication");
    expect(tool["offers"]).toMatchObject({ price: "0" });
    expect(tool["isPartOf"]["@id"]).toBe("https://corx.test/#website");
    expect(tool["about"]["@id"]).toBe("https://corx.test/#software");
  });

  it("gives way to the proxy on a subdomain host, prefixed URLs included", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("upstream tester", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await worker.fetch(
      new Request("https://example-com.corx.test/zh/tools/cors-tester"),
      { ...env, PROXY_ZONE: "corx.test" } as Env,
      ctx,
    );
    expect(await res.text()).toBe("upstream tester");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("cors tester discovery", () => {
  it("is in the sitemap with its own hreflang cluster", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    for (const path of ["/tools/cors-tester", "/en/tools/cors-tester", "/zh/tools/cors-tester"]) {
      expect(xml).toContain(`<loc>https://corx.test${path}</loc>`);
    }
    expect(xml).toContain(
      '<xhtml:link rel="alternate" hreflang="x-default" href="https://corx.test/tools/cors-tester"/>',
    );
  });

  it("is linked from the landing, llms.txt, llms-full.txt, /docs and the compare pages", async () => {
    const index = await (await call("/llms.txt")).text();
    expect(index).toContain("(https://corx.test/tools/cors-tester)");
    const full = await (await call("/llms-full.txt")).text();
    expect(full).toContain("https://corx.test/tools/cors-tester");

    const landing = await (await call("/en")).text();
    expect(landing).toContain('href="/tools/cors-tester"');
    expect(landing).toContain("Test a URL");
    const landingZh = await (await call("/zh")).text();
    expect(landingZh).toContain('href="/tools/cors-tester"');
    expect(landingZh).toContain("测试某个 URL 的 CORS");

    const docs = await (await call("/en/docs")).text();
    expect(docs).toContain('href="/tools/cors-tester"');

    const compare = await (await call("/en/compare/allorigins")).text();
    expect(compare).toContain('href="/tools/cors-tester"');
  });
});

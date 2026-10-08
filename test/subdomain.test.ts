import { describe, it, expect } from "vitest";
import {
  encodeHostname,
  decodeHostname,
  subdomainTarget,
  resolveRawTarget,
  reservedLabels,
} from "../app/proxy/subdomain.js";
import type { Env } from "../app/lib/types.js";

const env = {} as Env;
const zoneEnv = { PROXY_ZONE: "corx.com" } as Env;

describe("encode/decode round-trip", () => {
  for (const host of ["example.com", "example.org", "my-site.co.uk", "a.b.c.io", "x"]) {
    it(host, () => {
      expect(decodeHostname(encodeHostname(host))).toBe(host);
    });
  }
  it("known vectors", () => {
    expect(encodeHostname("example.com")).toBe("example-com");
    expect(encodeHostname("my-site.co.uk")).toBe("my--site-co-uk");
    expect(decodeHostname("my--site-co-uk")).toBe("my-site.co.uk");
  });
});

describe("subdomainTarget", () => {
  it(".com shorthand", () => {
    const u = new URL("https://example.corx.com/path?a=b");
    expect(subdomainTarget(u, env)).toBe("https://example.com/path?a=b");
  });
  it("full domain with dashes", () => {
    const u = new URL("https://example-org.corx.com/path");
    expect(subdomainTarget(u, env)).toBe("https://example.org/path");
  });
  it("dashes in original host survive", () => {
    const u = new URL("https://my--site-co-uk.corx.com/");
    expect(subdomainTarget(u, env)).toBe("https://my-site.co.uk/");
  });
  it("apex + www serve locally", () => {
    expect(subdomainTarget(new URL("https://corx.com/"), env)).toBeNull();
    expect(subdomainTarget(new URL("https://www.corx.com/"), env)).toBeNull();
  });
  it("workers.dev serves locally", () => {
    expect(subdomainTarget(new URL("https://foo.corx.workers.dev/"), env)).toBeNull();
  });
  it("PROXY_ZONE respected, multi-level rejected", () => {
    expect(subdomainTarget(new URL("https://example.corx.com/"), zoneEnv)).toBe("https://example.com/");
    expect(subdomainTarget(new URL("https://corx.com/"), zoneEnv)).toBeNull();
    expect(subdomainTarget(new URL("https://a.b.corx.com/"), zoneEnv)).toBeNull();
  });
  it("scheme/port overrides + control params stripped", () => {
    const u = new URL("https://example.corx.com/a?corx-scheme=http&corx-port=8080&corx-ttl=60&x=1");
    expect(subdomainTarget(u, env)).toBe("http://example.com:8080/a?x=1");
  });
  it("keeps un-prefixed params: here the query is the target's", () => {
    const u = new URL("https://example.corx.com/a?key=abc&ttl=60&callback=upstream");
    expect(subdomainTarget(u, env)).toBe("https://example.com/a?key=abc&ttl=60&callback=upstream");
  });
  it("bad port throws", () => {
    expect(() => subdomainTarget(new URL("https://example.corx.com/?corx-port=abc"), env)).toThrow();
  });
});

/**
 * Subdomain mode decodes any first label it is given, so a label that names
 * one of corx's own routes must be served locally instead of being fetched as
 * a hostname (`en.<zone>` → https://en.com/ is the classic typo). The list is
 * derived from the route table so a new top-level route cannot be forgotten.
 */
describe("reserved labels cover the app's own routes", () => {
  // Same glob the file router is built from (see the ROUTES option in
  // app/server.ts): the keys are the paths, nothing is loaded.
  const routeFiles = import.meta.glob("../app/routes/**/*.{ts,tsx,md,mdx}");
  const topLevelSegments = [
    ...new Set(
      Object.keys(routeFiles)
        .map((path) => path.replace("../app/routes/", "").split("/")[0] ?? "")
        // `_`-prefixed files are colocated modules, `-`/`$` are excluded from
        // routing, a dotfile is not a route.
        .filter((segment) => segment !== "" && !/^[._$-]/.test(segment))
        .map((segment) => segment.replace(/\.(ts|tsx|md|mdx)$/, ""))
        .filter((segment) => segment !== "index"), // the apex landing page
    ),
  ];

  it("covers every top-level route segment", () => {
    // Canary: an empty derivation would make the assertion below vacuous.
    for (const segment of ["api", "compare", "console", "demo", "docs", "en", "snippets", "terms", "tools", "zh"]) {
      expect(topLevelSegments, segment).toContain(segment);
    }
    const reserved = new Set(reservedLabels());
    const missing = topLevelSegments.filter((segment) => !reserved.has(segment));
    expect(missing).toEqual([]);
  });

  it("covers the routes mounted outside the file router", () => {
    const reserved = new Set(reservedLabels());
    // app/server.ts mounts /fetch and /proxy/* by hand.
    for (const label of ["fetch", "proxy"]) expect(reserved.has(label), label).toBe(true);
  });

  it("serves them locally instead of proxying to that domain", () => {
    for (const label of ["en", "zh", "snippets", "compare", "tools", "demo", "fetch", "proxy", "terms", "docs", "api", "console"]) {
      expect(subdomainTarget(new URL(`https://${label}.corx.com/x`), zoneEnv), label).toBeNull();
    }
  });

  it("still proxies an ordinary subdomain", () => {
    expect(subdomainTarget(new URL("https://example.corx.com/x"), zoneEnv)).toBe("https://example.com/x");
    expect(subdomainTarget(new URL("https://my--site-co-uk.corx.com/x"), zoneEnv)).toBe("https://my-site.co.uk/x");
  });
});

describe("resolveRawTarget precedence", () => {
  it("?url= wins over subdomain", () => {
    const u = new URL("https://example.corx.com/fetch?url=https://other.com/");
    expect(resolveRawTarget(u, env)).toEqual({ target: "https://other.com/", viaSubdomain: false });
  });
  it("path mode wins over subdomain", () => {
    const u = new URL("https://example.corx.com/proxy/https://other.com/");
    expect(resolveRawTarget(u, env)).toEqual({ target: "https://other.com/", viaSubdomain: false });
  });
  it("subdomain fallback flags viaSubdomain", () => {
    const u = new URL("https://example.corx.com/a");
    expect(resolveRawTarget(u, env)).toEqual({ target: "https://example.com/a", viaSubdomain: true });
  });
  it("a caller-supplied target keeps its own control-looking params", () => {
    const target = encodeURIComponent("https://other.com/x?key=abc&ttl=7&callback=upstream");
    const u = new URL(`https://corx.test/fetch?url=${target}`);
    expect(resolveRawTarget(u, env)).toEqual({
      target: "https://other.com/x?key=abc&ttl=7&callback=upstream",
      viaSubdomain: false,
    });
  });
  it("path mode forwards the target's query, minus corx-* control params", () => {
    const u = new URL("https://corx.test/proxy/https://other.com/x?key=abc&corx-ttl=60&corx-key=corx_k&n=2");
    // The query is the proxy's namespace: corx-* names are consumed, the rest
    // rides along to the target (what the /docs page promises).
    expect(resolveRawTarget(u, env)).toEqual({
      target: "https://other.com/x?key=abc&n=2",
      viaSubdomain: false,
    });
  });
  it("path mode without a query keeps the target verbatim", () => {
    const u = new URL("https://corx.test/proxy/https://other.com/x");
    expect(resolveRawTarget(u, env)).toEqual({ target: "https://other.com/x", viaSubdomain: false });
  });
});

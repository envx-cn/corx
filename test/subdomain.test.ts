import { describe, it, expect } from "vitest";
import {
  encodeHostname,
  decodeHostname,
  subdomainTarget,
  resolveRawTarget,
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
    const u = new URL("https://example.corx.com/a?corx-scheme=http&corx-port=8080&ttl=60&x=1");
    expect(subdomainTarget(u, env)).toBe("http://example.com:8080/a?x=1");
  });
  it("bad port throws", () => {
    expect(() => subdomainTarget(new URL("https://example.corx.com/?corx-port=abc"), env)).toThrow();
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
});

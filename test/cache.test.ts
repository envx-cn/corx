import { describe, expect, it } from "vitest";
import { shouldBypassCache, responseCacheable } from "../app/proxy/cache.js";

const url = (qs = "") => new URL(`https://corx.test/https://example.com/a${qs}`);

describe("shouldBypassCache — authenticated requests", () => {
  it("never caches requests carrying Authorization", () => {
    const req = new Request("https://corx.test/https://example.com/a", { headers: { authorization: "Bearer abc" } });
    expect(shouldBypassCache(req, url())).toBe(true);
  });
  it("never caches requests carrying a Cookie header", () => {
    const req = new Request("https://corx.test/https://example.com/a", { headers: { cookie: "session=1" } });
    expect(shouldBypassCache(req, url())).toBe(true);
  });
  it("still caches plain anonymous GETs", () => {
    expect(shouldBypassCache(new Request("https://corx.test/https://example.com/a"), url())).toBe(false);
  });
});

describe("responseCacheable — upstream cache semantics", () => {
  const res = (headers: Record<string, string>) => new Response("x", { headers });

  it("allows plain cacheable 200s", () => {
    expect(responseCacheable(res({}))).toBe(true);
    expect(responseCacheable(res({ "cache-control": "public, max-age=3600" }))).toBe(true);
  });
  it("rejects no-store / private / no-cache / must-revalidate / max-age=0", () => {
    for (const cc of ["no-store", "private", "no-cache", "must-revalidate", "max-age=0", "private, max-age=3600"]) {
      expect(responseCacheable(res({ "cache-control": cc })), cc).toBe(false);
    }
  });
  it("rejects vary on caller-dependent headers", () => {
    for (const v of ["Accept", "Accept-Encoding", "Accept-Language", "Cookie", "Authorization", "User-Agent", "*"]) {
      expect(responseCacheable(res({ vary: v })), v).toBe(false);
    }
  });
  it("allows Vary: Origin (proxy strips Origin before forwarding)", () => {
    expect(responseCacheable(res({ vary: "Origin" }))).toBe(true);
  });
});

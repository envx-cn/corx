import { describe, it, expect } from "vitest";
import { shouldBypassCache, readBounded, ttlSeconds, normalizeCacheTtlInput } from "../src/cache.js";
import { ProxyError } from "../src/types.js";

function req(headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request("https://corx.test/fetch?url=https://example.com/v.mp4", { method, headers });
}

describe("shouldBypassCache", () => {
  it("bypasses Range requests (media seeking)", () => {
    const url = new URL("https://corx.test/https://example.com/v.mp4");
    expect(shouldBypassCache(req({ range: "bytes=0-1023" }), url)).toBe(true);
    expect(shouldBypassCache(req(), url)).toBe(false);
  });
});

describe("normalizeCacheTtlInput", () => {
  it('"" inherits, ints 0–86400 pass', () => {
    expect(normalizeCacheTtlInput("")).toBeNull();
    expect(normalizeCacheTtlInput("300")).toBe(300);
    expect(normalizeCacheTtlInput("0")).toBe(0);
    expect(normalizeCacheTtlInput("86400")).toBe(86400);
  });
  it("rejects garbage", () => {
    for (const bad of ["abc", "-1", "86401", "1.5", "10s"]) {
      expect(() => normalizeCacheTtlInput(bad), bad).toThrowError(ProxyError);
    }
  });
});

describe("per-key cache policy", () => {
  const url = new URL("https://corx.test/https://example.com/a");
  const req = () => new Request("https://corx.test/https://example.com/a");
  it("no_cache key always bypasses", () => {
    expect(shouldBypassCache(req(), url, { cache_ttl: null, no_cache: 1 })).toBe(true);
    expect(shouldBypassCache(req(), url, { cache_ttl: null, no_cache: 0 })).toBe(false);
    expect(shouldBypassCache(req(), url, null)).toBe(false);
  });
  it("ttl precedence: ?ttl= > key > env", () => {
    const env = { CACHE_TTL_SECONDS: "3600" } as import("../src/types.js").Env;
    const key = { cache_ttl: 300 };
    expect(ttlSeconds(env, url, key)).toBe(300);
    expect(ttlSeconds(env, url, null)).toBe(3600);
    expect(ttlSeconds(env, new URL("https://corx.test/x?ttl=60"), key)).toBe(60);
    expect(ttlSeconds(env, url, { cache_ttl: 0 })).toBe(0);
  });
});

describe("readBounded", () => {
  const streamOf = (text: string) => new Response(text).body;
  it("buffers small bodies (e.g. chunked HTML)", async () => {
    const r = await readBounded(streamOf("hello world"), 1024);
    expect("bytes" in r).toBe(true);
    if ("bytes" in r) expect(new TextDecoder().decode(r.bytes)).toBe("hello world");
  });
  it("null body buffers empty", async () => {
    const r = await readBounded(null, 1024);
    expect("bytes" in r && (r as { bytes: Uint8Array }).bytes.byteLength).toBe(0);
  });
  it("overflow re-emits identical bytes as a stream", async () => {
    const big = "x".repeat(3000);
    const r = await readBounded(streamOf(big), 1024);
    expect("stream" in r).toBe(true);
    if ("stream" in r) {
      expect(await new Response(r.stream).text()).toBe(big);
    }
  });
});

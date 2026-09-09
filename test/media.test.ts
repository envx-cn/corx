import { describe, it, expect } from "vitest";
import { shouldBypassCache, isBufferable, CACHE_MAX_BYTES } from "../src/cache.js";

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

describe("isBufferable", () => {
  it("buffers small GET 200s", () => {
    expect(isBufferable(false, "GET", 200, 1024)).toBe(true);
    expect(isBufferable(false, "GET", 200, CACHE_MAX_BYTES)).toBe(true);
  });
  it("streams large, Range/206, non-GET, bypassed, unknown length", () => {
    expect(isBufferable(false, "GET", 200, CACHE_MAX_BYTES + 1)).toBe(false); // large video file
    expect(isBufferable(false, "GET", 206, 1024)).toBe(false); // partial content
    expect(isBufferable(false, "POST", 200, 100)).toBe(false);
    expect(isBufferable(true, "GET", 200, 100)).toBe(false); // bypass (Range/no-cache)
    expect(isBufferable(false, "GET", 200, NaN)).toBe(false); // chunked, unknown length
    expect(isBufferable(false, "GET", 404, 100)).toBe(false);
  });
});

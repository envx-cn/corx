import { describe, expect, it } from "vitest";
import { callerOrigin, extractRawKey } from "../app/lib/auth.js";
import previewSrc from "../app/components/response-preview.tsx?raw";
import demoSrc from "../app/islands/cors-demo.tsx?raw";

/**
 * First-party proxy URLs must keep the Referer: the preview iframe and the raw
 * links re-request the proxy URL from our own page, and a same-origin
 * navigation sends no Origin — suppressing the Referer there made the second
 * request anonymous (the "200 then 401" pair under REQUIRE_API_KEY).
 * `referer` is stripped before forwarding upstream, so nothing leaks.
 */
describe("first-party proxy URLs keep the Referer", () => {
  for (const [name, src] of [
    ["response-preview.tsx", previewSrc],
    ["cors-demo.tsx", demoSrc],
  ] as const) {
    it(`${name} does not suppress it`, () => {
      expect(src).not.toMatch(/referrerpolicy\s*=/);
      expect(src).not.toMatch(/rel="[^"]*noreferrer/);
    });
  }
});

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://corx.test/fetch?url=https://example.com/", { headers });
}

describe("callerOrigin", () => {
  it("prefers the Origin header", () => {
    expect(callerOrigin(req({ origin: "https://app.example", referer: "https://other.example/page" }))).toBe(
      "https://app.example",
    );
  });

  it("falls back to the Referer's origin (same-origin GETs and no-cors loads send no Origin)", () => {
    // Chrome sends Referer but no Origin for: same-origin GET, <img>/<script>
    // no-cors, fetch(mode:"no-cors"), JSONP. Measured, not assumed.
    expect(callerOrigin(req({ referer: "https://app.example/some/page?q=1" }))).toBe("https://app.example");
    expect(callerOrigin(req({ referer: "https://corx.test/" }))).toBe("https://corx.test");
  });

  it("normalizes and rejects unusable values", () => {
    expect(callerOrigin(req({ origin: "https://app.example/" }))).toBe("https://app.example");
    expect(callerOrigin(req({ origin: "null" }))).toBeNull();
    expect(callerOrigin(req({ origin: "not-an-origin" }))).toBeNull();
    expect(callerOrigin(req({ referer: "not-a-url" }))).toBeNull();
    expect(callerOrigin(req())).toBeNull();
  });

  it("never derives an origin from a non-http(s) Referer", () => {
    expect(callerOrigin(req({ referer: "ftp://app.example/x" }))).toBeNull();
  });
});

describe("extractRawKey precedence", () => {
  const url = new URL("https://corx.test/fetch?url=https://example.com/&corx-key=from-query");

  it("header wins over the query string", () => {
    expect(extractRawKey(req({ "x-api-key": "from-header" }), url)).toBe("from-header");
    expect(extractRawKey(req({ authorization: "Bearer from-bearer" }), url)).toBe("from-bearer");
    expect(extractRawKey(req(), url)).toBe("from-query");
    expect(extractRawKey(req(), new URL("https://corx.test/fetch?url=x")), ).toBeNull();
  });
});

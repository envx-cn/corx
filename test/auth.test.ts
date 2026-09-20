import { describe, expect, it } from "vitest";
import { callerOrigin, extractRawKey, lookupKeyByOrigin } from "../app/lib/auth.js";
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

  it("reports the key and which form presented it", () => {
    expect(extractRawKey(req({ "x-api-key": "corx_from-header" }), url)).toEqual({
      raw: "corx_from-header",
      source: "x-api-key",
    });
    expect(extractRawKey(req({ authorization: "Bearer from-bearer" }), url)).toEqual({
      raw: "from-bearer",
      source: "authorization",
    });
    expect(extractRawKey(req(), url)).toEqual({ raw: "from-query", source: "query" });
    expect(extractRawKey(req(), new URL("https://corx.test/fetch?url=x"))).toBeNull();
  });

  it("only a corx-shaped X-Api-Key is the credential; anything else is BYOK and never shadows a bearer credential", () => {
    // A corx-shaped value wins over a bearer header (existing precedence).
    expect(extractRawKey(req({ "x-api-key": "corx_from-header", authorization: "Bearer from-bearer" }), url)).toEqual({
      raw: "corx_from-header",
      source: "x-api-key",
    });
    // A non-corx X-Api-Key is the caller's own upstream credential, not CORX's:
    // it does not consume the request, and the bearer credential still applies.
    expect(extractRawKey(req({ "x-api-key": "sk-upstream-own", authorization: "Bearer corx_valid" }), url)).toEqual({
      raw: "corx_valid",
      source: "authorization",
    });
    // Anything else in Authorization is the caller's own header, not a key.
    expect(extractRawKey(req({ authorization: "Basic dXNlcjpwdw==" }), url)).toEqual({ raw: "from-query", source: "query" });
    expect(extractRawKey(req({ authorization: "Bearer    " }), url)).toEqual({ raw: "from-query", source: "query" });
  });
});

/**
 * D1 stub that captures the statement and its bindings, and returns `row`.
 * `lookupKeyByOrigin` must look up both the exact origin and (for loopback) its
 * port wildcard in one indexed query.
 */
function lookupDb(row: unknown, capture: { sql?: string; binds?: unknown[] }) {
  return {
    prepare: (sql: string) => {
      capture.sql = sql;
      return {
        bind: (...binds: unknown[]) => {
          capture.binds = binds;
          return { first: async () => row };
        },
      };
    },
  } as unknown as D1Database;
}

describe("lookupKeyByOrigin", () => {
  const row = { id: "k1", vars: "[]", header_rules: "[]", param_rules: "[]", response_rules: "[]", revoked_at: null };

  it("queries the exact grant plus a loopback port wildcard", async () => {
    const capture: { sql?: string; binds?: unknown[] } = {};
    const found = await lookupKeyByOrigin(lookupDb(row, capture), "http://localhost:5173");
    expect(found).toBe(row);
    expect(capture.binds).toEqual(["http://localhost:5173", "http://localhost:*", "http://localhost:5173"]);
    // An exact grant must win when a pattern also covers it.
    expect(capture.sql).toContain("ORDER BY (o.origin = ?) DESC");
  });

  it("does not invent a wildcard for a non-loopback host", async () => {
    const capture: { sql?: string; binds?: unknown[] } = {};
    await lookupKeyByOrigin(lookupDb(null, capture), "https://app.example.com");
    expect(capture.binds).toEqual(["https://app.example.com", "https://app.example.com"]);
  });

  it("treats an unknown origin and a revoked key as no grant", async () => {
    const capture: { sql?: string; binds?: unknown[] } = {};
    expect(await lookupKeyByOrigin(lookupDb(null, capture), "https://app.example.com")).toBeNull();
    expect(
      await lookupKeyByOrigin(lookupDb({ ...row, revoked_at: "2026-01-01" }, capture), "https://app.example.com"),
    ).toBeNull();
  });
});

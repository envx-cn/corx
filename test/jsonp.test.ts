import { describe, expect, it } from "vitest";
import { ProxyError } from "../app/lib/types.js";
import { JSONP_MAX_BYTES, isJsonContentType, jsonpCallback, wrapJsonp } from "../app/proxy/jsonp.js";

const url = (q: string) => new URL(`https://corx.test/fetch?url=https://api.example.com/x${q}`);

describe("jsonpCallback", () => {
  it("returns null when JSONP wasn't requested", () => {
    expect(jsonpCallback(url(""))).toBeNull();
  });

  it("accepts simple and dotted identifier paths", () => {
    expect(jsonpCallback(url("&callback=cb"))).toBe("cb");
    expect(jsonpCallback(url("&callback=window.app.onData_2"))).toBe("window.app.onData_2");
    expect(jsonpCallback(url("&callback=%20cb%20"))).toBe("cb"); // trimmed
  });

  it("rejects anything that could break out of the call or execute", () => {
    for (const bad of ["", "1cb", "cb()", "alert(1)", "cb-x", "a..b", "cb;x", "x".repeat(129)]) {
      expect(() => jsonpCallback(url(`&callback=${encodeURIComponent(bad)}`)), bad).toThrowError(ProxyError);
    }
  });

  it("is a 400 so a bad name is readable as a JSON error", () => {
    try {
      jsonpCallback(url("&callback=1bad"));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as ProxyError).status).toBe(400);
    }
  });
});

describe("isJsonContentType", () => {
  it("matches json and +json, ignores others", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/problem+json; charset=utf-8")).toBe(true);
    expect(isJsonContentType("text/plain")).toBe(false);
    expect(isJsonContentType(null)).toBe(false);
  });
});

describe("wrapJsonp", () => {
  it("wraps the body in a call with a leading block comment", () => {
    const out = new TextDecoder().decode(wrapJsonp("cb", new TextEncoder().encode('{"a":1}')));
    expect(out).toBe('/**/ cb({"a":1});\n');
  });

  it("preserves the exact upstream bytes", () => {
    const body = new TextEncoder().encode('{"x":"héllo"}');
    const out = new TextDecoder().decode(wrapJsonp("app.cb", body));
    expect(out).toContain('app.cb({"x":"héllo"})');
  });

  it("caps the wrapped body size", () => {
    expect(JSONP_MAX_BYTES).toBe(2 * 1024 * 1024);
  });
});

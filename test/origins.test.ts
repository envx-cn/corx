import { describe, it, expect } from "vitest";
import { parseOrigins, normalizeOriginsInput, effectiveOrigins, resolveAllowOrigin } from "../app/proxy/cors.js";
import { ProxyError } from "../app/lib/types.js";
import type { Env } from "../app/lib/types.js";

const env = { ALLOWED_ORIGINS: "https://a.example, https://b.example" } as Env;
const openEnv = {} as Env;

function req(origin?: string): Request {
  return new Request("https://corx.test/fetch?url=https://example.com/", {
    headers: origin ? { origin } : {},
  });
}

describe("parseOrigins", () => {
  it("null/empty inherits, * stays *", () => {
    expect(parseOrigins(null)).toBeNull();
    expect(parseOrigins("")).toBeNull();
    expect(parseOrigins("*")).toBe("*");
    expect(parseOrigins("https://a.example, https://b.example/")).toEqual(["https://a.example", "https://b.example"]);
  });
});

describe("normalizeOriginsInput", () => {
  it('"" inherits, "*" allowed', () => {
    expect(normalizeOriginsInput("")).toBeNull();
    expect(normalizeOriginsInput(" * ")).toBe("*");
  });
  it("normalizes lists", () => {
    expect(normalizeOriginsInput("https://a.example/, https://b.example")).toBe("https://a.example, https://b.example");
  });
  it("rejects garbage", () => {
    for (const bad of ["not-a-url", "ftp://x.example", "https://x.example/path", "https://"]) {
      expect(() => normalizeOriginsInput(bad), bad).toThrowError(ProxyError);
    }
  });
});

describe("effectiveOrigins precedence", () => {
  it("per-key wins over global", () => {
    expect(effectiveOrigins(env, { allowed_origins: "https://k.example" })).toEqual(["https://k.example"]);
    expect(effectiveOrigins(env, { allowed_origins: "*" })).toBe("*");
  });
  it("empty key inherits global; empty global means open", () => {
    expect(effectiveOrigins(env, { allowed_origins: null })).toEqual(["https://a.example", "https://b.example"]);
    expect(effectiveOrigins(env, null)).toEqual(["https://a.example", "https://b.example"]);
    expect(effectiveOrigins(openEnv, null)).toBe("*");
  });
});

describe("resolveAllowOrigin with keys", () => {
  it("enforces the per-key list", () => {
    const key = { allowed_origins: "https://k.example" };
    expect(resolveAllowOrigin(req("https://k.example"), env, key)).toBe("https://k.example");
    expect(resolveAllowOrigin(req("https://a.example"), env, key)).toBeNull();
  });
  it("falls back to global for anonymous callers", () => {
    expect(resolveAllowOrigin(req("https://a.example"), env, null)).toBe("https://a.example");
    expect(resolveAllowOrigin(req("https://evil.example"), env, null)).toBeNull();
  });
});

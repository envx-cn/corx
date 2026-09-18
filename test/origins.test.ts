import { describe, it, expect } from "vitest";
import {
  parseOrigins,
  normalizeOriginsInput,
  normalizeOriginPattern,
  portWildcardFor,
  originMatches,
  effectiveOrigins,
  resolveAllowOrigin,
} from "../app/proxy/cors.js";
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
  it("canonicalizes the host case and a default port", () => {
    expect(normalizeOriginsInput("https://App.Example.com:443")).toBe("https://app.example.com");
    expect(normalizeOriginsInput("http://HOST.example:80")).toBe("http://host.example");
    expect(normalizeOriginsInput("http://localhost:5173")).toBe("http://localhost:5173");
  });
  it("accepts a loopback port wildcard", () => {
    for (const p of ["http://localhost:*", "https://localhost:*", "http://127.0.0.1:*", "http://[::1]:*"]) {
      expect(normalizeOriginsInput(p), p).toBe(p);
    }
    expect(normalizeOriginsInput("HTTPS://LOCALHOST:*")).toBe("https://localhost:*");
  });
  it("rejects garbage", () => {
    for (const bad of ["not-a-url", "ftp://x.example", "https://x.example/path", "https://"]) {
      expect(() => normalizeOriginsInput(bad), bad).toThrowError(ProxyError);
    }
  });
  it("rejects host wildcards and non-loopback port wildcards", () => {
    for (const bad of ["https://*.example.com", "https://app.*.com", "https://example.com:*", "http://192.168.1.1:*"]) {
      expect(() => normalizeOriginsInput(bad), bad).toThrowError(ProxyError);
    }
  });

  it("splits on commas and whitespace, like the host list", () => {
    expect(normalizeOriginsInput("https://a.example https://b.example, https://c.example")).toBe(
      "https://a.example, https://b.example, https://c.example",
    );
    expect(normalizeOriginsInput("https://a.example\nhttps://b.example")).toBe("https://a.example, https://b.example");
    expect(parseOrigins("https://a.example\nhttps://b.example")).toEqual(["https://a.example", "https://b.example"]);
  });

  it("names every invalid entry in one message", () => {
    expect(() => normalizeOriginsInput("not-a-url, ftp://x.example")).toThrowError(/: "not-a-url", "ftp:\/\/x\.example"/);
    expect(() => normalizeOriginsInput("https://*.example.com bad")).toThrowError(
      /only valid as a loopback port.*"bad"/,
    );
  });
});

describe("origin patterns", () => {
  it("normalizes a single entry, wildcards included", () => {
    expect(normalizeOriginPattern("https://App.Example.com:443/")).toBe("https://app.example.com");
    expect(normalizeOriginPattern("http://localhost:*")).toBe("http://localhost:*");
    expect(normalizeOriginPattern("https://localhost:*")).toBe("https://localhost:*");
    expect(normalizeOriginPattern("https://*.example.com")).toBeNull();
    expect(normalizeOriginPattern("https://example.com:*")).toBeNull();
  });

  it("only derives a port wildcard for loopback hosts", () => {
    expect(portWildcardFor("http://localhost:5173")).toBe("http://localhost:*");
    expect(portWildcardFor("http://127.0.0.1:8787")).toBe("http://127.0.0.1:*");
    expect(portWildcardFor("http://[::1]:5173")).toBe("http://[::1]:*");
    expect(portWildcardFor("https://app.example.com")).toBeNull();
    expect(portWildcardFor("https://example.com:8443")).toBeNull();
  });

  it("matches exactly, by scheme, and by loopback port only", () => {
    expect(originMatches("https://app.example.com", "https://app.example.com")).toBe(true);
    // A pattern stored before normalization existed still matches.
    expect(originMatches("https://app.example.com", "https://App.Example.com:443")).toBe(true);
    expect(originMatches("https://app.example.com", "http://app.example.com")).toBe(false);
    expect(originMatches("http://localhost:5173", "http://localhost:*")).toBe(true);
    expect(originMatches("http://localhost", "http://localhost:*")).toBe(true);
    expect(originMatches("https://localhost:5173", "http://localhost:*")).toBe(false);
    expect(originMatches("http://127.0.0.1:8080", "http://localhost:*")).toBe(false);
    expect(originMatches("http://localhost.evil.com", "http://localhost:*")).toBe(false);
    expect(originMatches("http://localhost:5173", "https://example.com:*")).toBe(false);
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
  it("matches a loopback port wildcard and a legacy stored value", () => {
    expect(resolveAllowOrigin(req("http://localhost:4321"), { ALLOWED_ORIGINS: "http://localhost:*" } as Env, null)).toBe(
      "http://localhost:4321",
    );
    // Pre-normalization rows (`:443`, host case) match through normalization.
    expect(resolveAllowOrigin(req("https://app.example.com"), env, { allowed_origins: "https://App.Example.com:443" })).toBe(
      "https://app.example.com",
    );
    expect(resolveAllowOrigin(req("http://localhost.evil.com"), { ALLOWED_ORIGINS: "http://localhost:*" } as Env, null)).toBeNull();
  });
});

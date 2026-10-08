import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import {
  normalizeCidrsInput,
  normalizeExpiresInput,
  normalizeMethodsInput,
  normalizePathsInput,
} from "../app/lib/admin.js";
import { assertKeyScope, assertKeyTargetScope, methodAllowed, pathAllowed } from "../app/proxy/inject.js";
import { ipAllowed, parseCidr } from "../app/proxy/ip.js";
import { ProxyError } from "../app/lib/types.js";
import type { ApiKeyRow, Env } from "../app/lib/types.js";

/**
 * #112 — a key's reach used to be its host allowlist and nothing else. These
 * fields narrow it further, and every one of them is opt-in: an unset field
 * means exactly what it meant before.
 */

function scope(over: Partial<ApiKeyRow> = {}) {
  return {
    allowed_methods: null,
    allowed_paths: null,
    require_https: 0,
    allowed_cidrs: null,
    expires_at: null,
    ...over,
  } as Pick<ApiKeyRow, "allowed_methods" | "allowed_paths" | "require_https" | "allowed_cidrs" | "expires_at">;
}

describe("normalizers", () => {
  it("methods: known set, GET implies HEAD", () => {
    expect(normalizeMethodsInput("")).toBeNull();
    expect(normalizeMethodsInput(null)).toBeNull();
    expect(normalizeMethodsInput("get")).toBe("GET, HEAD");
    expect(normalizeMethodsInput("post, put")).toBe("POST, PUT"); // stored in the canonical method order
    expect(normalizeMethodsInput("GET POST")).toBe("GET, HEAD, POST");
    expect(() => normalizeMethodsInput("FETCH")).toThrowError(ProxyError);
  });

  it("paths: absolute, no query, one form per prefix", () => {
    expect(normalizePathsInput("")).toBeNull();
    expect(normalizePathsInput("/v1/,/v1 /v2/")).toBe("/v1, /v2");
    expect(normalizePathsInput("/")).toBe("/");
    expect(() => normalizePathsInput("v1")).toThrowError(ProxyError);
    expect(() => normalizePathsInput("/v1?x=1")).toThrowError(ProxyError);
  });

  it("cidrs: only parseable addresses, normalized", () => {
    expect(normalizeCidrsInput("")).toBeNull();
    expect(normalizeCidrsInput("203.0.113.7, 2001:DB8::/32")).toBe("203.0.113.7, 2001:db8::/32");
    expect(() => normalizeCidrsInput("10.0.0.0/99")).toThrowError(ProxyError);
    expect(() => normalizeCidrsInput("not-an-ip")).toThrowError(ProxyError);
  });

  it("expiry: blank, ISO, or a plain date (end of that UTC day)", () => {
    expect(normalizeExpiresInput("")).toBeNull();
    expect(normalizeExpiresInput("2026-12-31")).toBe("2026-12-31T23:59:59.000Z");
    expect(normalizeExpiresInput("2030-01-01T00:00:00Z")).toBe("2030-01-01T00:00:00.000Z");
    // A past date is allowed: that is how an operator expires without revoking.
    expect(normalizeExpiresInput("2020-01-01")).toBe("2020-01-01T23:59:59.000Z");
    expect(() => normalizeExpiresInput("next tuesday")).toThrowError(ProxyError);
  });
});

describe("CIDR matching", () => {
  it("v4 and v6 ranges, bare IPs, and no-match cases", () => {
    expect(ipAllowed("203.0.113.9", "203.0.113.0/24")).toBe(true);
    expect(ipAllowed("203.0.114.9", "203.0.113.0/24")).toBe(false);
    expect(ipAllowed("198.51.100.7", "203.0.113.0/24, 198.51.100.7")).toBe(true);
    expect(ipAllowed("2001:db8::1", "2001:db8::/32")).toBe(true);
    expect(ipAllowed("2001:db9::1", "2001:db8::/32")).toBe(false);
    expect(ipAllowed("0.0.0.0", "0.0.0.0/0")).toBe(true);
  });

  it("an empty list is no restriction; no client IP cannot satisfy a list", () => {
    expect(ipAllowed("1.2.3.4", null)).toBe(true);
    expect(ipAllowed("1.2.3.4", "")).toBe(true);
    expect(ipAllowed("", "203.0.113.0/24")).toBe(false);
  });

  it("parses only what it can", () => {
    expect(parseCidr("10.0.0.1")).toEqual({ base: 167772161, bits: 32, v6: false });
    expect(parseCidr("10.0.0.0/8")).toEqual({ base: 167772160, bits: 8, v6: false });
    expect(parseCidr("10.0.0.0/33")).toBeNull();
    expect(parseCidr("nope/8")).toBeNull();
  });
});

describe("scope predicates", () => {
  it("methods", () => {
    expect(methodAllowed(scope(), "DELETE")).toBe(true);
    expect(methodAllowed(scope({ allowed_methods: "GET, HEAD" }), "GET")).toBe(true);
    expect(methodAllowed(scope({ allowed_methods: "GET, HEAD" }), "HEAD")).toBe(true);
    expect(methodAllowed(scope({ allowed_methods: "POST" }), "GET")).toBe(false);
    expect(methodAllowed(scope({ allowed_methods: "GET" }), "HEAD")).toBe(true); // implied
  });

  it("paths respect segment boundaries", () => {
    const row = scope({ allowed_paths: "/api, /v2/embed" });
    expect(pathAllowed(row, "/api")).toBe(true);
    expect(pathAllowed(row, "/api/users")).toBe(true);
    expect(pathAllowed(row, "/apix")).toBe(false);
    expect(pathAllowed(row, "/v2/embed/player")).toBe(true);
    expect(pathAllowed(row, "/admin")).toBe(false);
    expect(pathAllowed(scope({ allowed_paths: "/" }), "/anything")).toBe(true);
  });
});

describe("assertions", () => {
  it("name the rule that refused the request", () => {
    expect(() => assertKeyScope(scope({ allowed_methods: "GET" }), "DELETE", "1.2.3.4")).toThrowError(/may not use DELETE/);
    expect(() => assertKeyScope(scope({ allowed_cidrs: "203.0.113.0/24" }), "GET", "198.51.100.1")).toThrowError(
      /not in this key/,
    );
    expect(() => assertKeyScope(scope({ expires_at: "2020-01-01T00:00:00.000Z" }), "GET", "1.2.3.4")).toThrowError(/expired/);
    expect(() => assertKeyTargetScope(scope({ require_https: 1 }), new URL("http://api.vendor.com/x"))).toThrowError(
      /only allows https/,
    );
    expect(() => assertKeyTargetScope(scope({ allowed_paths: "/api" }), new URL("https://api.vendor.com/admin"))).toThrowError(
      /outside this key/,
    );
  });

  it("pass when nothing is configured", () => {
    expect(() => assertKeyScope(scope(), "DELETE", "")).not.toThrow();
    expect(() => assertKeyTargetScope(scope(), new URL("http://api.vendor.com/x"))).not.toThrow();
  });

  it("an unparseable expiry refuses rather than granting", () => {
    expect(() => assertKeyScope(scope({ expires_at: "not-a-date" }), "GET", "1.2.3.4")).toThrowError(/expired/);
  });
});

// ---------- integration ----------

function scopedEnv(row: Record<string, unknown>) {
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => ({ meta: { changes: 1 } }),
      first: async () => (sql.includes("FROM api_keys") ? row : sql.includes("rate_windows") ? { count: 1 } : null),
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return {
    DB: { prepare: stmt },
    CACHE_BUCKET: {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ objects: [], truncated: false }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;
const auth = { "x-api-key": "corx_k", "cf-connecting-ip": "203.0.113.9" };

function baseRow(over: Record<string, unknown> = {}) {
  return {
    id: "k1",
    key_hash: "h",
    name: "scoped",
    rate_limit_per_min: null,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    vars: "[]",
    header_rules: "[]",
    param_rules: "[]",
    response_rules: "[]",
    allowed_hosts: null,
    keyless: 0,
    tier: "standard",
    daily_limit_per_origin: null,
    daily_limit_per_host: null,
    daily_limit_total: null,
    allowed_methods: null,
    allowed_paths: null,
    require_https: 0,
    allowed_cidrs: null,
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
    ...over,
  };
}

function stubUpstream() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      calls.push(url);
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/api/data");

afterEach(() => vi.unstubAllGlobals());

describe("proxy: per-key scope", () => {
  it("allows what the scope permits", async () => {
    stubUpstream();
    const env = scopedEnv(baseRow({ allowed_methods: "GET, HEAD", allowed_paths: "/api", allowed_cidrs: "203.0.113.0/24", require_https: 1 }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`, { headers: auth }), env, ctx);
    expect(res.status).toBe(200);
  });

  it("403s a method the key does not allow, before any upstream call", async () => {
    const calls = stubUpstream();
    const env = scopedEnv(baseRow({ allowed_methods: "GET" }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`, { method: "DELETE", headers: auth }), env, ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("may not use DELETE") });
    expect(calls).toHaveLength(0);
  });

  it("403s a path outside the allowlist, even via a redirect-free direct call", async () => {
    const calls = stubUpstream();
    const env = scopedEnv(baseRow({ allowed_paths: "/api" }));
    const res = await worker.fetch(
      new Request("https://corx.test/fetch?url=" + encodeURIComponent("https://api.vendor.com/admin/keys"), {
        headers: auth,
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("403s an http target for an https-only key", async () => {
    const calls = stubUpstream();
    const env = scopedEnv(baseRow({ require_https: 1 }));
    const res = await worker.fetch(
      new Request("https://corx.test/fetch?url=" + encodeURIComponent("http://api.vendor.com/api/data"), { headers: auth }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("403s a caller outside the CIDR list", async () => {
    const calls = stubUpstream();
    const env = scopedEnv(baseRow({ allowed_cidrs: "198.51.100.0/24" }));
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { ...auth, "cf-connecting-ip": "203.0.113.9" } }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("403s an expired key", async () => {
    const calls = stubUpstream();
    const env = scopedEnv(baseRow({ expires_at: "2020-06-01T00:00:00.000Z" }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`, { headers: auth }), env, ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("expired") });
    expect(calls).toHaveLength(0);
  });

  it("leaves an unscoped key exactly as permissive as before", async () => {
    const calls = stubUpstream();
    const env = scopedEnv(baseRow());
    for (const [method, target] of [
      ["DELETE", "https://api.vendor.com/admin"],
      ["GET", "http://api.vendor.com/x"],
    ] as const) {
      const res = await worker.fetch(
        new Request("https://corx.test/fetch?url=" + encodeURIComponent(target), { method, headers: auth }),
        env,
        ctx,
      );
      expect(res.status, `${method} ${target}`).toBe(200);
    }
    expect(calls).toHaveLength(2);
  });
});

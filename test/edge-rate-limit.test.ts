import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { checkRateLimit, resetRateLimitWarnings } from "../app/proxy/ratelimit.js";
import { normalizeRateLimitMode } from "../app/lib/admin.js";
import { ProxyError } from "../app/lib/types.js";
import type { Env } from "../app/lib/types.js";

/**
 * #118 (option B) — the opt-in edge limiter.
 *
 * The point of `limit({ key })` is that the counter is namespaced, so corx's
 * bucket shapes survive: the same bucket key (per key / per IP / per origin+IP)
 * is handed to the binding instead of to a D1 row. What is given up is
 * documented on `checkRateLimit` and pinned here: the limit belongs to the
 * binding, counters are per isolate, and there are no numbers to report.
 *
 * Every failure path degrades to the D1 window — a deployment that opted into a
 * cheaper meter must not have opted into being unmetered.
 */

/** D1 stub that records the rate-window statements it was asked to run. */
function dbSpy(used = 1) {
  const statements: string[] = [];
  const db = {
    prepare: (sql: string) => {
      statements.push(sql.replace(/\s+/g, " ").trim());
      const stmt = {
        bind: () => stmt,
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => ({ count: used }),
        all: async () => ({ results: [] }),
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, statements };
}

/** Binding stub: answers per key, and can be told to fail. */
function bindingStub(opts: { success?: boolean | ((key: string) => boolean); throw?: boolean } = {}) {
  const keys: string[] = [];
  const binding = {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      if (opts.throw) throw new Error("binding exploded");
      const success = typeof opts.success === "function" ? opts.success(key) : (opts.success ?? true);
      return { success };
    },
  };
  return { binding: binding as unknown as RateLimit, keys };
}

function env(binding?: RateLimit): Env {
  return { DB: dbSpy().db, RATE_LIMITER: binding } as unknown as Env;
}

beforeEach(() => {
  resetRateLimitWarnings();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  resetRateLimitWarnings();
});

describe("rate limiter: d1 (default)", () => {
  it("counts in D1 and reports the numbers", async () => {
    const { db, statements } = dbSpy(3);
    const out = await checkRateLimit(db, env(), "rl:key-1", { customLimit: 60 });
    expect(out).toEqual({ limit: 60, remaining: 57, source: "d1" });
    expect(statements.join(" ")).toContain("INSERT INTO rate_windows");
  });

  it("429s over the limit, with the limit named", async () => {
    const { db } = dbSpy(61);
    await expect(checkRateLimit(db, env(), "rl:key-1", { customLimit: 60 })).rejects.toThrowError(/60\/min/);
  });

  it("fails open when D1 errors", async () => {
    const db = {
      prepare: () => {
        throw new Error("d1 down");
      },
    } as unknown as D1Database;
    await expect(checkRateLimit(db, env(), "rl:key-1")).resolves.toMatchObject({ source: "d1", limit: 60 });
  });
});

describe("rate limiter: edge", () => {
  it("meters through the binding and writes no D1 row", async () => {
    const { binding, keys } = bindingStub();
    const { db, statements } = dbSpy();
    const out = await checkRateLimit(db, env(binding), "rl:public:ip:203.0.113.9", { mode: "edge" });
    expect(out).toEqual({ limit: null, remaining: null, source: "edge" });
    // The bucket identity is handed over verbatim, so per-IP stays per-IP.
    expect(keys).toEqual(["rl:public:ip:203.0.113.9"]);
    expect(statements).toEqual([]);
  });

  it("429s when the binding says so, without inventing a limit", async () => {
    const { binding } = bindingStub({ success: false });
    const { db } = dbSpy();
    const err = await checkRateLimit(db, env(binding), "rl:key-1", { mode: "edge" }).catch((e) => e);
    expect(err).toBeInstanceOf(ProxyError);
    expect((err as ProxyError).status).toBe(429);
    expect((err as ProxyError).message).toContain("edge limiter");
    expect((err as ProxyError).message).not.toMatch(/\d+\/min/); // no number we cannot stand behind
    expect((err as ProxyError).data?.["retryAfter"]).toBeUndefined();
  });

  it("keys the counter by bucket, so one caller's counter is not another's", async () => {
    // Stand in for the binding's own storage: one counter per key string.
    const counters = new Map<string, number>();
    const { binding, keys } = bindingStub({
      success: (key) => {
        const n = counters.get(key) ?? 0;
        counters.set(key, n + 1);
        return n < 1; // one request per bucket key, then over
      },
    });
    const { db } = dbSpy();
    const run = (bucket: string) => checkRateLimit(db, env(binding), bucket, { mode: "edge" });

    await expect(run("rl:public:ip:1.1.1.1")).resolves.toMatchObject({ source: "edge" });
    await expect(run("rl:public:ip:2.2.2.2")).resolves.toMatchObject({ source: "edge" });
    // Each bucket has its own counter: exhausting one leaves the other alone.
    await expect(run("rl:public:ip:1.1.1.1")).rejects.toThrowError(/edge limiter/);
    await expect(run("rl:public:ip:2.2.2.2")).rejects.toThrowError(/edge limiter/);
    expect(keys).toEqual([
      "rl:public:ip:1.1.1.1",
      "rl:public:ip:2.2.2.2",
      "rl:public:ip:1.1.1.1",
      "rl:public:ip:2.2.2.2",
    ]);
  });

  it("falls back to D1 when no binding is configured, and warns once", async () => {
    const { db, statements } = dbSpy(1);
    const out = await checkRateLimit(db, env(), "rl:key-1", { mode: "edge", customLimit: 120 });
    expect(out).toEqual({ limit: 120, remaining: 119, source: "d1" });
    expect(statements.join(" ")).toContain("INSERT INTO rate_windows");
    // Once per isolate, not once per request.
    await checkRateLimit(db, env(), "rl:key-2", { mode: "edge" });
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain("RATE_LIMITER");
  });

  it("falls back to D1 when the binding throws, and keeps counting", async () => {
    const { binding } = bindingStub({ throw: true });
    const { db, statements } = dbSpy(2);
    const out = await checkRateLimit(db, env(binding), "rl:key-1", { mode: "edge", customLimit: 60 });
    expect(out).toEqual({ limit: 60, remaining: 58, source: "d1" });
    expect(statements.join(" ")).toContain("INSERT INTO rate_windows");
    expect(vi.mocked(console.warn).mock.calls[0]?.[0]).toContain("RATE_LIMITER");
  });

  it("still enforces the limit after a binding failure", async () => {
    const { binding } = bindingStub({ throw: true });
    const { db } = dbSpy(61);
    await expect(
      checkRateLimit(db, env(binding), "rl:key-1", { mode: "edge", customLimit: 60 }),
    ).rejects.toThrowError(/60\/min/);
  });
});

describe("rate limit mode input", () => {
  it("accepts the two modes, and treats blank as d1", () => {
    expect(normalizeRateLimitMode("")).toBe("d1");
    expect(normalizeRateLimitMode(undefined)).toBe("d1");
    expect(normalizeRateLimitMode(false)).toBe("d1");
    expect(normalizeRateLimitMode("EDGE")).toBe("edge");
    expect(normalizeRateLimitMode(true)).toBe("edge"); // the console form's switch
  });

  it("rejects anything else with a 400 — a key must not look edge-metered and not be", () => {
    for (const bad of ["kv", "d1,edge", "yes", "1"]) {
      expect(() => normalizeRateLimitMode(bad), bad).toThrowError(ProxyError);
      try {
        normalizeRateLimitMode(bad);
      } catch (err) {
        expect((err as ProxyError).status, bad).toBe(400);
      }
    }
  });
});

// ---------- integration through the real handler ----------

function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: "k1",
    key_hash: "h",
    name: "app",
    rate_limit_per_min: 60,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    rate_limit_mode: "d1",
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

function proxyEnv(row: Record<string, unknown>, binding?: RateLimit, bucketHit = false) {
  const sqls: string[] = [];
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => {
        sqls.push(sql.replace(/\s+/g, " ").trim());
        return { meta: { changes: 1 } };
      },
      first: async () => {
        sqls.push(sql.replace(/\s+/g, " ").trim());
        if (sql.includes("FROM api_keys")) return row;
        if (sql.includes("quota_counters")) return { count: 1 };
        if (sql.includes("rate_windows")) return { count: 1 };
        return null; // blocklist
      },
      all: async () => ({ results: [] }),
    };
    return s;
  };
  const env = {
    DB: { prepare: stmt },
    CACHE_BUCKET: {
      get: async () => (bucketHit ? null : null),
      put: async () => undefined,
      list: async () => ({ objects: [], truncated: false }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
    RATE_LIMITER: binding,
  } as unknown as Env;
  return { env, sqls };
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;
const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/data");

function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("proxy: which limiter runs", () => {
  it("a d1 key writes the window and reports the numbers", async () => {
    stubUpstream();
    const { binding } = bindingStub();
    const { env, sqls } = proxyEnv(keyRow(), binding);
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_k" } }), env, ctx);
    expect(res.status).toBe(200);
    expect(sqls.some((s) => s.includes("rate_windows"))).toBe(true);
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
    expect(res.headers.get("x-ratelimit-remaining")).toBe("59");
  });

  it("an edge key writes no window, reports no numbers, and still proxies", async () => {
    stubUpstream();
    const { binding, keys } = bindingStub();
    const { env, sqls } = proxyEnv(keyRow({ rate_limit_mode: "edge" }), binding);
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_k" } }), env, ctx);
    expect(res.status).toBe(200);
    expect(sqls.some((s) => s.includes("rate_windows"))).toBe(false);
    expect(keys).toEqual(["rl:k1"]);
    // The binding cannot report numbers, so the headers are omitted, not guessed.
    expect(res.headers.get("x-ratelimit-limit")).toBeNull();
    expect(res.headers.get("x-ratelimit-remaining")).toBeNull();
  });

  it("an edge key gets a 429 from the binding, with CORS-readable CORS headers", async () => {
    stubUpstream();
    const { binding } = bindingStub({ success: false });
    const { env } = proxyEnv(keyRow({ rate_limit_mode: "edge" }), binding);
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_k", origin: "https://app.example" } }),
      env,
      ctx,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("edge limiter") });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("an edge key with no binding configured behaves like d1", async () => {
    stubUpstream();
    const { env, sqls } = proxyEnv(keyRow({ rate_limit_mode: "edge" }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_k" } }), env, ctx);
    expect(res.status).toBe(200);
    expect(sqls.some((s) => s.includes("rate_windows"))).toBe(true);
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
  });
});
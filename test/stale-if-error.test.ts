import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { staleGraceSecs } from "../app/proxy/cache.js";
import type { Env } from "../app/lib/types.js";

/**
 * #114 — stale-if-error. A CORS proxy in front of a flaky third-party API can
 * hold a perfectly good body in R2 and still hand the caller a 502; this is
 * the single most valuable thing the cache could do and it could not do
 * anything.
 *
 * The invariants the suite pins, because each one is a way to abuse the feature:
 *  - OFF by default, and an expired entry is still deleted on the next read;
 *  - a stale entry is never served on a plain miss — only on an upstream
 *    5xx / failed fetch / timeout;
 *  - nothing outside the cache path can ever reach it (authenticated caller,
 *    Range, JSONP, a key with header rules);
 *  - the blocklist still wins, because it is checked before the cache.
 */

/** R2 mock with the subset the cache uses. */
function memoryBucket() {
  const store = new Map<string, { body: ArrayBuffer; customMetadata: Record<string, string> }>();
  const bucket = {
    get: async (key: string) => {
      const hit = store.get(key);
      return hit ? { key, arrayBuffer: async () => hit.body, customMetadata: hit.customMetadata } : null;
    },
    put: async (key: string, body: ArrayBuffer, opts?: { customMetadata?: Record<string, string> }) => {
      store.set(key, { body, customMetadata: opts?.customMetadata ?? {} });
    },
    list: async () => ({ objects: [], truncated: false }),
    delete: async (key: string) => {
      store.delete(key);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, store };
}

/** D1 stub; `blocked` makes the admin blocklist answer with a row. */
function mockDb(blocked = false) {
  const q = (sql: string) => ({
    bind: () => q(sql),
    run: async () => ({ meta: { changes: 1 } }),
    first: async () => {
      if (sql.includes("blocked_hosts")) return blocked ? { hostname: "api.vendor.com" } : null;
      if (sql.includes("quota_counters") || sql.includes("rate_windows")) return { count: 1 };
      return null;
    },
    all: async () => ({ results: [] }),
  });
  return { prepare: (sql: string) => q(sql) };
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;
const flush = () => new Promise((r) => setTimeout(r, 0));
const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/data");

function env(staleSecs: string, bucket: R2Bucket, blocked = false) {
  return {
    DB: mockDb(blocked),
    CACHE_BUCKET: bucket,
    CACHE_STALE_SECONDS: staleSecs,
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
}

/** Upstream stub: DoH answers public, the target behaves as `upstream`. */
function stubUpstream(upstream: () => Response | Promise<Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      calls.push(url);
      return upstream();
    }),
  );
  return calls;
}

const ok = () => new Response('{"cached":true}', { status: 200, headers: { "content-type": "application/json" } });

type Store = Map<string, { body: ArrayBuffer; customMetadata: Record<string, string> }>;

/** Prime the cache with a healthy upstream, then age the stored entry. */
async function prime(e: Env, grace: number, store: Store) {
  stubUpstream(ok);
  const first = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
  await flush();
  expect(first.status).toBe(200);
  for (const entry of store.values()) {
    entry.customMetadata["storedAt"] = String(Date.now() - 300_000); // five minutes ago
    entry.customMetadata["expiresAt"] = String(Date.now() - 1000);
    if (grace > 0) entry.customMetadata["staleUntil"] = String(Date.now() + grace * 1000);
  }
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe("staleGraceSecs", () => {
  it("is off unless set to a sane positive integer", () => {
    expect(staleGraceSecs({})).toBe(0);
    expect(staleGraceSecs({ CACHE_STALE_SECONDS: "0" })).toBe(0);
    expect(staleGraceSecs({ CACHE_STALE_SECONDS: "-5" })).toBe(0);
    expect(staleGraceSecs({ CACHE_STALE_SECONDS: "1.5" })).toBe(0);
    expect(staleGraceSecs({ CACHE_STALE_SECONDS: "999999" })).toBe(0);
    expect(staleGraceSecs({ CACHE_STALE_SECONDS: "600" })).toBe(600);
  });
});

describe("stale-if-error — off by default", () => {
  it("serves the upstream 500, not the cached body", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("0", bucket);
    await prime(e, 0, store);
    stubUpstream(() => new Response("vendor exploded", { status: 500 }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    expect(res.status).toBe(500);
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(await res.text()).toBe("vendor exploded");
  });

  it("deletes the expired entry on read (no grace ⇒ no stale copy survives)", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("0", bucket);
    await prime(e, 0, store);
    expect(store.size).toBe(1);
    stubUpstream(() => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    await flush();
    // Re-stored with a fresh TTL rather than left behind as a stale copy.
    expect(Number([...store.values()][0]!.customMetadata["expiresAt"])).toBeGreaterThan(Date.now());
  });
});

describe("stale-if-error — enabled", () => {
  it("serves the stale body when the upstream answers 5xx", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    stubUpstream(() => new Response("vendor exploded", { status: 503 }));

    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    expect(res.status).toBe(200); // the cached entry's status, not the upstream's
    expect(await res.text()).toBe('{"cached":true}');
    expect(res.headers.get("x-corx-cache")).toBe("STALE");
    expect(res.headers.get("warning")).toContain("110");
    expect(Number(res.headers.get("age"))).toBeGreaterThan(0);
    expect(res.headers.get("x-corx-target")).toBe("api.vendor.com");
  });

  it("serves it when the fetch fails or times out", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    // GET retries once on a network error, then the handler throws a 502.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (String(input).includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        throw new TypeError("network down");
      }),
    );
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-corx-cache")).toBe("STALE");
    expect(await res.text()).toBe('{"cached":true}');
  });

  it("still serves a fresh hit without touching the upstream", async () => {
    const { bucket } = memoryBucket();
    const e = env("3600", bucket);
    stubUpstream(ok);
    await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    await flush();
    const calls = stubUpstream(() => new Response("should not be called", { status: 500 }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    expect(res.headers.get("x-corx-cache")).toBe("HIT");
    expect(calls).toHaveLength(0);
  });

  it("never serves stale on a plain miss — only on an upstream failure", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    stubUpstream(() => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(await res.json()).toEqual({}); // the upstream's body, not the cached one
    expect(store.size).toBe(1);
  });

  it("keeps a 4xx honest: a bad request is the caller's problem", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    // The transform check rejects a non-text response with a 400 before the
    // upstream 5xx branch can run.
    stubUpstream(() => new Response("boom", { status: 500, headers: { "content-type": "image/png" } }));
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}&corx-wrap=json`),
      e,
      ctx,
    );
    expect(res.status).toBe(400);
    expect(res.headers.get("x-corx-cache")).toBeNull();
  });

  it("does not serve stale to an authenticated caller", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    stubUpstream(() => new Response("vendor exploded", { status: 500 }));
    // Authorization bypasses the cache entirely, so there is nothing to serve.
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { authorization: "Bearer caller-token" } }),
      e,
      ctx,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("x-corx-cache")).not.toBe("STALE");
  });

  it("does not serve stale for a Range request", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    stubUpstream(() => new Response("", { status: 206, headers: { "content-type": "video/mp4" } }));
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { range: "bytes=0-3" } }),
      e,
      ctx,
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
  });

  it("a host blocked after the fact still wins over a stale body", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket, /* blocked */ true);
    // Its own host: `api.vendor.com` is already memoized as allowed by the
    // cases above (the blocklist memo is per isolate, i.e. per module here).
    const blockedTarget = "/fetch?url=" + encodeURIComponent("https://blocked.vendor.com/data");
    stubUpstream(ok);
    await worker.fetch(new Request(`https://corx.test${blockedTarget}`), e, ctx);
    await flush();
    for (const entry of store.values()) {
      entry.customMetadata["storedAt"] = String(Date.now() - 300_000);
      entry.customMetadata["expiresAt"] = String(Date.now() - 1000);
      entry.customMetadata["staleUntil"] = String(Date.now() + 3600_000);
    }
    const calls = stubUpstream(() => new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));

    const res = await worker.fetch(new Request(`https://corx.test${blockedTarget}`), e, ctx);
    expect(res.status).toBe(403);
    expect(res.headers.get("x-corx-cache")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("drops the entry once the grace window closes", async () => {
    const { bucket, store } = memoryBucket();
    const e = env("3600", bucket);
    await prime(e, 3600, store);
    for (const entry of store.values()) entry.customMetadata["staleUntil"] = String(Date.now() - 1);
    stubUpstream(() => new Response("vendor exploded", { status: 500 }));
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), e, ctx);
    expect(res.status).toBe(500);
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
  });
});
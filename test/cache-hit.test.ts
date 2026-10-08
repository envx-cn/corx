import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

/**
 * #108 — what a cache HIT is allowed to do. Three gaps, all of them visible
 * to any downstream cache (a browser, a CDN, another proxy):
 *
 *  - the upstream's `Age` / original `Date` were stored and replayed, so a
 *    downstream cache computed freshness from a timestamp that was already
 *    stale on the first HIT;
 *  - a caller holding the entry's `ETag` got the whole body back instead of
 *    a `304`;
 *  - `HEAD` bypassed the cache entirely and paid a full upstream fetch.
 */

/** In-memory R2 with the subset getCached/putCached/pruneExpiredCache use. */
function memoryBucket() {
  const store = new Map<string, { body: ArrayBuffer; customMetadata: Record<string, string> }>();
  const bucket = {
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return { key, arrayBuffer: async () => entry.body, customMetadata: entry.customMetadata };
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

const baseEnv = {
  DB: { prepare: () => ({}) },
  ADMIN_TOKEN: "test-token",
  ALLOWED_ORIGINS: "*",
} as unknown as Env;

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

/** Upstream stub: DoH answers public, the target answers `headers` once. */
function stubUpstream(headers: Record<string, string>, body = '{"ok":true}') {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      calls.push(url);
      return new Response(body, { status: 200, headers: { "content-type": "application/json", ...headers } });
    }),
  );
  return calls;
}

const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/data");
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.unstubAllGlobals());

/** Prime the cache with one MISS + HIT pair. */
async function warm(env: Env, headers: Record<string, string>) {
  const calls = stubUpstream(headers);
  const miss = await worker.fetch(new Request(`https://corx.test${TARGET}`), env, ctx);
  await flush();
  expect(miss.headers.get("x-corx-cache")).toBe("MISS");
  return calls;
}

describe("cache HIT: Age and Date are corx's own", () => {
  it("never replays the origin's Age, and reports its own residency", async () => {
    const { bucket, store } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const calls = await warm(env, { date: "Mon, 01 Jan 2024 00:00:00 GMT", age: "17", etag: 'W/"abc"' });

    // Nothing from the origin's own timing survives into the stored entry.
    const stored = [...store.values()][0]!;
    const storedHeaders = JSON.parse(stored.customMetadata["headers"] ?? "{}") as Record<string, string>;
    expect(storedHeaders["age"]).toBeUndefined();
    expect(storedHeaders["date"]).toBeUndefined();
    expect(storedHeaders["etag"]).toBe('W/"abc"');

    const hit = await worker.fetch(new Request(`https://corx.test${TARGET}`), env, ctx);
    expect(hit.status).toBe(200);
    expect(hit.headers.get("x-corx-cache")).toBe("HIT");
    expect(hit.headers.get("age")).toBe("0");
    expect(hit.headers.get("date")).not.toBe("Mon, 01 Jan 2024 00:00:00 GMT");
    expect(calls.length).toBe(1);
  });

  it("grows Age with the entry's residency", async () => {
    const { bucket, store } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    await warm(env, { etag: '"v1"' });
    // Age is computed from storedAt, so a known-stored entry reads back as aged.
    const entry = [...store.entries()][0]!;
    store.set(entry[0], {
      body: entry[1].body,
      customMetadata: { ...entry[1].customMetadata, storedAt: String(Date.now() - 120_000) },
    });
    const hit = await worker.fetch(new Request(`https://corx.test${TARGET}`), env, ctx);
    expect(Number(hit.headers.get("age"))).toBeGreaterThanOrEqual(119);
  });
});

describe("cache HIT: conditional requests", () => {
  it("answers 304 when the caller's ETag is the one we hold", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const calls = await warm(env, { etag: '"abc"' });

    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "if-none-match": '"abc"' } }),
      env,
      ctx,
    );
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
    expect(res.headers.get("etag")).toBe('"abc"');
    expect(res.headers.get("x-corx-cache")).toBe("HIT");
    expect(res.headers.get("content-length")).toBeNull();
    // No body bytes and no second upstream call — the point of the change.
    expect(calls.length).toBe(1);
  });

  it("uses weak comparison, a list, and *", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    await warm(env, { etag: 'W/"abc"' });
    for (const header of ['W/"abc"', '"xyz", "abc"', "*"]) {
      const res = await worker.fetch(
        new Request(`https://corx.test${TARGET}`, { headers: { "if-none-match": header } }),
        env,
        ctx,
      );
      expect(res.status, header).toBe(304);
    }
  });

  it("serves the body when the validator does not match", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    await warm(env, { etag: '"abc"' });
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "if-none-match": '"other"' } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("falls back to If-Modified-Since, and lets If-None-Match win", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const lastModified = "Wed, 21 Oct 2020 07:28:00 GMT";
    await warm(env, { "last-modified": lastModified });

    const fresh = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "if-modified-since": lastModified } }),
      env,
      ctx,
    );
    expect(fresh.status).toBe(304);

    const stale = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "if-modified-since": "Wed, 21 Oct 2015 07:28:00 GMT" } }),
      env,
      ctx,
    );
    expect(stale.status).toBe(200);

    // If-None-Match takes precedence: a non-matching ETag wins over a date
    // that would otherwise revalidate (RFC 9110 §13.1.3).
    const both = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, {
        headers: { "if-none-match": '"other"', "if-modified-since": lastModified },
      }),
      env,
      ctx,
    );
    expect(both.status).toBe(200);
  });

  it("ignores validators the entry has none of", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    await warm(env, {});
    const noValidators: Record<string, string>[] = [
      { "if-none-match": '"abc"' },
      { "if-modified-since": new Date().toUTCString() },
    ];
    for (const header of noValidators) {
      const res = await worker.fetch(
        new Request(`https://corx.test${TARGET}`, { headers: header }),
        env,
        ctx,
      );
      expect(res.status, JSON.stringify(header)).toBe(200);
      expect(await res.text(), JSON.stringify(header)).not.toBe("");
    }
  });
});

describe("cache HIT: HEAD reads the cache", () => {
  it("answers a HEAD from the entry without an upstream call", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const calls = await warm(env, { etag: '"abc"', "x-upstream": "yes" });

    const head = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { method: "HEAD" }),
      env,
      ctx,
    );
    expect(head.status).toBe(200);
    expect(head.headers.get("x-corx-cache")).toBe("HIT");
    expect(head.headers.get("content-type")).toContain("application/json");
    expect(head.headers.get("etag")).toBe('"abc"');
    expect(await head.text()).toBe("");
    expect(calls.length).toBe(1);
  });

  it("still fetches a cold HEAD upstream, and stores nothing", async () => {
    const { bucket, store } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const calls = stubUpstream({ etag: '"abc"' });
    const head = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { method: "HEAD" }),
      env,
      ctx,
    );
    await flush();
    expect(head.status).toBe(200);
    expect(head.headers.get("x-corx-cache")).toBe("MISS");
    expect(calls.length).toBe(1);
    expect(store.size).toBe(0); // only GETs are stored
  });

  it("a HEAD with matching validators revalidates without a body", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const calls = await warm(env, { etag: '"abc"' });
    const head = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { method: "HEAD", headers: { "if-none-match": '"abc"' } }),
      env,
      ctx,
    );
    expect(head.status).toBe(304);
    expect(head.headers.get("etag")).toBe('"abc"');
    expect(calls.length).toBe(1);
  });

  it("a Range HEAD still goes upstream (never a full cached body)", async () => {
    const { bucket } = memoryBucket();
    const env = { ...baseEnv, CACHE_BUCKET: bucket } as Env;
    const calls = await warm(env, {});
    const head = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { method: "HEAD", headers: { range: "bytes=0-3" } }),
      env,
      ctx,
    );
    expect(head.headers.get("x-corx-cache")).toBe("MISS");
    expect(calls.length).toBe(2);
  });
});
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { signSession } from "../app/lib/session.js";
import {
  cacheUrlHash,
  parsePurgeScope,
  purgeCache,
  sampleByHost,
  sampleCache,
  type CacheIndex,
} from "../app/proxy/cache.js";
import type { Env } from "../app/lib/types.js";

/**
 * #111 — `POST /api/cache/purge` and `/console/cache`.
 *
 * Entries are keyed by a sha256 of the URL mixed with the key's response-rule
 * fingerprint, so nothing can be addressed on demand without the index the
 * entry carries (`urlHash` digest + `host`). The digest matters: the cache key
 * is built from the *post-injection* URL, which can carry a secret, so the URL
 * itself must never be stored in readable metadata.
 */

/** R2 mock: real paging semantics (cursor = previous page's last key). */
function bucketMock(entries: Array<{ key: string; meta: Record<string, string>; size?: number }>) {
  const remaining = new Map(entries.map((e) => [e.key, e]));
  const lists: number[] = [];
  const bucket = {
    list: async ({ limit = 1000, cursor }: { limit?: number; cursor?: string } = {}) => {
      const all = [...remaining.keys()].sort();
      const after = cursor === undefined ? all : all.filter((k) => k > cursor);
      const page = after.slice(0, limit);
      const truncated = after.length > page.length;
      lists.push(limit);
      return {
        objects: page.map((key) => ({
          key,
          size: remaining.get(key)?.size ?? 1024,
          customMetadata: remaining.get(key)?.meta ?? {},
        })),
        truncated,
        cursor: truncated ? page[page.length - 1] : undefined,
      };
    },
    get: async (key: string) => {
      const hit = remaining.get(key);
      return hit ? { key, customMetadata: hit.meta, arrayBuffer: async () => new ArrayBuffer(0) } : null;
    },
    put: async () => undefined,
    delete: async (key: string) => {
      remaining.delete(key);
    },
  };
  return { bucket: bucket as unknown as R2Bucket, remaining, lists };
}

const NOW = Date.now();
const entry = (key: string, index: Partial<CacheIndex> & { expiresAt?: number; size?: number } = {}) => ({
  key: `corx/v1/${key}`,
  size: index.size ?? 2048,
  meta: {
    status: "200",
    headers: "{}",
    storedAt: String(NOW - 1000),
    expiresAt: String(index.expiresAt ?? NOW + 60_000),
    urlHash: index.urlHash ?? "",
    host: index.host ?? "",
  },
});

describe("parsePurgeScope", () => {
  it("accepts exactly one scope", async () => {
    expect(await parsePurgeScope({ all: true })).toEqual({ all: true });
    expect(await parsePurgeScope({ all: "1" })).toEqual({ all: true });
    expect(await parsePurgeScope({ host: "API.Vendor.com. " })).toEqual({ host: "api.vendor.com" });
    expect(await parsePurgeScope({ url: "https://api.vendor.com/data" })).toEqual({
      url: "https://api.vendor.com/data",
    });
  });

  it("refuses a scope that names nothing usable", async () => {
    for (const input of [{}, { host: "" }, { host: "*.example.com" }, { url: "not a url" }, { host: "a b" }]) {
      expect(await parsePurgeScope(input), JSON.stringify(input)).toBeNull();
    }
  });

  it("prefers the URL when both are present", async () => {
    expect(await parsePurgeScope({ url: "https://a.example/x", host: "b.example" })).toEqual({
      url: "https://a.example/x",
    });
  });
});

describe("purgeCache", () => {
  it("deletes every entry of one URL, across fingerprints", async () => {
    const urlHash = await cacheUrlHash("https://api.vendor.com/data");
    const { bucket, remaining } = bucketMock([
      entry("aaa", { urlHash }),
      entry("bbb", { urlHash }), // same URL, different response-rule fingerprint
      entry("ccc", { urlHash: await cacheUrlHash("https://other.vendor.com/x") }),
    ]);
    const out = await purgeCache(bucket, { url: "https://api.vendor.com/data" });
    expect(out.deleted).toBe(2);
    expect([...remaining.keys()]).toEqual(["corx/v1/ccc"]);
  });

  it("deletes a host's entries and leaves the rest", async () => {
    const { bucket, remaining } = bucketMock([
      entry("aaa", { host: "api.vendor.com" }),
      entry("bbb", { host: "api.vendor.com" }),
      entry("ccc", { host: "cdn.other.com" }),
    ]);
    const out = await purgeCache(bucket, { host: "api.vendor.com" });
    expect(out.deleted).toBe(2);
    expect([...remaining.keys()]).toEqual(["corx/v1/ccc"]);
  });

  it("deletes everything, and says so when the bucket is bigger than the budget", async () => {
    const many = Array.from({ length: 25 }, (_, i) => entry(`k${String(i).padStart(3, "0")}`));
    const { bucket, remaining } = bucketMock(many);
    const bounded = await purgeCache(bucket, { all: true }, { pageSize: 10, pageBudget: 2 });
    expect(bounded.deleted).toBe(20);
    expect(bounded.truncated).toBe(true);
    expect(remaining.size).toBe(5);

    const rest = await purgeCache(bucket, { all: true }, { pageSize: 10, pageBudget: 10 });
    expect(rest.deleted).toBe(5);
    expect(rest.truncated).toBe(false);
    expect(remaining.size).toBe(0);
  });

  it("never throws when the bucket misbehaves", async () => {
    const boom = {
      list: async () => {
        throw new Error("R2 down");
      },
      delete: async () => undefined,
    } as unknown as R2Bucket;
    await expect(purgeCache(boom, { all: true })).resolves.toEqual({
      scanned: 0,
      deleted: 0,
      truncated: false,
    });
  });
});

describe("sampleCache", () => {
  it("summarizes a bounded sample and flags truncation", async () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      entry(`k${String(i).padStart(3, "0")}`, {
        host: i % 2 === 0 ? "a.example" : "b.example",
        size: 1024,
        expiresAt: i === 0 ? NOW - 1000 : NOW + 1000,
      }),
    );
    const { bucket } = bucketMock(entries);
    const sample = await sampleCache(bucket, 20);
    expect(sample.entries).toHaveLength(20);
    expect(sample.bytes).toBe(20 * 1024);
    expect(sample.truncated).toBe(true);
    expect(sample.expired).toBe(1); // k000 sorts first, and it is the expired one

    const full = await sampleCache(bucket, 100);
    expect(full.truncated).toBe(false);
    expect(full.entries).toHaveLength(30);
    expect(full.expired).toBe(1);
    expect(sampleByHost(full)).toEqual([
      { host: "a.example", entries: 15, bytes: 15 * 1024 },
      { host: "b.example", entries: 15, bytes: 15 * 1024 },
    ]);
  });
});

// ---------- integration: the real wiring ----------

function mockDb() {
  const q = () => ({
    bind: () => q(),
    run: async () => ({ meta: { changes: 0 } }),
    first: async () => null,
    all: async () => ({ results: [] }),
  });
  return { prepare: q };
}

function appEnv(store: Map<string, { body: ArrayBuffer; customMetadata: Record<string, string> }>) {
  const bucket = {
    get: async (key: string) => {
      const hit = store.get(key);
      return hit ? { key, arrayBuffer: async () => hit.body, customMetadata: hit.customMetadata } : null;
    },
    put: async (key: string, body: ArrayBuffer, opts?: { customMetadata?: Record<string, string> }) => {
      store.set(key, { body, customMetadata: opts?.customMetadata ?? {} });
    },
    list: async ({ limit = 1000, cursor }: { limit?: number; cursor?: string } = {}) => {
      const all = [...store.keys()].sort();
      const after = cursor === undefined ? all : all.filter((k) => k > cursor);
      const page = after.slice(0, limit);
      const truncated = after.length > page.length;
      return {
        objects: page.map((key) => ({
          key,
          size: store.get(key)?.body.byteLength ?? 0,
          customMetadata: store.get(key)?.customMetadata ?? {},
        })),
        truncated,
        cursor: truncated ? page[page.length - 1] : undefined,
      };
    },
    delete: async (key: string) => {
      store.delete(key);
    },
  };
  return {
    DB: mockDb(),
    CACHE_BUCKET: bucket,
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;
const flush = () => new Promise((r) => setTimeout(r, 0));
const auth = { authorization: "Bearer test-token" };

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

const sessionCookie = await signSession("tester@example.com", "test-token");
const cookie = { cookie: `corx_session=${sessionCookie}` };

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/cache/purge", () => {
  it("requires the admin credential", async () => {
    const res = await worker.fetch(
      new Request("https://corx.test/api/cache/purge", { method: "POST", body: JSON.stringify({ all: true }) }),
      appEnv(new Map()),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects a request that names no scope", async () => {
    const res = await worker.fetch(
      new Request("https://corx.test/api/cache/purge", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({}),
      }),
      appEnv(new Map()),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("exactly one") });
  });

  it("purges what the proxy actually cached", async () => {
    const store = new Map();
    const env = appEnv(store);
    stubUpstream();
    const target = "https://api.vendor.com/data";
    const path = "/fetch?url=" + encodeURIComponent(target);

    expect((await worker.fetch(new Request(`https://corx.test${path}`), env, ctx)).headers.get("x-corx-cache")).toBe(
      "MISS",
    );
    await flush();
    expect(store.size).toBe(1);
    // The stored metadata is an index, never the URL itself.
    const meta = [...store.values()][0]!.customMetadata;
    expect(meta["host"]).toBe("api.vendor.com");
    expect(meta["urlHash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(meta)).not.toContain("vendor.com/data");

    const res = await worker.fetch(
      new Request("https://corx.test/api/cache/purge", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ url: target }),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ deleted: 1, scanned: 1, truncated: false });
    expect(store.size).toBe(0);

    // And the next request is a miss, i.e. the purge is observable end to end.
    expect((await worker.fetch(new Request(`https://corx.test${path}`), env, ctx)).headers.get("x-corx-cache")).toBe(
      "MISS",
    );
  });

  it("purges by host and by all", async () => {
    const store = new Map();
    const env = appEnv(store);
    stubUpstream();
    await worker.fetch(
      new Request("https://corx.test/fetch?url=" + encodeURIComponent("https://api.vendor.com/a")),
      env,
      ctx,
    );
    await flush();
    await worker.fetch(
      new Request("https://corx.test/fetch?url=" + encodeURIComponent("https://cdn.other.com/b")),
      env,
      ctx,
    );
    await flush();
    expect(store.size).toBe(2);

    const byHost = await worker.fetch(
      new Request("https://corx.test/api/cache/purge", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ host: "api.vendor.com" }),
      }),
      env,
      ctx,
    );
    expect(await byHost.json()).toMatchObject({ deleted: 1 });
    expect(store.size).toBe(1);

    const all = await worker.fetch(
      new Request("https://corx.test/api/cache/purge", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ all: true }),
      }),
      env,
      ctx,
    );
    expect(await all.json()).toMatchObject({ deleted: 1 });
    expect(store.size).toBe(0);
  });
});

describe("/console/cache", () => {
  it("renders the sample, the hit ratio and the purge forms", async () => {
    const store = new Map();
    const env = appEnv(store);
    stubUpstream();
    await worker.fetch(
      new Request("https://corx.test/fetch?url=" + encodeURIComponent("https://api.vendor.com/a")),
      env,
      ctx,
    );
    await flush();

    const res = await worker.fetch(new Request("https://corx.test/console/cache", { headers: cookie }), env, ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("/console/cache/purge");
    expect(html).toContain("api.vendor.com");
    expect(html).toContain('name="url"');
    expect(html).toContain('name="host"');
    // No real URL ever reaches the page: entries are shown as key + host.
    expect(html).not.toContain("api.vendor.com/a");
  });

  it("purges through the console form, and refuses a POST without the CSRF token", async () => {
    const store = new Map();
    const env = appEnv(store);
    stubUpstream();
    await worker.fetch(
      new Request("https://corx.test/fetch?url=" + encodeURIComponent("https://api.vendor.com/a")),
      env,
      ctx,
    );
    await flush();
    expect(store.size).toBe(1);

    const noToken = await worker.fetch(
      new Request("https://corx.test/console/cache/purge", {
        method: "POST",
        headers: { ...cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ all: "1" }).toString(),
      }),
      env,
      ctx,
    );
    expect(noToken.status).toBe(403);
    expect(store.size).toBe(1);

    const page = await worker.fetch(new Request("https://corx.test/console/cache", { headers: cookie }), env, ctx);
    const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(csrf).toBeTruthy();
    const withToken = await worker.fetch(
      new Request("https://corx.test/console/cache/purge", {
        method: "POST",
        headers: { ...cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrf: csrf!, all: "1" }).toString(),
      }),
      env,
      ctx,
    );
    expect(withToken.status).toBe(302);
    expect(store.size).toBe(0);
  });
});
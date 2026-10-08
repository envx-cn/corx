import { describe, expect, it } from "vitest";
import { shouldBypassCache, responseCacheable, pruneExpiredCache } from "../app/proxy/cache.js";

const url = (qs = "") => new URL(`https://corx.test/https://example.com/a${qs}`);

describe("shouldBypassCache — authenticated requests", () => {
  it("never caches requests carrying Authorization", () => {
    const req = new Request("https://corx.test/https://example.com/a", { headers: { authorization: "Bearer abc" } });
    expect(shouldBypassCache(req, url())).toBe(true);
  });
  it("never caches requests carrying a Cookie header", () => {
    const req = new Request("https://corx.test/https://example.com/a", { headers: { cookie: "session=1" } });
    expect(shouldBypassCache(req, url())).toBe(true);
  });
  it("still caches plain anonymous GETs", () => {
    expect(shouldBypassCache(new Request("https://corx.test/https://example.com/a"), url())).toBe(false);
  });
});

describe("responseCacheable — upstream cache semantics", () => {
  const res = (headers: Record<string, string>) => new Response("x", { headers });

  it("allows plain cacheable 200s", () => {
    expect(responseCacheable(res({}))).toBe(true);
    expect(responseCacheable(res({ "cache-control": "public, max-age=3600" }))).toBe(true);
  });
  it("rejects no-store / private / no-cache / must-revalidate / max-age=0", () => {
    for (const cc of ["no-store", "private", "no-cache", "must-revalidate", "max-age=0", "private, max-age=3600"]) {
      expect(responseCacheable(res({ "cache-control": cc })), cc).toBe(false);
    }
  });
  it("rejects vary on caller-dependent headers", () => {
    for (const v of ["Accept", "Accept-Encoding", "Accept-Language", "Cookie", "Authorization", "User-Agent", "*"]) {
      expect(responseCacheable(res({ vary: v })), v).toBe(false);
    }
  });
  it("never buffers an unbounded stream, even without Cache-Control", () => {
    // SSE and MJPEG only end when the client disconnects: buffering one waits
    // for the stream to close, so the caller would never receive an event.
    expect(responseCacheable(res({ "content-type": "text/event-stream" }))).toBe(false);
    expect(responseCacheable(res({ "content-type": "text/event-stream; charset=utf-8" }))).toBe(false);
    expect(responseCacheable(res({ "content-type": "multipart/x-mixed-replace; boundary=x" }))).toBe(false);
  });
  it("still caches a plain chunked text response", () => {
    expect(responseCacheable(res({ "content-type": "text/plain" }))).toBe(true);
    expect(responseCacheable(res({ "content-type": "text/plain", "cache-control": "public, max-age=60" }))).toBe(true);
  });
  it("allows Vary: Origin (proxy strips Origin before forwarding)", () => {
    expect(responseCacheable(res({ vary: "Origin" }))).toBe(true);
  });
});

/**
 * #107 — the cron prune used to list `limit: 100` and ignore the cursor, so
 * with random-order sha256 keys it only ever inspected the first
 * lexicographic page. The sweep walks pages, bounded by a budget.
 */
describe("pruneExpiredCache", () => {
  /**
   * R2 mock with the real paging contract: keys come back in lexicographic
   * order and the cursor is the last key of the previous page, so deleting
   * what a page returned does not shift the next page (an index-based mock
   * would silently hide exactly the bug this test exists for).
   */
  function pagedBucket(keys: { key: string; expiresAt: number }[]) {
    const remaining = new Map(keys.map((k) => [k.key, k]));
    const deleted: string[] = [];
    let lists = 0;
    const bucket = {
      list: async ({ limit = 1000, cursor }: { limit?: number; cursor?: string } = {}) => {
        lists++;
        const all = [...remaining.keys()].sort();
        const after = cursor === undefined ? all : all.filter((k) => k > cursor);
        const page = after.slice(0, limit);
        const truncated = after.length > page.length;
        return {
          objects: page.map((key) => ({
            key,
            customMetadata: { expiresAt: String(remaining.get(key)!.expiresAt) },
          })),
          truncated,
          cursor: truncated ? page[page.length - 1] : undefined,
          delimitedPrefixes: [],
        };
      },
      delete: async (key: string) => {
        deleted.push(key);
        remaining.delete(key);
      },
    };
    return { bucket: bucket as unknown as R2Bucket, deleted, remaining, lists: () => lists };
  }

  const now = 1_000_000_000;
  const expired = (key: string) => ({ key: `corx/v1/${key}`, expiresAt: now - 1000 });
  const live = (key: string) => ({ key: `corx/v1/${key}`, expiresAt: now + 100_000 });

  it("deletes expired entries on the first page only", async () => {
    const { bucket, deleted } = pagedBucket([expired("a"), live("b"), expired("c")]);
    const out = await pruneExpiredCache(bucket, { pageSize: 10, now });
    expect(deleted.sort()).toEqual(["corx/v1/a", "corx/v1/c"]);
    expect(out).toEqual({ scanned: 3, deleted: 2, pages: 1 });
  });

  it("reaches entries past the first page — the case the old code missed", async () => {
    // 250 expired keys plus one live one: with `limit: 100` and no cursor, the
    // old cron could only ever see (and reclaim) the first page.
    const keys = Array.from({ length: 250 }, (_, i) => expired(`e${String(i).padStart(3, "0")}`));
    const { bucket, remaining } = pagedBucket([...keys, live("zzz")]);
    const out = await pruneExpiredCache(bucket, { pageSize: 100, now });
    expect(out.deleted).toBe(250);
    expect(out.pages).toBe(3);
    expect([...remaining.keys()]).toEqual(["corx/v1/zzz"]);
  });

  it("stops at the page budget and picks the rest up next run", async () => {
    const keys = Array.from({ length: 250 }, (_, i) => expired(`k${String(i).padStart(3, "0")}`));
    const { bucket, remaining, lists } = pagedBucket(keys);
    const first = await pruneExpiredCache(bucket, { pageSize: 10, pageBudget: 2, now });
    expect(first.pages).toBe(2);
    expect(lists()).toBe(2);
    expect(remaining.size).toBe(230); // two pages of ten reclaimed, no more
    const second = await pruneExpiredCache(bucket, { pageSize: 10, pageBudget: 100, now });
    expect(remaining.size).toBe(0);
    expect(second.deleted).toBe(230);
  });

  it("keeps entries whose metadata has no usable expiry", async () => {
    const { bucket, remaining } = pagedBucket([
      { key: "corx/v1/a", expiresAt: 0 },
      { key: "corx/v1/b", expiresAt: Number.NaN },
      expired("c"),
    ]);
    await pruneExpiredCache(bucket, { pageSize: 10, now });
    expect([...remaining.keys()].sort()).toEqual(["corx/v1/a", "corx/v1/b"]);
  });

  it("survives a failing list or delete", async () => {
    const boom = {
      list: async () => {
        throw new Error("R2 down");
      },
      delete: async () => undefined,
    } as unknown as R2Bucket;
    await expect(pruneExpiredCache(boom, { pageSize: 10, now })).resolves.toEqual({
      scanned: 0,
      deleted: 0,
      pages: 0,
    });

    // A delete that throws is swallowed — the rest of the sweep continues and
    // the entry is simply reclaimed on a later run.
    const { bucket, lists } = pagedBucket([expired("a"), live("b"), expired("c"), live("d")]);
    const failing = {
      list: bucket.list,
      delete: async () => {
        throw new Error("denied");
      },
    } as unknown as R2Bucket;
    const out = await pruneExpiredCache(failing, { pageSize: 2, now });
    expect(out).toEqual({ scanned: 4, deleted: 2, pages: 2 });
    expect(lists()).toBe(2);
  });
});

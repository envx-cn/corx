import { beforeEach, describe, it, expect, vi, afterEach } from "vitest";
import {
  blocklistCandidates,
  checkDbBlocklist,
  extractTargetUrl,
  invalidateBlocklistMemo,
  validateTargetUrl,
} from "../app/proxy/guard.js";
import { ProxyError } from "../app/lib/types.js";

describe("extractTargetUrl", () => {
  it("reads ?url=", () => {
    const u = new URL("https://corx.workers.dev/fetch?url=https://example.com/a?b=c");
    expect(extractTargetUrl(u, "/fetch")).toBe("https://example.com/a?b=c");
  });
  it("reads /proxy/https://…", () => {
    const u = new URL("https://corx.workers.dev/proxy/https://example.com/a");
    expect(extractTargetUrl(u, "/proxy/https://example.com/a")).toBe("https://example.com/a");
  });
  it("reads /https://…", () => {
    const u = new URL("https://corx.workers.dev/https://example.com/a");
    expect(extractTargetUrl(u, "/https://example.com/a")).toBe("https://example.com/a");
  });
});

describe("validateTargetUrl", () => {
  it("accepts https", () => {
    expect(validateTargetUrl("https://example.com/x").hostname).toBe("example.com");
  });
  it("rejects missing", () => {
    expect(() => validateTargetUrl(null)).toThrowError(ProxyError);
  });
  it("rejects non-http", () => {
    expect(() => validateTargetUrl("ftp://example.com")).toThrowError(ProxyError);
  });
  it("blocks localhost + private ranges + metadata", () => {
    for (const raw of [
      "http://localhost:3000/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://foo.internal/",
    ]) {
      expect(() => validateTargetUrl(raw), raw).toThrowError(ProxyError);
    }
  });

  it('ipCheck: false (per-key opt-out) allows internal targets', () => {
    expect(validateTargetUrl("http://10.0.0.5/x", { ipCheck: false }).hostname).toBe("10.0.0.5");
    expect(validateTargetUrl("http://localhost:3000/", { ipCheck: false }).port).toBe("3000");
  });

  it("ipCheck: false still enforces syntax and scheme", () => {
    for (const raw of ["ftp://example.com", "https://user:pw@example.com/", "not-a-url"]) {
      expect(() => validateTargetUrl(raw, { ipCheck: false }), raw).toThrowError(ProxyError);
    }
  });
});

describe("blocklistCandidates", () => {
  it("includes the host and its parent domains, never a bare TLD", () => {
    expect(blocklistCandidates("api.evil.example")).toEqual(["api.evil.example", "evil.example"]);
    expect(blocklistCandidates("evil.example")).toEqual(["evil.example"]);
    expect(blocklistCandidates("localhost")).toEqual(["localhost"]);
  });
});

describe("checkDbBlocklist", () => {
  // The memo is module-level (one per isolate, like the real thing), so each
  // case starts from a clean slate.
  beforeEach(() => invalidateBlocklistMemo());
  afterEach(() => {
    vi.useRealTimers();
    invalidateBlocklistMemo();
  });

  /** Fake D1 whose blocked_hosts row is the given hostname. */
  const dbWith = (blocked: string) =>
    ({
      prepare: () => ({
        bind: (...args: string[]) => ({
          first: async () => (args.includes(blocked) ? { hostname: blocked } : null),
        }),
      }),
    }) as unknown as D1Database;

  /** Same, but counts the round trips (one `first()` per lookup). */
  const countingDb = (blocked: string) => {
    let queries = 0;
    const db = {
      prepare: () => ({
        bind: (...args: string[]) => ({
          first: async () => {
            queries++;
            return args.includes(blocked) ? { hostname: blocked } : null;
          },
        }),
      }),
    } as unknown as D1Database;
    return { db, queries: () => queries };
  };

  it("blocks the exact host", async () => {
    await expect(checkDbBlocklist(dbWith("evil.example"), "evil.example")).rejects.toThrowError(ProxyError);
  });

  it("a blocked parent domain covers its subdomains", async () => {
    await expect(checkDbBlocklist(dbWith("evil.example"), "api.evil.example")).rejects.toThrowError(ProxyError);
  });

  it("does not block siblings or unrelated hosts", async () => {
    await expect(checkDbBlocklist(dbWith("evil.example"), "other.example")).resolves.toBeUndefined();
    await expect(checkDbBlocklist(dbWith("evil.example"), "example.com")).resolves.toBeUndefined();
  });

  it("a bare TLD entry never matches", async () => {
    await expect(checkDbBlocklist(dbWith("com"), "example.com")).resolves.toBeUndefined();
  });

  it("fails open when D1 errors", async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("down"); } }) }) } as unknown as D1Database;
    await expect(checkDbBlocklist(db, "evil.example")).resolves.toBeUndefined();
  });

  describe("per-isolate memo (30s)", () => {
    it("asks D1 once per host inside the window", async () => {
      const { db, queries } = countingDb("evil.example");
      for (let i = 0; i < 5; i++) {
        await checkDbBlocklist(db, "api.vendor.com");
      }
      expect(queries()).toBe(1);
      // A different host is its own question.
      await checkDbBlocklist(db, "other.example");
      expect(queries()).toBe(2);
    });

    it("keeps a blocked verdict without asking D1 again", async () => {
      const { db, queries } = countingDb("evil.example");
      await expect(checkDbBlocklist(db, "evil.example")).rejects.toThrowError(ProxyError);
      await expect(checkDbBlocklist(db, "evil.example")).rejects.toThrowError(ProxyError);
      expect(queries()).toBe(1);
    });

    it("re-reads after the window expires", async () => {
      vi.useFakeTimers();
      const { db, queries } = countingDb("evil.example");
      await checkDbBlocklist(db, "api.vendor.com");
      vi.advanceTimersByTime(30_001);
      await checkDbBlocklist(db, "api.vendor.com");
      expect(queries()).toBe(2);
    });

    it("an operator's write takes effect immediately (invalidation)", async () => {
      const { db, queries } = countingDb("evil.example");
      await checkDbBlocklist(db, "api.vendor.com"); // memoized as allowed
      expect(queries()).toBe(1);
      invalidateBlocklistMemo(); // what the console/API routes call after a write
      await expect(checkDbBlocklist(db, "evil.example")).rejects.toThrowError(ProxyError);
      expect(queries()).toBe(2);
    });

    it("normalizes the memo key (case + trailing dot)", async () => {
      const { db, queries } = countingDb("evil.example");
      await checkDbBlocklist(db, "API.Vendor.com");
      await checkDbBlocklist(db, "api.vendor.com.");
      expect(queries()).toBe(1);
    });
  });
});

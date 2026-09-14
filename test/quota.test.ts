import { describe, expect, it } from "vitest";
import { checkPublicQuota, quotaHeaders, quotaResetAt, quotaResetIn, utcDay } from "../app/proxy/quota.js";
import { ProxyError } from "../app/lib/types.js";

/**
 * The public tier's daily quotas run against a recording stub whose counters
 * live in a Map, so "count then reject" is exercised end to end (bucket keys,
 * scope reporting, fail-open) without a real D1.
 */

interface Call {
  sql: string;
  values: unknown[];
}

function quotaDb(opts: { fail?: boolean; used?: number } = {}) {
  const counts = new Map<string, number>();
  const calls: Call[] = [];
  const key = (call: Call) => `${String(call.values[0])}|${String(call.values[1])}`;
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, values: [] };
      const stmt = {
        bind(...values: unknown[]) {
          call.values = values;
          return stmt;
        },
        run: async () => {
          if (opts.fail) throw new Error("d1 down");
          calls.push(call);
          if (sql.includes("INSERT INTO quota_counters")) {
            const k = key(call);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
          return { meta: { changes: 1 } };
        },
        first: async () => {
          if (opts.fail) throw new Error("d1 down");
          calls.push(call);
          if (sql.includes("FROM quota_counters")) return { count: opts.used ?? counts.get(key(call)) ?? 1 };
          return null;
        },
      };
      return stmt;
    },
  } as unknown as D1Database;
  return { db, calls, counts };
}

type Limits = {
  daily_limit_per_origin: number | null;
  daily_limit_per_host: number | null;
  daily_limit_total: number | null;
};

function row(limits: Partial<Limits> = {}): Limits {
  return { daily_limit_per_origin: null, daily_limit_per_host: null, daily_limit_total: 15000, ...limits };
}

function input(over: Partial<Parameters<typeof checkPublicQuota>[1]> = {}) {
  return {
    keyId: "key-1",
    origin: "https://app.example",
    host: "api.vendor.com",
    ip: "1.2.3.4",
    row: row(),
    ...over,
  };
}

describe("checkPublicQuota", () => {
  it("counts every capped dimension and reports what is left", async () => {
    const { db, calls } = quotaDb();
    const quota = await checkPublicQuota(
      db,
      input({ row: row({ daily_limit_per_origin: 100, daily_limit_per_host: 200, daily_limit_total: 300 }) }),
    );
    expect(quota.origin).toEqual({ limit: 100, used: 1, remaining: 99 });
    expect(quota.host).toEqual({ limit: 200, used: 1, remaining: 199 });
    expect(quota.total).toEqual({ limit: 300, used: 1, remaining: 299 });
    // One upsert + one read per dimension.
    expect(calls).toHaveLength(6);
    expect(calls.map((c) => c.values[0])).toEqual([
      "q:o:https://app.example",
      "q:o:https://app.example",
      "q:h:api.vendor.com",
      "q:h:api.vendor.com",
      "q:k:key-1",
      "q:k:key-1",
    ]);
  });

  it("charges only the dimensions that have a cap", async () => {
    const { db, calls } = quotaDb();
    await checkPublicQuota(db, input({ row: row({ daily_limit_total: 500 }) }));
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.values[0] === "q:k:key-1")).toBe(true);
  });

  it("falls back to the caller IP when no Origin was sent", async () => {
    const { db, calls } = quotaDb();
    await checkPublicQuota(db, input({ origin: null, ip: "9.9.9.9", row: row({ daily_limit_per_origin: 10 }) }));
    expect(calls[0]?.values[0]).toBe("q:o:ip:9.9.9.9");
  });

  it("rejects with 429 (and a scope) once a dimension is over its cap", async () => {
    const { db } = quotaDb({ used: 3001 });
    await expect(
      checkPublicQuota(db, input({ row: row({ daily_limit_per_origin: 3000 }) })),
    ).rejects.toMatchObject({ status: 429, data: { scope: "origin", limit: 3000 } });
  });

  it("stops at the first exceeded dimension so the others keep their budget", async () => {
    const { db, calls } = quotaDb({ used: 3001 });
    await expect(
      checkPublicQuota(
        db,
        input({ row: row({ daily_limit_per_origin: 3000, daily_limit_per_host: 5000, daily_limit_total: 15000 }) }),
      ),
    ).rejects.toBeInstanceOf(ProxyError);
    // Only the origin bucket was touched — the request never reaches host/total.
    expect(calls.every((c) => String(c.values[0]).startsWith("q:o:"))).toBe(true);
  });

  it("refuses to serve a public key with no total cap (503, fail closed)", async () => {
    const { db, calls } = quotaDb();
    await expect(checkPublicQuota(db, input({ row: row({ daily_limit_total: null }) }))).rejects.toMatchObject({
      status: 503,
    });
    expect(calls).toHaveLength(0);
  });

  it("fails open when D1 errors (the cap is sized so this stays rare)", async () => {
    const { db } = quotaDb({ fail: true });
    await expect(checkPublicQuota(db, input())).resolves.toEqual({
      origin: null,
      host: null,
      total: { limit: 15000, used: 0, remaining: null },
    });
  });

  it("never lets a 429 be swallowed by the fail-open path", async () => {
    const { db } = quotaDb({ used: 99999 });
    await expect(checkPublicQuota(db, input({ row: row({ daily_limit_total: 10 }) }))).rejects.toBeInstanceOf(
      ProxyError,
    );
  });
});

describe("quota periods", () => {
  it("uses UTC days", () => {
    expect(utcDay(Date.parse("2026-09-14T23:59:59Z"))).toBe("2026-09-14");
    expect(utcDay(Date.parse("2026-09-15T00:00:01Z"))).toBe("2026-09-15");
  });

  it("resets at the next UTC midnight, with a Retry-After in seconds", () => {
    const at = Date.parse("2026-09-14T22:00:00Z");
    expect(quotaResetAt(at)).toBe("2026-09-15T00:00:00.000Z");
    expect(quotaResetIn(at)).toBe(7200);
    expect(quotaResetIn(Date.parse("2026-09-14T23:59:59Z"))).toBe(1);
  });
});

describe("quotaHeaders", () => {
  it("exposes only the dimensions that have a cap", () => {
    expect(
      quotaHeaders({
        origin: { limit: 3000, used: 1, remaining: 2999 },
        host: null,
        total: { limit: 15000, used: 1, remaining: 14999 },
      }),
    ).toEqual({
      "X-Corx-Quota-Origin-Limit": "3000",
      "X-Corx-Quota-Origin-Remaining": "2999",
      "X-Corx-Quota-Day-Limit": "15000",
      "X-Corx-Quota-Day-Remaining": "14999",
    });
  });
});

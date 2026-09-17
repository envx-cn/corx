import { describe, expect, it } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import {
  clampStatsDays,
  queryDailyStats,
  queryStatsComparison,
  rollupDailyStats,
  shiftDay,
} from "../app/lib/admin.js";
import type { DailyPoint } from "../app/lib/admin.js";

/**
 * The daily rollup and the period comparison are the long-memory half of stats:
 * raw request_logs die after 30 days, so if the aggregation write or the
 * window math is wrong the trend is wrong forever. These tests pin the SQL
 * shape of the write and the period boundaries / gap-filling of the read.
 */

function point(day: string, over: Partial<DailyPoint> = {}): DailyPoint {
  return { day, requests: 0, origins: 0, keys: 0, errors: 0, req_bytes: 0, res_bytes: 0, ...over };
}

interface Call {
  sql: string;
  values: unknown[];
}

/** D1 stub: raw rows for request_logs queries, rollup rows for stats_daily. */
function stubDb(raw: DailyPoint[], rollup: DailyPoint[]) {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, values: [] };
      calls.push(call);
      const stmt = {
        bind(...values: unknown[]) {
          call.values = values;
          return stmt;
        },
        all: async () => ({ results: sql.includes("FROM stats_daily") ? rollup : raw }),
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => null,
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

describe("shiftDay", () => {
  it("moves across month and year boundaries in UTC", () => {
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-09-15", -365)).toBe("2025-09-15");
  });
});

describe("clampStatsDays", () => {
  it("defaults to 7 on garbage and clamps to 1…365", () => {
    expect(clampStatsDays(Number.NaN)).toBe(7);
    expect(clampStatsDays(0)).toBe(1);
    expect(clampStatsDays(28)).toBe(28);
    expect(clampStatsDays(7.6)).toBe(8);
    expect(clampStatsDays(9999)).toBe(365);
  });
});

describe("rollupDailyStats", () => {
  it("upserts per-day counts with the ISO retention filter", async () => {
    const { db, calls } = stubDb([], []);
    await rollupDailyStats(db);
    expect(calls).toHaveLength(1);
    const sql = calls[0]?.sql ?? "";
    expect(sql).toContain("INSERT OR REPLACE INTO stats_daily");
    // Distinct people, not requests: empty origins and anonymous keys are out.
    expect(sql).toContain("COUNT(DISTINCT NULLIF(origin, ''))");
    expect(sql).toContain("COUNT(DISTINCT api_key_id)");
    // The stored format is ISO-with-T; datetime('now') would silently include
    // the whole boundary calendar day (see the note in admin.ts).
    expect(sql).not.toContain("datetime('now'");
    expect(sql).toContain("strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)");
    // Default retention is 30 → the window reaches 31 days back (one further
    // than the prune keeps, since the prune deletes by timestamp).
    expect(calls[0]?.values).toEqual(["-31 days"]);
  });

  it("follows a deployment's longer retention instead of the shipped default", async () => {
    const { db, calls } = stubDb([], []);
    await rollupDailyStats(db, 200);
    expect(calls[0]?.values).toEqual(["-201 days"]);
  });
});

describe("queryDailyStats", () => {
  it("partitions the range — raw for recent days, rollup for older ones", async () => {
    const now = Date.UTC(2026, 8, 15, 12); // 2026-09-15
    const rawSince = shiftDay("2026-09-15", -29); // 2026-08-17
    const { db, calls } = stubDb(
      [point("2026-08-20", { requests: 1 })],
      [point("2026-08-16", { requests: 20 })],
    );
    const out = await queryDailyStats(db, "2026-07-21", "2026-09-14", now);
    expect(out).toHaveLength(56); // 2026-07-21 … 2026-09-14
    // Rollup query only covers days older than the raw horizon…
    const rollup = calls.find((c) => c.sql.includes("FROM stats_daily"));
    expect(rollup?.values).toEqual(["2026-07-21", "2026-08-16"]);
    // …and the raw query starts at the horizon, bound as ISO timestamps.
    const raw = calls.find((c) => c.sql.includes("FROM request_logs"));
    expect(raw?.values).toEqual([`${rawSince}T00:00:00.000Z`, "2026-09-15T00:00:00.000Z"]);
    expect(out.find((p) => p.day === "2026-08-16")?.requests).toBe(20);
    expect(out.find((p) => p.day === "2026-08-20")?.requests).toBe(1);
    // A day with no row in either source is a zero, not a hole.
    expect(out.find((p) => p.day === "2026-07-25")).toMatchObject({ requests: 0, origins: 0 });
  });
});

describe("queryStatsComparison", () => {
  const now = Date.UTC(2026, 8, 15, 12); // complete days end 2026-09-14

  it("sums the current and previous week and marks the source", async () => {
    const raw: DailyPoint[] = [];
    for (let day = "2026-09-01"; day <= "2026-09-14"; day = shiftDay(day, 1)) {
      raw.push(point(day, { requests: 2, origins: 1, keys: 1 }));
    }
    const { db } = stubDb(raw, []);
    const cmp = await queryStatsComparison(db, 7, now);
    expect(cmp.days).toBe(7);
    expect(cmp.current).toMatchObject({ from: "2026-09-08", to: "2026-09-14", requests: 14, origins: 7 });
    expect(cmp.previous).toMatchObject({ from: "2026-09-01", to: "2026-09-07", requests: 14, origins: 7 });
    expect(cmp.delta.requests).toEqual({ current: 14, previous: 14, abs: 0, pct: 0 });
    expect(cmp.source).toBe("raw"); // both weeks are inside the raw horizon
    expect(cmp.daily).toHaveLength(14);
  });

  it("reads the previous period from the rollup beyond the raw horizon", async () => {
    // days=28 at 2026-09-15: current 08-18…09-14 (raw), previous 07-21…08-17
    // (rollup). A rollup row wrongly placed in the raw zone must lose to raw.
    const rollup = [point("2026-08-01", { requests: 10, origins: 2, keys: 1 }), point("2026-08-20", { requests: 999 })];
    const raw: DailyPoint[] = [];
    for (let day = "2026-08-17"; day <= "2026-09-14"; day = shiftDay(day, 1)) {
      raw.push(point(day, { requests: 1, origins: 1, keys: 1 }));
    }
    const { db } = stubDb(raw, rollup);
    const cmp = await queryStatsComparison(db, 28, now);
    expect(cmp.source).toBe("mixed");
    // 28 raw days in the current period; the raw-zone rollup row is ignored.
    expect(cmp.current.requests).toBe(28);
    // previous = rollup 08-01 (10) + raw 08-17 (1); 08-16 has no row.
    expect(cmp.previous).toMatchObject({ from: "2026-07-21", to: "2026-08-17", requests: 11, origins: 3 });
    expect(cmp.delta.requests).toMatchObject({ current: 28, previous: 11, abs: 17 });
    expect(cmp.daily).toHaveLength(56);
  });

  it("reports growth over an empty baseline as pct: null (undefined)", async () => {
    const raw = [point("2026-09-14", { requests: 3, origins: 2 })];
    const { db } = stubDb(raw, []);
    const cmp = await queryStatsComparison(db, 7, now);
    expect(cmp.delta.origins).toEqual({ current: 2, previous: 0, abs: 2, pct: null });
    expect(cmp.delta.requests.current).toBe(3);
  });
});

/** Stub env for the cron handler; `failRollup` makes the rollup write throw. */
function scheduledEnv(failRollup = false) {
  const calls: string[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        run: async () => {
          if (failRollup && sql.includes("INSERT OR REPLACE INTO stats_daily")) throw new Error("d1 down");
          calls.push(sql);
          return { meta: { changes: 1 } };
        },
        all: async () => ({ results: [] }),
        first: async () => null,
      };
      return stmt;
    },
  };
  const env = {
    DB: db,
    CACHE_BUCKET: {
      list: async () => ({ objects: [] }),
      delete: async () => undefined,
    },
  } as unknown as Env;
  return { env, calls };
}

/** Run the cron and wait for the waitUntil promise it hands the runtime. */
async function runScheduled(env: Env): Promise<void> {
  let pending: Promise<unknown> = Promise.resolve();
  const testCtx = { waitUntil: (p: Promise<unknown>) => (pending = p) } as unknown as ExecutionContext;
  await worker.scheduled({} as ScheduledEvent, env, testCtx);
  await pending.catch(() => undefined);
}

describe("scheduled cron", () => {
  it("rolls the day up before pruning the raw rows", async () => {
    const { env, calls } = scheduledEnv();
    await runScheduled(env);
    const rollup = calls.findIndex((s) => s.includes("INSERT OR REPLACE INTO stats_daily"));
    const prune = calls.findIndex((s) => s.includes("DELETE FROM request_logs"));
    expect(rollup).toBeGreaterThanOrEqual(0);
    expect(prune).toBeGreaterThan(rollup);
  });

  it("skips the prune when the rollup write fails, so no day is lost unarchived", async () => {
    const { env, calls } = scheduledEnv(true);
    await runScheduled(env);
    expect(calls.some((s) => s.includes("DELETE FROM request_logs"))).toBe(false);
  });
});

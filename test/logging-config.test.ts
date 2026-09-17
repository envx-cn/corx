import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import {
  DEFAULT_LOG_RETENTION_DAYS,
  logRequest,
  logRetentionDays,
  requestsLogged,
  type LogRow,
} from "../app/lib/db.js";
import { queryStatsComparison } from "../app/lib/admin.js";

/**
 * Logging is a deployment choice (#48): `LOG_REQUESTS` turns the request log
 * off entirely, `LOG_RETENTION_DAYS` decides how long the raw rows live. The
 * proxy's own behaviour — rate limiting, quota headers, `X-Corx-*` markers —
 * must not depend on either.
 */

/** D1 stub that records every statement + bind, with empty results. */
function stubDb() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const stmt = (sql: string) => {
    const s = {
      // Every statement under test is bound before it runs, so recording here
      // captures the SQL and its values in one place.
      bind: (...values: unknown[]) => {
        calls.push({ sql, values });
        return s;
      },
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => null,
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return { db: { prepare: stmt } as unknown as D1Database, calls };
}

/** A complete log row — `logRequest` slices every field. */
function logRow(): LogRow {
  return {
    method: "GET",
    targetUrl: "https://example.com/",
    targetHost: "example.com",
    status: 200,
    latencyMs: 12,
    clientIp: "203.0.113.7",
    country: "US",
    apiKeyId: null,
    cached: false,
    error: "",
    reqBytes: 0,
    resBytes: 2,
  };
}

/** Run the cron and wait for what it passed to `waitUntil`. */
async function runScheduled(env: Env): Promise<void> {
  const pending: Array<Promise<unknown>> = [];
  const ctx = {
    waitUntil: (p: Promise<unknown>) => {
      pending.push(p.catch(() => undefined));
    },
  } as unknown as ExecutionContext;
  await worker.scheduled({} as ScheduledEvent, env, ctx);
  await Promise.all(pending);
}

function baseEnv(db: D1Database): Env {
  return {
    DB: db,
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
    CACHE_BUCKET: {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ objects: [], delimitedPrefixes: [], truncated: false }),
      delete: async () => undefined,
    },
  } as unknown as Env;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

async function call(path: string, e: Env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`), e, ctx);
}

/** fetch stub: DoH answers, the upstream answers. */
function stubUpstream() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("the two helpers", () => {
  it("treats only explicit off-values as off", () => {
    for (const off of ["false", "FALSE", "0", "off", "no", " off "]) {
      expect(requestsLogged({ LOG_REQUESTS: off }), off).toBe(false);
    }
    for (const on of [undefined, "", "true", "1", "yes", "whatever"]) {
      expect(requestsLogged({ LOG_REQUESTS: on }), String(on)).toBe(true);
    }
  });

  it("parses retention inside 1…365 and falls back to the default otherwise", () => {
    expect(logRetentionDays({ LOG_RETENTION_DAYS: undefined })).toBe(DEFAULT_LOG_RETENTION_DAYS);
    expect(logRetentionDays({ LOG_RETENTION_DAYS: "" })).toBe(DEFAULT_LOG_RETENTION_DAYS);
    expect(logRetentionDays({ LOG_RETENTION_DAYS: "7" })).toBe(7);
    expect(logRetentionDays({ LOG_RETENTION_DAYS: "365" })).toBe(365);
    // Junk must not delete more history than intended, nor keep it forever.
    for (const bad of ["0", "-3", "1.5", "forever", "4000"]) {
      expect(logRetentionDays({ LOG_RETENTION_DAYS: bad }), bad).toBe(DEFAULT_LOG_RETENTION_DAYS);
    }
  });

  it("writes nothing when logging is off, at the db helper itself", async () => {
    const { db, calls } = stubDb();
    await logRequest({ DB: db, LOG_REQUESTS: "false" }, logRow());
    expect(calls).toHaveLength(0);
    await logRequest({ DB: db }, logRow());
    expect(calls.some((c) => c.sql.includes("INSERT INTO request_logs"))).toBe(true);
  });
});

describe("the proxy with logging off", () => {
  it("serves the request normally and writes no request_logs rows", async () => {
    stubUpstream();
    const { db, calls } = stubDb();
    const env = { ...baseEnv(db), LOG_REQUESTS: "false" } as Env;

    const res = await call("/fetch?url=https://example.com/", env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    // The response is not impoverished by logging being off: the markers and
    // the rate-limit headers are computed independently of the log row.
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(res.headers.get("x-corx-target")).toBe("example.com");
    expect(res.headers.get("x-ratelimit-limit")).toBeTruthy();
    expect(res.headers.get("x-ratelimit-remaining")).toBeTruthy();
    expect(calls.some((c) => c.sql.includes("INSERT INTO request_logs"))).toBe(false);
  });

  it("still logs by default", async () => {
    stubUpstream();
    const { db, calls } = stubDb();
    await call("/fetch?url=https://example.com/", baseEnv(db));
    expect(calls.some((c) => c.sql.includes("INSERT INTO request_logs"))).toBe(true);
  });
});

describe("the cron with a custom retention", () => {
  it("prunes and rolls up on the deployment's window", async () => {
    const { db, calls } = stubDb();
    await runScheduled({ ...baseEnv(db), LOG_RETENTION_DAYS: "7" } as Env);

    const prune = calls.find((c) => c.sql.includes("DELETE FROM request_logs"));
    expect(prune?.sql).toContain("strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)");
    expect(prune?.values).toEqual(["-7 days"]);
    const rollup = calls.find((c) => c.sql.includes("INSERT OR REPLACE INTO stats_daily"));
    expect(rollup?.values).toEqual(["-8 days"]);
  });

  it("uses the shipped default when the value is junk", async () => {
    const { db, calls } = stubDb();
    await runScheduled({ ...baseEnv(db), LOG_RETENTION_DAYS: "nope" } as Env);
    expect(calls.find((c) => c.sql.includes("DELETE FROM request_logs"))?.values).toEqual(["-30 days"]);
  });

  it("rolls up before it prunes, and skips the prune when the rollup fails", async () => {
    const statements: string[] = [];
    const db = {
      prepare: (sql: string) => {
        const s = {
          bind: () => s,
          run: async () => {
            statements.push(sql.replace(/\s+/g, " ").slice(0, 30));
            if (sql.includes("INSERT OR REPLACE INTO stats_daily")) throw new Error("rollup down");
            return { meta: { changes: 0 } };
          },
          first: async () => null,
          all: async () => ({ results: [] }),
        };
        return s;
      },
    } as unknown as D1Database;
    await runScheduled(baseEnv(db));
    expect(statements.some((s) => s.startsWith("INSERT OR REPLACE INTO stats_d"))).toBe(true);
    expect(statements.some((s) => s.startsWith("DELETE FROM request_logs"))).toBe(false);
    expect(statements.some((s) => s.startsWith("DELETE FROM rate_windows"))).toBe(true);
  });
});

describe("the stats read path with a short retention", () => {
  it("moves the raw/rollup boundary with it instead of reading pruned days", async () => {
    const now = Date.UTC(2026, 8, 15, 12);
    const { db } = stubDb();

    // 30 days of raw rows: a 7-day comparison is served from raw alone.
    const shipped = await queryStatsComparison(db, 7, now);
    expect(shipped.source).toBe("raw");
    // 3 days of raw rows: most of the window has to come from the rollup, or
    // the caller would see zeros for days whose raw rows the cron deleted.
    const short = await queryStatsComparison(db, 7, now, 3);
    expect(short.source).toBe("mixed");
  });
});

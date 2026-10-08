import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { queryLastUsed } from "../app/lib/admin.js";
import type { Env } from "../app/lib/types.js";

/**
 * #125 — a rejected request still belongs to the key that made it.
 *
 * `apiKeyId` used to be assigned *after* the first check that can throw, so
 * every 429 (public-tier quota) and every 403 raised after the key resolved was
 * written with `api_key_id = NULL` while `auth_via` said `key`. In the incident
 * that split one scraper's traffic across two buckets in the forensic query and
 * cost a second round of SQL to prove they were the same actor.
 *
 * The product reads the same field: the console's "Last used" is a
 * `MAX(created_at) GROUP BY api_key_id`, the per-key Logs filter keys on it, and
 * `stats_daily.keys` counts distinct `api_key_id`. A key whose traffic was only
 * rejections read as never used.
 */

interface SpyOptions {
  /** What `FROM api_keys` answers; null = no key resolves. */
  keyRow?: Record<string, unknown> | null;
  /** What the quota counters report (high = over every cap). */
  quotaCount?: number;
  /** Hostname the admin blocklist returns, if any. */
  blockedHost?: string;
}

/** D1 stub that records every `request_logs` insert with its bound values. */
function dbSpy(opts: SpyOptions = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const lastUsedRows: Array<{ api_key_id: string; last_used: string }> = [];
  const stmt = (sql: string, values: unknown[] = []) => {
    const s = {
      bind: (...v: unknown[]) => stmt(sql, v),
      run: async () => ({ meta: { changes: 1 } }),
      first: async () => {
        if (sql.includes("FROM api_keys")) return opts.keyRow ?? null;
        if (sql.includes("quota_counters")) return { count: opts.quotaCount ?? 1 };
        if (sql.includes("rate_windows")) return { count: 1 };
        if (sql.includes("blocked_hosts")) return opts.blockedHost ? { hostname: opts.blockedHost } : null;
        return null;
      },
      all: async () => ({ results: sql.includes("MAX(created_at)") ? lastUsedRows : [] }),
    };
    // The log insert is fire-and-forget; capture it the moment it is bound.
    if (sql.includes("INSERT INTO request_logs")) {
      const original = s.bind;
      s.bind = (...v: unknown[]) => {
        inserts.push(Object.fromEntries(LOG_COLUMNS.map((name, i) => [name, v[i]])));
        return original(...v);
      };
    }
    void values;
    return s;
  };
  const db = { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
  return { db, inserts, lastUsedRows };
}

const LOG_COLUMNS = [
  "method",
  "target_url",
  "target_host",
  "status",
  "latency_ms",
  "client_ip",
  "country",
  "api_key_id",
  "cached",
  "error",
  "req_bytes",
  "res_bytes",
  "auth_via",
  "origin",
  "injected",
] as const;

/** The public-tier key from #124's incident: a shared key with a spent quota. */
function publicRow(over: Record<string, unknown> = {}) {
  return {
    id: "key-public",
    key_hash: "h",
    name: "public",
    rate_limit_per_min: null,
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
    tier: "public",
    daily_limit_per_origin: 10,
    daily_limit_per_host: 10,
    daily_limit_total: 10,
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

function envWith(db: D1Database): Env {
  return {
    DB: db,
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
const flush = () => new Promise((r) => setTimeout(r, 0));
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

/** One logged row, from the most recent insert. */
function lastRow(inserts: Array<Record<string, unknown>>) {
  return inserts[inserts.length - 1]!;
}

afterEach(() => vi.unstubAllGlobals());

describe("rejected requests keep their key attribution", () => {
  it("a 429 from the public-tier quota logs the key", async () => {
    stubUpstream();
    const spy = dbSpy({ keyRow: publicRow(), quotaCount: 9999 }); // over every cap
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_k", origin: "https://app.example" } }),
      envWith(spy.db),
      ctx,
    );
    await flush();

    expect(res.status).toBe(429);
    const row = lastRow(spy.inserts);
    expect(row["api_key_id"]).toBe("key-public"); // ← was NULL
    expect(row["auth_via"]).toBe("key");
    expect(row["status"]).toBe(429);
  });

  it("a 403 from the per-key scope logs the key", async () => {
    stubUpstream();
    const spy = dbSpy({
      keyRow: publicRow({ tier: "standard", daily_limit_total: null, allowed_methods: "GET" }),
    });
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { method: "DELETE", headers: { "x-api-key": "corx_k" } }),
      envWith(spy.db),
      ctx,
    );
    await flush();

    expect(res.status).toBe(403);
    const row = lastRow(spy.inserts);
    expect(row["api_key_id"]).toBe("key-public");
    expect(row["error"]).toContain("may not use DELETE");
  });

  it("a 403 from the blocklist logs the key", async () => {
    stubUpstream();
    // Its own host: the blocklist answer is memoized per isolate for 30 s (see
    // guard.ts), and the cases above already memoized api.vendor.com as allowed.
    const blockedTarget = "/fetch?url=" + encodeURIComponent("https://blocked.vendor.com/data");
    const spy = dbSpy({ keyRow: publicRow(), blockedHost: "blocked.vendor.com" });
    const res = await worker.fetch(
      new Request(`https://corx.test${blockedTarget}`, { headers: { "x-api-key": "corx_k" } }),
      envWith(spy.db),
      ctx,
    );
    await flush();

    expect(res.status).toBe(403);
    expect(lastRow(spy.inserts)["api_key_id"]).toBe("key-public");
  });

  it("a 401 without a key stays unattributed", async () => {
    stubUpstream();
    const spy = dbSpy();
    const env = { ...envWith(spy.db), REQUIRE_API_KEY: "true" } as unknown as Env;
    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), env, ctx);
    await flush();

    expect(res.status).toBe(401);
    const row = lastRow(spy.inserts);
    expect(row["api_key_id"]).toBeNull();
    expect(row["auth_via"]).toBe("");
  });

  it("an unknown key stays unattributed (it never authenticated)", async () => {
    stubUpstream();
    const spy = dbSpy({ keyRow: null }); // api_keys answers nothing
    const env = { ...envWith(spy.db), REQUIRE_API_KEY: "true" } as unknown as Env;
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_bogus" } }),
      env,
      ctx,
    );
    await flush();

    expect(res.status).toBe(401);
    expect(lastRow(spy.inserts)["api_key_id"]).toBeNull();
  });

  it("a served request is unchanged", async () => {
    stubUpstream();
    const spy = dbSpy({ keyRow: publicRow({ tier: "standard", daily_limit_total: null }) });
    const res = await worker.fetch(
      new Request(`https://corx.test${TARGET}`, { headers: { "x-api-key": "corx_k" } }),
      envWith(spy.db),
      ctx,
    );
    await flush();

    expect(res.status).toBe(200);
    const row = lastRow(spy.inserts);
    expect(row["api_key_id"]).toBe("key-public");
    expect(row["status"]).toBe(200);
    expect(row["auth_via"]).toBe("key");
  });
});

describe("the product reads the same field", () => {
  it("'Last used' sees a key whose only traffic was rejected", async () => {
    const spy = dbSpy();
    spy.lastUsedRows.push({ api_key_id: "key-public", last_used: "2026-10-02T12:00:00.000Z" });
    const last = await queryLastUsed(spy.db, 30);
    expect(last.get("key-public")).toBe("2026-10-02T12:00:00.000Z");
    // The query filters on the column being non-null, which is exactly what the
    // attribution fix restores for rejected traffic.
    expect(last.size).toBe(1);
  });
});
import { Hono } from "hono";
import type { Env } from "./types.js";
import { hashKey, newRawKey } from "./auth.js";
import { normalizeOriginsInput } from "./cors.js";
import { normalizeCacheTtlInput } from "./cache.js";
import { ProxyError } from "./types.js";
import { requireAdmin, type AdminVariables } from "./access.js";

export const admin = new Hono<{ Bindings: Env; Variables: AdminVariables }>({ strict: false });

admin.use(requireAdmin);

// --- Shared D1 queries (also used by the SSR console) ---

export interface StatsTotals {
  requests: number;
  cached: number;
  avg_latency_ms: number;
  max_latency_ms: number;
  errors: number;
  req_bytes: number;
  res_bytes: number;
  /** Response bytes served from the R2 cache (= upstream bandwidth saved). */
  cached_bytes: number;
}

export interface Stats {
  totals: StatsTotals | null;
  byStatus: Array<{ status: number; n: number }>;
  topHosts: Array<{ target_host: string; n: number; bytes: number }>;
  topKeys: Array<{ id: string | null; name: string; n: number; bytes: number }>;
  byMethod: Array<{ method: string; n: number }>;
  byCountry: Array<{ country: string; n: number }>;
  hourly: HourlyPoint[];
  recentErrors: LogRow[];
}

export interface HourlyPoint {
  /** UTC hour bucket, "YYYY-MM-DDTHH" (matches substr(created_at,1,13)). */
  hour: string;
  requests: number;
  bytes: number;
}

/** Fill the last 24 hourly buckets (gaps → zeros). Exported for tests. */
export function fillHourly(
  rows: Array<{ hour: string; n: number; bytes: number | null }>,
  nowMs = Date.now(),
): HourlyPoint[] {
  const map = new Map(rows.map((r) => [r.hour, r]));
  const base = Math.floor(nowMs / 3_600_000) * 3_600_000;
  const out: HourlyPoint[] = [];
  for (let i = 23; i >= 0; i--) {
    const key = new Date(base - i * 3_600_000).toISOString().slice(0, 13);
    const r = map.get(key);
    out.push({ hour: key, requests: r?.n ?? 0, bytes: r?.bytes ?? 0 });
  }
  return out;
}

const SINCE_24H = "created_at > datetime('now', '-24 hours')";

async function allOrEmpty<T>(db: D1Database, sql: string): Promise<T[]> {
  return db
    .prepare(sql)
    .all<T>()
    .then((r) => r.results)
    .catch(() => [] as T[]);
}

export async function queryStats(db: D1Database): Promise<Stats> {
  const [totals, byStatus, topHosts, topKeys, byMethod, byCountry, hourlyRows, recentErrors] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS requests,
                SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) AS cached,
                AVG(latency_ms) AS avg_latency_ms,
                MAX(latency_ms) AS max_latency_ms,
                SUM(CASE WHEN status >= 500 OR error != '' THEN 1 ELSE 0 END) AS errors,
                SUM(req_bytes) AS req_bytes,
                SUM(res_bytes) AS res_bytes,
                SUM(CASE WHEN cached = 1 THEN res_bytes ELSE 0 END) AS cached_bytes
         FROM request_logs WHERE ${SINCE_24H}`,
      )
      .first<StatsTotals>()
      .catch(() => null),
    allOrEmpty<{ status: number; n: number }>(
      db,
      `SELECT status, COUNT(*) AS n FROM request_logs WHERE ${SINCE_24H} GROUP BY status ORDER BY n DESC LIMIT 20`,
    ),
    allOrEmpty<{ target_host: string; n: number; bytes: number }>(
      db,
      `SELECT target_host, COUNT(*) AS n, SUM(res_bytes) AS bytes FROM request_logs
       WHERE ${SINCE_24H} AND target_host != '' GROUP BY target_host ORDER BY n DESC LIMIT 20`,
    ),
    allOrEmpty<{ id: string | null; name: string; n: number; bytes: number }>(
      db,
      `SELECT l.api_key_id AS id, COALESCE(k.name, '') AS name, COUNT(*) AS n, SUM(l.res_bytes) AS bytes
       FROM request_logs l LEFT JOIN api_keys k ON k.id = l.api_key_id
       WHERE l.${SINCE_24H} GROUP BY l.api_key_id ORDER BY bytes DESC LIMIT 10`,
    ),
    allOrEmpty<{ method: string; n: number }>(
      db,
      `SELECT method, COUNT(*) AS n FROM request_logs WHERE ${SINCE_24H} GROUP BY method ORDER BY n DESC`,
    ),
    allOrEmpty<{ country: string; n: number }>(
      db,
      `SELECT country, COUNT(*) AS n FROM request_logs WHERE ${SINCE_24H} GROUP BY country ORDER BY n DESC LIMIT 10`,
    ),
    allOrEmpty<{ hour: string; n: number; bytes: number }>(
      db,
      `SELECT substr(created_at, 1, 13) AS hour, COUNT(*) AS n, SUM(res_bytes) AS bytes
       FROM request_logs WHERE ${SINCE_24H} GROUP BY hour ORDER BY hour`,
    ),
    allOrEmpty<LogRow>(
      db,
      `SELECT id, created_at, method, target_host, status, latency_ms, country, cached, error, req_bytes, res_bytes
       FROM request_logs WHERE ${SINCE_24H} AND (status >= 500 OR error != '')
       ORDER BY id DESC LIMIT 10`,
    ),
  ]);
  return {
    totals,
    byStatus,
    topHosts,
    topKeys,
    byMethod,
    byCountry,
    hourly: fillHourly(hourlyRows),
    recentErrors,
  };
}

export interface LogRow {
  id: number;
  created_at: string;
  method: string;
  target_host: string;
  status: number | null;
  latency_ms: number | null;
  country: string;
  cached: number;
  error: string;
  req_bytes: number;
  res_bytes: number | null;
}

export async function queryLogs(db: D1Database, limit: number): Promise<LogRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, created_at, method, target_host, status, latency_ms, country, cached, error, req_bytes, res_bytes
       FROM request_logs ORDER BY id DESC LIMIT ?`,
    )
    .bind(Math.min(Math.max(limit || 50, 1), 200))
    .all<LogRow>();
  return rows.results;
}

export interface KeyRow {
  id: string;
  name: string;
  rate_limit_per_min: number | null;
  allowed_origins: string | null;
  cache_ttl: number | null;
  no_cache: number;
  created_at: string;
  revoked_at: string | null;
}

export async function queryKeys(db: D1Database): Promise<KeyRow[]> {
  const rows = await db
    .prepare(
      "SELECT id, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, created_at, revoked_at FROM api_keys ORDER BY created_at DESC",
    )
    .all<KeyRow>();
  return rows.results;
}

export async function createApiKey(
  db: D1Database,
  name: string,
  rateLimitPerMin: number | null,
  allowedOrigins?: string,
  cacheTtl?: string,
  noCache?: boolean,
): Promise<{ id: string; key: string }> {
  const raw = newRawKey();
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO api_keys (id, key_hash, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      await hashKey(raw),
      name,
      rateLimitPerMin,
      normalizeOriginsInput(allowedOrigins ?? ""),
      normalizeCacheTtlInput(cacheTtl ?? ""),
      noCache ? 1 : 0,
    )
    .run();
  return { id, key: raw };
}

export interface KeyUpdate {
  name?: string;
  rateLimitPerMin?: number | null;
  /** Raw origins input ("" = inherit global). Validated + normalized. */
  allowedOrigins?: string;
  /** Raw TTL input ("" = inherit global, "0" = never store). Validated. */
  cacheTtl?: string;
  noCache?: boolean;
}

export async function updateApiKey(db: D1Database, id: string, update: KeyUpdate): Promise<void> {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  if (update.name !== undefined) {
    sets.push("name = ?");
    values.push(update.name);
  }
  if (update.rateLimitPerMin !== undefined) {
    sets.push("rate_limit_per_min = ?");
    values.push(update.rateLimitPerMin);
  }
  if (update.allowedOrigins !== undefined) {
    sets.push("allowed_origins = ?");
    values.push(normalizeOriginsInput(update.allowedOrigins));
  }
  if (update.cacheTtl !== undefined) {
    sets.push("cache_ttl = ?");
    values.push(normalizeCacheTtlInput(update.cacheTtl));
  }
  if (update.noCache !== undefined) {
    sets.push("no_cache = ?");
    values.push(update.noCache ? 1 : 0);
  }
  if (sets.length === 0) return;
  await db
    .prepare(`UPDATE api_keys SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, id)
    .run();
}

export interface BlockedRow {
  hostname: string;
  reason: string;
  created_at: string;
}

export async function queryBlockedHosts(db: D1Database): Promise<BlockedRow[]> {
  const rows = await db
    .prepare("SELECT hostname, reason, created_at FROM blocked_hosts ORDER BY created_at DESC")
    .all<BlockedRow>();
  return rows.results;
}

// --- JSON API ---

admin.get("/stats", async (c) => c.json({ window: "24h", ...(await queryStats(c.env.DB)) }));

admin.get("/logs", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json({ logs: await queryLogs(c.env.DB, limit) });
});

admin.get("/keys", async (c) => c.json({ keys: await queryKeys(c.env.DB) }));

admin.post("/keys", async (c) => {
  const body = await c.req
    .json<{ name?: string; rateLimitPerMin?: number; allowedOrigins?: string; cacheTtl?: string; noCache?: boolean }>()
    .catch(() => ({}) as { name?: string; rateLimitPerMin?: number; allowedOrigins?: string; cacheTtl?: string; noCache?: boolean });
  try {
    const { id, key } = await createApiKey(
      c.env.DB,
      body.name ?? "",
      body.rateLimitPerMin ?? null,
      body.allowedOrigins,
      body.cacheTtl,
      body.noCache,
    );
    // Raw key is shown once — store it somewhere safe.
    return c.json({ id, key, name: body.name ?? "" }, 201);
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

admin.patch("/keys/:id", async (c) => {
  const body = await c.req
    .json<{ name?: string; rateLimitPerMin?: number | null; allowedOrigins?: string; cacheTtl?: string; noCache?: boolean }>()
    .catch(
      () => ({}) as { name?: string; rateLimitPerMin?: number | null; allowedOrigins?: string; cacheTtl?: string; noCache?: boolean },
    );
  try {
    await updateApiKey(c.env.DB, c.req.param("id"), body);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, 400);
    throw err;
  }
});

admin.post("/keys/:id/revoke", async (c) => {
  await c.env.DB.prepare("UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

admin.get("/blocked-hosts", async (c) => c.json({ hosts: await queryBlockedHosts(c.env.DB) }));

admin.post("/block-host", async (c) => {
  const body = await c.req
    .json<{ hostname?: string; reason?: string }>()
    .catch(() => ({}) as { hostname?: string; reason?: string });
  if (!body.hostname) return c.json({ error: "hostname required" }, 400);
  await c.env.DB.prepare("INSERT OR IGNORE INTO blocked_hosts (hostname, reason) VALUES (?, ?)")
    .bind(body.hostname.toLowerCase(), body.reason ?? "")
    .run();
  return c.json({ ok: true });
});

admin.delete("/block-host/:hostname", async (c) => {
  await c.env.DB.prepare("DELETE FROM blocked_hosts WHERE hostname = ?")
    .bind(c.req.param("hostname").toLowerCase())
    .run();
  return c.json({ ok: true });
});

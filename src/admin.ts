import { Hono } from "hono";
import type { Env } from "./types.js";
import { hashKey, newRawKey } from "./auth.js";
import { requireAdmin, type AdminVariables } from "./access.js";

export const admin = new Hono<{ Bindings: Env; Variables: AdminVariables }>({ strict: false });

admin.use(requireAdmin);

// --- Shared D1 queries (also used by the SSR console) ---

export interface Stats {
  totals: { requests: number; cached: number; avg_latency_ms: number } | null;
  byStatus: Array<{ status: number; n: number }>;
  topHosts: Array<{ target_host: string; n: number }>;
}

export async function queryStats(db: D1Database): Promise<Stats> {
  const totals = await db
    .prepare(
      `SELECT COUNT(*) AS requests,
              SUM(CASE WHEN cached = 1 THEN 1 ELSE 0 END) AS cached,
              AVG(latency_ms) AS avg_latency_ms
       FROM request_logs WHERE created_at > datetime('now', '-24 hours')`,
    )
    .first<{ requests: number; cached: number; avg_latency_ms: number }>()
    .catch(() => null);
  const byStatus = await db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM request_logs
       WHERE created_at > datetime('now', '-24 hours') GROUP BY status ORDER BY n DESC LIMIT 20`,
    )
    .all<{ status: number; n: number }>()
    .catch(() => ({ results: [] as Array<{ status: number; n: number }> }));
  const topHosts = await db
    .prepare(
      `SELECT target_host, COUNT(*) AS n FROM request_logs
       WHERE created_at > datetime('now', '-24 hours') GROUP BY target_host ORDER BY n DESC LIMIT 20`,
    )
    .all<{ target_host: string; n: number }>()
    .catch(() => ({ results: [] as Array<{ target_host: string; n: number }> }));
  return { totals, byStatus: byStatus.results, topHosts: topHosts.results };
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
}

export async function queryLogs(db: D1Database, limit: number): Promise<LogRow[]> {
  const rows = await db
    .prepare(
      `SELECT id, created_at, method, target_host, status, latency_ms, country, cached, error
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
  created_at: string;
  revoked_at: string | null;
}

export async function queryKeys(db: D1Database): Promise<KeyRow[]> {
  const rows = await db
    .prepare("SELECT id, name, rate_limit_per_min, created_at, revoked_at FROM api_keys ORDER BY created_at DESC")
    .all<KeyRow>();
  return rows.results;
}

export async function createApiKey(
  db: D1Database,
  name: string,
  rateLimitPerMin: number | null,
): Promise<{ id: string; key: string }> {
  const raw = newRawKey();
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO api_keys (id, key_hash, name, rate_limit_per_min) VALUES (?, ?, ?, ?)")
    .bind(id, await hashKey(raw), name, rateLimitPerMin)
    .run();
  return { id, key: raw };
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
    .json<{ name?: string; rateLimitPerMin?: number }>()
    .catch(() => ({}) as { name?: string; rateLimitPerMin?: number });
  const { id, key } = await createApiKey(c.env.DB, body.name ?? "", body.rateLimitPerMin ?? null);
  // Raw key is shown once — store it somewhere safe.
  return c.json({ id, key, name: body.name ?? "" }, 201);
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

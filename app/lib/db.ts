/**
 * Fire-and-forget D1 logging (call via ctx.waitUntil).
 *
 * Logging is a deployment choice, not a fixed behaviour: `LOG_REQUESTS=false`
 * writes nothing at all (the response is unaffected — rate limiting, quota
 * headers and `X-Corx-*` markers never depend on the log), and
 * `LOG_RETENTION_DAYS` decides how long the raw rows are kept. The hosted
 * instance documents 30 days in /terms; a self-hosted deployment may want less
 * data on its own account, and that is its call.
 */
import type { Env } from "./types.js";

/** Default raw-log retention, and the ceiling a deployment may configure. */
export const DEFAULT_LOG_RETENTION_DAYS = 30;
export const MAX_LOG_RETENTION_DAYS = 365;
export interface LogRow {
  method: string;
  targetUrl: string;
  targetHost: string;
  status: number | null;
  latencyMs: number;
  clientIp: string;
  country: string;
  apiKeyId: string | null;
  cached: boolean;
  error: string;
  reqBytes: number;
  /** Response bytes. Null = unknown (chunked stream passthrough). */
  resBytes: number | null;
  /** "key" | "origin" | "" — how the caller was authorized. */
  authVia?: string;
  /** Request Origin (audit for keyless access). */
  origin?: string;
  /** 1 when upstream injection rules were applied to this request. */
  injected?: boolean;
}

/** "false"/"0"/"off"/"no" (case-insensitive) turn request logging off. */
export function requestsLogged(env: Pick<Env, "LOG_REQUESTS">): boolean {
  const raw = (env.LOG_REQUESTS ?? "").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "no";
}

/**
 * Raw-log retention in days: `LOG_RETENTION_DAYS` when it is an integer inside
 * 1…365, the default otherwise (a junk value must not silently delete more
 * history than intended, nor keep everything forever).
 */
export function logRetentionDays(env: Pick<Env, "LOG_RETENTION_DAYS">): number {
  const raw = (env.LOG_RETENTION_DAYS ?? "").trim();
  if (raw === "") return DEFAULT_LOG_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_LOG_RETENTION_DAYS) {
    if (import.meta.env.DEV) {
      console.warn(
        `LOG_RETENTION_DAYS must be an integer 1–${MAX_LOG_RETENTION_DAYS} (got "${raw}") — using ${DEFAULT_LOG_RETENTION_DAYS}.`,
      );
    }
    return DEFAULT_LOG_RETENTION_DAYS;
  }
  return n;
}

export async function logRequest(env: Pick<Env, "DB" | "LOG_REQUESTS">, row: LogRow): Promise<void> {
  if (!requestsLogged(env)) return;
  const db = env.DB;
  try {
    await db
      .prepare(
        `INSERT INTO request_logs
           (method, target_url, target_host, status, latency_ms, client_ip, country, api_key_id, cached, error, req_bytes, res_bytes, auth_via, origin, injected)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.method,
        row.targetUrl.slice(0, 2000),
        row.targetHost.slice(0, 255),
        row.status,
        row.latencyMs,
        row.clientIp.slice(0, 64),
        row.country.slice(0, 8),
        row.apiKeyId,
        row.cached ? 1 : 0,
        row.error.slice(0, 500),
        row.reqBytes,
        row.resBytes,
        (row.authVia ?? "").slice(0, 16),
        (row.origin ?? "").slice(0, 255),
        row.injected ? 1 : 0,
      )
      .run();
  } catch {
    // logging must never break the proxy
  }
}

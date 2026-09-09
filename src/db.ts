/** Fire-and-forget D1 logging (call via ctx.waitUntil). */
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
}

export async function logRequest(db: D1Database, row: LogRow): Promise<void> {
  try {
    await db
      .prepare(
        `INSERT INTO request_logs
           (method, target_url, target_host, status, latency_ms, client_ip, country, api_key_id, cached, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      )
      .run();
  } catch {
    // logging must never break the proxy
  }
}

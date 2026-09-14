import type { ApiKeyRow } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";

/**
 * Daily quotas for the public tier (the shared key users embed on their own
 * sites). Three dimensions, each counted in UTC days:
 *
 *   - per caller `Origin` — soft: browsers set it, scripts can forge it. Its
 *     job is to stop one embedded site eating the whole pool.
 *   - per target host — keeps the public pool from being used as a scraper
 *     against a single upstream.
 *   - per key (the whole public instance) — the real bound: it is sized to sit
 *     under Cloudflare's D1 write budget, because every check here fails open.
 *     If D1 rejects writes, quota enforcement silently stops while the Worker
 *     keeps proxying, so the total cap must never be large enough to exhaust
 *     the write budget in the first place.
 *
 * Cache hits consume quota too (the check runs before the cache): otherwise
 * "N requests per day" would be bypassed by any URL that happens to be cached.
 */

/** UTC day key ("YYYY-MM-DD") used as the quota period. */
export function utcDay(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** ISO timestamp of the next UTC midnight — when every daily counter resets. */
export function quotaResetAt(nowMs = Date.now()): string {
  const next = new Date(nowMs);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/** Seconds until the next UTC midnight (for `Retry-After`). */
export function quotaResetIn(nowMs = Date.now()): number {
  return Math.max(1, Math.ceil((Date.parse(quotaResetAt(nowMs)) - nowMs) / 1000));
}

export type QuotaScope = "origin" | "host" | "total";

export interface QuotaBucket {
  /** Configured cap, or null when this dimension is unlimited. */
  limit: number | null;
  /** Count for the current UTC day, this request included. */
  used: number;
  /** null when unlimited. */
  remaining: number | null;
}

export interface PublicQuota {
  origin: QuotaBucket | null;
  host: QuotaBucket | null;
  total: QuotaBucket;
}

export interface QuotaInput {
  keyId: string;
  /** Normalized caller Origin, or null when the request sent none. */
  origin: string | null;
  /** Proxied target host. */
  host: string;
  /** Caller IP — stands in for Origin on non-browser requests. */
  ip: string;
  row: Pick<ApiKeyRow, "daily_limit_per_origin" | "daily_limit_per_host" | "daily_limit_total">;
}

/** A usable cap: a positive integer, otherwise null (unlimited). */
function cap(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

/** Increment one bucket, then reject when the day's count is over its cap. */
async function bump(
  db: D1Database,
  bucketKey: string,
  period: string,
  limit: number,
  scope: QuotaScope,
): Promise<QuotaBucket> {
  await db
    .prepare(
      `INSERT INTO quota_counters (bucket_key, period, count)
       VALUES (?, ?, 1)
       ON CONFLICT (bucket_key, period) DO UPDATE SET count = count + 1`,
    )
    .bind(bucketKey, period)
    .run();
  const row = await db
    .prepare("SELECT count FROM quota_counters WHERE bucket_key = ? AND period = ?")
    .bind(bucketKey, period)
    .first<{ count: number }>();
  const used = row?.count ?? 1;
  if (used > limit) {
    const where = scope === "total" ? "this service" : scope === "origin" ? "your origin" : "that host";
    throw new ProxyError(429, `Daily request limit reached for ${where} (${limit}/day)`, {
      scope,
      limit,
      resetAt: quotaResetAt(),
      retryAfter: quotaResetIn(),
    });
  }
  return { limit, used, remaining: Math.max(0, limit - used) };
}

/**
 * Charge and check the public key's daily quotas.
 *
 * Dimensions with no configured cap are skipped entirely (no D1 write), and a
 * key without a total cap is refused rather than served unmetered.
 */
export async function checkPublicQuota(db: D1Database, input: QuotaInput): Promise<PublicQuota> {
  const perOrigin = cap(input.row.daily_limit_per_origin);
  const perHost = cap(input.row.daily_limit_per_host);
  const total = cap(input.row.daily_limit_total);
  if (total === null) {
    // Misconfiguration (hand-edited DB): never serve a public key unmetered.
    throw new ProxyError(503, "Public key is not configured with a daily total limit");
  }

  const period = utcDay();
  const originBucketKey = `q:o:${input.origin ?? `ip:${input.ip || "unknown"}`}`;
  const hostBucketKey = `q:h:${input.host}`;
  const totalBucketKey = `q:k:${input.keyId}`;

  try {
    const origin = perOrigin === null ? null : await bump(db, originBucketKey, period, perOrigin, "origin");
    const host = perHost === null ? null : await bump(db, hostBucketKey, period, perHost, "host");
    const totalBucket = await bump(db, totalBucketKey, period, total, "total");
    return { origin, host, total: totalBucket };
  } catch (err) {
    if (err instanceof ProxyError) throw err;
    // Fail open on a D1 error, like the per-minute rate limit. The total cap is
    // sized under the write budget so this path stays an exception, not a state.
    return { origin: null, host: null, total: { limit: total, used: 0, remaining: null } };
  }
}

/** `X-Corx-Quota-*` response headers (only for dimensions with a cap). */
export function quotaHeaders(quota: PublicQuota): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (name: string, bucket: QuotaBucket | null) => {
    if (!bucket || bucket.limit === null) return;
    out[`X-Corx-Quota-${name}-Limit`] = String(bucket.limit);
    out[`X-Corx-Quota-${name}-Remaining`] = String(bucket.remaining ?? 0);
  };
  set("Origin", quota.origin);
  set("Host", quota.host);
  set("Day", quota.total);
  return out;
}

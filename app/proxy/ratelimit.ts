import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { num } from "../lib/utils.js";

/**
 * Fixed-window rate limit backed by D1 (works across isolates).
 * Fail-open: if D1 errors, the request is allowed.
 */
export async function checkRateLimit(
  db: D1Database,
  env: Env,
  bucketKey: string,
  customLimit?: number | null,
): Promise<{ limit: number; remaining: number }> {
  const limit = customLimit ?? num(env.RATE_LIMIT_PER_MIN, 60);
  const windowMin = Math.floor(Date.now() / 60_000);
  try {
    await db
      .prepare(
        `INSERT INTO rate_windows (bucket_key, window_min, count)
         VALUES (?, ?, 1)
         ON CONFLICT (bucket_key, window_min) DO UPDATE SET count = count + 1`,
      )
      .bind(bucketKey, windowMin)
      .run();
    const row = await db
      .prepare("SELECT count FROM rate_windows WHERE bucket_key = ? AND window_min = ?")
      .bind(bucketKey, windowMin)
      .first<{ count: number }>();
    const count = row?.count ?? 1;
    if (count > limit) {
      throw new ProxyError(429, `Rate limit exceeded (${limit}/min). Retry in a bit.`);
    }
    return { limit, remaining: Math.max(0, limit - count) };
  } catch (err) {
    if (err instanceof ProxyError) throw err;
    return { limit, remaining: limit }; // fail open
  }
}

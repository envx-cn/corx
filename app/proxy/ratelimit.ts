import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { num } from "../lib/utils.js";

/**
 * Rate limiting, in two interchangeable modes.
 *
 * **`d1` (default)** — a fixed 1-minute window in D1, so the numbers are global
 * and every isolate agrees on them. One row write per cache miss. Fail-open: if
 * D1 errors, the request is allowed.
 *
 * **`edge` (opt-in, migration 0015)** — a Workers Rate Limiting binding. It
 * counts in-isolate and costs no D1 write. Because `limit({ key })` namespaces
 * the counter, the bucket shapes survive: the same bucket key (per key / per IP
 * / per `origin + IP`) is simply handed to the binding, so "per IP" stays per IP
 * rather than collapsing into one shared pool. Three things are given up, which
 * is why it is a per-key choice and not a replacement:
 *
 *   1. **the limit is the binding's**, configured once at deploy time — this
 *      key's `rate_limit_per_min` is not consulted, so every edge key shares one
 *      number;
 *   2. **counters are per isolate**, so the real ceiling is `N × limit` for the
 *      N isolates serving the key. The D1 window's boundary burst still exists;
 *      the divergence is across isolates rather than across time;
 *   3. **no counters to report** — the binding answers `success` only, so the
 *      `X-RateLimit-*` headers are omitted in this mode instead of guessed.
 *
 * Everything here fails open, and the edge path degrades to the D1 path rather
 * than failing closed: a missing binding (the deployment never configured one)
 * or a binding that throws is a `console.warn` once per isolate, not a new way
 * for the proxy to be unavailable.
 */

/** Which limiter ran, and what it can honestly report. */
export interface RateLimitResult {
  /**
   * The limit that was applied, or null when the binding owns it and cannot
   * report a number (edge mode). Null means: emit no `X-RateLimit-*` header.
   */
  limit: number | null;
  /** Requests left, or null for the same reason. */
  remaining: number | null;
  source: "d1" | "edge";
}

const UPSERT_SQL = `INSERT INTO rate_windows (bucket_key, window_min, count)
         VALUES (?, ?, 1)
         ON CONFLICT (bucket_key, window_min) DO UPDATE SET count = count + 1
         RETURNING count`;

/** Warn once per isolate: a missing binding is a deployment choice, not an error storm. */
let warnedNoBinding = false;
let warnedEdgeError = false;

/** Test seam: forget the once-per-isolate warnings. */
export function resetRateLimitWarnings(): void {
  warnedNoBinding = false;
  warnedEdgeError = false;
}

/** The global D1 window: exact, cross-isolate, one row write. */
async function d1Limiter(
  db: D1Database,
  bucketKey: string,
  limit: number,
): Promise<RateLimitResult> {
  const windowMin = Math.floor(Date.now() / 60_000);
  try {
    // `RETURNING count` instead of an upsert plus a re-read: same exact
    // counter, one statement and one round trip instead of two.
    const row = await db
      .prepare(UPSERT_SQL)
      .bind(bucketKey, windowMin)
      .first<{ count: number }>();
    const count = Number(row?.count ?? 1) || 1;
    if (count > limit) {
      throw new ProxyError(429, `Rate limit exceeded (${limit}/min). Retry in a bit.`);
    }
    return { limit, remaining: Math.max(0, limit - count), source: "d1" };
  } catch (err) {
    if (err instanceof ProxyError) throw err;
    return { limit, remaining: limit, source: "d1" }; // fail open
  }
}

/**
 * The edge binding: cheap, per-isolate, and unable to report numbers.
 * `bucketKey` is passed straight through as the counter's key, so a per-IP
 * bucket stays a per-IP counter.
 */
async function edgeLimiter(binding: RateLimit, bucketKey: string): Promise<RateLimitResult> {
  const { success } = await binding.limit({ key: bucketKey });
  if (!success) {
    // No limit to name (the binding owns it) and no window to quote, so the
    // message says what actually happened rather than a number we cannot stand
    // behind. Deliberately not carrying `retryAfter`: the binding's period is a
    // deploy-time value the Worker cannot read.
    throw new ProxyError(429, "Rate limit exceeded by this deployment's edge limiter. Retry in a bit.");
  }
  return { limit: null, remaining: null, source: "edge" };
}

/**
 * Apply the key's limiter for one cache miss.
 *
 * `mode: "edge"` with no binding, or a binding that throws, falls back to the
 * D1 window: the deployment opted into a cheaper meter, not into being
 * unmetered.
 */
export async function checkRateLimit(
  db: D1Database,
  env: Env,
  bucketKey: string,
  opts: { customLimit?: number | null; mode?: string | null } = {},
): Promise<RateLimitResult> {
  const limit = opts.customLimit ?? num(env.RATE_LIMIT_PER_MIN, 60);
  if ((opts.mode ?? "d1") === "edge") {
    const binding = env.RATE_LIMITER;
    if (binding) {
      try {
        return await edgeLimiter(binding, bucketKey);
      } catch (err) {
        if (err instanceof ProxyError) throw err;
        // A broken binding must not become a broken proxy: fall through to D1.
        if (!warnedEdgeError) {
          warnedEdgeError = true;
          console.warn("corx: RATE_LIMITER failed, falling back to the D1 limiter:", (err as Error)?.message);
        }
      }
    } else if (!warnedNoBinding) {
      warnedNoBinding = true;
      console.warn(
        "corx: a key uses the edge rate limiter but no RATE_LIMITER binding is configured — using D1 instead. See README → Config.",
      );
    }
  }
  return d1Limiter(db, bucketKey, limit);
}

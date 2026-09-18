import type { Context, Next } from "hono";
import type { ApiKeyRow, Env } from "./types.js";
import { sha256Hex } from "./utils.js";
import { decryptRowInjection } from "./crypto.js";
import { readControl } from "./control.js";
import { normalizeOrigin, portWildcardFor } from "../proxy/cors.js";

/** Hono context variables set by apiKeyMiddleware (see server.ts). */
export type ProxyVariables = {
  apiKey: ApiKeyRow | null;
  /** How the caller was authorized: presented key, keyless origin grant, or nobody. */
  authVia: "key" | "origin" | null;
  /**
   * Which credential form presented the key. `authorization` means the header
   * *is* CORX's own credential, so the handler must not forward it to the
   * target; the other forms leave the caller's `Authorization` alone (the
   * OAuth pattern: a CORX key in `X-Api-Key`/`?corx-key=`, the caller's own
   * bearer token in `Authorization`). Null for a keyless grant or anonymous.
   */
  keySource: KeySource | null;
  /**
   * Origin the keyless grant matched on (`Origin` header, else `Referer`).
   * Quota and logs read this too, so one caller is always one bucket whichever
   * header identified them.
   */
  callerOrigin: string | null;
};

/** Hash an API key with SHA-256 (hex). Never store raw keys. */
export function hashKey(raw: string): Promise<string> {
  return sha256Hex(`corx:v1:${raw}`);
}

/** New random API key in `corx_...` format (uses Web Crypto). */
export function newRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `corx_${b64}`;
}

/** Where a presented key came from. */
export type KeySource = "x-api-key" | "authorization" | "query";

export interface PresentedKey {
  raw: string;
  source: KeySource;
}

/** Pull a key from `x-api-key`, `Authorization: Bearer`, or `?corx-key=`. */
export function extractRawKey(req: Request, url: URL): PresentedKey | null {
  const header = req.headers.get("x-api-key");
  if (header?.trim()) return { raw: header.trim(), source: "x-api-key" };
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const raw = auth.slice(7).trim();
    if (raw) return { raw, source: "authorization" };
  }
  const q = readControl(url, "key");
  if (q?.trim()) return { raw: q.trim(), source: "query" };
  return null;
}

/** Look up a key row by its raw value. Null when missing/revoked/DB error. */
export async function lookupApiKey(db: D1Database, raw: string, kek?: string): Promise<ApiKeyRow | null> {
  try {
    const row = await db
      .prepare(
        "SELECT id, key_hash, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, response_rules, allowed_hosts, keyless, tier, daily_limit_per_origin, daily_limit_per_host, daily_limit_total, created_at, revoked_at FROM api_keys WHERE key_hash = ?",
      )
      .bind(await hashKey(raw))
      .first<ApiKeyRow>();
    if (!row || row.revoked_at) return null;
    // Decrypt at the boundary: the handler/playground below consume plaintext.
    return decryptRowInjection(kek, row);
  } catch {
    return null;
  }
}

/**
 * The caller's origin as a browser reports it, for keyless grant matching.
 *
 * `Origin` only rides along on CORS requests and on same-origin requests that
 * aren't GET/HEAD. Same-origin GETs (the landing page's live demo) and no-cors
 * subresource loads (plain <img>/<script>, JSONP) send none — those do send a
 * `Referer`, which is the same trust class: a caller-supplied header, which is
 * exactly what the keyless console hint already warns about. Callers that
 * suppress it (`Referrer-Policy: no-referrer`) fall through to anonymous and
 * can present `?corx-key=` instead.
 */
export function callerOrigin(req: Request): string | null {
  const direct = normalizeOrigin(req.headers.get("origin"));
  if (direct) return direct;
  const referer = req.headers.get("referer");
  if (!referer) return null;
  try {
    // A same-origin Referer carries the full path; only its origin is matched.
    return normalizeOrigin(new URL(referer).origin);
  } catch {
    return null;
  }
}

/**
 * Keyless access: resolve a key from the request's Origin via keyless_origins.
 * Null when no grant / revoked / DB error (fail-open to anonymous).
 */
export async function lookupKeyByOrigin(db: D1Database, origin: string, kek?: string): Promise<ApiKeyRow | null> {
  // `origin` is already normalized (`callerOrigin` -> `URL.origin`). A loopback
  // caller also matches a `scheme://host:*` grant; an exact grant wins when
  // both exist for the same host.
  const candidates = [...new Set([origin, portWildcardFor(origin)].filter((c): c is string => c !== null))];
  try {
    const row = await db
      .prepare(
        `SELECT k.id, k.key_hash, k.name, k.rate_limit_per_min, k.allowed_origins, k.cache_ttl, k.no_cache,
                k.ip_check, k.dns_check, k.vars, k.header_rules, k.param_rules, k.response_rules, k.allowed_hosts, k.keyless,
                k.tier, k.daily_limit_per_origin, k.daily_limit_per_host, k.daily_limit_total,
                k.created_at, k.revoked_at
         FROM keyless_origins o JOIN api_keys k ON k.id = o.key_id
         WHERE o.origin IN (${candidates.map(() => "?").join(", ")}) AND k.keyless = 1
         ORDER BY (o.origin = ?) DESC
         LIMIT 1`,
      )
      .bind(...candidates, origin)
      .first<ApiKeyRow>();
    if (!row || row.revoked_at) return null;
    return decryptRowInjection(kek, row);
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's identity once per request (runs before CORS, so
 * per-key allowed origins apply): a presented key wins; otherwise a keyless
 * grant for the caller's `Origin` (or `Referer`, see `callerOrigin`). Unknown
 * keys fall through to the grant (graceful key rotation), and everything falls
 * through to anonymous. Fail-open: a D1 hiccup means "anonymous", not
 * "reject" — REQUIRE_API_KEY still applies.
 */
export async function apiKeyMiddleware(
  c: Context<{ Bindings: Env; Variables: ProxyVariables }>,
  next: Next,
): Promise<void> {
  const presented = extractRawKey(c.req.raw, new URL(c.req.url));
  let row = presented ? await lookupApiKey(c.env.DB, presented.raw, c.env.INJECTION_KEK) : null;
  let authVia: "key" | "origin" | null = row ? "key" : null;
  const caller = callerOrigin(c.req.raw);
  if (!row && caller) {
    // keyless_origins may not exist yet on an unmigrated database — treat
    // a lookup failure as "no grant" and keep serving. Local updates go
    // through the console, which does not depend on this query.
    row = await lookupKeyByOrigin(c.env.DB, caller, c.env.INJECTION_KEK);
    if (row) authVia = "origin";
  }
  c.set("apiKey", row);
  c.set("authVia", authVia);
  // Only a key that actually authenticated this request is CORX's credential:
  // an unknown `Authorization` that fell through to a keyless grant is the
  // caller's own header and must still reach the target.
  c.set("keySource", authVia === "key" && presented ? presented.source : null);
  c.set("callerOrigin", caller);
  await next();
}

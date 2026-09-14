import type { Context, Next } from "hono";
import type { ApiKeyRow, Env } from "./types.js";
import { sha256Hex } from "./utils.js";

/** Hono context variables set by apiKeyMiddleware (see server.ts). */
export type ProxyVariables = {
  apiKey: ApiKeyRow | null;
  /** How the caller was authorized: presented key, keyless origin grant, or nobody. */
  authVia: "key" | "origin" | null;
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

/** Pull a key from `x-api-key`, `Authorization: Bearer`, or `?key=`. */
export function extractRawKey(req: Request, url: URL): string | null {
  const header = req.headers.get("x-api-key");
  if (header?.trim()) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const q = url.searchParams.get("key");
  if (q?.trim()) return q.trim();
  return null;
}

/** Look up a key row by its raw value. Null when missing/revoked/DB error. */
export async function lookupApiKey(db: D1Database, raw: string): Promise<ApiKeyRow | null> {
  try {
    const row = await db
      .prepare(
        "SELECT id, key_hash, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, allowed_hosts, keyless, tier, daily_limit_per_origin, daily_limit_per_host, daily_limit_total, created_at, revoked_at FROM api_keys WHERE key_hash = ?",
      )
      .bind(await hashKey(raw))
      .first<ApiKeyRow>();
    if (!row || row.revoked_at) return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * Normalize an Origin header for grant matching. Browsers send a bare
 * serialized origin; anything unparseable (or the literal "null") never
 * matches a grant.
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t || t === "null") return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Keyless access: resolve a key from the request's Origin via keyless_origins.
 * Null when no grant / revoked / DB error (fail-open to anonymous).
 */
export async function lookupKeyByOrigin(db: D1Database, origin: string): Promise<ApiKeyRow | null> {
  try {
    const row = await db
      .prepare(
        `SELECT k.id, k.key_hash, k.name, k.rate_limit_per_min, k.allowed_origins, k.cache_ttl, k.no_cache,
                k.ip_check, k.dns_check, k.vars, k.header_rules, k.param_rules, k.allowed_hosts, k.keyless,
                k.tier, k.daily_limit_per_origin, k.daily_limit_per_host, k.daily_limit_total,
                k.created_at, k.revoked_at
         FROM keyless_origins o JOIN api_keys k ON k.id = o.key_id
         WHERE o.origin = ? AND k.keyless = 1`,
      )
      .bind(origin)
      .first<ApiKeyRow>();
    if (!row || row.revoked_at) return null;
    return row;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's identity once per request (runs before CORS, so
 * per-key allowed origins apply): a presented key wins; otherwise a keyless
 * origin grant. Unknown keys fall through to the origin grant (graceful key
 * rotation), and everything falls through to anonymous. Fail-open: a D1
 * hiccup means "anonymous", not "reject" — REQUIRE_API_KEY still applies.
 */
export async function apiKeyMiddleware(
  c: Context<{ Bindings: Env; Variables: ProxyVariables }>,
  next: Next,
): Promise<void> {
  const raw = extractRawKey(c.req.raw, new URL(c.req.url));
  let row = raw ? await lookupApiKey(c.env.DB, raw) : null;
  let authVia: "key" | "origin" | null = row ? "key" : null;
  if (!row) {
    const origin = normalizeOrigin(c.req.header("origin"));
    if (origin) {
      // keyless_origins may not exist yet on an unmigrated database — treat
      // a lookup failure as "no grant" and keep serving. Local updates go
      // through the console, which does not depend on this query.
      row = await lookupKeyByOrigin(c.env.DB, origin);
      if (row) authVia = "origin";
    }
  }
  c.set("apiKey", row);
  c.set("authVia", authVia);
  await next();
}

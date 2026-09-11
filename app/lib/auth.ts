import type { Context, Next } from "hono";
import type { ApiKeyRow, Env } from "./types.js";
import { sha256Hex } from "./utils.js";

/** Hono context variables set by apiKeyMiddleware (see index.ts). */
export type ProxyVariables = {
  apiKey: ApiKeyRow | null;
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
        "SELECT id, key_hash, name, rate_limit_per_min, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, created_at, revoked_at FROM api_keys WHERE key_hash = ?",
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
 * Resolve the caller's API key once per request (runs before CORS, so
 * per-key allowed origins apply). Fail-open: unknown keys act as anonymous.
 */
export async function apiKeyMiddleware(
  c: Context<{ Bindings: Env; Variables: ProxyVariables }>,
  next: Next,
): Promise<void> {
  const raw = extractRawKey(c.req.raw, new URL(c.req.url));
  c.set("apiKey", raw ? await lookupApiKey(c.env.DB, raw) : null);
  await next();
}

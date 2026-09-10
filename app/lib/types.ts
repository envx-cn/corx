export interface Env {
  DB: D1Database;
  CACHE_BUCKET: R2Bucket;
  /** Suffix for subdomain mode ("corx.com"). Empty = auto-detect from Host. */
  PROXY_ZONE?: string;
  /** Comma-separated origins allowed to use the proxy, or "*" (default). */
  ALLOWED_ORIGINS?: string;
  /** "true" to require a valid API key on /fetch + /proxy + /<url>. */
  REQUIRE_API_KEY?: string;
  /** Default R2 cache TTL for GET responses, in seconds. */
  CACHE_TTL_SECONDS?: string;
  /** Upstream fetch timeout in ms. */
  TIMEOUT_MS?: string;
  /** Default rate limit per key/IP per minute. */
  RATE_LIMIT_PER_MIN?: string;
  /** Max proxied request body in bytes. */
  MAX_BODY_BYTES?: string;
  /** Admin bearer token (set via `wrangler secret put ADMIN_TOKEN`). */
  ADMIN_TOKEN?: string;
  /** Session-cookie signing secret (set via `wrangler secret put SESSION_SECRET`). Falls back to ADMIN_TOKEN. */
  SESSION_SECRET?: string;
  /** Cloudflare Access team domain, e.g. https://myteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application AUD tag. */
  ACCESS_AUD?: string;
  /** Optional comma-separated email allowlist for console/API access. */
  ADMIN_EMAILS?: string;
}

export interface ApiKeyRow {
  id: string;
  key_hash: string;
  name: string;
  rate_limit_per_min: number | null;
  /** Comma-separated origins or "*". NULL/empty = inherit global ALLOWED_ORIGINS. */
  allowed_origins: string | null;
  /** Default cache TTL in seconds. NULL = inherit global CACHE_TTL_SECONDS (0 = never store). */
  cache_ttl: number | null;
  /** 1 = skip the R2 cache entirely for this key. */
  no_cache: number;
  created_at: string;
  revoked_at: string | null;
}

export interface CachedEntry {
  status: number;
  headers: Record<string, string>;
  body: ArrayBuffer;
  storedAt: number;
  expiresAt: number;
}

export class ProxyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

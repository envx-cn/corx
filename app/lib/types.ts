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
  /**
   * KEK for injected variable values at rest (set via `wrangler secret put INJECTION_KEK`).
   * Any sufficiently long random string. Empty = values stored as plaintext.
   */
  INJECTION_KEK?: string;
  /** Cloudflare Access team domain, e.g. https://myteam.cloudflareaccess.com */
  ACCESS_TEAM_DOMAIN?: string;
  /** Access application AUD tag. */
  ACCESS_AUD?: string;
  /** Optional comma-separated email allowlist for console/API access. */
  ADMIN_EMAILS?: string;
  /**
   * Raw value of the public-tier key, shown on the landing page (it is public
   * by design — D1 only stores its hash). Empty = no public key on the site.
   */
  PUBLIC_KEY?: string;
  /** Default R2 TTL for public-tier GETs, in seconds. Public keys ignore ?ttl=. */
  PUBLIC_CACHE_TTL_SECONDS?: string;
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
  /** 1 (default) = run the literal IP / internal-hostname guard for this key. */
  ip_check: number;
  /** 1 (default) = run the DoH resolve-and-classify check for this key. */
  dns_check: number;
  /** JSON array of variables ({name,value}); see app/proxy/inject.ts. */
  vars: string | null;
  /** JSON array of upstream header rules. */
  header_rules: string | null;
  /** JSON array of upstream query-param rules. */
  param_rules: string | null;
  /** Comma-separated host patterns this key may reach. NULL/'' = unrestricted. */
  allowed_hosts: string | null;
  /** 1 = allowed origins can use this key without presenting it (keyless access). */
  keyless: number;
  /** 'standard' (default) or 'public' — the shared, limited tier of the hosted instance. */
  tier: string;
  /** Public tier: daily request cap per caller Origin. NULL = unlimited. */
  daily_limit_per_origin: number | null;
  /** Public tier: daily request cap per target host. NULL = unlimited. */
  daily_limit_per_host: number | null;
  /** Public tier: daily request cap for the whole key. Required for public keys. */
  daily_limit_total: number | null;
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
  /** Extra JSON fields merged into the error body (quota scope, reset time, …). */
  data?: Record<string, unknown>;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

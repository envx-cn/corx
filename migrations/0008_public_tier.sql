-- Public tier: the shared key users embed on their own sites, plus its daily
-- quotas. Everything else about the key (SSRF checks, no injection, GET/HEAD
-- only, no credential forwarding) is enforced in code — see app/proxy/handler.ts
-- and app/proxy/quota.ts.
--
-- 'standard' (default) keeps every existing key's behavior.
ALTER TABLE api_keys ADD COLUMN tier TEXT NOT NULL DEFAULT 'standard';
-- Daily caps for public keys, counted in UTC days. NULL = that dimension is
-- unlimited; daily_limit_total is required at save time for public keys.
-- Sized against Cloudflare's free tier: D1 allows 100k rows written/day and a
-- proxied request costs a handful of writes, so a public key's total cap has to
-- stay well under that — once D1 starts rejecting writes every check here
-- fails open, and the proxy would keep serving unmetered.
ALTER TABLE api_keys ADD COLUMN daily_limit_per_origin INTEGER;
ALTER TABLE api_keys ADD COLUMN daily_limit_per_host INTEGER;
ALTER TABLE api_keys ADD COLUMN daily_limit_total INTEGER;

-- One row per (bucket, UTC day). Bucket shapes:
--   q:o:<origin|ip:…>:<YYYY-MM-DD>   caller Origin (falls back to IP when absent)
--   q:h:<target host>:<YYYY-MM-DD>   proxied host
--   q:k:<key id>:<YYYY-MM-DD>        the key as a whole
-- Kept out of rate_windows: the cron prunes that table by minute, which would
-- delete day buckets. quota_counters is pruned by period instead.
CREATE TABLE IF NOT EXISTS quota_counters (
  bucket_key TEXT NOT NULL,
  period     TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, period)
);
CREATE INDEX IF NOT EXISTS idx_quota_counters_period ON quota_counters (period);

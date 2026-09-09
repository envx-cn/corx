-- Per-key cache policy: cache_ttl NULL = inherit global CACHE_TTL_SECONDS
-- (0 = never store); no_cache = 1 skips the R2 cache entirely for the key.
ALTER TABLE api_keys ADD COLUMN cache_ttl INTEGER;
ALTER TABLE api_keys ADD COLUMN no_cache INTEGER NOT NULL DEFAULT 0;

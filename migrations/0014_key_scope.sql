-- Per-key scope: what a key may reach, beyond its host allowlist.
--
-- Until now a key's reach was `allowed_hosts` and nothing else: one key allowed
-- for api.vendor.com could hit every path on that host, over any method, over
-- http, from anywhere. On a hosted instance that is the whole isolation story,
-- and even self-hosted it is coarser than an operator usually wants.
--
-- Every field is opt-in and fail-closed when set:
--   allowed_methods  CSV of HTTP methods; NULL/'' = no restriction. HEAD is
--                    implied by GET (a HEAD is the same request without a body).
--   allowed_paths    CSV of path prefixes on the target; NULL/'' = no restriction.
--                    Matched against the effective URL *after* query rules, so an
--                    injected param cannot route around the allowlist.
--   require_https    1 = refuse http:// targets (an http upstream leaks the
--                    caller's path and any injected credentials in cleartext).
--   allowed_cidrs    CSV of caller IPs / CIDR ranges; NULL/'' = no restriction.
--   expires_at       ISO timestamp; the key is refused after it (NULL = never).
ALTER TABLE api_keys ADD COLUMN allowed_methods TEXT;
ALTER TABLE api_keys ADD COLUMN allowed_paths TEXT;
ALTER TABLE api_keys ADD COLUMN require_https INTEGER NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN allowed_cidrs TEXT;
ALTER TABLE api_keys ADD COLUMN expires_at TEXT;

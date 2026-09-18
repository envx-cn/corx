-- Keyless grants were stored exactly as typed, but matching compares against a
-- serialized origin (`URL.origin`: lowercase host, default port dropped). So
-- `https://App.Example.com` or `https://app.example.com:443` could never match
-- a browser's `Origin` and was a silently dead grant. Normalize existing rows.
--
-- `keyless_origins` is derived from `api_keys.allowed_origins`, which is
-- normalized on save from now on; this migration is a one-time repair. Both
-- statements are conflict-tolerant: an origin can be granted to exactly one key,
-- so when a normalized value already exists for another key the existing row
-- wins (OR IGNORE / INSERT OR IGNORE). A loopback `scheme://host:*` pattern is
-- left untouched (it ends with `:*`, not a port).

-- 1. Host case.
UPDATE OR IGNORE keyless_origins SET origin = lower(origin);

-- 2. Explicit default ports: https://host:443 -> https://host
INSERT OR IGNORE INTO keyless_origins (origin, key_id, created_at)
  SELECT substr(origin, 1, length(origin) - 4), key_id, created_at
    FROM keyless_origins
   WHERE origin LIKE 'https://%:443';
DELETE FROM keyless_origins WHERE origin LIKE 'https://%:443';

-- 3. http://host:80 -> http://host
INSERT OR IGNORE INTO keyless_origins (origin, key_id, created_at)
  SELECT substr(origin, 1, length(origin) - 3), key_id, created_at
    FROM keyless_origins
   WHERE origin LIKE 'http://%:80';
DELETE FROM keyless_origins WHERE origin LIKE 'http://%:80';

-- 4. Host wildcards. `normalizeOriginsInput` used to accept
--    `https://*.example.com` (it only ran `new URL()`), which no serialized
--    origin can ever equal — a dead grant, not a policy. The only supported
--    wildcard is a loopback port pattern, which ends with `:*`.
DELETE FROM keyless_origins WHERE origin LIKE '%*%' AND origin NOT LIKE '%:*';

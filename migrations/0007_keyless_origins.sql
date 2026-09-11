-- Keyless access: requests whose Origin matches a grant may use the key
-- without presenting it. This is quota attribution, not authentication —
-- browsers can't forge Origin, but non-browser clients can (see README).
ALTER TABLE api_keys ADD COLUMN keyless INTEGER NOT NULL DEFAULT 0;

-- Derived from api_keys.allowed_origins + keyless on save; origin has a PK so
-- an origin can be granted to exactly one key. Indexed for the per-request
-- lookup in apiKeyMiddleware.
CREATE TABLE IF NOT EXISTS keyless_origins (
  origin     TEXT PRIMARY KEY,
  key_id     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_keyless_origins_key ON keyless_origins (key_id);

-- Audit: how the caller was authorized ("key" | "origin" | ''), the request
-- Origin, and whether injection rules were applied to the upstream request.
ALTER TABLE request_logs ADD COLUMN auth_via TEXT NOT NULL DEFAULT '';
ALTER TABLE request_logs ADD COLUMN origin TEXT NOT NULL DEFAULT '';
ALTER TABLE request_logs ADD COLUMN injected INTEGER NOT NULL DEFAULT 0;

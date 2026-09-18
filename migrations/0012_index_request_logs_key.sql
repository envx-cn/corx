-- "Last used" per key (the keys table) and the logs page's `?key=` filter both
-- scan request_logs by api_key_id; the raw table only indexed created_at and
-- target_host. The composite carries created_at so MAX(created_at) per key is
-- an index lookup, not a table scan.
CREATE INDEX IF NOT EXISTS idx_request_logs_key_created ON request_logs (api_key_id, created_at);

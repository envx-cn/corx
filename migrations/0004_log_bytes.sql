-- Traffic accounting for extended stats.
-- res_bytes NULL = unknown (chunked stream passthrough).
ALTER TABLE request_logs ADD COLUMN req_bytes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE request_logs ADD COLUMN res_bytes INTEGER;

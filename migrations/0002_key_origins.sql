-- Per-key CORS origins (NULL/empty = inherit global ALLOWED_ORIGINS).
ALTER TABLE api_keys ADD COLUMN allowed_origins TEXT;

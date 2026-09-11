-- Per-key SSRF guard toggles. 1 (the default) = run the check; 0 = skip it for
-- requests made with this key. Intended for trusted internal keys that must
-- reach hosts the guards would reject (or that want to drop the extra DoH
-- round-trip) — it widens the SSRF surface, so both default to on.
ALTER TABLE api_keys ADD COLUMN ip_check INTEGER NOT NULL DEFAULT 1;
ALTER TABLE api_keys ADD COLUMN dns_check INTEGER NOT NULL DEFAULT 1;

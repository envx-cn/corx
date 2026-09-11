-- Per-key upstream injection: variables (secrets) + header/query rules.
-- All three are JSON arrays, validated and normalized at save time
-- (app/proxy/inject.ts) so the request path only evaluates them.
--   vars         [{"name":"UPSTREAM_TOKEN","value":"sk-live-…"}]
--   header_rules [{"action":"set","name":"Authorization","value":"Bearer ${UPSTREAM_TOKEN}"},
--                 {"action":"remove","name":"X-Debug","hosts":["api.vendor.com"]}]
--   param_rules  [{"action":"set","name":"api_key","value":"${UPSTREAM_TOKEN}"}]
ALTER TABLE api_keys ADD COLUMN vars TEXT NOT NULL DEFAULT '[]';
ALTER TABLE api_keys ADD COLUMN header_rules TEXT NOT NULL DEFAULT '[]';
ALTER TABLE api_keys ADD COLUMN param_rules TEXT NOT NULL DEFAULT '[]';

-- Host patterns the key may reach ("api.vendor.com, *.vendor.com"). NULL/'' =
-- unrestricted, which is only allowed while no variables/rules are configured:
-- an injecting key without a host allowlist would forward its secrets to any
-- URL the caller supplies.
ALTER TABLE api_keys ADD COLUMN allowed_hosts TEXT;

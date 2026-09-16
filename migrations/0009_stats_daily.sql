-- Long-lived daily rollup of request_logs.
--
-- Raw request_logs are pruned after 30 days (the nightly cron in
-- app/server.ts), which caps every analytics window at a rolling week or so.
-- That makes "is this period higher than the last one?" unanswerable: two
-- comparable periods are never on screen at the same time. This table is the
-- memory beyond the raw-log horizon — the cron aggregates each day before the
-- prune, and `/api/stats?days=` reads week-over-week (and longer) from here.
--
-- `origins` / `keys` are per-day DISTINCT counts, not distinct-over-window:
-- SQLite can't union per-day sets in a cheap rollup, so a reader that sums a
-- week gets origin-days, not unique people. That is a deliberate trade — the
-- number is comparable period over period, which is what the trend needs, and
-- the console labels it as "per day, summed" rather than implying unique
-- visitors. The alternative (keeping raw rows forever) is what this table
-- exists to avoid.
CREATE TABLE IF NOT EXISTS stats_daily (
  day        TEXT PRIMARY KEY, -- UTC calendar day, "YYYY-MM-DD"
  requests   INTEGER NOT NULL DEFAULT 0,
  origins    INTEGER NOT NULL DEFAULT 0, -- distinct non-empty request_logs.origin
  keys       INTEGER NOT NULL DEFAULT 0, -- distinct non-null api_key_id
  errors     INTEGER NOT NULL DEFAULT 0, -- status >= 500 or a logged error
  req_bytes  INTEGER NOT NULL DEFAULT 0,
  res_bytes  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

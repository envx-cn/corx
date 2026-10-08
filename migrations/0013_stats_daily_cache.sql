-- Cache dimensions in the daily rollup.
--
-- `request_logs` has carried `cached` and `res_bytes` per row since #0004, and
-- the 24h stats read both — but `stats_daily` (0009) dropped them, so the
-- moment raw rows were pruned the long-window view could no longer say whether
-- the R2 cache was earning its keep. That is the first question an operator
-- asks while paying for R2 Class B ops, and the trend is where the answer lives.
--
-- Both are additive with a zero default: a day rolled up before this migration
-- reads 0 hits / 0 cached bytes, which is honest ("not measured") rather than
-- silently wrong, and the next cron run replaces the row anyway
-- (INSERT OR REPLACE over the raw days that still exist).
ALTER TABLE stats_daily ADD COLUMN cache_hits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stats_daily ADD COLUMN cached_bytes INTEGER NOT NULL DEFAULT 0;

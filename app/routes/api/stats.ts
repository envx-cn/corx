import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { clampStatsDays, queryStats, queryStatsComparison } from "../../lib/admin.js";
import { logRetentionDays } from "../../lib/db.js";

const app = new Hono<{ Bindings: Env }>();

/**
 * Two modes on one endpoint:
 *   - no `?days`  → the original 24 h detail (totals, breakdowns, hourly, …).
 *   - `?days=N`   → current vs previous N complete UTC days, read from the
 *                   daily rollup for anything older than the raw-log horizon.
 * Keeping the bare call unchanged means existing consumers (scripts, the
 * README curl) keep working while `?days=28` answers the growth question.
 */
app.get("/", async (c) => {
  const raw = c.req.query("days");
  if (raw === undefined) return c.json({ window: "24h", ...(await queryStats(c.env.DB)) });
  const days = clampStatsDays(Number(raw));
  return c.json({
    window: `${days}d`,
    ...(await queryStatsComparison(c.env.DB, days, Date.now(), logRetentionDays(c.env))),
  });
});

export default app;

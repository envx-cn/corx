import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryLogs } from "../../lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  const hours = Number(c.req.query("hours") ?? NaN);
  return c.json({
    logs: await queryLogs(c.env.DB, {
      limit: Number.isFinite(limit) ? limit : 50,
      ...(Number.isFinite(hours) ? { hours } : {}),
    }),
  });
});

export default app;

import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryLogs } from "../../lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 50);
  return c.json({ logs: await queryLogs(c.env.DB, limit) });
});

export default app;

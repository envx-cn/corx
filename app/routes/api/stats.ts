import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryStats } from "../../lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => c.json({ window: "24h", ...(await queryStats(c.env.DB)) }));

export default app;

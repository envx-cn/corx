import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts } from "../../lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => c.json({ hosts: await queryBlockedHosts(c.env.DB) }));

export default app;

import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";

const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const body = await c.req
    .json<{ hostname?: string; reason?: string }>()
    .catch(() => ({}) as { hostname?: string; reason?: string });
  if (!body.hostname) return c.json({ error: "hostname required" }, 400);
  try {
    await c.env.DB.prepare("INSERT OR IGNORE INTO blocked_hosts (hostname, reason) VALUES (?, ?)")
      .bind(body.hostname.toLowerCase(), body.reason ?? "")
      .run();
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

export default app;

import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { normalizeBlockedHostname } from "../../proxy/guard.js";

const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const body = await c.req
    .json<{ hostname?: string; reason?: string }>()
    .catch(() => ({}) as { hostname?: string; reason?: string });
  const hostname = normalizeBlockedHostname(body.hostname ?? "");
  if (!hostname) return c.json({ error: "hostname required (a plain hostname, no wildcard)" }, 400);
  try {
    await c.env.DB.prepare("INSERT OR IGNORE INTO blocked_hosts (hostname, reason) VALUES (?, ?)")
      .bind(hostname, (body.reason ?? "").slice(0, 500))
      .run();
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

export default app;

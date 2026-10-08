import { Hono } from "hono";
import type { Env } from "@/lib/types.js";
import { invalidateBlocklistMemo } from "@/proxy/guard.js";

const app = new Hono<{ Bindings: Env }>();

app.delete("/", async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM blocked_hosts WHERE hostname = ?")
    .bind((c.req.param("hostname") ?? "").toLowerCase())
    .run();
  if ((res.meta?.changes ?? 0) === 0) return c.json({ error: "Host not found" }, 404);
  // Same reason as blocking: an unblock has to be visible immediately, not
  // after the memo's TTL.
  invalidateBlocklistMemo();
  return c.json({ ok: true });
});

export default app;

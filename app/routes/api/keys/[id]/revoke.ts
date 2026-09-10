import { Hono } from "hono";
import type { Env } from "@/lib/types.js";

const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const res = await c.env.DB.prepare(
    "UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  )
    .bind(c.req.param("id") ?? "")
    .run();
  if ((res.meta?.changes ?? 0) === 0) return c.json({ error: "Key not found" }, 404);
  return c.json({ ok: true });
});

export default app;

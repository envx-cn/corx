import { Hono } from "hono";
import type { Env } from "@/lib/types.js";
import { ProxyError } from "@/lib/types.js";
import { updateApiKey } from "@/lib/admin.js";
import type { KeyUpdate } from "@/lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

app.patch("/", async (c) => {
  const body = await c.req.json<KeyUpdate>().catch(() => ({}) as KeyUpdate);
  try {
    await updateApiKey(c.env.DB, c.req.param("id") ?? "", body);
    return c.json({ ok: true });
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

export default app;

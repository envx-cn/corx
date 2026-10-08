import { Hono } from "hono";
import type { Env } from "@/lib/types.js";
import { purgeCache } from "@/proxy/cache.js";

const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const id = c.req.param("id") ?? "";
  const res = await c.env.DB.prepare(
    "UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  )
    .bind(id)
    .run();
  if ((res.meta?.changes ?? 0) === 0) return c.json({ error: "Key not found" }, 404);
  // A revoke is a kill switch: the cached bodies this key populated go with it,
  // rather than lingering for another key to be served (or for the operator to
  // pay for) until their TTL. Non-fatal — the revoke itself already succeeded.
  const purged = await purgeCache(c.env.CACHE_BUCKET, { keyId: id }).then(
    (r) => r.deleted,
    () => 0,
  );
  return c.json({ ok: true, purged });
});

export default app;

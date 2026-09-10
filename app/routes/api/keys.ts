import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys } from "../../lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => c.json({ keys: await queryKeys(c.env.DB) }));

app.post("/", async (c) => {
  const body = await c.req
    .json<{
      name?: string;
      rateLimitPerMin?: number;
      allowedOrigins?: string;
      cacheTtl?: string;
      noCache?: boolean;
    }>()
    .catch(
      () =>
        ({}) as {
          name?: string;
          rateLimitPerMin?: number;
          allowedOrigins?: string;
          cacheTtl?: string;
          noCache?: boolean;
        },
    );
  try {
    const { id, key } = await createApiKey(
      c.env.DB,
      body.name ?? "",
      body.rateLimitPerMin ?? null,
      body.allowedOrigins,
      body.cacheTtl,
      body.noCache,
    );
    // Raw key is shown once — store it somewhere safe.
    return c.json({ id, key, name: body.name ?? "" }, 201);
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

export default app;

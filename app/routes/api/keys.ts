import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys, redactKeyRow } from "../../lib/admin.js";
import type { KeyInput } from "../../lib/admin.js";

const app = new Hono<{ Bindings: Env }>();

// Variable values are write-only: reads return names only (see redactKeyRow).
app.get("/", async (c) => c.json({ keys: (await queryKeys(c.env.DB)).map(redactKeyRow) }));

app.post("/", async (c) => {
  const body = await c.req.json<Partial<KeyInput>>().catch(() => ({}) as Partial<KeyInput>);
  try {
    const { id, key } = await createApiKey(c.env.DB, { ...body, name: body.name ?? "" }, c.env.INJECTION_KEK);
    // Raw key is shown once — store it somewhere safe.
    return c.json({ id, key, name: body.name ?? "" }, 201);
  } catch (err) {
    if (err instanceof ProxyError) return c.json({ error: err.message }, err.status as 400);
    throw err;
  }
});

export default app;

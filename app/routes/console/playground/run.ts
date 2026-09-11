import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "../../../lib/types.js";
import { ProxyError } from "../../../lib/types.js";
import type { ProxyVariables } from "../../../lib/auth.js";
import { parsePlaygroundSpec } from "../../../lib/playground.js";
import { runPlayground } from "../_playground.js";

/**
 * Console playground runner. JSON in, JSON out — the page island posts a spec
 * here and gets the captured proxy response back. Console middleware already
 * authenticated the caller.
 */
const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

app.post("/", async (c) => {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parsePlaygroundSpec(raw);
  if ("error" in parsed) return c.json({ error: parsed.error }, 400);

  try {
    return c.json(await runPlayground(c, parsed.spec));
  } catch (err) {
    const status = (err instanceof ProxyError ? err.status : 500) as ContentfulStatusCode;
    const message = err instanceof Error ? err.message : "Playground run failed";
    return c.json({ error: message }, status);
  }
});

export default app;

import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { docsHandler } from "./_docs.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /docs — the x-default URL of the usage-page cluster (language comes from the
// corx_lang cookie or Accept-Language). The prefixed variants are the route
// files under en/ and zh/.
app.get("/", docsHandler());

export default app;

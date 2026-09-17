import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { snippetsHandler } from "./_snippets.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /snippets — the x-default URL of the snippets cluster (language comes from
// the corx_lang cookie or Accept-Language). The prefixed variants are the route
// files under en/ and zh/.
app.get("/", snippetsHandler());

export default app;

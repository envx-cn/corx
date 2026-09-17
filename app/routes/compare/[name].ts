import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import type { ProxyVariables } from "../../lib/auth.js";
import { compareHandler } from "../_compare.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /compare/<name> — the x-default URL of the comparison cluster (language comes
// from the corx_lang cookie or Accept-Language). The prefixed variants are the
// route files under en/ and zh/.
app.get("/", compareHandler());

export default app;

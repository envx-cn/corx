import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import type { ProxyVariables } from "../../lib/auth.js";
import { corsTesterHandler } from "../_cors-tester.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /tools/cors-tester — the x-default URL of the cluster (language comes from the
// corx_lang cookie or Accept-Language). The prefixed variants are the route
// files under en/ and zh/.
app.get("/", corsTesterHandler());

export default app;

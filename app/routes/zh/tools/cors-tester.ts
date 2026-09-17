import { Hono } from "hono";
import type { Env } from "../../../lib/types.js";
import type { ProxyVariables } from "../../../lib/auth.js";
import { corsTesterHandler } from "../../_cors-tester.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /zh/tools/cors-tester — the Chinese URL of the hreflang cluster. An explicit
// language URL is a choice, so the handler also remembers it in a cookie.
app.get("/", corsTesterHandler("zh"));

export default app;

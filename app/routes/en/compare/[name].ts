import { Hono } from "hono";
import type { Env } from "../../../lib/types.js";
import type { ProxyVariables } from "../../../lib/auth.js";
import { compareHandler } from "../../_compare.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /en/compare/<name> — the English URL of the hreflang cluster. An explicit
// language URL is a choice, so the handler also remembers it in a cookie.
app.get("/", compareHandler("en"));

export default app;

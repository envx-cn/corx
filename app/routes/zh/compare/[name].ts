import { Hono } from "hono";
import type { Env } from "../../../lib/types.js";
import type { ProxyVariables } from "../../../lib/auth.js";
import { compareHandler } from "../../_compare.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /zh/compare/<name> — the Chinese URL of the hreflang cluster.
app.get("/", compareHandler("zh"));

export default app;

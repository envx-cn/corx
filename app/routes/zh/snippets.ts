import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import type { ProxyVariables } from "../../lib/auth.js";
import { snippetsHandler } from "../_snippets.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// /zh/snippets — the Chinese URL of the hreflang cluster. An explicit language
// URL is a choice, so the handler also remembers it in a cookie.
app.get("/", snippetsHandler("zh"));

export default app;

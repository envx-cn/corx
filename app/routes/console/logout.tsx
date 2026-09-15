import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import type { Env } from "../../lib/types.js";
import { accessLogoutUrl } from "../../lib/access.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.post("/", async (c) => {
  deleteCookie(c, "corx_session", { path: "/" });
  // Clearing our cookie isn't enough behind Access: the Access session is
  // Cloudflare's, so the next request would be re-authenticated by the
  // still-valid JWT and the user would land right back in the console. Hand
  // off to the edge logout endpoint when Access is configured.
  return c.redirect(accessLogoutUrl(c.env) ?? "/console/login", 302);
});

export default app;

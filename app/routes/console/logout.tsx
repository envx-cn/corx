import { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import type { Env } from "../../lib/types.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.post("/", async (c) => {
  deleteCookie(c, "corx_session", { path: "/" });
  return c.redirect("/console/login", 302);
});

export default app;

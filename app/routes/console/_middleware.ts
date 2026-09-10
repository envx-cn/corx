import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";
import { getAdminUser } from "../../lib/access.js";
import type { Env } from "../../lib/types.js";

const PUBLIC_PATHS = ["/console/login", "/console/logout"];

/** Public login/logout (also their trailing-slash / sub-path variants). */
function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Console auth guard: verified identity becomes c.get("consoleUser");
 * everyone else bounces to the login page.
 */
const guard: MiddlewareHandler = async (c, next) => {
  if (isPublicPath(c.req.path)) return next();
  const user = await getAdminUser(c as Context<{ Bindings: Env }>);
  if (!user) return c.redirect("/console/login", 302);
  c.set("consoleUser", user);
  await next();
};

export default [guard];

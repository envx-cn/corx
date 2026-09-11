import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";
import { setCookie } from "hono/cookie";
import { getAdminUser } from "../../lib/access.js";
import type { Env } from "../../lib/types.js";

const PUBLIC_PATHS = ["/console/login", "/console/logout"];

/**
 * Language switch: a ?lang=zh|en query on any console URL sets the corx_lang
 * cookie and bounces back to the same path without the query. Runs before the
 * auth guard so the login page can switch languages too.
 */
const langSwitch: MiddlewareHandler = async (c, next) => {
  const q = c.req.query("lang");
  if (q === "zh" || q === "en") {
    setCookie(c, "corx_lang", q, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "Lax" });
    const u = new URL(c.req.url);
    u.searchParams.delete("lang");
    return c.redirect(`${u.pathname}${u.search}`, 302);
  }
  await next();
};

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

export default [langSwitch, guard];

import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";
import { getAdminUser } from "../../lib/access.js";
import type { Env } from "../../lib/types.js";

/** Uniform auth guard for every /api/* route (Access JWT, session, or token). */
const guard: MiddlewareHandler = async (c, next) => {
  const user = await getAdminUser(c as Context<{ Bindings: Env }>);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  await next();
};

export default [guard];

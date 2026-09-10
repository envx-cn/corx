import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { LandingPage } from "./_landing.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// GET / serves the landing page — unless subdomain mode (or ?url=) targets a site.
app.get("/", (c) => {
  const reqUrl = new URL(c.req.url);
  try {
    if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
  } catch {
    return proxyHandler(c); // malformed target -> let proxyHandler return the 400
  }
  // Plain call (not JSX) so this handler file stays .ts.
  return c.html(LandingPage({ host: reqUrl.host }));
});

export default app;

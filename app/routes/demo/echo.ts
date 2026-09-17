import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import type { ProxyVariables } from "../../lib/auth.js";
import { proxyHandler } from "../../proxy/handler.js";
import { resolveRawTarget } from "../../proxy/subdomain.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

/**
 * GET|POST|… /demo/echo — the injection demo's upstream (`app/lib/demo.ts`).
 *
 * Returns exactly what arrived: method, path, query and headers. That is the
 * whole point — when the landing demo calls it through CORX with the seeded
 * demo key, the response is the proof that the proxy attached a credential the
 * browser never held.
 *
 * Safety: the body is machine-generated JSON from request metadata, sent with
 * `nosniff` and `no-store`, so echoing caller headers cannot become content
 * (nothing here is HTML, and nothing is cached). It is a machine surface, not
 * a page: `robots.txt` disallows `/demo`, and it carries `X-Robots-Tag`.
 */
app.all("/", (c) => {
  const reqUrl = new URL(c.req.url);
  // Subdomain mode turns every path into a proxy path, /demo included — same
  // give-way as the landing page and the crawler files.
  try {
    if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
  } catch {
    return proxyHandler(c); // malformed target -> the proxy's precise 4xx
  }

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, name) => {
    headers[name] = value;
  });
  const query: Record<string, string> = {};
  reqUrl.searchParams.forEach((value, name) => {
    query[name] = value;
  });

  return new Response(
    JSON.stringify({
      ok: true,
      method: c.req.method,
      path: reqUrl.pathname,
      // Named after the demo's own key: seeing it here (and not in the browser)
      // is the point of the endpoint.
      query,
      headers,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "x-robots-tag": "noindex",
        "access-control-allow-origin": "*",
      },
    },
  );
});

export default app;

import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "./types.js";
import { apiKeyMiddleware, type ProxyVariables } from "./auth.js";
import { cors } from "./cors.js";
import { proxyHandler } from "./proxy.js";
import { admin } from "./admin.js";
import { consoleApp } from "./console/routes.js";
import { landingPage } from "./landing.js";
import { resolveRawTarget } from "./subdomain.js";

// strict:false — /console and /console/ (etc.) route the same; the /* proxy
// catch-all must not swallow trailing-slash variants of real routes.
const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// Resolve the API key before CORS so per-key allowed origins apply.
app.use(apiKeyMiddleware);

app.use(cors());

type AppContext = Context<{ Bindings: Env; Variables: ProxyVariables }>;

/** `/` serves the landing page — unless subdomain mode (or ?url=) targets a site. */
function rootHandler(c: AppContext) {
  const reqUrl = new URL(c.req.url);
  try {
    if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
  } catch {
    return proxyHandler(c); // malformed target -> let proxyHandler return the 400
  }
  return c.html(landingPage(reqUrl.host));
}

app.get("/", rootHandler);
app.get("/health", (c) => c.json({ ok: true, service: "corx", time: new Date().toISOString() }));

app.route("/admin", admin);

// SSR admin console (Cloudflare Access login + dev token fallback).
// strict:false (above) already covers both /console and /console/.
app.route("/console", consoleApp);

// Query-style: /fetch?url=https://… and /?url=https://…
app.all("/fetch", proxyHandler);
app.all("/proxy/*", proxyHandler);

// Path-style (/https://…) + subdomain mode (must be last — catches everything).
// Subdomain hosts with a path (example.corx.com/a?b=c) land here directly.
app.all("/*", proxyHandler);

app.onError((err, c) => {
  console.error("corx error:", err);
  return c.json({ error: "Internal error" }, 500);
});

export default {
  fetch: app.fetch,
  /** Cron: prune logs + rate windows + expired R2 entries. */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        await env.DB.prepare("DELETE FROM request_logs WHERE created_at < datetime('now', '-30 days')")
          .run()
          .catch(() => undefined);
        await env.DB.prepare("DELETE FROM rate_windows WHERE window_min < ?")
          .bind(Math.floor(Date.now() / 60_000) - 120)
          .run()
          .catch(() => undefined);
        // R2 TTL is lazy (checked on read); list-prune a small batch each run.
        try {
          const listed = await env.CACHE_BUCKET.list({ prefix: "corx/v1/", limit: 100 });
          const expired: string[] = [];
          for (const obj of listed.objects) {
            const exp = Number(obj.customMetadata?.["expiresAt"] ?? 0);
            if (exp && Date.now() > exp) expired.push(obj.key);
          }
          await Promise.all(expired.map((k) => env.CACHE_BUCKET.delete(k).catch(() => undefined)));
        } catch {
          /* non-fatal */
        }
      })(),
    );
  },
};

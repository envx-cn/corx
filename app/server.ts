import { Hono } from "hono";
import type { Context, Handler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createApp } from "honox/server";
import type { Env } from "./lib/types.js";
import { ProxyError } from "./lib/types.js";
import type { ProxyVariables } from "./lib/auth.js";
import { apiKeyMiddleware } from "./lib/auth.js";
import { rollupDailyStats } from "./lib/admin.js";
import { logRetentionDays } from "./lib/db.js";
import { cors, withProxyCors } from "./proxy/cors.js";
import { proxyHandler } from "./proxy/handler.js";
import { utcDay } from "./proxy/quota.js";
import { resolveRawTarget } from "./proxy/subdomain.js";
import { notFoundResponse } from "./routes/_not-found.js";
import { ErrorPage } from "./routes/_error-page.js";
import { ConsoleErrorDocument } from "./routes/console/_error-page.js";
import { detectLocale, makeT } from "./lib/i18n/locale.js";
import { consoleLocale, consoleT } from "./lib/i18n/hono.js";
import { llmsFullTxt, llmsTxt, robotsTxt, sitemapXml } from "./lib/seo.js";

// Base Hono app with the proxy routes mounted manually (file routing can't
// express the /* catch-all ordering).
// strict:false keeps /console and /console/ equivalent so the /* proxy
// catch-all never swallows trailing-slash variants of real routes.
const base = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

// Resolve the API key before CORS so per-key allowed origins apply.
base.use(apiKeyMiddleware);
base.use(cors());

base.get("/health", (c) => c.json({ ok: true, service: "corx", time: new Date().toISOString() }));

/**
 * Crawler-facing text files (robots.txt, sitemap.xml, llms.txt,
 * llms-full.txt). Generated per request instead of shipped as static files,
 * because every URL inside them is absolute and must point at the hostname the
 * caller actually reached — a self-hosted copy advertises itself, never the
 * upstream project's domain.
 *
 * In subdomain mode *every* path is a proxy path, so these have to give way to
 * the proxy exactly like the landing page does (app/routes/index.ts).
 */
function crawlFile(render: (origin: string) => string, contentType: string): Handler<{
  Bindings: Env;
  Variables: ProxyVariables;
}> {
  return async (c) => {
    const reqUrl = new URL(c.req.url);
    try {
      if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
    } catch {
      return proxyHandler(c); // malformed target -> the proxy's precise 4xx
    }
    return c.body(render(`${reqUrl.protocol}//${reqUrl.host}`), 200, {
      "content-type": contentType,
      // Host-specific content, so keep the cache short: a hostname or content
      // change must not be pinned for a day by an intermediary.
      "cache-control": "public, max-age=300",
    });
  };
}

base.get("/robots.txt", crawlFile(robotsTxt, "text/plain; charset=utf-8"));
base.get("/sitemap.xml", crawlFile(sitemapXml, "application/xml; charset=utf-8"));
base.get("/llms.txt", crawlFile(llmsTxt, "text/plain; charset=utf-8"));
base.get("/llms-full.txt", crawlFile(llmsFullTxt, "text/plain; charset=utf-8"));

base.all("/fetch", proxyHandler);
base.all("/proxy/*", proxyHandler);

// NOTE: /console/* (file route app/routes/console.tsx) and /api/* register
// at createApp() below — after these manual mounts, before the /* fallback.

/**
 * True for callers that expect a JSON error body: the admin API, the health
 * probe, and every proxy request (including malformed subdomains, which the
 * proxy handler answers with a precise 4xx — same convention as /*).
 */
function expectsJson(reqUrl: URL, env: Env): boolean {
  const p = reqUrl.pathname;
  if (p === "/health" || p === "/api" || p.startsWith("/api/")) return true;
  try {
    return resolveRawTarget(reqUrl, env).target !== null;
  } catch {
    return true;
  }
}

base.onError((err, c) => {
  console.error("corx error:", err);
  const reqUrl = new URL(c.req.url);
  const status = (
    err instanceof ProxyError ? err.status : err instanceof HTTPException ? err.status : 500
  ) as ContentfulStatusCode;
  const devMessage = import.meta.env.DEV ? ((err as Error)?.message ?? String(err)) : undefined;

  if (expectsJson(reqUrl, c.env)) {
    // Keep the 500 readable from browsers: the normal cors() middleware chain
    // was cut short when the error was thrown, so stamp the headers here.
    return withProxyCors(c, c.json({ error: "Internal error" }, status));
  }

  // Authenticated console requests keep the shell (sidebar/topbar/user menu), so
  // the admin can navigate away without losing context. Anything unexpected in
  // that path — or no identity at all — falls back to the standalone document,
  // which needs no session, D1 or island hydration to render.
  const isConsole = reqUrl.pathname === "/console" || reqUrl.pathname.startsWith("/console/");
  const consoleUser = isConsole ? c.get("consoleUser") : undefined;
  if (consoleUser) {
    try {
      // c.html() doesn't add a doctype; prepend one so browsers stay in standards mode.
      return c.html(
        `<!DOCTYPE html>${ConsoleErrorDocument({
          status,
          path: reqUrl.pathname,
          message: devMessage,
          user: consoleUser,
          csrfToken: c.get("csrfToken") ?? "",
          locale: consoleLocale(c),
          t: consoleT(c),
        })}`,
        status,
      );
    } catch (shellErr) {
      console.error("corx console error page failed:", shellErr);
    }
  }

  // Browser-facing fallback: a self-contained branded document.
  const locale = detectLocale({
    pathname: reqUrl.pathname,
    cookie: c.req.header("cookie"),
    acceptLanguage: c.req.header("accept-language"),
  });
  return c.html(
    `<!DOCTYPE html>${ErrorPage({
      status,
      locale,
      origin: reqUrl.origin,
      path: reqUrl.pathname,
      message: devMessage,
      t: makeT(locale),
    })}`,
    status,
  );
});

// Hand the configured app to HonoX. File routes in app/routes/api/* register
// here — AFTER the manual mounts above, so the /* proxy catch-all below
// (registered last of all) can never swallow /api/* or /console/*.
const app = createApp({
  app: base,
  root: "/app/routes",
  // Glob patterns mirror honox defaults (incl. `-` colocated and `$` exclusions).
  ROUTES: import.meta.glob(
    [
      "/app/routes/**/*.{ts,tsx,md,mdx}",
      "/app/routes/.well-known/**/*.{ts,tsx,md,mdx}",
      "!/app/routes/**/_*.{ts,tsx,md,mdx}",
      "!/app/routes/**/-*.{ts,tsx,md,mdx}",
      "!/app/routes/**/$*.{ts,tsx,md,mdx}",
      "!/app/routes/**/*.test.{ts,tsx}",
      "!/app/routes/**/*.spec.{ts,tsx}",
      "!/app/routes/**/-*/**/*",
    ],
    { eager: true },
  ),
  RENDERER: import.meta.glob("/app/routes/**/_renderer.tsx", { eager: true }),
  NOT_FOUND: import.meta.glob("/app/routes/**/_404.{ts,tsx}", { eager: true }),
  ERROR: import.meta.glob("/app/routes/**/_error.{ts,tsx}", { eager: true }),
  MIDDLEWARE: import.meta.glob("/app/routes/**/_middleware.{ts,tsx}", { eager: true }),
});

// Unknown /api/* endpoints: 404 JSON (the proxy catch-all below would otherwise
// answer with a confusing "Missing target URL"). Registered for both /api and
// /api/* so the bare /api path can't slip through to the HTML 404 page.
const unknownApi = (c: Context) => c.json({ error: `Unknown API endpoint: ${c.req.path}` }, 404);
app.all("/api", unknownApi);
app.all("/api/*", unknownApi);

// Unknown /console/* paths the file router missed: bounce straight to the
// console root. More specific than /* so real console pages (static routes)
// still win, and the console auth guard still runs first (unauthenticated
// users are sent to /console/login, not here).
app.all("/console/*", (c) => c.redirect("/console/", 302));

// Path-style (/https://…) + subdomain mode (must be last — catches everything).
// Anything that isn't a proxy request (random paths, …) gets the branded 404
// page, not a proxy "Missing target URL" 400. Malformed subdomains still count
// as proxy requests so the proxy handler returns the precise 4xx.
app.all("/*", (c) => {
  const reqUrl = new URL(c.req.url);
  let isProxy = true;
  try {
    isProxy = resolveRawTarget(reqUrl, c.env).target !== null;
  } catch {
    // malformed subdomain (bad corx-port, …) — let proxyHandler answer
  }
  if (!isProxy) return notFoundResponse(c);
  return proxyHandler(c);
});

// Dev-only route table (tree-shaken out of the production bundle).
if (import.meta.env.DEV) {
  const { showRoutes } = await import("hono/dev");
  showRoutes(app);
}

export default {
  fetch: app.fetch,
  /** Cron: prune logs + rate windows + expired R2 entries. */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      (async () => {
        // Aggregate first: the rollup is the only record that survives the
        // prune below, and a day must be written before its rows are gone. If
        // the rollup fails, skip the prune too — losing raw rows we failed to
        // archive is worse than a day of extra retention.
        // Retention is the deployment's `LOG_RETENTION_DAYS` (default 30); the
        // rollup window follows it, or a longer retention would leave days
        // unaggregated. `strftime`, not `datetime`: the rows are stored as
        // ISO-with-T, and `datetime()` would silently keep the whole boundary day.
        const retention = logRetentionDays(env);
        const rolled = await rollupDailyStats(env.DB, retention).then(
          () => true,
          () => false,
        );
        if (rolled) {
          await env.DB.prepare("DELETE FROM request_logs WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
            .bind(`-${retention} days`)
            .run()
            .catch(() => undefined);
        }
        await env.DB.prepare("DELETE FROM rate_windows WHERE window_min < ?")
          .bind(Math.floor(Date.now() / 60_000) - 120)
          .run()
          .catch(() => undefined);
        // Daily quota counters: keep yesterday + today, drop the rest.
        await env.DB.prepare("DELETE FROM quota_counters WHERE period < ?")
          .bind(utcDay(Date.now() - 86_400_000))
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

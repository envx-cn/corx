import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";
import { getAdminUser } from "../../lib/access.js";
import { consoleLocale, consoleT, setLangCookie } from "../../lib/i18n/hono.js";
import { CSRF_FIELD, CSRF_HEADER, issueCsrfToken, verifyCsrfToken } from "../../lib/csrf.js";
import { sessionSecret } from "../../lib/session.js";
import type { Env } from "../../lib/types.js";
import { ErrorPage } from "../_error-page.js";
import { ConsoleErrorDocument } from "./_error-page.js";

const PUBLIC_PATHS = ["/console/login", "/console/logout"];
/** Only the login form has no session to bind a token to. */
const LOGIN_PATHS = ["/console/login"];

/**
 * Language switch: a ?lang=zh|en query on any console URL sets the corx_lang
 * cookie and bounces back to the same path without the query. Runs before the
 * auth guard so the login page can switch languages too.
 */
const langSwitch: MiddlewareHandler = async (c, next) => {
  const q = c.req.query("lang");
  if (q === "zh" || q === "en") {
    setLangCookie(c, q);
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

/** Warn once per isolate, not on every form post. */
let warnedNoSecret = false;

function isLoginPath(path: string): boolean {
  return LOGIN_PATHS.some((p) => path === p || path.startsWith(p + "/"));
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

/**
 * CSRF: issue a session-bound token for every console request (the shell and
 * the forms read c.get("csrfToken")) and require it back on every POST.
 *
 * The login form is exempt — it has no session yet, and the ADMIN_TOKEN it
 * carries is not something a cross-site attacker can know. Everything else
 * (keys, blocklist, logout, the playground runner) verifies the field, or the
 * X-Corx-Csrf header for the JSON call.
 *
 * Runs after the guard so an Access-JWT identity (no cookie) can be part of
 * the binding. Without a signing secret (SESSION_SECRET/ADMIN_TOKEN) there is
 * nothing to HMAC with: the check is skipped with a warning, and SECURITY.md
 * says so.
 */
const csrf: MiddlewareHandler = async (c, next) => {
  const ctx = c as Context<{ Bindings: Env }>;
  ctx.set("csrfToken", await issueCsrfToken(ctx));
  if (c.req.method !== "POST") return next();
  if (isLoginPath(c.req.path)) return next();
  if (!sessionSecret(c.env)) {
    if (!warnedNoSecret) {
      warnedNoSecret = true;
      console.warn("corx: console CSRF protection is off — set ADMIN_TOKEN or SESSION_SECRET");
    }
    return next();
  }
  const isJson = (c.req.header("content-type") ?? "").includes("application/json");
  const token = isJson ? c.req.header(CSRF_HEADER) : String((await c.req.parseBody())[CSRF_FIELD] ?? "");
  if (!(await verifyCsrfToken(ctx, token))) return csrfDenied(c);
  await next();
};

/** 403 with the reason, on the console page (JSON for the playground call). */
function csrfDenied(c: Context): Response | Promise<Response> {
  const t = consoleT(c);
  const locale = consoleLocale(c);
  const path = new URL(c.req.url).pathname;
  const message = t("console.csrf.failed");
  if ((c.req.header("content-type") ?? "").includes("application/json")) {
    return c.json({ error: message }, 403);
  }
  const ctx = c as Context<{ Bindings: Env }>;
  const user = ctx.get("consoleUser");
  const html = user
    ? ConsoleErrorDocument({
        status: 403,
        path,
        message,
        user,
        locale,
        t,
        csrfToken: ctx.get("csrfToken") ?? "",
      })
    : ErrorPage({ status: 403, locale, origin: new URL(c.req.url).origin, path, message, t });
  return c.html(`<!DOCTYPE html>${html}`, 403);
}

export default [langSwitch, guard, csrf];

import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import { queryBlockedHosts } from "../lib/admin.js";
import { detectLocale, isLocale, makeT } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { BlockedPage } from "./_blocked.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

/**
 * GET /blocked — the instance's blocklist, server-rendered and public.
 *
 * Deliberately read-only: there is no intake form and no unauthenticated write
 * endpoint. The blocklist is the operator's one-vote veto on what the proxy will
 * reach, and an anonymous channel into it would let anyone who can get a human
 * to click "approve" deny this deployment access to any domain. Publishing the
 * list has none of that risk and answers the question a blocked caller actually
 * has.
 *
 * Shape follows `/terms` exactly: one URL, language from the cookie (`?lang=`
 * sets it and redirects), no islands, no public JSON endpoint. The rows are a
 * projection of `blocked_hosts` — hostname and date only, never `reason` (an
 * operator's own note: it can carry a complainant, a legal reference, or an
 * internal judgement).
 *
 * **Never fails the page.** D1 down, or the query erroring, renders an empty
 * list rather than a 500: a public status page that breaks when the database
 * hiccups is worse than one that says "nothing recorded".
 */
app.get("/", async (c) => {
  const reqUrl = new URL(c.req.url);
  const lang = reqUrl.searchParams.get("lang");
  if (isLocale(lang)) {
    setLangCookie(c, lang);
    return c.redirect("/blocked", 302);
  }
  const locale = detectLocale({
    pathname: reqUrl.pathname,
    cookie: c.req.header("cookie"),
    acceptLanguage: c.req.header("accept-language"),
  });
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  const rows = await queryBlockedHosts(c.env.DB).catch(() => []);
  // Language-dependent (cookie > Accept-Language), so no shared caching — the
  // same rule /terms follows. The page is one small query; nothing to cache.
  c.header("Cache-Control", "private, max-age=0, must-revalidate");
  c.header("Vary", "Accept-Language, Cookie");
  // c.html() doesn't add a doctype; prepend one so browsers stay in standards mode.
  return c.html(
    `<!DOCTYPE html>${BlockedPage({
      origin,
      locale,
      t: makeT(locale),
      entries: rows.map((r) => ({ hostname: r.hostname, created_at: r.created_at })),
      total: rows.length,
    })}`,
  );
});

export default app;

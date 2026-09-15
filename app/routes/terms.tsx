import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import { detectLocale, isLocale, makeT } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { ABUSE_EMAIL } from "../lib/site-info.js";
import { TermsPage } from "./_terms.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

/**
 * GET /terms — the public terms of use. A `?lang=zh|en` query sets the same
 * `corx_lang` cookie the rest of the site uses and bounces back to `/terms`,
 * so the language switch in the nav keeps working without extra routes.
 */
app.get("/", (c) => {
  const reqUrl = new URL(c.req.url);
  const lang = reqUrl.searchParams.get("lang");
  if (isLocale(lang)) {
    setLangCookie(c, lang);
    return c.redirect("/terms", 302);
  }
  const locale = detectLocale({
    pathname: reqUrl.pathname,
    cookie: c.req.header("cookie"),
    acceptLanguage: c.req.header("accept-language"),
  });
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  // Language-dependent (cookie > Accept-Language), so no shared caching.
  c.header("Cache-Control", "private, max-age=0, must-revalidate");
  c.header("Vary", "Accept-Language, Cookie");
  // c.html() doesn't add a doctype; prepend one so browsers stay in standards mode.
  return c.html(`<!DOCTYPE html>${TermsPage({ origin, locale, t: makeT(locale), email: ABUSE_EMAIL })}`);
});

export default app;

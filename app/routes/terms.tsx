import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Env } from "../lib/types.js";
import { detectLocale, isLocale, makeT } from "../lib/i18n/locale.js";
import { TermsPage } from "./_terms.js";

/** Where abuse reports and security issues go (see terms §7). */
export const ABUSE_EMAIL = "abuse@envx.cn";

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
    setCookie(c, "corx_lang", lang, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "Lax" });
    return c.redirect("/terms", 302);
  }
  const locale = detectLocale({
    pathname: reqUrl.pathname,
    cookie: c.req.header("cookie"),
    acceptLanguage: c.req.header("accept-language"),
  });
  const origin = `${reqUrl.protocol}//${reqUrl.host}`;
  // c.html() doesn't add a doctype; prepend one so browsers stay in standards mode.
  return c.html(`<!DOCTYPE html>${TermsPage({ origin, locale, t: makeT(locale), email: ABUSE_EMAIL })}`);
});

export default app;

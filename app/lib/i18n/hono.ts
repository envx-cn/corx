import { setCookie } from "hono/cookie";
import type { Context } from "hono";
import { detectLocaleConsole, LANG_COOKIE, makeT, type Locale, type TFunc } from "./locale.js";

/**
 * Hono-facing half of i18n: the two things that need a request context.
 * Detection itself lives in locale.ts, which stays free of Hono so it can be
 * unit-tested (and reused) without a Worker.
 */

/** Minimal structural type so any Hono Context works here. */
type ReqLike = { req: { header(name: string): string | undefined } };

/** Locale for console requests: corx_lang cookie > Accept-Language (no URL prefixes). */
export function consoleLocale(c: ReqLike): Locale {
  return detectLocaleConsole({ cookie: c.req.header("cookie"), acceptLanguage: c.req.header("accept-language") });
}

/** Bound translate function for the request's console locale. */
export function consoleT(c: ReqLike): TFunc {
  return makeT(consoleLocale(c));
}

/**
 * Remember an explicit language choice — the `/zh` / `/en` URL prefixes, a
 * `?lang=…` switch, the console's own switcher — in the cookie that every page
 * reads (public pages via detectLocale, the console via detectLocaleConsole).
 *
 * This is the *only* writer on purpose. The choice has to reach pages that have
 * no URL prefix (`/terms`, `/console/*`), and the bug it fixes was exactly that
 * mismatch: reading `/en` set nothing, so clicking through to `/terms` with a
 * browser that prefers 中文 rendered the Chinese document right after an English
 * one. A year, Lax, whole site — the cookie is a preference, nothing more.
 */
export function setLangCookie(c: Context, locale: Locale): void {
  setCookie(c, LANG_COOKIE, locale, { path: "/", maxAge: 365 * 24 * 3600, sameSite: "Lax" });
}

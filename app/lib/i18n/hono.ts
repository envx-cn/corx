import { detectLocaleConsole, makeT, type Locale, type TFunc } from "./locale.js";

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

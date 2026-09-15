import { DEFAULT_LOCALE, LOCALES, lookup, type Locale, type MessageKey } from "./messages.js";

/** A bound translate function for one locale. */
export type TFunc = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(locale: Locale): TFunc {
  return (key, vars) => lookup(locale, key, vars);
}

export function isLocale(v: string | null | undefined): v is Locale {
  return v === "en" || v === "zh";
}

/**
 * The cookie that remembers an explicit language choice. Read here (pure) and
 * written by `setLangCookie` in ./hono.ts, which is the only writer — the name
 * has to agree or pages silently fall back to Accept-Language.
 */
export const LANG_COOKIE = "corx_lang";

/** Parse the corx_lang cookie out of a raw Cookie header ("" when absent). */
export function langCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === LANG_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/** First language tag of an Accept-Language header, lowercased. */
function firstAcceptLanguage(header: string | null | undefined): string {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first.split(";")[0] ?? "";
}

export interface LocaleSource {
  /** URL pathname — a leading /zh or /en segment wins. */
  pathname: string;
  /** Raw Cookie header. */
  cookie?: string | null;
  /** Accept-Language header. */
  acceptLanguage?: string | null;
}

/**
 * Resolve the request locale: URL prefix (/zh, /en) > corx_lang cookie >
 * Accept-Language > default (en). Used for public pages (landing, 404);
 * the console resolves via cookie/Accept-Language only (no URL prefixes).
 */
export function detectLocale(src: LocaleSource): Locale {
  const m = src.pathname.match(/^\/(zh|en)(?:\/|$)/);
  if (m && isLocale(m[1])) return m[1];
  const cookie = langCookie(src.cookie);
  if (isLocale(cookie)) return cookie;
  const al = firstAcceptLanguage(src.acceptLanguage);
  if (al.startsWith("zh")) return "zh";
  return DEFAULT_LOCALE;
}

/** Console variant: cookie > Accept-Language (no URL prefix handling). */
export function detectLocaleConsole(src: Omit<LocaleSource, "pathname">): Locale {
  const cookie = langCookie(src.cookie);
  if (isLocale(cookie)) return cookie;
  const al = firstAcceptLanguage(src.acceptLanguage);
  if (al.startsWith("zh")) return "zh";
  return DEFAULT_LOCALE;
}

export { DEFAULT_LOCALE, LOCALES };
export type { Locale, MessageKey };

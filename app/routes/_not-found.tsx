import type { Context } from "hono";
import { StatusPage } from "../components/status-page.js";
import type { Env } from "../lib/types.js";
import { detectLocale, makeT, type Locale, type TFunc } from "../lib/i18n/locale.js";

/**
 * Branded 404 document for non-proxy paths that match nothing (unknown
 * routes outside /api/* and /console/*). Rendered by the /* catch-all in
 * app/server.ts — not a route file, so it never registers its own path.
 *
 * Language follows the /zh|/en URL prefix, the corx_lang cookie, then
 * Accept-Language (see detectLocale).
 */
export function NotFoundPage(props: { path: string; origin: string; locale: Locale; t: TFunc }) {
  const { t } = props;
  return (
    <StatusPage
      code="404"
      locale={props.locale}
      origin={props.origin}
      t={t}
      title={t("notfound.title")}
      h1={t("notfound.h1")}
      sub={t("notfound.sub")}
      primary={{ href: "/", label: t("notfound.takeHome") }}
      secondary={{ href: "/console/", label: t("notfound.openConsole") }}
      note={t("notfound.noMatch", { path: props.path })}
    />
  );
}

/**
 * The branded 404 response itself: used by the `/*` catch-all (app/server.ts)
 * and by routes that matched but whose subject does not exist (an unknown
 * /compare/<name>). Language follows the /zh|/en URL prefix, the corx_lang
 * cookie, then Accept-Language.
 */
export function notFoundResponse<E extends { Bindings: Env }>(c: Context<E>): Response {
  const reqUrl = new URL(c.req.url);
  const locale = detectLocale({
    pathname: reqUrl.pathname,
    cookie: c.req.header("cookie"),
    acceptLanguage: c.req.header("accept-language"),
  });
  // c.html() doesn't add a doctype; prepend it so browsers don't fall into quirks mode.
  return c.html(
    `<!DOCTYPE html>${NotFoundPage({
      path: reqUrl.pathname,
      origin: reqUrl.origin,
      locale,
      t: makeT(locale),
    })}`,
    404,
  );
}

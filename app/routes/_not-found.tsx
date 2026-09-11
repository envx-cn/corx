import { StatusPage } from "../components/status-page.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

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

import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

/**
 * Branded 404 document for non-proxy paths that match nothing (unknown
 * routes outside /api/* and /console/*). Rendered by the /* catch-all in
 * app/server.ts — not a route file, so it never registers its own path.
 *
 * Styled after Cloudflare's own not-found page: a full-viewport hero with
 * huge "404" digits over a soft brand glow, hairline dashed rules, a
 * one-line subtitle and two CTAs. Language follows the /zh|/en URL prefix,
 * the corx_lang cookie, then Accept-Language (see detectLocale).
 */
export function NotFoundPage(props: { path: string; origin: string; locale: Locale; t: TFunc }) {
  const { t } = props;
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead title={t("notfound.title")} />
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav locale={props.locale} t={t} />
        <main class="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 text-center min-h-[calc(100svh-4rem)] py-16">
          {/* soft radial brand glow, like cloudflare.com's not-found hero */}
          <div
            aria-hidden="true"
            class="pointer-events-none absolute inset-0"
            style="background: radial-gradient(ellipse 70% 55% at 50% 45%, rgba(246, 130, 31, 0.12), transparent 65%)"
          ></div>
          {/* hairline dashed rules above and below the hero */}
          <div aria-hidden="true" class="absolute inset-x-0 top-0 border-t border-dashed border-base-300"></div>
          <div aria-hidden="true" class="absolute inset-x-0 bottom-0 border-t border-dashed border-base-300"></div>

          <div class="relative">
            <div class="nf-404 select-none" aria-hidden="true">
              404
            </div>
            <h1 class="sr-only">{t("notfound.h1")}</h1>
            <p class="mx-auto mt-6 max-w-md text-balance text-base-content/70">{t("notfound.sub")}</p>
            <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="/" class="btn btn-primary btn-lg rounded-full! px-8">
                {t("notfound.takeHome")}
              </a>
              <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                {t("notfound.openConsole")}
              </a>
            </div>
            <p class="mt-10 text-xs text-base-content/45">{t("notfound.noMatch", { path: props.path })}</p>
          </div>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

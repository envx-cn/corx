import type { Child } from "hono/jsx";
import appCss from "../styles/app.css?inline";
import { CorxLogo } from "./logo.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

/**
 * Shared chrome for the full-document public pages (landing + 404): the COR X
 * logo, document <head>, the sticky nav, and the dark footer. The console has
 * its own shell (app/routes/console/_layout.tsx) and doesn't use these.
 */

/** Document <head>: fonts + injected app CSS. Inject it with
    dangerouslySetInnerHTML — hono/jsx would otherwise HTML-escape the CSS and
    silently drop any rule whose selector contains > or & (see AGENTS.md). */
export function SiteHead(props: { title: string; description?: string; origin?: string }) {
  return (
    <>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
      {props.description && <meta name="description" content={props.description} />}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={props.title} />
      {props.description && <meta property="og:description" content={props.description} />}
      {props.origin && <meta property="og:url" content={props.origin} />}
      <meta name="twitter:card" content="summary" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: appCss }}></style>
    </>
  );
}

/**
 * Sticky site nav: corx mark + optional center links (the landing page's
 * "Try it / Features") + a language switch + an "Open console" CTA.
 *
 * The language switch links to the /zh or /en URL-prefixed landing (public
 * pages only — the console has its own in-shell switcher).
 */
export function SiteNav(props: { links?: Child; locale?: Locale; t?: TFunc }) {
  return (
    <nav class="sticky top-0 z-30 bg-base-100/85 backdrop-blur border-b border-base-300">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <a href="/" class="flex items-center" aria-label="CORX">
          <CorxLogo class="h-8" />
        </a>
        {props.links && (
          <div class="hidden md:flex items-center gap-1 text-sm text-base-content/75">{props.links}</div>
        )}
        <div class="flex items-center gap-3">
          {props.t && (
            <div class="flex items-center gap-1 text-xs font-medium text-base-content/75">
              <a
                href="/zh"
                lang="zh"
                aria-current={props.locale === "zh" ? "true" : undefined}
                class={`px-2 py-1 rounded-md hover:bg-base-200 transition-colors ${props.locale === "zh" ? "text-primary" : ""}`}
              >
                {props.t("lang.zh")}
              </a>
              <span class="text-base-content/25">/</span>
              <a
                href="/en"
                lang="en"
                aria-current={props.locale === "en" ? "true" : undefined}
                class={`px-2 py-1 rounded-md hover:bg-base-200 transition-colors ${props.locale === "en" ? "text-primary" : ""}`}
              >
                {props.t("lang.en")}
              </a>
            </div>
          )}
          <div class="flex items-center gap-3">
            <a href="/console/" class="btn btn-primary btn-sm rounded-full! px-4">
              {props.t ? props.t("site.openConsole") : "Open console"}
            </a>
          </div>
        </div>
      </div>
      {/* Mobile: the same section links as a scrollable chip row (the desktop
          row is hidden below md, which used to leave phones without section
          navigation entirely). */}
      {props.links && (
        <div class="md:hidden border-t border-base-300 overflow-x-auto">
          <div class="max-w-6xl mx-auto px-4 py-1.5 flex items-center gap-1 text-sm text-base-content/75 whitespace-nowrap">
            {props.links}
          </div>
        </div>
      )}
    </nav>
  );
}

/** Site footer: dark navy band with the brand + console link + copyright.
    `origin` (the public base URL) is shown in the bottom bar when provided. */
export function SiteFooter(props: { origin?: string; t?: TFunc }) {
  const t = props.t ?? ((k: string) => k);
  return (
    <footer class="bg-secondary text-secondary-content">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div class="text-center sm:text-left">
          {/* Wordmark: letters follow the band's text colour, the X stays brand red. */}
          <CorxLogo class="h-8 mx-auto sm:mx-0" />
          <div class="mt-2 text-xs text-secondary-content/60">{t("site.tagline")}</div>
        </div>
        <div class="flex items-center gap-6 text-sm text-secondary-content/70">
          <a href="/console/" class="hover:text-secondary-content inline-block py-2">
            {t("site.console")}
          </a>
        </div>
      </div>
      <div class="border-t border-white/10">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-secondary-content/50 flex items-center justify-between">
          <span>{t("site.copyright", { year: new Date().getFullYear() })}</span>
          {props.origin && <span>{props.origin}</span>}
        </div>
      </div>
    </footer>
  );
}

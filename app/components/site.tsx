import type { Child } from "hono/jsx";
import appCss from "../styles/app.css?inline";
import { CorxLogo } from "./logo.js";
import { Lucide, githubMarkSvg } from "./lucide.js";
import menuSvg from "lucide-static/icons/menu.svg?raw";
import xSvg from "lucide-static/icons/x.svg?raw";
import scaleSvg from "lucide-static/icons/scale.svg?raw";
import fileTextIconSvg from "lucide-static/icons/file-text.svg?raw";
import layoutDashboardSvg from "lucide-static/icons/layout-dashboard.svg?raw";
import { absUrl, jsonLd, OG_LOCALE } from "../lib/seo.js";
import { GITHUB_URL } from "../lib/site-info.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

export { GITHUB_URL };

/**
 * Shared chrome for the full-document public pages (landing + 404): the COR X
 * logo, document <head>, the sticky nav, and the dark footer. The console has
 * its own shell (app/routes/console/_layout.tsx) and doesn't use these.
 */

/**
 * Document <head>: SEO/GEO meta, fonts + injected app CSS. Inject the CSS with
 * dangerouslySetInnerHTML — hono/jsx would otherwise HTML-escape it and
 * silently drop any rule whose selector contains > or & (see AGENTS.md).
 *
 * Every SEO prop is optional, because not every document wants to be indexed:
 * the landing and /terms pass the full set (canonical, hreflang, card, JSON-LD),
 * while 404 / 5xx pages pass `noindex` and nothing else. Without `origin` the
 * absolute-only tags (canonical, og:url, og:image) are simply omitted rather
 * than emitted as relative URLs crawlers would misread.
 */
export function SiteHead(props: {
  title: string;
  description?: string;
  /** Scheme + host of *this* deployment; enables every absolute URL below. */
  origin?: string;
  /** Canonical path for this document ("/", "/zh", "/terms"). */
  canonical?: string;
  /** hreflang cluster (landing only — /terms has no translated URLs). */
  alternates?: Array<{ hreflang: string; href: string }>;
  locale?: Locale;
  /** Social card, as a path relative to the origin (e.g. "/og.png"). */
  image?: { path: string; width: number; height: number; alt: string };
  /** schema.org nodes; wrapped into one @graph by jsonLd(). */
  structuredData?: unknown[];
  /** Keep this document out of every index (404, 5xx, anything trailing). */
  noindex?: boolean;
}) {
  const canonical = props.origin && props.canonical ? absUrl(props.origin, props.canonical) : undefined;
  const image = props.origin && props.image ? { url: absUrl(props.origin, props.image.path), ...props.image } : undefined;
  return (
    <>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
      {props.description && <meta name="description" content={props.description} />}
      {/* max-image-preview:large + max-snippet:-1 opt into the full previews
          (and, in practice, the richer AI answers) search engines offer. */}
      <meta
        name="robots"
        content={props.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1"}
      />
      {canonical && <link rel="canonical" href={canonical} />}
      {props.alternates?.map((alt) => (
        <link rel="alternate" hreflang={alt.hreflang} href={alt.href} />
      ))}
      {/* The machine-discoverable agent entry: llms.txt is an alternate
          representation of this site for agents, declared where a crawler
          looks for metadata rather than only in the rendered footer. The
          visible half is the landing page's own agents band. */}
      {props.origin && (
        <link rel="alternate" type="text/plain" href={absUrl(props.origin, "/llms.txt")} title="llms.txt" />
      )}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="CORX" />
      <meta property="og:title" content={props.title} />
      {props.description && <meta property="og:description" content={props.description} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {props.locale && <meta property="og:locale" content={OG_LOCALE[props.locale]} />}
      {props.locale && (
        <meta property="og:locale:alternate" content={OG_LOCALE[props.locale === "en" ? "zh" : "en"]} />
      )}
      {image && <meta property="og:image" content={image.url} />}
      {image && <meta property="og:image:type" content="image/png" />}
      {image && <meta property="og:image:width" content={String(image.width)} />}
      {image && <meta property="og:image:height" content={String(image.height)} />}
      {image && <meta property="og:image:alt" content={image.alt} />}
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={props.title} />
      {props.description && <meta name="twitter:description" content={props.description} />}
      {image && <meta name="twitter:image" content={image.url} />}
      {image && <meta name="twitter:image:alt" content={image.alt} />}
      {props.structuredData && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(props.structuredData) }}></script>
      )}
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
 * Sticky site nav: corx mark, the section links (inline from md up, a
 * disclosure below it), the language switch, GitHub and the console CTA.
 *
 * Below md everything but the logo and the menu button moves into the menu
 * sheet: the section links, the language switch, GitHub, and the console CTA
 * across the bottom. Four controls plus a logo do not fit a 360px top row, and
 * a full-screen sheet can afford the spacing a 50px chip row could not.
 *
 * The menu is a native `<details>`, not an island: this nav also renders on the
 * /terms, 404 and 5xx documents, which deliberately ship no client script. The
 * two behaviours `<details>` does not have get a few lines of inline script: a
 * panel left open after tapping a section link would cover the section it just
 * scrolled to, and an outside tap should close it.
 */
export function SiteNav(props: { links?: Child; locale?: Locale; t?: TFunc; langLinks?: { zh: string; en: string } }) {
  const langLinks = props.langLinks ?? { zh: "/zh", en: "/en" };
  const t = props.t;
  const githubLabel = t ? t("site.githubAria") : "View the CORX source on GitHub";
  return (
    <nav class="sticky top-0 z-30 bg-base-100/85 backdrop-blur border-b border-base-300">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <a href="/" class="flex items-center" aria-label="CORX">
          <CorxLogo class="h-8" />
        </a>
        {props.links && (
          <div class="hidden md:flex items-center gap-1 text-sm text-base-content/75">{props.links}</div>
        )}
        <div class="flex items-center gap-2">
          {t && (
            <div class="hidden md:flex items-center gap-1 text-xs font-medium text-base-content/75">
              <a
                href={langLinks.zh}
                lang="zh"
                aria-current={props.locale === "zh" ? "true" : undefined}
                class={`px-2 py-1 rounded-xs hover:bg-base-200 transition-colors ${props.locale === "zh" ? "text-primary" : ""}`}
              >
                {t("lang.zh")}
              </a>
              <span class="text-base-content/25">/</span>
              <a
                href={langLinks.en}
                lang="en"
                aria-current={props.locale === "en" ? "true" : undefined}
                class={`px-2 py-1 rounded-xs hover:bg-base-200 transition-colors ${props.locale === "en" ? "text-primary" : ""}`}
              >
                {t("lang.en")}
              </a>
            </div>
          )}
          {/* Hidden below md: the footer carries the same link, and the top row
              has to hold the logo, the CTA and the menu button. */}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-ghost btn-sm btn-circle hidden md:inline-flex"
            title={githubLabel}
            aria-label={githubLabel}
          >
            <Lucide svg={githubMarkSvg} />
          </a>
          {/* Desktop only: below md the CTA is the bottom of the menu sheet,
              full width and where a thumb already is. */}
          <a href="/console/" class="btn btn-primary btn-sm rounded-full! px-4 hidden md:inline-flex">
            {t ? t("site.openConsole") : "Open console"}
          </a>
          <details class="nav-menu md:hidden" data-corx-menu>
            <summary
              class="btn btn-ghost btn-sm btn-square list-none [&::-webkit-details-marker]:hidden"
              aria-label={t ? t("site.menu") : "Menu"}
            >
              <Lucide svg={menuSvg} class="icon-open" />
              <Lucide svg={xSvg} class="icon-close" />
            </summary>
            {/* Full-screen sheet below the nav, not a dropdown: at this size the
                links want room, and the CTA wants to sit where a thumb already
                is. `svh` so mobile browser chrome appearing does not make it
                jump; `overflow-y-auto` for a short landscape viewport.
                `top-full` on a sticky parent keeps it under the nav at any
                scroll position. */}
            <div class="nav-sheet absolute inset-x-0 top-full flex h-[calc(100svh-4rem)] flex-col overflow-y-auto border-t border-base-300 bg-base-100">
              <div class="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4">
                {props.links}
              </div>
              {/* The sheet's one action, above the rule: what sits under the
                  rule is fine print (language, source), not a second CTA. */}
              <div class="mx-auto mt-auto w-full max-w-6xl px-4 pb-4">
                <a href="/console/" class="btn btn-primary btn-lg w-full rounded-full!">
                  {t ? t("site.openConsole") : "Open console"}
                </a>
              </div>
              <div class="border-t border-base-300">
                <div class="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
                  {t && (
                    <div class="flex items-center gap-1 text-xs font-medium text-base-content/75">
                      <a href={langLinks.zh} lang="zh" class="px-2 py-1 rounded-xs hover:bg-base-200">
                        {t("lang.zh")}
                      </a>
                      <span class="text-base-content/25">/</span>
                      <a href={langLinks.en} lang="en" class="px-2 py-1 rounded-xs hover:bg-base-200">
                        {t("lang.en")}
                      </a>
                    </div>
                  )}
                  <a
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-ghost btn-xs btn-circle ml-auto"
                    aria-label={githubLabel}
                  >
                    <Lucide svg={githubMarkSvg} />
                  </a>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
      {/* Native <details> closes on nothing but its own summary, and hides its
          content the instant `open` goes away — so an animated close has to be
          scheduled here. Inline on purpose, and placed after the markup it
          wires so it needs no DOMContentLoaded. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function () {
  var menu = document.querySelector("details[data-corx-menu]");
  if (!menu) return;
  var EXIT_MS = 200; // must match .nav-menu[open].is-closing in app.css
  function setLock(on) {
    document.body.style.overflow = on ? "hidden" : "";
  }
  function close(animate) {
    if (!menu.open) return;
    // Unlocking here rather than from the toggle listener below: <details>
    // queues that event as a separate task, which for a section-link tap lands
    // *after* the browser has handled the hash navigation — and a locked body
    // cannot be scrolled to the section that was just picked.
    if (!animate) { menu.removeAttribute("open"); setLock(false); return; }
    menu.classList.add("is-closing");
    setTimeout(function () {
      menu.classList.remove("is-closing");
      menu.removeAttribute("open");
      setLock(false);
    }, EXIT_MS);
  }
  // The toggle is the one place that sees the native open, so the scroll lock
  // (the sheet is full-screen) hangs off it too. Idempotent with close().
  menu.addEventListener("toggle", function () { setLock(menu.open); });
  var summary = menu.querySelector("summary");
  summary.addEventListener("click", function (e) {
    if (!menu.open) return;            // opening: let the native toggle run
    e.preventDefault();                // closing: animate first
    close(true);
  });
  menu.addEventListener("click", function (e) {
    // Deliberately not animated: the body has to be scrollable again *before*
    // the browser handles the hash navigation, or the page cannot scroll to the
    // section the reader just picked.
    if (e.target && e.target.closest("a")) close(false);
  });
  document.addEventListener("click", function (e) {
    if (menu.open && !menu.contains(e.target)) close(true);
  });
})();`,
        }}
      />
    </nav>
  );
}

/** Site footer: the dark band closing every public page. The brand column
    carries the wordmark, the tagline and the copyright + instance origin (one
    band, not a second divider line), and the links the page owes a reader —
    terms, the machine-readable index, the source, the console — are iconised
    so the row reads as four destinations rather than four similar words.
    `origin` (the public base URL) is appended to the copyright when known. */
export function SiteFooter(props: { origin?: string; t?: TFunc }) {
  const t = props.t ?? ((k: string) => k);
  // One class for all four: icons inherit currentColor and the hover colour.
  const linkClass = "hover:text-secondary-content inline-flex items-center gap-1.5 py-2";
  return (
    <footer class="bg-secondary text-secondary-content">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row sm:items-center justify-between gap-8">
        <div class="text-center sm:text-left">
          {/* Wordmark: letters follow the band's text colour, the X stays brand red. */}
          <CorxLogo class="h-8 mx-auto sm:mx-0" />
          <div class="mt-2 text-xs text-secondary-content/60">{t("site.tagline")}</div>
          <div class="mt-1 text-xs text-secondary-content/60">
            {t("site.copyright", { year: new Date().getFullYear() })}
            {props.origin && <> · {props.origin}</>}
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-secondary-content/75">
          <a href="/terms" class={linkClass}>
            <Lucide svg={scaleSvg} />
            {t("site.terms")}
          </a>
          {/* Left as the literal filename: it is a machine-facing entry (the
              landing page's agents band explains it), and "llms.txt" is what
              the reader who wants it is looking for. */}
          <a href="/llms.txt" class={linkClass}>
            <Lucide svg={fileTextIconSvg} />
            llms.txt
          </a>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" class={linkClass}>
            <Lucide svg={githubMarkSvg} />
            {t("site.github")}
          </a>
          <a href="/console/" class={linkClass}>
            <Lucide svg={layoutDashboardSvg} />
            {t("site.console")}
          </a>
        </div>
      </div>
    </footer>
  );
}

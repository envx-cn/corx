import type { Child } from "hono/jsx";
import appCss from "../styles/app.css?inline";

/**
 * Shared chrome for the full-document public pages (landing + 404): the corx
 * mark, document <head>, the sticky nav, and the dark footer. The console has
 * its own shell (app/routes/console/_layout.tsx) and doesn't use these.
 */

/** corx logo mark: Cloudflare-orange gradient tile (brand, both themes). */
export function CorxMark() {
  return (
    <span class="corx-mark size-8 rounded-lg text-white inline-flex items-center justify-center text-xs font-extrabold shadow-sm">
      cx
    </span>
  );
}

/** Document <head>: fonts + injected app CSS. Inject it with
    dangerouslySetInnerHTML — hono/jsx would otherwise HTML-escape the CSS and
    silently drop any rule whose selector contains > or & (see AGENTS.md). */
export function SiteHead(props: { title: string }) {
  return (
    <>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
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
 * "Try it / Features") + an "Open console" CTA on the right.
 */
export function SiteNav(props: { links?: Child }) {
  return (
    <nav class="sticky top-0 z-30 bg-base-100/85 backdrop-blur border-b border-base-300">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <a href="/" class="flex items-center gap-2.5">
          <CorxMark />
          <b class="text-lg tracking-tight">corx</b>
        </a>
        {props.links && (
          <div class="hidden md:flex items-center gap-1 text-sm text-base-content/70">{props.links}</div>
        )}
        <div class="flex items-center gap-3">
          <a href="/console/" class="btn btn-primary btn-sm rounded-full! px-4">
            Open console
          </a>
        </div>
      </div>
    </nav>
  );
}

/** Site footer: dark navy band with the brand + console link + copyright.
    `origin` (the public base URL) is shown in the bottom bar when provided. */
export function SiteFooter(props: { origin?: string }) {
  return (
    <footer class="bg-secondary text-secondary-content">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div class="flex items-center gap-2.5">
          <CorxMark />
          <div>
            <b>corx</b>
            <div class="text-xs text-secondary-content/60">CORS proxy, served from the edge</div>
          </div>
        </div>
        <div class="flex items-center gap-6 text-sm text-secondary-content/70">
          <a href="/console/" class="hover:text-secondary-content">
            Console
          </a>
        </div>
      </div>
      <div class="border-t border-white/10">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-secondary-content/50 flex items-center justify-between">
          <span>© {new Date().getFullYear()} corx</span>
          {props.origin && <span>{props.origin}</span>}
        </div>
      </div>
    </footer>
  );
}

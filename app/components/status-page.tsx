import type { Child } from "hono/jsx";
import { SiteFooter, SiteHead, SiteNav } from "./site.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

/**
 * Shared full-document status page for the public route fallbacks: the 404
 * (`_not-found.tsx`) and the 5xx error page (`_error-page.tsx`). Both are
 * rendered by hand from app/server.ts — not route files — so they work even
 * when the failing request never reached a route.
 *
 * Styled after Cloudflare's own not-found page: a full-viewport hero with huge
 * digits over a soft brand glow, hairline dashed rules, a subtitle and two CTAs.
 */
export function StatusPage(props: {
  /** Huge hero digits ("404", "500", …). */
  code: string;
  /** Glow tint: brand red for expected misses, error red for failures. */
  tone?: "brand" | "error";
  title: string;
  /** Accessible heading (the digits are decorative). */
  h1: string;
  sub: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
  /** Small print under the CTAs (route, reference, …). */
  note?: Child;
  /** Dev-only detail block (error message); never rendered in production. */
  devDetail?: string;
  locale: Locale;
  origin?: string;
  t: TFunc;
}) {
  // Glow tint: brand red for expected misses, deep error red for failures.
  const glow =
    props.tone === "error"
      ? "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(180, 35, 24, 0.10), transparent 65%)"
      : "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(253, 7, 0, 0.09), transparent 65%)";
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead title={props.title} />
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav locale={props.locale} t={props.t} />
        <main class="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 text-center min-h-[calc(100svh-4rem)] py-16">
          {/* soft radial glow, like cloudflare.com's not-found hero */}
          <div aria-hidden="true" class="pointer-events-none absolute inset-0" style={`background: ${glow}`}></div>
          {/* hairline dashed rules above and below the hero */}
          <div aria-hidden="true" class="absolute inset-x-0 top-0 border-t border-dashed border-base-300"></div>
          <div aria-hidden="true" class="absolute inset-x-0 bottom-0 border-t border-dashed border-base-300"></div>

          <div class="relative">
            <div class="status-code select-none" aria-hidden="true">
              {props.code}
            </div>
            <h1 class="sr-only">{props.h1}</h1>
            <p class="mx-auto mt-6 max-w-md text-balance text-base-content/75">{props.sub}</p>
            <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href={props.primary.href} class="btn btn-primary btn-lg rounded-full! px-8">
                {props.primary.label}
              </a>
              <a href={props.secondary.href} class="btn btn-lg btn-outline rounded-full! px-8">
                {props.secondary.label}
              </a>
            </div>
            {props.note && <p class="mt-10 text-xs text-base-content/75">{props.note}</p>}
            {props.devDetail && (
              <pre class="mx-auto mt-4 max-w-xl overflow-x-auto rounded-box border border-error/30 bg-error/5 p-3 text-left text-xs text-error">
                {props.devDetail}
              </pre>
            )}
          </div>
        </main>
        <SiteFooter origin={props.origin} t={props.t} />
      </body>
    </html>
  );
}

import { Hono } from "hono";
import type { Env } from "../lib/types.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { HeroX } from "../components/hero-x.js";
import { makeT } from "../lib/i18n/locale.js";

/**
 * TEMPORARY prototype route (`/x-preview`) for evaluating the animated hero X.
 *
 * Renders the real hero content four times — the current backdrop (P0) and
 * three alternative placements (centered, centered-low, bottom-cropped).
 * `?v=p1` renders just one section (deterministic screen recording).
 * Delete this file once a placement has been picked.
 */
const app = new Hono<{ Bindings: Env }>();

interface ProtoSection {
  id: string;
  label: string;
  variant: "draw" | "pulse" | "combo" | "hover" | null;
  placement: "right" | "right-far" | "corner-br" | "center" | "low" | "bottom" | "watermark" | "panel";
  faint?: boolean;
  watermark?: boolean;
}

const SECTIONS: ProtoSection[] = [
  { id: "p0", label: "P0 · right bleed · 7% (current)", variant: "combo", placement: "right" },
  { id: "p1", label: "P1 · centered · 4%", variant: "combo", placement: "center", faint: true },
  { id: "p2", label: "P2 · centered, crossing under the H1 · 4%", variant: "combo", placement: "low", faint: true },
  { id: "p3", label: "P3 · bottom-cropped · 4%", variant: "combo", placement: "bottom", faint: true },
  { id: "p4", label: "P4 · watermark (centered, no crop) · 2.5%", variant: "combo", placement: "watermark", watermark: true },
  { id: "p5", label: "P5 · right, pushed further out · 5%", variant: "combo", placement: "right-far", faint: true },
  { id: "p6", label: "P6 · bottom-right corner · 5%", variant: "combo", placement: "corner-br", faint: true },
  { id: "p7", label: "P7 · no X", variant: null, placement: "right" },
  { id: "h1", label: "H1 · P4 watermark + hover-pulse", variant: "hover", placement: "watermark", watermark: true },
];

app.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  const t = makeT("en");
  const only = c.req.query("v");
  // ?flat=1 drops the hero's top gradient and the marker behind "without CORS."
  // so the X can be judged on a plain canvas.
  const flat = c.req.query("flat") === "1";
  const sections = only ? SECTIONS.filter((s) => s.id === only) : SECTIONS;
  const page = (
    <html lang="en" data-theme="corx">
      <head>
        <SiteHead title="Hero X prototype — corx" />
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav t={t} />

        <main class="flex-1">
          {sections.map((s) => (
            <section
              id={s.id}
              class="relative overflow-hidden min-h-[calc(85svh-4rem)] flex items-center justify-center"
            >
              {!flat && <div class="hero-glow absolute inset-x-0 top-0 h-[65%] pointer-events-none"></div>}
              {s.variant && (
                <HeroX variant={s.variant} placement={s.placement} faint={s.faint} watermark={s.watermark} />
              )}
              <span class="absolute left-4 top-4 z-20 badge badge-outline badge-sm font-mono opacity-70">
                {s.label}
              </span>
              <div class="relative max-w-4xl w-full mx-auto px-4 sm:px-6 py-16 text-center">
                <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] text-base-content">
                  {t("landing.hero.h1a")}
                  <br />
                  {flat ? t("landing.hero.h1b") : <span class="marker">{t("landing.hero.h1b")}</span>}
                </h1>
                <p class="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-base-content/75">
                  {t("landing.hero.sub")}
                </p>
                <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <a href="/console/" class="btn btn-primary btn-lg rounded-full! px-8">
                    {t("landing.hero.tryLive")}
                  </a>
                  <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                    {t("landing.hero.openConsole")}
                  </a>
                </div>
                <p class="mt-8 text-sm text-base-content/75">
                  {t("landing.hero.prefix")}{" "}
                  <code class="break-all">{origin}/fetch?url=https://api.example.com</code>
                </p>
              </div>
            </section>
          ))}
        </main>

        <SiteFooter origin={origin} t={t} />
      </body>
    </html>
  );
  return c.html(`<!DOCTYPE html>${page}`);
});

export default app;

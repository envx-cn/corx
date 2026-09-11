import type { Child } from "hono/jsx";
import { HasIslands } from "honox/server";
import linkSvg from "lucide-static/icons/link-2.svg?raw";
import zapSvg from "lucide-static/icons/zap.svg?raw";
import shieldSvg from "lucide-static/icons/shield-check.svg?raw";
import keySvg from "lucide-static/icons/key-round.svg?raw";
import chartSvg from "lucide-static/icons/bar-chart-3.svg?raw";
import globeSvg from "lucide-static/icons/globe.svg?raw";
import arrowUpRightSvg from "lucide-static/icons/arrow-up-right.svg?raw";
import { Lucide } from "../components/lucide.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";
import CorsDemo, { type CorsDemoI18n } from "../islands/cors-demo.js";

/**
 * Marketing landing page, styled after cloudflare.com: white canvas, orange
 * CTAs, marker-highlighted hero word, a live mockup-browser "try it" demo
 * (rotating example URLs proxied in real time), feature grid and a dark navy
 * footer. Fully translated via the t() function (en/zh); served at /, /zh,
 * /en by app/routes/index.ts.
 */
export function LandingPage(props: { host: string; origin: string; locale: Locale; t: TFunc }) {
  const { t } = props;
  const demo: CorsDemoI18n = {
    urlAria: t("corsDemo.urlAria"),
    urlPh: t("corsDemo.urlPh"),
    go: t("corsDemo.go"),
    error: t("corsDemo.error"),
    cache: t("corsDemo.cache"),
    truncated: t("corsDemo.truncated"),
    requestFailed: t("corsDemo.requestFailed"),
    waiting: t("corsDemo.waiting"),
    autoRotating: t("corsDemo.autoRotating"),
    manualMode: t("corsDemo.manualMode"),
    pause: t("corsDemo.pause"),
    resume: t("corsDemo.resume"),
  };
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead title={t("landing.title")} />
        {/* Island hydration entry (the CorsDemo below needs it). */}
        {import.meta.env.PROD ? (
          <HasIslands>
            <script type="module" src="/static/client.js"></script>
          </HasIslands>
        ) : (
          <script type="module" src="/app/client.ts"></script>
        )}
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav
          locale={props.locale}
          t={t}
          links={
            <>
              <a href="#try-it" class="px-3 py-2 rounded-lg hover:bg-base-200">
                {t("site.tryIt")}
              </a>
              <a href="#features" class="px-3 py-2 rounded-lg hover:bg-base-200">
                {t("site.features")}
              </a>
            </>
          }
        />

        <main class="flex-1">
          {/* Hero — fills the viewport below the nav; nothing peeks underneath. */}
          <section class="snap-page relative overflow-hidden min-h-[calc(100svh-4rem)] flex items-center justify-center">
            <div class="hero-glow absolute inset-x-0 top-0 h-[65%] pointer-events-none"></div>
            <div class="relative max-w-4xl w-full mx-auto px-4 sm:px-6 py-16 text-center">
              <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] text-base-content">
                {t("landing.hero.h1a")}
                <br />
                <span class="marker">{t("landing.hero.h1b")}</span>
              </h1>
              <p class="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-base-content/60">{t("landing.hero.sub")}</p>
              <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a href="#try-it" class="btn btn-primary btn-lg rounded-full! px-8">
                  {t("landing.hero.tryLive")}
                </a>
                <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                  {t("landing.hero.openConsole")}
                  <Lucide svg={arrowUpRightSvg} />
                </a>
              </div>
            </div>
          </section>

          {/* Live demo — full-viewport section so nothing below leaks. */}
          <section id="try-it" class="snap-page min-h-[calc(100svh-4rem)] flex flex-col items-center justify-center max-w-4xl mx-auto px-4 sm:px-6 py-16">
            <div class="text-center mb-8">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.tryit.title")}</h2>
              <p class="mt-2 text-base-content/60">{t("landing.tryit.sub")}</p>
            </div>
            <CorsDemo base={props.origin} i18n={demo} />
            <p class="mt-4 text-xs text-base-content/55 text-center leading-relaxed">{t("landing.tryit.hint", { origin: props.origin })}</p>
          </section>

          {/* Features */}
          <section id="features" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.features.title")}</h2>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Feature icon={linkSvg} title={t("landing.features.simple.title")} desc={t("landing.features.simple.desc")} />
              <Feature icon={zapSvg} title={t("landing.features.cached.title")} desc={t("landing.features.cached.desc")} />
              <Feature icon={shieldSvg} title={t("landing.features.ssrf.title")} desc={t("landing.features.ssrf.desc")} />
              <Feature icon={keySvg} title={t("landing.features.keys.title")} desc={t("landing.features.keys.desc")} />
              <Feature icon={chartSvg} title={t("landing.features.analytics.title")} desc={t("landing.features.analytics.desc")} />
              <Feature icon={globeSvg} title={t("landing.features.subdomain.title")} desc={t("landing.features.subdomain.desc")} />
            </div>
          </section>

          {/* CTA band */}
          <section class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="relative overflow-hidden bg-secondary text-secondary-content rounded-box px-6 py-14 text-center">
              <div class="hero-glow absolute inset-x-0 top-0 h-44 opacity-60 pointer-events-none"></div>
              <h2 class="relative text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.cta.title")}</h2>
              <p class="relative mt-3 text-secondary-content/70">{t("landing.cta.sub")}</p>
              <a href="/console/" class="relative mt-8 btn btn-primary btn-lg rounded-full! px-8">
                {t("landing.cta.btn")}
              </a>
            </div>
          </section>
        </main>

        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div class="feature-card">
      <span class="feature-icon">
        <Lucide svg={icon} />
      </span>
      <h3 class="font-semibold mb-1.5">{title}</h3>
      <p class="text-sm text-base-content/60 leading-relaxed">{desc}</p>
    </div>
  );
}

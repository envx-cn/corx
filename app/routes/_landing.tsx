import type { Child } from "hono/jsx";
import { HasIslands } from "honox/server";
import linkSvg from "lucide-static/icons/link-2.svg?raw";
import zapSvg from "lucide-static/icons/zap.svg?raw";
import shieldSvg from "lucide-static/icons/shield-check.svg?raw";
import keySvg from "lucide-static/icons/key-round.svg?raw";
import chartSvg from "lucide-static/icons/bar-chart-3.svg?raw";
import globeSvg from "lucide-static/icons/globe.svg?raw";
import syringeSvg from "lucide-static/icons/syringe.svg?raw";
import globeLockSvg from "lucide-static/icons/globe-lock.svg?raw";
import flaskSvg from "lucide-static/icons/flask-conical.svg?raw";
import clapperboardSvg from "lucide-static/icons/clapperboard.svg?raw";
import languagesSvg from "lucide-static/icons/languages.svg?raw";
import serverSvg from "lucide-static/icons/server.svg?raw";
import arrowUpRightSvg from "lucide-static/icons/arrow-up-right.svg?raw";
import { Lucide } from "../components/lucide.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { HeroX } from "../components/hero-x.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";
import CorsDemo, { type CorsDemoI18n } from "../islands/cors-demo.js";

/**
 * Marketing landing page: paper canvas, brand-red (#FD0700) CTAs and marker
 * highlight, slate ink — the COR X palette (see app/styles/app.css). The layout
 * follows cloudflare.com: marker-highlighted hero word, a live mockup-browser
 * "try it" demo (rotating example URLs proxied in real time), feature grid and
 * a dark slate footer. Fully translated via the t() function (en/zh); served
 * at /, /zh, /en by app/routes/index.ts.
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
        <SiteHead
          title={t("landing.title")}
          description={t("landing.meta.description")}
          origin={props.origin}
        />
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
              <a href="#highlights" class="px-3 py-2 rounded-lg hover:bg-base-200">
                {t("site.highlights")}
              </a>
              <a href="#features" class="px-3 py-2 rounded-lg hover:bg-base-200">
                {t("site.features")}
              </a>
            </>
          }
        />

        <main class="flex-1">
          {/* Hero + live demo share one wrapper: the X panel is sticky inside it,
              so it stays on screen while you read the hero and try the demo,
              and only scrolls away when the Highlights section arrives. */}
          <div class="relative" data-hero-x-scope>
            {/* Desktop: sticky right-hand panel (bleeds a little past the grid). */}
            <div class="hidden lg:block pointer-events-none absolute inset-0 z-0">
              <div class="sticky top-24 h-[calc(100svh-8rem)] max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-end">
                <div class="relative w-[46%] max-w-[560px] aspect-[664/848] translate-x-[4%]">
                  <HeroX />
                </div>
              </div>
            </div>

            {/* Hero — copy on the left; slightly under a full viewport so the
                live demo peeks in above the fold. */}
            <section class="relative min-h-[calc(85svh-4rem)] flex items-center">
              <div class="relative max-w-6xl w-full mx-auto px-4 sm:px-6 py-16">
                <div class="text-center lg:text-left lg:max-w-[560px]">
                  <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] text-base-content">
                    {t("landing.hero.h1a")}
                    <br />
                    {t("landing.hero.h1b")}
                  </h1>
                  <p class="mx-auto lg:mx-0 mt-6 max-w-2xl text-base sm:text-lg text-base-content/75">
                    {t("landing.hero.sub")}
                  </p>
                  <div class="mt-8 flex flex-wrap items-center justify-center lg:justify-start gap-3">
                    <a href="#try-it" class="btn btn-primary btn-lg rounded-full! px-8">
                      {t("landing.hero.tryLive")}
                    </a>
                    <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                      {t("landing.hero.openConsole")}
                      <Lucide svg={arrowUpRightSvg} />
                    </a>
                  </div>
                  {/* The calling convention, made concrete and copy-friendly. */}
                  <p class="mt-8 text-sm text-base-content/75">
                    {t("landing.hero.prefix")}{" "}
                    <code class="break-all">{props.origin}/fetch?url=https://api.example.com</code>
                  </p>
                </div>
              </div>
            </section>

          {/* Live demo — full-viewport section so nothing below leaks. */}
          <section id="try-it" class="relative min-h-[calc(100svh-4rem)] flex items-center">
            <div class="relative max-w-6xl w-full mx-auto px-4 sm:px-6 py-16">
              {/* Same left column as the hero copy, so both screens share one
                  vertical alignment and the sticky X owns the right side. */}
              <div class="lg:max-w-[560px] text-center lg:text-left">
                <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.tryit.title")}</h2>
                <p class="mt-2 text-base-content/75">{t("landing.tryit.sub")}</p>
              </div>
              <div class="mt-8 lg:max-w-[560px]">
                <CorsDemo base={props.origin} i18n={demo} />
                <p class="mt-4 text-xs text-base-content/75 text-center lg:text-left leading-relaxed">
                  {t("landing.tryit.hint", { origin: props.origin })}
                </p>
              </div>
            </div>
          </section>
          </div>

          {/* Highlights — the differentiators, each with a real config snippet. */}
          <section id="highlights" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.highlights.title")}</h2>
              <p class="mt-2 text-base-content/75">{t("landing.highlights.sub")}</p>
            </div>
            <div class="grid md:grid-cols-3 gap-4">
              <Highlight
                icon={syringeSvg}
                title={t("landing.highlights.injection.title")}
                desc={t("landing.highlights.injection.desc")}
                code={["@api.vendor.com", "Authorization: Bearer ${TOKEN}"]}
              />
              <Highlight
                icon={globeLockSvg}
                title={t("landing.highlights.keyless.title")}
                desc={t("landing.highlights.keyless.desc")}
                code={["Origin: https://app.example", "→ key \u201cweb\u201d \u00b7 no key shipped"]}
              />
              <Highlight
                icon={flaskSvg}
                title={t("landing.highlights.playground.title")}
                desc={t("landing.highlights.playground.desc")}
                code={["200 · MISS · 143 ms", "x-corx-target: api.vendor.com"]}
              />
            </div>
          </section>

          {/* Features */}
          <section id="features" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.features.title")}</h2>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
              <Feature icon={linkSvg} title={t("landing.features.simple.title")} desc={t("landing.features.simple.desc")} />
              <Feature icon={zapSvg} title={t("landing.features.cached.title")} desc={t("landing.features.cached.desc")} />
              <Feature icon={shieldSvg} title={t("landing.features.ssrf.title")} desc={t("landing.features.ssrf.desc")} />
              <Feature icon={keySvg} title={t("landing.features.keys.title")} desc={t("landing.features.keys.desc")} />
              <Feature icon={chartSvg} title={t("landing.features.analytics.title")} desc={t("landing.features.analytics.desc")} />
              <Feature icon={globeSvg} title={t("landing.features.subdomain.title")} desc={t("landing.features.subdomain.desc")} />
              <Feature icon={clapperboardSvg} title={t("landing.features.streaming.title")} desc={t("landing.features.streaming.desc")} />
              <Feature icon={languagesSvg} title={t("landing.features.console.title")} desc={t("landing.features.console.desc")} />
              <Feature icon={serverSvg} title={t("landing.features.selfHosted.title")} desc={t("landing.features.selfHosted.desc")} />
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
    <div class="feature-item">
      <span class="feature-icon-sm">
        <Lucide svg={icon} />
      </span>
      <div class="min-w-0">
        <h3 class="font-semibold mb-1">{title}</h3>
        <p class="text-sm text-base-content/75 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/** Highlight card: the pitch plus a real (non-translated) config snippet. */
function Highlight({ icon, title, desc, code }: { icon: string; title: string; desc: string; code: string[] }) {
  return (
    <div class="highlight-card">
      <span class="feature-icon">
        <Lucide svg={icon} />
      </span>
      <h3 class="font-semibold">{title}</h3>
      <p class="text-sm text-base-content/75 leading-relaxed">{desc}</p>
      <div class="code-card mt-auto">
        <div class="code-head">
          <span class="size-2.5 rounded-full bg-error/80"></span>
          <span class="size-2.5 rounded-full bg-warning/80"></span>
          <span class="size-2.5 rounded-full bg-success/80"></span>
        </div>
        {code.map((line) => (
          <div class="code-line">{line}</div>
        ))}
      </div>
    </div>
  );
}

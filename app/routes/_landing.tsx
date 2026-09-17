import type { Child } from "hono/jsx";
import { HasIslands } from "honox/server";
import linkSvg from "lucide-static/icons/link-2.svg?raw";
import zapSvg from "lucide-static/icons/zap.svg?raw";
import shieldSvg from "lucide-static/icons/shield-check.svg?raw";
import eyeSvg from "lucide-static/icons/eye.svg?raw";
import keySvg from "lucide-static/icons/key-round.svg?raw";
import chartSvg from "lucide-static/icons/bar-chart-3.svg?raw";
import globeSvg from "lucide-static/icons/globe.svg?raw";
import syringeSvg from "lucide-static/icons/syringe.svg?raw";
import globeLockSvg from "lucide-static/icons/globe-lock.svg?raw";
import flaskSvg from "lucide-static/icons/flask-conical.svg?raw";
import clapperboardSvg from "lucide-static/icons/clapperboard.svg?raw";
import languagesSvg from "lucide-static/icons/languages.svg?raw";
import serverSvg from "lucide-static/icons/server.svg?raw";
import layoutDashboardSvg from "lucide-static/icons/layout-dashboard.svg?raw";
import fileTextSvg from "lucide-static/icons/file-text.svg?raw";
import bookOpenTextSvg from "lucide-static/icons/book-open-text.svg?raw";
import arrowUpRightSvg from "lucide-static/icons/arrow-up-right.svg?raw";
import chevronDownSvg from "lucide-static/icons/chevron-down.svg?raw";
import { Lucide } from "../components/lucide.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { HeroX } from "../components/hero-x.js";
import { GITHUB_URL } from "../lib/site-info.js";
import { COMPARISONS } from "../lib/compare.js";
import { DEMO_ECHO_PATH } from "../lib/demo.js";
import { landingAlternates, landingJsonLd, OG_IMAGE, type Faq } from "../lib/seo.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";
import CorsDemo, { type CorsDemoI18n } from "../islands/cors-demo.js";
import CopyButton from "../islands/copy-button.js";

/**
 * Marketing landing page: paper canvas, brand-red (#FD0700) CTAs and marker
 * highlight, slate ink — the COR X palette (see app/styles/app.css). The layout
 * follows cloudflare.com: marker-highlighted hero word, a live mockup-browser
 * "try it" demo (rotating example URLs proxied in real time), feature grid and
 * a dark slate footer. Fully translated via the t() function (en/zh); served
 * at /, /zh, /en by app/routes/index.ts.
 */
export function LandingPage(props: {
  host: string;
  origin: string;
  /** Request path ("/", "/zh", "/en") — the canonical needs it, since the
      auto-detecting root must not canonicalise to a specific language. */
  path: string;
  locale: Locale;
  t: TFunc;
  /** The public tier key + its daily caps, when this instance has one. */
  publicKey?: { key: string; perOrigin: number | null; perHost: number | null; total: number | null };
  /** The injection-demo key, when this instance has one configured (app/lib/demo.ts). */
  demo?: { key: string };
}) {
  const { t } = props;
  // One source for both the visible FAQ and its JSON-LD: schema that disagrees
  // with the page is worse than no schema at all.
  const faq: Faq[] = [
    { q: t("landing.faq.q1"), a: t("landing.faq.a1") },
    { q: t("landing.faq.q2"), a: t("landing.faq.a2") },
    { q: t("landing.faq.q3"), a: t("landing.faq.a3") },
    { q: t("landing.faq.q4"), a: t("landing.faq.a4") },
    { q: t("landing.faq.q5"), a: t("landing.faq.a5") },
    { q: t("landing.faq.q6"), a: t("landing.faq.a6") },
    { q: t("landing.faq.q7"), a: t("landing.faq.a7") },
    { q: t("landing.faq.q8"), a: t("landing.faq.a8") },
  ];
  const features = [
    t("landing.features.simple.title"),
    t("landing.features.cached.title"),
    t("landing.features.ssrf.title"),
    t("landing.features.keys.title"),
    t("landing.features.analytics.title"),
    t("landing.features.subdomain.title"),
    t("landing.features.streaming.title"),
    t("landing.features.console.title"),
    t("landing.features.selfHosted.title"),
  ];
  // The agent entry's prompt: absolute, because it is meant to be pasted into
  // a tool that has no idea which host this page came from.
  const agentPrompt = t("landing.agents.prompt", { origin: props.origin });
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
    tabPreview: t("corsDemo.tabPreview"),
    tabRaw: t("corsDemo.tabRaw"),
    tabHeaders: t("corsDemo.tabHeaders"),
    injectBtn: t("corsDemo.injectBtn"),
    injectNote: t("corsDemo.injectNote"),
    injectBadge: t("corsDemo.injectBadge"),
    openRaw: t("preview.openRaw"),
    imageAlt: t("preview.imageAlt"),
    mediaHint: t("preview.mediaHint"),
    frameHint: t("preview.frameHint"),
    frameBlocked: t("preview.frameBlocked"),
    frameBlockHint: t("preview.frameBlockHint"),
    frameBlockDoc: t("preview.frameBlockDoc"),
    binary: t("preview.binary"),
    array: t("preview.array"),
    object: t("preview.object"),
  };
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead
          title={t("landing.title")}
          description={t("landing.meta.description")}
          origin={props.origin}
          // /zh and /en are real, linkable documents that canonicalise to
          // themselves; / is the x-default entry point and stays /.
          canonical={props.path === "/" ? "/" : props.locale === "zh" ? "/zh" : "/en"}
          alternates={landingAlternates(props.origin)}
          locale={props.locale}
          image={{ ...OG_IMAGE, alt: t("site.ogAlt") }}
          structuredData={landingJsonLd({
            origin: props.origin,
            locale: props.locale,
            description: t("landing.meta.description"),
            faq,
            features,
          })}
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
              <a href="#try-it" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
                {t("site.tryIt")}
              </a>
              {props.publicKey ? (
                <a href="#public-key" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
                  {t("site.publicKey")}
                </a>
              ) : null}
              <a href="#highlights" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
                {t("site.highlights")}
              </a>
              <a href="#features" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
                {t("site.features")}
              </a>
              {/* The usage page, not an anchor: the one nav link that leaves
                  the landing (the hero stays free of it on purpose). */}
              <a href="/docs" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
                {t("site.docs")}
              </a>
              <a href="#faq" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
                {t("site.faq")}
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
                  {/* Trust pointer first: a visitor deciding whether to paste a
                      URL into the demo should learn, before they reach the CTAs,
                      that a proxy is a man in the middle and that self-hosting is
                      the honest answer — the #trust band below spells it out. A
                      callout link, not a warning box, so the hero stays a hero. */}
                  <p class="mt-6">
                    <a
                      href="#trust"
                      class="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-box border border-base-300 bg-base-200/60 px-3 py-2 text-sm text-base-content/75 no-underline transition hover:border-primary/40 hover:bg-base-200"
                    >
                      {/* Icon and note are one flex item on purpose: as separate
                          items the note's max-content width pushes the icon onto
                          its own line as soon as the pill wraps. */}
                      <span class="inline-flex items-start gap-2">
                        <Lucide svg={eyeSvg} class="mt-0.5" />
                        <span>{t("landing.hero.trustNote")}</span>
                      </span>
                      <span class="font-medium text-primary">{t("landing.hero.trustCta")}</span>
                    </a>
                  </p>
                  <div class="mt-6 flex flex-wrap items-center justify-center lg:justify-start gap-3">
                    <a href="#try-it" class="btn btn-primary btn-lg rounded-full! px-8">
                      {t("landing.hero.tryLive")}
                    </a>
                    <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                      {t("landing.hero.openConsole")}
                      <Lucide svg={arrowUpRightSvg} />
                    </a>
                  </div>
                  {/* Start-here row: the calling convention made concrete,
                      with the no-deploy shortcut beside it, grouped so the hero
                      ends on "how to call it" rather than three loose lines. */}
                  <p class="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-sm text-base-content/75 lg:justify-start">
                    <span>
                      {t("landing.hero.prefix")}{" "}
                      <code class="break-all">{props.origin}/fetch?url=https://api.example.com</code>
                    </span>
                    {props.publicKey ? (
                      <a href="#public-key" class="link link-primary no-underline hover:underline">
                        {t("landing.hero.noDeploy")}
                      </a>
                    ) : null}
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
                <CorsDemo
                  base={props.origin}
                  i18n={demo}
                  demo={props.demo ? { key: props.demo.key, target: `${props.origin}${DEMO_ECHO_PATH}` } : undefined}
                />
                <p class="mt-4 text-xs text-base-content/75 text-center lg:text-left leading-relaxed">
                  {t("landing.tryit.hint", { origin: props.origin })}
                </p>
              </div>
            </div>
          </section>
          </div>

          {/* Public key: the no-deploy path for people who just want to fetch
              a URL cross-origin, with the limits stated up front. */}
          {props.publicKey ? <PublicKeyCard origin={props.origin} pub={props.publicKey} t={t} /> : null}

          {/* Agent entry: this instance already publishes llms.txt and
              llms-full.txt (app/lib/seo.ts); this band is where a *human* finds
              out. Both files are generated per host, so the links are relative
              and always address the reader's own copy — a self-hosted
              deployment advertises itself here, never this project's domain.
              The machine-discoverable halves of the same offer are the
              <link rel="alternate"> in SiteHead and the footer link.

              It sits directly under the public-key card because the two are
              the same kind of thing — an entry point you can act on without
              deploying anything: the key for a human's frontend, the llms
              files for an agent. That also keeps the closing sequence intact
              (FAQ → CTA), which a machine-facing band was interrupting. The
              card is conditional, so without `PUBLIC_KEY` the band simply
              follows the live demo instead. */}
          <section
            id="agents"
            class={`max-w-6xl mx-auto px-4 sm:px-6 pb-20 ${props.publicKey ? "pt-0" : "pt-20"}`}
          >
            <div class="text-center">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.agents.title")}</h2>
              <p class="mx-auto mt-2 max-w-2xl text-base-content/75">{t("landing.agents.sub")}</p>
            </div>
            <div class="mx-auto mt-8 max-w-3xl rounded-box border border-base-300 bg-base-100 p-5">
              <div class="grid gap-3 sm:grid-cols-2">
                <a href="/llms.txt" class="agent-file">
                  <span class="feature-icon-sm">
                    <Lucide svg={fileTextSvg} />
                  </span>
                  <span class="min-w-0">
                    <span class="block font-mono text-sm font-semibold">/llms.txt</span>
                    <span class="mt-1 block text-xs leading-relaxed text-base-content/75">
                      {t("landing.agents.indexDesc")}
                    </span>
                  </span>
                </a>
                <a href="/llms-full.txt" class="agent-file">
                  <span class="feature-icon-sm">
                    <Lucide svg={bookOpenTextSvg} />
                  </span>
                  <span class="min-w-0">
                    <span class="block font-mono text-sm font-semibold">/llms-full.txt</span>
                    <span class="mt-1 block text-xs leading-relaxed text-base-content/75">
                      {t("landing.agents.fullDesc")}
                    </span>
                  </span>
                </a>
              </div>

              {/* Same terminal card as the highlights/public-key cards, so the
                  prompt reads as something to copy rather than prose. */}
              <div class="mt-6 text-xs font-medium uppercase tracking-wide text-base-content/75">
                {t("landing.agents.promptLabel")}
              </div>
              <div class="code-card mt-2">
                <div class="code-head">
                  <span class="size-2.5 rounded-full bg-error/80"></span>
                  <span class="size-2.5 rounded-full bg-warning/80"></span>
                  <span class="size-2.5 rounded-full bg-success/80"></span>
                </div>
                <div class="code-line wrap">{agentPrompt}</div>
              </div>

              <div class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                <p class="text-xs leading-relaxed text-base-content/75">
                  {t("landing.agents.more")}{" "}
                  <a href="/robots.txt" class="link link-primary">
                    robots.txt
                  </a>
                  {" · "}
                  <a href="/sitemap.xml" class="link link-primary">
                    sitemap.xml
                  </a>
                </p>
                <CopyButton text={agentPrompt} labels={{ copy: t("copy.copy"), copied: t("copy.copied") }} />
              </div>
            </div>
          </section>

          {/* Highlights — the differentiators, each with a real config snippet. */}
          <section id="highlights" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.highlights.title")}</h2>
              <p class="mt-2 text-base-content/75">{t("landing.highlights.sub")}</p>
            </div>
            <div class="grid sm:grid-cols-2 gap-4">
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
              {/* The umbrella highlight: the other three are capabilities, this
                  is the product they live in — and the reason a self-hosted
                  copy feels like a service rather than a route. */}
              <Highlight
                icon={layoutDashboardSvg}
                title={t("landing.highlights.console.title")}
                desc={t("landing.highlights.console.desc")}
                code={["Keys · Logs · Analytics · Playground", "rate 120/min · origins https://app.example"]}
              />
            </div>
          </section>

          {/* Trust — the trade-off a proxy forces on the reader, stated plainly
              instead of buried in the terms. It sits after the differentiators
              because "who sees my traffic?" is the next question once the
              feature list has landed; the answer is self-hosting, which is why
              the self-host card is the one with the primary border. */}
          <section id="trust" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.trust.title")}</h2>
              <p class="mx-auto mt-2 max-w-2xl text-base-content/75">{t("landing.trust.sub")}</p>
            </div>
            <div class="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
              <div class="highlight-card">
                <span class="feature-icon">
                  <Lucide svg={eyeSvg} />
                </span>
                <h3 class="font-semibold">{t("landing.trust.hosted.title")}</h3>
                <p class="text-sm text-base-content/75 leading-relaxed">{t("landing.trust.hosted.desc")}</p>
              </div>
              <div class="highlight-card border-primary/50!">
                <span class="feature-icon">
                  <Lucide svg={serverSvg} />
                </span>
                <h3 class="font-semibold">{t("landing.trust.self.title")}</h3>
                <p class="text-sm text-base-content/75 leading-relaxed">{t("landing.trust.self.desc")}</p>
                <a href={GITHUB_URL} class="btn btn-sm btn-outline rounded-full! mt-auto self-start">
                  {t("landing.trust.self.cta")}
                  <Lucide svg={arrowUpRightSvg} />
                </a>
              </div>
            </div>
            <p class="mx-auto mt-4 max-w-3xl text-center text-xs leading-relaxed text-base-content/75">
              {t("landing.trust.note")}
            </p>
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

          {/* FAQ — the middle of the funnel: the objections (quotas, privacy,
              self-hosting) answered in the open, in copy short enough that an
              answer engine can quote it. Same strings feed the FAQPage JSON-LD. */}
          <section id="faq" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.faq.title")}</h2>
              <p class="mt-2 text-base-content/75">{t("landing.faq.sub")}</p>
            </div>
            <div class="mx-auto max-w-3xl">
              {faq.map((item, i) => (
                <details class="faq-item" open={i === 0}>
                  <summary class="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                    <h3 class="text-base font-semibold">{item.q}</h3>
                    <span class="faq-chevron text-base-content/75">
                      <Lucide svg={chevronDownSvg} />
                    </span>
                  </summary>
                  <p class="pb-5 pr-8 text-sm leading-relaxed text-base-content/75">{item.a}</p>
                </details>
              ))}
            </div>
            {/* The comparison pages are long-tail entry points: linked from the
                FAQ, where the question is actually asked ("how is this different
                from X"), never from the nav or the hero. */}
            <p class="mx-auto mt-6 max-w-3xl text-sm text-base-content/75">
              {t("landing.faq.compare")}{" "}
              {COMPARISONS.map((c, i) => (
                <span>
                  {i > 0 ? " · " : ""}
                  <a href={`/compare/${c.slug}`} class="link link-primary">
                    {c.name}
                  </a>
                </span>
              ))}
            </p>
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

/**
 * The no-deploy path: the shared public key, its usage, and the daily caps it
 * is subject to. The remind-at-copy step lives here — a link to /terms sits
 * directly under the copy button, not behind a click-through gate (a gate a
 * `curl` user never sees would be theatre, not consent).
 */
function PublicKeyCard(props: {
  origin: string;
  pub: { key: string; perOrigin: number | null; perHost: number | null; total: number | null };
  t: TFunc;
}) {
  const { t, pub } = props;
  const limits: Array<[string, number | null]> = [
    [t("landing.publicKey.limitOrigin"), pub.perOrigin],
    [t("landing.publicKey.limitHost"), pub.perHost],
    [t("landing.publicKey.limitTotal"), pub.total],
  ];
  const usage = `fetch("${props.origin}/fetch?url=" + encodeURIComponent(url) + "&corx-key=" + KEY)`;
  return (
    <section id="public-key" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
      <div class="text-center">
        <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">{t("landing.publicKey.title")}</h2>
        <p class="mx-auto mt-2 max-w-2xl text-base-content/75">{t("landing.publicKey.sub")}</p>
      </div>
      <div class="mx-auto mt-8 max-w-3xl rounded-box border border-base-300 bg-base-100 p-5">
        <div class="text-xs font-medium uppercase tracking-wide text-base-content/75">
          {t("landing.publicKey.keyLabel")}
        </div>
        <div class="mt-2 flex items-center gap-2">
          {/* Fixed 32px (= `btn-sm`) so the chip lines up with the copy button.
              A plain <span>, not <code>: the global `code:not(pre code)` pill
              rule outranks these utilities and would decide the height. */}
          <span
            title={pub.key}
            class="flex h-8 min-w-0 flex-1 items-center rounded-box border border-base-300 bg-base-200 px-3 font-mono text-xs"
          >
            <span class="truncate">{pub.key}</span>
          </span>
          <CopyButton text={pub.key} labels={{ copy: t("copy.copy"), copied: t("copy.copied") }} />
        </div>
        {/* The reminder sits with the copy action on purpose. */}
        <p class="mt-3 text-xs leading-relaxed text-base-content/75">
          {t("landing.publicKey.copyNoteA")}{" "}
          <a href="/terms" class="link link-primary">
            {t("landing.publicKey.termsLink")}
          </a>{" "}
          {t("landing.publicKey.copyNoteB")}
        </p>

        <div class="mt-6 text-xs font-medium uppercase tracking-wide text-base-content/75">
          {t("landing.publicKey.usageLabel")}
        </div>
        <div class="code-card mt-2">
          <div class="code-head">
            <span class="size-2.5 rounded-full bg-error/80"></span>
            <span class="size-2.5 rounded-full bg-warning/80"></span>
            <span class="size-2.5 rounded-full bg-success/80"></span>
          </div>
          <div class="code-line">{usage}</div>
        </div>

        <div class="mt-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t border-base-300 pt-4">
          <span class="text-xs font-medium uppercase tracking-wide text-base-content/75">
            {t("landing.publicKey.limitsTitle")}
          </span>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {limits.map(([label, n]) =>
              n != null ? (
                <span class="text-base-content/75">
                  {label}{" "}
                  <b class="text-base-content tabular-nums">{t("landing.publicKey.perDay", { n })}</b>
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
    </section>
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

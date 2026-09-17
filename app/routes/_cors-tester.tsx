import type { Handler } from "hono";
import { HasIslands } from "honox/server";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { detectLocale, isLocale, makeT, type Locale, type TFunc } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { Section } from "../components/prose.js";
import { OG_IMAGE, corsTesterAlternates, corsTesterJsonLd } from "../lib/seo.js";
import { REPO_DOCS } from "../lib/site-info.js";
import CorsTesterIsland, { type CorsTesterI18n } from "../islands/cors-tester.js";
import type { ResponsePreviewI18n } from "../components/response-preview.js";

/**
 * /tools/cors-tester — the public, account-free diagnosis tool (#54).
 *
 * "cors tester" / "cors check" is a query the hosted proxies mine and CORX's
 * playground is behind a login, so the people typing it get nothing from us.
 * The page runs the probes from the visitor's browser (the only place a CORS
 * verdict is real), infers what is missing, runs the URL through this instance
 * and hands back the call to paste.
 *
 * Served at /tools/cors-tester (auto-detected language, the x-default URL),
 * /en/tools/cors-tester and /zh/tools/cors-tester — the hreflang cluster the
 * sitemap declares. The three thin route files call `corsTesterHandler`.
 */
export function corsTesterHandler(
  locale?: Locale,
): Handler<{ Bindings: Env; Variables: ProxyVariables }> {
  return async (c) => {
    const reqUrl = new URL(c.req.url);
    // Subdomain mode (and ?url=) turn every path into a proxy path, the tool
    // included — same guard as the landing, /docs, /snippets and /compare.
    try {
      if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
    } catch {
      return proxyHandler(c); // malformed target -> the proxy's precise 4xx
    }

    // ?lang= is the switch for URLs with no language prefix: it remembers the
    // choice and moves to the prefixed document, which is the canonical one.
    const asked = reqUrl.searchParams.get("lang");
    if (isLocale(asked)) {
      setLangCookie(c, asked);
      return c.redirect(`/${asked}/tools/cors-tester`, 302);
    }

    const lang =
      locale ??
      detectLocale({
        pathname: reqUrl.pathname,
        cookie: c.req.header("cookie"),
        acceptLanguage: c.req.header("accept-language"),
      });
    // An explicit /en/ or /zh/ URL is a language *choice*, not just this page's
    // language — remember it, the way the landing and /docs do.
    if (locale) setLangCookie(c, lang);

    // Language-dependent (URL prefix > cookie > Accept-Language), so no shared
    // caching; the canonical is the URL prefix this request came in through.
    c.header("Cache-Control", "private, max-age=0, must-revalidate");
    c.header("Vary", "Accept-Language, Cookie");
    const canonical = `${locale ? `/${locale}` : ""}/tools/cors-tester`;
    return c.html(
      `<!DOCTYPE html>${CorsTesterPage({
        origin: `${reqUrl.protocol}//${reqUrl.host}`,
        canonical,
        locale: lang,
        t: makeT(lang),
        // The public key, when the instance publishes one: it is public by
        // design, and inlining it is what makes the browser snippet runnable.
        publicKey: (c.env.PUBLIC_KEY ?? "").trim() || undefined,
      })}`,
    );
  };
}

export function CorsTesterPage(props: {
  origin: string;
  /** The canonical path for this document. */
  canonical: string;
  locale: Locale;
  t: TFunc;
  /** Raw PUBLIC_KEY of this deployment, when configured. */
  publicKey?: string;
}) {
  const { t } = props;
  const title = t("corsTester.title");
  const description = t("corsTester.lead");
  const i18n: CorsTesterI18n = {
    urlAria: t("corsTester.island.urlAria"),
    urlPh: t("corsTester.island.urlPh"),
    run: t("corsTester.island.run"),
    running: t("corsTester.island.running"),
    invalid: {
      empty: t("corsTester.invalid.empty"),
      invalid: t("corsTester.invalid.invalid"),
      scheme: t("corsTester.invalid.scheme"),
      self: t("corsTester.invalid.self"),
    },
    allowOrigin: t("corsTester.result.allowOrigin"),
    allowCredentials: t("corsTester.result.allowCredentials"),
    none: t("corsTester.result.none"),
    probe: {
      title: t("corsTester.probe.title"),
      cors: t("corsTester.probe.cors"),
      opaque: t("corsTester.probe.opaque"),
      credentials: t("corsTester.probe.credentials"),
      preflight: t("corsTester.probe.preflight"),
      pass: t("corsTester.probe.pass"),
      fail: t("corsTester.probe.fail"),
      skip: t("corsTester.probe.skip"),
    },
    finding: {
      ok: { title: t("corsTester.finding.ok.title"), body: t("corsTester.finding.ok.body") },
      "missing-allow-origin": {
        title: t("corsTester.finding.missing-allow-origin.title"),
        body: t("corsTester.finding.missing-allow-origin.body"),
      },
      unreachable: {
        title: t("corsTester.finding.unreachable.title"),
        body: t("corsTester.finding.unreachable.body"),
      },
      "mixed-content": {
        title: t("corsTester.finding.mixed-content.title"),
        body: t("corsTester.finding.mixed-content.body"),
      },
      credentials: {
        title: t("corsTester.finding.credentials.title"),
        body: t("corsTester.finding.credentials.body"),
      },
      preflight: {
        title: t("corsTester.finding.preflight.title"),
        body: t("corsTester.finding.preflight.body"),
      },
      framing: { title: t("corsTester.finding.framing.title"), body: t("corsTester.finding.framing.body") },
    },
    proxied: {
      title: t("corsTester.proxied.title"),
      note: t("corsTester.proxied.note"),
      failed: t("corsTester.proxied.failed"),
    },
    fix: {
      title: t("corsTester.fix.title"),
      lead: t("corsTester.fix.lead"),
      proxyUrl: t("corsTester.fix.proxyUrl"),
      browser: t("corsTester.fix.browser"),
      server: t("corsTester.fix.server"),
    },
    copy: t("copy.copy"),
    copied: t("copy.copied"),
    note: t("corsTester.island.note"),
  };
  const preview: ResponsePreviewI18n = {
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
          title={`${title} — CORX`}
          description={description}
          origin={props.origin}
          canonical={props.canonical}
          alternates={corsTesterAlternates(props.origin)}
          locale={props.locale}
          image={{ ...OG_IMAGE, alt: t("site.ogAlt") }}
          structuredData={corsTesterJsonLd({
            origin: props.origin,
            locale: props.locale,
            path: props.canonical,
            title,
            description,
          })}
        />
        {/* Island hydration entry (the tester below needs it). */}
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
          langLinks={{ zh: "/zh/tools/cors-tester", en: "/en/tools/cors-tester" }}
          links={
            <a href="/" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
              {t("corsTester.back")}
            </a>
          }
        />
        <main class="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
          <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{description}</p>

          <div class="mt-6">
            <CorsTesterIsland base={props.origin} publicKey={props.publicKey} i18n={i18n} preview={preview} />
          </div>

          <Section id="how" title={t("corsTester.how.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("corsTester.how.body")}</p>
          </Section>

          <Section id="frames" title={t("corsTester.frames.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("corsTester.frames.body")}</p>
            <p class="mt-3 text-sm">
              <a
                href={`${REPO_DOCS.readme}#embed-a-page-that-refuses-framing`}
                target="_blank"
                rel="noopener noreferrer"
                class="link link-primary"
              >
                {t("corsTester.frames.link")}
              </a>
            </p>
          </Section>

          <Section id="more" title={t("corsTester.more.title")}>
            <p class="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a href="/docs#auth" class="link link-primary">
                {t("corsTester.docs.auth")}
              </a>
              <a href="/snippets" class="link link-primary">
                {t("corsTester.docs.snippets")}
              </a>
            </p>
          </Section>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

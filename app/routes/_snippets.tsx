import type { Handler } from "hono";
import { HasIslands } from "honox/server";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { detectLocale, isLocale, makeT, type Locale, type TFunc } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { Section, SubSection } from "../components/prose.js";
import { OG_IMAGE, snippetsAlternates, snippetsJsonLd } from "../lib/seo.js";
import { CONTENT_UPDATED } from "../lib/site-info.js";
import { SNIPPET_GROUPS, snippetsOf } from "../lib/snippets.js";
import CopyButton, { type CopyButtonLabels } from "../islands/copy-button.js";

/**
 * /snippets — copy-paste code for the frameworks and platforms people actually
 * arrive from.
 *
 * The issue behind it (#50): CORX's differentiator — the upstream key never
 * reaches the browser — is the first problem a React/Vite/Next user hits, and
 * both competitors publish per-framework guides. This page answers that with
 * real snippets plus the two rules that keep a key server-side (keyless grant,
 * server route), and it is honest about when the public tier is enough.
 *
 * Code lives in app/lib/snippets.ts and is built against the requesting
 * deployment's origin; prose lives in app/lib/i18n/messages.ts.
 *
 * Served at /snippets (auto-detected language, the x-default URL), /en/snippets
 * and /zh/snippets — the hreflang cluster the sitemap declares. The three thin
 * route files call `snippetsHandler` below.
 */
export function snippetsHandler(
  locale?: Locale,
): Handler<{ Bindings: Env; Variables: ProxyVariables }> {
  return async (c) => {
    const reqUrl = new URL(c.req.url);
    // Subdomain mode (and ?url=) turn every path into a proxy path, /en/snippets
    // included — same guard as the landing, /docs and /compare.
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
      return c.redirect(`/${asked}/snippets`, 302);
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
    const canonical = `${locale ? `/${locale}` : ""}/snippets`;
    return c.html(
      `<!DOCTYPE html>${SnippetsPage({
        origin: `${reqUrl.protocol}//${reqUrl.host}`,
        canonical,
        locale: lang,
        t: makeT(lang),
        // Whether this instance actually publishes a public key. Only used to
        // decide if the "Get the public key" link leads anywhere — no D1 read
        // (the landing page owns the "is the key real" check).
        publicKey: (c.env.PUBLIC_KEY ?? "").trim() !== "",
      })}`,
    );
  };
}

export function SnippetsPage(props: {
  origin: string;
  /** The canonical path for this document ("/snippets", "/en/snippets", …). */
  canonical: string;
  locale: Locale;
  t: TFunc;
  /** True when this deployment has a PUBLIC_KEY configured. */
  publicKey?: boolean;
}) {
  const { t } = props;
  const title = t("snippets.title");
  const description = t("snippets.lead", { origin: props.origin });
  const copyLabels: CopyButtonLabels = { copy: t("copy.copy"), copied: t("copy.copied") };
  const sections = [
    ...SNIPPET_GROUPS.map((id) => ({ id, label: t(`snippets.toc.${id}`) })),
    { id: "risk", label: t("snippets.toc.risk") },
    { id: "platforms", label: t("snippets.toc.platforms") },
    { id: "public", label: t("snippets.toc.public") },
  ];
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead
          title={`${title} — CORX`}
          description={description}
          origin={props.origin}
          canonical={props.canonical}
          alternates={snippetsAlternates(props.origin)}
          locale={props.locale}
          image={{ ...OG_IMAGE, alt: t("site.ogAlt") }}
          structuredData={snippetsJsonLd({
            origin: props.origin,
            locale: props.locale,
            path: props.canonical,
            title,
            description,
          })}
        />
        {/* Island hydration entry (the CopyButton islands below need it). */}
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
          langLinks={{ zh: "/zh/snippets", en: "/en/snippets" }}
          links={
            <a href="/" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
              {t("snippets.back")}
            </a>
          }
        />
        <main class="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
          <p class="mt-2 text-xs text-base-content/75">{t("snippets.updated", { date: CONTENT_UPDATED })}</p>
          <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{description}</p>

          <nav aria-label={t("snippets.toc.aria")} class="mt-6 flex flex-wrap gap-2 text-xs">
            {sections.map((s) => (
              <a href={`#${s.id}`} class="rounded-full border border-base-300 px-3 py-1 hover:bg-base-200">
                {s.label}
              </a>
            ))}
          </nav>

          {SNIPPET_GROUPS.map((group) => (
            <Section id={group} title={t(`snippets.group.${group}.title`)}>
              <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t(`snippets.group.${group}.lead`)}</p>
              {snippetsOf(group).map((snippet) => {
                const code = snippet.code(props.origin);
                return (
                  <div class="mt-4 rounded-box border border-base-300 p-4">
                    <div class="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 class="text-sm font-semibold">{t(snippet.titleKey)}</h3>
                      <span class="rounded-full border border-base-300 px-2 py-0.5 font-mono text-[10px] text-base-content/75">
                        {snippet.lang}
                      </span>
                    </div>
                    <p class="mt-1 text-sm text-base-content/75 leading-relaxed">{t(snippet.descKey)}</p>
                    <div class="mt-3 flex items-start gap-2">
                      <pre class="min-w-0 flex-1 overflow-x-auto rounded-box bg-base-200 px-3 py-2 text-xs leading-relaxed">
                        <code>{code}</code>
                      </pre>
                      <CopyButton text={code} labels={copyLabels} />
                    </div>
                  </div>
                );
              })}
            </Section>
          ))}

          <Section id="risk" title={t("snippets.risk.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("snippets.risk.body")}</p>
            <p class="mt-3 text-sm">
              <a href="/docs#auth" class="link link-primary">
                {t("snippets.risk.docs")}
              </a>
            </p>
          </Section>

          <Section id="platforms" title={t("snippets.platforms.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("snippets.platforms.lead")}</p>
            <SubSection title="Cloudflare Pages" body={t("snippets.platforms.pages")} />
            <SubSection title="Vercel" body={t("snippets.platforms.vercel")} />
            <SubSection title="Netlify" body={t("snippets.platforms.netlify")} />
          </Section>

          <Section id="public" title={t("snippets.public.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("snippets.public.body")}</p>
            <p class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {props.publicKey && (
                <a href="/#public-key" class="link link-primary">
                  {t("snippets.public.landing")}
                </a>
              )}
              <a href="/docs#selfhost" class="link link-primary">
                {t("snippets.public.selfhost")}
              </a>
            </p>
          </Section>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

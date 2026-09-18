import type { Handler } from "hono";
import { HasIslands } from "honox/server";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { detectLocale, isLocale, makeT, type Locale, type TFunc } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { OG_IMAGE, docsAlternates, docsJsonLd } from "../lib/seo.js";
import { CONTENT_UPDATED, REPO_DOCS } from "../lib/site-info.js";
import { DOCS_INJECTION_HOSTS, DOCS_INJECTION_RULES, DOCS_INJECTION_VARS, DOCS_KEY_FORMS, DOCS_PARAMS, DOCS_SHAPES, docsShapeExample } from "../lib/docs.js";
import CopyButton, { type CopyButtonLabels } from "../islands/copy-button.js";
import { Section, SubSection } from "../components/prose.js";

/**
 * /docs — the human-readable usage page.
 *
 * The counterpart to the machine-facing files: llms.txt / llms-full.txt give an
 * answer engine the instance in one fetch, and this page gives a person the
 * same facts with copyable examples — the four call shapes, the corx-* table,
 * the auth tiers, caching, limits, security and self-hosting. Facts that can
 * drift from the code (the shapes and the parameter table) render from
 * app/lib/docs.ts; the prose lives in app/lib/i18n/messages.ts.
 *
 * Served at /docs (auto-detected language, the x-default URL), /en/docs and
 * /zh/docs — the hreflang cluster the sitemap declares. The three thin route
 * files call `docsHandler` below.
 */
export function docsHandler(locale?: Locale): Handler<{ Bindings: Env; Variables: ProxyVariables }> {
  return async (c) => {
    const reqUrl = new URL(c.req.url);
    // Subdomain mode (and ?url=) turn every path into a proxy path, /en/docs
    // included — same guard as the landing and the comparison pages.
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
      return c.redirect(`/${asked}/docs`, 302);
    }

    const lang =
      locale ??
      detectLocale({
        pathname: reqUrl.pathname,
        cookie: c.req.header("cookie"),
        acceptLanguage: c.req.header("accept-language"),
      });
    // An explicit /en/ or /zh/ URL is a language *choice*, not just this page's
    // language — remember it, the way the landing and /compare do.
    if (locale) setLangCookie(c, lang);

    // Language-dependent (URL prefix > cookie > Accept-Language), so no shared
    // caching; the canonical is the URL prefix this request came in through.
    c.header("Cache-Control", "private, max-age=0, must-revalidate");
    c.header("Vary", "Accept-Language, Cookie");
    const canonical = `${locale ? `/${locale}` : ""}/docs`;
    return c.html(
      `<!DOCTYPE html>${DocsPage({
        origin: `${reqUrl.protocol}//${reqUrl.host}`,
        canonical,
        locale: lang,
        t: makeT(lang),
      })}`,
    );
  };
}

export function DocsPage(props: {
  origin: string;
  /** The canonical path for this document ("/docs", "/en/docs", "/zh/docs"). */
  canonical: string;
  locale: Locale;
  t: TFunc;
}) {
  const { t } = props;
  const title = t("docs.title");
  const description = t("docs.lead", { origin: props.origin });
  const copyLabels: CopyButtonLabels = { copy: t("copy.copy"), copied: t("copy.copied") };
  const sections = [
    { id: "call", label: t("docs.toc.call") },
    { id: "params", label: t("docs.toc.params") },
    { id: "auth", label: t("docs.toc.auth") },
    { id: "upstream", label: t("docs.toc.upstream") },
    { id: "caching", label: t("docs.toc.caching") },
    { id: "limits", label: t("docs.toc.limits") },
    { id: "security", label: t("docs.toc.security") },
    { id: "selfhost", label: t("docs.toc.selfhost") },
  ];
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead
          title={`${title} — CORX`}
          description={description}
          origin={props.origin}
          canonical={props.canonical}
          alternates={docsAlternates(props.origin)}
          locale={props.locale}
          image={{ ...OG_IMAGE, alt: t("site.ogAlt") }}
          structuredData={docsJsonLd({
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
          langLinks={{ zh: "/zh/docs", en: "/en/docs" }}
          links={
            <a href="/" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
              {t("docs.back")}
            </a>
          }
        />
        <main class="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-12">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
          <p class="mt-2 text-xs text-base-content/75">{t("docs.updated", { date: CONTENT_UPDATED })}</p>
          <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{description}</p>

          {/* The page is long; the anchors are the reader's index. */}
          <nav aria-label={t("docs.toc.aria")} class="mt-6 flex flex-wrap gap-2 text-xs">
            {sections.map((s) => (
              <a href={`#${s.id}`} class="rounded-full border border-base-300 px-3 py-1 hover:bg-base-200">
                {s.label}
              </a>
            ))}
          </nav>

          <Section id="call" title={t("docs.call.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.call.lead")}</p>
            {DOCS_SHAPES.map((id) => {
              const example = docsShapeExample(props.origin, id);
              return (
                <div class="mt-4 rounded-box border border-base-300 p-4">
                  <h3 class="text-sm font-semibold">{t(`docs.call.${id}.title`)}</h3>
                  <p class="mt-1 text-sm text-base-content/75 leading-relaxed">{t(`docs.call.${id}.desc`)}</p>
                  <div class="mt-3 flex items-start gap-2">
                    <pre class="min-w-0 flex-1 overflow-x-auto rounded-box bg-base-200 px-3 py-2 text-xs leading-relaxed">
                      <code>{example}</code>
                    </pre>
                    <CopyButton text={example} labels={copyLabels} />
                  </div>
                </div>
              );
            })}
            <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{t("docs.call.note")}</p>
            <p class="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a href="/snippets" class="link link-primary">
                {t("docs.call.snippets")}
              </a>
              <a href="/tools/cors-tester" class="link link-primary">
                {t("docs.call.tester")}
              </a>
            </p>
          </Section>

          <Section id="params" title={t("docs.params.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.params.lead")}</p>
            <div class="mt-4 overflow-x-auto rounded-box border border-base-300">
              <table class="table table-sm w-full min-w-[38rem]">
                <thead>
                  <tr>
                    <th scope="col" class="w-60">{t("docs.params.col.param")}</th>
                    <th scope="col">{t("docs.params.col.effect")}</th>
                  </tr>
                </thead>
                <tbody>
                  {DOCS_PARAMS.map((param) => (
                    <tr>
                      <th scope="row" class="align-top font-normal whitespace-normal">
                        <code class="text-xs font-semibold">{param.name}</code>
                        <div class="mt-1.5 flex items-center gap-2">
                          <code class="text-xs text-base-content/75">{param.example}</code>
                          <CopyButton text={param.example} labels={copyLabels} />
                        </div>
                      </th>
                      <td class="align-top text-sm whitespace-normal text-base-content/75">{t(param.desc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{t("docs.params.note")}</p>
          </Section>

          <Section id="auth" title={t("docs.auth.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.auth.lead")}</p>
            <SubSection title={t("docs.auth.key.title")} body={t("docs.auth.key.body")} />
            <div class="mt-3 flex flex-wrap items-center gap-3">
              <pre class="overflow-x-auto rounded-box bg-base-200 px-3 py-2 text-xs leading-relaxed">
                <code>{DOCS_KEY_FORMS.join("\n")}</code>
              </pre>
              <CopyButton text={DOCS_KEY_FORMS.join("\n")} labels={copyLabels} />
            </div>
            <p class="mt-2 text-xs text-base-content/75">{t("docs.auth.formsNote")}</p>
            <SubSection title={t("docs.auth.keyless.title")} body={t("docs.auth.keyless.body")} />
            <SubSection title={t("docs.auth.public.title")} body={t("docs.auth.public.body")} />
            <SubSection title={t("docs.auth.where.title")} body={t("docs.auth.where.body")} />
          </Section>

          <Section id="upstream" title={t("docs.upstream.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.upstream.lead")}</p>
            <SubSection title={t("docs.upstream.ways.title")} body={t("docs.upstream.ways.body")} />
            <SubSection title={t("docs.upstream.client.title")} body={t("docs.upstream.client.body")} />
            <div class="mt-6">
              <h3 class="text-base font-semibold">{t("docs.upstream.example.title")}</h3>
              <p class="mt-1.5 text-sm text-base-content/75 leading-relaxed">{t("docs.upstream.example.body")}</p>
              {/* One key, three upstreams — the blocks are the two editor
                  fields plus the allowlist, and test/docs.test.ts feeds them
                  to the real parser so the page cannot document a shape it
                  rejects. */}
              {[
                { label: t("docs.upstream.example.varsLabel"), text: DOCS_INJECTION_VARS.join("\n") },
                { label: t("docs.upstream.example.rulesLabel"), text: DOCS_INJECTION_RULES.join("\n") },
                { label: t("docs.upstream.example.hostsLabel"), text: DOCS_INJECTION_HOSTS },
              ].map((block) => (
                <div class="mt-3">
                  <p class="text-xs font-medium">{block.label}</p>
                  <div class="mt-1 flex items-start gap-2">
                    <pre class="min-w-0 flex-1 overflow-x-auto rounded-box bg-base-200 px-3 py-2 text-xs leading-relaxed">
                      <code>{block.text}</code>
                    </pre>
                    <CopyButton text={block.text} labels={copyLabels} />
                  </div>
                </div>
              ))}
              <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.upstream.example.note")}</p>
            </div>
            <SubSection title={t("docs.upstream.uses.title")} body={t("docs.upstream.uses.body")} />
            <SubSection title={t("docs.upstream.keys.title")} body={t("docs.upstream.keys.body")} />
            <SubSection title={t("docs.upstream.rails.title")} body={t("docs.upstream.rails.body")} />
          </Section>

          <Section id="caching" title={t("docs.caching.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.caching.lead")}</p>
            <SubSection title={t("docs.caching.hitTitle")} body={t("docs.caching.hit")} />
            <SubSection title={t("docs.caching.ttlTitle")} body={t("docs.caching.ttl")} />
            <SubSection title={t("docs.caching.bypassTitle")} body={t("docs.caching.bypass")} />
          </Section>

          <Section id="limits" title={t("docs.limits.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.limits.lead")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.limits.rate")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.limits.quota")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.limits.response")}</p>
          </Section>

          <Section id="security" title={t("docs.security.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.security.lead")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.security.ssrf")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.security.headers")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.security.visibility")}</p>
            <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{t("docs.security.trust")}</p>
            <p class="mt-3 text-sm">
              <a href="/terms" class="link link-primary">
                {t("docs.security.termsLink")}
              </a>{" "}
              ·{" "}
              <a href="/#trust" class="link link-primary">
                {t("docs.security.trustLink")}
              </a>
            </p>
          </Section>

          <Section id="selfhost" title={t("docs.selfhost.title")}>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t("docs.selfhost.lead")}</p>
            <p class="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <a href={REPO_DOCS.readme} target="_blank" rel="noopener noreferrer" class="link link-primary">
                {t("docs.selfhost.readme")}
              </a>
              <a href={REPO_DOCS.contributing} target="_blank" rel="noopener noreferrer" class="link link-primary">
                {t("docs.selfhost.contributing")}
              </a>
            </p>
          </Section>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

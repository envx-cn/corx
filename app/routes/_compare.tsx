import type { Handler } from "hono";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { detectLocale, isLocale, makeT, type Locale, type TFunc } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { REPO_DOCS } from "../lib/site-info.js";
import { demoKeyInfo } from "../lib/demo.js";
import { OG_IMAGE, compareAlternates, compareJsonLd } from "../lib/seo.js";
import {
  comparisonBySlug,
  pageDescriptionKey,
  pageLeadKey,
  pageTitleKey,
  pageWinsKey,
  rowLabelKey,
  sourceNoteKey,
  themCellKey,
  usCellKey,
  type Comparison,
  type CompareRowId,
} from "../lib/compare.js";
import { notFoundResponse } from "./_not-found.js";

/**
 * /compare/<name> — a dated, sourced comparison against one hosted CORS proxy.
 *
 * Deliberately not a pitch and not in the nav: it is a long-tail entry point for
 * "X vs Y" searches, so the rules are different from the landing page's. Every
 * competitor claim states where it came from and when it was read, the row the
 * competitor wins is marked instead of buried, and the prose lives in
 * app/lib/i18n/messages.ts while the sources live in app/lib/compare.ts.
 *
 * Served at /compare/<name> (auto-detected language, the x-default URL) and at
 * /en/compare/<name>, /zh/compare/<name> — the hreflang cluster the sitemap
 * declares. The three thin route files call `compareHandler` below.
 */
export function compareHandler(
  locale?: Locale,
): Handler<{ Bindings: Env; Variables: ProxyVariables }> {
  return async (c) => {
    const reqUrl = new URL(c.req.url);
    // Subdomain mode (and ?url=) turn every path into a proxy path, /en/compare/…
    // included — same guard as the landing and the crawler files.
    try {
      if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
    } catch {
      return proxyHandler(c); // malformed target -> the proxy's precise 4xx
    }

    const comparison = comparisonBySlug(c.req.param("name") ?? "");
    if (!comparison) return notFoundResponse(c);

    // ?lang= is the switch for URLs with no language prefix: it remembers the
    // choice and moves to the prefixed document, which is the canonical one.
    const asked = reqUrl.searchParams.get("lang");
    if (isLocale(asked)) {
      setLangCookie(c, asked);
      return c.redirect(`/${asked}/compare/${comparison.slug}`, 302);
    }

    const lang =
      locale ??
      detectLocale({
        pathname: reqUrl.pathname,
        cookie: c.req.header("cookie"),
        acceptLanguage: c.req.header("accept-language"),
      });
    // An explicit /en/ or /zh/ URL is a language *choice*, not just this page's
    // language — remember it, the way the landing page does.
    if (locale) setLangCookie(c, lang);

    // Language-dependent (URL prefix > cookie > Accept-Language), so no shared
    // caching; the canonical is the URL prefix this request came in through.
    c.header("Cache-Control", "private, max-age=0, must-revalidate");
    c.header("Vary", "Accept-Language, Cookie");
    const canonical = `${locale ? `/${locale}` : ""}/compare/${comparison.slug}`;
    return c.html(
      `<!DOCTYPE html>${ComparePage({
        origin: `${reqUrl.protocol}//${reqUrl.host}`,
        canonical,
        locale: lang,
        t: makeT(lang),
        comparison,
        // Only advertise the live demo when this instance actually has one —
        // otherwise the link leads to a landing page without it.
        demo: (await demoKeyInfo(c.env, reqUrl.hostname)) !== undefined,
      })}`,
    );
  };
}

export function ComparePage(props: {
  origin: string;
  /** The canonical path for this document ("/compare/x", "/en/compare/x"). */
  canonical: string;
  locale: Locale;
  t: TFunc;
  comparison: Comparison;
  /** True when this instance runs the landing injection demo (app/lib/demo.ts). */
  demo?: boolean;
}) {
  const { t, comparison } = props;
  const title = t(pageTitleKey(comparison.slug));
  const description = t(pageDescriptionKey(comparison.slug));
  // Group the row sources by URL: several rows usually read from one page, and
  // the note explains a claim, so each URL carries the claims it backed —
  // deduping by URL alone would drop the note that belongs to a row.
  const sourceGroups = new Map<string, Array<{ id: CompareRowId; checked: string }>>();
  for (const row of comparison.rows) {
    const claims = sourceGroups.get(row.source.url) ?? [];
    claims.push({ id: row.id, checked: row.source.checked });
    sourceGroups.set(row.source.url, claims);
  }
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead
          title={`${title} — CORX`}
          description={description}
          origin={props.origin}
          canonical={props.canonical}
          alternates={compareAlternates(props.origin, comparison.slug)}
          locale={props.locale}
          image={{ ...OG_IMAGE, alt: t("site.ogAlt") }}
          structuredData={compareJsonLd({
            origin: props.origin,
            locale: props.locale,
            slug: comparison.slug,
            title,
            description,
            name: comparison.name,
            site: comparison.site,
            checked: comparison.checked,
          })}
        />
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav
          locale={props.locale}
          t={t}
          langLinks={{ zh: `/zh/compare/${comparison.slug}`, en: `/en/compare/${comparison.slug}` }}
          links={
            <a href="/" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
              {t("compare.back")}
            </a>
          }
        />
        <main class="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-12">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
          <p class="mt-2 text-xs text-base-content/75">{t("compare.checked", { date: comparison.checked })}</p>
          {/* The competitor's own pages, one click away — a comparison page that
              paraphrases instead of linking is the failure mode this avoids. */}
          <p class="mt-3 text-xs text-base-content/75">
            {comparison.name}:{" "}
            <a href={comparison.site} target="_blank" rel="noopener noreferrer" class="link link-primary">
              {t("compare.link.site")}
            </a>{" "}
            ·{" "}
            <a href={comparison.docs} target="_blank" rel="noopener noreferrer" class="link link-primary">
              {t("compare.link.docs")}
            </a>
          </p>
          <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{t(pageLeadKey(comparison.slug))}</p>
          {/* The one claim on this page a reader can check by clicking: the
              secret never reaches the browser. Only rendered when the instance
              actually has the demo configured. */}
          {props.demo && (
            <p class="mt-3 text-sm">
              <a href="/#try-it" class="link link-primary">
                {t("compare.demo")}
              </a>
            </p>
          )}
          {/* The tool page, from the page whose whole subject is CORS failing. */}
          <p class="mt-3 text-sm">
            <a href="/tools/cors-tester" class="link link-primary">
              {t("compare.tester")}
            </a>
          </p>

          <div class="mt-8 overflow-x-auto rounded-box border border-base-300">
            <table class="table table-sm w-full min-w-[44rem]">
              <thead>
                <tr>
                  <th scope="col" class="w-36">{t("compare.table.topic")}</th>
                  <th scope="col">{t("compare.table.us")}</th>
                  <th scope="col">{comparison.name}</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr>
                    <th scope="row" class="align-top text-sm font-semibold whitespace-normal">
                      {t(rowLabelKey(row.id))}
                    </th>
                    <td class="align-top text-sm whitespace-normal text-base-content/80">
                      {t(usCellKey(row.id))}
                    </td>
                    <td class="align-top text-sm whitespace-normal text-base-content/80">
                      {t(themCellKey(comparison.slug, row.id))}
                      {/* The honest half of the table: say it in the cell, not
                          in a footnote nobody reads. The status label is the
                          other half — a row we lose on purpose and a row an
                          open task closes are different statements. */}
                      {row.theirs && (
                        <span class="mt-2 flex flex-wrap items-center gap-2">
                          <span class="badge badge-secondary badge-sm">{t("compare.theirs")}</span>
                          {row.status === "planned" && row.trackedIn ? (
                            <a
                              href={row.trackedIn}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="badge badge-outline badge-sm"
                              title={t("compare.status.plannedHint")}
                            >
                              {t("compare.status.planned")}
                            </a>
                          ) : (
                            <span class="badge badge-ghost badge-sm">{t("compare.status.accepted")}</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <section class="mt-12">
            <h2 class="text-xl font-semibold tracking-tight">
              {t("compare.wins.title", { name: comparison.name })}
            </h2>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{t(pageWinsKey(comparison.slug))}</p>
          </section>

          <section class="mt-12">
            <h2 class="text-xl font-semibold tracking-tight">{t("compare.sources.title")}</h2>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">
              {t("compare.sources.note", { name: comparison.name })}
            </p>
            <ul class="mt-4 space-y-4 text-sm leading-relaxed">
              {[...sourceGroups.entries()].map(([url, claims]) => (
                <li>
                  <a href={url} target="_blank" rel="noopener noreferrer" class="link link-primary break-all">
                    {url}
                  </a>{" "}
                  <span class="text-base-content/75">
                    ({t("compare.checked", { date: claims[0]!.checked })})
                  </span>
                  <ul class="mt-1 list-disc space-y-1 pl-5 text-base-content/75">
                    {claims.map((claim) => (
                      <li>
                        <span class="font-medium">{t(rowLabelKey(claim.id))}:</span>{" "}
                        {t(sourceNoteKey(comparison.slug, claim.id))}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
              <li class="text-base-content/75">
                {t("compare.sources.ours")}{" "}
                <a href={REPO_DOCS.readme} target="_blank" rel="noopener noreferrer" class="link link-primary">
                  README.md
                </a>{" "}
                ·{" "}
                <a href={REPO_DOCS.features} target="_blank" rel="noopener noreferrer" class="link link-primary">
                  FEATURES.md
                </a>
              </li>
            </ul>
          </section>

          <p class="mt-10 text-sm text-base-content/75">
            {t("compare.cta")}{" "}
            <a href="/" class="link link-primary">
              {t("compare.ctaLink")}
            </a>
          </p>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

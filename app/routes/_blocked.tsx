import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import { OG_IMAGE } from "../lib/seo.js";
import { DataTable, EmptyRow } from "../components/table.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

/**
 * The instance's blocklist, published.
 *
 * **Why a public page for this.** A caller who gets a `403` from the proxy has
 * no way to tell "this instance refuses that host" from "the upstream refused
 * it". Publishing the list answers that, and it is the same transparency story
 * the rest of the site makes (open source, self-hostable, no lock-in).
 *
 * **What is deliberately not published.** `blocked_hosts.reason` is a free-text
 * note the operator writes for themselves — it can carry a complainant's name, a
 * legal reference, or an internal judgement. Only the hostname and the date go
 * out; the reason stays in the console. If curated transparency is wanted later,
 * the right shape is a separate `public_note` field, not the internal reason.
 *
 * **`noindex`.** The list is thin content and, for a proxy whose whole value is
 * "can I reach X", publishing it is also a probe ("is X blocked? no → X still
 * works") and a disclosure of who complained about whom. Kept out of every index
 * and out of robots.txt; a self-hoster who wants it as a content page can flip
 * one line.
 *
 * **Server-rendered, one URL.** Like `/terms`: language comes from the cookie
 * (`?lang=zh|en` sets it and redirects), so there is no `/en` + `/zh` pair to
 * maintain and no `hreflang` cluster. No island and no public JSON endpoint —
 * the rows come from the same `blocked_hosts` the console reads, in one query at
 * request time.
 */

/** Rows rendered before the list is truncated — keeps a long blocklist from
 *  turning into a huge page (and bounds its value as a probe). */
export const BLOCKED_PAGE_MAX_ROWS = 200;

export interface BlockedEntry {
  hostname: string;
  /** ISO timestamp; rendered as a date. */
  created_at: string;
}

export function BlockedPage(props: {
  origin: string;
  locale: Locale;
  t: TFunc;
  entries: BlockedEntry[];
  /** Rows in `blocked_hosts`, before truncation. */
  total: number;
}) {
  const { t } = props;
  const description = t("blocked.lead", { origin: props.origin });
  const shown = props.entries.slice(0, BLOCKED_PAGE_MAX_ROWS);
  const hidden = Math.max(0, props.total - shown.length);
  const day = (iso: string) => iso.slice(0, 10);
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead
          title={`${t("blocked.title")} — CORX`}
          description={description}
          origin={props.origin}
          canonical="/blocked"
          locale={props.locale}
          image={{ ...OG_IMAGE, alt: t("site.ogAlt") }}
          noindex
        />
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav
          locale={props.locale}
          t={t}
          langLinks={{ zh: "/blocked?lang=zh", en: "/blocked?lang=en" }}
          links={
            <a href="/terms" class="block rounded-xs px-3 py-3.5 hover:bg-base-200 md:inline-block md:px-3 md:py-2">
              {t("blocked.terms")}
            </a>
          }
        />
        <main class="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:py-14">
          <h1 class="text-3xl font-semibold tracking-tight">{t("blocked.title")}</h1>
          <p class="mt-3 text-sm text-base-content/75 leading-relaxed">{description}</p>

          <DataTable
            head={
              <>
                <th>{t("blocked.headHost")}</th>
                <th>{t("blocked.headSince")}</th>
              </>
            }
            body={
              shown.length === 0 ? (
                <EmptyRow cols={2} text={t("blocked.empty")} />
              ) : (
                shown.map((entry) => (
                  <tr>
                    <td class="whitespace-nowrap">
                      <code>{entry.hostname}</code>
                    </td>
                    <td class="whitespace-nowrap text-base-content/75">
                      <time datetime={entry.created_at}>{day(entry.created_at)}</time>
                    </td>
                  </tr>
                ))
              )
            }
          />

          {hidden > 0 ? <p class="text-xs text-base-content/75">{t("blocked.more", { n: hidden })}</p> : null}

          <p class="mt-8 text-sm text-base-content/75 leading-relaxed">{t("blocked.why")}</p>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}
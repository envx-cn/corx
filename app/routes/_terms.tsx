import { SiteFooter, SiteHead, SiteNav } from "../components/site.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

/**
 * Public terms-of-use document. Deliberately self-contained (no islands, no
 * session, no D1): the page must render even when everything else is broken,
 * since it is what the public key's limits and liability rest on.
 *
 * Served at /terms, /terms?lang=zh|en (the handler sets the cookie and
 * redirects), in both console-supported locales.
 */
export function TermsPage(props: { origin: string; locale: Locale; t: TFunc; email: string }) {
  const { t } = props;
  return (
    <html lang={props.locale} data-theme="corx">
      <head>
        <SiteHead title={`${t("terms.title")} — CORX`} description={t("terms.lead", { origin: props.origin })} />
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <SiteNav
          locale={props.locale}
          t={t}
          langLinks={{ zh: "/terms?lang=zh", en: "/terms?lang=en" }}
          links={
            <a href="/" class="px-3 py-2 rounded-lg hover:bg-base-200">
              {t("terms.back")}
            </a>
          }
        />
        <main class="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-12">
          <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight">{t("terms.title")}</h1>
          <p class="mt-2 text-xs text-base-content/75">{t("terms.updated")}</p>
          <p class="mt-4 text-sm text-base-content/75 leading-relaxed">{t("terms.lead", { origin: props.origin })}</p>

          <Section title={t("terms.s1Title")} body={t("terms.s1Body")} />
          <Section title={t("terms.s2Title")} body={t("terms.s2Body")} />
          <Section title={t("terms.s3Title")} body={t("terms.s3Body")} />
          <Section title={t("terms.s4Title")} body={t("terms.s4Body")} />
          <Section title={t("terms.s5Title")} body={t("terms.s5Body")} />
          <Section title={t("terms.s6Title")} body={t("terms.s6Body")} />

          <section class="mt-8">
            <h2 class="text-xl font-semibold tracking-tight">{t("terms.s7Title")}</h2>
            <p class="mt-2 text-sm text-base-content/75 leading-relaxed">
              {t("terms.s7BodyA")}{" "}
              <a href={`mailto:${props.email}`} class="link link-primary">
                {props.email}
              </a>
              {t("terms.s7BodyB")}
            </p>
          </section>
        </main>
        <SiteFooter origin={props.origin} t={t} />
      </body>
    </html>
  );
}

/** One terms section: a single paragraph, or a list when the body has lines. */
function Section(props: { title: string; body: string }) {
  const items = props.body.split("\n").filter(Boolean);
  return (
    <section class="mt-8">
      <h2 class="text-xl font-semibold tracking-tight">{props.title}</h2>
      {items.length > 1 ? (
        <ul class="mt-2 list-disc pl-5 space-y-1.5 text-sm text-base-content/75 leading-relaxed">
          {items.map((item) => (
            <li>{item}</li>
          ))}
        </ul>
      ) : (
        <p class="mt-2 text-sm text-base-content/75 leading-relaxed">{props.body}</p>
      )}
    </section>
  );
}

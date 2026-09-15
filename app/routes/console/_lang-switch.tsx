import type { Locale, TFunc } from "../../lib/i18n/locale.js";

/**
 * zh / EN switch shared by the console topbar and the login page. Both links
 * point at the current path with `?lang=…`, which the console `_middleware`
 * (`langSwitch`) turns into the `corx_lang` cookie and redirects back — before
 * the auth guard runs, so it works logged out on /console/login too. The
 * current language is highlighted and not a link.
 */
export function LangSwitch(props: { locale: Locale; t: TFunc }) {
  const { locale, t } = props;
  const href = (lang: Locale) => (locale === lang ? "#" : `?lang=${lang}`);
  const linkClass = (lang: Locale) =>
    `px-2 py-1 rounded-md hover:bg-black/[0.045] transition-colors ${locale === lang ? "text-primary" : ""}`;
  return (
    <div class="flex shrink-0 items-center gap-1 text-xs font-medium text-base-content/75">
      <a href={href("zh")} lang="zh" aria-current={locale === "zh" ? "true" : undefined} class={linkClass("zh")}>
        {t("lang.zh")}
      </a>
      <span class="text-base-content/25">/</span>
      <a href={href("en")} lang="en" aria-current={locale === "en" ? "true" : undefined} class={linkClass("en")}>
        {t("lang.en")}
      </a>
    </div>
  );
}

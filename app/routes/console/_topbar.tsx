import userSvg from "lucide-static/icons/user.svg?raw";
import { Lucide } from "../../components/lucide.js";
import { ConfirmButton } from "./_confirm.js";
import type { Locale, TFunc } from "../../lib/i18n/locale.js";

/**
 * Top bar, styled after dash.cloudflare.com: the header shares the page's
 * canvas background and hairline bottom border; breadcrumb on the left, a
 * language switch, and the user menu on the right (Profile / Billing / Log
 * out). The language switch sets the corx_lang cookie via ?lang=… (handled by
 * the console _middleware) and keeps the current page.
 */
export function Topbar(props: { title: string; user: string; locale: Locale; t: TFunc }) {
  const { t } = props;
  const langLink = (lang: Locale) => `${props.locale === lang ? "#" : `?lang=${lang}`}`;
  return (
    <div class="navbar bg-base-200 border-b border-base-300 sticky top-0 z-30 min-h-16 px-4 gap-2">
      <div class="flex-none lg:hidden">
        <label for="console-drawer" class="btn btn-square btn-ghost" aria-label={t("console.topbar.openSidebar")}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </label>
      </div>
      <div class="flex-1 flex items-center gap-1.5 text-sm min-w-0">
        <span class="text-base-content/75">CORX</span>
        <span class="text-base-content/30">/</span>
        <b class="font-semibold truncate">{props.title}</b>
      </div>

      {/* Language switch: zh / EN, current one highlighted. */}
      <div class="flex-none flex items-center gap-1 text-xs font-medium text-base-content/75">
        <a
          href={langLink("zh")}
          lang="zh"
          aria-current={props.locale === "zh" ? "true" : undefined}
          class={`px-2 py-1 rounded-md hover:bg-black/[0.045] transition-colors ${props.locale === "zh" ? "text-primary" : ""}`}
        >
          {t("lang.zh")}
        </a>
        <span class="text-base-content/25">/</span>
        <a
          href={langLink("en")}
          lang="en"
          aria-current={props.locale === "en" ? "true" : undefined}
          class={`px-2 py-1 rounded-md hover:bg-black/[0.045] transition-colors ${props.locale === "en" ? "text-primary" : ""}`}
        >
          {t("lang.en")}
        </a>
      </div>

      <div class="flex-none">
        <div class="dropdown dropdown-end">
          <div
            tabindex={0}
            role="button"
            aria-label={t("console.topbar.account")}
            class="size-8.5 rounded-lg inline-flex items-center justify-center hover:bg-black/[0.045] cursor-pointer"
          >
            <span class="size-7 rounded-full bg-black/10 text-base-content/75 inline-flex items-center justify-center">
              <Lucide svg={userSvg} />
            </span>
          </div>
          <ul
            tabindex={0}
            class="dropdown-content menu menu-sm bg-base-100 rounded-lg border border-base-300 shadow-lg w-60 p-1.5 z-50 mt-1"
          >
            <li class="px-3 pt-2 pb-1 text-xs text-base-content/75 truncate" title={props.user}>
              {props.user}
            </li>
            <li class="menu-title px-3 pt-3 pb-0.5">{t("console.topbar.account")}</li>
            <li>
              <a href="/console/profile">{t("console.topbar.profile")}</a>
            </li>
            <li>
              <a href="/console/billing">{t("console.topbar.billing")}</a>
            </li>
            <li class="menu-title px-3 pt-3 pb-0.5">{t("console.topbar.session")}</li>
            <li>
              <ConfirmButton
                action="/console/logout"
                label={t("console.topbar.logout")}
                // Restate the menu-item metrics explicitly (menu-sm: px-2.5 py-1,
                // radius-field = rounded-lg) so the trigger keeps them even if
                // the markup around it changes.
                triggerClass="w-full justify-start rounded-lg px-2.5 py-1 text-left hover:bg-black/[0.045]"
                i18n={{
                  title: t("console.topbar.logoutTitle"),
                  body: t("console.topbar.logoutBody"),
                  confirm: t("console.topbar.logout"),
                  cancel: t("ui.cancel"),
                  close: t("ui.close"),
                }}
              />
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

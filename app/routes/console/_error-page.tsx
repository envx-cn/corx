import type { AdminIdentity } from "../../lib/access.js";
import type { Locale, TFunc } from "../../lib/i18n/locale.js";
import { ConsoleLayout } from "./_layout.js";
import { activeNavItem } from "./_nav.js";

/**
 * Error document for authenticated console requests: the normal shell
 * (sidebar, topbar, user menu) with an error card as the page content, so the
 * admin can navigate away without losing context. Rendered by base.onError in
 * app/server.ts; when the request has no identity — or this render throws —
 * the standalone document (`app/routes/_error-page.tsx`) is used instead.
 *
 * The shell now renders no islands (the user menu is a server-rendered
 * confirm dialog wired by the Doc's inline script), so this document needs no
 * hydration entry at all.
 */
export function ConsoleErrorDocument(props: {
  status: number;
  path: string;
  /** Dev-only error text. */
  message?: string;
  user: AdminIdentity;
  locale: Locale;
  t: TFunc;
}) {
  return (
    <ConsoleLayout
      title={props.t("errorpage.consoleTitle")}
      user={props.user.email}
      active={activeNavItem(props.path)}
      locale={props.locale}
      t={props.t}
    >
      <ConsoleErrorPanel status={props.status} path={props.path} message={props.message} t={props.t} />
    </ConsoleLayout>
  );
}

/** Compact in-shell variant of the standalone error hero. */
export function ConsoleErrorPanel(props: { status: number; path: string; message?: string; t: TFunc }) {
  const { t } = props;
  const time = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return (
    <div class="mx-auto max-w-xl py-6 sm:py-10">
      <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body items-center gap-2 py-10 text-center">
          <div class="text-5xl font-extrabold tabular-nums tracking-tight text-base-content/20">{props.status}</div>
          <h1 class="text-xl font-semibold">{t("errorpage.h1", { code: props.status })}</h1>
          <p class="max-w-md text-sm text-base-content/70">{t("errorpage.sub")}</p>
          <div class="mt-4 flex flex-wrap items-center justify-center gap-3">
            <a href="/console/" class="btn btn-primary">
              {t("errorpage.backConsole")}
            </a>
            <a href="/" class="btn btn-ghost">
              {t("notfound.takeHome")}
            </a>
          </div>
          <p class="mt-6 text-xs text-base-content/45">
            {t("errorpage.ref", { code: props.status, path: props.path, time })}
          </p>
          {props.message && (
            <pre class="mt-2 w-full overflow-x-auto rounded-box border border-error/30 bg-error/5 p-3 text-left text-xs text-error">
              {props.message}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

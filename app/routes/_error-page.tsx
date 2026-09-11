import { StatusPage } from "../components/status-page.js";
import type { Locale, TFunc } from "../lib/i18n/locale.js";

/**
 * Branded error document for uncaught failures on browser-facing routes
 * (landing, /console/*). Rendered by base.onError in app/server.ts — machine
 * callers (/api/*, /health, proxy routes) keep their JSON wire format.
 *
 * Like the 404, it is a self-contained document: no session, no D1, no island
 * hydration, so it still renders when the failure is in exactly those layers.
 */
export function ErrorPage(props: {
  /** HTTP status to show ("500", "502", …). */
  status: number;
  locale: Locale;
  origin: string;
  /** Request path, for the reference line. */
  path: string;
  /** Dev-only error text (never rendered in production). */
  message?: string;
  t: TFunc;
}) {
  const { t } = props;
  const fromConsole = props.path === "/console" || props.path.startsWith("/console/");
  const time = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
  return (
    <StatusPage
      code={String(props.status)}
      tone="error"
      locale={props.locale}
      origin={props.origin}
      t={t}
      title={t("errorpage.title", { code: props.status })}
      h1={t("errorpage.h1", { code: props.status })}
      sub={t("errorpage.sub")}
      primary={
        fromConsole
          ? { href: "/console/", label: t("errorpage.backConsole") }
          : { href: "/", label: t("notfound.takeHome") }
      }
      secondary={
        fromConsole
          ? { href: "/", label: t("notfound.takeHome") }
          : { href: "/console/", label: t("notfound.openConsole") }
      }
      note={t("errorpage.ref", { code: props.status, path: props.path, time })}
      devDetail={props.message}
    />
  );
}

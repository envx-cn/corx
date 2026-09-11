import type { TFunc } from "../lib/i18n/locale.js";

/**
 * Compact <time>: "5m ago" / "3h ago" / "2d ago" (older than a month falls back
 * to the UTC date). Relative labels are timezone-proof, so the server can render
 * them — no client hydration — and they keep dense tables on one line. The exact
 * ISO stamp stays in the tooltip and in the datetime attribute.
 */
export function RelTime(props: { value: string; t: TFunc; class?: string }) {
  const ms = Date.parse(props.value);
  let label: string;
  if (!Number.isFinite(ms)) {
    label = props.value || "—";
  } else {
    const min = Math.floor((Date.now() - ms) / 60_000);
    const hours = Math.floor(min / 60);
    const days = Math.floor(hours / 24);
    if (min < 1) label = props.t("time.now");
    else if (min < 60) label = props.t("time.minutes", { n: min });
    else if (hours < 24) label = props.t("time.hours", { n: hours });
    else if (days <= 30) label = props.t("time.days", { n: days });
    else label = props.value.slice(0, 10);
  }
  return (
    <time datetime={props.value} title={props.value} class={`whitespace-nowrap ${props.class ?? ""}`}>
      {label}
    </time>
  );
}

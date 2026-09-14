import { useState } from "hono/jsx/dom";

/** UI strings for the log window slider (injected from the server dict). */
export interface LogsRangeI18n {
  label: string;
}

/** "1h" / "24h" / "2d 4h" / "7d" — short units stay readable in both locales. */
export function windowLabel(hours: number): string {
  const h = Math.max(1, Math.round(hours));
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  const rest = h % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

/**
 * Lookback-window slider for the logs page: 1 hour … 7 days. Dragging updates
 * the label and re-submits the (GET) filter form on release, so the whole page
 * — table included — comes back with the new window. The form's Refresh button
 * still works without JS.
 */
export default function LogsRange(props: { hours: number; i18n: LogsRangeI18n }) {
  const [hours, setHours] = useState(props.hours);
  return (
    <>
      <span class="text-sm text-base-content/75 shrink-0">{props.i18n.label}</span>
      <input
        type="range"
        name="hours"
        min={1}
        max={168}
        value={String(hours)}
        class="range flex-1 min-w-[10rem] max-w-xl"
        aria-label={props.i18n.label}
        onInput={(e) => setHours(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => (e.target as HTMLInputElement).form?.submit()}
      />
      <span class="text-sm tabular-nums text-base-content/75 w-14 shrink-0">{windowLabel(hours)}</span>
    </>
  );
}

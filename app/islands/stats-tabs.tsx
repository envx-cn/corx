import { useState } from "hono/jsx/dom";

/** One row of a breakdown: label text + count (+ optional status tone). */
export interface BreakdownRow {
  label: string;
  n: number;
  tone?: "success" | "info" | "warning" | "error";
}

const TONE_BAR: Record<string, string> = {
  success: "bar-success",
  info: "bar-info",
  warning: "bar-warning",
  error: "bar-error",
};

/** UI strings for the breakdown tabs (injected from the server dict). */
export interface StatsTabsI18n {
  aria: string;
  byStatus: string;
  byMethod: string;
  byCountry: string;
  noData: string;
}

/**
 * Dashboard breakdown selector: "By status / By method / By country" tabs,
 * each rendering a vertical bar chart (same visual language as "Requests per
 * hour"). Plain text labels, no badge backgrounds.
 */
export default function StatsTabs(props: {
  status: BreakdownRow[];
  method: BreakdownRow[];
  country: BreakdownRow[];
  i18n: StatsTabsI18n;
}) {
  const tabs = [
    { label: props.i18n.byStatus, data: props.status },
    { label: props.i18n.byMethod, data: props.method },
    { label: props.i18n.byCountry, data: props.country },
  ] as const;
  const [active, setActive] = useState(0);
  const data = tabs[active]!.data;
  const max = Math.max(1, ...data.map((d) => d.n));

  return (
    <div class="bg-base-100 border border-base-300 rounded-box">
      <div class="flex border-b border-base-300 px-2" role="tablist" aria-label={props.i18n.aria}>
        {tabs.map((t, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            class={`px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active === i
                ? "border-primary text-base-content"
                : "border-transparent text-base-content/50 hover:text-base-content/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div class="p-4">
        {data.length === 0 ? (
          <p class="text-sm text-base-content/50 text-center py-6">{props.i18n.noData}</p>
        ) : (
          <>
            <div class="chart">
              {data.map((d, i) => {
                const pct = Math.round((d.n / max) * 100);
                return (
                  <div
                    key={`${tabs[active]!.label}-${i}`}
                    class={`bar ${d.tone ? TONE_BAR[d.tone] ?? "" : ""}`}
                    style={`height:${Math.max(3, pct)}%`}
                    title={`${d.label}: ${d.n}`}
                  />
                );
              })}
            </div>
            <div class="chart-ticks">
              {data.map((d, i) => (
                <span key={`t-${i}`} class="truncate" title={d.label}>
                  {d.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

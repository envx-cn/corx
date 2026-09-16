import { humanBytes } from "../lib/format.js";

export function HourlyChart({ hourly }: { hourly: Array<{ hour: string; requests: number; bytes: number }> }) {
  const maxReq = Math.max(1, ...hourly.map((h) => h.requests));
  return (
    <>
      <div class="chart">
        {hourly.map((h) => {
          const pct = Math.round((h.requests / maxReq) * 100);
          const label = `${h.hour.slice(5).replace("T", " ")}:00 — ${h.requests} req, ${humanBytes(h.bytes)}`;
          return <div class="bar" style={`height:${Math.max(3, pct)}%`} title={label} />;
        })}
      </div>
      <div class="chart-ticks">
        {hourly.map((h, i) => (
          <span>{i % 6 === 0 || i === 23 ? `${h.hour.slice(11)}:00` : ""}</span>
        ))}
      </div>
    </>
  );
}

/**
 * Daily bars spanning both comparison periods. The previous period is tinted
 * down (`.bar-prev`) so the eye can find the boundary that matters: the start
 * of the current period, marked by the tick at index `boundary`.
 */
export function DailyChart({
  daily,
  boundary,
}: {
  daily: Array<{ day: string; requests: number; origins: number; keys: number }>;
  /** Index of the first day of the current period. */
  boundary: number;
}) {
  const maxReq = Math.max(1, ...daily.map((h) => h.requests));
  return (
    <>
      <div class="chart">
        {daily.map((h, i) => {
          const pct = Math.round((h.requests / maxReq) * 100);
          const label = `${h.day} — ${h.requests} req, ${h.origins} origins, ${h.keys} keys`;
          return (
            <div
              class={i < boundary ? "bar bar-prev" : "bar"}
              style={`height:${Math.max(3, pct)}%`}
              title={label}
            />
          );
        })}
      </div>
      <div class="chart-ticks">
        {daily.map((h, i) => (
          <span>{i === 0 || i === boundary || i === daily.length - 1 ? h.day.slice(5) : ""}</span>
        ))}
      </div>
    </>
  );
}

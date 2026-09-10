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

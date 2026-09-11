import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryLogs } from "../../lib/admin.js";
import type { LogRow } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { RelTime } from "../../components/time.js";
import LogsRange from "../../islands/logs-range.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

/** Rows fetched for one window (the table shows the newest of them). */
const ROW_LIMIT = 200;

/** Lookback window in hours, clamped to the 1h…7d slider range. */
function clampHours(n: number): number {
  return Math.min(Math.max(Math.round(Number.isFinite(n) ? n : 24), 1), 168);
}

app.get("/", async (c) => {
  const t = consoleT(c);
  const hours = clampHours(Number(c.req.query("hours") ?? 24));
  const logs = await queryLogs(c.env.DB, { hours, limit: ROW_LIMIT });
  return c.render(<LogsContent logs={logs} hours={hours} t={t} />, {
    title: t("console.title.logs"),
  });
});

export default app;

// ---------- Page markup (colocated) ----------
function LogsContent(props: { logs: LogRow[]; hours: number; t: TFunc }) {
  const { t } = props;
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">{t("console.logs.title")}</h1>
      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-2">
        <form method="get" action="/console/logs" class="flex flex-wrap items-center gap-x-4 gap-y-3">
          <LogsRange hours={props.hours} i18n={{ label: t("console.logs.window") }} />
          <button class="btn btn-sm shrink-0">{t("console.logs.refresh")}</button>
        </form>
      </div>
      {props.logs.length >= ROW_LIMIT && (
        <p class="text-xs text-base-content/50 mb-3">{t("console.logs.truncated", { n: ROW_LIMIT })}</p>
      )}
      <DataTable
        head={
          <>
            <th>{t("console.logs.headTime")}</th>
            <th>{t("console.logs.headMethod")}</th>
            <th>{t("console.logs.headHost")}</th>
            <th>{t("console.logs.headStatus")}</th>
            <th class="hidden text-right sm:table-cell">{t("console.logs.headLatency")}</th>
            <th class="hidden md:table-cell">{t("console.logs.headCc")}</th>
            <th>{t("console.logs.headCache")}</th>
            <th class="hidden text-right sm:table-cell">{t("console.logs.headSize")}</th>
            <th>{t("console.logs.headError")}</th>
          </>
        }
        body={
          props.logs.length === 0 ? (
            <EmptyRow cols={9} text={t("console.logs.empty")} />
          ) : (
            props.logs.map((l) => (
              <tr>
                <td class="text-base-content/50">
                  <RelTime value={l.created_at} t={t} />
                </td>
                <td>
                  <MethodBadge method={l.method} />
                </td>
                <td>
                  <code class="inline-block max-w-[10rem] truncate align-bottom sm:max-w-[18rem]" title={l.target_host}>
                    {l.target_host}
                  </code>
                </td>
                <td>
                  <StatusBadge status={l.status} />
                </td>
                <td class="hidden text-right tabular-nums sm:table-cell">
                  {l.latency_ms ?? "—"}
                  {l.latency_ms == null ? "" : " ms"}
                </td>
                <td class="hidden md:table-cell">{l.country}</td>
                <td>
                  {l.cached ? (
                    <span class="font-medium text-success">{t("console.logs.hit")}</span>
                  ) : (
                    <span class="text-base-content/50">{t("console.logs.miss")}</span>
                  )}
                </td>
                <td class="hidden text-right tabular-nums sm:table-cell">{humanBytes(l.res_bytes)}</td>
                <td class="text-error">{l.error}</td>
              </tr>
            ))
          )
        }
      />
    </>
  );
}

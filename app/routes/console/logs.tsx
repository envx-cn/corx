import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryLogs } from "../../lib/admin.js";
import type { LogRow } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const limit = Number(c.req.query("limit") ?? 100);
  return c.render(
    <LogsContent logs={await queryLogs(c.env.DB, limit)} limit={Number.isFinite(limit) ? limit : 100} t={t} />,
    { title: t("console.title.logs") },
  );
});

export default app;

// ---------- Page markup (colocated) ----------
function LogsContent(props: { logs: LogRow[]; limit: number; t: TFunc }) {
  const { t } = props;
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">{t("console.logs.title")}</h1>
      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-4">
        <form method="get" action="/console/logs">
          <div class="flex flex-wrap items-end gap-3">
            <label class="form-control">
              <div class="label pb-1">
                <span class="label-text">{t("console.logs.limit")}</span>
              </div>
              <input name="limit" value={String(props.limit)} inputmode="numeric" class="input input-bordered input-sm w-24" />
            </label>
            <button class="btn btn-sm">{t("console.logs.refresh")}</button>
          </div>
        </form>
      </div>
      <DataTable
        head={
          <>
            <th>{t("console.logs.headTime")}</th>
            <th>{t("console.logs.headMethod")}</th>
            <th>{t("console.logs.headHost")}</th>
            <th>{t("console.logs.headStatus")}</th>
            <th class="text-right">{t("console.logs.headLatency")}</th>
            <th>{t("console.logs.headCc")}</th>
            <th>{t("console.logs.headCache")}</th>
            <th class="text-right">{t("console.logs.headSize")}</th>
            <th>{t("console.logs.headError")}</th>
          </>
        }
        body={
          props.logs.length === 0 ? (
            <EmptyRow cols={9} text={t("console.logs.empty")} />
          ) : (
            props.logs.map((l) => (
              <tr>
                <td class="text-base-content/50">{l.created_at}</td>
                <td>
                  <MethodBadge method={l.method} />
                </td>
                <td>
                  <code>{l.target_host}</code>
                </td>
                <td>
                  <StatusBadge status={l.status} />
                </td>
                <td class="text-right tabular-nums">
                  {l.latency_ms ?? "—"}
                  {l.latency_ms == null ? "" : " ms"}
                </td>
                <td>{l.country}</td>
                <td>
                  {l.cached ? (
                    <span class="font-medium text-success">{t("console.logs.hit")}</span>
                  ) : (
                    <span class="text-base-content/50">{t("console.logs.miss")}</span>
                  )}
                </td>
                <td class="text-right tabular-nums">{humanBytes(l.res_bytes)}</td>
                <td class="text-error">{l.error}</td>
              </tr>
            ))
          )
        }
      />
    </>
  );
}

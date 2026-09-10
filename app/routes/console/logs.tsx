import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryLogs } from "../../lib/admin.js";
import type { LogRow } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { DataTable, EmptyRow } from "../../components/table.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? 100);
  return c.render(<LogsContent logs={await queryLogs(c.env.DB, limit)} limit={Number.isFinite(limit) ? limit : 100} />, {
    title: "Logs",
  });
});

export default app;

// ---------- Page markup (colocated) ----------
function LogsContent(props: { logs: LogRow[]; limit: number }) {
  return (
    <>
      <h1 class="text-2xl font-semibold mb-4">Request logs</h1>
      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-4">
        <form method="get" action="/console/logs">
          <div class="flex flex-wrap items-end gap-3">
            <label class="form-control">
              <div class="label pb-1">
                <span class="label-text">Limit</span>
              </div>
              <input name="limit" value={String(props.limit)} inputmode="numeric" class="input input-bordered input-sm w-24" />
            </label>
            <button class="btn btn-sm">Refresh</button>
          </div>
        </form>
      </div>
      <DataTable
        head={
          <>
            <th>Time</th>
            <th>Method</th>
            <th>Host</th>
            <th>Status</th>
            <th class="text-right">Latency</th>
            <th>CC</th>
            <th>Cache</th>
            <th class="text-right">Size</th>
            <th>Error</th>
          </>
        }
        body={
          props.logs.length === 0 ? (
            <EmptyRow cols={9} text="no logs" />
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
                <td>{l.cached ? <span class="badge badge-success">HIT</span> : <span class="badge badge-ghost">MISS</span>}</td>
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

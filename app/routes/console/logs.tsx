import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryLogs } from "../../lib/admin.js";
import type { LogRow } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { Panel } from "../../components/panel.js";

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
      <h1>Request logs</h1>
      <div class="toolbar">
        <form method="get" action="/console/logs">
          <div class="row">
            <label class="f">
              Limit
              <input name="limit" value={String(props.limit)} inputmode="numeric" />
            </label>
            <button>Refresh</button>
          </div>
        </form>
      </div>
      <Panel>
        <thead>
          <tr>
            <th>Time</th>
            <th>Method</th>
            <th>Host</th>
            <th>Status</th>
            <th>Latency</th>
            <th>CC</th>
            <th>Cache</th>
            <th class="num">Size</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {props.logs.length === 0 && (
            <tr>
              <td colspan={9} class="muted">
                no logs
              </td>
            </tr>
          )}
          {props.logs.map((l) => (
            <tr>
              <td class="muted">{l.created_at}</td>
              <td>
                <MethodBadge method={l.method} />
              </td>
              <td>
                <code>{l.target_host}</code>
              </td>
              <td>
                <StatusBadge status={l.status} />
              </td>
              <td class="num">
                {l.latency_ms ?? "—"}
                {l.latency_ms == null ? "" : " ms"}
              </td>
              <td>{l.country}</td>
              <td>{l.cached ? <span class="badge ok">HIT</span> : <span class="badge muted">MISS</span>}</td>
              <td class="num">{humanBytes(l.res_bytes)}</td>
              <td style="color:var(--err)">{l.error}</td>
            </tr>
          ))}
        </tbody>
      </Panel>
    </>
  );
}

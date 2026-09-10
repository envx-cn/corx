import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts, queryKeys, queryStats } from "../../lib/admin.js";
import type { Stats } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { HourlyChart } from "../../components/chart.js";
import StatsTabs from "../../islands/stats-tabs.js";
import type { BreakdownRow } from "../../islands/stats-tabs.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const [stats, keys, blocked] = await Promise.all([
    queryStats(c.env.DB),
    queryKeys(c.env.DB),
    queryBlockedHosts(c.env.DB),
  ]);
  return c.render(
    <DashboardContent
      stats={stats}
      keyCount={keys.filter((k) => !k.revoked_at).length}
      blockedCount={blocked.length}
    />,
    { title: "Overview" },
  );
});

export default app;

// ---------- Page markup (colocated) ----------

function Stat({ value, label }: { value: Child; label: string }) {
  return (
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children?: Child }) {
  return (
    <>
      <h2 class="text-lg font-semibold mb-3 mt-8">{title}</h2>
      {children}
    </>
  );
}

/** Status tone for the breakdown bars (matches StatusBadge colors). */
function toneForStatus(status: number): BreakdownRow["tone"] {
  if (status < 300) return "success";
  if (status < 400) return "info";
  if (status < 500) return "warning";
  return "error";
}

function DashboardContent(props: { stats: Stats; keyCount: number; blockedCount: number }) {
  const { stats } = props;
  const t = stats.totals;
  const req = t?.requests ?? 0;
  const hitRate = req ? `${Math.round(((t?.cached ?? 0) / req) * 100)}%` : "—";
  const errRate = req ? `${Math.round(((t?.errors ?? 0) / req) * 1000) / 10}%` : "—";
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">
        Overview <span class="text-base font-normal text-base-content/50">· last 24h</span>
      </h1>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat value={String(req)} label="requests" />
        <Stat value={humanBytes(t?.res_bytes ?? 0)} label="traffic out" />
        <Stat value={humanBytes(t?.cached_bytes ?? 0)} label={`served from cache (${hitRate} hits)`} />
        <Stat value={humanBytes(t?.req_bytes ?? 0)} label="traffic in" />
        <Stat
          value={t?.avg_latency_ms ? `${Math.round(t.avg_latency_ms)} ms` : "—"}
          label={`avg latency (max ${t?.max_latency_ms ?? "—"} ms)`}
        />
        <Stat value={errRate} label={`error rate (${t?.errors ?? 0})`} />
        <Stat value={String(props.keyCount)} label="API keys" />
        <Stat value={String(props.blockedCount)} label="blocked hosts" />
      </div>

      <Section title="Requests per hour">
        <HourlyChart hourly={stats.hourly} />
      </Section>

      <Section title="Top hosts">
        <DataTable
          head={
            <>
              <th>Host</th>
              <th class="text-right">Requests</th>
              <th class="text-right">Traffic</th>
            </>
          }
          body={
            stats.topHosts.length === 0 ? (
              <EmptyRow cols={3} text="no data" />
            ) : (
              stats.topHosts.map((r) => (
                <tr>
                  <td>
                    <code>{r.target_host}</code>
                  </td>
                  <td class="text-right tabular-nums">{r.n}</td>
                  <td class="text-right tabular-nums">{humanBytes(r.bytes)}</td>
                </tr>
              ))
            )
          }
        />
      </Section>

      <Section title="Top API keys by traffic">
        <DataTable
          head={
            <>
              <th>Key</th>
              <th class="text-right">Requests</th>
              <th class="text-right">Traffic</th>
            </>
          }
          body={
            stats.topKeys.length === 0 ? (
              <EmptyRow cols={3} text="no data" />
            ) : (
              stats.topKeys.map((r) => (
                <tr>
                  <td>
                    {r.name || <span class="text-base-content/40">anonymous</span>}
                  </td>
                  <td class="text-right tabular-nums">{r.n}</td>
                  <td class="text-right tabular-nums">{humanBytes(r.bytes)}</td>
                </tr>
              ))
            )
          }
        />
      </Section>

      <Section title="Breakdown">
        <StatsTabs
          status={stats.byStatus.map(
            (r): BreakdownRow => ({ label: String(r.status), n: r.n, tone: toneForStatus(r.status) }),
          )}
          method={stats.byMethod.map((r): BreakdownRow => ({ label: r.method, n: r.n }))}
          country={stats.byCountry.map((r): BreakdownRow => ({ label: r.country || "—", n: r.n }))}
        />
      </Section>

      <Section title="Recent errors">
        <DataTable
          head={
            <>
              <th>Time</th>
              <th>Method</th>
              <th>Host</th>
              <th>Status</th>
              <th>Error</th>
            </>
          }
          body={
            stats.recentErrors.length === 0 ? (
              <EmptyRow cols={5} text="none 🎉" />
            ) : (
              stats.recentErrors.map((l) => (
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
                  <td class="text-error">{l.error}</td>
                </tr>
              ))
            )
          }
        />
      </Section>
    </>
  );
}

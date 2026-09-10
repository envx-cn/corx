import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts, queryKeys, queryStats } from "../../lib/admin.js";
import type { Stats } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { StatCard } from "../../components/cards.js";
import { HourlyChart } from "../../components/chart.js";
import { Panel, Section } from "../../components/panel.js";

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
function DashboardContent(props: { stats: Stats; keyCount: number; blockedCount: number }) {
  const { stats } = props;
  const t = stats.totals;
  const req = t?.requests ?? 0;
  const hitRate = req ? `${Math.round(((t?.cached ?? 0) / req) * 100)}%` : "—";
  const errRate = req ? `${Math.round(((t?.errors ?? 0) / req) * 1000) / 10}%` : "—";
  return (
    <>
      <h1>
        Overview <span class="sub">· last 24h</span>
      </h1>
      <div class="cards">
        <StatCard value={String(req)} label="requests" />
        <StatCard value={humanBytes(t?.res_bytes ?? 0)} label="traffic out" />
        <StatCard value={humanBytes(t?.cached_bytes ?? 0)} label={`served from cache (${hitRate} hits)`} />
        <StatCard value={humanBytes(t?.req_bytes ?? 0)} label="traffic in" />
        <StatCard
          value={t?.avg_latency_ms ? `${Math.round(t.avg_latency_ms)} ms` : "—"}
          label={`avg latency (max ${t?.max_latency_ms ?? "—"} ms)`}
        />
        <StatCard value={errRate} label={`error rate (${t?.errors ?? 0})`} />
        <StatCard value={String(props.keyCount)} label="API keys" />
        <StatCard value={String(props.blockedCount)} label="blocked hosts" />
      </div>
      <Section title="Requests per hour">
        <HourlyChart hourly={stats.hourly} />
      </Section>
      <Section title="Top hosts">
        <Panel>
          <thead>
            <tr>
              <th>Host</th>
              <th class="num">Requests</th>
              <th class="num">Traffic</th>
            </tr>
          </thead>
          <tbody>
            {stats.topHosts.length === 0 && (
              <tr>
                <td colspan={3} class="muted">
                  no data
                </td>
              </tr>
            )}
            {stats.topHosts.map((r) => (
              <tr>
                <td>
                  <code>{r.target_host}</code>
                </td>
                <td class="num">{r.n}</td>
                <td class="num">{humanBytes(r.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </Panel>
      </Section>
      <Section title="Top API keys by traffic">
        <Panel>
          <thead>
            <tr>
              <th>Key</th>
              <th class="num">Requests</th>
              <th class="num">Traffic</th>
            </tr>
          </thead>
          <tbody>
            {stats.topKeys.length === 0 && (
              <tr>
                <td colspan={3} class="muted">
                  no data
                </td>
              </tr>
            )}
            {stats.topKeys.map((r) => (
              <tr>
                <td>{r.name || <span class="badge muted">anonymous</span>}</td>
                <td class="num">{r.n}</td>
                <td class="num">{humanBytes(r.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </Panel>
      </Section>
      <Section title="By status">
        <Panel>
          <thead>
            <tr>
              <th>Status</th>
              <th class="num">Count</th>
            </tr>
          </thead>
          <tbody>
            {stats.byStatus.map((r) => (
              <tr>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td class="num">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </Panel>
      </Section>
      <Section title="By method">
        <Panel>
          <thead>
            <tr>
              <th>Method</th>
              <th class="num">Count</th>
            </tr>
          </thead>
          <tbody>
            {stats.byMethod.map((r) => (
              <tr>
                <td>
                  <MethodBadge method={r.method} />
                </td>
                <td class="num">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </Panel>
      </Section>
      <Section title="By country">
        <Panel>
          <thead>
            <tr>
              <th>Country</th>
              <th class="num">Count</th>
            </tr>
          </thead>
          <tbody>
            {stats.byCountry.map((r) => (
              <tr>
                <td>{r.country || <span class="badge muted">—</span>}</td>
                <td class="num">{r.n}</td>
              </tr>
            ))}
          </tbody>
        </Panel>
      </Section>
      <Section title="Recent errors">
        <Panel>
          <thead>
            <tr>
              <th>Time</th>
              <th>Method</th>
              <th>Host</th>
              <th>Status</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentErrors.length === 0 && (
              <tr>
                <td colspan={5} class="muted">
                  none 🎉
                </td>
              </tr>
            )}
            {stats.recentErrors.map((l) => (
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
                <td style="color:var(--err)">{l.error}</td>
              </tr>
            ))}
          </tbody>
        </Panel>
      </Section>
    </>
  );
}

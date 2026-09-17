import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts, queryKeys, queryStats, queryStatsComparison, clampStatsDays } from "../../lib/admin.js";
import { logRetentionDays } from "../../lib/db.js";
import type { Stats, StatsComparison, MetricDelta } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { MethodBadge, StatusBadge } from "../../components/badges.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { RelTime } from "../../components/time.js";
import { DailyChart, HourlyChart } from "../../components/chart.js";
import StatsTabs, { type StatsTabsI18n } from "../../islands/stats-tabs.js";
import type { BreakdownRow } from "../../islands/stats-tabs.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const days = clampStatsDays(Number(c.req.query("days") ?? "7") || 7);
  const [stats, trend, keys, blocked] = await Promise.all([
    queryStats(c.env.DB),
    queryStatsComparison(c.env.DB, days, Date.now(), logRetentionDays(c.env)),
    queryKeys(c.env.DB),
    queryBlockedHosts(c.env.DB),
  ]);
  return c.render(
    <DashboardContent
      stats={stats}
      trend={trend}
      keyCount={keys.filter((k) => !k.revoked_at).length}
      blockedCount={blocked.length}
      t={t}
    />,
    { title: t("console.title.overview") },
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

/** Signed change vs the previous period; "new" when there is no baseline. */
function DeltaBadge({ delta, t }: { delta: MetricDelta; t: TFunc }) {
  if (delta.pct === null) {
    return <span class="badge badge-sm badge-success badge-soft">{t("console.trend.new")}</span>;
  }
  const pct = Math.round(delta.pct * 1000) / 10;
  const tone = delta.pct === 0 ? "badge-ghost" : delta.pct > 0 ? "badge-success" : "badge-error";
  return (
    <span class={`badge badge-sm ${tone} badge-soft`}>
      {delta.pct === 0 ? t("console.trend.flat") : `${delta.pct > 0 ? "+" : ""}${pct}%`}
    </span>
  );
}

function TrendCard({ label, metric, t }: { label: string; metric: MetricDelta; t: TFunc }) {
  return (
    <div class="stat-card">
      <div class="stat-label">{label}</div>
      <div class="stat-value flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{metric.current}</span>
        <DeltaBadge delta={metric} t={t} />
      </div>
      <div class="text-xs text-base-content/75 mt-0.5">{t("console.trend.previous", { n: metric.previous })}</div>
    </div>
  );
}

/**
 * Current vs previous period, led by the two numbers that answer "is anyone
 * finding this?" — distinct origins and distinct keys — rather than raw
 * request counts, which one crawler can dominate. The range selector is plain
 * links, so the whole page (this section and the 24 h detail below) re-renders
 * without an island.
 */
function TrendSection({ trend, t }: { trend: StatsComparison; t: TFunc }) {
  const { delta } = trend;
  return (
    <>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h2 class="text-lg font-semibold">{t("console.trend.title")}</h2>
        <div class="join">
          {[7, 28, 90].map((d) => (
            <a
              href={`/console/?days=${d}`}
              class={`btn btn-sm join-item${d === trend.days ? " btn-active" : ""}`}
              aria-current={d === trend.days ? "page" : undefined}
            >
              {t("console.trend.days", { n: d })}
            </a>
          ))}
        </div>
      </div>
      <p class="text-xs text-base-content/75 mb-3">{t("console.trend.hint", { days: trend.days })}</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <TrendCard label={t("console.trend.origins")} metric={delta.origins} t={t} />
        <TrendCard label={t("console.trend.keys")} metric={delta.keys} t={t} />
        <TrendCard label={t("console.trend.requests")} metric={delta.requests} t={t} />
        <TrendCard label={t("console.trend.errors")} metric={delta.errors} t={t} />
      </div>
      <Section title={t("console.trend.daily", { days: trend.days })}>
        <DailyChart daily={trend.daily} boundary={trend.days} />
      </Section>
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

function DashboardContent(props: { stats: Stats; trend: StatsComparison; keyCount: number; blockedCount: number; t: TFunc }) {
  const { stats, t } = props;
  const totals = stats.totals;
  const req = totals?.requests ?? 0;
  const hitRate = req ? `${Math.round(((totals?.cached ?? 0) / req) * 100)}%` : "—";
  const errRate = req ? `${Math.round(((totals?.errors ?? 0) / req) * 1000) / 10}%` : "—";
  const tabsI18n: StatsTabsI18n = {
    aria: t("statsTabs.aria"),
    byStatus: t("statsTabs.byStatus"),
    byMethod: t("statsTabs.byMethod"),
    byCountry: t("statsTabs.byCountry"),
    noData: t("statsTabs.noData"),
  };
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">{t("console.title.overview")}</h1>

      <TrendSection trend={props.trend} t={t} />

      <Section title={t("console.overview.last24hTitle")}>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat value={String(req)} label={t("console.overview.requests")} />
          <Stat value={humanBytes(totals?.res_bytes ?? 0)} label={t("console.overview.trafficOut")} />
          <Stat value={humanBytes(totals?.cached_bytes ?? 0)} label={t("console.overview.servedFromCache", { hits: hitRate })} />
          <Stat value={humanBytes(totals?.req_bytes ?? 0)} label={t("console.overview.trafficIn")} />
          <Stat
            value={totals?.avg_latency_ms ? `${Math.round(totals.avg_latency_ms)} ms` : "—"}
            label={t("console.overview.avgLatency", { max: totals?.max_latency_ms ?? "—" })}
          />
          <Stat value={errRate} label={t("console.overview.errorRate", { n: totals?.errors ?? 0 })} />
          <Stat value={String(props.keyCount)} label={t("console.overview.apiKeys")} />
          <Stat value={String(props.blockedCount)} label={t("console.overview.blockedHosts")} />
        </div>
      </Section>

      <Section title={t("console.overview.perHour")}>
        <HourlyChart hourly={stats.hourly} />
      </Section>

      <Section title={t("console.overview.topHosts")}>
        <DataTable
          head={
            <>
              <th>{t("console.overview.host")}</th>
              <th class="text-right">{t("console.overview.requestsRight")}</th>
              <th class="text-right">{t("console.overview.traffic")}</th>
            </>
          }
          body={
            stats.topHosts.length === 0 ? (
              <EmptyRow cols={3} text={t("console.overview.noData")} />
            ) : (
              stats.topHosts.map((r) => (
                <tr>
                  <td>
                    <code class="inline-block max-w-[11rem] truncate align-bottom sm:max-w-[22rem]" title={r.target_host}>
                      {r.target_host}
                    </code>
                  </td>
                  <td class="text-right tabular-nums">{r.n}</td>
                  <td class="text-right tabular-nums">{humanBytes(r.bytes)}</td>
                </tr>
              ))
            )
          }
        />
      </Section>

      <Section title={t("console.overview.topKeys")}>
        <DataTable
          head={
            <>
              <th>{t("console.overview.key")}</th>
              <th class="text-right">{t("console.overview.requestsRight")}</th>
              <th class="text-right">{t("console.overview.traffic")}</th>
            </>
          }
          body={
            stats.topKeys.length === 0 ? (
              <EmptyRow cols={3} text={t("console.overview.noData")} />
            ) : (
              stats.topKeys.map((r) => (
                <tr>
                  <td class="whitespace-nowrap">
                    <span class="inline-block max-w-[12rem] truncate align-bottom sm:max-w-[20rem]" title={r.name || undefined}>
                      {r.name ? r.name : <span class="text-base-content/75">{t("console.overview.anonymous")}</span>}
                    </span>
                  </td>
                  <td class="text-right tabular-nums">{r.n}</td>
                  <td class="text-right tabular-nums">{humanBytes(r.bytes)}</td>
                </tr>
              ))
            )
          }
        />
      </Section>

      <Section title={t("console.overview.breakdown")}>
        <StatsTabs
          status={stats.byStatus.map((r): BreakdownRow => ({ label: String(r.status), n: r.n, tone: toneForStatus(r.status) }))}
          method={stats.byMethod.map((r): BreakdownRow => ({ label: r.method, n: r.n }))}
          country={stats.byCountry.map((r): BreakdownRow => ({ label: r.country || "—", n: r.n }))}
          i18n={tabsI18n}
        />
      </Section>

      <Section title={t("console.overview.recentErrors")}>
        <DataTable
          head={
            <>
              <th>{t("console.overview.time")}</th>
              <th class="hidden sm:table-cell">{t("console.overview.method")}</th>
              <th>{t("console.overview.host")}</th>
              <th>{t("console.overview.status")}</th>
              <th>{t("console.overview.error")}</th>
            </>
          }
          body={
            stats.recentErrors.length === 0 ? (
              <EmptyRow cols={5} text={t("console.overview.none")} />
            ) : (
              stats.recentErrors.map((l) => (
                <tr>
                  <td class="text-base-content/75">
                    <RelTime value={l.created_at} t={t} />
                  </td>
                  <td class="hidden sm:table-cell">
                    <MethodBadge method={l.method} />
                  </td>
                  <td>
                    <code class="inline-block max-w-[9rem] truncate align-bottom sm:max-w-[16rem]" title={l.target_host}>
                      {l.target_host}
                    </code>
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

import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryStats } from "../../lib/admin.js";
import { logRetentionDays } from "../../lib/db.js";
import { getAdminUser } from "../../lib/access.js";

/**
 * `GET /api/metrics` — Prometheus text exposition, for a self-hoster's own
 * monitoring rather than the hosted instance's. It lives under `/api/*` on
 * purpose: that path already carries the admin guard, so "admin-gated" is a
 * property of where the route is rather than something each deployment has to
 * remember to configure.
 *
 * **Admin-gated**, deliberately: every number here describes a deployment's
 * traffic (hosts, keys, countries), and an open `/metrics` on a self-hoster who
 * forgot a rate limit is an easy thing to expose by accident. Scrape it with the
 * same credential as `/api/stats`:
 *
 *   curl -H "Authorization: Bearer $ADMIN_TOKEN" https://host/api/metrics
 *
 * The values come from the same 24 h window the console dashboard reads, so the
 * two can never disagree. Names are prefixed `corx_` and carry the window in the
 * metric name's help text; values are plain numbers (no units in the name, no
 * timestamps) so a scrape stays cheap.
 */
const app = new Hono<{ Bindings: Env }>();

/** Prometheus text escaping: only `\` and newlines are special. */
function esc(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n");
}

/**
 * A label value: quoted, so anything is allowed except a quote or a newline
 * (which would end the line). Length-capped so a pathological host name cannot
 * inflate every scrape.
 */
function label(value: string): string {
  return esc(String(value)).replace(/["\n]/g, " ").slice(0, 120);
}

function metric(name: string, help: string, type: "counter" | "gauge", value: number, extra = ""): string {
  return `# HELP corx_${name} ${help}\n# TYPE corx_${name} ${type}\ncorx_${name}${extra} ${Number.isFinite(value) ? value : 0}\n`;
}

app.get("/", async (c) => {
  if (!(await getAdminUser(c))) return c.json({ error: "Unauthorized" }, 401);

  const [stats, keyCount] = await Promise.all([
    queryStats(c.env.DB).catch(() => null),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE revoked_at IS NULL").first<{ n: number }>()
      .then((r) => r?.n ?? 0)
      .catch(() => 0),
  ]);
  const t = stats?.totals ?? null;
  const retention = logRetentionDays(c.env);

  let body = "";
  body += metric(
    "requests_24h",
    `Proxied requests in the last 24 hours (raw rows, LOG_RETENTION_DAYS=${retention}).`,
    "gauge",
    t?.requests ?? 0,
  );
  body += metric(
    "cache_hits_24h",
    "Cache hits in the last 24 hours (X-Corx-Cache: HIT or STALE).",
    "gauge",
    t?.cached ?? 0,
  );
  body += metric(
    "cache_hit_ratio_24h",
    "Cache hits divided by requests in the last 24 hours (0 when there was no traffic).",
    "gauge",
    t && t.requests > 0 ? t.cached / t.requests : 0,
  );
  body += metric("response_bytes_24h", "Response bytes delivered in the last 24 hours.", "counter", t?.res_bytes ?? 0);
  body += metric(
    "cached_response_bytes_24h",
    "Response bytes served from the R2 cache in the last 24 hours = upstream bandwidth saved.",
    "counter",
    t?.cached_bytes ?? 0,
  );
  body += metric("request_bytes_24h", "Request bytes forwarded in the last 24 hours.", "counter", t?.req_bytes ?? 0);
  body += metric("errors_24h", "Responses with status >= 500 or a logged error, last 24 hours.", "counter", t?.errors ?? 0);
  body += metric("latency_ms_average_24h", "Average end-to-end latency in ms over the last 24 hours.", "gauge", t?.avg_latency_ms ?? 0);
  body += metric("latency_ms_max_24h", "Slowest request in the last 24 hours, in ms.", "gauge", t?.max_latency_ms ?? 0);
  body += metric("active_keys", "API keys that exist and are not revoked.", "gauge", keyCount);
  body += metric(
    "log_retention_days",
    "Days of raw request_logs kept before the nightly prune (LOG_RETENTION_DAYS).",
    "gauge",
    retention,
  );
  body += metric("default_cache_ttl_seconds", "CACHE_TTL_SECONDS for this deployment.", "gauge", Number(c.env.CACHE_TTL_SECONDS ?? 0));
  body += metric(
    "stale_if_error_seconds",
    "CACHE_STALE_SECONDS: stale-if-error grace window (0 = disabled).",
    "gauge",
    Number(c.env.CACHE_STALE_SECONDS ?? 0),
  );

  // Breakdown series, capped: a top-N list is what a dashboard wants, and an
  // unbounded one would turn every scrape into a large response.
  for (const host of stats?.topHosts.slice(0, 20) ?? []) {
    body += metric(
      "host_requests_24h",
      "Requests per proxied host in the last 24 hours.",
      "gauge",
      host.n,
      `{host="${label(host.target_host)}"}`,
    );
  }
  for (const row of stats?.byStatus ?? []) {
    body += metric(
      "responses_by_status_24h",
      "Responses per upstream status code in the last 24 hours.",
      "gauge",
      row.n,
      `{status="${label(String(row.status))}"}`,
    );
  }
  for (const country of stats?.byCountry.slice(0, 20) ?? []) {
    body += metric(
      "requests_by_country_24h",
      "Requests per caller country in the last 24 hours.",
      "gauge",
      country.n,
      `{country="${label(country.country || "unknown")}"}`,
    );
  }

  return c.body(body, 200, {
    "content-type": "text/plain; version=0.0.4; charset=utf-8",
    // A scrape is a read of live numbers; never let an intermediary keep them.
    "cache-control": "no-store",
  });
});

export default app;
import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryStats } from "../../lib/admin.js";
import { humanBytes } from "../../lib/format.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { ConfirmButton } from "./_confirm.js";
import {
  parsePurgeScope,
  purgeCache,
  sampleByHost,
  sampleCache,
  type CacheSample,
} from "../../proxy/cache.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

/**
 * `/console/cache` — what the R2 cache holds, and the only way to drop an
 * entry before its TTL does.
 *
 * Two honest constraints shape the page:
 *
 *  - **The numbers are a sample.** Reading every key to count them would cost
 *    one R2 Class A op per entry on an operations page; a bounded sample plus an
 *    explicit "sample only" marker says the same thing for free.
 *  - **A purge walks the prefix.** Entries are keyed by a sha256 of the URL
 *    mixed with the key's response-rule fingerprint, so there is no key to
 *    compute for "every entry of this URL" — `purgeCache` matches the stored
 *    index instead, bounded by the nightly sweep's page budget, and the API
 *    reports `truncated` when the bucket is bigger than that.
 *
 * The purge forms POST to the console route (server-rendered, CSRF-protected);
 * the JSON twin is `POST /api/cache/purge`.
 */
const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const [sample, stats] = await Promise.all([
    sampleCache(c.env.CACHE_BUCKET),
    queryStats(c.env.DB).catch(() => null),
  ]);
  return c.render(
    <CacheContent
      sample={sample}
      totals={stats?.totals ?? null}
      hosts={sampleByHost(sample)}
      csrf={c.get("csrfToken") ?? ""}
      t={t}
    />,
    { title: t("console.title.cache") },
  );
});

app.post("/purge", async (c) => {
  const form = await c.req.parseBody();
  const scope = await parsePurgeScope({
    url: form["url"],
    host: form["host"],
    all: form["all"],
  });
  if (scope) {
    await purgeCache(c.env.CACHE_BUCKET, scope).catch(() => undefined);
  }
  return c.redirect("/console/cache", 302);
});

export default app;

// ---------- Page markup (colocated) ----------
function CacheContent(props: {
  sample: CacheSample;
  totals: { requests: number; cached: number; cached_bytes: number } | null;
  hosts: Array<{ host: string; entries: number; bytes: number }>;
  /** Session-bound CSRF token for the purge forms. */
  csrf: string;
  t: TFunc;
}) {
  const { t, sample } = props;
  const requests = props.totals?.requests ?? 0;
  const cached = props.totals?.cached ?? 0;
  const hitRatio = requests > 0 ? `${Math.round((cached / requests) * 100)}%` : null;

  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-1">{t("console.cache.title")}</h1>
      <p class="text-sm text-base-content/75 mb-4">{t("console.cache.sub")}</p>

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
        <Stat label={t("console.cache.entries")} value={String(sample.entries.length)} />
        <Stat label={t("console.cache.bytes")} value={humanBytes(sample.bytes)} />
        <Stat
          label={t("console.cache.hitRatio")}
          value={hitRatio ?? t("console.cache.noHits")}
          muted={!hitRatio}
        />
        <Stat label={t("console.cache.cachedBytes")} value={humanBytes(props.totals?.cached_bytes ?? 0)} />
      </div>

      {sample.truncated ? (
        <div class="text-xs text-warning mb-3">{t("console.cache.truncated")}</div>
      ) : null}
      {sample.expired > 0 ? (
        <div class="text-xs text-base-content/75 mb-3">
          {t("console.cache.expired")}: {sample.expired}
        </div>
      ) : null}

      <h2 class="text-lg font-semibold mb-2">{t("console.cache.purgeTitle")}</h2>
      <p class="text-sm text-base-content/75 mb-3">{t("console.cache.purgeSub")}</p>

      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-4">
        <div class="flex flex-wrap items-center gap-3">
          <form method="post" action="/console/cache/purge" class="flex flex-wrap items-center gap-2">
            <input type="hidden" name="csrf" value={props.csrf} />
            <input
              name="url"
              placeholder={t("console.cache.urlPh")}
              aria-label={t("console.cache.purgeUrl")}
              class="input input-bordered input-sm flex-1 min-w-[14rem]"
            />
            <button class="btn btn-sm shrink-0">{t("console.cache.purgeUrl")}</button>
          </form>
          <form method="post" action="/console/cache/purge" class="flex flex-wrap items-center gap-2">
            <input type="hidden" name="csrf" value={props.csrf} />
            <input
              name="host"
              placeholder={t("console.cache.hostPh")}
              aria-label={t("console.cache.purgeHost")}
              class="input input-bordered input-sm flex-1 min-w-[10rem]"
            />
            <button class="btn btn-sm shrink-0">{t("console.cache.purgeHost")}</button>
          </form>
          <form method="post" action="/console/cache/purge">
            <ConfirmButton
              action="/console/cache/purge"
              csrf={props.csrf}
              label={t("console.cache.purgeAll")}
              fields={{ all: "1" }}
              triggerClass="btn btn-sm btn-error btn-outline"
              confirmClass="btn btn-error"
              i18n={{
                title: t("console.cache.purgeAllTitle"),
                body: t("console.cache.purgeAllBody"),
                confirm: t("console.cache.purgeAll"),
                cancel: t("ui.cancel"),
                close: t("ui.close"),
              }}
            />
          </form>
        </div>
      </div>

      <h2 class="text-lg font-semibold mb-2">{t("console.cache.topHosts")}</h2>
      <DataTable
        head={
          <>
            <th>host</th>
            <th class="text-right">{t("console.cache.entries")}</th>
            <th class="text-right">{t("console.cache.bytes")}</th>
          </>
        }
        body={
          props.hosts.length === 0 ? (
            <EmptyRow cols={3} text={t("console.cache.empty")} />
          ) : (
            props.hosts.map((h) => (
              <tr>
                <td class="whitespace-nowrap">
                  <code>{h.host}</code>
                </td>
                <td class="text-right tabular-nums">{h.entries}</td>
                <td class="text-right tabular-nums">{humanBytes(h.bytes)}</td>
              </tr>
            ))
          )
        }
      />
    </>
  );
}

function Stat(props: { label: string; value: string; muted?: boolean }) {
  return (
    <div class="bg-base-100 border border-base-300 rounded-box p-3">
      <div class="text-xs text-base-content/75">{props.label}</div>
      <div class={`text-xl font-semibold tabular-nums ${props.muted ? "text-base-content/75" : ""}`}>
        {props.value}
      </div>
    </div>
  );
}
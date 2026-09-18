import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryKeys, queryLastUsed } from "../../lib/admin.js";
import type { KeyRow } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { RelTime } from "../../components/time.js";
import { readStoredInjection } from "../../proxy/inject.js";
import { logRetentionDays } from "../../lib/db.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const keys = await queryKeys(c.env.DB);
  return c.render(
    <KeysContent
      keys={keys}
      showRevoked={c.req.query("revoked") === "1"}
      query={(c.req.query("q") ?? "").trim()}
      sort={sortKey(c.req.query("sort"))}
      dir={c.req.query("dir") === "desc" ? "desc" : "asc"}
      lastUsed={await queryLastUsed(c.env.DB, logRetentionDays(c.env))}
      logDays={logRetentionDays(c.env)}
      t={t}
    />,
    {
      title: t("console.title.keys"),
    },
  );
});

export default app;

// ---------- Page markup (colocated) ----------

/** Sortable columns of the keys table; anything else falls back to created. */
type KeySort = "name" | "rate" | "origins" | "lastUsed" | "created";
function sortKey(raw: string | undefined): KeySort {
  return raw === "name" || raw === "rate" || raw === "origins" || raw === "lastUsed" ? raw : "created";
}

/** How many injection entries a key carries (badge on the keys table). */
function injectionCount(k: KeyRow): number {
  const injection = readStoredInjection(k);
  return (
    injection.vars.length + injection.headers.length + injection.params.length + injection.responseHeaders.length
  );
}

function cacheText(k: KeyRow, t: TFunc): string {
  if (k.no_cache) return t("console.keys.noCacheValue");
  if (k.cache_ttl != null) return t("console.keys.ttlValue", { ttl: k.cache_ttl });
  return t("console.keys.global");
}

/**
 * "Last used" from the raw-log window. No entry = no request in that window,
 * which is not the same as never used — the dash says exactly that much.
 */
function lastUsedCell(k: KeyRow, lastUsed: Map<string, string> | undefined, t: TFunc) {
  const at = lastUsed?.get(k.id);
  if (!at) return <span class="text-base-content/75">—</span>;
  return <RelTime value={at} t={t} />;
}

/**
 * The keys list: one row per key, linking to its page (where policy, injection
 * and the danger zone live), plus server-side filter and sort. Everything a
 * row does is a GET, so the view is linkable and needs no island.
 */
function KeysContent(props: {
  keys: KeyRow[];
  /** "Show revoked" view state (?revoked=1): dead keys stay inspectable. */
  showRevoked?: boolean;
  /** Name/host/origin filter text (?q=). */
  query?: string;
  /** Column sort (?sort= / ?dir=). */
  sort?: KeySort;
  dir?: "asc" | "desc";
  /** Key id → last request inside the raw-log window. */
  lastUsed?: Map<string, string>;
  /** Raw-log retention, for the last-used caveat. */
  logDays?: number;
  t: TFunc;
}) {
  const { t } = props;
  // Revoked keys are dead at the edge, but they are not gone: the row keeps
  // its policy and its traffic attributable until someone cleans it up. Hidden
  // by default so the working list stays a working list.
  const showRevoked = props.showRevoked ?? false;
  const query = props.query ?? "";
  const sort = props.sort ?? "created";
  const dir = props.dir ?? "desc";
  const revokedCount = props.keys.filter((k) => k.revoked_at).length;
  const visible = showRevoked ? props.keys : props.keys.filter((k) => !k.revoked_at);
  const needle = query.toLowerCase();
  const matches = needle
    ? visible.filter((k) =>
        [k.name, k.allowed_origins, k.allowed_hosts].some((v) => (v ?? "").toLowerCase().includes(needle)),
      )
    : visible;
  const sortValue = (k: KeyRow): string | number => {
    switch (sort) {
      case "name":
        return (k.name || "").toLowerCase();
      case "rate":
        return k.rate_limit_per_min ?? -1;
      case "origins":
        return (k.allowed_origins ?? "").toLowerCase();
      case "lastUsed":
        return props.lastUsed?.get(k.id) ?? "";
      default:
        return k.created_at;
    }
  };
  const keys = [...matches].sort((a, b) => {
    const va = sortValue(a);
    const vb = sortValue(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
    return (dir === "asc" ? 1 : -1) * cmp;
  });
  // One place decides the URL, so a link changes one thing (sort, filter,
  // toggle) without dropping the rest.
  const pageHref = (over: { q?: string; revoked?: boolean; sort?: KeySort; dir?: "asc" | "desc" } = {}) => {
    const p = new URLSearchParams();
    const q = over.q !== undefined ? over.q : query;
    if (q) p.set("q", q);
    if (over.revoked !== undefined ? over.revoked : showRevoked) p.set("revoked", "1");
    const s = over.sort ?? sort;
    const d = over.dir ?? dir;
    if (s !== "created" || d !== "desc") {
      p.set("sort", s);
      p.set("dir", d);
    }
    const qs = p.toString();
    return qs ? `/console/keys?${qs}` : "/console/keys";
  };
  const sortLabel = (col: KeySort, label: string) => (
    <a
      class="link link-hover whitespace-nowrap"
      href={pageHref({ sort: col, dir: sort === col && dir === "asc" ? "desc" : "asc" })}
    >
      {label}
      {sort === col ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </a>
  );
  return (
    <>
      <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 class="text-3xl font-semibold tracking-tight">{t("console.title.keys")}</h1>
        <div class="flex items-center gap-2">
          {revokedCount > 0 ? (
            <a
              class="btn btn-ghost btn-sm"
              href={showRevoked ? pageHref({ revoked: false }) : pageHref({ revoked: true })}
            >
              {showRevoked ? t("console.keys.hideRevoked") : t("console.keys.showRevoked", { n: revokedCount })}
            </a>
          ) : null}
          <a class="btn btn-primary btn-sm" href="/console/keys/new">
            {t("console.keys.create")}
          </a>
        </div>
      </div>

      <form method="get" action="/console/keys" class="mb-3 flex flex-wrap items-center gap-2">
        {showRevoked ? <input type="hidden" name="revoked" value="1" /> : null}
        {sort !== "created" || dir !== "desc" ? (
          <>
            <input type="hidden" name="sort" value={sort} />
            <input type="hidden" name="dir" value={dir} />
          </>
        ) : null}
        <input
          name="q"
          value={query}
          placeholder={t("console.keys.filterPh")}
          aria-label={t("console.keys.filterPh")}
          class="input input-bordered input-sm w-full max-w-xs"
        />
        <button class="btn btn-sm shrink-0">{t("console.keys.filter")}</button>
        {query ? (
          <a class="btn btn-ghost btn-sm" href={pageHref({ q: "" })}>
            {t("console.keys.filterClear")}
          </a>
        ) : null}
      </form>

      <DataTable
        head={
          <>
            <th>{sortLabel("name", t("console.keys.headName"))}</th>
            <th>{sortLabel("rate", t("console.keys.headRate"))}</th>
            <th>{sortLabel("origins", t("console.keys.headOrigins"))}</th>
            <th class="hidden sm:table-cell">{t("console.keys.headCache")}</th>
            <th class="hidden md:table-cell">{sortLabel("lastUsed", t("console.keys.headLastUsed"))}</th>
            <th class="hidden sm:table-cell">{sortLabel("created", t("console.keys.headCreated"))}</th>
            <th></th>
          </>
        }
        body={
          keys.length === 0 ? (
            <EmptyRow cols={7} text={query ? t("console.keys.emptyMatch") : t("console.keys.empty")} />
          ) : (
            keys.map((k) => (
              <tr>
                <td class="whitespace-nowrap">
                  {k.name || <span class="text-base-content/75">—</span>}
                  {k.revoked_at ? (
                    <span class="badge badge-error badge-outline badge-sm ml-2 align-middle">
                      {t("console.keys.badgeRevoked")}
                    </span>
                  ) : null}
                  {k.keyless ? (
                    <span class="badge badge-outline badge-sm ml-2 align-middle">{t("console.keys.badgeKeyless")}</span>
                  ) : null}
                  {k.tier === "public" ? (
                    <span class="badge badge-primary badge-sm ml-2 align-middle">{t("console.keys.badgePublic")}</span>
                  ) : null}
                  {injectionCount(k) > 0 ? (
                    <span class="badge badge-outline badge-sm ml-2 align-middle">
                      {t("console.keys.badgeInject", { n: injectionCount(k) })}
                    </span>
                  ) : null}
                </td>
                <td class="tabular-nums">{k.rate_limit_per_min ?? t("console.keys.default")}</td>
                <td>
                  <code class="text-base-content/75">{k.allowed_origins || t("console.keys.global")}</code>
                </td>
                <td class="hidden sm:table-cell">
                  <code class="text-base-content/75">{cacheText(k, t)}</code>
                </td>
                <td class="hidden md:table-cell">{lastUsedCell(k, props.lastUsed, t)}</td>
                <td class="hidden text-base-content/75 sm:table-cell">
                  <RelTime value={k.created_at} t={t} />
                </td>
                <td>
                  <div class="flex items-center justify-end gap-1">
                    <a class="btn btn-xs btn-ghost" href={`/console/logs?key=${k.id}`}>
                      {t("console.keys.logsLink")}
                    </a>
                    <a class="btn btn-xs btn-ghost" href={`/console/playground?key=${k.id}`}>
                      {t("console.keys.playgroundLink")}
                    </a>
                    <a class="btn btn-xs" href={`/console/keys/${k.id}`}>
                      {k.revoked_at ? t("console.keys.view") : t("console.keys.edit")}
                    </a>
                  </div>
                </td>
              </tr>
            ))
          )
        }
      />

      {/* Intentionally injected as trusted HTML: the code pills are part of the copy. */}
      <p
        class="text-xs text-base-content/75"
        dangerouslySetInnerHTML={{
          __html: t("console.keys.hint", {
            code: "<code>ALLOWED_ORIGINS</code>",
            opt: "<code>OPTIONS</code>",
            query: "<code>?corx-key=</code>",
          }),
        }}
      />
      <p class="mt-1 text-xs text-base-content/75">{t("console.keys.hintInjection")}</p>
      {props.logDays != null ? (
        <p class="mt-1 text-xs text-base-content/75">{t("console.keys.lastUsedHint", { days: props.logDays })}</p>
      ) : null}
    </>
  );
}

import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys, queryLastUsed, updateApiKey } from "../../lib/admin.js";
import type { KeyRow } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { RelTime } from "../../components/time.js";
import CopyButton from "../../islands/copy-button.js";
import KeyPanel, { type KeyFormValues, type KeyPanelI18n } from "../../islands/key-panel.js";
import { readStoredInjection } from "../../proxy/inject.js";
import { effectiveOrigins } from "../../proxy/cors.js";
import { num } from "../../lib/utils.js";
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
      newKey={null}
      createDraft={presetValues(c.req.query("preset"))}
      showRevoked={c.req.query("revoked") === "1"}
      query={(c.req.query("q") ?? "").trim()}
      sort={sortKey(c.req.query("sort"))}
      dir={c.req.query("dir") === "desc" ? "desc" : "asc"}
      lastUsed={await queryLastUsed(c.env.DB, logRetentionDays(c.env))}
      logDays={logRetentionDays(c.env)}
      defaults={panelDefaults(c.env)}
      csrf={c.get("csrfToken") ?? ""}
      t={t}
    />,
    {
      title: t("console.title.keys"),
    },
  );
});

app.post("/", async (c) => {
  const t = consoleT(c);
  const values = readKeyForm(await c.req.parseBody());
  try {
    const { id, key } = await createApiKey(c.env.DB, {
      name: values.name,
      rateLimitPerMin: parseRate(values.rateLimitPerMin),
      allowedOrigins: values.allowedOrigins,
      cacheTtl: values.cacheTtl,
      noCache: values.noCache,
      ipCheck: values.ipCheck,
      dnsCheck: values.dnsCheck,
      keyless: values.keyless,
      tier: values.tier ? "public" : "standard",
      dailyLimitPerOrigin: values.dailyLimitPerOrigin,
      dailyLimitPerHost: values.dailyLimitPerHost,
      dailyLimitTotal: values.dailyLimitTotal,
    }, c.env.INJECTION_KEK);
    // The raw key is shown once — re-render with it, don't redirect.
    return c.render(
      <KeysContent
        keys={await queryKeys(c.env.DB)}
        defaults={panelDefaults(c.env)}
        newKey={{ id, key, name: values.name }}
        csrf={c.get("csrfToken") ?? ""}
        t={t}
      />,
      {
        title: t("console.title.keys"),
      },
    );
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.createFailed");
    return c.render(
      <KeysContent
        keys={await queryKeys(c.env.DB)}
        defaults={panelDefaults(c.env)}
        newKey={null}
        error={error}
        createDraft={values}
        csrf={c.get("csrfToken") ?? ""}
        t={t}
      />,
      { title: t("console.title.keys") },
    );
  }
});

app.post("/:id", async (c) => {
  const t = consoleT(c);
  const id = c.req.param("id") ?? "";
  const values = readKeyForm(await c.req.parseBody());
  try {
    await updateApiKey(c.env.DB, id, {
      name: values.name,
      rateLimitPerMin: parseRate(values.rateLimitPerMin),
      allowedOrigins: values.allowedOrigins,
      cacheTtl: values.cacheTtl,
      noCache: values.noCache,
      ipCheck: values.ipCheck,
      dnsCheck: values.dnsCheck,
      keyless: values.keyless,
      tier: values.tier ? "public" : "standard",
      dailyLimitPerOrigin: values.dailyLimitPerOrigin,
      dailyLimitPerHost: values.dailyLimitPerHost,
      dailyLimitTotal: values.dailyLimitTotal,
    }, c.env.INJECTION_KEK);
    return c.redirect("/console/keys", 302);
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.saveFailed");
    return c.render(
      <KeysContent
        keys={await queryKeys(c.env.DB)}
        defaults={panelDefaults(c.env)}
        newKey={null}
        error={error}
        editDraft={{ id, values }}
        csrf={c.get("csrfToken") ?? ""}
        t={t}
      />,
      { title: t("console.title.keys") },
    );
  }
});

/** Hard delete — the panel asks the admin to type the key's name first. */
app.post("/:id/delete", async (c) => {
  const t = consoleT(c);
  const id = c.req.param("id") ?? "";
  const form = await c.req.parseBody();
  const confirm = String(form["confirmName"] ?? "").trim();
  const keys = await queryKeys(c.env.DB);
  const key = keys.find((k) => k.id === id);
  const fail = (error: string) =>
    c.render(
      <KeysContent
        keys={keys}
        defaults={panelDefaults(c.env)}
        newKey={null}
        error={error}
        editDraft={key ? { id, values: rowValues(key) } : undefined}
        csrf={c.get("csrfToken") ?? ""}
        t={t}
      />,
      { title: t("console.title.keys") },
    );
  if (!key) return fail(t("console.keys.deleteFailed"));
  if (confirm !== key.name) return fail(t("console.keys.deleteMismatch", { name: key.name }));
  await c.env.DB.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
  return c.redirect("/console/keys", 302);
});

/**
 * Kill switch — the row survives so its logs stay attributable; Delete is the
 * cleanup. Same type-the-name guard as delete, and the redirect turns the
 * "show revoked" toggle on so the newly dead key is visibly still here.
 */
app.post("/:id/revoke", async (c) => {
  const t = consoleT(c);
  const id = c.req.param("id") ?? "";
  const form = await c.req.parseBody();
  const confirm = String(form["confirmName"] ?? "").trim();
  const keys = await queryKeys(c.env.DB);
  const key = keys.find((k) => k.id === id);
  const fail = (error: string) =>
    c.render(
      <KeysContent
        keys={keys}
        defaults={panelDefaults(c.env)}
        newKey={null}
        error={error}
        editDraft={key ? { id, values: rowValues(key) } : undefined}
        csrf={c.get("csrfToken") ?? ""}
        t={t}
      />,
      { title: t("console.title.keys") },
    );
  if (!key) return fail(t("console.keys.revokeFailed"));
  if (confirm !== key.name) return fail(t("console.keys.revokeMismatch", { name: key.name }));
  await c.env.DB.prepare(
    "UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
  )
    .bind(id)
    .run();
  return c.redirect("/console/keys?revoked=1", 302);
});

export default app;

// ---------- Page markup (colocated) ----------

/** Read the create/edit key form. Values stay raw so the server can echo them back. */
function readKeyForm(form: Record<string, unknown>): KeyFormValues {
  const on = (key: string) => String(form[key] ?? "") === "on";
  // The panel sends a `checks` marker; posts without it (scripts, stale forms)
  // keep the guards on rather than silently turning them off.
  const panel = form["checks"] !== undefined;
  return {
    name: String(form["name"] ?? ""),
    rateLimitPerMin: String(form["rateLimitPerMin"] ?? ""),
    allowedOrigins: String(form["allowedOrigins"] ?? ""),
    cacheTtl: String(form["cacheTtl"] ?? ""),
    noCache: on("noCache"),
    ipCheck: panel ? on("ipCheck") : true,
    dnsCheck: panel ? on("dnsCheck") : true,
    keyless: on("keyless"),
    tier: on("tier"),
    dailyLimitPerOrigin: String(form["dailyLimitPerOrigin"] ?? ""),
    dailyLimitPerHost: String(form["dailyLimitPerHost"] ?? ""),
    dailyLimitTotal: String(form["dailyLimitTotal"] ?? ""),
  };
}

/** An empty create form: the SSRF guards default on, like the panel renders them. */
function blankKeyForm(): KeyFormValues {
  return {
    name: "",
    rateLimitPerMin: "",
    allowedOrigins: "",
    cacheTtl: "",
    noCache: false,
    ipCheck: true,
    dnsCheck: true,
    keyless: false,
    tier: false,
    dailyLimitPerOrigin: "",
    dailyLimitPerHost: "",
    dailyLimitTotal: "",
  };
}

/**
 * Create-panel presets (`?preset=`), as server-side pre-fills: the panel opens
 * with them and nothing is saved until the operator creates the key. Only the
 * shapes this panel can express — an upstream secret's hosts, variables and
 * rules live on the key's own injection page, once it exists.
 */
function presetValues(name: string | undefined): KeyFormValues | undefined {
  const base = blankKeyForm();
  switch (name) {
    case "local":
      return { ...base, allowedOrigins: "http://localhost:*", keyless: true };
    case "public":
      return {
        ...base,
        tier: true,
        dailyLimitPerOrigin: "3000",
        dailyLimitPerHost: "5000",
        dailyLimitTotal: "15000",
      };
    default:
      return undefined;
  }
}

/** "120" → 120; blank or junk → null (inherit the deployment default). */
function parseRate(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A key row as panel values (used as the edit panel's initial state). */
function rowValues(k: KeyRow): KeyFormValues {
  return {
    name: k.name,
    rateLimitPerMin: k.rate_limit_per_min != null ? String(k.rate_limit_per_min) : "",
    allowedOrigins: k.allowed_origins ?? "",
    cacheTtl: k.cache_ttl != null ? String(k.cache_ttl) : "",
    noCache: !!k.no_cache,
    ipCheck: !!k.ip_check,
    dnsCheck: !!k.dns_check,
    keyless: !!k.keyless,
    tier: k.tier === "public",
    dailyLimitPerOrigin: k.daily_limit_per_origin != null ? String(k.daily_limit_per_origin) : "",
    dailyLimitPerHost: k.daily_limit_per_host != null ? String(k.daily_limit_per_host) : "",
    dailyLimitTotal: k.daily_limit_total != null ? String(k.daily_limit_total) : "",
  };
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

/** Sortable columns of the keys table; anything else falls back to created. */
export type KeySort = "name" | "rate" | "origins" | "lastUsed" | "created";
function sortKey(raw: string | undefined): KeySort {
  return raw === "name" || raw === "rate" || raw === "origins" || raw === "lastUsed" ? raw : "created";
}

/**
 * The deployment defaults the panel's "blank = …" lines report. Sourced from
 * the same env vars and helpers the proxy uses, so the two cannot drift.
 */
function panelDefaults(env: Env): { rate: string; origins: string; ttl: string; publicTtl: string } {
  const origins = effectiveOrigins(env, null);
  return {
    rate: String(num(env.RATE_LIMIT_PER_MIN, 60)),
    origins: origins === "*" ? "*" : origins.join(", "),
    ttl: String(num(env.CACHE_TTL_SECONDS, 3600)),
    publicTtl: String(num(env.PUBLIC_CACHE_TTL_SECONDS, 300)),
  };
}

function panelLabels(
  t: TFunc,
  defaults: { rate: string; origins: string; ttl: string; publicTtl: string },
): KeyPanelI18n {
  return {
    name: t("console.keys.name"),
    namePh: t("console.keys.namePh"),
    ratePerMin: t("console.keys.ratePerMin"),
    ratePh: t("console.keys.ratePh"),
    allowedOrigins: t("console.keys.allowedOrigins"),
    originsPh: t("console.keys.originsPh"),
    cacheTtl: t("console.keys.cacheTtl"),
    cacheTtlTitle: t("console.keys.cacheTtlTitle"),
    ttlPh: t("console.keys.ttlPh"),
    noCache: t("console.keys.noCache"),
    noCacheShort: t("console.keys.noCacheShort"),
    noCacheHint: t("console.keys.noCacheTitle"),
    checks: t("console.keys.checks"),
    advanced: t("console.keys.advanced"),
    presets: t("console.keys.presets"),
    presetLocal: t("console.keys.presetLocal"),
    presetPublic: t("console.keys.presetPublic"),
    ipCheck: t("console.keys.ipCheck"),
    ipCheckHint: t("console.keys.ipCheckHint"),
    dnsCheck: t("console.keys.dnsCheck"),
    dnsCheckHint: t("console.keys.dnsCheckHint"),
    keyless: t("console.keys.keyless"),
    keylessHint: t("console.keys.keylessHint"),
    publicTier: t("console.keys.publicTier"),
    publicTierHint: t("console.keys.publicTierHint"),
    dailyLimits: t("console.keys.dailyLimits"),
    dailyLimitPerOrigin: t("console.keys.dailyLimitPerOrigin"),
    dailyLimitPerHost: t("console.keys.dailyLimitPerHost"),
    dailyLimitTotal: t("console.keys.dailyLimitTotal"),
    dailyLimitPh: t("console.keys.dailyLimitPh"),
    danger: t("console.keys.danger"),
    dangerHint: t("console.keys.dangerHint"),
    delete: t("console.keys.delete"),
    deleteTitle: t("console.keys.deleteTitle"),
    deleteHint: t("console.keys.deleteHint"),
    deleteConfirm: t("console.keys.deleteConfirm"),
    cancel: t("ui.cancel"),
    close: t("ui.close"),
    rateDefault: t("console.keys.rateDefault", { value: defaults.rate }),
    originsDefault: t("console.keys.originsDefault", { value: defaults.origins }),
    cacheDefault: t("console.keys.cacheDefault", { ttl: defaults.ttl, publicTtl: defaults.publicTtl }),
    discardConfirm: t("console.keys.discardConfirm"),
    saving: t("console.keys.saving"),
    revokedHint: t("console.keys.revokedHint"),
    revoke: t("console.keys.revoke"),
    revokeTitle: t("console.keys.revokeTitle"),
    revokeHint: t("console.keys.revokeHint"),
  };
}

function KeysContent(props: {
  keys: KeyRow[];
  newKey: { id: string; key: string; name: string } | null;
  error?: string | null;
  /** Values to re-open the create panel with (a create failed). */
  createDraft?: KeyFormValues;
  /** Key + values to re-open the edit panel with (a save or delete failed). */
  editDraft?: { id: string; values: KeyFormValues };
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
  /** The deployment's effective defaults (the panel's "blank = …" lines). */
  defaults: { rate: string; origins: string; ttl: string; publicTtl: string };
  /** Session-bound CSRF token for every POST form on the page. */
  csrf: string;
  t: TFunc;
}) {
  const { t } = props;
  const labels = panelLabels(t, props.defaults);
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
    <a class="link link-hover whitespace-nowrap" href={pageHref({ sort: col, dir: sort === col && dir === "asc" ? "desc" : "asc" })}>
      {label}
      {sort === col ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </a>
  );
  // A failed save re-opens exactly one panel, and the message belongs inside
  // it: a top-layer <dialog> covers the page alert. The page alert stays for
  // failures with no panel to land in (e.g. an unknown key on delete).
  const editOpen = props.editDraft != null && keys.some((k) => k.id === props.editDraft?.id);
  const panelOpen = props.createDraft != null || editOpen;
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
          <KeyPanel
            trigger={t("console.keys.create")}
            triggerClass="btn btn-primary btn-sm"
            title={t("console.keys.createTitle")}
            submit={t("console.keys.create")}
            action="/console/keys"
            values={props.createDraft}
            open={props.createDraft != null}
            presets
            expandAdvanced={props.createDraft?.tier === true}
            error={props.createDraft ? props.error : null}
            csrf={props.csrf}
            defaults={props.defaults}
            labels={labels}
          />
        </div>
      </div>

      {props.error && !panelOpen && (
        <div role="alert" class="alert alert-error mb-4">
          <span>{props.error}</span>
        </div>
      )}

      {props.newKey && (
        <div role="status" class="alert alert-success mb-4">
          <div class="min-w-0">
            <b>{t("console.keys.newKey")}</b>
            <div class="flex items-center gap-2 mt-1">
              <code class="break-all">{props.newKey.key}</code>
              <CopyButton text={props.newKey.key} labels={{ copy: t("copy.copy"), copied: t("copy.copied") }} />
            </div>
            <div class="text-xs opacity-70 mt-1">
              id: {props.newKey.id} · name: {props.newKey.name}
            </div>
          </div>
        </div>
      )}

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
                    <a
                      href={`/console/keys/${k.id}`}
                      class="badge badge-outline badge-sm ml-2 align-middle hover:badge-primary"
                    >
                      {t("console.keys.badgeInject", { n: injectionCount(k) })}
                    </a>
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
                    <a class="btn btn-xs btn-ghost" href={`/console/keys/${k.id}`}>
                      {t("console.keys.injectionLink")}
                    </a>
                    <a class="btn btn-xs btn-ghost" href={`/console/logs?key=${k.id}`}>
                      {t("console.keys.logsLink")}
                    </a>
                    <a class="btn btn-xs btn-ghost" href={`/console/playground?key=${k.id}`}>
                      {t("console.keys.playgroundLink")}
                    </a>
                    <KeyPanel
                      trigger={k.revoked_at ? t("console.keys.view") : t("console.keys.edit")}
                      triggerClass="btn btn-xs"
                      title={k.revoked_at ? t("console.keys.viewTitle") : t("console.keys.editTitle")}
                      submit={t("console.keys.save")}
                      action={`/console/keys/${k.id}`}
                      values={props.editDraft?.id === k.id ? props.editDraft.values : rowValues(k)}
                      open={props.editDraft?.id === k.id}
                      error={props.editDraft?.id === k.id ? props.error : null}
                      deleteAction={`/console/keys/${k.id}/delete`}
                      revokeAction={k.revoked_at ? undefined : `/console/keys/${k.id}/revoke`}
                      revoked={!!k.revoked_at}
                      keyName={k.name}
                      csrf={props.csrf}
                      defaults={props.defaults}
                      labels={labels}
                    />
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

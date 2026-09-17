import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys, updateApiKey } from "../../lib/admin.js";
import type { KeyRow } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { RelTime } from "../../components/time.js";
import CopyButton from "../../islands/copy-button.js";
import KeyPanel, { type KeyFormValues, type KeyPanelI18n } from "../../islands/key-panel.js";
import { readStoredInjection, rulesToText, varsToText } from "../../proxy/inject.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} t={t} />, {
    title: t("console.title.keys"),
  });
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
      allowedHosts: values.allowedHosts,
      vars: values.vars,
      headerRules: values.headerRules,
      paramRules: values.paramRules,
      responseRules: values.responseRules,
    }, c.env.INJECTION_KEK);
    // The raw key is shown once — re-render with it, don't redirect.
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={{ id, key, name: values.name }} t={t} />, {
      title: t("console.title.keys"),
    });
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.createFailed");
    return c.render(
      <KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} createDraft={values} t={t} />,
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
      allowedHosts: values.allowedHosts,
      vars: values.vars,
      headerRules: values.headerRules,
      paramRules: values.paramRules,
    }, c.env.INJECTION_KEK);
    return c.redirect("/console/keys", 302);
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.saveFailed");
    return c.render(
      <KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} editDraft={{ id, values }} t={t} />,
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
        newKey={null}
        error={error}
        editDraft={key ? { id, values: rowValues(key) } : undefined}
        t={t}
      />,
      { title: t("console.title.keys") },
    );
  if (!key) return fail(t("console.keys.deleteFailed"));
  if (confirm !== key.name) return fail(t("console.keys.deleteMismatch", { name: key.name }));
  await c.env.DB.prepare("DELETE FROM api_keys WHERE id = ?").bind(id).run();
  return c.redirect("/console/keys", 302);
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
    allowedHosts: String(form["allowedHosts"] ?? ""),
    vars: String(form["vars"] ?? ""),
    headerRules: String(form["headerRules"] ?? ""),
    paramRules: String(form["paramRules"] ?? ""),
    responseRules: String(form["responseRules"] ?? ""),
  };
}

/** "120" → 120; blank or junk → null (inherit the deployment default). */
function parseRate(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** A key row as panel values (used as the edit panel's initial state). */
function rowValues(k: KeyRow): KeyFormValues {
  const injection = readStoredInjection(k);
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
    allowedHosts: k.allowed_hosts ?? "",
    vars: varsToText(injection.vars),
    headerRules: rulesToText(injection.headers, "header"),
    paramRules: rulesToText(injection.params, "param"),
    responseRules: rulesToText(injection.responseHeaders, "response"),
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

function panelLabels(t: TFunc): KeyPanelI18n {
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
    allowedHosts: t("console.keys.allowedHosts"),
    allowedHostsPh: t("console.keys.allowedHostsPh"),
    injection: t("console.keys.injection"),
    injectionHint: t("console.keys.injectionHint"),
    vars: t("console.keys.vars"),
    varsPh: t("console.keys.varsPh"),
    headerRules: t("console.keys.headerRules"),
    headerRulesPh: t("console.keys.headerRulesPh"),
    paramRules: t("console.keys.paramRules"),
    paramRulesPh: t("console.keys.paramRulesPh"),
    responseRules: t("console.keys.responseRules"),
    responseRulesPh: t("console.keys.responseRulesPh"),
    responseRulesHint: t("console.keys.responseRulesHint"),
    danger: t("console.keys.danger"),
    dangerHint: t("console.keys.dangerHint"),
    delete: t("console.keys.delete"),
    deleteTitle: t("console.keys.deleteTitle"),
    deleteHint: t("console.keys.deleteHint"),
    deleteConfirm: t("console.keys.deleteConfirm"),
    cancel: t("ui.cancel"),
    close: t("ui.close"),
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
  t: TFunc;
}) {
  const { t } = props;
  const labels = panelLabels(t);
  // Revoked keys (API-side kill switch) are dead: not listed, not editable.
  const keys = props.keys.filter((k) => !k.revoked_at);
  return (
    <>
      <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
        <h1 class="text-3xl font-semibold tracking-tight">{t("console.title.keys")}</h1>
        <KeyPanel
          trigger={t("console.keys.create")}
          triggerClass="btn btn-primary btn-sm"
          title={t("console.keys.createTitle")}
          submit={t("console.keys.create")}
          action="/console/keys"
          values={props.createDraft}
          open={props.createDraft != null}
          labels={labels}
        />
      </div>

      {props.error && (
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

      <DataTable
        head={
          <>
            <th>{t("console.keys.headName")}</th>
            <th>{t("console.keys.headRate")}</th>
            <th>{t("console.keys.headOrigins")}</th>
            <th class="hidden sm:table-cell">{t("console.keys.headCache")}</th>
            <th class="hidden sm:table-cell">{t("console.keys.headCreated")}</th>
            <th></th>
          </>
        }
        body={
          keys.length === 0 ? (
            <EmptyRow cols={6} text={t("console.keys.empty")} />
          ) : (
            keys.map((k) => (
              <tr>
                <td class="whitespace-nowrap">
                  {k.name || <span class="text-base-content/75">—</span>}
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
                <td class="hidden text-base-content/75 sm:table-cell">
                  <RelTime value={k.created_at} t={t} />
                </td>
                <td>
                  <div class="flex items-center justify-end">
                    <KeyPanel
                      trigger={t("console.keys.edit")}
                      triggerClass="btn btn-xs"
                      title={t("console.keys.editTitle")}
                      submit={t("console.keys.save")}
                      action={`/console/keys/${k.id}`}
                      values={props.editDraft?.id === k.id ? props.editDraft.values : rowValues(k)}
                      open={props.editDraft?.id === k.id}
                      deleteAction={`/console/keys/${k.id}/delete`}
                      keyName={k.name}
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
    </>
  );
}

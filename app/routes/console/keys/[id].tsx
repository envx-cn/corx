import { Hono } from "hono";
import type { ApiKeyRow, Env } from "../../../lib/types.js";
import { ProxyError } from "../../../lib/types.js";
import { queryKeyById, updateApiKey } from "../../../lib/admin.js";
import type { KeyUpdate } from "../../../lib/admin.js";
import { applyHeaderRules, readStoredInjection, rulesToText, varMap } from "../../../proxy/inject.js";
import type { InjectionParts } from "../../../proxy/inject.js";
import { injectionPreview } from "../../../lib/injection-preview.js";
import type { PlaygroundInjectionPreview } from "../../../lib/playground.js";
import InjectionForm, {
  injectionErrorField,
  type InjectionErrorField,
  type InjectionFormI18n,
  type InjectionFormValues,
} from "../../../islands/injection-form.js";
import { consoleT } from "../../../lib/i18n/hono.js";
import type { TFunc } from "../../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const keyRow = await queryKeyById(c.env.DB, c.req.param("id") ?? "", c.env.INJECTION_KEK);
  // A stale link (or a deleted key) belongs back at the list, not a 404 page.
  if (!keyRow) return c.redirect("/console/keys", 302);
  return c.render(<InjectionPage keyRow={keyRow} csrf={c.get("csrfToken") ?? ""} t={t} />, {
    title: keyRow.name || t("console.title.keys"),
  });
});

/**
 * Save the injection half of a key on its own. Partial by design: a field the
 * POST does not carry is left alone, so this form can never clear policy, and
 * the policy form (which no longer carries injection) can never clear this.
 */
app.post("/injection", async (c) => {
  const t = consoleT(c);
  const id = c.req.param("id") ?? "";
  const form = await c.req.parseBody();
  const draft = draftFromForm(form);
  try {
    await updateApiKey(c.env.DB, id, injectionUpdate(form), c.env.INJECTION_KEK);
    return c.redirect(`/console/keys/${encodeURIComponent(id)}`, 302);
  } catch (err) {
    const keyRow = await queryKeyById(c.env.DB, id, c.env.INJECTION_KEK);
    if (!keyRow) return c.redirect("/console/keys", 302);
    const error = err instanceof ProxyError ? err.message : t("console.keys.saveFailed");
    return c.render(
      <InjectionPage
        keyRow={keyRow}
        draft={draft}
        error={error}
        errorField={injectionErrorField(error)}
        csrf={c.get("csrfToken") ?? ""}
        t={t}
      />,
      { title: keyRow.name || t("console.title.keys") },
    );
  }
});

export default app;

// ---------- Page markup (colocated) ----------

/** The injection fields from a form body, in the route-layer partial-update shape. */
function injectionUpdate(form: Record<string, unknown>): KeyUpdate {
  const update: KeyUpdate = {};
  // The `varsPresent` marker separates "the rows are the full list" (which may
  // be empty = clear) from a POST that never carried variables (keep them).
  if (form["varsPresent"] !== undefined) {
    update.vars = readVarRows(form).map((r) => ({
      name: r.name,
      value: r.value,
      // Explicit on every row: false clears the flag, "" clears the scope.
      client: r.client,
      hosts: r.hosts,
    }));
  }
  if (form["allowedHosts"] !== undefined) update.allowedHosts = String(form["allowedHosts"]);
  if (form["headerRules"] !== undefined) update.headerRules = String(form["headerRules"]);
  if (form["paramRules"] !== undefined) update.paramRules = String(form["paramRules"]);
  if (form["responseRules"] !== undefined) update.responseRules = String(form["responseRules"]);
  return update;
}

/** Variable rows in submitted order (blank names are spare rows, not variables). */
function readVarRows(form: Record<string, unknown>): Array<{ name: string; value: string; client: boolean; hosts: string }> {
  const indices = Object.keys(form)
    .map((k) => /^var_name_(\d+)$/.exec(k)?.[1])
    .filter((v): v is string => v !== undefined)
    .sort((a, b) => Number(a) - Number(b));
  const rows: Array<{ name: string; value: string; client: boolean; hosts: string }> = [];
  for (const i of indices) {
    const name = String(form[`var_name_${i}`] ?? "").trim();
    if (!name) continue;
    rows.push({
      name,
      value: String(form[`var_value_${i}`] ?? ""),
      client: form[`var_client_${i}`] !== undefined,
      hosts: String(form[`var_hosts_${i}`] ?? ""),
    });
  }
  return rows;
}

/** The page's values from a form body (a save failed: echo what was typed). */
function draftFromForm(form: Record<string, unknown>): InjectionFormValues {
  return {
    allowedHosts: String(form["allowedHosts"] ?? ""),
    vars: readVarRows(form).map((r) => ({ name: r.name, client: r.client, hosts: r.hosts })),
    headerRules: String(form["headerRules"] ?? ""),
    paramRules: String(form["paramRules"] ?? ""),
    responseRules: String(form["responseRules"] ?? ""),
  };
}

/** The page's values from the stored row (values stay server-side). */
function valuesFromParts(parts: InjectionParts): InjectionFormValues {
  return {
    allowedHosts: parts.hosts.join(", "),
    vars: parts.vars.map((v) => ({
      name: v.name,
      client: !!v.client,
      hosts: v.hosts?.join(", ") ?? "",
    })),
    headerRules: rulesToText(parts.headers, "header"),
    paramRules: rulesToText(parts.params, "param"),
    responseRules: rulesToText(parts.responseHeaders, "response"),
  };
}

/** A sample request to preview against: the first allowed host, a caller ref if exposed. */
function sampleTarget(parts: InjectionParts): URL {
  const url = new URL(`https://${parts.hosts[0] ?? "api.example.com"}/`);
  const exposed = parts.vars.find((v) => v.client);
  if (exposed) url.searchParams.set("key", `\${${exposed.name}}`);
  return url;
}

function injectionLabels(t: TFunc): InjectionFormI18n {
  return {
    allowedHosts: t("console.keys.allowedHosts"),
    allowedHostsPh: t("console.keys.allowedHostsPh"),
    hostsRequired: t("console.keys.injectionHostsHint"),
    vars: t("console.keys.vars"),
    varsHint: t("console.keys.varsHint"),
    varName: t("console.keys.varName"),
    varNamePh: t("console.keys.varNamePh"),
    varValue: t("console.keys.varValue"),
    varValuePh: t("console.keys.varValuePh"),
    varClient: t("console.keys.varClient"),
    varClientHint: t("console.keys.varClientHint"),
    varHosts: t("console.keys.varHosts"),
    varHostsPh: t("console.keys.varHostsPh"),
    addVar: t("console.keys.addVar"),
    removeVar: t("console.keys.removeVar"),
    headerRules: t("console.keys.headerRules"),
    headerRulesPh: t("console.keys.headerRulesPh"),
    paramRules: t("console.keys.paramRules"),
    paramRulesPh: t("console.keys.paramRulesPh"),
    responseRules: t("console.keys.responseRules"),
    responseRulesPh: t("console.keys.responseRulesPh"),
    responseRulesHint: t("console.keys.responseRulesHint"),
    injectionHint: t("console.keys.injectionHint"),
    save: t("console.keys.saveInjection"),
    saving: t("console.keys.saving"),
    cancel: t("ui.cancel"),
    revokedHint: t("console.keys.revokedHint"),
  };
}

function InjectionPage(props: {
  keyRow: ApiKeyRow;
  /** Values to re-open the form with (a save failed). */
  draft?: InjectionFormValues;
  error?: string | null;
  errorField?: InjectionErrorField | null;
  csrf: string;
  t: TFunc;
}) {
  const { t, keyRow } = props;
  const parts = readStoredInjection(keyRow);
  const values = props.draft ?? valuesFromParts(parts);
  const sample = sampleTarget(parts);
  const preview = injectionPreview(keyRow, sample);
  return (
    <>
      <div class="mb-4">
        <a class="link link-hover text-xs text-base-content/75" href="/console/keys">
          ← {t("console.keys.back")}
        </a>
        <div class="mt-1 flex flex-wrap items-center gap-2">
          <h1 class="text-3xl font-semibold tracking-tight">{keyRow.name || "—"}</h1>
          {keyRow.revoked_at ? (
            <span class="badge badge-error badge-outline badge-sm">{t("console.keys.badgeRevoked")}</span>
          ) : null}
          {keyRow.keyless ? (
            <span class="badge badge-outline badge-sm">{t("console.keys.badgeKeyless")}</span>
          ) : null}
          {keyRow.tier === "public" ? (
            <span class="badge badge-primary badge-sm">{t("console.keys.badgePublic")}</span>
          ) : null}
        </div>
        <div class="text-xs text-base-content/75">
          <span class="font-mono">{t("console.keys.injection")}</span> · id: <span class="font-mono">{keyRow.id}</span>
        </div>
      </div>

      <InjectionForm
        action={`/console/keys/${encodeURIComponent(keyRow.id)}/injection`}
        values={values}
        previousNames={parts.vars.map((v) => v.name)}
        error={props.error}
        errorField={props.errorField}
        csrf={props.csrf}
        revoked={!!keyRow.revoked_at}
        labels={injectionLabels(t)}
      />

      <PreviewCard t={t} parts={parts} preview={preview} sample={sample} />
    </>
  );
}

/**
 * What upstream receives for a sample request, with every secret masked as
 * ***. The sample carries one exposed variable as a caller reference, so the
 * preview shows both the reference resolving and the rules running.
 */
function PreviewCard(props: {
  t: TFunc;
  parts: InjectionParts;
  preview: PlaygroundInjectionPreview | null;
  sample: URL;
}) {
  const { t, parts, preview } = props;
  const host = parts.hosts[0] ?? "api.example.com";
  const masked = varMap(parts.vars.map((v) => ({ name: v.name, value: "***" })));
  const headers = new Headers();
  applyHeaderRules(headers, parts.headers, masked, host);
  const applied: Array<[string, string]> = [];
  headers.forEach((value, name) => applied.push([name, value]));
  return (
    <section class="mt-8 rounded-box border border-base-300 p-4">
      <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/75">{t("console.keys.preview")}</h2>
      <p class="mt-1 text-xs text-base-content/75">{t("console.keys.previewHint")}</p>
      {preview ? (
        <div class="mt-3 space-y-3 text-xs">
          <div>
            <div class="text-base-content/75">{t("console.keys.allowedHosts")}</div>
            <div class="mt-1 flex flex-wrap gap-1">
              {parts.hosts.map((h) => (
                <code class="rounded-box bg-base-200 px-1.5 py-0.5 font-mono">{h}</code>
              ))}
            </div>
          </div>
          <div>
            <div class="text-base-content/75">{t("console.keys.previewVars")}</div>
            <div class="mt-1 font-mono">{preview.vars.join(", ") || t("console.keys.previewNone")}</div>
          </div>
          <div>
            <div class="text-base-content/75">{t("console.keys.previewSample")}</div>
            <code class="mt-1 block break-all font-mono">GET {props.sample.toString()}</code>
          </div>
          {preview.effectiveUrl ? (
            <div>
              <div class="text-base-content/75">{t("console.keys.previewUpstream")}</div>
              <code class="mt-1 block break-all font-mono">GET {preview.effectiveUrl}</code>
            </div>
          ) : null}
          {applied.length > 0 ? (
            <div>
              <div class="text-base-content/75">{t("console.keys.previewHeaders")}</div>
              <ul class="mt-1 space-y-0.5 font-mono">
                {applied.map(([name, value]) => (
                  <li class="break-all">
                    {name}: {value}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p class="mt-3 text-xs text-base-content/75">{t("console.keys.previewEmpty")}</p>
      )}
    </section>
  );
}

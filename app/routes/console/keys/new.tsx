import { Hono } from "hono";
import type { Env } from "../../../lib/types.js";
import { ProxyError } from "../../../lib/types.js";
import { createApiKey } from "../../../lib/admin.js";
import CopyButton from "../../../islands/copy-button.js";
import {
  PolicyAdvanced,
  PolicyBasics,
  blankKeyForm,
  panelDefaults,
  policyLabels,
  policyUpdate,
  presetValues,
  readKeyForm,
  type KeyFormValues,
} from "./_form.js";
import { consoleT } from "../../../lib/i18n/hono.js";
import type { TFunc } from "../../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  const preset = c.req.query("preset");
  return c.render(
    <CreatePage
      values={presetValues(preset) ?? blankKeyForm()}
      expandAdvanced={preset === "public"}
      csrf={c.get("csrfToken") ?? ""}
      defaults={panelDefaults(c.env)}
      t={t}
    />,
    { title: t("console.keys.createTitle") },
  );
});

app.post("/", async (c) => {
  const t = consoleT(c);
  const values = readKeyForm(await c.req.parseBody());
  try {
    const { id, key } = await createApiKey(
      c.env.DB,
      { ...policyUpdate(values), name: values.name },
      c.env.INJECTION_KEK,
    );
    // The raw key is shown once — render it, don't redirect (a redirect could
    // only show it behind a token in the URL).
    return c.render(<CreatedPage id={id} rawKey={key} name={values.name} t={t} />, {
      title: t("console.keys.createdTitle"),
    });
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.createFailed");
    return c.render(
      <CreatePage
        values={values}
        expandAdvanced
        error={error}
        csrf={c.get("csrfToken") ?? ""}
        defaults={panelDefaults(c.env)}
        t={t}
      />,
      { title: t("console.keys.createTitle") },
    );
  }
});

export default app;

// ---------- Page markup (colocated) ----------

/**
 * The create step, on its own page: basics first, the advanced policy folded
 * away (its inputs submit either way), presets as links that pre-fill it
 * server-side. Injection is not a field here — it needs the key to exist, so
 * it is the optional step on the created key's page.
 */
function CreatePage(props: {
  values: KeyFormValues;
  /** Open the advanced policy on first render (a preset or a failed save). */
  expandAdvanced?: boolean;
  error?: string | null;
  csrf: string;
  defaults: { rate: string; origins: string; ttl: string; publicTtl: string };
  t: TFunc;
}) {
  const { t } = props;
  const labels = policyLabels(t, props.defaults);
  return (
    <>
      <a class="link link-hover text-xs text-base-content/75" href="/console/keys">
        ← {t("console.keys.back")}
      </a>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight">{t("console.keys.createTitle")}</h1>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <span class="text-xs text-base-content/75">{t("console.keys.presets")}</span>
        <a class="btn btn-xs" href="/console/keys/new?preset=local">
          {t("console.keys.presetLocal")}
        </a>
        <a class="btn btn-xs" href="/console/keys/new?preset=public">
          {t("console.keys.presetPublic")}
        </a>
      </div>

      <form
        method="post"
        action="/console/keys/new"
        data-corx-busy
        data-corx-dirty="create"
        data-saving={t("console.keys.saving")}
        class="mt-4"
      >
        <input type="hidden" name="csrf" value={props.csrf} />
        {/* Marker: a hand-rolled POST without it gets the safe defaults (both
            checks on) instead of an absent — unchecked — field turning the
            guards off. */}
        <input type="hidden" name="checks" value="1" />
        {props.error ? (
          <div role="alert" class="alert alert-error mb-4">
            <span>{props.error}</span>
          </div>
        ) : null}
        <PolicyBasics values={props.values} labels={labels} />
        <details class="mt-4 rounded-box border border-base-300" open={props.expandAdvanced}>
          <summary class="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-base-content/75">
            {labels.advanced}
          </summary>
          <div class="p-3 pt-1">
            <PolicyAdvanced values={props.values} labels={labels} />
          </div>
        </details>
        <div class="mt-6 flex items-center justify-end gap-2">
          <a class="btn btn-ghost" href="/console/keys">
            {t("ui.cancel")}
          </a>
          <button type="submit" class="btn btn-primary">
            {t("console.keys.create")}
          </button>
        </div>
      </form>
    </>
  );
}

/** The once-only raw key, and the two ways out: injection, or the list. */
function CreatedPage(props: { id: string; rawKey: string; name: string; t: TFunc }) {
  const { t } = props;
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight">{t("console.keys.createdTitle")}</h1>
      <div role="status" class="alert alert-success mt-4">
        <div class="min-w-0">
          <b>{t("console.keys.newKey")}</b>
          <div class="flex items-center gap-2 mt-1">
            <code class="break-all">{props.rawKey}</code>
            <CopyButton text={props.rawKey} labels={{ copy: t("copy.copy"), copied: t("copy.copied") }} />
          </div>
          <div class="text-xs opacity-70 mt-1">
            id: {props.id} · name: {props.name}
          </div>
        </div>
      </div>
      <div class="mt-6 flex flex-wrap items-center gap-2">
        <a class="btn btn-primary" href={`/console/keys/${props.id}#injection`}>
          {t("console.keys.continueInjection")}
        </a>
        <a class="btn btn-ghost" href="/console/keys">
          {t("console.keys.back")}
        </a>
      </div>
    </>
  );
}

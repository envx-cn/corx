import { useEffect, useRef } from "hono/jsx/dom";
import { checkInjectionForm } from "../proxy/inject.js";

/**
 * One variable row as the page renders it. Values never reach the client: the
 * value input is always blank, and blank means "keep the stored secret".
 */
export interface InjectionVarRow {
  name: string;
  client: boolean;
  hosts: string;
}

/** The injection page's raw values, echoed back when a save fails. */
export interface InjectionFormValues {
  allowedHosts: string;
  vars: InjectionVarRow[];
  headerRules: string;
  paramRules: string;
  responseRules: string;
}

/** UI strings for the injection form (injected from the server dict). */
export interface InjectionFormI18n {
  allowedHosts: string;
  allowedHostsPh: string;
  hostsRequired: string;
  vars: string;
  varsHint: string;
  varName: string;
  varNamePh: string;
  varValue: string;
  varValuePh: string;
  varClient: string;
  varClientHint: string;
  varHosts: string;
  varHostsPh: string;
  addVar: string;
  removeVar: string;
  headerRules: string;
  headerRulesPh: string;
  paramRules: string;
  paramRulesPh: string;
  responseRules: string;
  responseRulesPh: string;
  responseRulesHint: string;
  injectionHint: string;
  save: string;
  saving: string;
  cancel: string;
  revokedHint: string;
}

export type InjectionErrorField = "vars" | "allowedHosts" | "headerRules" | "paramRules" | "responseRules";

/**
 * Which field a save-time injection error belongs to, so the message can sit
 * next to it. The server's wording starts with the field's name; the longer
 * prefixes are checked first ("Response header" before "Header").
 */
export function injectionErrorField(message: string): InjectionErrorField | null {
  if (/^Set at least one allowed target host/i.test(message)) return "allowedHosts";
  if (/^(Variables|Client-referencable variables|vars\b)/i.test(message)) return "vars";
  if (/^Response header/i.test(message)) return "responseRules";
  if (/^Query /i.test(message)) return "paramRules";
  if (/^Header /i.test(message)) return "headerRules";
  return null;
}

/** Read the variable rows off the live DOM (FormData iteration is not typed in Workers). */
function readRows(root: HTMLElement | null): Array<{ name: string; value: string; client: boolean; hosts: string }> {
  const out: Array<{ name: string; value: string; client: boolean; hosts: string }> = [];
  root?.querySelectorAll<HTMLElement>("[data-var-row]").forEach((row) => {
    const name = row.querySelector<HTMLInputElement>("input[name^='var_name_']")?.value.trim() ?? "";
    // The hidden template counts as a row but has no name; spare rows are skipped.
    if (!name) return;
    out.push({
      name,
      value: row.querySelector<HTMLInputElement>("input[name^='var_value_']")?.value ?? "",
      client: row.querySelector<HTMLInputElement>("input[name^='var_client_']")?.checked ?? false,
      hosts: row.querySelector<HTMLInputElement>("input[name^='var_hosts_']")?.value ?? "",
    });
  });
  return out;
}

/** One variable row: name, write-only value, client toggle, host scope, remove. */
function VarRow(props: { i: number | string; row: InjectionVarRow; labels: InjectionFormI18n }) {
  const { i, row, labels } = props;
  return (
    <div data-var-row class="grid gap-3 rounded-box border border-base-300 p-3 sm:grid-cols-2">
      <label class="form-control">
        <div class="label pb-1">
          <span class="label-text">{labels.varName}</span>
        </div>
        <input
          name={`var_name_${i}`}
          value={row.name}
          placeholder={labels.varNamePh}
          class="input input-bordered w-full font-mono text-xs"
        />
      </label>
      <label class="form-control">
        <div class="label pb-1">
          <span class="label-text">{labels.varValue}</span>
        </div>
        {/* Write-only on purpose: the console never receives the stored secret. */}
        <input
          name={`var_value_${i}`}
          type="password"
          autocomplete="new-password"
          placeholder={labels.varValuePh}
          class="input input-bordered w-full font-mono text-xs"
        />
      </label>
      <label class="form-control">
        <div class="label pb-1">
          <span class="label-text">{labels.varHosts}</span>
        </div>
        <input
          name={`var_hosts_${i}`}
          value={row.hosts}
          placeholder={labels.varHostsPh}
          class="input input-bordered w-full font-mono text-xs"
        />
      </label>
      <div class="flex items-end justify-between gap-2">
        <label class="flex cursor-pointer items-center gap-2 pb-2" title={labels.varClientHint}>
          <input type="checkbox" name={`var_client_${i}`} value="on" class="checkbox checkbox-sm" checked={row.client} />
          <span class="text-sm">{labels.varClient}</span>
        </label>
        <button type="button" data-var-remove class="btn btn-ghost btn-xs" aria-label={labels.removeVar}>
          {labels.removeVar}
        </button>
      </div>
    </div>
  );
}

/**
 * Upstream-injection form for one key (its own page, POSTs on its own). Like
 * the key panel it is deliberately state-less: add/remove clones and removes
 * rows in the DOM, validation writes into the error nodes, and the submit
 * button disables itself — no HonoX re-render can clobber what is being typed.
 *
 * The rule textareas stay text (`@hosts` sections read better as lines); the
 * variables became rows so name, value, exposure and scope sit together.
 */
export default function InjectionForm(props: {
  /** POST target: /console/keys/:id/injection. */
  action: string;
  values: InjectionFormValues;
  /** Stored variable names — a blank value for one of them means "keep". */
  previousNames: string[];
  /** Server message from a failed save and the field it belongs to. */
  error?: string | null;
  errorField?: InjectionErrorField | null;
  csrf: string;
  /** A revoked key is read-only: fields off, no Save. */
  revoked?: boolean;
  labels: InjectionFormI18n;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const nextIndex = useRef(props.values.vars.length);
  const { labels } = props;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-var-add]")) {
        const tpl = root.querySelector<HTMLElement>("[data-var-template]");
        if (!tpl) return;
        const clone = tpl.cloneNode(true) as HTMLElement;
        clone.removeAttribute("data-var-template");
        clone.removeAttribute("hidden");
        const idx = String(nextIndex.current++);
        clone.querySelectorAll<HTMLInputElement>("input[name]").forEach((input) => {
          input.name = input.name.replace("__i__", idx);
        });
        root.querySelector("[data-var-rows]")?.appendChild(clone);
        clone.querySelector<HTMLInputElement>("input")?.focus();
        return;
      }
      const remove = target.closest("[data-var-remove]");
      if (remove) remove.closest("[data-var-row]")?.remove();
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  /** Hide every error node, then show `message` (top slot when field is null). */
  const showError = (field: InjectionErrorField | null, message: string) => {
    const root = rootRef.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>("[data-field-error]").forEach((el) => {
      el.textContent = "";
      el.classList.add("hidden");
    });
    const top = root.querySelector<HTMLElement>("[data-error-top]");
    const node = field ? root.querySelector<HTMLElement>(`[data-field-error="${field}"]`) : top;
    if (top) {
      top.textContent = "";
      top.classList.add("hidden");
    }
    if (!node) return;
    node.textContent = message;
    node.classList.remove("hidden");
  };

  const onSubmit = (e: Event) => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const message = checkInjectionForm(
      {
        vars: readRows(rootRef.current),
        headerRules: String(fd.get("headerRules") ?? ""),
        paramRules: String(fd.get("paramRules") ?? ""),
        responseRules: String(fd.get("responseRules") ?? ""),
        allowedHosts: String(fd.get("allowedHosts") ?? ""),
      },
      props.previousNames,
    );
    if (message) {
      // Fast path only: the route re-runs everything with the stored secrets.
      e.preventDefault();
      showError(injectionErrorField(message), message);
      return;
    }
    showError(null, "");
    form.setAttribute("aria-busy", "true");
    if (submitRef.current) {
      submitRef.current.disabled = true;
      submitRef.current.textContent = labels.saving;
    }
  };

  return (
    <div ref={rootRef}>
      {props.revoked ? (
        <div role="status" class="alert alert-warning mb-4">
          <span>{labels.revokedHint}</span>
        </div>
      ) : null}
      <div
        data-error-top
        role="alert"
        class={`alert alert-error mb-4${props.error && !props.errorField ? "" : " hidden"}`}
      >
        {props.error && !props.errorField ? props.error : ""}
      </div>

      <form ref={formRef} method="post" action={props.action} onSubmit={onSubmit}>
        <input type="hidden" name="csrf" value={props.csrf} />
        {/* Marker: a hand-rolled POST without it leaves the variables alone,
            while an empty rows list is a deliberate "clear them all". */}
        <input type="hidden" name="varsPresent" value="1" />
        <fieldset disabled={props.revoked} class="m-0 min-w-0 border-0 p-0">
          <label class="form-control">
            <div class="label pb-1">
              <span class="label-text">{labels.allowedHosts}</span>
            </div>
            <input
              name="allowedHosts"
              value={props.values.allowedHosts}
              placeholder={labels.allowedHostsPh}
              class="input input-bordered w-full font-mono text-xs"
            />
          </label>
          <p class="mt-1 text-xs text-warning">{labels.hostsRequired}</p>
          <p data-field-error="allowedHosts" class={`mt-1 text-xs text-error${props.errorField === "allowedHosts" ? "" : " hidden"}`}>
            {props.errorField === "allowedHosts" ? props.error : ""}
          </p>

          <div class="mt-6">
            <h2 class="text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.vars}</h2>
            <p class="mt-1 text-xs text-base-content/75">{labels.varsHint}</p>
            <div data-var-rows class="mt-3 grid gap-3">
              {props.values.vars.map((row, i) => (
                <VarRow i={i} row={row} labels={labels} />
              ))}
              {/* Cloned by the island's Add button; the __i__ name placeholder
                  never matches the route's `var_name_<n>` scan. */}
              <div data-var-template hidden>
                <VarRow i="__i__" row={{ name: "", client: false, hosts: "" }} labels={labels} />
              </div>
            </div>
            <button type="button" data-var-add class="btn btn-ghost btn-xs mt-2">
              {labels.addVar}
            </button>
            <p data-field-error="vars" class={`mt-1 text-xs text-error${props.errorField === "vars" ? "" : " hidden"}`}>
              {props.errorField === "vars" ? props.error : ""}
            </p>
          </div>

          <div class="mt-6">
            <h2 class="text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.headerRules}</h2>
            <p class="mt-1 text-xs text-base-content/75">{labels.injectionHint}</p>
            <textarea
              name="headerRules"
              rows={3}
              placeholder={labels.headerRulesPh}
              class="textarea textarea-bordered mt-2 w-full font-mono text-xs leading-5"
            >
              {props.values.headerRules}
            </textarea>
            <p data-field-error="headerRules" class={`mt-1 text-xs text-error${props.errorField === "headerRules" ? "" : " hidden"}`}>
              {props.errorField === "headerRules" ? props.error : ""}
            </p>

            <h2 class="mt-6 text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.paramRules}</h2>
            <textarea
              name="paramRules"
              rows={2}
              placeholder={labels.paramRulesPh}
              class="textarea textarea-bordered mt-2 w-full font-mono text-xs leading-5"
            >
              {props.values.paramRules}
            </textarea>
            <p data-field-error="paramRules" class={`mt-1 text-xs text-error${props.errorField === "paramRules" ? "" : " hidden"}`}>
              {props.errorField === "paramRules" ? props.error : ""}
            </p>

            <h2 class="mt-6 text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.responseRules}</h2>
            <textarea
              name="responseRules"
              rows={2}
              placeholder={labels.responseRulesPh}
              class="textarea textarea-bordered mt-2 w-full font-mono text-xs leading-5"
            >
              {props.values.responseRules}
            </textarea>
            <p class="-mt-1 text-xs leading-relaxed text-base-content/75">{labels.responseRulesHint}</p>
            <p data-field-error="responseRules" class={`mt-1 text-xs text-error${props.errorField === "responseRules" ? "" : " hidden"}`}>
              {props.errorField === "responseRules" ? props.error : ""}
            </p>
          </div>
        </fieldset>

        <div class="mt-6 flex items-center justify-end gap-2">
          <a class="btn btn-ghost" href="/console/keys">
            {labels.cancel}
          </a>
          {props.revoked ? null : (
            <button ref={submitRef} type="submit" class="btn btn-primary">
              {labels.save}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

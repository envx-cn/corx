import type { Child } from "hono/jsx";
import { useEffect, useId, useRef } from "hono/jsx/dom";
import { checkInjectionForm } from "../proxy/inject.js";

/**
 * Raw API-key form values, kept as strings. The server reads the same shape off
 * the request body and echoes it back when a save fails, so the panel can
 * re-open with exactly what the user had typed.
 */
export interface KeyFormValues {
  name: string;
  rateLimitPerMin: string;
  allowedOrigins: string;
  cacheTtl: string;
  noCache: boolean;
  ipCheck: boolean;
  dnsCheck: boolean;
  keyless: boolean;
  /** Public tier: the shared, limited key for the hosted instance. */
  tier: boolean;
  dailyLimitPerOrigin: string;
  dailyLimitPerHost: string;
  dailyLimitTotal: string;
  allowedHosts: string;
  /** Editor text; variable values stay blank ("blank = keep existing"). */
  vars: string;
  /** Variables callers may reference, with optional `@hosts` scopes. */
  clientVars: string;
  headerRules: string;
  paramRules: string;
  /** Response header rules (what the caller receives back). */
  responseRules: string;
}

/** UI strings for the key panel (injected from the server dict). */
export interface KeyPanelI18n {
  name: string;
  namePh: string;
  ratePerMin: string;
  ratePh: string;
  allowedOrigins: string;
  originsPh: string;
  cacheTtl: string;
  cacheTtlTitle: string;
  ttlPh: string;
  noCache: string;
  noCacheShort: string;
  noCacheHint: string;
  checks: string;
  /** Section header for the rarely-touched fields behind a <details>. */
  advanced: string;
  ipCheck: string;
  ipCheckHint: string;
  dnsCheck: string;
  dnsCheckHint: string;
  keyless: string;
  keylessHint: string;
  publicTier: string;
  publicTierHint: string;
  dailyLimits: string;
  dailyLimitPerOrigin: string;
  dailyLimitPerHost: string;
  dailyLimitTotal: string;
  dailyLimitPh: string;
  allowedHosts: string;
  allowedHostsPh: string;
  injection: string;
  injectionHint: string;
  vars: string;
  varsPh: string;
  clientVars: string;
  clientVarsPh: string;
  clientVarsHint: string;
  headerRules: string;
  headerRulesPh: string;
  paramRules: string;
  paramRulesPh: string;
  responseRules: string;
  responseRulesPh: string;
  responseRulesHint: string;
  danger: string;
  dangerHint: string;
  delete: string;
  deleteTitle: string;
  deleteHint: string;
  deleteConfirm: string;
  cancel: string;
  close: string;
  /** Submit-button label while its POST is in flight. */
  saving: string;
  /** Informational banner in a revoked key's (read-only) panel. */
  revokedHint: string;
  revoke: string;
  revokeTitle: string;
  revokeHint: string;
}

/**
 * Variable names from an editor's `NAME=` lines. The console never receives
 * the stored values — a blank one means "keep" — so client-side validation
 * reads the names from the initial text to tell a known name with a blank
 * value from a new name with no value.
 */
function storedVarNames(text: string | undefined): string[] {
  if (!text) return [];
  const names: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) names.push(t.slice(0, eq).trim());
  }
  return names;
}

function Field(props: { label: string; class?: string; children: Child }) {
  return (
    <label class={`form-control ${props.class ?? ""}`}>
      <div class="label pb-1">
        <span class="label-text">{props.label}</span>
      </div>
      {props.children}
    </label>
  );
}

/** One SSRF-guard switch: label + explanation on the left, toggle on the right. */
function Check(props: { name: string; label: string; hint: string; checked: boolean }) {
  return (
    <label class="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span class="block text-sm font-medium">{props.label}</span>
        <span class="block text-xs text-base-content/75">{props.hint}</span>
      </span>
      <input type="checkbox" name={props.name} value="on" class="toggle mt-0.5" checked={props.checked} />
    </label>
  );
}

/**
 * One "type the key's name to confirm" dialog for a destructive POST
 * (Revoke, Delete). A sibling of the panel <dialog>, never a descendant:
 * daisyUI's .modal-box is scaled, so a second top-layer dialog must live
 * outside it. State-less like the panel — the typed name enables the submit
 * button imperatively, and the server re-checks it anyway.
 */
function NameConfirm(props: {
  dialogRef: { current: HTMLDialogElement | null };
  title: string;
  titleId: string;
  hint: string;
  confirmLabel: string;
  cancel: string;
  close: string;
  submit: string;
  action: string;
  keyName: string;
  csrf: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sync = () => {
    if (buttonRef.current && inputRef.current) {
      buttonRef.current.disabled = inputRef.current.value.trim() !== props.keyName;
    }
  };
  // Esc and the backdrop close without running the Cancel handler, so the
  // reset hangs off the dialog's own close event.
  const reset = () => {
    if (inputRef.current) inputRef.current.value = "";
    sync();
  };
  return (
    <dialog ref={props.dialogRef} class="modal" aria-labelledby={props.titleId} onClose={reset}>
      <div class="modal-box max-w-md">
        <h3 id={props.titleId} class="text-lg font-semibold">
          {props.title}
        </h3>
        <p class="mt-2 text-sm text-base-content/75">{props.hint.replace("{name}", props.keyName)}</p>
        <form method="post" action={props.action} class="mt-4">
          <input type="hidden" name="csrf" value={props.csrf} />
          <input
            ref={inputRef}
            name="confirmName"
            onInput={sync}
            autocomplete="off"
            placeholder={props.confirmLabel}
            aria-label={props.confirmLabel}
            class="input input-bordered w-full"
          />
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" onClick={() => props.dialogRef.current?.close()}>
              {props.cancel}
            </button>
            <button ref={buttonRef} type="submit" class="btn btn-error" disabled>
              {props.submit}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" class="modal-backdrop">
        <button aria-label={props.close}>{props.close}</button>
      </form>
    </dialog>
  );
}

/**
 * Modal panel for one API-key form: a trigger button that opens a native
 * <dialog> (top layer, Esc + backdrop close for free) whose form POSTs to the
 * server. Used twice — "Create key" with no values, and a per-row "Edit" with
 * that key's current policy plus the delete danger zone.
 *
 * Deliberately state-less: the island only wires buttons to showModal(), so
 * honox never re-renders (and never clobbers) the fields while typing. The
 * delete confirmation's "type the name" check is synced to the submit button
 * imperatively for the same reason — the server re-checks it anyway.
 *
 * The confirm <dialog> is a sibling of the panel <dialog> (not a descendant):
 * daisyUI's .modal-box is scaled, and a top-layer dialog is safest outside it.
 */
export default function KeyPanel(props: {
  /** Form target: /console/keys to create, /console/keys/:id to update. */
  action: string;
  title: string;
  trigger: string;
  triggerClass: string;
  submit: string;
  labels: KeyPanelI18n;
  values?: KeyFormValues;
  /** Re-open right after hydration (the server echoed a failed save). */
  open?: boolean;
  /** Server message for a failed save — shown inside the dialog, not behind it. */
  error?: string | null;
  /** Delete endpoint — set on the edit panel to render the danger zone. */
  deleteAction?: string;
  /** Revoke endpoint — absent once revoked (a revoked key has nothing to revoke). */
  revokeAction?: string;
  /** Revoked keys keep their row and policy for attribution, but are read-only. */
  revoked?: boolean;
  /** Session-bound CSRF token, rendered into both POST forms. */
  csrf?: string;
  /** Current name of the key (delete confirmation). */
  keyName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const clientErrorRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const revokeRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const deleteTitleId = useId();
  const revokeTitleId = useId();
  const { labels } = props;
  const v = props.values;
  /** Stored variable names: a blank value for one of them means "keep". */
  const previousNames = storedVarNames(v?.vars);

  useEffect(() => {
    if (props.open && ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const show = () => ref.current?.showModal();
  const hide = () => ref.current?.close();

  /**
   * One POST per form. First the fast path: run the injection checks the route
   * will run, on the typed text, so a cross-reference mistake costs no
   * round-trip. Then disable imperatively so a slow round trip cannot take a
   * second click — keep the panel state-less, so honox never re-renders over
   * what is being typed.
   */
  const onSubmit = (e: Event) => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const field = (name: string) => String(fd.get(name) ?? "");
    const message = checkInjectionForm(
      {
        vars: field("vars"),
        clientVars: field("clientVars"),
        headerRules: field("headerRules"),
        paramRules: field("paramRules"),
        responseRules: field("responseRules"),
        allowedHosts: field("allowedHosts"),
      },
      previousNames,
    );
    if (message) {
      e.preventDefault();
      // The offending field is often behind the advanced <details>: open it
      // and write the server's wording into the shared error slot.
      if (detailsRef.current) detailsRef.current.open = true;
      const slot = clientErrorRef.current;
      if (slot) {
        slot.textContent = message;
        slot.classList.remove("hidden");
      }
      return;
    }
    form.setAttribute("aria-busy", "true");
    if (submitRef.current) {
      submitRef.current.disabled = true;
      submitRef.current.textContent = labels.saving;
    }
  };

  return (
    <>
      <button type="button" class={props.triggerClass} onClick={show}>
        {props.trigger}
      </button>
      <dialog ref={ref} class="modal" aria-labelledby={titleId}>
        <div class="modal-box">
          <button
            type="button"
            class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            aria-label={labels.close}
            onClick={hide}
          >
            ✕
          </button>
          <h3 id={titleId} class="text-lg font-semibold">
            {props.title}
          </h3>
          {/* A re-opened dialog is top-layer: a page-level alert behind it is
              invisible. The server message is rendered here verbatim (line
              prefixes and all); the client-side fast path writes into the same
              slot imperatively (the island is state-less). */}
          <div
            ref={clientErrorRef}
            role="alert"
            class={`alert alert-error mt-4${props.error ? "" : " hidden"}`}
          >
            <span>{props.error ?? ""}</span>
          </div>
          {props.revoked ? (
            <div role="status" class="alert alert-warning mt-4">
              <span>{labels.revokedHint}</span>
            </div>
          ) : null}
          <form ref={formRef} method="post" action={props.action} class="mt-4" onSubmit={onSubmit}>
            {/* Marker: a hand-rolled POST without it (script, stale form) gets
                the safe defaults (both checks on) instead of an absent -
                unchecked - field silently turning the guards off. */}
            <input type="hidden" name="checks" value="1" />
            <input type="hidden" name="csrf" value={props.csrf ?? ""} />
            {/* A revoked key's policy is history: one disabled fieldset turns
                every control off without touching the 17 inputs one by one.
                Delete stays outside it, so cleanup still works. */}
            <fieldset disabled={props.revoked} class="m-0 min-w-0 border-0 p-0">
              {/* The fast path: a name, a rate and who may call. Everything
                  else lives behind the <details> below — its inputs stay in
                  the DOM and submit whether it is open or not, so this is
                  presentation only: one POST, no data loss. */}
              <div class="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <Field label={labels.name}>
                  <input
                    name="name"
                    value={v?.name ?? ""}
                    placeholder={labels.namePh}
                    class="input input-bordered w-full"
                    required
                    autofocus
                  />
                </Field>
                <Field label={labels.ratePerMin}>
                  <input
                    name="rateLimitPerMin"
                    value={v?.rateLimitPerMin ?? ""}
                    placeholder={labels.ratePh}
                    inputmode="numeric"
                    class="input input-bordered w-full"
                  />
                </Field>
                <Field label={labels.allowedOrigins} class="sm:col-span-2">
                  <input
                    name="allowedOrigins"
                    value={v?.allowedOrigins ?? ""}
                    placeholder={labels.originsPh}
                    class="input input-bordered w-full"
                  />
                </Field>
                <div class="sm:col-span-2 rounded-box border border-base-300 p-3">
                  <Check name="keyless" label={labels.keyless} hint={labels.keylessHint} checked={v?.keyless ?? false} />
                </div>
              </div>

              {/* A failed save re-opens the panel with every section expanded,
                  so the field the server complained about is reachable without
                  a click. */}
              <details ref={detailsRef} class="mt-4 rounded-box border border-base-300" open={props.error != null}>
                <summary class="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-base-content/75">
                  {labels.advanced}
                </summary>
                <div class="grid gap-x-4 gap-y-3 p-3 pt-1 sm:grid-cols-2">
                  <Field label={labels.allowedHosts} class="sm:col-span-2">
                    <input
                      name="allowedHosts"
                      value={v?.allowedHosts ?? ""}
                      placeholder={labels.allowedHostsPh}
                      class="input input-bordered w-full font-mono text-xs"
                    />
                  </Field>
                  <Field label={labels.cacheTtl}>
                    <input
                      name="cacheTtl"
                      value={v?.cacheTtl ?? ""}
                      placeholder={labels.ttlPh}
                      inputmode="numeric"
                      title={labels.cacheTtlTitle}
                      class="input input-bordered w-full"
                    />
                  </Field>
                  <Field label={labels.noCache}>
                    <div class="flex h-10 items-center gap-2 text-sm text-base-content/75" title={labels.noCacheHint}>
                      <input type="checkbox" name="noCache" value="on" class="checkbox" checked={v?.noCache ?? false} />
                      <span>{labels.noCacheShort}</span>
                    </div>
                  </Field>
                  {/* Public tier: the shared key of a hosted instance. It ships with
                      extra restrictions and daily quotas — see app/proxy/quota.ts. */}
                  <div class="sm:col-span-2 rounded-box border border-base-300 p-3">
                    <Check
                      name="tier"
                      label={labels.publicTier}
                      hint={labels.publicTierHint}
                      checked={v?.tier ?? false}
                    />
                    <div class="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-3">
                      <Field label={labels.dailyLimitPerOrigin}>
                        <input
                          name="dailyLimitPerOrigin"
                          value={v?.dailyLimitPerOrigin ?? ""}
                          placeholder={labels.dailyLimitPh}
                          inputmode="numeric"
                          class="input input-bordered w-full"
                        />
                      </Field>
                      <Field label={labels.dailyLimitPerHost}>
                        <input
                          name="dailyLimitPerHost"
                          value={v?.dailyLimitPerHost ?? ""}
                          placeholder={labels.dailyLimitPh}
                          inputmode="numeric"
                          class="input input-bordered w-full"
                        />
                      </Field>
                      <Field label={labels.dailyLimitTotal}>
                        <input
                          name="dailyLimitTotal"
                          value={v?.dailyLimitTotal ?? ""}
                          placeholder={labels.dailyLimitPh}
                          inputmode="numeric"
                          class="input input-bordered w-full"
                        />
                      </Field>
                    </div>
                    <p class="mt-2 text-xs text-base-content/75">{labels.dailyLimits}</p>
                  </div>
                </div>
                <div class="px-3 pb-3">
                  <div class="rounded-box border border-base-300 p-3">
                    <div class="mb-2 text-xs font-medium uppercase tracking-wide text-base-content/75">
                      {labels.checks}
                    </div>
                    <div class="space-y-3">
                      <Check name="ipCheck" label={labels.ipCheck} hint={labels.ipCheckHint} checked={v?.ipCheck ?? true} />
                      <Check name="dnsCheck" label={labels.dnsCheck} hint={labels.dnsCheckHint} checked={v?.dnsCheck ?? true} />
                    </div>
                  </div>
                </div>
              </details>

              {/* Upstream injection: variables are write-only — the editor shows
                  "NAME=" and a blank value keeps the stored secret. */}
              <div class="mt-4 rounded-box border border-base-300 p-3">
                <div class="text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.injection}</div>
                <p class="mt-1 text-xs text-base-content/75">{labels.injectionHint}</p>
                <div class="mt-3 grid gap-3">
                  <Field label={labels.vars}>
                    <textarea
                      name="vars"
                      rows={2}
                      placeholder={labels.varsPh}
                      class="textarea textarea-bordered w-full font-mono text-xs leading-5"
                    >
                      {v?.vars ?? ""}
                    </textarea>
                  </Field>
                  {/* Which variables a caller may reference, and where they may
                      go. Same `@hosts` section grammar as the rule fields. */}
                  <Field label={labels.clientVars}>
                    <textarea
                      name="clientVars"
                      rows={2}
                      placeholder={labels.clientVarsPh}
                      class="textarea textarea-bordered w-full font-mono text-xs leading-5"
                    >
                      {v?.clientVars ?? ""}
                    </textarea>
                  </Field>
                  <p class="-mt-2 text-xs text-base-content/75">{labels.clientVarsHint}</p>
                  <Field label={labels.headerRules}>
                    <textarea
                      name="headerRules"
                      rows={3}
                      placeholder={labels.headerRulesPh}
                      class="textarea textarea-bordered w-full font-mono text-xs leading-5"
                    >
                      {v?.headerRules ?? ""}
                    </textarea>
                  </Field>
                  <Field label={labels.paramRules}>
                    <textarea
                      name="paramRules"
                      rows={2}
                      placeholder={labels.paramRulesPh}
                      class="textarea textarea-bordered w-full font-mono text-xs leading-5"
                    >
                      {v?.paramRules ?? ""}
                    </textarea>
                  </Field>
                  {/* Response rules are their own concern (what the caller gets
                      back), and the embed recipe is the reason they exist — say
                      so where the operator configures it. */}
                  <Field label={labels.responseRules}>
                    <textarea
                      name="responseRules"
                      rows={2}
                      placeholder={labels.responseRulesPh}
                      class="textarea textarea-bordered w-full font-mono text-xs leading-5"
                    >
                      {v?.responseRules ?? ""}
                    </textarea>
                  </Field>
                  <p class="-mt-1 text-xs leading-relaxed text-base-content/75">{labels.responseRulesHint}</p>
                </div>
              </div>
            </fieldset>

            {/* Danger zone sits inside the save form (its button is
                type="button", so it never submits) — order-wise it belongs
                above the Cancel/Save row. */}
            {props.deleteAction && props.keyName ? (
              <div class="mt-4 flex items-center justify-between gap-4 rounded-box border border-error/30 bg-error/5 p-3">
                <div>
                  <div class="text-sm font-medium text-error">{labels.danger}</div>
                  <p class="text-xs text-base-content/75">{labels.dangerHint}</p>
                </div>
                <div class="flex shrink-0 items-center gap-2">
                  {props.revokeAction ? (
                    <button
                      type="button"
                      class="btn btn-warning btn-outline"
                      onClick={() => revokeRef.current?.showModal()}
                    >
                      {labels.revoke}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    class="btn btn-error btn-outline"
                    onClick={() => deleteRef.current?.showModal()}
                  >
                    {labels.delete}
                  </button>
                </div>
              </div>
            ) : null}

            <div class="modal-action">
              <button type="button" class="btn btn-ghost" onClick={hide}>
                {labels.cancel}
              </button>
              {props.revoked ? null : (
                <button ref={submitRef} type="submit" class="btn btn-primary">
                  {props.submit}
                </button>
              )}
            </div>
          </form>
        </div>
        {/* Backdrop: a dialog form closes the <dialog> without any JS. */}
        <form method="dialog" class="modal-backdrop">
          <button aria-label={labels.close}>{labels.close}</button>
        </form>
      </dialog>

      {props.revokeAction && props.keyName ? (
        <NameConfirm
          dialogRef={revokeRef}
          titleId={revokeTitleId}
          title={labels.revokeTitle}
          hint={labels.revokeHint}
          confirmLabel={labels.deleteConfirm}
          cancel={labels.cancel}
          close={labels.close}
          submit={labels.revoke}
          action={props.revokeAction}
          keyName={props.keyName}
          csrf={props.csrf ?? ""}
        />
      ) : null}

      {props.deleteAction && props.keyName ? (
        <NameConfirm
          dialogRef={deleteRef}
          titleId={deleteTitleId}
          title={labels.deleteTitle}
          hint={labels.deleteHint}
          confirmLabel={labels.deleteConfirm}
          cancel={labels.cancel}
          close={labels.close}
          submit={labels.delete}
          action={props.deleteAction}
          keyName={props.keyName}
          csrf={props.csrf ?? ""}
        />
      ) : null}
    </>
  );
}

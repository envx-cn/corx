import type { Child } from "hono/jsx";
import { useEffect, useId, useRef } from "hono/jsx/dom";

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
  /** Preset row in the create panel (anchors; the server pre-fills the form). */
  presets: string;
  presetLocal: string;
  presetPublic: string;
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
  danger: string;
  dangerHint: string;
  delete: string;
  deleteTitle: string;
  deleteHint: string;
  deleteConfirm: string;
  cancel: string;
  close: string;
  /** "blank = …" lines under the fields, filled with the deployment's values. */
  rateDefault: string;
  originsDefault: string;
  cacheDefault: string;
  /** Confirm before closing a panel with unsaved changes. */
  discardConfirm: string;
  /** Submit-button label while its POST is in flight. */
  saving: string;
  /** Informational banner in a revoked key's (read-only) panel. */
  revokedHint: string;
  revoke: string;
  revokeTitle: string;
  revokeHint: string;
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
  /** Create panel only: render the preset anchors (a server-side ?preset= prefill). */
  presets?: boolean;
  /** Open the advanced <details> on first render (a preset touched it). */
  expandAdvanced?: boolean;
  /** The deployment's effective defaults, shown as "blank = …". */
  defaults: { rate: string; origins: string; ttl: string; publicTtl: string };
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
  /** Field values as first rendered: what "unsaved changes" is measured against. */
  const initialRef = useRef<Map<string, { value: string; checked: boolean }> | null>(null);
  const deleteRef = useRef<HTMLDialogElement>(null);
  const revokeRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const deleteTitleId = useId();
  const revokeTitleId = useId();
  const { labels } = props;
  const v = props.values;

  useEffect(() => {
    const form = formRef.current;
    if (form) {
      const snapshot = new Map<string, { value: string; checked: boolean }>();
      form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]").forEach((el) => {
        snapshot.set(el.name, { value: el.value, checked: "checked" in el ? el.checked : false });
      });
      initialRef.current = snapshot;
    }
    if (props.open && ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const show = () => ref.current?.showModal();

  /** Anything typed since the panel opened? Measured against the first render. */
  const dirty = () => {
    const form = formRef.current;
    const initial = initialRef.current;
    if (!form || !initial) return false;
    let changed = false;
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]").forEach((el) => {
      const before = initial.get(el.name);
      if (!before) return;
      if (el.value !== before.value) changed = true;
      else if ("checked" in el && el.checked !== before.checked) changed = true;
    });
    return changed;
  };

  /** Closing by hand discards the draft: ask first once anything changed. */
  const requestClose = () => {
    if (dirty() && !confirm(labels.discardConfirm)) return;
    ref.current?.close();
  };

  /** The dialog's own cancel event (Esc); field values decide whether it closes. */
  const onCancel = (e: Event) => {
    if (dirty() && !confirm(labels.discardConfirm)) e.preventDefault();
  };

  /**
   * One POST per form. The browser navigates away on submit, but a slow round
   * trip would still let a second click create a second key — and only that
   * key's raw value is ever shown. Disabling imperatively keeps the panel
   * state-less, so honox never re-renders over what is being typed.
   */
  const onSubmit = () => {
    if (formRef.current) formRef.current.setAttribute("aria-busy", "true");
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
      <dialog ref={ref} class="modal" aria-labelledby={titleId} onCancel={onCancel}>
        <div class="modal-box">
          <button
            type="button"
            class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            aria-label={labels.close}
            onClick={requestClose}
          >
            ✕
          </button>
          <h3 id={titleId} class="text-lg font-semibold">
            {props.title}
          </h3>
          {/* A re-opened dialog is top-layer: a page-level alert behind it is
              invisible. The server message is rendered here verbatim (line
              prefixes and all) so the failed save explains itself. */}
          {props.error ? (
            <div role="alert" class="alert alert-error mt-4">
              <span>{props.error}</span>
            </div>
          ) : null}
          {props.revoked ? (
            <div role="status" class="alert alert-warning mt-4">
              <span>{labels.revokedHint}</span>
            </div>
          ) : null}
          {/* Presets are anchors, not state: the server pre-fills the form and
              re-opens this panel, so the values render and are testable. */}
          {props.presets ? (
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span class="text-xs text-base-content/75">{labels.presets}</span>
              <a class="btn btn-xs" href="/console/keys?preset=local">
                {labels.presetLocal}
              </a>
              <a class="btn btn-xs" href="/console/keys?preset=public">
                {labels.presetPublic}
              </a>
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
                  <p class="mt-1 text-xs text-base-content/75">{labels.rateDefault}</p>
                </Field>
                <Field label={labels.allowedOrigins} class="sm:col-span-2">
                  <input
                    name="allowedOrigins"
                    value={v?.allowedOrigins ?? ""}
                    placeholder={labels.originsPh}
                    class="input input-bordered w-full"
                  />
                  <p class="mt-1 text-xs text-base-content/75">{labels.originsDefault}</p>
                </Field>
                <div class="sm:col-span-2 rounded-box border border-base-300 p-3">
                  <Check name="keyless" label={labels.keyless} hint={labels.keylessHint} checked={v?.keyless ?? false} />
                </div>
              </div>

              {/* A failed save re-opens the panel with every section expanded,
                  so the field the server complained about is reachable without
                  a click. */}
              <details class="mt-4 rounded-box border border-base-300" open={props.error != null || props.expandAdvanced}>
                <summary class="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-base-content/75">
                  {labels.advanced}
                </summary>
                <div class="grid gap-x-4 gap-y-3 p-3 pt-1 sm:grid-cols-2">
                  <Field label={labels.cacheTtl}>
                    <input
                      name="cacheTtl"
                      value={v?.cacheTtl ?? ""}
                      placeholder={labels.ttlPh}
                      inputmode="numeric"
                      title={labels.cacheTtlTitle}
                      class="input input-bordered w-full"
                    />
                    <p class="mt-1 text-xs text-base-content/75">{labels.cacheDefault}</p>
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
              <button type="button" class="btn btn-ghost" onClick={requestClose}>
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
        {/* Backdrop: a dialog form closes the <dialog> without any JS. Intercept
            the submit so a dirty form asks before the draft is discarded. */}
        <form
          method="dialog"
          class="modal-backdrop"
          onSubmit={(e: Event) => {
            if (dirty() && !confirm(labels.discardConfirm)) e.preventDefault();
          }}
        >
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

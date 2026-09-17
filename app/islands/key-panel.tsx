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
  allowedHosts: string;
  /** Editor text; variable values stay blank ("blank = keep existing"). */
  vars: string;
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
  /** Delete endpoint — set on the edit panel to render the danger zone. */
  deleteAction?: string;
  /** Session-bound CSRF token, rendered into both POST forms. */
  csrf?: string;
  /** Current name of the key (delete confirmation). */
  keyName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const confirmTitleId = useId();
  const { labels } = props;
  const v = props.values;

  useEffect(() => {
    if (props.open && ref.current && !ref.current.open) ref.current.showModal();
  }, []);

  const show = () => ref.current?.showModal();
  const hide = () => ref.current?.close();
  const closeConfirm = () => {
    confirmRef.current?.close();
    if (confirmInputRef.current) confirmInputRef.current.value = "";
    syncConfirm();
  };
  /** Enable the confirm submit only once the typed name matches. */
  const syncConfirm = () => {
    if (confirmButtonRef.current && confirmInputRef.current) {
      confirmButtonRef.current.disabled = confirmInputRef.current.value.trim() !== props.keyName;
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
          <form method="post" action={props.action} class="mt-4">
            {/* Marker: a hand-rolled POST without it (script, stale form) gets
                the safe defaults (both checks on) instead of an absent -
                unchecked - field silently turning the guards off. */}
            <input type="hidden" name="checks" value="1" />
            <input type="hidden" name="csrf" value={props.csrf ?? ""} />
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
            </div>

            <div class="mt-4 rounded-box border border-base-300 p-3">
              <div class="mb-2 text-xs font-medium uppercase tracking-wide text-base-content/75">{labels.checks}</div>
              <div class="space-y-3">
                <Check name="ipCheck" label={labels.ipCheck} hint={labels.ipCheckHint} checked={v?.ipCheck ?? true} />
                <Check name="dnsCheck" label={labels.dnsCheck} hint={labels.dnsCheckHint} checked={v?.dnsCheck ?? true} />
              </div>
            </div>

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

            {/* Danger zone sits inside the save form (its button is
                type="button", so it never submits) — order-wise it belongs
                above the Cancel/Save row. */}
            {props.deleteAction && props.keyName ? (
              <div class="mt-4 flex items-center justify-between gap-4 rounded-box border border-error/30 bg-error/5 p-3">
                <div>
                  <div class="text-sm font-medium text-error">{labels.danger}</div>
                  <p class="text-xs text-base-content/75">{labels.dangerHint}</p>
                </div>
                <button
                  type="button"
                  class="btn btn-error btn-outline shrink-0"
                  onClick={() => confirmRef.current?.showModal()}
                >
                  {labels.delete}
                </button>
              </div>
            ) : null}

            <div class="modal-action">
              <button type="button" class="btn btn-ghost" onClick={hide}>
                {labels.cancel}
              </button>
              <button type="submit" class="btn btn-primary">
                {props.submit}
              </button>
            </div>
          </form>
        </div>
        {/* Backdrop: a dialog form closes the <dialog> without any JS. */}
        <form method="dialog" class="modal-backdrop">
          <button aria-label={labels.close}>{labels.close}</button>
        </form>
      </dialog>

      {props.deleteAction && props.keyName ? (
        <dialog ref={confirmRef} class="modal" aria-labelledby={confirmTitleId}>
          <div class="modal-box max-w-md">
            <h3 id={confirmTitleId} class="text-lg font-semibold">
              {labels.deleteTitle}
            </h3>
            <p class="mt-2 text-sm text-base-content/75">{labels.deleteHint.replace("{name}", props.keyName)}</p>
            <form method="post" action={props.deleteAction} class="mt-4">
              <input type="hidden" name="csrf" value={props.csrf ?? ""} />
              <input
                ref={confirmInputRef}
                name="confirmName"
                onInput={syncConfirm}
                autocomplete="off"
                placeholder={labels.deleteConfirm}
                aria-label={labels.deleteConfirm}
                class="input input-bordered w-full"
              />
              <div class="modal-action">
                <button type="button" class="btn btn-ghost" onClick={closeConfirm}>
                  {labels.cancel}
                </button>
                <button ref={confirmButtonRef} type="submit" class="btn btn-error" disabled>
                  {labels.delete}
                </button>
              </div>
            </form>
          </div>
          <form method="dialog" class="modal-backdrop">
            <button aria-label={labels.close}>{labels.close}</button>
          </form>
        </dialog>
      ) : null}
    </>
  );
}

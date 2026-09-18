/** UI strings for the confirmation dialog (injected from the server dict). */
export interface ConfirmI18n {
  title: string;
  body: string;
  confirm: string;
  cancel: string;
  close: string;
}

/**
 * A one-click POST behind a confirm dialog (logout, blocklist remove). The
 * trigger opens a native <dialog>; the dialog's button is the real submit and
 * points at the empty form via `form=`, so nothing is submitted by the opener
 * alone, and Esc / backdrop / Cancel simply close.
 *
 * Server-rendered on purpose — no island: the trigger → showModal() wiring is
 * a few lines in the Doc's inline script (app/routes/console/_layout.tsx),
 * which cannot be clobbered by an island re-render and needs no hydration, so
 * a page whose islands failed to hydrate still logs out. That script also
 * reparents the dialog to <body>: a closed daisyUI dropdown is display:none,
 * which would hide the dialog even in the top layer.
 *
 * Cancel/backdrop are `<form method="dialog">`, so they close without JS.
 *
 * The real submit form carries the session-bound CSRF token; render the dialog
 * without one (no session, no secret) and the POST is refused — the safe side
 * of a misconfigured deployment.
 */
let seq = 0;

export function ConfirmButton(props: {
  action: string;
  label: string;
  triggerClass: string;
  confirmClass?: string;
  i18n: ConfirmI18n;
  /** Session-bound CSRF token (omit only where no session exists). */
  csrf?: string;
}) {
  seq += 1;
  const id = `corx-confirm-${seq}`;
  const formId = `${id}-form`;
  const titleId = `${id}-title`;
  return (
    <>
      <button type="button" class={props.triggerClass} data-corx-confirm={id}>
        {props.label}
      </button>
      <form id={formId} method="post" action={props.action} class="contents">
        {props.csrf ? <input type="hidden" name="csrf" value={props.csrf} /> : null}
      </form>
      <dialog id={id} class="modal" aria-labelledby={titleId}>
        <div class="modal-box max-w-sm">
          <h3 id={titleId} class="text-lg font-semibold">
            {props.i18n.title}
          </h3>
          <p class="mt-2 text-sm text-base-content/75">{props.i18n.body}</p>
          <div class="modal-action">
            {/* method="dialog" closes the modal without any JS. */}
            <form method="dialog" class="contents">
              <button type="submit" class="btn btn-ghost">
                {props.i18n.cancel}
              </button>
            </form>
            <button type="submit" form={formId} class={props.confirmClass ?? "btn btn-error"}>
              {props.i18n.confirm}
            </button>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button aria-label={props.i18n.close}>{props.i18n.close}</button>
        </form>
      </dialog>
    </>
  );
}

/** UI strings for a type-the-name confirmation (revoke, delete). */
export interface ConfirmByNameI18n {
  title: string;
  /** "Type {name} to confirm" — the name is substituted by the component. */
  hint: string;
  placeholder: string;
  submit: string;
  cancel: string;
  close: string;
}

/**
 * The same confirm dialog, plus a type-the-name check: the submit button stays
 * disabled until the input matches, wired by the Doc script (no island), and
 * the server re-checks the name anyway. Used for revoke and hard delete.
 */
export function ConfirmByNameButton(props: {
  action: string;
  label: string;
  triggerClass: string;
  confirmClass?: string;
  i18n: ConfirmByNameI18n;
  keyName: string;
  csrf?: string;
}) {
  seq += 1;
  const id = `corx-confirm-${seq}`;
  const titleId = `${id}-title`;
  return (
    <>
      <button type="button" class={props.triggerClass} data-corx-confirm={id}>
        {props.label}
      </button>
      <dialog id={id} class="modal" aria-labelledby={titleId} data-corx-confirm-name={props.keyName}>
        <div class="modal-box max-w-md">
          <h3 id={titleId} class="text-lg font-semibold">
            {props.i18n.title}
          </h3>
          <p class="mt-2 text-sm text-base-content/75">{props.i18n.hint.replace("{name}", props.keyName)}</p>
          <form method="post" action={props.action} class="mt-4">
            {props.csrf ? <input type="hidden" name="csrf" value={props.csrf} /> : null}
            <input
              name="confirmName"
              data-corx-confirm-input
              autocomplete="off"
              placeholder={props.i18n.placeholder}
              aria-label={props.i18n.placeholder}
              class="input input-bordered w-full"
            />
            <div class="modal-action">
              <form method="dialog" class="contents">
                <button type="submit" class="btn btn-ghost">
                  {props.i18n.cancel}
                </button>
              </form>
              <button
                type="submit"
                data-corx-confirm-submit
                class={props.confirmClass ?? "btn btn-error"}
                disabled
              >
                {props.i18n.submit}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button aria-label={props.i18n.close}>{props.i18n.close}</button>
        </form>
      </dialog>
    </>
  );
}

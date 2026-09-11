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
 */
let seq = 0;

export function ConfirmButton(props: {
  action: string;
  label: string;
  triggerClass: string;
  confirmClass?: string;
  i18n: ConfirmI18n;
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
      <form id={formId} method="post" action={props.action} class="contents" />
      <dialog id={id} class="modal" aria-labelledby={titleId}>
        <div class="modal-box max-w-sm">
          <h3 id={titleId} class="text-lg font-semibold">
            {props.i18n.title}
          </h3>
          <p class="mt-2 text-sm text-base-content/70">{props.i18n.body}</p>
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

import { useEffect, useId, useRef } from "hono/jsx/dom";

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
 * points at the empty form via `form=`, so nothing is ever submitted by the
 * opener alone, and Esc / backdrop / Cancel simply close.
 *
 * The island root stays a fragment: the trigger button comes first so it keeps
 * being a direct child of whatever it sits in (a daisyUI menu item styles
 * `li > x`, a table cell flexes its children), then the form it submits (empty
 * and `display: contents`) and the dialog.
 *
 * On mount the dialog is reparented to <body>: daisyUI hides a closed dropdown
 * with `display: none`, which would hide the dialog with it (an open modal is
 * painted in the top layer, but `display` on an ancestor still wins). The island
 * has no state, so nothing re-renders and the move is safe.
 *
 * API-key deletion uses the stronger "type the name" flow in key-panel.tsx.
 */
export default function ConfirmButton(props: {
  action: string;
  label: string;
  triggerClass: string;
  confirmClass?: string;
  i18n: ConfirmI18n;
}) {
  const formId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (el && el.parentElement !== document.body) document.body.appendChild(el);
  }, []);
  return (
    <>
      <button type="button" class={props.triggerClass} onClick={() => dialogRef.current?.showModal()}>
        {props.label}
      </button>
      <form id={formId} method="post" action={props.action} class="contents" />
      <dialog ref={dialogRef} class="modal" aria-labelledby={titleId}>
        <div class="modal-box max-w-sm">
          <h3 id={titleId} class="text-lg font-semibold">
            {props.i18n.title}
          </h3>
          <p class="mt-2 text-sm text-base-content/70">{props.i18n.body}</p>
          <div class="modal-action">
            <button type="button" class="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
              {props.i18n.cancel}
            </button>
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

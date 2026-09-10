import type { Child } from "hono/jsx";

/** daisyUI data table wrapper: hairline rows + hover, horizontal scroll on small screens. */
export function DataTable(props: { head: Child; body: Child }) {
  return (
    <div class="overflow-x-auto bg-base-100 border border-base-300 rounded-box mb-4">
      <table class="table table-sm table-hover">
        <thead>{props.head}</thead>
        <tbody>{props.body}</tbody>
      </table>
    </div>
  );
}

/** Shared empty-state row for DataTable bodies. */
export function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return (
    <tr>
      <td colspan={cols} class="text-center text-base-content/50 py-4">
        {text}
      </td>
    </tr>
  );
}

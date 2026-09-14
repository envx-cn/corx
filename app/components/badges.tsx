/**
 * Status/method labels rendered as plain colored text — no badge backgrounds,
 * so dense tables (logs, requests) stay quiet and scannable.
 */
export function StatusBadge({ status }: { status: number | null }) {
  if (status == null) return <span class="text-base-content/75">—</span>;
  const cls =
    status < 300 ? "text-success" : status < 400 ? "text-info" : status < 500 ? "text-warning" : "text-error";
  return <span class={`font-medium tabular-nums ${cls}`}>{status}</span>;
}

export function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const cls =
    m === "GET"
      ? "text-info"
      : m === "POST"
        ? "text-success"
        : m === "DELETE"
          ? "text-error"
          : m === "HEAD" || m === "OPTIONS"
            ? "text-base-content/75"
            : "text-warning";
  return <span class={`font-medium ${cls}`}>{m}</span>;
}

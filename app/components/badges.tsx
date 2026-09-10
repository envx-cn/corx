export function StatusBadge({ status }: { status: number | null }) {
  if (status == null) return <span class="badge badge-ghost">—</span>;
  const cls = status < 300 ? "badge-success" : status < 400 ? "badge-info" : status < 500 ? "badge-warning" : "badge-error";
  return <span class={`badge ${cls}`}>{status}</span>;
}

export function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const cls =
    m === "GET"
      ? "badge-info"
      : m === "POST"
        ? "badge-success"
        : m === "DELETE"
          ? "badge-error"
          : m === "HEAD" || m === "OPTIONS"
            ? "badge-ghost"
            : "badge-warning";
  return <span class={`badge ${cls}`}>{m}</span>;
}

export function StatusBadge({ status }: { status: number | null }) {
  if (status == null) return <span class="badge muted">—</span>;
  const cls = status < 300 ? "ok" : status < 400 ? "info" : status < 500 ? "warn" : "err";
  return <span class={`badge ${cls}`}>{status}</span>;
}

export function MethodBadge({ method }: { method: string }) {
  const m = method.toUpperCase();
  const cls =
    m === "GET" ? "info" : m === "POST" ? "ok" : m === "DELETE" ? "err" : m === "HEAD" || m === "OPTIONS" ? "muted" : "warn";
  return <span class={`badge ${cls}`}>{m}</span>;
}

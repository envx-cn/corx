import type { Child } from "hono/jsx";

export function StatCard({ value, label }: { value: Child; label: string }) {
  return (
    <div class="card">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

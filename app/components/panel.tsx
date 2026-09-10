import type { Child } from "hono/jsx";

export function Panel({ children }: { children: Child }) {
  return (
    <div class="panel">
      <div class="table-wrap">
        <table>{children}</table>
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children?: Child }) {
  return (
    <>
      <h2 class="section">{title}</h2>
      {children}
    </>
  );
}

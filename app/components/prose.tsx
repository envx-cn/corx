import type { Child } from "hono/jsx";

/**
 * Shared prose layout for the long-form public documents (currently /docs and
 * /snippets): one H2 section with the scroll margin the sticky nav needs, and
 * an H3 step inside it. Kept in components/ because two pages render the same
 * shape — the alternative is two copies drifting apart.
 */

/** One H2 section, with the scroll margin the sticky nav needs. */
export function Section(props: { id: string; title: string; children: Child }) {
  return (
    <section id={props.id} class="mt-12 scroll-mt-24">
      <h2 class="text-xl font-semibold tracking-tight">{props.title}</h2>
      {props.children}
    </section>
  );
}

/** One H3 step inside a section. */
export function SubSection(props: { title: string; body: string }) {
  return (
    <div class="mt-6">
      <h3 class="text-base font-semibold">{props.title}</h3>
      <p class="mt-1.5 text-sm text-base-content/75 leading-relaxed">{props.body}</p>
    </div>
  );
}

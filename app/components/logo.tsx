import logoSvg from "../assets/corx-logo.svg?raw";
import markSvg from "../assets/corx-mark.svg?raw";

/**
 * Brand assets, inlined (same reason as the CSS and the lucide icons: no
 * <link>/manifest to keep in sync, and the artwork can inherit `color`).
 *
 * The "COR" letters are `currentColor` (dark slate on light chrome, white on
 * the dark footer band), the X is the brand red. Both files carry their own
 * <title>, so the wrapper needs no aria-label of its own.
 */

/**
 * Full "COR X" wordmark. Size it with a height utility on the wrapper, e.g.
 * `<CorxLogo class="h-8" />` — the SVG itself has no fixed size.
 */
export function CorxLogo({ class: cls }: { class?: string }) {
  return <span class={`corx-logo ${cls ?? ""}`} dangerouslySetInnerHTML={{ __html: logoSvg }} />;
}

/** The X alone, for tight spots (the collapsed sidebar rail, square avatars). */
export function CorxMark({ class: cls }: { class?: string }) {
  return <span class={`corx-logo ${cls ?? ""}`} dangerouslySetInnerHTML={{ __html: markSvg }} />;
}

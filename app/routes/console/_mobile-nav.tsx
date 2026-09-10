import type { NavItem } from "./_nav.js";
import { Lucide } from "../../components/lucide.js";

/** Bottom nav shown on small screens (duplicates the sidebar links). */
export function MobileNav(props: { active: string; items: NavItem[] }) {
  return (
    <nav class="mnav" aria-label="Console sections">
      {props.items.map((item) => (
        <a
          class={`nav-item${props.active === item.href ? " active" : ""}`}
          href={item.href}
          aria-current={props.active === item.href ? "page" : undefined}
        >
          <Lucide svg={item.svg} />
          {item.label}
        </a>
      ))}
    </nav>
  );
}

import logoutSvg from "lucide-static/icons/log-out.svg?raw";
import type { NavItem } from "./_nav.js";
import { Lucide } from "../../components/lucide.js";

/**
 * Console sidebar: branding + primary nav + the signed-in user with sign-out.
 * Colocated with the console because it is console-specific chrome — the
 * layout shell in _layout.tsx composes it, never inline-expands it.
 */
export function Sidebar(props: { user: string; active: string; items: NavItem[] }) {
  return (
    <aside class="sidebar">
      <div class="logo">
        <span class="logo-mark">cx</span>corx
      </div>
      <nav class="nav" aria-label="Console sections">
        <div class="nav-label">Manage</div>
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
      <div class="side-user">
        <div class="email" title={props.user}>
          {props.user}
        </div>
        <form method="post" action="/console/logout">
          <button class="btn btn-sm btn-icon" title="Sign out">
            <Lucide svg={logoutSvg} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

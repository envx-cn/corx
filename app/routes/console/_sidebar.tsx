import logoutSvg from "lucide-static/icons/log-out.svg?raw";
import type { NavItem } from "./_nav.js";
import { Lucide } from "../../components/lucide.js";

/**
 * Console sidebar (daisyUI menu), rendered inside the drawer-side.
 * Colocated with the console because it is console-specific chrome.
 */
export function Sidebar(props: { user: string; active: string; items: NavItem[] }) {
  return (
    <aside class="w-72 min-h-full bg-base-100 border-r border-base-300 flex flex-col">
      <div class="flex items-center gap-2 px-5 h-16 border-b border-base-300 shrink-0">
        <span class="size-7 rounded-lg bg-gradient-to-br from-accent to-warning text-white inline-flex items-center justify-center text-xs font-extrabold">
          cx
        </span>
        <b class="text-base">corx</b>
      </div>
      <ul class="menu menu-lg flex-1 p-3 gap-1 flex-nowrap">
        <li class="menu-title">Manage</li>
        {props.items.map((item) => (
          <li>
            <a
              href={item.href}
              aria-current={props.active === item.href ? "page" : undefined}
              class={props.active === item.href ? "menu-active" : undefined}
            >
              <Lucide svg={item.svg} />
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <div class="p-4 border-t border-base-300 text-sm shrink-0">
        <div class="text-xs text-base-content/60 truncate mb-2" title={props.user}>
          {props.user}
        </div>
        <form method="post" action="/console/logout">
          <button class="btn btn-sm btn-ghost w-full justify-start" title="Sign out">
            <Lucide svg={logoutSvg} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

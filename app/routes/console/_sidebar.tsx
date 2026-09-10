import type { NavItem } from "./_nav.js";
import { Lucide } from "../../components/lucide.js";
import chevronsLeftSvg from "lucide-static/icons/chevrons-left.svg?raw";

/**
 * Console sidebar, styled after dash.cloudflare.com. The aside itself is
 * absolutely positioned inside drawer-side (over a .sidebar-slot that holds
 * the in-flow gutter), so it can float over the content without pushing it.
 *
 * Collapse: CSS-only. The #sidebar-collapse checkbox (peer of the slot/aside,
 * in the layout) is toggled by the bottom-left button; :checked drives the
 * 4rem icon rail. While collapsed, hovering the nav band floats the menu open
 * (script toggles .flyout-open → the SAME aside widens to 16rem, overlaying
 * the content). The header + collapse button never trigger it, and their
 * heights are identical in both states.
 */
export function Sidebar(props: { user: string; active: string; items: NavItem[] }) {
  return (
    <aside
      data-sidebar
      class="absolute top-0 left-0 h-full transition-[width] duration-200 ease-out w-64 min-h-full bg-base-100 border-r border-base-300 flex flex-col"
    >
      <div class="flex items-center gap-2.5 px-5 h-16 border-b border-base-300 shrink-0 whitespace-nowrap">
        <span class="corx-mark size-8 rounded-lg text-white inline-flex items-center justify-center text-xs font-extrabold shrink-0">
          cx
        </span>
        <b class="text-lg tracking-tight brand-text">corx</b>
      </div>

      {/* The nav band: hovering it (when collapsed) floats the menu open. */}
      <div class="sidebar-navzone flex-1 flex">
        <ul class="flex-1 p-2 gap-1 flex flex-col">
          {props.items.map((item) => {
            const isActive = props.active === item.href;
            return (
              <li>
                <a href={item.href} aria-current={isActive ? "page" : undefined} class="nav-item mx-1">
                  <Lucide svg={item.svg} />
                  <span class="truncate nav-label">{item.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <div class="hidden lg:flex h-12 shrink-0 border-t border-base-300 items-center justify-start px-[11px]">
        <button
          type="button"
          id="sidebar-collapse-toggle"
          class="size-8.5 grid place-items-center rounded-lg text-base-content/50 hover:bg-black/[0.045] hover:text-base-content cursor-pointer"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <span class="inline-flex collapse-chevron transition-transform duration-200">
            <Lucide svg={chevronsLeftSvg} />
          </span>
        </button>
      </div>
    </aside>
  );
}

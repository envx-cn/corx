import userSvg from "lucide-static/icons/user.svg?raw";
import { Lucide } from "../../components/lucide.js";

/**
 * Top bar, styled after dash.cloudflare.com: the header shares the page's
 * canvas background and hairline bottom border; breadcrumb on the left, the
 * user menu on the right (Profile / Billing / Log out).
 */
export function Topbar(props: { title: string; user: string }) {
  return (
    <div class="navbar bg-base-200 border-b border-base-300 sticky top-0 z-30 min-h-16 px-4 gap-2">
      <div class="flex-none lg:hidden">
        <label for="console-drawer" class="btn btn-square btn-ghost" aria-label="Open sidebar">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </label>
      </div>
      <div class="flex-1 flex items-center gap-1.5 text-sm min-w-0">
        <span class="text-base-content/55">corx</span>
        <span class="text-base-content/30">/</span>
        <b class="font-semibold truncate">{props.title}</b>
      </div>

      <div class="flex-none">
        <div class="dropdown dropdown-end">
          <div
            tabindex={0}
            role="button"
            aria-label="Account menu"
            class="size-8.5 rounded-lg inline-flex items-center justify-center hover:bg-black/[0.045] cursor-pointer"
          >
            <span class="size-7 rounded-full bg-black/10 text-base-content/60 inline-flex items-center justify-center">
              <Lucide svg={userSvg} />
            </span>
          </div>
          <ul
            tabindex={0}
            class="dropdown-content menu menu-sm bg-base-100 rounded-lg border border-base-300 shadow-lg w-60 p-1.5 z-50 mt-1"
          >
            <li class="px-3 pt-2 pb-1 text-xs text-base-content/55 truncate" title={props.user}>
              {props.user}
            </li>
            <li class="menu-title px-3 pt-3 pb-0.5">Account</li>
            <li>
              <a href="/console/profile">Profile</a>
            </li>
            <li>
              <a href="/console/billing">Billing</a>
            </li>
            <li class="menu-title px-3 pt-3 pb-0.5">Session</li>
            <li>
              <form method="post" action="/console/logout">
                <button type="submit" class="w-full justify-start">
                  Log out
                </button>
              </form>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

import dashboardSvg from "lucide-static/icons/layout-dashboard.svg?raw";
import keySvg from "lucide-static/icons/key-round.svg?raw";
import playgroundSvg from "lucide-static/icons/flask-conical.svg?raw";
import logsSvg from "lucide-static/icons/scroll-text.svg?raw";
import blockedSvg from "lucide-static/icons/shield-alert.svg?raw";
import type { MessageKey } from "../../lib/i18n/messages.js";

/** One entry in the console navigation. */
export interface NavItem {
  href: string;
  /** Message key into console.nav.* (translated at render time). */
  label: MessageKey;
  svg: string;
}

/** Console navigation structure (data — rendered by _sidebar.tsx). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/console/", label: "console.nav.overview", svg: dashboardSvg },
  { href: "/console/keys", label: "console.nav.keys", svg: keySvg },
  { href: "/console/playground", label: "console.nav.playground", svg: playgroundSvg },
  { href: "/console/logs", label: "console.nav.logs", svg: logsSvg },
  { href: "/console/blocked", label: "console.nav.blocked", svg: blockedSvg },
];

/**
 * The nav entry (href) that should appear active for a request path.
 * Section hrefs match their own path and anything beneath; the Overview entry
 * (the "/console" index) is the fallback for every other /console path.
 */
export function activeNavItem(path: string): string {
  const p = path.replace(/\/+$/, "");
  for (const item of NAV_ITEMS) {
    if (item.href === "/console/") continue; // index handled as the fallback
    const href = item.href.replace(/\/+$/, "");
    if (p === href || p.startsWith(href + "/")) return item.href;
  }
  return NAV_ITEMS[0]?.href ?? "/console/";
}

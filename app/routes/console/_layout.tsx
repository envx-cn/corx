import type { Child } from "hono/jsx";
import appCss from "../../styles/app.css?inline";
import { Sidebar } from "./_sidebar.js";
import { Topbar } from "./_topbar.js";
import { NAV_ITEMS } from "./_nav.js";

function Doc(props: { title: string; children: Child; scripts?: Child }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} — corx console</title>
        {/* Inject the compiled Tailwind/daisyUI CSS raw — hono/jsx would
            otherwise HTML-escape it, mangling selectors like `.a > .b` into
            `.a &gt; .b` and silently dropping those rules. */}
        <style dangerouslySetInnerHTML={{ __html: appCss }}></style>
        {props.scripts}
      </head>
      <body class="bg-base-200">{props.children}</body>
    </html>
  );
}

/**
 * Console shell: daisyUI responsive drawer. On large screens the sidebar is
 * pinned open (lg:drawer-open); on small screens it slides in over the content
 * via the hamburger (CSS-only — no island needed).
 */
export function ConsoleLayout(props: {
  title: string;
  user: string;
  active: string;
  children: Child;
  /** Head scripts (island hydration entry). Set by the renderer. */
  scripts?: Child;
}) {
  return (
    <Doc title={props.title} scripts={props.scripts}>
      <div class="drawer lg:drawer-open">
        <input id="console-drawer" type="checkbox" class="drawer-toggle" />
        <div class="drawer-content flex flex-col min-h-svh">
          <Topbar title={props.title} />
          <main class="flex-1 w-full max-w-6xl mx-auto p-4 lg:p-6">{props.children}</main>
          <footer class="text-center py-4 text-xs text-base-content/50">corx · HonoX + D1 + R2</footer>
        </div>
        <div class="drawer-side z-40">
          <label for="console-drawer" aria-label="Close sidebar" class="drawer-overlay"></label>
          <Sidebar user={props.user} active={props.active} items={NAV_ITEMS} />
        </div>
      </div>
    </Doc>
  );
}

export function LoginShell(props: { title: string; children: Child }) {
  return (
    <Doc title={props.title}>
      <div class="min-h-svh flex items-center justify-center p-4">
        <div class="card w-full max-w-md bg-base-100 shadow-xl">
          <div class="card-body">{props.children}</div>
        </div>
      </div>
    </Doc>
  );
}

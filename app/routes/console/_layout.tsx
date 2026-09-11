import type { Child } from "hono/jsx";
import appCss from "../../styles/app.css?inline";
import { Sidebar } from "./_sidebar.js";
import { Topbar } from "./_topbar.js";
import { NAV_ITEMS } from "./_nav.js";
import type { Locale, TFunc } from "../../lib/i18n/locale.js";

function Doc(props: { title: string; children: Child; scripts?: Child }) {
  return (
    <html lang="en" data-theme="corx-dash">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} — corx console</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
          rel="stylesheet"
        />
        {/* Inject the compiled Tailwind/daisyUI CSS raw — hono/jsx would
            otherwise HTML-escape it, mangling selectors like `.a > .b` into
            `.a &gt; .b` and silently dropping those rules. */}
        <style dangerouslySetInnerHTML={{ __html: appCss }}></style>
        {/* Sidebar collapse: restore + persist the #sidebar-collapse checkbox
            (survives navigation), drive it from the bottom-left button, and
            float the real menu open ONLY while a nav item (icon) is hovered
            (.flyout-open on the aside) — hovering the panel padding or the
            collapse button does nothing. A <label for> would also toggle the
            checkbox, but Chromium skips :checked style invalidation for label
            activation here — the button calls checkbox.click(), which does
            invalidate. Plain script on purpose: hono islands re-render their
            own DOM, this must not. */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){function init(){try{var cb=document.getElementById("sidebar-collapse");if(!cb)return;var aside=document.querySelector("aside[data-sidebar]");cb.checked=localStorage.getItem("corx:sidebar-collapsed")==="1";var btn=document.getElementById("sidebar-collapse-toggle");if(btn)btn.addEventListener("click",function(e){e.preventDefault();cb.click()});        if(aside){var closeTimer=null;aside.querySelectorAll(".nav-item").forEach(function(a){a.addEventListener("mouseenter",function(){if(closeTimer){clearTimeout(closeTimer);closeTimer=null}aside.classList.add("flyout-open")});a.addEventListener("mouseleave",function(){if(closeTimer){clearTimeout(closeTimer)}closeTimer=setTimeout(function(){aside.classList.remove("flyout-open");closeTimer=null},120)})});}cb.addEventListener("change",function(){localStorage.setItem("corx:sidebar-collapsed",cb.checked?"1":"0")})}catch(e){}}if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",init)}else{init()}})();` }} />
        {props.scripts}
      </head>
      <body class="bg-base-200 font-sans antialiased">{props.children}</body>
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
  locale: Locale;
  t: TFunc;
  children: Child;
  /** Head scripts (island hydration entry). Set by the renderer. */
  scripts?: Child;
}) {
  return (
    <Doc title={props.title} scripts={props.scripts}>
      <div class="drawer lg:drawer-open">
        <input id="console-drawer" type="checkbox" class="drawer-toggle" />
        <div class="drawer-content flex flex-col min-h-svh">
          <Topbar title={props.title} user={props.user} locale={props.locale} t={props.t} />
          <main class="flex-1 w-full max-w-6xl mx-auto p-4 lg:p-6">{props.children}</main>
          <footer class="text-center py-4 text-xs text-base-content/50">corx</footer>
        </div>
        <div class="drawer-side z-40">
          <label for="console-drawer" aria-label="Close sidebar" class="drawer-overlay"></label>
          {/* Desktop sidebar collapse pin (peer of the slot/aside; CSS-only).
              hidden on mobile where the drawer overlay takes over. */}
          <input id="sidebar-collapse" type="checkbox" class="peer hidden lg:block absolute" aria-label="Collapse sidebar" />
          {/* In-flow gutter: holds the collapsed/expanded width so the floating
              aside can widen without pushing the content. Mobile uses the
              drawer overlay, so the slot is desktop-only. */}
          <div class="sidebar-slot hidden lg:block w-64"></div>
          <Sidebar user={props.user} active={props.active} items={NAV_ITEMS} t={props.t} />
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

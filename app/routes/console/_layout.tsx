import type { Child } from "hono/jsx";
import appCss from "../../styles/app.css?inline";
import { Sidebar } from "./_sidebar.js";
import { Topbar } from "./_topbar.js";
import { LangSwitch } from "./_lang-switch.js";
import { NAV_ITEMS } from "./_nav.js";
import type { Locale, TFunc } from "../../lib/i18n/locale.js";

/**
 * Full console document. The route renderer (jsxRenderer) prepends
 * <!DOCTYPE html> for c.render() pages — but pages that return a full document
 * themselves (login → LoginShell, the error page in app/server.ts) bypass the
 * renderer and must add the doctype at their call site.
 */
function Doc(props: { title: string; locale: Locale; children: Child; scripts?: Child }) {
  return (
    <html lang={props.locale} data-theme="corx-dash">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} — CORX console</title>
        {/* The console is for its operator, never for an index (robots.txt
            says the same; the meta tag covers the login page too, which
            crawlers can reach without a session). */}
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
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
        {/* Console chrome wiring, inline on purpose: hono islands re-render
            their own DOM subtree, so anything they'd own here gets clobbered —
            and a page whose islands failed to hydrate still needs logout to
            work.

            Sidebar: restore + persist the #sidebar-collapse checkbox
            (survives navigation), drive it from the bottom-left button, and
            float the real menu open ONLY while a nav item (icon) is hovered
            (.flyout-open on the aside) — hovering the panel padding or the
            collapse button does nothing. A <label for> would also toggle the
            checkbox, but Chromium skips :checked style invalidation for label
            activation here — the button calls checkbox.click(), which does
            invalidate.

            Confirm dialogs (logout, blocklist remove, revoke/delete):
            server-rendered in _confirm.tsx with a [data-corx-confirm] trigger,
            so this script only has to open them — and reparent them to <body>,
            because a closed daisyUI dropdown is display:none and would hide the
            dialog with it. Cancel/backdrop close via <form method="dialog">.
            Type-the-name dialogs carry data-corx-confirm-name; the script
            enables their submit only on a match and resets on close. Busy
            forms (data-corx-busy) disable their submit from the first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  function wireSidebar() {
    var cb = document.getElementById("sidebar-collapse");
    if (!cb) return;
    cb.checked = localStorage.getItem("corx:sidebar-collapsed") === "1";
    var toggle = document.getElementById("sidebar-collapse-toggle");
    if (toggle) toggle.addEventListener("click", function (e) { e.preventDefault(); cb.click(); });
    var aside = document.querySelector("aside[data-sidebar]");
    if (aside) {
      var closeTimer = null;
      aside.querySelectorAll(".nav-item").forEach(function (a) {
        a.addEventListener("mouseenter", function () {
          if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
          aside.classList.add("flyout-open");
        });
        a.addEventListener("mouseleave", function () {
          if (closeTimer) clearTimeout(closeTimer);
          closeTimer = setTimeout(function () { aside.classList.remove("flyout-open"); closeTimer = null; }, 120);
        });
      });
    }
    cb.addEventListener("change", function () { localStorage.setItem("corx:sidebar-collapsed", cb.checked ? "1" : "0"); });
  }
  function wireConfirms() {
    document.querySelectorAll("[data-corx-confirm]").forEach(function (btn) {
      var dialog = document.getElementById(btn.getAttribute("data-corx-confirm"));
      if (!dialog) return;
      if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
      btn.addEventListener("click", function () {
        if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
        if (typeof dialog.showModal === "function") { if (!dialog.open) dialog.showModal(); }
        else dialog.setAttribute("open", "");
      });
      // Type-the-name confirmations (revoke, delete): the submit stays off
      // until the typed name matches, and resets when the dialog closes.
      var name = dialog.getAttribute("data-corx-confirm-name");
      var input = dialog.querySelector("[data-corx-confirm-input]");
      var submit = dialog.querySelector("[data-corx-confirm-submit]");
      if (!name || !input || !submit) return;
      var sync = function () { submit.disabled = input.value.trim() !== name; };
      input.addEventListener("input", sync);
      dialog.addEventListener("close", function () { input.value = ""; sync(); });
      sync();
    });
  }
  // One POST per form, from the first paint: mark the form busy and disable
  // its submit while the server answers. Plain script (not an island) so a
  // double click is caught even before hydration.
  function wireBusyForms() {
    document.querySelectorAll("form[data-corx-busy]").forEach(function (form) {
      form.addEventListener("submit", function () {
        form.setAttribute("aria-busy", "true");
        var btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        var saving = form.getAttribute("data-saving");
        if (saving) btn.textContent = saving;
      });
    });
  }
  function init() {
    try { wireSidebar(); } catch (e) { console.error(e); }
    try { wireConfirms(); } catch (e) { console.error(e); }
    try { wireBusyForms(); } catch (e) { console.error(e); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();`,
          }}
        />
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
  /** CSRF token for the shell's logout form (empty = no token available). */
  csrf?: string;
  /** Head scripts (island hydration entry). Set by the renderer. */
  scripts?: Child;
}) {
  return (
    <Doc title={props.title} locale={props.locale} scripts={props.scripts}>
      <div class="drawer lg:drawer-open">
        <input id="console-drawer" type="checkbox" class="drawer-toggle" />
        <div class="drawer-content flex flex-col min-h-svh">
          <Topbar
            title={props.title}
            user={props.user}
            locale={props.locale}
            t={props.t}
            csrf={props.csrf ?? ""}
          />
          <main class="flex-1 w-full max-w-6xl mx-auto p-4 lg:p-6">{props.children}</main>
          <footer class="text-center py-4 text-xs text-base-content/75">CORX</footer>
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

export function LoginShell(props: { title: string; locale: Locale; t: TFunc; children: Child }) {
  return (
    <Doc title={props.title} locale={props.locale}>
      <div class="relative min-h-svh flex items-center justify-center p-4">
        {/* Logged out there is no topbar to carry the switch, so the login
            page gets its own — same ?lang=… links, same cookie. */}
        <div class="absolute right-4 top-4">
          <LangSwitch locale={props.locale} t={props.t} />
        </div>
        <div class="card w-full max-w-md bg-base-100 shadow-xl">
          <div class="card-body">{props.children}</div>
        </div>
      </div>
    </Doc>
  );
}

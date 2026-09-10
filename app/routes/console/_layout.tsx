import type { Child } from "hono/jsx";
import consoleCss from "../../styles/console.css?inline";
import { Sidebar } from "./_sidebar.js";
import { MobileNav } from "./_mobile-nav.js";
import { Topbar } from "./_topbar.js";
import { NAV_ITEMS } from "./_nav.js";

function Doc(props: { title: string; children: Child; scripts?: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{props.title} — corx console</title>
        <style>{consoleCss}</style>
        {props.scripts}
      </head>
      <body>{props.children}</body>
    </html>
  );
}

export function ConsoleLayout(props: {
  title: string;
  user: string;
  active: string;
  children: Child;
  /** Head scripts (island hydration entry). Set by the renderer. */
  scripts?: Child;
}) {
  return (
    <Doc
      title={props.title}
      scripts={props.scripts}
    >
      <div class="dash">
        <Sidebar user={props.user} active={props.active} items={NAV_ITEMS} />
        <div class="main">
          <Topbar title={props.title} />
          <MobileNav active={props.active} items={NAV_ITEMS} />
          <main class="content">{props.children}</main>
          <footer class="footer">corx · HonoX + D1 + R2</footer>
        </div>
      </div>
    </Doc>
  );
}

export function LoginShell(props: { title: string; children: Child }) {
  return (
    <Doc title={props.title}>
      <div class="login-wrap">
        <div class="login-card">{props.children}</div>
      </div>
    </Doc>
  );
}

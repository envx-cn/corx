import { jsxRenderer } from "hono/jsx-renderer";
import { HasIslands } from "honox/server";
import { ConsoleLayout } from "./_layout.js";
import { activeNavItem } from "./_nav.js";
import { consoleLocale, consoleT } from "../../lib/i18n/hono.js";

/**
 * Dash shell for every console page (login renders its own document).
 *
 * The island hydration entry is honox-managed: <HasIslands/> emits the script
 * only on pages that actually import an island, so pages can't forget to
 * opt in (in dev the client entry is loaded unconditionally, as honox
 * recommends for speed).
 */
export default jsxRenderer(({ children, title }, c) => {
  const user = c.get("consoleUser");
  const locale = consoleLocale(c);
  const t = consoleT(c);
  const scripts = import.meta.env.PROD ? (
    <HasIslands>
      <script type="module" src="/static/client.js"></script>
    </HasIslands>
  ) : (
    <script type="module" src="/app/client.ts"></script>
  );
  return (
    <ConsoleLayout
      title={title ?? "Console"}
      user={user?.email ?? ""}
      active={activeNavItem(c.req.path)}
      locale={locale}
      t={t}
      csrf={c.get("csrfToken") ?? ""}
      scripts={scripts}
    >
      {children}
    </ConsoleLayout>
  );
});

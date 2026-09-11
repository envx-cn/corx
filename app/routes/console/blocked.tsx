import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  return c.render(<BlockedContent hosts={await queryBlockedHosts(c.env.DB)} t={t} />, {
    title: t("console.title.blocked"),
  });
});

app.post("/", async (c) => {
  const form = await c.req.parseBody();
  const hostname = String(form["hostname"] ?? "").trim().toLowerCase();
  if (hostname) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO blocked_hosts (hostname, reason) VALUES (?, ?)")
      .bind(hostname, String(form["reason"] ?? ""))
      .run();
  }
  return c.redirect("/console/blocked", 302);
});

app.post("/:hostname/delete", async (c) => {
  await c.env.DB.prepare("DELETE FROM blocked_hosts WHERE hostname = ?")
    .bind((c.req.param("hostname") ?? "").toLowerCase())
    .run();
  return c.redirect("/console/blocked", 302);
});

export default app;

// ---------- Page markup (colocated) ----------
function BlockedContent(props: { hosts: Array<{ hostname: string; reason: string; created_at: string }>; t: TFunc }) {
  const { t } = props;
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-1">{t("console.blocked.title")}</h1>
      <p class="text-sm text-base-content/60 mb-4">{t("console.blocked.sub")}</p>
      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-4">
        <form method="post" action="/console/blocked">
          <div class="flex flex-wrap items-end gap-3">
            <label class="form-control">
              <div class="label pb-1">
                <span class="label-text">{t("console.blocked.hostname")}</span>
              </div>
              <input name="hostname" placeholder={t("console.blocked.hostnamePh")} class="input input-bordered input-sm" />
            </label>
            <label class="form-control">
              <div class="label pb-1">
                <span class="label-text">{t("console.blocked.reason")}</span>
              </div>
              <input name="reason" placeholder={t("console.blocked.reasonPh")} class="input input-bordered input-sm" />
            </label>
            <button class="btn btn-primary">{t("console.blocked.block")}</button>
          </div>
        </form>
      </div>
      <DataTable
        head={
          <>
            <th>{t("console.blocked.headHostname")}</th>
            <th>{t("console.blocked.headReason")}</th>
            <th>{t("console.blocked.headAdded")}</th>
            <th></th>
          </>
        }
        body={
          props.hosts.length === 0 ? (
            <EmptyRow cols={4} text={t("console.blocked.empty")} />
          ) : (
            props.hosts.map((h) => (
              <tr>
                <td>
                  <code>{h.hostname}</code>
                </td>
                <td>{h.reason}</td>
                <td class="text-base-content/50">{h.created_at}</td>
                <td>
                  <form method="post" action={`/console/blocked/${h.hostname}/delete`}>
                    <button class="btn btn-xs btn-error btn-outline">{t("console.blocked.remove")}</button>
                  </form>
                </td>
              </tr>
            ))
          )
        }
      />
    </>
  );
}

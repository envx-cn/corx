import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import { RelTime } from "../../components/time.js";
import { ConfirmButton } from "./_confirm.js";
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
      <p class="text-sm text-base-content/75 mb-4">{t("console.blocked.sub")}</p>
      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-4">
        <form method="post" action="/console/blocked" class="flex flex-wrap items-center gap-3">
          <input
            name="hostname"
            placeholder={t("console.blocked.hostnamePh")}
            aria-label={t("console.blocked.hostname")}
            class="input input-bordered input-sm flex-1 min-w-[12rem]"
          />
          <input
            name="reason"
            placeholder={t("console.blocked.reasonPh")}
            aria-label={t("console.blocked.reason")}
            class="input input-bordered input-sm flex-1 min-w-[10rem]"
          />
          <button class="btn btn-primary btn-sm shrink-0">{t("console.blocked.block")}</button>
        </form>
      </div>
      <DataTable
        head={
          <>
            <th>{t("console.blocked.headHostname")}</th>
            <th>{t("console.blocked.headReason")}</th>
            <th class="hidden sm:table-cell">{t("console.blocked.headAdded")}</th>
            <th></th>
          </>
        }
        body={
          props.hosts.length === 0 ? (
            <EmptyRow cols={4} text={t("console.blocked.empty")} />
          ) : (
            props.hosts.map((h) => (
              <tr>
                <td class="whitespace-nowrap">
                  <code>{h.hostname}</code>
                </td>
                <td>{h.reason}</td>
                <td class="hidden text-base-content/75 sm:table-cell">
                  <RelTime value={h.created_at} t={t} />
                </td>
                <td>
                  <div class="flex items-center justify-end">
                    <ConfirmButton
                      action={`/console/blocked/${h.hostname}/delete`}
                      label={t("console.blocked.remove")}
                      triggerClass="btn btn-xs btn-error btn-outline"
                      confirmClass="btn btn-error"
                      i18n={{
                        title: t("console.blocked.removeTitle"),
                        body: t("console.blocked.removeBody", { host: h.hostname }),
                        confirm: t("console.blocked.remove"),
                        cancel: t("ui.cancel"),
                        close: t("ui.close"),
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))
          )
        }
      />
    </>
  );
}

import { Hono } from "hono";
import type { Env } from "../../lib/types.js";
import { queryBlockedHosts } from "../../lib/admin.js";
import { Panel } from "../../components/panel.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  return c.render(<BlockedContent hosts={await queryBlockedHosts(c.env.DB)} />, { title: "Blocklist" });
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
function BlockedContent(props: { hosts: Array<{ hostname: string; reason: string; created_at: string }> }) {
  return (
    <>
      <h1>Host blocklist</h1>
      <p class="muted">Extra SSRF blocks on top of the built-in private-range protection.</p>
      <div class="toolbar">
        <form method="post" action="/console/blocked">
          <div class="row">
            <label class="f">
              Hostname
              <input name="hostname" placeholder="evil.example" />
            </label>
            <label class="f">
              Reason
              <input name="reason" placeholder="abuse" />
            </label>
            <button class="btn-primary">Block host</button>
          </div>
        </form>
      </div>
      <Panel>
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Reason</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {props.hosts.length === 0 && (
            <tr>
              <td colspan={4} class="muted">
                empty
              </td>
            </tr>
          )}
          {props.hosts.map((h) => (
            <tr>
              <td>
                <code>{h.hostname}</code>
              </td>
              <td>{h.reason}</td>
              <td class="muted">{h.created_at}</td>
              <td>
                <form class="inline" method="post" action={`/console/blocked/${h.hostname}/delete`}>
                  <button class="btn-danger">Remove</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </Panel>
    </>
  );
}

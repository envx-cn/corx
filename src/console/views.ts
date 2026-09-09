import type { KeyRow, LogRow, Stats } from "../admin.js";

/** HTML-escape anything rendered from D1 / user input. */
export function esc(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const CSS = `
:root { color-scheme: light dark; }
body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; line-height: 1.5; }
nav { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; border-bottom: 1px solid #8884; padding-bottom: .75rem; margin-bottom: 1.5rem; }
nav a { text-decoration: none; opacity: .75; }
nav a.active, nav a:hover { opacity: 1; font-weight: 600; }
nav .spacer { flex: 1; }
nav .user { font-size: .85em; opacity: .7; }
table { border-collapse: collapse; width: 100%; font-size: .9em; }
th, td { text-align: left; padding: .45rem .6rem; border-bottom: 1px solid #8883; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .88em; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin: 1rem 0 2rem; }
.card { border: 1px solid #8884; border-radius: 12px; padding: .75rem 1rem; }
.card b { font-size: 1.5em; display: block; }
.card span { font-size: .8em; opacity: .7; }
form.inline { display: inline; }
input, button { font: inherit; padding: .4rem .7rem; border-radius: 8px; border: 1px solid #8886; }
button { cursor: pointer; }
button.danger { color: #dc2626; border-color: #dc262688; }
.keybox { border: 1px dashed #22c55e; border-radius: 12px; padding: 1rem; margin: 1rem 0; word-break: break-all; }
.error { border: 1px solid #dc262688; color: #dc2626; border-radius: 12px; padding: .75rem 1rem; margin: 1rem 0; }
.muted { opacity: .65; font-size: .9em; }
.row { display: flex; gap: .5rem; flex-wrap: wrap; align-items: end; margin: 1rem 0; }
label { display: grid; gap: .25rem; font-size: .85em; }
.ok { color: #16a34a; } .bad { color: #dc2626; }
`;

export function layout(opts: { title: string; user: string; active: string; body: string }): string {
  const nav = (href: string, label: string) =>
    `<a href="${href}" class="${opts.active === href ? "active" : ""}">${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)} — corx console</title><style>${CSS}</style></head>
<body>
<nav>
  <b>corx</b>
  ${nav("/console/", "Dashboard")}${nav("/console/keys", "API keys")}${nav("/console/logs", "Logs")}${nav("/console/blocked", "Blocklist")}
  <span class="spacer"></span>
  <span class="user">${esc(opts.user)}</span>
  <form class="inline" method="post" action="/console/logout"><button>Sign out</button></form>
</nav>
${opts.body}
</body>
</html>`;
}

export function loginPage(opts: { accessDetected: boolean; accessEmail: string | null; error?: string }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in — corx console</title><style>${CSS}</style></head>
<body style="max-width:520px">
<h1>corx console</h1>
${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}
${
  opts.accessDetected
    ? `<h2>Sign in with Cloudflare</h2>
       <p class="muted">Detected Access identity: <b>${esc(opts.accessEmail ?? "unknown")}</b></p>
       <form method="post" action="/console/login">
         <input type="hidden" name="mode" value="access" />
         <button>Continue as ${esc(opts.accessEmail ?? "user")}</button>
       </form>`
    : `<h2>Sign in with Cloudflare</h2>
       <p class="muted">No Cloudflare Access session detected on this request. In production, put an
       Access application in front of the admin host — then this button signs you in.</p>`
}
<h2>Dev token</h2>
<p class="muted">Local development without Access: paste <code>ADMIN_TOKEN</code>.</p>
<form method="post" action="/console/login">
  <input type="hidden" name="mode" value="token" />
  <div class="row"><label>Admin token<input type="password" name="token" autocomplete="off" /></label>
  <button>Sign in</button></div>
</form>
</body>
</html>`;
}

export function dashboardPage(user: string, stats: Stats, keyCount: number, blockedCount: number): string {
  const t = stats.totals;
  const hitRate = t && t.requests ? `${Math.round(((t.cached ?? 0) / t.requests) * 100)}%` : "—";
  const body = `<h1>Dashboard <span class="muted">· last 24h</span></h1>
<div class="cards">
  <div class="card"><b>${t?.requests ?? 0}</b><span>requests</span></div>
  <div class="card"><b>${hitRate}</b><span>cache hits</span></div>
  <div class="card"><b>${t?.avg_latency_ms ? Math.round(t.avg_latency_ms) + " ms" : "—"}</b><span>avg latency</span></div>
  <div class="card"><b>${keyCount}</b><span>API keys</span></div>
  <div class="card"><b>${blockedCount}</b><span>blocked hosts</span></div>
</div>
<h2>By status</h2>
<table><tr><th>Status</th><th>Count</th></tr>
${stats.byStatus.map((r) => `<tr><td><code>${r.status ?? "—"}</code></td><td>${r.n}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">no data</td></tr>`}
</table>
<h2>Top hosts</h2>
<table><tr><th>Host</th><th>Count</th></tr>
${stats.topHosts.map((r) => `<tr><td><code>${esc(r.target_host)}</code></td><td>${r.n}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">no data</td></tr>`}
</table>`;
  return layout({ title: "Dashboard", user, active: "/console/", body });
}

export function keysPage(
  user: string,
  keys: KeyRow[],
  newKey: { id: string; key: string; name: string } | null,
): string {
  const body = `<h1>API keys</h1>
${newKey ? `<div class="keybox"><b>New key created — copy it now, it won't be shown again.</b><br /><code>${esc(newKey.key)}</code><br /><span class="muted">id: ${esc(newKey.id)} · name: ${esc(newKey.name)}</span></div>` : ""}
<form method="post" action="/console/keys">
  <div class="row">
    <label>Name<input name="name" placeholder="my-app" /></label>
    <label>Rate / min<input name="rateLimitPerMin" placeholder="120 (blank = default)" inputmode="numeric" /></label>
    <button>Create key</button>
  </div>
</form>
<table><tr><th>Name</th><th>Rate/min</th><th>Created</th><th>Status</th><th></th></tr>
${keys.map((k) => `<tr><td>${esc(k.name) || "<span class='muted'>—</span>"}</td><td>${k.rate_limit_per_min ?? "default"}</td><td class="muted">${esc(k.created_at)}</td>
<td>${k.revoked_at ? '<span class="bad">revoked</span>' : '<span class="ok">active</span>'}</td>
<td>${k.revoked_at ? "" : `<form class="inline" method="post" action="/console/keys/${esc(k.id)}/revoke" onsubmit="return confirm('Revoke this key?')"><button class="danger">Revoke</button></form>`}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">no keys yet</td></tr>`}
</table>`;
  return layout({ title: "API keys", user, active: "/console/keys", body });
}

export function logsPage(user: string, logs: LogRow[], limit: number): string {
  const body = `<h1>Request logs</h1>
<form method="get" action="/console/logs"><div class="row">
<label>Limit<input name="limit" value="${limit}" inputmode="numeric" /></label><button>Refresh</button>
</div></form>
<table><tr><th>Time</th><th>Method</th><th>Host</th><th>Status</th><th>Latency</th><th>CC</th><th>Cache</th><th>Error</th></tr>
${logs.map((l) => `<tr><td class="muted">${esc(l.created_at)}</td><td><code>${esc(l.method)}</code></td><td><code>${esc(l.target_host)}</code></td>
<td>${l.status ?? "—"}</td><td>${l.latency_ms ?? "—"}${l.latency_ms == null ? "" : " ms"}</td><td>${esc(l.country)}</td>
<td>${l.cached ? "HIT" : "MISS"}</td><td class="bad">${esc(l.error)}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">no logs</td></tr>`}
</table>`;
  return layout({ title: "Logs", user, active: "/console/logs", body });
}

export function blockedPage(user: string, hosts: Array<{ hostname: string; reason: string; created_at: string }>): string {
  const body = `<h1>Host blocklist</h1>
<p class="muted">Extra SSRF blocks on top of the built-in private-range protection.</p>
<form method="post" action="/console/blocked">
  <div class="row">
    <label>Hostname<input name="hostname" placeholder="evil.example" /></label>
    <label>Reason<input name="reason" placeholder="abuse" /></label>
    <button>Block host</button>
  </div>
</form>
<table><tr><th>Hostname</th><th>Reason</th><th>Added</th><th></th></tr>
${hosts.map((h) => `<tr><td><code>${esc(h.hostname)}</code></td><td>${esc(h.reason)}</td><td class="muted">${esc(h.created_at)}</td>
<td><form class="inline" method="post" action="/console/blocked/${esc(h.hostname)}/delete"><button class="danger">Remove</button></form></td></tr>`).join("") || `<tr><td colspan="4" class="muted">empty</td></tr>`}
</table>`;
  return layout({ title: "Blocklist", user, active: "/console/blocked", body });
}

import type { KeyRow, LogRow, Stats } from "../admin.js";

/** HTML-escape anything rendered from D1 / user input. */
export function esc(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** Human-readable bytes (1024-based). Null/NaN → "—". */
export function humanBytes(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} ${units[u]}`;
}

const CSS = `
:root {
  --bg: #f4f5f7; --surface: #ffffff; --surface-2: #f8fafc;
  --border: #e4e7ec; --text: #101828; --muted: #667085;
  --accent: #4f46e5; --accent-soft: #eef2ff; --accent-text: #4338ca;
  --ok: #067647; --ok-bg: #ecfdf3; --err: #b42318; --err-bg: #fef3f2;
  --warn: #b54708; --warn-bg: #fffaeb; --info: #175cd3; --info-bg: #eff8ff;
  --shadow: 0 1px 2px rgb(16 24 40 / .06), 0 1px 3px rgb(16 24 40 / .1);
  --radius: 14px;
  color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0a0c10; --surface: #12151c; --surface-2: #181d27;
    --border: #232b3a; --text: #e8ebf1; --muted: #98a2b3;
    --accent: #818cf8; --accent-soft: #1e2350; --accent-text: #c7d2fe;
    --ok: #6ce9a6; --ok-bg: #053321; --err: #fda29b; --err-bg: #3b0d0c;
    --warn: #fec84b; --warn-bg: #3a2a06; --info: #84caff; --info-bg: #0b2a4f;
    --shadow: 0 1px 2px rgb(0 0 0 / .4);
  }
}
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; background: var(--bg); color: var(--text); max-width: 1080px; margin: 0 auto; padding: 0 1.25rem 4rem; line-height: 1.5; font-size: 15px; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .86em; }
h1 { font-size: 1.5rem; letter-spacing: -.02em; margin: 1.5rem 0 1rem; }
h2 { font-size: 1.05rem; letter-spacing: -.01em; margin: 2rem 0 .75rem; }
/* top nav */
.topbar { position: sticky; top: 0; z-index: 10; margin: 0 -1.25rem; padding: .7rem 1.25rem; background: color-mix(in srgb, var(--bg) 82%, transparent); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
.topbar-inner { max-width: 1080px; margin: 0 auto; display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: .5rem; font-weight: 700; margin-right: .75rem; }
.brand-mark { width: 26px; height: 26px; border-radius: 8px; background: linear-gradient(135deg, #4f46e5, #06b6d4); display: inline-flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 800; }
.tab { text-decoration: none; color: var(--muted); padding: .4rem .8rem; border-radius: 999px; font-size: .9em; }
.tab:hover { color: var(--text); background: var(--accent-soft); }
.tab.active { color: var(--accent-text); background: var(--accent-soft); font-weight: 600; }
.spacer { flex: 1; }
.user-chip { font-size: .82em; color: var(--muted); background: var(--surface); border: 1px solid var(--border); padding: .35rem .7rem; border-radius: 999px; }
/* cards */
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: .75rem; margin: 1rem 0; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .9rem 1rem; box-shadow: var(--shadow); }
.card b { font-size: 1.45em; display: block; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
.card span { font-size: .78em; color: var(--muted); }
/* panels + tables */
.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); overflow: hidden; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: .88em; }
thead th { text-align: left; font-size: .75em; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; padding: .6rem .8rem; background: var(--surface-2); border-bottom: 1px solid var(--border); white-space: nowrap; }
tbody td { padding: .55rem .8rem; border-bottom: 1px solid var(--border); vertical-align: middle; }
tbody tr:last-child td { border-bottom: none; }
tbody tr:hover td { background: var(--surface-2); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
/* badges */
.badge { display: inline-block; padding: .12rem .55rem; border-radius: 999px; font-size: .78em; font-weight: 600; white-space: nowrap; }
.badge.ok { color: var(--ok); background: var(--ok-bg); }
.badge.err { color: var(--err); background: var(--err-bg); }
.badge.warn { color: var(--warn); background: var(--warn-bg); }
.badge.info { color: var(--info); background: var(--info-bg); }
.badge.muted { color: var(--muted); background: var(--surface-2); border: 1px solid var(--border); }
/* forms + buttons */
input, select { font: inherit; font-size: .88em; padding: .42rem .65rem; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
input:focus { outline: 2px solid var(--accent); outline-offset: 0; border-color: var(--accent); }
button { font: inherit; font-size: .88em; font-weight: 500; padding: .42rem .85rem; border-radius: 9px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
button:hover { border-color: var(--accent); }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
button.danger { color: var(--err); }
button.danger:hover { border-color: var(--err); background: var(--err-bg); }
form.inline { display: inline-flex; gap: .35rem; align-items: center; }
.toolbar { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: .9rem 1rem; margin: 1rem 0; }
.row { display: flex; gap: .6rem; flex-wrap: wrap; align-items: end; }
label.f { display: grid; gap: .25rem; font-size: .8em; color: var(--muted); }
label.f input { min-width: 0; }
.keybox { border: 1px dashed var(--ok); background: var(--ok-bg); border-radius: var(--radius); padding: 1rem 1.1rem; margin: 1rem 0; word-break: break-all; }
.error { border: 1px solid var(--err); color: var(--err); background: var(--err-bg); border-radius: var(--radius); padding: .75rem 1rem; margin: 1rem 0; }
.muted { color: var(--muted); font-size: .9em; }
/* chart */
.chart { display: flex; align-items: end; gap: 3px; height: 130px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 1rem 1rem .4rem; }
.bar { flex: 1; min-width: 4px; min-height: 3px; background: linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 45%, transparent)); border-radius: 4px 4px 0 0; opacity: .9; }
.bar:hover { opacity: 1; }
.chart-ticks { display: flex; gap: 3px; padding: .25rem 1rem 0; }
.chart-ticks span { flex: 1; text-align: center; font-size: .7em; color: var(--muted); font-variant-numeric: tabular-nums; }
/* auth */
.auth-card { max-width: 460px; margin: 9vh auto 0; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow); padding: 2rem; }
.auth-card h1 { margin-top: 0; }
.divider { display: flex; align-items: center; gap: .75rem; color: var(--muted); font-size: .8em; margin: 1.5rem 0 1rem; }
.divider::before, .divider::after { content: ""; flex: 1; border-top: 1px solid var(--border); }
.footer { margin-top: 3rem; text-align: center; color: var(--muted); font-size: .8em; }
`;

const COPY_SCRIPT = `<script>
function copyKey(id, btn){var el=document.getElementById(id);if(!el)return;var t=el.innerText;
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){if(btn){btn.textContent="Copied";setTimeout(function(){btn.textContent="Copy";},1500);}});}
else{var r=document.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r);try{document.execCommand("copy");}catch(e){}}}</script>`;

function statusBadge(status: number | null): string {
  if (status == null) return `<span class="badge muted">—</span>`;
  const cls = status < 300 ? "ok" : status < 400 ? "info" : status < 500 ? "warn" : "err";
  return `<span class="badge ${cls}">${status}</span>`;
}

function methodBadge(method: string): string {
  const m = method.toUpperCase();
  const cls = m === "GET" ? "info" : m === "POST" ? "ok" : m === "DELETE" ? "err" : m === "HEAD" || m === "OPTIONS" ? "muted" : "warn";
  return `<span class="badge ${cls}">${esc(m)}</span>`;
}

export function layout(opts: { title: string; user: string; active: string; body: string }): string {
  const tab = (href: string, label: string) =>
    `<a class="tab${opts.active === href ? " active" : ""}" href="${href}">${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(opts.title)} — corx console</title><style>${CSS}</style></head>
<body>
<header class="topbar"><div class="topbar-inner">
  <span class="brand"><span class="brand-mark">cx</span>corx</span>
  ${tab("/console/", "Dashboard")}${tab("/console/keys", "API keys")}${tab("/console/logs", "Logs")}${tab("/console/blocked", "Blocklist")}
  <span class="spacer"></span>
  <span class="user-chip">${esc(opts.user)}</span>
  <form class="inline" method="post" action="/console/logout"><button>Sign out</button></form>
</div></header>
<main>${opts.body}</main>
<footer class="footer">corx · Hono + D1 + R2</footer>
${COPY_SCRIPT}
</body>
</html>`;
}

export function loginPage(opts: { accessDetected: boolean; accessEmail: string | null; error?: string }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Sign in — corx console</title><style>${CSS}</style></head>
<body>
<div class="auth-card">
  <h1><span class="brand"><span class="brand-mark">cx</span>corx console</span></h1>
  ${opts.error ? `<div class="error">${esc(opts.error)}</div>` : ""}
  ${
    opts.accessDetected
      ? `<p class="muted">Detected Access identity: <b>${esc(opts.accessEmail ?? "unknown")}</b></p>
         <form method="post" action="/console/login">
           <input type="hidden" name="mode" value="access" />
           <button class="primary" style="width:100%">Continue with Cloudflare</button>
         </form>`
      : `<p class="muted">No Cloudflare Access session detected on this request. In production, put an
         Access application in front of the admin host — then this button signs you in.</p>
         <button class="primary" style="width:100%" disabled title="Available behind Cloudflare Access">Continue with Cloudflare</button>`
  }
  <div class="divider">or</div>
  <p class="muted">Local development without Access: paste <code>ADMIN_TOKEN</code>.</p>
  <form method="post" action="/console/login">
    <input type="hidden" name="mode" value="token" />
    <div class="row"><label class="f" style="flex:1">Admin token<input type="password" name="token" autocomplete="off" /></label>
    <button>Sign in</button></div>
  </form>
</div>
</body>
</html>`;
}

export function dashboardPage(user: string, stats: Stats, keyCount: number, blockedCount: number): string {
  const t = stats.totals;
  const req = t?.requests ?? 0;
  const hitRate = req ? `${Math.round(((t?.cached ?? 0) / req) * 100)}%` : "—";
  const errRate = req ? `${Math.round(((t?.errors ?? 0) / req) * 1000) / 10}%` : "—";
  const traffic = t?.res_bytes ?? 0;
  const saved = t?.cached_bytes ?? 0;
  const maxReq = Math.max(1, ...stats.hourly.map((h) => h.requests));
  const bars = stats.hourly
    .map((h) => {
      const pct = Math.round((h.requests / maxReq) * 100);
      const label = `${h.hour.slice(5).replace("T", " ")}:00 — ${h.requests} req, ${humanBytes(h.bytes)}`;
      return `<div class="bar" style="height:${Math.max(3, pct)}%" title="${esc(label)}"></div>`;
    })
    .join("");
  const ticks = stats.hourly
    .map((h, i) => `<span>${i % 6 === 0 || i === 23 ? esc(h.hour.slice(11)) + ":00" : ""}</span>`)
    .join("");
  const card = (v: string, l: string) => `<div class="card"><b>${v}</b><span>${l}</span></div>`;
  const body = `<h1>Dashboard <span class="muted">· last 24h</span></h1>
<div class="cards">
  ${card(String(req), "requests")}
  ${card(esc(humanBytes(traffic)), "traffic out")}
  ${card(esc(humanBytes(saved)), `served from cache (${hitRate} hits)`)}
  ${card(esc(humanBytes(t?.req_bytes ?? 0)), "traffic in")}
  ${card(t?.avg_latency_ms ? Math.round(t.avg_latency_ms) + " ms" : "—", `avg latency (max ${t?.max_latency_ms ?? "—"} ms)`)}
  ${card(errRate, `error rate (${t?.errors ?? 0})`)}
  ${card(String(keyCount), "API keys")}
  ${card(String(blockedCount), "blocked hosts")}
</div>
<h2>Requests per hour</h2>
<div class="chart">${bars}</div><div class="chart-ticks">${ticks}</div>
<h2>Top hosts</h2>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Host</th><th class="num">Requests</th><th class="num">Traffic</th></tr></thead><tbody>
${stats.topHosts.map((r) => `<tr><td><code>${esc(r.target_host)}</code></td><td class="num">${r.n}</td><td class="num">${humanBytes(r.bytes)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">no data</td></tr>`}
</tbody></table></div></div>
<h2>Top API keys by traffic</h2>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Key</th><th class="num">Requests</th><th class="num">Traffic</th></tr></thead><tbody>
${stats.topKeys.map((r) => `<tr><td>${esc(r.name) || `<span class="badge muted">anonymous</span>`}</td><td class="num">${r.n}</td><td class="num">${humanBytes(r.bytes)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">no data</td></tr>`}
</tbody></table></div></div>
<h2>By status</h2>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Status</th><th class="num">Count</th></tr></thead><tbody>
${stats.byStatus.map((r) => `<tr><td>${statusBadge(r.status)}</td><td class="num">${r.n}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">no data</td></tr>`}
</tbody></table></div></div>
<h2>By method</h2>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Method</th><th class="num">Count</th></tr></thead><tbody>
${stats.byMethod.map((r) => `<tr><td>${methodBadge(r.method)}</td><td class="num">${r.n}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">no data</td></tr>`}
</tbody></table></div></div>
<h2>By country</h2>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Country</th><th class="num">Count</th></tr></thead><tbody>
${stats.byCountry.map((r) => `<tr><td>${esc(r.country) || `<span class="badge muted">—</span>`}</td><td class="num">${r.n}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">no data</td></tr>`}
</tbody></table></div></div>
<h2>Recent errors</h2>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Time</th><th>Method</th><th>Host</th><th>Status</th><th>Error</th></tr></thead><tbody>
${stats.recentErrors.map((l) => `<tr><td class="muted">${esc(l.created_at)}</td><td>${methodBadge(l.method)}</td><td><code>${esc(l.target_host)}</code></td><td>${statusBadge(l.status)}</td><td class="bad">${esc(l.error)}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">none 🎉</td></tr>`}
</tbody></table></div></div>`;
  return layout({ title: "Dashboard", user, active: "/console/", body });
}

export function keysPage(
  user: string,
  keys: KeyRow[],
  newKey: { id: string; key: string; name: string } | null,
  error?: string | null,
): string {
  const cacheCell = (k: KeyRow): string => {
    if (k.revoked_at) {
      return `<code class="muted">${k.no_cache ? "no-cache" : k.cache_ttl != null ? `TTL ${k.cache_ttl}s` : "global"}</code>`;
    }
    return `<form class="inline" method="post" action="/console/keys/${esc(k.id)}/cache"><input name="cacheTtl" value="${k.cache_ttl ?? ""}" placeholder="global" inputmode="numeric" size="6" title="TTL seconds (blank = global, 0 = never store)" /> <label class="muted" title="Skip the R2 cache entirely for this key">no-cache <input type="checkbox" name="noCache" value="on" ${k.no_cache ? "checked" : ""} /></label> <button>Save</button></form>`;
  };
  const body = `<h1>API keys</h1>
${error ? `<div class="error">${esc(error)}</div>` : ""}
${newKey ? `<div class="keybox"><b>New key created — copy it now, it won't be shown again.</b><br /><code id="newkey">${esc(newKey.key)}</code> <button id="newkey-btn" onclick="copyKey('newkey',this)">Copy</button><br /><span class="muted">id: ${esc(newKey.id)} · name: ${esc(newKey.name)}</span></div>` : ""}
<div class="toolbar"><form method="post" action="/console/keys">
  <div class="row">
    <label class="f">Name<input name="name" placeholder="my-app" /></label>
    <label class="f">Rate / min<input name="rateLimitPerMin" placeholder="120 (blank = default)" inputmode="numeric" /></label>
    <label class="f">Allowed origins<input name="allowedOrigins" placeholder="* or https://app.example (blank = global)" size="36" /></label>
    <label class="f">Cache TTL (s)<input name="cacheTtl" placeholder="blank = global" inputmode="numeric" size="10" /></label>
    <label class="f">No-cache<input type="checkbox" name="noCache" value="on" /></label>
    <button class="primary">Create key</button>
  </div>
</form></div>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Name</th><th>Rate/min</th><th>Allowed origins</th><th>Cache</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>
${keys.map((k) => `<tr><td>${esc(k.name) || `<span class="badge muted">—</span>`}</td><td class="num">${k.rate_limit_per_min ?? "default"}</td>
<td>${k.revoked_at ? `<code class="muted">${esc(k.allowed_origins) || "global"}</code>` : `<form class="inline" method="post" action="/console/keys/${esc(k.id)}/origins"><input name="allowedOrigins" value="${esc(k.allowed_origins ?? "")}" placeholder="blank = global" size="24" /> <button>Save</button></form>`}</td>
<td>${cacheCell(k)}</td>
<td class="muted">${esc(k.created_at)}</td>
<td>${k.revoked_at ? '<span class="badge err">revoked</span>' : '<span class="badge ok">active</span>'}</td>
<td>${k.revoked_at ? "" : `<form class="inline" method="post" action="/console/keys/${esc(k.id)}/revoke" onsubmit="return confirm('Revoke this key?')"><button class="danger">Revoke</button></form>`}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">no keys yet</td></tr>`}
</tbody></table></div></div>
<p class="muted">Per-key origins override the global <code>ALLOWED_ORIGINS</code> for requests using that key.
Browsers don't send API keys on <code>OPTIONS</code> preflights — pass the key via <code>?key=</code> if preflights must be per-key.</p>`;
  return layout({ title: "API keys", user, active: "/console/keys", body });
}

export function logsPage(user: string, logs: LogRow[], limit: number): string {
  const body = `<h1>Request logs</h1>
<div class="toolbar"><form method="get" action="/console/logs"><div class="row">
<label class="f">Limit<input name="limit" value="${limit}" inputmode="numeric" /></label><button>Refresh</button>
</div></form></div>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Time</th><th>Method</th><th>Host</th><th>Status</th><th>Latency</th><th>CC</th><th>Cache</th><th class="num">Size</th><th>Error</th></tr></thead><tbody>
${logs.map((l) => `<tr><td class="muted">${esc(l.created_at)}</td><td>${methodBadge(l.method)}</td><td><code>${esc(l.target_host)}</code></td>
<td>${statusBadge(l.status)}</td><td class="num">${l.latency_ms ?? "—"}${l.latency_ms == null ? "" : " ms"}</td><td>${esc(l.country)}</td>
<td>${l.cached ? `<span class="badge ok">HIT</span>` : `<span class="badge muted">MISS</span>`}</td><td class="num">${humanBytes(l.res_bytes)}</td><td class="bad">${esc(l.error)}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">no logs</td></tr>`}
</tbody></table></div></div>`;
  return layout({ title: "Logs", user, active: "/console/logs", body });
}

export function blockedPage(user: string, hosts: Array<{ hostname: string; reason: string; created_at: string }>): string {
  const body = `<h1>Host blocklist</h1>
<p class="muted">Extra SSRF blocks on top of the built-in private-range protection.</p>
<div class="toolbar"><form method="post" action="/console/blocked">
  <div class="row">
    <label class="f">Hostname<input name="hostname" placeholder="evil.example" /></label>
    <label class="f">Reason<input name="reason" placeholder="abuse" /></label>
    <button class="primary">Block host</button>
  </div>
</form></div>
<div class="panel"><div class="table-wrap"><table>
<thead><tr><th>Hostname</th><th>Reason</th><th>Added</th><th></th></tr></thead><tbody>
${hosts.map((h) => `<tr><td><code>${esc(h.hostname)}</code></td><td>${esc(h.reason)}</td><td class="muted">${esc(h.created_at)}</td>
<td><form class="inline" method="post" action="/console/blocked/${esc(h.hostname)}/delete"><button class="danger">Remove</button></form></td></tr>`).join("") || `<tr><td colspan="4" class="muted">empty</td></tr>`}
</tbody></table></div></div>`;
  return layout({ title: "Blocklist", user, active: "/console/blocked", body });
}

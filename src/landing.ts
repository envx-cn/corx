export function landingPage(host: string): string {
  const base = `https://${host}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>corx — CORS proxy</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; max-width: 720px; margin: 3rem auto; padding: 0 1.25rem; line-height: 1.6; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .9em; }
  pre { padding: 1rem; border-radius: 12px; background: #8882; overflow-x: auto; }
  h1 { letter-spacing: -.02em; }
  .pill { display: inline-block; padding: .15rem .6rem; border-radius: 999px; background: #22c55e22; font-size: .8em; }
</style>
</head>
<body>
  <h1>corx <span class="pill">live</span></h1>
  <p>A CORS proxy on Cloudflare — <code>Hono + D1 + R2</code>. Prefix any URL and fetch it cross-origin.</p>
  <pre>fetch("${base}/fetch?url=" + encodeURIComponent("https://api.example.com/data"))
  .then(r =&gt; r.json())</pre>
  <h2>Usage</h2>
  <ul>
    <li><code>GET ${base}/fetch?url=https://…</code> — works everywhere, recommended</li>
    <li><code>GET ${base}/proxy/https://…</code></li>
    <li><code>GET ${base}/https://…</code></li>
    <li><code>GET https://example-com.${host}/…</code> — subdomain mode* (this page's host as zone)</li>
  </ul>
  <p><small>* Subdomain mode: dots become dashes (<code>example.org</code> → <code>example-org</code>,
  <code>my-site.co.uk</code> → <code>my--site-co-uk</code>), and a bare <code>example</code> means
  <code>example.com</code>. Needs a wildcard domain (<code>*.corx.com</code>) — on workers.dev use
  <code>/fetch?url=</code>. <code>?corx-scheme=http</code> / <code>?corx-port=8080</code> override scheme/port.</small></p>
  <h2>Options</h2>
  <ul>
    <li><code>?ttl=300</code> — R2 cache TTL in seconds (GET only)</li>
    <li><code>?no-cache=1</code> — bypass cache</li>
    <li><code>X-Api-Key</code> / <code>Authorization: Bearer</code> / <code>?key=</code> — API key (if required)</li>
  </ul>
  <h2>Endpoints</h2>
  <ul>
    <li><code>GET /health</code> — health check</li>
    <li><code>OPTIONS *</code> — CORS preflight answered everywhere</li>
    <li><code>/admin/*</code> — keys, stats, logs (bearer token)</li>
  </ul>
  <p><a href="https://github.com/">corx</a> · responses carry <code>X-Corx-Cache: HIT/MISS</code></p>
</body>
</html>`;
}

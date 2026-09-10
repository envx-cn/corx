import type { Child } from "hono/jsx";
import appCss from "../styles/app.css?inline";

export function LandingPage(props: { host: string }) {
  const base = `https://${props.host}`;
  return (
    <html lang="en" data-theme="light">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>corx — CORS proxy</title>
        {/* Inject compiled CSS raw — hono/jsx would HTML-escape selectors with > / & (see AGENTS.md). */}
        <style dangerouslySetInnerHTML={{ __html: appCss }}></style>
      </head>
      <body class="bg-base-200 min-h-svh flex flex-col">
        <div class="navbar bg-base-100 border-b border-base-300 sticky top-0 z-30">
          <div class="flex-1 gap-2 px-2">
            <span class="size-7 rounded-lg bg-gradient-to-br from-accent to-warning text-white inline-flex items-center justify-center text-xs font-extrabold">
              cx
            </span>
            <b class="text-base">corx</b>
            <span class="badge badge-success badge-sm">live</span>
          </div>
          <div class="flex-none px-2">
            <a class="btn btn-sm btn-outline" href="/console/">
              Console
            </a>
          </div>
        </div>

        <main class="flex-1 w-full max-w-3xl mx-auto p-4 lg:p-8">
          <div class="hero">
            <div class="hero-content text-center flex-col py-6 min-w-0 max-w-full">
              <div class="max-w-xl">
                <h1 class="text-3xl font-bold">corx</h1>
                <p class="py-4 text-base-content/70">
                  A CORS proxy on Cloudflare — <code>HonoX + D1 + R2</code>. Prefix any URL and fetch it cross-origin.
                </p>
              </div>
              <div class="mockup-code text-left w-full max-w-xl min-w-0">
                <pre data-prefix="$">
                  <code>{`fetch("${base}/fetch?url=" + encodeURIComponent("https://api.example.com/data"))`}</code>
                </pre>
                <pre data-prefix=" ">
                  <code>{"  .then(r => r.json())"}</code>
                </pre>
              </div>
            </div>
          </div>

          <h2 class="text-xl font-semibold mt-6 mb-3">Usage</h2>
          <div class="grid sm:grid-cols-2 gap-3 mb-2">
            <Card title="Query" tag="recommended">
              <code class="break-all">GET {base}/fetch?url=https://…</code>
            </Card>
            <Card title="Path style">
              <code class="break-all">GET {base}/proxy/https://…</code>
            </Card>
            <Card title="Path style (short)">
              <code class="break-all">GET {base}/https://…</code>
            </Card>
            <Card title="Subdomain mode" tag="needs wildcard domain">
              <code class="break-all">GET https://example-com.{props.host}/…</code>
            </Card>
          </div>
          <p class="text-sm text-base-content/60 mb-6">
            Subdomain mode: dots become dashes (<code>example.org</code> → <code>example-org</code>,{" "}
            <code>my-site.co.uk</code> → <code>my--site-co-uk</code>), and a bare <code>example</code> means{" "}
            <code>example.com</code>. <code>?corx-scheme=http</code> / <code>?corx-port=8080</code> override
            scheme/port.
          </p>

          <h2 class="text-xl font-semibold mt-6 mb-3">Options</h2>
          <ul class="space-y-2 mb-2 text-sm">
            <li class="flex gap-2 items-start">
              <span class="badge badge-ghost badge-sm mt-0.5 shrink-0">?ttl=300</span>
              R2 cache TTL in seconds (GET only, capped at the global default)
            </li>
            <li class="flex gap-2 items-start">
              <span class="badge badge-ghost badge-sm mt-0.5 shrink-0">?no-cache=1</span>
              Bypass cache
            </li>
            <li class="flex gap-2 items-start">
              <span class="badge badge-ghost badge-sm mt-0.5 shrink-0">X-Api-Key</span>
              API key (if required) — also <code>Authorization: Bearer</code> or <code>?key=</code>
            </li>
          </ul>
          <p class="text-sm text-base-content/60 mb-6">
            Reserved query params <code>ttl</code>, <code>no-cache</code>, <code>key</code>, <code>corx-scheme</code>,{" "}
            <code>corx-port</code> are consumed by the proxy and stripped from every target URL. Requests with{" "}
            <code>Authorization</code>/<code>Cookie</code> headers skip the cache.
          </p>

          <h2 class="text-xl font-semibold mt-6 mb-3">Endpoints</h2>
          <ul class="space-y-2 mb-4 text-sm">
            <li class="flex gap-2 items-start">
              <span class="badge badge-ghost badge-sm mt-0.5 shrink-0">GET /health</span>
              Health check
            </li>
            <li class="flex gap-2 items-start">
              <span class="badge badge-ghost badge-sm mt-0.5 shrink-0">OPTIONS *</span>
              CORS preflight answered everywhere
            </li>
            <li class="flex gap-2 items-start">
              <span class="badge badge-ghost badge-sm mt-0.5 shrink-0">/console/</span>
              Admin console (Cloudflare Access login)
            </li>
          </ul>
          <p class="text-sm text-base-content/60">
            Responses carry <code>X-Corx-Cache: HIT/MISS</code>.
          </p>
        </main>

        <footer class="footer footer-center border-t border-base-300 bg-base-100 p-4 text-xs text-base-content/50">
          corx · HonoX + D1 + R2
        </footer>
      </body>
    </html>
  );
}

function Card(props: { title: string; tag?: string; children: Child }) {
  return (
    <div class="card bg-base-100 border border-base-300">
      <div class="card-body p-4">
        <div class="card-title text-sm justify-between">
          {props.title}
          {props.tag && <span class="badge badge-outline badge-sm font-normal">{props.tag}</span>}
        </div>
        {props.children}
      </div>
    </div>
  );
}

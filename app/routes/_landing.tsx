import landingCss from "../styles/landing.css?inline";

export function LandingPage(props: { host: string }) {
  const base = `https://${props.host}`;
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>corx — CORS proxy</title>
        <style>{landingCss}</style>
      </head>
      <body>
        <h1>
          corx <span class="pill">live</span>
        </h1>
        <p>
          A CORS proxy on Cloudflare — <code>HonoX + D1 + R2</code>. Prefix any URL and fetch it cross-origin.
        </p>
        <pre>{`fetch("${base}/fetch?url=" + encodeURIComponent("https://api.example.com/data"))\n  .then(r => r.json())`}</pre>
        <h2>Usage</h2>
        <ul>
          <li>
            <code>GET {base}/fetch?url=https://…</code> — works everywhere, recommended
          </li>
          <li>
            <code>GET {base}/proxy/https://…</code>
          </li>
          <li>
            <code>GET {base}/https://…</code>
          </li>
          <li>
            <code>GET https://example-com.{props.host}/…</code> — subdomain mode* (needs wildcard domain)
          </li>
        </ul>
        <p>
          <small>
            * Subdomain mode: dots become dashes (<code>example.org</code> → <code>example-org</code>,{" "}
            <code>my-site.co.uk</code> → <code>my--site-co-uk</code>), and a bare <code>example</code> means{" "}
            <code>example.com</code>. <code>?corx-scheme=http</code> / <code>?corx-port=8080</code> override
            scheme/port.
          </small>
        </p>
        <h2>Options</h2>
        <ul>
          <li>
            <code>?ttl=300</code> — R2 cache TTL in seconds (GET only, capped at the global default)
          </li>
          <li>
            <code>?no-cache=1</code> — bypass cache
          </li>
          <li>
            <code>X-Api-Key</code> / <code>Authorization: Bearer</code> / <code>?key=</code> — API key (if required)
          </li>
        </ul>
        <p>
          <small>
            Reserved query params <code>ttl</code>, <code>no-cache</code>, <code>key</code>,{" "}
            <code>corx-scheme</code>, <code>corx-port</code> are consumed by the proxy and stripped
            from every target URL. Requests with <code>Authorization</code>/<code>Cookie</code> headers
            skip the cache.
          </small>
        </p>
        <h2>Endpoints</h2>
        <ul>
          <li>
            <code>GET /health</code> — health check
          </li>
          <li>
            <code>OPTIONS *</code> — CORS preflight answered everywhere
          </li>
          <li>
            <code>/console/</code> — admin console (Cloudflare Access login)
          </li>
        </ul>
        <p>
          Responses carry <code>X-Corx-Cache: HIT/MISS</code>
        </p>
      </body>
    </html>
  );
}

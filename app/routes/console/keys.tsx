import { Hono } from "hono";
import { Panel } from "../../components/panel.js";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys, updateApiKey } from "../../lib/admin.js";
import type { KeyRow } from "../../lib/admin.js";
import CopyButton from "../../islands/copy-button.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} />, { title: "API keys" });
});

app.post("/", async (c) => {
  const form = await c.req.parseBody();
  const rateRaw = String(form["rateLimitPerMin"] ?? "").trim();
  const rate = rateRaw === "" ? null : Number(rateRaw);
  const name = String(form["name"] ?? "");
  const renderError = async (error: string) =>
    c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} />, { title: "API keys" });
  try {
    const { id, key } = await createApiKey(
      c.env.DB,
      name,
      Number.isFinite(rate) ? rate : null,
      String(form["allowedOrigins"] ?? ""),
      String(form["cacheTtl"] ?? ""),
      String(form["noCache"] ?? "") === "on",
    );
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={{ id, key, name }} />, {
      title: "API keys",
    });
  } catch (err) {
    return renderError(err instanceof ProxyError ? err.message : "Failed to create key");
  }
});

app.post("/:id/origins", async (c) => {
  const form = await c.req.parseBody();
  try {
    await updateApiKey(c.env.DB, c.req.param("id") ?? "", { allowedOrigins: String(form["allowedOrigins"] ?? "") });
    return c.redirect("/console/keys", 302);
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : "Failed to save origins";
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} />, {
      title: "API keys",
    });
  }
});

app.post("/:id/cache", async (c) => {
  const form = await c.req.parseBody();
  try {
    await updateApiKey(c.env.DB, c.req.param("id") ?? "", {
      cacheTtl: String(form["cacheTtl"] ?? ""),
      noCache: String(form["noCache"] ?? "") === "on",
    });
    return c.redirect("/console/keys", 302);
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : "Failed to save cache policy";
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} />, {
      title: "API keys",
    });
  }
});

app.post("/:id/revoke", async (c) => {
  await c.env.DB.prepare("UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(c.req.param("id") ?? "")
    .run();
  return c.redirect("/console/keys", 302);
});

export default app;

// ---------- Page markup (colocated) ----------
function CacheCell({ k }: { k: KeyRow }) {
  if (k.revoked_at) {
    return <code class="muted">{k.no_cache ? "no-cache" : k.cache_ttl != null ? `TTL ${k.cache_ttl}s` : "global"}</code>;
  }
  return (
    <form class="inline" method="post" action={`/console/keys/${k.id}/cache`}>
      <input
        name="cacheTtl"
        value={k.cache_ttl ?? ""}
        placeholder="global"
        inputmode="numeric"
        size={6}
        title="TTL seconds (blank = global, 0 = never store)"
      />{" "}
      <label class="muted" title="Skip the R2 cache entirely for this key">
        no-cache <input type="checkbox" name="noCache" value="on" checked={k.no_cache ? true : undefined} />
      </label>{" "}
      <button>Save</button>
    </form>
  );
}

function KeysContent(props: {
  keys: KeyRow[];
  newKey: { id: string; key: string; name: string } | null;
  error?: string | null;
}) {
  return (
    <>
      <h1>API keys</h1>
      {props.error && <div class="error">{props.error}</div>}
      {props.newKey && (
        <div class="keybox">
          <b>New key created — copy it now, it won't be shown again.</b>
          <br />
          <code>{props.newKey.key}</code> <CopyButton text={props.newKey.key} />
          <br />
          <span class="muted">
            id: {props.newKey.id} · name: {props.newKey.name}
          </span>
        </div>
      )}
      <div class="toolbar">
        <form method="post" action="/console/keys">
          <div class="row">
            <label class="f">
              Name
              <input name="name" placeholder="my-app" />
            </label>
            <label class="f">
              Rate / min
              <input name="rateLimitPerMin" placeholder="120 (blank = default)" inputmode="numeric" />
            </label>
            <label class="f">
              Allowed origins
              <input name="allowedOrigins" placeholder="* or https://app.example (blank = global)" size={36} />
            </label>
            <label class="f">
              Cache TTL (s)
              <input name="cacheTtl" placeholder="blank = global" inputmode="numeric" size={10} />
            </label>
            <label class="f">
              No-cache
              <input type="checkbox" name="noCache" value="on" />
            </label>
            <button class="btn-primary">Create key</button>
          </div>
        </form>
      </div>
      <Panel>
        <thead>
          <tr>
            <th>Name</th>
            <th>Rate/min</th>
            <th>Allowed origins</th>
            <th>Cache</th>
            <th>Created</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {props.keys.length === 0 && (
            <tr>
              <td colspan={7} class="muted">
                no keys yet
              </td>
            </tr>
          )}
          {props.keys.map((k) => (
            <tr>
              <td>{k.name || <span class="badge muted">—</span>}</td>
              <td class="num">{k.rate_limit_per_min ?? "default"}</td>
              <td>
                {k.revoked_at ? (
                  <code class="muted">{k.allowed_origins || "global"}</code>
                ) : (
                  <form class="inline" method="post" action={`/console/keys/${k.id}/origins`}>
                    <input name="allowedOrigins" value={k.allowed_origins ?? ""} placeholder="blank = global" size={24} />{" "}
                    <button>Save</button>
                  </form>
                )}
              </td>
              <td>
                <CacheCell k={k} />
              </td>
              <td class="muted">{k.created_at}</td>
              <td>{k.revoked_at ? <span class="badge err">revoked</span> : <span class="badge ok">active</span>}</td>
              <td>
                {!k.revoked_at && (
                  <form class="inline" method="post" action={`/console/keys/${k.id}/revoke`}>
                    <button class="btn-danger">Revoke</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </Panel>
      <p class="muted">
        Per-key origins override the global <code>ALLOWED_ORIGINS</code> for requests using that key. Browsers don't
        send API keys on <code>OPTIONS</code> preflights — pass the key via <code>?key=</code> if preflights must be
        per-key.
      </p>
    </>
  );
}

import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys, updateApiKey } from "../../lib/admin.js";
import type { KeyRow } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
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

function Field(props: { label: string; children: Child }) {
  return (
    <label class="form-control">
      <div class="label pb-1">
        <span class="label-text">{props.label}</span>
      </div>
      {props.children}
    </label>
  );
}

function CacheCell({ k }: { k: KeyRow }) {
  if (k.revoked_at) {
    return <code class="text-base-content/50">{k.no_cache ? "no-cache" : k.cache_ttl != null ? `TTL ${k.cache_ttl}s` : "global"}</code>;
  }
  return (
    <form class="inline-flex items-end gap-2" method="post" action={`/console/keys/${k.id}/cache`}>
      <input
        name="cacheTtl"
        value={k.cache_ttl ?? ""}
        placeholder="global"
        inputmode="numeric"
        size={6}
        class="input input-bordered input-sm w-20"
        title="TTL seconds (blank = global, 0 = never store)"
      />
      <label class="flex items-center gap-1.5 text-xs text-base-content/60" title="Skip the R2 cache entirely for this key">
        no-cache <input type="checkbox" name="noCache" value="on" class="checkbox checkbox-xs" checked={k.no_cache ? true : undefined} />
      </label>
      <button class="btn btn-xs">Save</button>
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
      <h1 class="text-2xl font-semibold mb-4">API keys</h1>

      {props.error && (
        <div role="alert" class="alert alert-error mb-4">
          <span>{props.error}</span>
        </div>
      )}

      {props.newKey && (
        <div role="status" class="alert alert-success mb-4">
          <div class="min-w-0">
            <b>New key created — copy it now, it won't be shown again.</b>
            <div class="flex items-center gap-2 mt-1">
              <code class="break-all">{props.newKey.key}</code>
              <CopyButton text={props.newKey.key} />
            </div>
            <div class="text-xs opacity-70 mt-1">
              id: {props.newKey.id} · name: {props.newKey.name}
            </div>
          </div>
        </div>
      )}

      <div class="bg-base-100 border border-base-300 rounded-box p-4 mb-4">
        <form method="post" action="/console/keys">
          <div class="flex flex-wrap items-end gap-3">
            <Field label="Name">
              <input name="name" placeholder="my-app" class="input input-bordered input-sm" />
            </Field>
            <Field label="Rate / min">
              <input name="rateLimitPerMin" placeholder="120 (blank = default)" inputmode="numeric" class="input input-bordered input-sm w-36" />
            </Field>
            <Field label="Allowed origins">
              <input name="allowedOrigins" placeholder="* or https://app.example (blank = global)" size={36} class="input input-bordered input-sm" />
            </Field>
            <Field label="Cache TTL (s)">
              <input name="cacheTtl" placeholder="blank = global" inputmode="numeric" size={10} class="input input-bordered input-sm w-28" />
            </Field>
            <Field label="No-cache">
              <input type="checkbox" name="noCache" value="on" class="checkbox checkbox-sm" />
            </Field>
            <button class="btn btn-primary">Create key</button>
          </div>
        </form>
      </div>

      <DataTable
        head={
          <>
            <th>Name</th>
            <th>Rate/min</th>
            <th>Allowed origins</th>
            <th>Cache</th>
            <th>Created</th>
            <th>Status</th>
            <th></th>
          </>
        }
        body={
          props.keys.length === 0 ? (
            <EmptyRow cols={7} text="no keys yet" />
          ) : (
            props.keys.map((k) => (
              <tr>
                <td>{k.name || <span class="badge badge-ghost">—</span>}</td>
                <td class="tabular-nums">{k.rate_limit_per_min ?? "default"}</td>
                <td>
                  {k.revoked_at ? (
                    <code class="text-base-content/50">{k.allowed_origins || "global"}</code>
                  ) : (
                    <form class="inline-flex items-end gap-2" method="post" action={`/console/keys/${k.id}/origins`}>
                      <input
                        name="allowedOrigins"
                        value={k.allowed_origins ?? ""}
                        placeholder="blank = global"
                        size={24}
                        class="input input-bordered input-xs w-44"
                      />
                      <button class="btn btn-xs">Save</button>
                    </form>
                  )}
                </td>
                <td>
                  <CacheCell k={k} />
                </td>
                <td class="text-base-content/50">{k.created_at}</td>
                <td>
                  {k.revoked_at ? <span class="badge badge-error">revoked</span> : <span class="badge badge-success">active</span>}
                </td>
                <td>
                  {!k.revoked_at && (
                    <form method="post" action={`/console/keys/${k.id}/revoke`}>
                      <button class="btn btn-xs btn-error btn-outline">Revoke</button>
                    </form>
                  )}
                </td>
              </tr>
            ))
          )
        }
      />

      <p class="text-xs text-base-content/50">
        Per-key origins override the global <code>ALLOWED_ORIGINS</code> for requests using that key. Browsers don't
        send API keys on <code>OPTIONS</code> preflights — pass the key via <code>?key=</code> if preflights must be
        per-key.
      </p>
    </>
  );
}

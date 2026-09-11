import { Hono } from "hono";
import type { Child } from "hono/jsx";
import type { Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import { createApiKey, queryKeys, updateApiKey } from "../../lib/admin.js";
import type { KeyRow } from "../../lib/admin.js";
import { DataTable, EmptyRow } from "../../components/table.js";
import CopyButton from "../../islands/copy-button.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} t={t} />, {
    title: t("console.title.keys"),
  });
});

app.post("/", async (c) => {
  const t = consoleT(c);
  const form = await c.req.parseBody();
  const rateRaw = String(form["rateLimitPerMin"] ?? "").trim();
  const rate = rateRaw === "" ? null : Number(rateRaw);
  const name = String(form["name"] ?? "");
  const renderError = async (error: string) =>
    c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} t={t} />, {
      title: t("console.title.keys"),
    });
  try {
    const { id, key } = await createApiKey(
      c.env.DB,
      name,
      Number.isFinite(rate) ? rate : null,
      String(form["allowedOrigins"] ?? ""),
      String(form["cacheTtl"] ?? ""),
      String(form["noCache"] ?? "") === "on",
    );
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={{ id, key, name }} t={t} />, {
      title: t("console.title.keys"),
    });
  } catch (err) {
    return renderError(err instanceof ProxyError ? err.message : t("console.keys.createFailed"));
  }
});

app.post("/:id/origins", async (c) => {
  const t = consoleT(c);
  const form = await c.req.parseBody();
  try {
    await updateApiKey(c.env.DB, c.req.param("id") ?? "", { allowedOrigins: String(form["allowedOrigins"] ?? "") });
    return c.redirect("/console/keys", 302);
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.saveOriginsFailed");
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} t={t} />, {
      title: t("console.title.keys"),
    });
  }
});

app.post("/:id/cache", async (c) => {
  const t = consoleT(c);
  const form = await c.req.parseBody();
  try {
    await updateApiKey(c.env.DB, c.req.param("id") ?? "", {
      cacheTtl: String(form["cacheTtl"] ?? ""),
      noCache: String(form["noCache"] ?? "") === "on",
    });
    return c.redirect("/console/keys", 302);
  } catch (err) {
    const error = err instanceof ProxyError ? err.message : t("console.keys.saveCacheFailed");
    return c.render(<KeysContent keys={await queryKeys(c.env.DB)} newKey={null} error={error} t={t} />, {
      title: t("console.title.keys"),
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

function CacheCell({ k, t }: { k: KeyRow; t: TFunc }) {
  if (k.revoked_at) {
    return (
      <code class="text-base-content/50">
        {k.no_cache ? t("console.keys.noCacheValue") : k.cache_ttl != null ? t("console.keys.ttlValue", { ttl: k.cache_ttl }) : t("console.keys.global")}
      </code>
    );
  }
  return (
    <form class="inline-flex items-end gap-2" method="post" action={`/console/keys/${k.id}/cache`}>
      <input
        name="cacheTtl"
        value={k.cache_ttl ?? ""}
        placeholder={t("console.keys.ttlPh")}
        inputmode="numeric"
        size={6}
        class="input input-bordered input-sm w-20"
        title={t("console.keys.cacheTtlTitle")}
      />
      <label class="flex items-center gap-1.5 text-xs text-base-content/60" title={t("console.keys.noCacheTitle")}>
        {t("console.keys.noCacheValue")}{" "}
        <input type="checkbox" name="noCache" value="on" class="checkbox checkbox-xs" checked={k.no_cache ? true : undefined} />
      </label>
      <button class="btn btn-xs">{t("console.keys.save")}</button>
    </form>
  );
}

function KeysContent(props: {
  keys: KeyRow[];
  newKey: { id: string; key: string; name: string } | null;
  error?: string | null;
  t: TFunc;
}) {
  const { t } = props;
  return (
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-4">{t("console.title.keys")}</h1>

      {props.error && (
        <div role="alert" class="alert alert-error mb-4">
          <span>{props.error}</span>
        </div>
      )}

      {props.newKey && (
        <div role="status" class="alert alert-success mb-4">
          <div class="min-w-0">
            <b>{t("console.keys.newKey")}</b>
            <div class="flex items-center gap-2 mt-1">
              <code class="break-all">{props.newKey.key}</code>
              <CopyButton text={props.newKey.key} labels={{ copy: t("copy.copy"), copied: t("copy.copied") }} />
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
            <Field label={t("console.keys.name")}>
              <input name="name" placeholder={t("console.keys.namePh")} class="input input-bordered input-sm" />
            </Field>
            <Field label={t("console.keys.ratePerMin")}>
              <input name="rateLimitPerMin" placeholder={t("console.keys.ratePh")} inputmode="numeric" class="input input-bordered input-sm w-36" />
            </Field>
            <Field label={t("console.keys.allowedOrigins")}>
              <input name="allowedOrigins" placeholder={t("console.keys.originsPh")} size={36} class="input input-bordered input-sm" />
            </Field>
            <Field label={t("console.keys.cacheTtl")}>
              <input name="cacheTtl" placeholder={t("console.keys.ttlPh")} inputmode="numeric" size={10} class="input input-bordered input-sm w-28" />
            </Field>
            <Field label={t("console.keys.noCache")}>
              <input type="checkbox" name="noCache" value="on" class="checkbox checkbox-sm" />
            </Field>
            <button class="btn btn-primary">{t("console.keys.create")}</button>
          </div>
        </form>
      </div>

      <DataTable
        head={
          <>
            <th>{t("console.keys.headName")}</th>
            <th>{t("console.keys.headRate")}</th>
            <th>{t("console.keys.headOrigins")}</th>
            <th>{t("console.keys.headCache")}</th>
            <th>{t("console.keys.headCreated")}</th>
            <th>{t("console.keys.headStatus")}</th>
            <th></th>
          </>
        }
        body={
          props.keys.length === 0 ? (
            <EmptyRow cols={7} text={t("console.keys.empty")} />
          ) : (
            props.keys.map((k) => (
              <tr>
                <td>{k.name || <span class="text-base-content/40">—</span>}</td>
                <td class="tabular-nums">{k.rate_limit_per_min ?? t("console.keys.default")}</td>
                <td>
                  {k.revoked_at ? (
                    <code class="text-base-content/50">{k.allowed_origins || t("console.keys.global")}</code>
                  ) : (
                    <form class="inline-flex items-end gap-2" method="post" action={`/console/keys/${k.id}/origins`}>
                      <input
                        name="allowedOrigins"
                        value={k.allowed_origins ?? ""}
                        placeholder={t("console.keys.originsPhShort")}
                        size={24}
                        class="input input-bordered input-xs w-44"
                      />
                      <button class="btn btn-xs">{t("console.keys.save")}</button>
                    </form>
                  )}
                </td>
                <td>
                  <CacheCell k={k} t={t} />
                </td>
                <td class="text-base-content/50">{k.created_at}</td>
                <td>
                  {k.revoked_at ? (
                    <span class="font-medium text-error">{t("console.keys.statusRevoked")}</span>
                  ) : (
                    <span class="font-medium text-success">{t("console.keys.statusActive")}</span>
                  )}
                </td>
                <td>
                  {!k.revoked_at && (
                    <form method="post" action={`/console/keys/${k.id}/revoke`}>
                      <button class="btn btn-xs btn-error btn-outline">{t("console.keys.revoke")}</button>
                    </form>
                  )}
                </td>
              </tr>
            ))
          )
        }
      />

      {/* Intentionally injected as trusted HTML: the code pills are part of the copy. */}
      <p
        class="text-xs text-base-content/50"
        dangerouslySetInnerHTML={{
          __html: t("console.keys.hint", {
            code: "<code>ALLOWED_ORIGINS</code>",
            opt: "<code>OPTIONS</code>",
            query: "<code>?key=</code>",
          }),
        }}
      />
    </>
  );
}

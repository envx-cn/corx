import { Hono } from "hono";
import type { Env } from "../../../lib/types.js";
import { queryKeys } from "../../../lib/admin.js";
import Playground, { type PlaygroundI18n, type PlaygroundKeyOption } from "../../../islands/playground.js";
import { consoleT } from "../../../lib/i18n/hono.js";
import type { TFunc } from "../../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

app.get("/", async (c) => {
  const t = consoleT(c);
  // Only live keys are selectable — a revoked key can't authorize anything.
  const keys: PlaygroundKeyOption[] = (await queryKeys(c.env.DB))
    .filter((k) => !k.revoked_at)
    .map((k) => ({ id: k.id, name: k.name }));
  return c.render(
    <>
      <h1 class="text-3xl font-semibold tracking-tight mb-1">{t("console.title.playground")}</h1>
      <p class="text-sm text-base-content/75 mb-4">{t("console.playground.sub")}</p>
      <Playground keys={keys} i18n={playgroundI18n(t)} />
    </>,
    { title: t("console.title.playground") },
  );
});

export default app;

/** Bind the playground dictionary once (island props must be plain strings). */
function playgroundI18n(t: TFunc): PlaygroundI18n {
  return {
    request: t("console.playground.request"),
    response: t("console.playground.response"),
    run: t("console.playground.run"),
    running: t("console.playground.running"),
    url: t("console.playground.url"),
    urlPh: t("console.playground.urlPh"),
    method: t("console.playground.method"),
    route: t("console.playground.route"),
    routeFetch: t("console.playground.routeFetch"),
    routeProxy: t("console.playground.routeProxy"),
    routeRaw: t("console.playground.routeRaw"),
    routeSubdomain: t("console.playground.routeSubdomain"),
    auth: t("console.playground.auth"),
    key: t("console.playground.key"),
    keyNone: t("console.playground.keyNone"),
    keyRaw: t("console.playground.keyRaw"),
    keyRawPh: t("console.playground.keyRawPh"),
    origin: t("console.playground.origin"),
    originPh: t("console.playground.originPh"),
    clientIp: t("console.playground.clientIp"),
    clientIpPh: t("console.playground.clientIpPh"),
    headers: t("console.playground.headers"),
    headerName: t("console.playground.headerName"),
    headerValue: t("console.playground.headerValue"),
    addHeader: t("console.playground.addHeader"),
    removeHeader: t("console.playground.removeHeader"),
    body: t("console.playground.body"),
    bodyPh: t("console.playground.bodyPh"),
    bodyHint: t("console.playground.bodyHint"),
    cache: t("console.playground.cache"),
    ttl: t("console.playground.ttl"),
    ttlPh: t("console.playground.ttlPh"),
    noCache: t("console.playground.noCache"),
    presetsHint: t("console.playground.presetsHint"),
    empty: t("console.playground.empty"),
    tabBody: t("console.playground.tabBody"),
    tabHeaders: t("console.playground.tabHeaders"),
    tabRequest: t("console.playground.tabRequest"),
    pretty: t("console.playground.pretty"),
    truncated: t("console.playground.truncated"),
    binary: t("console.playground.binary"),
    copyBody: t("console.playground.copyBody"),
    copyCurl: t("console.playground.copyCurl"),
    copied: t("console.playground.copied"),
    rerun: t("console.playground.rerun"),
    failed: t("console.playground.failed"),
    injection: t("console.playground.injection"),
    injectionHint: t("console.playground.injectionHint"),
    ignored: t("console.playground.ignored"),
    history: t("console.playground.history"),
    historyEmpty: t("console.playground.historyEmpty"),
    clear: t("console.playground.clear"),
    historyHint: t("console.playground.historyHint"),
    presetCache: t("console.playground.presetCache"),
    presetSsrf: t("console.playground.presetSsrf"),
    presetMetadata: t("console.playground.presetMetadata"),
    presetPreflight: t("console.playground.presetPreflight"),
    presetRange: t("console.playground.presetRange"),
    presetEcho: t("console.playground.presetEcho"),
  };
}

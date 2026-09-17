/**
 * The `/docs` page's code-coupled half.
 *
 * The human-readable usage page (`app/routes/_docs.tsx`) explains the proxy in
 * prose, but the two parts that can drift from the code — the four call shapes
 * and the `corx-*` parameter table — are data here, rendered by the page and
 * asserted by `test/docs.test.ts`. The parameter names are not typed twice:
 * the test compares this table with `CONTROL_PARAMS`, the namespace
 * `app/lib/control.ts` actually owns and enforces.
 *
 * Prose lives in `app/lib/i18n/messages.ts` (`docs.*`, en + zh), keyed by the
 * unions below, so a row without copy fails `tsc` instead of rendering blank.
 */
import type { MessageKey } from "./i18n/messages.js";

/** The four equivalent calling conventions, in the order the page documents. */
export type DocsShapeId = "query" | "path" | "bare" | "subdomain";

export const DOCS_SHAPES: readonly DocsShapeId[] = ["query", "path", "bare", "subdomain"];

/** The sample target: a plausible API, never one deployment's own hostname. */
export const DOCS_SAMPLE_TARGET = "https://api.example.com/data";

/**
 * The copyable one-liner for one call shape, built against this deployment's
 * origin — a self-hosted copy advertises itself, never the upstream project.
 * Subdomain mode is the exception: its zone belongs to the deployment
 * (`PROXY_ZONE` or auto-detect), so the sample leaves it as `<zone>`.
 */
export function docsShapeExample(origin: string, id: DocsShapeId): string {
  switch (id) {
    case "query":
      return `fetch("${origin}/fetch?url=" + encodeURIComponent("${DOCS_SAMPLE_TARGET}"))`;
    case "path":
      return `fetch("${origin}/proxy/${DOCS_SAMPLE_TARGET}")`;
    case "bare":
      return `fetch("${origin}/${DOCS_SAMPLE_TARGET}")`;
    case "subdomain":
      return `fetch("https://api-example-com.<zone>/data")`;
  }
}

/** One row of the `corx-*` table, in `CONTROL_PARAMS` order. */
export interface DocsParam {
  /** Wire name, exactly as `app/lib/control.ts` owns it. */
  name: string;
  /** A copyable sample value, appended to a call as `&<example>`. */
  example: string;
  /** Prose key: `docs.param.<id>`. */
  desc: MessageKey;
}

export const DOCS_PARAMS: readonly DocsParam[] = [
  { name: "corx-ttl", example: "corx-ttl=300", desc: "docs.param.ttl" },
  { name: "corx-no-cache", example: "corx-no-cache=1", desc: "docs.param.noCache" },
  { name: "corx-key", example: "corx-key=corx_…", desc: "docs.param.key" },
  { name: "corx-callback", example: "corx-callback=handleData", desc: "docs.param.callback" },
  { name: "corx-charset", example: "corx-charset=utf-8", desc: "docs.param.charset" },
  { name: "corx-wrap", example: "corx-wrap=json", desc: "docs.param.wrap" },
  { name: "corx-scheme", example: "corx-scheme=http", desc: "docs.param.scheme" },
  { name: "corx-port", example: "corx-port=8443", desc: "docs.param.port" },
];

/** The three credential forms, in preference order — all equivalent. */
export const DOCS_KEY_FORMS: readonly string[] = [
  "X-Api-Key: corx_…",
  "Authorization: Bearer corx_…",
  "?corx-key=corx_…",
];

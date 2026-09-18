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

/**
 * The multi-upstream injection example `/docs` renders and `test/docs.test.ts`
 * feeds to the real parser. Keeping it here rather than in the prose means the
 * documented shape is one the parser accepts — including the case the section
 * exists for: the same header name on two hosts, each with its own credential.
 */
export const DOCS_INJECTION_VARS: readonly string[] = [
  "OPENAI_KEY=sk-…",
  "ANTHROPIC_KEY=sk-ant-…",
  "VENDOR_KEY=vendor-…",
];

/** The allowed-hosts list that makes the rules below valid — mandatory once anything is injected. */
export const DOCS_INJECTION_HOSTS = "api.openai.com, api.anthropic.com, api.vendor.com";

export const DOCS_INJECTION_RULES: readonly string[] = [
  "@api.openai.com",
  "Authorization: Bearer ${OPENAI_KEY}",
  "@api.anthropic.com",
  "x-api-key: ${ANTHROPIC_KEY}",
  "@api.vendor.com",
  "Authorization: Bearer ${VENDOR_KEY}",
];

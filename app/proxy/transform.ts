/**
 * Body transforms: `?corx-charset=<label>` and `?corx-wrap=json`.
 *
 * Both are response-side conveniences AllOrigins ships and CORX did not (#51):
 *
 *  - `corx-charset` re-decodes a text response the upstream mislabelled (a
 *    Chinese/Japanese page served as latin-1 is the classic case) and re-emits
 *    it as UTF-8 with a corrected `content-type`.
 *  - `corx-wrap=json` wraps the decoded text as `{"contents":"…"}` so
 *    `r.json()` works for HTML too.
 *
 * The model is JSONP (`./jsonp.ts`): a body-rewriting control param that is
 * validated up front, can only run on a buffered body (transforming a stream
 * would mean unbounded memory), and must be part of the cache key — the same
 * URL yields different bytes per transform, so two callers must never share an
 * entry. Both were read with `readControl`, so they are consumed only on the
 * proxy request's own query; a `?url=` target keeps its own `charset`/`wrap`.
 */
import { readControl } from "../lib/control.js";
import { ProxyError } from "../lib/types.js";

/** Longest charset label accepted (`TextDecoder` labels are short ASCII). */
const MAX_CHARSET_LABEL = 64;

export interface TextTransform {
  /** Label `TextDecoder` should use instead of the upstream's declaration. */
  charset: string | null;
  /** Wrap the decoded text as `{"contents":"…"}` (application/json). */
  wrap: boolean;
}

/**
 * Read and validate the transform params. Validation happens before any
 * upstream request so a bad label or value is a 400, not a wasted fetch (the
 * same rule as JSONP's callback name).
 */
export function readTextTransforms(reqUrl: URL): TextTransform {
  const rawCharset = readControl(reqUrl, "charset");
  let charset: string | null = null;
  if (rawCharset !== null) {
    const label = rawCharset.trim().toLowerCase();
    if (!label || label.length > MAX_CHARSET_LABEL) {
      throw new ProxyError(400, `Invalid corx-charset label: ${JSON.stringify(rawCharset).slice(0, 80)}`);
    }
    try {
      // The runtime's decoder knows the WHATWG encoding set; an unknown label
      // would otherwise throw mid-response, after the body was consumed.
      new TextDecoder(label);
    } catch {
      throw new ProxyError(400, `Unknown corx-charset label: ${label}`);
    }
    charset = label;
  }

  const rawWrap = readControl(reqUrl, "wrap");
  let wrap = false;
  if (rawWrap !== null) {
    if (rawWrap.trim().toLowerCase() !== "json") {
      throw new ProxyError(400, `Unknown corx-wrap value: ${JSON.stringify(rawWrap).slice(0, 80)} (only "json")`);
    }
    wrap = true;
  }

  return { charset, wrap };
}

/** True when either transform was requested. */
export function isTransforming(t: TextTransform): boolean {
  return t.charset !== null || t.wrap;
}

/**
 * Cache-key fragment for the transforms. "" when none are active, so the
 * historical key shape (and every entry already in R2) stays valid.
 */
export function transformFingerprint(t: TextTransform): string {
  if (!isTransforming(t)) return "";
  return `text:charset=${t.charset ?? "auto"};wrap=${t.wrap ? "json" : "raw"}`;
}

/**
 * Content types both transforms accept: text, JSON and XML. Anything else is a
 * 400 — re-encoding a JPEG or wrapping a zip as a JSON string is not a
 * convenience, it is corruption.
 */
export function isTextualContentType(contentType: string | null): boolean {
  const ct = (contentType ?? "").toLowerCase();
  return ct.startsWith("text/") || ct.includes("json") || ct.includes("xml");
}

/** `charset=` parameter of a Content-Type header, when present. */
function declaredCharset(contentType: string | null): string | null {
  const m = /;\s*charset\s*=\s*"?([^";]+)"?/i.exec(contentType ?? "");
  return m?.[1]?.trim().toLowerCase() || null;
}

/** Content type with the charset forced to utf-8 (other params dropped). */
function asUtf8(type: string | null): string {
  const base = (type ?? "text/plain").split(";")[0]?.trim() || "text/plain";
  return `${base}; charset=utf-8`;
}

/**
 * Apply the requested transforms to a buffered body, in order: decode (explicit
 * label if given, else the upstream's declaration, else UTF-8) → re-encode as
 * UTF-8 → wrap. `headers` is mutated to match what is actually being sent.
 *
 * Throws a 502 when the *upstream* declared a charset this runtime cannot
 * decode: wrapping or relabelling mojibake would be worse than failing.
 */
export function applyTextTransforms(
  body: Uint8Array<ArrayBuffer>,
  headers: Headers,
  t: TextTransform,
): Uint8Array<ArrayBuffer> {
  if (!isTransforming(t)) return body;
  const upstreamType = headers.get("content-type");
  const label = t.charset ?? declaredCharset(upstreamType) ?? "utf-8";

  let text: string;
  try {
    text = new TextDecoder(label).decode(body);
  } catch {
    throw new ProxyError(502, `Upstream declared an unsupported charset: ${label}`);
  }

  let out: Uint8Array<ArrayBuffer> = body;
  if (t.charset) {
    out = new TextEncoder().encode(text);
    // The bytes and the label must agree: the upstream's label was the bug.
    headers.set("content-type", asUtf8(upstreamType));
  }
  if (t.wrap) {
    out = new TextEncoder().encode(JSON.stringify({ contents: text }));
    headers.set("content-type", "application/json; charset=utf-8");
  }
  // The length changed (and the buffered path strips it anyway) — never let a
  // stale one ride along.
  headers.delete("content-length");
  return out;
}

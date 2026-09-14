/**
 * Response-preview classification — pure helpers shared by the landing demo
 * island and the console playground.
 *
 * No Hono, no bindings, no DOM-at-module-scope: `previewKind` decides how a
 * proxied body is rendered, `readTextPrefix` pulls a bounded slice of a text
 * body, and `frameBlock` reads the upstream's anti-framing headers. Keeping it
 * here (instead of inside an island) is what makes all three unit-testable.
 */

/** How a proxied response body is rendered. */
export type PreviewKind = "json" | "text" | "html" | "image" | "video" | "audio" | "pdf" | "binary";

/** Bytes of a text body we pull for a preview before cancelling the stream. */
export const MAX_PREVIEW_TEXT_BYTES = 128 * 1024;

/** Declared-size ceiling for inline image rendering (above it: metadata card). */
export const MAX_PREVIEW_IMAGE_BYTES = 5 * 1024 * 1024;

/** Content types that carry a JSON document (`application/ld+json`, …). */
function isJsonType(type: string): boolean {
  return type === "application/json" || type.endsWith("+json");
}

/** Content types worth showing as plain monospace text (XML, JS, CSV, …). */
function isPlainTextType(type: string): boolean {
  return (
    type.startsWith("text/") ||
    type === "application/xml" ||
    type === "application/javascript" ||
    type === "application/x-javascript" ||
    type === "application/x-ndjson" ||
    type === "application/x-www-form-urlencoded" ||
    type.endsWith("+xml")
  );
}

/** MIME type with parameters stripped and lowercased, for display. */
export function baseType(contentType: string): string {
  return (contentType || "").split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * Classify a `content-type` into a renderer. Unknown/empty types are `binary`,
 * which never gets read as text — a missing content-type must not turn a
 * JPEG into mojibake.
 */
export function previewKind(contentType: string): PreviewKind {
  const type = baseType(contentType);
  if (!type) return "binary";
  if (isJsonType(type)) return "json";
  if (type === "text/html" || type === "application/xhtml+xml") return "html";
  if (type.startsWith("image/")) return "image"; // includes image/svg+xml (rendered via <img>, scripts inert)
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (isPlainTextType(type)) return "text";
  return "binary";
}

/** Kinds whose body we read (bounded) as UTF-8 text. */
export function isTextKind(kind: PreviewKind): boolean {
  return kind === "json" || kind === "text" || kind === "html";
}

/** Kinds a real element can render straight from the proxy URL. */
export function isMediaKind(kind: PreviewKind): boolean {
  return kind === "image" || kind === "video" || kind === "audio" || kind === "pdf";
}

/** Pretty-print only when the text is JSON; otherwise null. */
export function prettyJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

export interface TextPrefix {
  text: string;
  truncated: boolean;
  /** Bytes read (before decoding) — the real body may be larger. */
  bytes: number;
}

/**
 * Read at most `maxBytes` of a text body, then cancel the stream. A 10 MB HTML
 * page must never be buffered just to show a snippet; the proxy sees the
 * client disconnect and logs what it actually delivered.
 */
export async function readTextPrefix(res: Response, maxBytes = MAX_PREVIEW_TEXT_BYTES): Promise<TextPrefix> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return { text, truncated: false, bytes: text.length };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const room = maxBytes - received;
      if (value.byteLength >= room) {
        chunks.push(value.subarray(0, room));
        received += room;
        truncated = true;
        break;
      }
      chunks.push(value);
      received += value.byteLength;
    }
  } finally {
    // Truncated read: stop the transfer instead of draining megabytes.
    if (truncated) await reader.cancel().catch(() => undefined);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // A split multi-byte sequence at the cut point becomes U+FFFD — acceptable
  // for a snippet.
  return { text: new TextDecoder().decode(bytes), truncated, bytes: received };
}

export type FrameBlock = "" | "x-frame-options" | "frame-ancestors";

/** `frame-ancestors` sources that can match our own (re-serving) origin. */
const FRAME_SOURCE_OK = new Set(["*", "'self'", "http:", "https:"]);

/**
 * Will the browser refuse to render this document in an <iframe>?
 *
 * We re-serve upstream HTML from our own origin, so the target's anti-framing
 * headers are evaluated against OUR origin: `X-Frame-Options: SAMEORIGIN` and
 * `frame-ancestors 'self'` pass by accident (the ancestor *is* the same origin
 * as far as the browser can tell), while `DENY` and a foreign
 * `frame-ancestors` list still block. This only detects the unambiguous
 * "blank box" cases so the demo can show an explanation instead of nothing;
 * everything else is left to the browser (`Content-Security-Policy-Report-Only`
 * never blocks, so it is ignored on purpose).
 */
export function frameBlock(entries: Iterable<readonly [string, string]>): FrameBlock {
  let xfo = "";
  let csp = "";
  for (const [name, value] of entries) {
    const key = name.toLowerCase();
    if (key === "x-frame-options") xfo = xfo ? `${xfo}, ${value}` : value;
    else if (key === "content-security-policy") csp = csp ? `${csp}, ${value}` : value;
  }

  if (/(^|,)\s*deny\s*($|,)/i.test(xfo)) return "x-frame-options";

  for (const policy of csp.split(",")) {
    // frame-ancestors sources never contain ";" or ",", so a naive split is safe.
    for (const match of policy.matchAll(/(?:^|;)\s*frame-ancestors\s*([^;]*)/gi)) {
      const sources = (match[1] ?? "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      if (sources.length === 0) continue;
      if (!sources.some((source) => FRAME_SOURCE_OK.has(source))) return "frame-ancestors";
    }
  }
  return "";
}

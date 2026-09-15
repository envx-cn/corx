/**
 * JSONP support: `?corx-callback=fn` wraps a JSON proxy
 * response as a JavaScript call — a leading block comment, then `fn(<json>);` —
 * so a plain `<script src>` can read it. That is the escape hatch for strict
 * CSPs (script-src allows script tags but blocks fetch/XHR) and
 * sandboxed/`null`-origin pages where CORS can't apply.
 *
 * The callback is consumed only when JSONP is requested: it is read from the
 * proxy request's own query, so a target's own `callback` (a JSONP upstream)
 * is left untouched — unless the caller wrote it in subdomain mode, where the
 * two queries are the same one. See app/lib/control.ts.
 */
import { readControl } from "../lib/control.js";
import { ProxyError } from "../lib/types.js";

/**
 * Cap on a wrapped body. JSONP is a page-script concern; multi-megabyte payloads
 * belong on `fetch`, not in a `<script>`. Buffering is required to wrap, so the
 * cap also bounds Worker memory.
 */
export const JSONP_MAX_BYTES = 2 * 1024 * 1024;

/** A conservative dotted JS identifier: `cb`, `window.cb`, `app.onData_2`. */
const CALLBACK_RE = /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/;
const MAX_CALLBACK = 128;

/**
 * Validate and return the callback name, or null when JSONP wasn't requested.
 * The name lands verbatim in a script the caller's page executes, so it is
 * restricted to an identifier path — no parentheses, quotes, brackets or
 * whitespace can reach the output.
 */
export function jsonpCallback(reqUrl: URL): string | null {
  const raw = readControl(reqUrl, "callback");
  if (raw === null) return null;
  const name = raw.trim();
  if (!name || name.length > MAX_CALLBACK || !CALLBACK_RE.test(name)) {
    throw new ProxyError(400, `Invalid JSONP callback name: ${JSON.stringify(raw).slice(0, 80)}`);
  }
  return name;
}

/** JSON-ish content types we are willing to hand to `JSON.parse`. */
export function isJsonContentType(contentType: string | null): boolean {
  return (contentType ?? "").toLowerCase().includes("json");
}

/** Wrap a JSON body as `cb(<json>);` behind a leading block comment. */
export function wrapJsonp(callback: string, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder();
  const head = enc.encode(`/**/ ${callback}(`);
  const tail = enc.encode(");\n");
  const out = new Uint8Array(head.length + body.length + tail.length);
  out.set(head, 0);
  out.set(body, head.length);
  out.set(tail, head.length + body.length);
  return out;
}

/** Headers for a JSONP response (never the upstream's, which may say JSON). */
export function jsonpHeaders(): Headers {
  const headers = new Headers();
  headers.set("content-type", "application/javascript; charset=utf-8");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

/**
 * The query namespace corx owns: `corx-ttl`, `corx-no-cache`, `corx-key`,
 * `corx-callback`, `corx-scheme`, `corx-port`.
 *
 * Every control param is prefixed, so it can never be confused with a target's
 * own param. That matters most in subdomain mode, where the proxy request's
 * query *is* the target's query (the target is built from it, and the control
 * names are stripped back off). Anything outside the namespace is left alone:
 * a target's `?key=`, `?ttl=` or `?callback=` belongs to the target.
 *
 * The prefix is a namespace, not a filter — an unknown `corx-*` name is a 400
 * (`assertKnownControlParams`) rather than a param quietly forwarded upstream.
 */
import { ProxyError } from "./types.js";

/** Logical control names; the wire name is always `corx-<name>`. */
export type ControlName = "ttl" | "no-cache" | "key" | "callback" | "charset" | "wrap" | "scheme" | "port";

/** Every control param, in documentation order. */
export const CONTROL_PARAMS: readonly string[] = [
  "corx-ttl",
  "corx-no-cache",
  "corx-key",
  "corx-callback",
  "corx-charset",
  "corx-wrap",
  "corx-scheme",
  "corx-port",
];

/** Wire name per logical name. */
const WIRE: Record<ControlName, string> = {
  ttl: "corx-ttl",
  "no-cache": "corx-no-cache",
  key: "corx-key",
  callback: "corx-callback",
  charset: "corx-charset",
  wrap: "corx-wrap",
  scheme: "corx-scheme",
  port: "corx-port",
};

const CORX_PREFIX = "corx-";
const KNOWN = new Set<string>(CONTROL_PARAMS);

/** Read a control param. Null when absent — an empty value is `""`, not null. */
export function readControl(reqUrl: URL, name: ControlName): string | null {
  return reqUrl.searchParams.get(WIRE[name]);
}

export function hasControl(reqUrl: URL, name: ControlName): boolean {
  return reqUrl.searchParams.has(WIRE[name]);
}

/**
 * Reject an unknown `corx-*` name (`corx-tt1` is a typo, never a target param).
 * Only the proxy request's own query is inspected: a `?url=` target's params
 * are its own business.
 */
export function assertKnownControlParams(reqUrl: URL): void {
  reqUrl.searchParams.forEach((_value, name) => {
    if (name.startsWith(CORX_PREFIX) && !KNOWN.has(name)) {
      throw new ProxyError(400, `Unknown corx param: ${name} (known: ${CONTROL_PARAMS.join(", ")})`);
    }
  });
}

/**
 * Delete every control param from a URL whose query belongs to corx. Callers
 * pass the proxy request itself (or the subdomain-mode target built from it);
 * a caller-supplied `?url=` / path target is deliberately left untouched.
 */
export function stripControlParams(raw: string): string {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return raw; // validateTargetUrl will 400 it
  }
  for (const name of CONTROL_PARAMS) target.searchParams.delete(name);
  return target.toString();
}

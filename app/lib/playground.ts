/**
 * Console playground — shared types + spec validation.
 *
 * Pure module (no Hono, no bindings) so both the console run route and the
 * client island can import it: the route parses untrusted JSON with
 * `parsePlaygroundSpec`, the island keeps the same shape in its form state.
 */

/** Methods the composer offers (matching what the proxy forwards). */
export const PLAYGROUND_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
export type PlaygroundMethod = (typeof PLAYGROUND_METHODS)[number];

/** How the target is addressed on the proxy — the three real routing modes. */
export const PLAYGROUND_ROUTES = ["fetch", "proxy", "raw", "subdomain"] as const;
export type PlaygroundRoute = (typeof PLAYGROUND_ROUTES)[number];

export const MAX_PLAYGROUND_HEADERS = 32;
/** Spec body cap (the console POST itself; the proxy's own MAX_BODY_BYTES still applies). */
export const MAX_PLAYGROUND_BODY = 1024 * 1024;
/** How much of the response body the run route captures for display. */
export const MAX_CAPTURE_BYTES = 128 * 1024;

export interface PlaygroundHeader {
  name: string;
  value: string;
}

/** Header names fetch() refuses to set — stripped before the proxy sees them. */
export const PLAYGROUND_FORBIDDEN_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export interface PlaygroundSpec {
  url: string;
  method: PlaygroundMethod;
  route: PlaygroundRoute;
  headers: PlaygroundHeader[];
  body: string;
  /** none = anonymous (keyless Origin grants still apply), stored = by id, raw = pasted key. */
  keyMode: "none" | "stored" | "raw";
  keyId: string;
  rawKey: string;
  /** Simulated browser Origin (CORS + keyless). Empty = header not sent. */
  origin: string;
  /** Simulated client IP (cf-connecting-ip) for rate-limit buckets. */
  clientIp: string;
  /** Per-request cache TTL; null = inherit. */
  ttl: number | null;
  noCache: boolean;
}

export interface PlaygroundInjectionPreview {
  hosts: string[];
  /** Variable names only — values are secrets and never leave the server. */
  vars: string[];
  headerLines: string[];
  paramLines: string[];
  /** Target URL with param rules applied (secret values masked as ***). */
  effectiveUrl: string | null;
}

export interface PlaygroundRequestInfo {
  method: string;
  /** Proxy-side request path + query the executor built. */
  path: string;
  /** Host of the in-process proxy request (the encoded target in subdomain mode). */
  proxyHost: string;
  /** Pre-injection target URL (what the proxy logs). */
  targetUrl: string;
  keyMode: "none" | "stored" | "raw";
  keyName: string | null;
  injection: PlaygroundInjectionPreview | null;
  /** Headers dropped by the composer (fetch-forbidden) before the run. */
  ignoredHeaders: string[];
}

export interface PlaygroundResult {
  status: number;
  statusText: string;
  latencyMs: number;
  headers: Array<[string, string]>;
  body: string;
  bodyEncoding: "text" | "base64";
  bytes: number;
  truncated: boolean;
  contentType: string;
  request: PlaygroundRequestInfo;
}

export type ParseResult = { spec: PlaygroundSpec } | { error: string };

const MAX_URL = 8192;
const MAX_KEY = 512;
const MAX_HEADER_VALUE = 8192;
const MAX_ORIGIN = 256;
const MAX_IP = 45;
const IP_RE = /^[0-9a-fA-F:.]+$/;

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Validate + normalize an untrusted playground spec (the island's POST body). */
export function parsePlaygroundSpec(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { error: "Invalid playground spec" };
  const r = raw as Record<string, unknown>;

  const url = asString(r["url"]).trim();
  if (!url) return { error: "Target URL is required" };
  if (url.length > MAX_URL) return { error: `Target URL too long (>${MAX_URL})` };
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return { error: "Only http:// and https:// URLs are allowed" };
  } catch {
    return { error: "Invalid target URL" };
  }

  const method = asString(r["method"]).toUpperCase();
  if (!(PLAYGROUND_METHODS as readonly string[]).includes(method)) return { error: `Unsupported method: ${method || "?"}` };

  const route = asString(r["route"]) || "fetch";
  if (!(PLAYGROUND_ROUTES as readonly string[]).includes(route)) return { error: `Unknown route style: ${route}` };

  const rawHeaders = Array.isArray(r["headers"]) ? r["headers"] : [];
  if (rawHeaders.length > MAX_PLAYGROUND_HEADERS) {
    return { error: `Too many headers (max ${MAX_PLAYGROUND_HEADERS})` };
  }
  const headers: PlaygroundHeader[] = [];
  for (const entry of rawHeaders) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = asString(e["name"]).trim();
    if (!name) continue; // empty rows are the composer's "blank line"
    const value = asString(e["value"]);
    if (name.length > 128 || value.length > MAX_HEADER_VALUE) return { error: `Header too long: ${name}` };
    if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) return { error: `Header must not contain newlines: ${name}` };
    headers.push({ name, value });
  }

  const body = asString(r["body"]);
  if (body.length > MAX_PLAYGROUND_BODY) {
    return { error: `Request body too large for the console (>${MAX_PLAYGROUND_BODY} bytes)` };
  }

  const keyModeRaw = asString(r["keyMode"]) || "none";
  const keyMode = keyModeRaw === "stored" || keyModeRaw === "raw" ? keyModeRaw : "none";
  const keyId = asString(r["keyId"]).trim();
  const rawKey = asString(r["rawKey"]).trim();
  if (keyMode === "stored" && !keyId) return { error: "Pick a stored key or switch to anonymous" };
  if (rawKey.length > MAX_KEY) return { error: "API key too long" };

  const origin = asString(r["origin"]).trim();
  if (origin) {
    if (origin.length > MAX_ORIGIN) return { error: "Origin too long" };
    let valid = false;
    try {
      const u = new URL(origin);
      valid = (u.protocol === "http:" || u.protocol === "https:") && u.origin === origin;
    } catch {
      valid = false;
    }
    if (!valid) return { error: "Origin must be a bare http(s) origin, e.g. https://app.example" };
  }

  const clientIp = asString(r["clientIp"]).trim();
  if (clientIp && (clientIp.length > MAX_IP || !IP_RE.test(clientIp))) {
    return { error: "Client IP looks invalid (IPv4/IPv6 only)" };
  }

  let ttl: number | null = null;
  const ttlRaw = r["ttl"];
  if (ttlRaw !== null && ttlRaw !== undefined && ttlRaw !== "") {
    const n = Number(ttlRaw);
    if (!Number.isInteger(n) || n < 0 || n > 86400) return { error: "TTL must be a whole number of seconds (0–86400)" };
    ttl = n;
  }

  return {
    spec: {
      url,
      method: method as PlaygroundMethod,
      route: route as PlaygroundRoute,
      headers,
      body,
      keyMode,
      keyId,
      rawKey,
      origin,
      clientIp,
      ttl,
      noCache: r["noCache"] === true,
    },
  };
}

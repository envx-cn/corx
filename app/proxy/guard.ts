import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { ipv4ToInt, isPublicIp } from "./ip.js";

/** Hostnames / IP ranges that must never be fetched (SSRF protection). */
const BLOCKED_EXACT = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.google",
  "169.254.169.254",
  "100.100.100.200", // Alibaba metadata
]);

const BLOCKED_SUFFIX = [".internal", ".local", ".localhost", ".invalid", ".example"];

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (BLOCKED_EXACT.has(host)) return true;
  if (host === "::1" || host === "::" || host === "0.0.0.0") return true;
  if (host.startsWith("[") && host.endsWith("]")) return true; // IPv6 literals (incl. ::ffff:…)
  // IP literals: block any non-public address (private, link-local, CGNAT,
  // multicast, reserved …). DNS names are checked separately by dns-check.ts.
  if (ipv4ToInt(host) !== null && !isPublicIp(host)) return true;
  if (BLOCKED_SUFFIX.some((s) => host === s.slice(1) || host.endsWith(s))) return true;
  return false;
}

/** Validate + normalize the target URL. Throws ProxyError(400/403). */
export function validateTargetUrl(raw: string | null): URL {
  if (!raw?.trim()) {
    throw new ProxyError(400, 'Missing target URL. Use /fetch?url=https://example.com or /https://example.com');
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ProxyError(400, "Invalid target URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ProxyError(400, "Only http:// and https:// URLs are allowed");
  }
  if (url.username || url.password) {
    throw new ProxyError(400, "URLs with credentials are not allowed");
  }
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(url.hostname)) {
    throw new ProxyError(400, `Invalid hostname: ${url.hostname}`);
  }
  if (raw.length > 8192) throw new ProxyError(414, "Target URL too long");
  if (isBlockedHostname(url.hostname)) {
    throw new ProxyError(403, `Blocked host: ${url.hostname}`);
  }
  return url;
}

/** Extra blocklist from D1 (admin-managed). Fail-open on DB errors. */
export async function checkDbBlocklist(db: D1Database, hostname: string): Promise<void> {
  try {
    const row = await db
      .prepare("SELECT hostname FROM blocked_hosts WHERE hostname = ?")
      .bind(hostname.toLowerCase())
      .first();
    if (row) throw new ProxyError(403, `Blocked host: ${hostname}`);
  } catch (err) {
    if (err instanceof ProxyError) throw err;
    // fail open — logging/proxy should survive D1 hiccups
  }
}

/**
 * Extract the target URL from the request. Supports:
 *   GET /fetch?url=https://example.com/a?b=c
 *   GET /?url=https://example.com/...
 *   GET /proxy/https://example.com/...
 *   GET /https://example.com/...  (or /http://...)
 */
export function extractTargetUrl(reqUrl: URL, pathname: string): string | null {
  const q = reqUrl.searchParams.get("url");
  if (q) return q;

  let path = pathname;
  if (path.startsWith("/proxy/")) path = path.slice("/proxy".length);
  if (path.startsWith("/fetch/")) path = path.slice("/fetch".length);
  // path is now "/https://..." or "/http://..." (or "/" for docs)
  if (path === "/" || path === "") return null;
  const candidate = path.slice(1); // strip leading "/"
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^https?:\//i.test(candidate)) return candidate.replace(/^https?:\//i, (m) => `${m}/`);
  return null;
}

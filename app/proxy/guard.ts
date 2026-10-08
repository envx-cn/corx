import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { CONTROL_PARAMS } from "../lib/control.js";
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

/** Validate + normalize the target URL. Throws ProxyError(400/403).
 *
 * `ipCheck: false` (per-key opt-out, see api_keys.ip_check) skips the
 * internal-hostname / IP-literal guard — syntax checks always run. The admin
 * blocklist and platform-level private-IP blocks are unaffected. */
export function validateTargetUrl(raw: string | null, opts: { ipCheck?: boolean } = {}): URL {
  const ipCheck = opts.ipCheck !== false;
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
  if (ipCheck && isBlockedHostname(url.hostname)) {
    throw new ProxyError(403, `Blocked host: ${url.hostname}`);
  }
  return url;
}

/**
 * Host candidates for the D1 blocklist: the host itself plus its parent
 * domains. Blocking `evil.example` therefore also covers
 * `api.evil.example`, while a bare TLD entry (`com`) never matches — the
 * suffix has to keep at least two labels to count as a domain.
 */
export function blocklistCandidates(hostname: string): string[] {
  const h = hostname.toLowerCase().replace(/\.+$/, "");
  const parts = h.split(".").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const candidate = parts.slice(i).join(".");
    if (i === 0 || candidate.includes(".")) out.push(candidate);
  }
  return out;
}

/**
 * A blocklist entry: a plain hostname (lowercased, no wildcard — the
 * blocklist matches exact hostnames and covers their subdomains via
 * `blocklistCandidates`). Null when the value is not a usable hostname.
 */
export function normalizeBlockedHostname(raw: string): string | null {
  const host = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (!host || host.length > 255) return null;
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(host) ? host : null;
}

/**
 * Per-isolate memo of the blocklist answer, 30 s — the same trade the DoH
 * resolver makes in `dns-check.ts`.
 *
 * `checkDbBlocklist` runs on EVERY proxied request (including cache hits, by
 * design: a host blocked after the fact must stop being served), which made it
 * the one per-request D1 read that carried no information a normal call could
 * not have predicted: blocklists are small and change rarely, so the same host
 * is asked about over and over inside one isolate.
 *
 * The cost is a bounded staleness window for an out-of-band edit: a row written
 * straight into D1 (not through the console/API) can take up to 30 s to take
 * effect on a warm isolate. Blocking and unblocking through the app call
 * `invalidateBlocklistMemo()`, so an operator's own action is immediate; the
 * window only ever applies to a hand-edited row. Blocking failing closed inside
 * the memo is harmless (a blocked host stays blocked); what could soften is a
 * host unblocked by hand while an isolate still has it memoized.
 */
const BLOCKLIST_TTL_MS = 30_000;
const blocklistMemo = new Map<string, { at: number; blocked: boolean }>();

/**
 * Drop the memo — call after any write to `blocked_hosts` so the change is
 * visible immediately instead of after the TTL.
 */
export function invalidateBlocklistMemo(): void {
  blocklistMemo.clear();
}

/** Extra blocklist from D1 (admin-managed). A parent-domain entry covers its
 * subdomains. Fail-open on DB errors. */
export async function checkDbBlocklist(db: D1Database, hostname: string): Promise<void> {
  const memoKey = hostname.toLowerCase().replace(/\.+$/, "");
  const candidates = blocklistCandidates(memoKey);
  if (candidates.length === 0) return;
  const memo = blocklistMemo.get(memoKey);
  if (memo && Date.now() - memo.at < BLOCKLIST_TTL_MS) {
    if (memo.blocked) throw new ProxyError(403, `Blocked host: ${hostname}`);
    return;
  }
  try {
    const placeholders = candidates.map(() => "?").join(", ");
    const row = await db
      .prepare(`SELECT hostname FROM blocked_hosts WHERE hostname IN (${placeholders}) LIMIT 1`)
      .bind(...candidates)
      .first();
    blocklistMemo.set(memoKey, { at: Date.now(), blocked: Boolean(row) });
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
 *
 * In path modes the request's query is the proxy's namespace: the `corx-*`
 * control params are consumed by corx and stripped, everything else rides
 * along to the target — the same contract as subdomain mode.
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
  let target: string | null;
  if (/^https?:\/\//i.test(candidate)) target = candidate;
  else if (/^https?:\//i.test(candidate)) target = candidate.replace(/^https?:\//i, (m) => `${m}/`);
  else return null;
  // In path modes the request's query is the proxy's namespace: the `corx-*`
  // control params are consumed by corx and stripped, everything else rides
  // along to the target — the same contract as subdomain mode (and what the
  // /docs page has always promised: the target's own query string survives
  // the first `?`). A target that genuinely needs a param named `corx-*`
  // uses `?url=` instead.
  const forwarded = new URLSearchParams(reqUrl.search);
  for (const name of CONTROL_PARAMS) forwarded.delete(name);
  const search = forwarded.toString();
  if (search) target += `${target.includes("?") ? "&" : "?"}${search}`;
  return target;
}

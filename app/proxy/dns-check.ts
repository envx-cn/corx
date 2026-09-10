import { ProxyError } from "../lib/types.js";
import { ipv4ToInt, ipv6ToBigInt, isPublicIp } from "./ip.js";

/**
 * Resolve a target hostname via DNS-over-HTTPS and verify every address is
 * public. Closes the biggest SSRF gap in a string-only guard: a hostname like
 * `localtest.me` (→127.0.0.1) or a rebinding-capable name passes the literal
 * checks but resolves to a private/metadata IP.
 *
 * Trade-offs (honest):
 * - TOCTOU: the actual `fetch()` re-resolves DNS, so a fast-rebinding attacker
 *   could still slip between check and fetch. Cloudflare's network layer
 *   blocks private-IP fetches from Workers, which is the real backstop; this
 *   check narrows the window and rejects clearly-bad hosts up front.
 * - Fail-open: if DoH itself errors, the request is allowed (a brief DoH
 *   outage must not take the proxy down). Results are cached per isolate for
 *   30s to amortize the extra round-trip.
 */

const DOH_URL = "https://cloudflare-dns.com/dns-query";
const RESOLVE_CACHE_TTL_MS = 30_000;

const resolveCache = new Map<string, { at: number; ips: string[] }>();

async function resolveType(host: string, type: "A" | "AAAA"): Promise<string[]> {
  const url = `${DOH_URL}?name=${encodeURIComponent(host)}&type=${type}`;
  const res = await fetch(url, { headers: { accept: "application/dns-json" } });
  if (!res.ok) throw new Error(`DoH ${res.status}`);
  const data = (await res.json()) as { Answer?: Array<{ type?: number; data?: string }> };
  // Keep only A (1) / AAAA (28) answers — CNAMEs carry names, not IPs.
  return (data.Answer ?? [])
    .filter((a) => a.type === 1 || a.type === 28)
    .map((a) => a.data ?? "")
    .filter((d) => d !== "");
}

/**
 * Throw ProxyError(403) when the hostname resolves to any non-public IP.
 * IP literals are skipped (the literal checks in guard.ts already covered
 * them). Fail-open on DoH/network errors.
 */
export async function assertPublicHost(host: string): Promise<void> {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return;
  if (ipv4ToInt(h) !== null || ipv6ToBigInt(h) !== null) return; // literal — already classified

  const cached = resolveCache.get(h);
  if (cached && Date.now() - cached.at < RESOLVE_CACHE_TTL_MS) {
    if (cached.ips.some((ip) => !isPublicIp(ip))) {
      throw new ProxyError(403, `Blocked host (resolves to non-public IP): ${host}`);
    }
    return;
  }

  try {
    const [a, aaaa] = await Promise.all([resolveType(h, "A"), resolveType(h, "AAAA")]);
    const ips = [...a, ...aaaa];
    resolveCache.set(h, { at: Date.now(), ips });
    if (ips.some((ip) => !isPublicIp(ip))) {
      throw new ProxyError(403, `Blocked host (resolves to non-public IP): ${host}`);
    }
  } catch (err) {
    if (err instanceof ProxyError) throw err;
    // Fail open — see module comment. CF's network layer is the backstop.
    console.warn("corx dns check failed for", host, ":", (err as Error)?.message ?? err);
  }
}

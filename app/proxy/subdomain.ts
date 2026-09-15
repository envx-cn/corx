import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { readControl, stripControlParams } from "../lib/control.js";
import { extractTargetUrl } from "./guard.js";

/**
 * Subdomain mode: `https://<encoded-host>.<zone>/<path>?<query>`
 *
 *   example.com      ->  example.corx.com            (no dot = assume .com)
 *   example.org      ->  example-org.corx.com        (. -> -)
 *   my-site.co.uk    ->  my--site-co-uk.corx.com     (- -> --, so decoding is lossless)
 *
 * DNS wildcards only match a single label, hence dots must be encoded.
 * Requires a wildcard Custom Domain (*.corx.com) on the Worker —
 * workers.dev hostnames can't do sub-subdomains, use /fetch?url= there.
 */

/** First-labels that are always served locally, never decoded as targets. */
const RESERVED_LABELS = new Set(["www", "admin", "console", "api", "health", "status", "terms", "privacy", "docs", "blog"]);

export function encodeHostname(hostname: string): string {
  return hostname.toLowerCase().replaceAll("-", "--").replaceAll(".", "-");
}

export function decodeHostname(label: string): string {
  let out = "";
  for (let i = 0; i < label.length; i++) {
    const ch = label[i];
    if (ch !== "-") {
      out += ch;
      continue;
    }
    if (label[i + 1] === "-") {
      out += "-";
      i++;
    } else {
      out += ".";
    }
  }
  return out;
}

/** The encoded first label in this host, or null when served locally. */
function encodedLabel(host: string, env: Env): string | null {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "[::1]" || /^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;

  const zone = (env.PROXY_ZONE ?? "").trim().toLowerCase().replace(/\.+$/, "");
  if (zone) {
    if (h === zone) return null;
    if (!h.endsWith(`.${zone}`)) return null;
    const sub = h.slice(0, -(zone.length + 1));
    if (sub === "" || sub.includes(".")) return null;
    return sub;
  }

  // Auto-detect: first label is the target (correct at any zone depth,
  // since the encoded host never contains dots).
  if (h.endsWith(".workers.dev")) return null;
  const parts = h.split(".");
  if (parts.length < 3) return null;
  return parts[0] ?? null;
}

/** Build the target URL from subdomain + path + query. Null = serve locally. */
export function subdomainTarget(reqUrl: URL, env: Env): string | null {
  const label = encodedLabel(reqUrl.hostname, env);
  if (!label || RESERVED_LABELS.has(label)) return null;
  if (label.length > 63) {
    throw new ProxyError(400, `Subdomain "${label}" exceeds the 63-char DNS limit. Use /fetch?url=… instead.`);
  }

  let decoded = decodeHostname(label);
  if (!decoded) return null;
  if (!decoded.includes(".")) decoded += ".com"; // shorthand: example.corx.com -> example.com

  const scheme = readControl(reqUrl, "scheme")?.toLowerCase() === "http" ? "http" : "https";
  const portRaw = readControl(reqUrl, "port") ?? "";
  let port = "";
  if (portRaw !== "") {
    const n = Number(portRaw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new ProxyError(400, "Invalid corx-port (1–65535)");
    if (!((scheme === "https" && n === 443) || (scheme === "http" && n === 80))) port = `:${n}`;
  }

  let target: URL;
  try {
    target = new URL(reqUrl.pathname + reqUrl.search, `${scheme}://${decoded}${port}`);
  } catch {
    throw new ProxyError(400, `Cannot decode subdomain "${label}" as a hostname`);
  }
  // The proxy request's query *is* the target's query here, so the control
  // params are stripped back off; everything else belongs to the target.
  return stripControlParams(target.toString());
}

export interface ResolvedTarget {
  target: string | null;
  viaSubdomain: boolean;
}

/**
 * Precedence: explicit `?url=` → path modes (/proxy/*, /https://…)
 * → subdomain mode → null (serve landing / 404).
 *
 * A caller-supplied target is returned untouched: its query belongs to the
 * target, so a genuine `?key=`/`?ttl=` keeps working. corx reads its control
 * params from the proxy request's own query instead (app/lib/control.ts).
 */
export function resolveRawTarget(reqUrl: URL, env: Env): ResolvedTarget {
  const pathMode = extractTargetUrl(reqUrl, reqUrl.pathname);
  if (pathMode) return { target: pathMode, viaSubdomain: false };
  const sub = subdomainTarget(reqUrl, env);
  return { target: sub, viaSubdomain: sub !== null };
}

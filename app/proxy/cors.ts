import type { Context } from "hono";
import type { ApiKeyRow, Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { resolveRawTarget } from "./subdomain.js";

type Ctx = Context<{ Bindings: Env; Variables: ProxyVariables }>;

/**
 * Normalize an Origin header (or an allowed-origin entry) to a serialized
 * origin. Browsers send a bare `scheme://host[:port]`; anything unparseable
 * (or the literal "null") never matches a grant. `URL.origin` lowercases the
 * host and drops a default port, which is why stored values are normalized
 * through here too.
 */
export function normalizeOrigin(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t || t === "null") return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Hostnames a `scheme://host:*` port wildcard may apply to. Loopback only:
 * the point of the wildcard is a dev server on a random port, and a loopback
 * name is the one origin namespace that cannot belong to somebody else — so
 * the narrow form covers the real need without opening `https://*.example.com`
 * (a shared/subdomain-takeover surface) or a regex.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** `scheme://host:*`, port position only, loopback host only. The host is exact. */
const PORT_WILDCARD_RE = /^(https?):\/\/(\[[0-9a-f:]+\]|[a-z0-9.-]+):\*$/i;

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

/**
 * The `scheme://host:*` pattern that would cover this origin, or null when the
 * host is not loopback (or the value is not an origin at all).
 */
export function portWildcardFor(origin: string): string | null {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (!isLoopbackHost(u.hostname)) return null;
  return `${u.protocol}//${u.hostname}:*`;
}

/**
 * Normalize one allowed-origin entry to its canonical form, or null when it is
 * not one: an exact origin (`URL.origin` — lowercase host, default port
 * dropped) or a loopback port wildcard. `*` is returned as-is; a `*` anywhere
 * else (host position, non-loopback port) is rejected.
 */
export function normalizeOriginPattern(raw: string): string | null {
  const t = raw.trim().replace(/\/+$/, "");
  if (!t) return null;
  if (t === "*") return "*";
  const m = PORT_WILDCARD_RE.exec(t);
  if (m) {
    const scheme = m[1]!.toLowerCase();
    const host = m[2]!.toLowerCase();
    return isLoopbackHost(host) ? `${scheme}://${host}:*` : null;
  }
  // A `*` outside the port position is a host wildcard: `new URL()` happily
  // accepts `https://*.example.com`, so reject it explicitly.
  if (t.includes("*")) return null;
  // An allowed origin is a bare origin, not a URL: a path/query is a config
  // mistake worth a 400 rather than silently dropping the path.
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.pathname !== "/" || u.search || u.hash) return null;
  return u.origin;
}

/**
 * Does a caller origin (already normalized) satisfy one stored pattern?
 * The pattern is normalized here too, so values stored before normalization
 * existed (`https://App.Example.com:443`) start matching immediately.
 */
export function originMatches(origin: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const p = normalizeOriginPattern(pattern) ?? pattern;
  if (p === origin) return true;
  if (p.endsWith(":*")) return portWildcardFor(origin) === p;
  return false;
}

/**
 * Parse an origins value: "*" | comma-separated list.
 * Null/undefined/"" → null (inherit from the next level up).
 *
 * Entries are returned verbatim — validation is `normalizeOriginsInput`'s job,
 * and a value that does not parse is kept so the policy stays *closed* (an
 * unparseable entry matches nothing) rather than quietly widening to `*`.
 */
export function parseOrigins(raw: string | null | undefined): string[] | "*" | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "") return null;
  if (t === "*") return "*";
  const list = t
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Validate + normalize origins for storage. "" → null (inherit global).
 * Throws ProxyError(400) on invalid entries.
 */
export function normalizeOriginsInput(raw: string): string | null {
  const t = raw.trim();
  if (t === "") return null;
  if (t === "*") return "*";
  const parts = t
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const out: string[] = [];
  for (const p of parts) {
    const pattern = normalizeOriginPattern(p);
    if (pattern && pattern !== "*") {
      if (!out.includes(pattern)) out.push(pattern);
      continue;
    }
    // A `*` that survives normalization only as the whole value; anywhere else
    // it is a host wildcard (rejected) or a non-loopback port wildcard.
    if (p.includes("*")) {
      throw new ProxyError(400, `Origin wildcards are only allowed as a loopback port, e.g. http://localhost:*: ${p}`);
    }
    throw new ProxyError(400, `Invalid origin: ${p}`);
  }
  return out.join(", ");
}

/** Effective origins: per-key value wins, otherwise the global env default. */
export function effectiveOrigins(env: Env, keyRow?: Pick<ApiKeyRow, "allowed_origins"> | null): "*" | string[] {
  return parseOrigins(keyRow?.allowed_origins ?? null) ?? parseOrigins(env.ALLOWED_ORIGINS) ?? "*";
}

/**
 * Resolve the ACAO value for this request. Null = no header to stamp.
 *
 * - `*` policy → `*`.
 * - No `Origin` header (curl, servers, same-origin) → null: the caller isn't
 *   in a cross-origin context, so CORS doesn't apply — the request is still
 *   allowed, it just gets no ACAO.
 * - Origin present and in the allowlist → the origin (echoed back).
 * - Origin present and not allowed → null (the middleware 403s before routing).
 */
export function resolveAllowOrigin(req: Request, env: Env, keyRow?: Pick<ApiKeyRow, "allowed_origins"> | null): string | null {
  const allow = effectiveOrigins(env, keyRow);
  if (allow === "*") return "*";
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return null;
  return allowMatches(allow, normalized) ? origin : null;
}

/** True when any pattern in the list covers this normalized origin. */
export function allowMatches(allow: string[], origin: string): boolean {
  return allow.some((p) => originMatches(origin, p));
}

/** Response headers a cross-origin caller may read (public-tier quota included). */
const EXPOSED_HEADERS =
  "X-Corx-Cache, X-Corx-Target, X-Corx-Latency-Ms, X-RateLimit-Limit, X-RateLimit-Remaining, " +
  "X-Corx-Quota-Day-Limit, X-Corx-Quota-Day-Remaining, X-Corx-Quota-Origin-Limit, " +
  "X-Corx-Quota-Origin-Remaining, X-Corx-Quota-Host-Limit, X-Corx-Quota-Host-Remaining";

function varyWithOrigin(headers: Headers): void {
  const vary = headers.get("vary");
  if (!vary) headers.set("Vary", "Origin");
  else if (!vary.split(",").map((s) => s.trim().toLowerCase()).includes("origin")) {
    headers.set("Vary", `${vary}, Origin`);
  }
}

/**
 * True when this request is a proxy request (and thus gets CORS handling).
 * Everything else — /console/*, /api/*, /health — is same-origin or auth-gated
 * and must NOT expose ACAO headers to arbitrary websites.
 */
function isProxyRequest(c: Ctx): boolean {
  const reqUrl = new URL(c.req.url);
  const p = reqUrl.pathname;
  // Bare proxy routes (no target yet, e.g. /fetch without ?url=) still count:
  // their error bodies must be readable from a browser.
  if (p === "/fetch" || p.startsWith("/fetch/") || p === "/proxy" || p.startsWith("/proxy/")) return true;
  try {
    return resolveRawTarget(reqUrl, c.env).target !== null;
  } catch {
    // Malformed subdomain (bad corx-port, …) — still a proxy-style request;
    // let the proxy handler return the 4xx, with CORS so the error is readable.
    return true;
  }
}

/**
 * CORS middleware, applied to proxy routes only.
 * Uses the caller's per-key origins when set (see apiKeyMiddleware, which
 * must run before this). Note: browsers don't send API keys on OPTIONS
 * preflights — pass the key via `?corx-key=` if preflights must be per-key,
 * or keep the global ALLOWED_ORIGINS permissive.
 */
export function cors() {
  return async (c: Ctx, next: () => Promise<void>) => {
    if (!isProxyRequest(c)) return next();

    const keyRow = c.get("apiKey");
    const allow = effectiveOrigins(c.env, keyRow);
    const origin = c.req.header("origin");
    const normalized = normalizeOrigin(origin);
    const matched = allow !== "*" && normalized !== null && allowMatches(allow, normalized);
    const allowed = allow === "*" || !origin || matched;
    const acao = allow === "*" ? "*" : origin && matched ? origin : null;

    if (c.req.method === "OPTIONS") {
      const headers = new Headers();
      if (acao) {
        headers.set("Access-Control-Allow-Origin", acao);
        if (acao !== "*") varyWithOrigin(headers);
        headers.set(
          "Access-Control-Allow-Methods",
          c.req.header("Access-Control-Request-Method") ?? "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
        );
        headers.set(
          "Access-Control-Allow-Headers",
          c.req.header("Access-Control-Request-Headers") ?? "Content-Type, Authorization, X-Requested-With",
        );
        headers.set("Access-Control-Max-Age", "86400");
      }
      return new Response(null, { status: 204, headers });
    }

    if (!allowed) {
      return c.json({ error: "Origin not allowed by this proxy" }, 403);
    }

    await next();

    if (acao) {
      c.header("Access-Control-Allow-Origin", acao);
      if (acao !== "*") {
        const vary = c.res.headers.get("Vary");
        c.header("Vary", vary ? `${vary}, Origin` : "Origin");
      }
      c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Api-Key");
      c.header("Access-Control-Expose-Headers", EXPOSED_HEADERS);
    }
  };
}

/**
 * Stamp CORS headers onto an error response (used by app.onError) so a 500 is
 * readable by browsers even though the normal middleware chain was cut short.
 */
export function withProxyCors(c: Ctx, res: Response): Response {
  if (!isProxyRequest(c)) return res;
  // Same reason as the handler's own stamp: a proxied response is never content
  // the proxy wants indexed (this path is only reached when the chain was cut
  // short by a thrown error, but it is still a proxy response).
  res.headers.set("X-Robots-Tag", "noindex");
  const allow = effectiveOrigins(c.env, c.get("apiKey") ?? null);
  const origin = c.req.header("origin");
  const normalized = normalizeOrigin(origin);
  const acao =
    allow === "*" ? "*" : origin && normalized && allowMatches(allow, normalized) ? origin : null;
  if (acao) {
    res.headers.set("Access-Control-Allow-Origin", acao);
    if (acao !== "*") {
      const vary = res.headers.get("Vary");
      res.headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
    }
  }
  return res;
}

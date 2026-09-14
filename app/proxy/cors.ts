import type { Context } from "hono";
import type { ApiKeyRow, Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { resolveRawTarget } from "./subdomain.js";

type Ctx = Context<{ Bindings: Env; Variables: ProxyVariables }>;

/**
 * Parse an origins value: "*" | comma-separated list.
 * Null/undefined/"" → null (inherit from the next level up).
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
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (parts.length === 0) return null;
  for (const p of parts) {
    let u: URL;
    try {
      u = new URL(p);
    } catch {
      throw new ProxyError(400, `Invalid origin: ${p}`);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new ProxyError(400, `Origin must be http(s): ${p}`);
    }
    if (u.pathname !== "/" || u.search || u.hash) {
      throw new ProxyError(400, `Origin must not contain a path: ${p}`);
    }
  }
  return parts.join(", ");
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
  return allow.includes(origin) ? origin : null;
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
 * preflights — pass the key via `?key=` if preflights must be per-key,
 * or keep the global ALLOWED_ORIGINS permissive.
 */
export function cors() {
  return async (c: Ctx, next: () => Promise<void>) => {
    if (!isProxyRequest(c)) return next();

    const keyRow = c.get("apiKey");
    const allow = effectiveOrigins(c.env, keyRow);
    const origin = c.req.header("origin");
    const allowed = allow === "*" || !origin || allow.includes(origin);
    const acao = allow === "*" ? "*" : origin && allow.includes(origin) ? origin : null;

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
  const allow = effectiveOrigins(c.env, c.get("apiKey") ?? null);
  const origin = c.req.header("origin");
  const acao = allow === "*" ? "*" : origin && allow.includes(origin) ? origin : null;
  if (acao) {
    res.headers.set("Access-Control-Allow-Origin", acao);
    if (acao !== "*") {
      const vary = res.headers.get("Vary");
      res.headers.set("Vary", vary ? `${vary}, Origin` : "Origin");
    }
  }
  return res;
}

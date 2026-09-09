import type { Context } from "hono";
import type { ApiKeyRow, Env } from "./types.js";
import { ProxyError } from "./types.js";
import type { ProxyVariables } from "./auth.js";

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

/** Resolve the ACAO value for this request. Null = origin not allowed. */
export function resolveAllowOrigin(req: Request, env: Env, keyRow?: Pick<ApiKeyRow, "allowed_origins"> | null): string | null {
  const allow = effectiveOrigins(env, keyRow);
  if (allow === "*") return "*";
  const origin = req.headers.get("origin");
  if (!origin) return allow[0] ?? null;
  return allow.includes(origin) ? origin : null;
}

function varyWithOrigin(headers: Headers): void {
  const vary = headers.get("vary");
  if (!vary) headers.set("Vary", "Origin");
  else if (!vary.split(",").map((s) => s.trim().toLowerCase()).includes("origin")) {
    headers.set("Vary", `${vary}, Origin`);
  }
}

/**
 * CORS middleware: answers preflights, stamps CORS headers on responses.
 * Uses the caller's per-key origins when set (see apiKeyMiddleware, which
 * must run before this). Note: browsers don't send API keys on OPTIONS
 * preflights — pass the key via `?key=` if preflights must be per-key,
 * or keep the global ALLOWED_ORIGINS permissive.
 */
export function cors() {
  return async (c: Ctx, next: () => Promise<void>) => {
    const keyRow = c.get("apiKey");
    const allowOrigin = resolveAllowOrigin(c.req.raw, c.env, keyRow);

    if (c.req.method === "OPTIONS") {
      const headers = new Headers();
      if (allowOrigin) {
        headers.set("Access-Control-Allow-Origin", allowOrigin);
        if (allowOrigin !== "*") varyWithOrigin(headers);
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

    if (allowOrigin === null) {
      return c.json({ error: "Origin not allowed by this proxy" }, 403);
    }

    await next();

    const origin = allowOrigin ?? "*";
    c.header("Access-Control-Allow-Origin", origin);
    if (origin !== "*") {
      const vary = c.res.headers.get("Vary");
      c.header("Vary", vary ? `${vary}, Origin` : "Origin");
    }
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-Api-Key");
    c.header("Access-Control-Expose-Headers", "X-Corx-Cache, X-Corx-Target, X-Corx-Latency-Ms");
  };
}

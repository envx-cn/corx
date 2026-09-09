import type { Context } from "hono";
import type { Env } from "./types.js";

/** Parse ALLOWED_ORIGINS ("*" or comma-separated list). */
export function allowedOrigins(env: Env): string[] | "*" {
  const raw = (env.ALLOWED_ORIGINS ?? "*").trim();
  if (raw === "" || raw === "*") return "*";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve the ACAO value for this request. Null = origin not allowed. */
export function resolveAllowOrigin(req: Request, env: Env): string | null {
  const allow = allowedOrigins(env);
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

/** CORS middleware: answers preflights, stamps CORS headers on responses. */
export function cors() {
  return async (c: Context<{ Bindings: Env }>, next: () => Promise<void>) => {
    const allowOrigin = resolveAllowOrigin(c.req.raw, c.env);

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

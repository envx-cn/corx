import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "./types.js";
import { sessionSecret, verifySession } from "./session.js";

/**
 * Cloudflare Access (Zero Trust) auth.
 *
 * Put an Access application in front of the admin host (e.g. admin.corx.com)
 * or the /console/* + /admin/* paths. Users log in with Cloudflare, Access
 * adds a `Cf-Access-Jwt-Assertion` header, and the Worker verifies it:
 * RS256 signature against the team JWKS, issuer, audience, expiry.
 */

export interface AccessUser {
  email: string;
}

export interface AdminIdentity {
  email: string;
  via: "access" | "token";
}

export type AdminVariables = {
  adminUser: AdminIdentity;
};

type Ctx = Context<{ Bindings: Env; Variables: AdminVariables }>;

const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map<string, { keys: JsonWebKey[]; fetchedAt: number }>();

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)!;
  return out;
}

const utf8 = new TextDecoder();

export function parseJwt(token: string): {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
} {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error("malformed JWT");
  const decode = (p: string) => JSON.parse(utf8.decode(b64urlToBytes(p))) as Record<string, unknown>;
  return {
    header: decode(parts[0]),
    payload: decode(parts[1]),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: b64urlToBytes(parts[2]),
  };
}

async function getJwks(teamDomain: string): Promise<JsonWebKey[]> {
  const base = teamDomain.replace(/\/+$/, "");
  const cached = jwksCache.get(base);
  if (cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.keys;
  const res = await fetch(`${base}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: JsonWebKey[] };
  if (!Array.isArray(data.keys)) throw new Error("bad JWKS shape");
  jwksCache.set(base, { keys: data.keys, fetchedAt: Date.now() });
  return data.keys;
}

export interface VerifyAccessOpts {
  jwks: JsonWebKey[];
  teamDomain: string;
  aud: string;
  /** For tests. */
  nowMs?: number;
}

export async function verifyAccessJwt(token: string, opts: VerifyAccessOpts): Promise<AccessUser> {
  const { header, payload, signingInput, signature } = parseJwt(token);
  if (header["alg"] !== "RS256") throw new Error("unexpected JWT alg");
  const kid = header["kid"];
  if (typeof kid !== "string" || !kid) throw new Error("missing JWT kid");
  const jwk = opts.jwks.find((k) => (k as { kid?: string }).kid === kid && k.kty === "RSA");
  if (!jwk) throw new Error("unknown JWT kid");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(signingInput));
  if (!ok) throw new Error("bad JWT signature");

  const nowSec = Math.floor((opts.nowMs ?? Date.now()) / 1000);
  if (typeof payload["exp"] !== "number" || nowSec > (payload["exp"] as number) + 60) {
    throw new Error("JWT expired");
  }
  if (typeof payload["nbf"] === "number" && nowSec < (payload["nbf"] as number) - 60) {
    throw new Error("JWT not yet valid");
  }
  const aud = Array.isArray(payload["aud"]) ? payload["aud"] : [payload["aud"]];
  if (!aud.includes(opts.aud)) throw new Error("bad JWT audience");
  const iss = String(payload["iss"] ?? "").replace(/\/+$/, "");
  if (iss !== opts.teamDomain.replace(/\/+$/, "")) throw new Error("bad JWT issuer");
  const email = String(payload["email"] ?? "");
  if (!email) throw new Error("no email claim");
  return { email };
}

export function emailAllowed(env: Env, email: string): boolean {
  const raw = (env.ADMIN_EMAILS ?? "").trim();
  if (!raw) return true;
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes(email.toLowerCase());
}

/** True when an Access JWT is configured AND present on this request. */
export function accessDetected(env: Env, req: Request): boolean {
  return Boolean((env.ACCESS_TEAM_DOMAIN ?? "").trim() && (env.ACCESS_AUD ?? "").trim() && req.headers.get("cf-access-jwt-assertion"));
}

/**
 * Resolve the admin identity, or null. Accepts, in order:
 *   1. Cloudflare Access JWT (requires ACCESS_TEAM_DOMAIN + ACCESS_AUD)
 *   2. `corx_session` cookie (console login — Access-backed or token-backed)
 *   3. ADMIN_TOKEN bearer (API clients, local dev)
 */
export async function getAdminUser(c: Ctx | Context<{ Bindings: Env }>): Promise<AdminIdentity | null> {
  const env = c.env;
  const team = (env.ACCESS_TEAM_DOMAIN ?? "").trim();
  const aud = (env.ACCESS_AUD ?? "").trim();

  const assertion = c.req.header("cf-access-jwt-assertion");
  if (assertion && team && aud) {
    try {
      const user = await verifyAccessJwt(assertion, { jwks: await getJwks(team), teamDomain: team, aud });
      if (emailAllowed(env, user.email)) return { email: user.email, via: "access" };
      console.warn(`access login denied by allowlist: ${user.email}`);
    } catch (err) {
      console.warn("access jwt rejected:", (err as Error).message);
    }
  }

  const secret = sessionSecret(env);
  if (secret) {
    const sess = getCookie(c as Context, "corx_session");
    if (sess) {
      const s = await verifySession(sess, secret);
      if (s) return { email: s.sub, via: "token" };
    }
    const token =
      c.req.header("authorization")?.replace(/^Bearer\s+/i, "") || c.req.header("x-admin-token") || "";
    if (token && token === env.ADMIN_TOKEN) return { email: "api-token", via: "token" };
  }
  return null;
}

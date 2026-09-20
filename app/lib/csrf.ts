/**
 * CSRF tokens for the console's mutating forms.
 *
 * The session cookie is HttpOnly + SameSite=Lax, which already blocks
 * cross-site form POSTs in current browsers — but that is implicit and
 * browser-dependent, and `Lax` still sends the cookie on a top-level
 * cross-site GET. A signed token rendered into every form makes the guarantee
 * explicit: a request that did not come from a page we served cannot carry it.
 *
 * Stateless: the token is HMAC-SHA256 over the request's session binding,
 * keyed by the session secret (SESSION_SECRET, falling back to ADMIN_TOKEN —
 * the same secret as the session cookie), so nothing is stored server-side
 * and a token stops being valid the moment the session it was issued for does
 * (a new login mints a new cookie, hence a new token).
 *
 * Binding, in order:
 *   - the signed `corx_session` cookie's value, when present;
 *   - the identity an Access JWT authenticated, for Access-only deployments
 *     that never mint a cookie (no ADMIN_TOKEN / SESSION_SECRET).
 * An ADMIN_TOKEN bearer request has neither — it is not a browser session and
 * cannot be CSRF'd, so no token is issued (and none is expected).
 */
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { sessionSecret } from "./session.js";
import type { Env } from "./types.js";

/** Hidden input name in every console form. */
export const CSRF_FIELD = "csrf";
/** Header the console's fetch calls send (playground run). */
export const CSRF_HEADER = "x-corx-csrf";

const SESSION_COOKIE = "corx_session";
const enc = new TextEncoder();

function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(`corx-csrf:v1:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** What this request's token is bound to; null = no browser session. */
export function csrfBinding(c: Context<{ Bindings: Env }>): string | null {
  const cookie = getCookie(c, SESSION_COOKIE);
  if (cookie) return `session:${cookie}`;
  const user = c.get("consoleUser");
  if (user?.email) return `identity:${user.email}`;
  return null;
}

/** Token for one binding. Exported for tests; derive via issueCsrfToken(). */
export async function csrfToken(secret: string, binding: string): Promise<string> {
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(binding)));
  return b64uEncode(sig);
}

/**
 * Token for this request, or null when there is no signing secret or no
 * session to bind to. Consoles render it into every form; the middleware
 * verifies the posted value against a fresh derivation.
 */
export function issueCsrfToken(c: Context<{ Bindings: Env }>): Promise<string | null> {
  const secret = sessionSecret(c.env);
  const binding = csrfBinding(c);
  if (!secret || !binding) return Promise.resolve(null);
  return csrfToken(secret, binding);
}

/** Timing-safe string equality (equal-length fast path; length may leak). */
export function tokensEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a posted token against this request's session. Missing ⇒ false. */
export async function verifyCsrfToken(
  c: Context<{ Bindings: Env }>,
  token: string | null | undefined,
): Promise<boolean> {
  if (!token) return false;
  const expected = await issueCsrfToken(c);
  return expected !== null && tokensEqual(expected, token);
}

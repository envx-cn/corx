/** HMAC-signed session cookie for the SSR console (dev token login). */
export interface Session {
  sub: string;
  exp: number;
  /** How the session was originally issued (Access login vs ADMIN_TOKEN). */
  via?: "access" | "token";
}

import type { Env } from "./types.js";

/**
 * Secret used to sign/verify console session cookies.
 * SESSION_SECRET is preferred; ADMIN_TOKEN is the legacy fallback so existing
 * deployments keep working. Null when neither is configured — Access-only
 * deployments can still log in (the Access JWT is verified per request).
 */
export function sessionSecret(env: Env): string | null {
  return env.SESSION_SECRET ?? env.ADMIN_TOKEN ?? null;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64uDecode(s: string): Uint8Array {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)!;
  return out;
}

function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(`corx-session:v1:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signSession(
  sub: string,
  secret: string,
  ttlSec = 12 * 3600,
  via?: "access" | "token",
): Promise<string> {
  const payload = b64uEncode(
    enc.encode(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + ttlSec, ...(via ? { via } : {}) })),
  );
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)));
  return `${payload}.${b64uEncode(sig)}`;
}

/** Copy into a fresh ArrayBuffer (satisfies strict BufferSource typings). */
function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function verifySession(token: string, secret: string): Promise<Session | null> {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, buf(b64uDecode(sig)), buf(enc.encode(payload)));
    if (!ok) return null;
    const data = JSON.parse(dec.decode(b64uDecode(payload))) as Session;
    if (typeof data.sub !== "string" || typeof data.exp !== "number") return null;
    if (data.via !== undefined && data.via !== "access" && data.via !== "token") return null;
    if (Date.now() / 1000 > data.exp) return null;
    return { sub: data.sub, exp: data.exp, ...(data.via ? { via: data.via } : {}) };
  } catch {
    return null;
  }
}

/**
 * Envelope encryption for injected secret values (`api_keys.vars`).
 *
 * The KEK (key-encryption key) is a deploy secret (`INJECTION_KEK`). It is run
 * through HKDF-SHA256 with a fixed salt/info to derive one AES-256-GCM key per
 * isolate; every value gets its own random 96-bit IV, and the ciphertext is
 * stored as `enc:v1:<base64url(iv || tag || ciphertext)>`. AEAD means a tampered
 * blob fails to decrypt rather than silently decrypting to garbage.
 *
 * Scope: only variable *values* are encrypted. Names, header/query rules and
 * the host allowlist stay readable — the console needs names to render the
 * editor, and the request path needs the rules to know which `${VAR}` to fill.
 *
 * Backward compatibility: a value without the `enc:v1:` prefix is treated as
 * plaintext (rows written before the KEK existed, or before one was set). Those
 * rows keep working, and any save through the console/API re-encrypts them.
 *
 * Tamper/mis-config policy: the request path never throws on stored data, so a
 * value that cannot be decrypted (no KEK, wrong KEK, truncated blob) makes the
 * caller fail **closed** — injection is dropped and the request proceeds with
 * no secrets attached. Edit paths are stricter: they refuse to save rather than
 * overwrite secrets they cannot read.
 */
import { ProxyError } from "./types.js";
import { readStoredInjection } from "../proxy/inject.js";
import type { InjectionRow, InjectionVar } from "../proxy/inject.js";

export const ENC_PREFIX = "enc:v1:";

/** Fixed HKDF salt/info — domain separation, not a secret. */
const HKDF_SALT = "corx:injection:v1";
const HKDF_INFO = "aes-256-gcm";
const IV_BYTES = 12;

let cached: { kek: string; key: CryptoKey } | null = null;

async function deriveKey(kek: string): Promise<CryptoKey> {
  if (cached?.kek === kek) return cached.key;
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(kek), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(HKDF_SALT), info: enc.encode(HKDF_INFO) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  cached = { kek, key };
  return key;
}

function b64uEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64uDecode(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)!;
  return out;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export async function encryptSecret(kek: string, plain: string): Promise<string> {
  const key = await deriveKey(kek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return ENC_PREFIX + b64uEncode(blob);
}

/** Decrypt one value; a plaintext (legacy) value passes through unchanged. */
export async function decryptSecret(kek: string, value: string): Promise<string> {
  if (!isEncrypted(value)) return value;
  const blob = b64uDecode(value.slice(ENC_PREFIX.length));
  if (blob.length <= IV_BYTES) throw new Error("truncated ciphertext");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.subarray(0, IV_BYTES) },
    await deriveKey(kek),
    blob.subarray(IV_BYTES),
  );
  return new TextDecoder().decode(pt);
}

export type DecryptResult = { ok: true; vars: InjectionVar[] } | { ok: false };

/**
 * Encrypt every variable value. No KEK → plaintext passthrough, so local dev
 * and the test suite keep working without a secret configured.
 */
export async function encryptVars(kek: string | undefined, vars: InjectionVar[]): Promise<InjectionVar[]> {
  if (!kek || vars.length === 0) return vars;
  return Promise.all(vars.map(async (v) => ({ name: v.name, value: await encryptSecret(kek, v.value) })));
}

/**
 * Decrypt every variable value. `ok:false` means at least one value is
 * encrypted and cannot be read with the given KEK — the caller must fail
 * closed, never forward the ciphertext (or half a key) upstream.
 */
export async function decryptVars(kek: string | undefined, vars: InjectionVar[]): Promise<DecryptResult> {
  if (vars.length === 0) return { ok: true, vars };
  if (!kek) return vars.some((v) => isEncrypted(v.value)) ? { ok: false } : { ok: true, vars };
  try {
    const out = await Promise.all(vars.map(async (v) => ({ name: v.name, value: await decryptSecret(kek, v.value) })));
    return { ok: true, vars: out };
  } catch {
    return { ok: false };
  }
}

/**
 * Decrypt a key row's injected variables in place, for the paths that execute
 * a request (apiKeyMiddleware, the console playground). On failure injection is
 * dropped entirely — fail closed is the only safe answer for secrets.
 */
export async function decryptRowInjection<T extends InjectionRow>(kek: string | undefined, row: T): Promise<T> {
  const parts = readStoredInjection(row);
  if (parts.vars.length === 0) return row;
  const res = await decryptVars(kek, parts.vars);
  if (!res.ok) {
    console.error("corx: injected variables could not be decrypted — dropping injection (check INJECTION_KEK)");
    return { ...row, vars: "[]", header_rules: "[]", param_rules: "[]" };
  }
  return { ...row, vars: JSON.stringify(res.vars) };
}

/**
 * Decrypt for an edit-merge. Unlike the request path this throws (400) when
 * stored values cannot be read: overwriting secrets the admin cannot see would
 * silently destroy them.
 */
export async function decryptVarsForEdit(kek: string | undefined, vars: InjectionVar[]): Promise<InjectionVar[]> {
  const res = await decryptVars(kek, vars);
  if (!res.ok) {
    throw new ProxyError(
      400,
      "Stored variables cannot be decrypted with the current INJECTION_KEK — restore the matching key or re-enter the values",
    );
  }
  return res.vars;
}

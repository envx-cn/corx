import { sha256Hex } from "./utils.js";

/** Hash an API key with SHA-256 (hex). Never store raw keys. */
export function hashKey(raw: string): Promise<string> {
  return sha256Hex(`corx:v1:${raw}`);
}

/** New random API key in `corx_...` format (uses Web Crypto). */
export function newRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `corx_${b64}`;
}

/** Pull a key from `x-api-key`, `Authorization: Bearer`, or `?key=`. */
export function extractRawKey(req: Request, url: URL): string | null {
  const header = req.headers.get("x-api-key");
  if (header?.trim()) return header.trim();
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const q = url.searchParams.get("key");
  if (q?.trim()) return q.trim();
  return null;
}

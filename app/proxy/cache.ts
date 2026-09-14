import type { CachedEntry, Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { sha256Hex, num } from "../lib/utils.js";

const PREFIX = "corx/v1/";

/** Headers that must never be served from / stored into cache. */
const EXCLUDED = new Set([
  "set-cookie",
  "authorization",
  "proxy-authenticate",
  "www-authenticate",
  "content-length",
  "transfer-encoding",
  "connection",
]);

function pickCacheable(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!EXCLUDED.has(k)) out[k] = value;
  });
  return out;
}

export async function cacheKeyForUrl(target: string): Promise<string> {
  return PREFIX + (await sha256Hex(`GET:${target}`));
}

export function ttlSeconds(
  env: Env,
  reqUrl: URL,
  keyRow?: { cache_ttl?: number | null; tier?: string | null } | null,
): number {
  const cap = num(env.CACHE_TTL_SECONDS, 3600);
  const stored =
    typeof keyRow?.cache_ttl === "number" &&
    Number.isFinite(keyRow.cache_ttl) &&
    keyRow.cache_ttl >= 0 &&
    keyRow.cache_ttl <= 86400
      ? keyRow.cache_ttl
      : null;
  // Public tier: the instance owns the cache policy (the handler rejects ?ttl),
  // and entries default to a short TTL so a shared cache turns over quickly.
  if (keyRow?.tier === "public") return stored ?? num(env.PUBLIC_CACHE_TTL_SECONDS, 300);
  // A per-request ?ttl= can only shorten — never lengthen beyond the global
  // default — so anonymous callers can't pin a public cache entry for 24h.
  const rawTtl = reqUrl.searchParams.get("ttl");
  if (rawTtl !== null) {
    const override = Number(rawTtl);
    if (Number.isFinite(override) && override >= 0 && override <= 86400) return Math.min(override, cap);
  }
  return stored ?? cap;
}

export type KeyCachePolicy = Pick<
  { cache_ttl: number | null; no_cache: number; header_rules?: string | null },
  "cache_ttl" | "no_cache" | "header_rules"
>;

export function shouldBypassCache(req: Request, reqUrl: URL, keyRow?: KeyCachePolicy | null): boolean {
  if (req.method !== "GET") return true;
  if (keyRow?.no_cache) return true;
  // Injected headers make the upstream response caller/key-specific (and may
  // carry credentials), so that key never reads or writes the shared cache.
  if (keyRow?.header_rules && keyRow.header_rules !== "[]") return true;
  // Media seeking: a Range request must reach upstream, never be served a full cached body.
  if (req.headers.has("range")) return true;
  // Authenticated requests must never be cached or served from cache: the key
  // is the URL only, so user-specific (Authorization/Cookie) responses would
  // leak across callers. See handler.ts for the same rule on the write side.
  if (req.headers.has("authorization") || req.headers.has("cookie")) return true;
  if (reqUrl.searchParams.get("no-cache") === "1") return true;
  if (req.headers.get("cache-control")?.includes("no-cache")) return true;
  return false;
}

/**
 * Validate + normalize a cache TTL for storage. "" → null (inherit global).
 * 0 = never store for this key. Throws ProxyError(400) on invalid input.
 */
export function normalizeCacheTtlInput(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 86400) {
    throw new ProxyError(400, "Cache TTL must be an integer 0–86400 seconds (blank = global)");
  }
  return n;
}

/** Max upstream body we will buffer (R2 values + Worker memory). Above this we stream. */
export const CACHE_MAX_BYTES = 5 * 1024 * 1024;

/** Cache-Control directives that mean "don't store this response". */
const NO_STORE_RE = /\b(no-store|private|no-cache|must-revalidate|max-age=0)\b/i;

/** Vary tokens that make a response body caller-dependent → unsafe to share. */
const VARY_BLACKLIST = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cookie",
  "authorization",
  "user-agent",
  "host",
  "referer",
  "x-forwarded-for",
  "negotiate",
  "*",
]);

/**
 * A response is only cacheable when upstream says it is: honor Cache-Control
 * (private/no-store/no-cache…) and skip responses whose Vary makes the body
 * caller-dependent (we key the cache on the URL alone).
 */
export function responseCacheable(res: Response): boolean {
  const cc = res.headers.get("cache-control") ?? "";
  if (NO_STORE_RE.test(cc)) return false;
  const vary = (res.headers.get("vary") ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  if (vary.some((v) => v !== "" && VARY_BLACKLIST.has(v))) return false;
  return true;
}

export type BoundedBody = { bytes: Uint8Array<ArrayBuffer> } | { stream: ReadableStream<Uint8Array> };

/**
 * Read a response stream up to `cap` bytes. Fits → `{ bytes }` (exact-size
 * copy, safe to cache). Overflow → `{ stream }` re-emitting the consumed
 * chunks followed by the rest, so arbitrarily large bodies never OOM.
 */
export async function readBounded(body: ReadableStream<Uint8Array> | null, cap: number): Promise<BoundedBody> {
  if (!body) return { bytes: new Uint8Array(0) };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      const out = new Uint8Array(total);
      let off = 0;
      for (const ch of chunks) {
        out.set(ch, off);
        off += ch.byteLength;
      }
      return { bytes: out };
    }
    chunks.push(value);
    total += value.byteLength;
    if (total > cap) {
      const head = chunks.splice(0);
      return {
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            for (const ch of head) controller.enqueue(ch);
          },
          async pull(controller) {
            const r = await reader.read();
            if (r.done) controller.close();
            else controller.enqueue(r.value);
          },
          cancel() {
            reader.cancel().catch(() => undefined);
          },
        }),
      };
    }
  }
}

export async function getCached(bucket: R2Bucket, key: string): Promise<CachedEntry | null> {
  const obj = await bucket.get(key);
  if (!obj) return null;
  const expiresAt = Number(obj.customMetadata?.["expiresAt"] ?? 0);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    await bucket.delete(key).catch(() => undefined);
    return null;
  }
  const body = await obj.arrayBuffer();
  return {
    status: Number(obj.customMetadata?.["status"] ?? 200),
    headers: JSON.parse(obj.customMetadata?.["headers"] ?? "{}") as Record<string, string>,
    body,
    storedAt: Number(obj.customMetadata?.["storedAt"] ?? 0),
    expiresAt,
  };
}

export async function putCached(
  bucket: R2Bucket,
  key: string,
  res: Response,
  body: ArrayBuffer | Uint8Array,
  ttlSecs: number,
): Promise<void> {
  if (ttlSecs <= 0) return;
  // Only cache small successful GETs.
  if (res.status !== 200) return;
  if (body.byteLength > CACHE_MAX_BYTES) return;
  const now = Date.now();
  await bucket.put(key, body, {
    httpMetadata: { contentType: res.headers.get("content-type") ?? "application/octet-stream" },
    customMetadata: {
      status: String(res.status),
      headers: JSON.stringify(pickCacheable(res.headers)),
      storedAt: String(now),
      expiresAt: String(now + ttlSecs * 1000),
    },
  });
}

export function cachedResponse(entry: CachedEntry): Response {
  const headers = new Headers(entry.headers);
  headers.set("X-Corx-Cache", "HIT");
  return new Response(entry.body, { status: entry.status, headers });
}

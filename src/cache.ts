import type { CachedEntry, Env } from "./types.js";
import { sha256Hex, num } from "./utils.js";

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

export function ttlSeconds(env: Env, reqUrl: URL): number {
  const override = Number(reqUrl.searchParams.get("ttl"));
  if (Number.isFinite(override) && override >= 0 && override <= 86400) return override;
  return num(env.CACHE_TTL_SECONDS, 3600);
}

export function shouldBypassCache(req: Request, reqUrl: URL): boolean {
  if (req.method !== "GET") return true;
  // Media seeking: a Range request must reach upstream, never be served a full cached body.
  if (req.headers.has("range")) return true;
  if (reqUrl.searchParams.get("no-cache") === "1") return true;
  if (req.headers.get("cache-control")?.includes("no-cache")) return true;
  return false;
}

/** Max upstream body we will buffer (R2 values + Worker memory). Above this we stream. */
export const CACHE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * True when the upstream response may be buffered for the R2 cache.
 * Everything else (large files, video/audio streams, Range/206, unknown
 * length) is streamed straight through so media seeking works.
 */
export function isBufferable(bypass: boolean, method: string, status: number, contentLength: number): boolean {
  return (
    method === "GET" &&
    !bypass &&
    status === 200 &&
    Number.isFinite(contentLength) &&
    contentLength >= 0 &&
    contentLength <= CACHE_MAX_BYTES
  );
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
  body: ArrayBuffer,
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

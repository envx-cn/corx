import type { CachedEntry, Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import { sha256Hex, num } from "../lib/utils.js";
import { hasControl, readControl } from "../lib/control.js";

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
  // `Age` and `Date` describe the *origin's* response, not corx's copy of it.
  // Replaying them on a HIT made a downstream cache compute freshness from a
  // timestamp that was already stale on the first read; corx generates its own
  // from the entry's residency instead (see `cachedResponse`).
  "age",
  "date",
]);

function pickCacheable(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (!EXCLUDED.has(k)) out[k] = value;
  });
  return out;
}

/**
 * Cache key for a GET. `fingerprint` is the resolved form of everything that
 * changes the response without changing the URL: the key's response header
 * rules (see inject.ts → `responseRulesFingerprint`) and the body transforms
 * (transform.ts → `transformFingerprint`). Two callers whose rules or
 * transforms differ must not share an entry — one key's stripped
 * `X-Frame-Options` or re-encoded body must never be served as another's.
 * Empty (no rules, no transforms) keeps the historical key shape.
 */
export async function cacheKeyForUrl(target: string, fingerprint = ""): Promise<string> {
  const material = fingerprint ? `GET:${target}\nresponse:${fingerprint}` : `GET:${target}`;
  return PREFIX + (await sha256Hex(material));
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
  // Public tier: the instance owns the cache policy (the handler rejects corx-ttl),
  // and entries default to a short TTL so a shared cache turns over quickly.
  if (keyRow?.tier === "public") return stored ?? num(env.PUBLIC_CACHE_TTL_SECONDS, 300);
  // A per-request ?corx-ttl= can only shorten — never lengthen beyond the global
  // default — so anonymous callers can't pin a public cache entry for 24h.
  const rawTtl = readControl(reqUrl, "ttl");
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
  // POST/PUT/… never read or write the cache (only GETs are stored). HEAD may
  // *read* it: a revalidation or a link probe against a hot URL should not cost
  // an upstream fetch, and the GET's headers are exactly what HEAD must
  // return — with no body.
  if (req.method !== "GET" && req.method !== "HEAD") return true;
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
  if (readControl(reqUrl, "no-cache") === "1") return true;
  // JSONP wraps the body per-caller (the callback name is in the response), so
  // it must never read or write an entry keyed on the URL alone.
  if (hasControl(reqUrl, "callback")) return true;
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
 * Content types that are semantically unbounded streams: the body only ends
 * when the client disconnects (SSE, MJPEG). They must stream chunk-by-chunk,
 * so they are never cacheable — buffering one would hold every event until the
 * stream closed (or the cache cap filled), which for an open connection means
 * the client sees nothing at all.
 *
 * This cannot rely on upstream `Cache-Control`: an SSE endpoint that omits it
 * is still an SSE endpoint. Most LLM APIs send `no-cache` on their streaming
 * responses, but not all of them do.
 */
const UNBOUNDED_STREAM_RE = /^\s*(text\/event-stream|multipart\/x-mixed-replace)\b/i;

/**
 * A response is only cacheable when upstream says it is: honor Cache-Control
 * (private/no-store/no-cache…), never buffer an unbounded stream, and skip
 * responses whose Vary makes the body caller-dependent (we key the cache on
 * the URL alone).
 */
export function responseCacheable(res: Response): boolean {
  if (UNBOUNDED_STREAM_RE.test(res.headers.get("content-type") ?? "")) return false;
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
    // Read-time expiry only reclaims a URL somebody asks for again; the cron
    // sweep below is what actually bounds the bucket (see `pruneExpiredCache`).
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

export function cachedResponse(entry: CachedEntry, opts: { body?: boolean } = {}): Response {
  const headers = new Headers(entry.headers);
  headers.set("X-Corx-Cache", "HIT");
  // RFC 9111 §5.1: a cache reports the entry's current age. Ours is the time
  // since we stored it (never past its TTL), and `Date` is stamped fresh —
  // the origin's own `Age`/`Date` are never stored (see EXCLUDED).
  const ttl = Math.max(0, entry.expiresAt - entry.storedAt);
  headers.set("age", String(Math.min(Math.floor((Date.now() - entry.storedAt) / 1000), Math.floor(ttl / 1000))));
  headers.set("date", new Date().toUTCString());
  // A HEAD served from the cache carries the GET's headers with no body.
  if (opts.body === false) headers.delete("content-length");
  return new Response(opts.body === false ? null : entry.body, { status: entry.status, headers });
}

/** `W/"x"` → `"x"` — weak comparison (RFC 9110 §8.8.3.2). */
function bareTag(tag: string): string {
  return tag.trim().replace(/^W\//i, "");
}

/**
 * Does the caller's `If-None-Match` select this entry's entity tag?
 *
 * Weak comparison, comma-separated list, and `*` matching any existing
 * representation — the same rules a browser uses when it revalidates a cached
 * response, which is exactly the request that used to cost a full body.
 */
export function etagMatches(ifNoneMatch: string | null, etag: string | null | undefined): boolean {
  if (!ifNoneMatch) return false;
  if (!etag) return false;
  const header = ifNoneMatch.trim();
  if (header === "*") return true;
  const target = bareTag(etag);
  return header.split(",").some((candidate) => bareTag(candidate) === target);
}

/**
 * True when the caller's validators say the cached entry is still good
 * (RFC 9110 §13.1.3: `If-None-Match` wins; `If-Modified-Since` is only
 * consulted when there is no `If-None-Match`). The entry must be a cache HIT
 * that already carries its own stored validators.
 */
export function entryNotModified(req: Request, entry: CachedEntry): boolean {
  const inm = req.headers.get("if-none-match");
  if (inm !== null) return etagMatches(inm, entry.headers["etag"]);
  const ims = req.headers.get("if-modified-since");
  if (!ims) return false;
  const lastModified = entry.headers["last-modified"];
  if (!lastModified) return false;
  const since = Date.parse(ims);
  const modified = Date.parse(lastModified);
  if (!Number.isFinite(since) || !Number.isFinite(modified)) return false;
  // HTTP dates have second resolution: compare truncated to seconds.
  return Math.floor(modified / 1000) <= Math.floor(since / 1000);
}

/** A `304` for a cache HIT: the stored validators, no body, no length. */
export function notModifiedResponse(entry: CachedEntry): Response {
  const headers = new Headers(entry.headers);
  headers.set("X-Corx-Cache", "HIT");
  headers.set("age", String(Math.min(Math.floor((Date.now() - entry.storedAt) / 1000), Math.floor(Math.max(0, entry.expiresAt - entry.storedAt) / 1000))));
  headers.set("date", new Date().toUTCString());
  // A 304 has no body, so it must not advertise one (RFC 9110 §15.4.5 lists
  // the headers a 304 may carry; content-length is not among them).
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(null, { status: 304, headers });
}

/** Objects inspected per `list` call during a prune sweep. */
export const PRUNE_PAGE_SIZE = 1000;

/** Pages one cron run may walk (10 × 1000 = 10k keys). `list` is an R2 Class A
 * op, so the budget is what keeps the nightly sweep inside the free tier
 * (1M Class A/month) while still clearing a bucket an order of magnitude
 * larger than the page size in a couple of nights. */
export const PRUNE_PAGE_BUDGET = 10;

/**
 * Delete expired cache objects, walking the prefix page by page.
 *
 * R2 `list` returns keys in lexicographic order behind a cursor, and cache keys
 * are `corx/v1/<sha256>` — i.e. random order. A single `list({ limit })` call
 * therefore only ever sees the first page, so an expired object further down
 * would not become visible until everything before it had been deleted; with a
 * long tail of one-shot URLs the bucket grew without bound and only read-time
 * expiry (`getCached`) reclaimed anything, i.e. only URLs requested again.
 *
 * The sweep always starts at the beginning of the prefix, which is unbiased:
 * expiry is uncorrelated with key order, and every deleted key shifts the next
 * page forward, so consecutive runs make progress. `pageBudget` caps the work
 * (and the Class A spend) of a single run; whatever is left is picked up the
 * next night. Non-fatal by contract — a failed list or delete is skipped, never
 * thrown, because cache housekeeping must not fail the cron.
 */
export async function pruneExpiredCache(
  bucket: R2Bucket,
  opts: { pageSize?: number; pageBudget?: number; now?: number } = {},
): Promise<{ scanned: number; deleted: number; pages: number }> {
  const pageSize = opts.pageSize ?? PRUNE_PAGE_SIZE;
  const pageBudget = opts.pageBudget ?? PRUNE_PAGE_BUDGET;
  const now = opts.now ?? Date.now();
  let cursor: string | undefined;
  let scanned = 0;
  let deleted = 0;
  let pages = 0;
  for (let page = 0; page < pageBudget; page++) {
    let listed: R2Objects;
    try {
      listed = await bucket.list({ prefix: PREFIX, limit: pageSize, cursor });
    } catch {
      break; // bucket-level trouble (permissions, outage): stop the sweep
    }
    pages++;
    scanned += listed.objects.length;
    const expired = listed.objects.filter((obj) => {
      const expiresAt = Number(obj.customMetadata?.["expiresAt"] ?? 0);
      return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < now;
    });
    // A delete that fails is skipped, never thrown: housekeeping must not
    // abort the rest of the sweep (the entry is simply reclaimed next run).
    await Promise.all(expired.map((obj) => bucket.delete(obj.key).catch(() => undefined)));
    deleted += expired.length;
    // No cursor means we saw the end of the prefix.
    if (!listed.truncated || !listed.cursor) break;
    cursor = listed.cursor;
  }
  return { scanned, deleted, pages };
}

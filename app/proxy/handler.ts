import type { Context } from "hono";
import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { validateTargetUrl, checkDbBlocklist } from "./guard.js";
import { resolveRawTarget } from "./subdomain.js";
import { assertPublicHost } from "./dns-check.js";
import {
  getCached,
  putCached,
  cacheKeyForUrl,
  ttlSeconds,
  shouldBypassCache,
  cachedResponse,
  readBounded,
  responseCacheable,
  CACHE_MAX_BYTES,
} from "./cache.js";
import { checkRateLimit } from "./ratelimit.js";
import { logRequest } from "../lib/db.js";
import { num, clientIp } from "../lib/utils.js";

/** Hop-by-hop / sensitive headers stripped before forwarding upstream. */
const STRIP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "origin", // proxy's origin, not the browser's
  "referer",
  "cf-connecting-ip",
  "cf-ipcountry",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  // Ask upstreams for identity (uncompressed) bodies: we strip content-encoding
  // on buffered responses, and streaming gzip through the dev server / workers
  // edge is a double-encoding hazard. Media streams unaffected (already
  // compressed); correctness over transfer size.
  "accept-encoding",
]);

const STRIP_RESPONSE = new Set([
  "content-encoding", // we buffer the body; avoid double-decoding issues
  "content-length",
  "transfer-encoding",
  "connection",
  "set-cookie", // don't leak upstream cookies cross-origin
]);

/** Minimal strip set for streamed responses: Range/206 + media metadata survive. */
const STREAM_STRIP_RESPONSE = new Set([
  "content-encoding", // runtimes decompress the body (and miniflare keeps the
  // header) — never pair an encoding header with already-decoded bytes.
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "set-cookie", // don't leak upstream cookies cross-origin
]);

/**
 * Wrap a stream and count the bytes actually delivered, then call onDone.
 * Used for streamed (uncached) responses so the request log reflects real
 * bytes + real end-to-end latency (client disconnects included), instead of
 * being recorded at response-header time.
 */
function countStream(
  body: ReadableStream<Uint8Array>,
  onDone: (bytes: number) => void,
): ReadableStream<Uint8Array> {
  let bytes = 0;
  let done = false;
  const finish = (n: number) => {
    if (done) return;
    done = true;
    onDone(n);
  };
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done: eof, value } = await reader.read();
        if (eof) {
          controller.close();
          finish(bytes);
          return;
        }
        bytes += value.byteLength;
        controller.enqueue(value);
      } catch (err) {
        controller.error(err);
        finish(bytes);
      }
    },
    cancel() {
      reader.cancel().catch(() => undefined);
      finish(bytes);
    },
  });
}

/** Main proxy handler shared by /fetch, /proxy/*, /https://... */
export async function proxyHandler(c: Context<{ Bindings: Env; Variables: ProxyVariables }>) {
  const started = Date.now();
  const reqUrl = new URL(c.req.url);
  const ip = clientIp(c.req.raw);
  const country = c.req.header("cf-ipcountry") ?? "";
  let target = "";
  let host = "";
  let apiKeyId: string | null = null;
  let cached = false;
  let reqBytes = c.req.method === "GET" || c.req.method === "HEAD" ? reqUrl.toString().length : 0;
  let resBytes: number | null = null;

  const finish = (status: number | null, error = "") => {
    c.executionCtx.waitUntil(
      logRequest(c.env.DB, {
        method: c.req.method,
        targetUrl: target,
        targetHost: host,
        status,
        latencyMs: Date.now() - started,
        clientIp: ip,
        country,
        apiKeyId,
        cached,
        error,
        reqBytes,
        resBytes,
      }),
    );
  };

  try {
    const { target: rawTarget, viaSubdomain } = resolveRawTarget(reqUrl, c.env);
    const url = validateTargetUrl(rawTarget);
    target = url.toString();
    host = url.hostname;
    // SSRF: literal checks (above) + DNS-resolved IP check + admin blocklist.
    // Blocklist runs even on cache hits — we must not serve cached content of
    // a host that got blocked after the fact.
    await assertPublicHost(host);
    await checkDbBlocklist(c.env.DB, host);

    // Auth: optional unless REQUIRE_API_KEY=true (key resolved by apiKeyMiddleware).
    const row = c.get("apiKey");
    apiKeyId = row?.id ?? null;
    if ((c.env.REQUIRE_API_KEY ?? "false").toLowerCase() === "true" && !apiKeyId) {
      throw new ProxyError(401, "Valid API key required (X-Api-Key, Authorization: Bearer, or ?key=)");
    }

    // R2 cache for GET. Runs BEFORE the rate limit so cheap cache hits don't
    // burn D1 writes/reads (and don't consume the caller's quota).
    const bypass = shouldBypassCache(c.req.raw, reqUrl, row);
    let cacheKey: string | null = null;
    if (!bypass) {
      try {
        cacheKey = await cacheKeyForUrl(target);
        const hit = await getCached(c.env.CACHE_BUCKET, cacheKey);
        if (hit) {
          cached = true;
          resBytes = hit.body.byteLength;
          finish(hit.status);
          const res = cachedResponse(hit);
          res.headers.set("X-Corx-Target", host);
          res.headers.set("X-Corx-Latency-Ms", String(Date.now() - started));
          return res;
        }
      } catch {
        // cache errors are non-fatal
      }
    }

    // Rate limit per key (or per IP for anonymous) — cache misses only.
    const bucket = `rl:${apiKeyId ?? `ip:${ip || "unknown"}`}`;
    const { limit, remaining } = await checkRateLimit(c.env.DB, c.env, bucket, row?.rate_limit_per_min);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    // Build upstream request.
    const timeoutMs = num(c.env.TIMEOUT_MS, 30_000);
    const maxBody = num(c.env.MAX_BODY_BYTES, 10 * 1024 * 1024);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const outHeaders = new Headers();
      c.req.raw.headers.forEach((value, key) => {
        if (!STRIP_REQUEST.has(key.toLowerCase())) outHeaders.set(key, value);
      });
      outHeaders.set("X-Forwarded-For", ip);
      outHeaders.set("X-Proxied-By", "corx");
      // Ask upstreams for identity bodies: runtimes decompress fetch() bodies
      // themselves, so a Content-Encoding header upstream is a double-encoding
      // hazard downstream (browsers decode it again).
      outHeaders.set("accept-encoding", "identity");

      let body: BodyInit | undefined;
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        const buf = await c.req.raw.arrayBuffer().catch(() => null);
        if (buf && buf.byteLength > maxBody) {
          throw new ProxyError(413, `Request body too large (>${maxBody} bytes)`);
        }
        reqBytes = buf?.byteLength ?? 0;
        body = buf ?? undefined;
      }

      let upstream: Response;
      try {
        // One retry on transient network errors (fetch failed). The shared
        // AbortController keeps the total time bounded by timeoutMs, and the
        // body buffer is reusable, so a re-sent POST is safe.
        const attempt = (): Promise<Response> =>
          fetch(url.toString(), {
            method: c.req.method,
            headers: outHeaders,
            body,
            signal: controller.signal,
            redirect: "follow",
          });
        try {
          upstream = await attempt();
        } catch (err) {
          if ((err as Error)?.name === "AbortError") throw err;
          await new Promise((r) => setTimeout(r, 300));
          upstream = await attempt();
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw new ProxyError(504, "Upstream timed out");
        throw new ProxyError(502, `Upstream fetch failed: ${(err as Error)?.message ?? "unknown"}`);
      }

      // Stream helper: minimal header stripping so Range/206 + media metadata survive.
      // res_bytes/latency are recorded by countStream when the body finishes
      // (or the client disconnects), not at header time.
      const streamIt = (body: ReadableStream<Uint8Array> | null) => {
        const streamHeaders = new Headers();
        upstream.headers.forEach((value, key) => {
          if (!STREAM_STRIP_RESPONSE.has(key.toLowerCase())) streamHeaders.set(key, value);
        });
        streamHeaders.set("X-Corx-Cache", "MISS");
        streamHeaders.set("X-Corx-Target", host);
        streamHeaders.set("X-Corx-Latency-Ms", String(Date.now() - started));
        if (!body) {
          resBytes = null;
          finish(upstream.status);
          return new Response(null, { status: upstream.status, headers: streamHeaders });
        }
        return new Response(countStream(body, (bytes) => {
          resBytes = bytes;
          finish(upstream.status);
        }), { status: upstream.status, headers: streamHeaders });
      };

      // Non-cacheable responses (Range/206, non-GET, bypassed, no-store/private,
      // vary-dependent) stream untouched — no OOM, no wrong cache sharing.
      const cacheable = c.req.method === "GET" && !bypass && upstream.status === 200 && responseCacheable(upstream);
      const contentLength = Number(upstream.headers.get("content-length") ?? NaN);

      // Known-huge bodies stream without ever buffering.
      if (!cacheable || (Number.isFinite(contentLength) && contentLength > CACHE_MAX_BYTES)) {
        return streamIt(upstream.body);
      }

      // Bounded read: small/chunked bodies buffer for the R2 cache;
      // overflow re-emits everything as a stream (no OOM).
      const bounded = await readBounded(upstream.body, CACHE_MAX_BYTES);
      if ("stream" in bounded) return streamIt(bounded.stream);

      const resBody = bounded.bytes;
      resBytes = resBody.byteLength;
      const resHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (!STRIP_RESPONSE.has(key.toLowerCase())) resHeaders.set(key, value);
      });
      // Keep redirects inside the proxy in subdomain mode (relative Location
      // resolves against the proxy host, not the target).
      if (viaSubdomain) {
        const loc = resHeaders.get("location");
        if (loc) {
          try {
            const abs = new URL(loc, url.toString());
            if (abs.origin === url.origin) {
              resHeaders.set("location", abs.pathname + abs.search + abs.hash);
            }
          } catch {
            /* keep original Location */
          }
        }
      }
      resHeaders.set("X-Corx-Cache", "MISS");
      resHeaders.set("X-Corx-Target", host);
      resHeaders.set("X-Corx-Latency-Ms", String(Date.now() - started));

      // Store the GET 200 in R2 (fire-and-forget) — only when upstream allows it.
      if (cacheable && cacheKey) {
        const ttl = ttlSeconds(c.env, reqUrl, row);
        c.executionCtx.waitUntil(putCached(c.env.CACHE_BUCKET, cacheKey, upstream, resBody, ttl).catch(() => undefined));
      }

      finish(upstream.status);
      return new Response(resBody, { status: upstream.status, headers: resHeaders });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const status = err instanceof ProxyError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal error";
    finish(status, message);
    return c.json({ error: message }, status as 400);
  }
}

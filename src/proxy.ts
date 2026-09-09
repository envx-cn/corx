import type { Context } from "hono";
import type { ApiKeyRow, Env } from "./types.js";
import { ProxyError } from "./types.js";
import { hashKey, extractRawKey } from "./auth.js";
import { validateTargetUrl, checkDbBlocklist } from "./guard.js";
import { resolveRawTarget } from "./subdomain.js";
import { getCached, putCached, cacheKeyForUrl, ttlSeconds, shouldBypassCache, cachedResponse, isBufferable } from "./cache.js";
import { checkRateLimit } from "./ratelimit.js";
import { logRequest } from "./db.js";
import { num, clientIp } from "./utils.js";

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
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "set-cookie", // don't leak upstream cookies cross-origin
]);

interface ResolvedKey {
  id: string | null;
  row: ApiKeyRow | null;
}

async function resolveApiKey(c: Context<{ Bindings: Env }>, reqUrl: URL): Promise<ResolvedKey> {
  const raw = extractRawKey(c.req.raw, reqUrl);
  if (!raw) return { id: null, row: null };
  try {
    const row = await c.env.DB.prepare(
      "SELECT id, key_hash, name, rate_limit_per_min, created_at, revoked_at FROM api_keys WHERE key_hash = ?",
    )
      .bind(await hashKey(raw))
      .first<ApiKeyRow>();
    if (!row || row.revoked_at) return { id: null, row: null };
    return { id: row.id, row };
  } catch {
    return { id: null, row: null };
  }
}

/** Main proxy handler shared by /fetch, /proxy/*, /https://... */
export async function proxyHandler(c: Context<{ Bindings: Env }>) {
  const started = Date.now();
  const reqUrl = new URL(c.req.url);
  const ip = clientIp(c.req.raw);
  const country = c.req.header("cf-ipcountry") ?? "";
  let target = "";
  let host = "";
  let apiKeyId: string | null = null;
  let cached = false;

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
      }),
    );
  };

  try {
    const { target: rawTarget, viaSubdomain } = resolveRawTarget(reqUrl, c.env);
    const url = validateTargetUrl(rawTarget);
    target = url.toString();
    host = url.hostname;
    await checkDbBlocklist(c.env.DB, host);

    // Auth: optional unless REQUIRE_API_KEY=true.
    const { id, row } = await resolveApiKey(c, reqUrl);
    apiKeyId = id;
    if ((c.env.REQUIRE_API_KEY ?? "false").toLowerCase() === "true" && !id) {
      throw new ProxyError(401, "Valid API key required (X-Api-Key, Authorization: Bearer, or ?key=)");
    }

    // Rate limit per key (or per IP for anonymous).
    const bucket = `rl:${id ?? `ip:${ip || "unknown"}`}`;
    const { limit, remaining } = await checkRateLimit(c.env.DB, c.env, bucket, row?.rate_limit_per_min);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));

    // R2 cache for GET.
    const bypass = shouldBypassCache(c.req.raw, reqUrl);
    const cacheKey = await cacheKeyForUrl(target);
    if (!bypass) {
      try {
        const hit = await getCached(c.env.CACHE_BUCKET, cacheKey);
        if (hit) {
          cached = true;
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

      let body: BodyInit | undefined;
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        const buf = await c.req.raw.arrayBuffer().catch(() => null);
        if (buf && buf.byteLength > maxBody) {
          throw new ProxyError(413, `Request body too large (>${maxBody} bytes)`);
        }
        body = buf ?? undefined;
      }

      let upstream: Response;
      try {
        upstream = await fetch(url.toString(), {
          method: c.req.method,
          headers: outHeaders,
          body,
          signal: controller.signal,
          redirect: "follow",
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw new ProxyError(504, "Upstream timed out");
        throw new ProxyError(502, `Upstream fetch failed: ${(err as Error)?.message ?? "unknown"}`);
      }

      // Large / media / Range responses stream straight through (no buffering,
      // so multi-GB video and seeking work within Worker memory limits).
      const contentLength = Number(upstream.headers.get("content-length") ?? NaN);
      if (!isBufferable(bypass, c.req.method, upstream.status, contentLength)) {
        const streamHeaders = new Headers();
        upstream.headers.forEach((value, key) => {
          if (!STREAM_STRIP_RESPONSE.has(key.toLowerCase())) streamHeaders.set(key, value);
        });
        streamHeaders.set("X-Corx-Cache", "MISS");
        streamHeaders.set("X-Corx-Target", host);
        streamHeaders.set("X-Corx-Latency-Ms", String(Date.now() - started));
        finish(upstream.status);
        return new Response(upstream.body, { status: upstream.status, headers: streamHeaders });
      }

      const resBody = await upstream.arrayBuffer();
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

      // Store GET 200s in R2 (fire-and-forget).
      if (c.req.method === "GET" && !bypass && upstream.status === 200) {
        const ttl = ttlSeconds(c.env, reqUrl);
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

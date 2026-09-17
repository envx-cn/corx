import type { Context } from "hono";
import type { Env } from "../lib/types.js";
import { ProxyError } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { normalizeOrigin } from "../lib/auth.js";
import { assertKnownControlParams, hasControl } from "../lib/control.js";
import { validateTargetUrl, checkDbBlocklist } from "./guard.js";
import { resolveRawTarget } from "./subdomain.js";
import { assertPublicHost } from "./dns-check.js";
import { JSONP_MAX_BYTES, isJsonContentType, jsonpCallback, jsonpHeaders, wrapJsonp } from "./jsonp.js";
import {
  applyTextTransforms,
  isTextualContentType,
  isTransforming,
  readTextTransforms,
  transformFingerprint,
} from "./transform.js";
import {
  applyHeaderRules,
  applyParamRules,
  assertHostAllowed,
  effectiveInjection,
  hasInjection,
  hostAllowed,
  responseRulesFingerprint,
  varMap,
} from "./inject.js";
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
import { checkPublicQuota, quotaHeaders } from "./quota.js";
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
  // The caller's corx credentials belong to this proxy, never to the target:
  // forwarding them would leak the key to whatever host the caller names.
  "x-api-key",
  "x-admin-token",
  // Ask upstreams for identity (uncompressed) bodies: we strip content-encoding
  // on buffered responses, and streaming gzip through the dev server / workers
  // edge is a double-encoding hazard. Media streams unaffected (already
  // compressed); correctness over transfer size.
  "accept-encoding",
]);

/** Credentials a redirect must not carry to a different origin (fetch spec
 * drops Authorization; we also drop the proxy key and cookies). */
const DROP_ON_CROSS_ORIGIN = new Set(["authorization", "cookie", "x-api-key"]);

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

const MAX_REDIRECTS = 5;

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
  const authVia = c.get("authVia") ?? "";
  const origin = c.req.header("origin") ?? "";
  // Keyless callers may be identified by Referer alone (same-origin GETs, no-cors
  // embeds), so quota and logs use whatever the auth layer matched on — one
  // caller, one bucket. `origin` stays raw: CORS echo semantics need the header.
  const caller = c.get("callerOrigin") ?? normalizeOrigin(origin);
  let target = "";
  let host = "";
  let apiKeyId: string | null = null;
  let cached = false;
  let injected = false;
  let reqBytes = c.req.method === "GET" || c.req.method === "HEAD" ? reqUrl.toString().length : 0;
  let resBytes: number | null = null;
  // Set once `?corx-callback=` parses. Declared outside the try so even an error
  // response can be wrapped for a <script> caller (see the catch below).
  let jsonpName: string | null = null;

  const finish = (status: number | null, error = "") => {
    c.executionCtx.waitUntil(
      logRequest(c.env, {
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
        authVia,
        origin: caller ?? "",
        injected,
      }),
    );
  };

  // Headers that must ride on the *response object*: c.header() before a
  // handler returns writes to Hono's prepared headers, which are dropped when
  // the handler returns a raw Response — and every proxy path does. Stamping
  // them here is what actually puts X-RateLimit-* / X-Corx-Quota-* on the wire.
  const pending = new Headers();
  // Proxied bytes are somebody else's content served under our hostname:
  // indexing a /fetch?url=… URL (or a mirror of the target) would show up as a
  // duplicate of the origin. Crawlers are told to skip every proxied response;
  // the public pages are the only thing corx wants in an index.
  pending.set("X-Robots-Tag", "noindex");
  const withPending = (res: Response): Response => {
    pending.forEach((value, name) => res.headers.set(name, value));
    return res;
  };

  try {
    // Unknown `corx-*` params are typos, not target params: fail loudly here
    // rather than forward them upstream.
    assertKnownControlParams(reqUrl);

    // JSONP first: `?corx-callback=fn` turns the JSON body into a script call. A
    // bad callback name is a 400; an error after this point is still wrapped
    // so the caller's function receives { error } instead of a syntax error.
    jsonpName = jsonpCallback(reqUrl);
    if (jsonpName && c.req.method !== "GET" && c.req.method !== "HEAD") {
      throw new ProxyError(400, "JSONP only supports GET and HEAD");
    }

    // Body transforms (`corx-charset`, `corx-wrap`) are validated up front, so
    // an unknown label is a 400 before any upstream request. Whether the
    // *response* is text is only knowable after the fetch (below).
    const transform = readTextTransforms(reqUrl);
    const transforming = isTransforming(transform);

    // Per-key SSRF opt-outs (api_keys.ip_check / dns_check, both default on).
    // Read the row before the guards so a key can skip them.
    const row = c.get("apiKey");
    // Public tier: the shared key users embed on their own sites. Reduced
    // feature set (GET/HEAD only, no cache control, no subdomain mode, no
    // credential forwarding) so the hosted instance stays generic — advanced
    // use is what self-hosting is for.
    const isPublic = row?.tier === "public";
    const { target: rawTarget, viaSubdomain } = resolveRawTarget(reqUrl, c.env);
    if (isPublic) {
      if (viaSubdomain) {
        throw new ProxyError(403, "Subdomain mode is not available with the public key — self-host CORX to use it");
      }
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        throw new ProxyError(403, `The public key only allows GET and HEAD (got ${c.req.method})`);
      }
      if (hasControl(reqUrl, "ttl") || hasControl(reqUrl, "no-cache")) {
        throw new ProxyError(403, "The public key does not accept ttl/no-cache — self-host CORX to control caching");
      }
    }
    const url = validateTargetUrl(rawTarget, { ipCheck: row?.ip_check !== 0 });
    // The JSONP callback was read from (and consumed in) the proxy request's own
    // query: a caller-supplied target keeps its own `callback` untouched, so
    // proxying a JSONP upstream still works. Path/subdomain targets never had
    // it — in subdomain mode stripControlParams already removed it.
    // Log the pre-injection URL: injected params may carry secrets.
    target = url.toString();
    host = url.hostname;

    // Confused-deputy guard: an injecting key only reaches its allowed hosts,
    // so its variables can never be attached to a caller-chosen URL.
    // Belt and braces: a row with rules but no allowlist (hand-edited DB) is
    // treated as having no injection at all — fail closed on secrets.
    const injection = effectiveInjection(row);
    const vars = varMap(injection.vars);
    const hasRules = hasInjection(injection);
    const manualRedirects = hasRules || injection.hosts.length > 0;
    assertHostAllowed(host, injection.hosts);

    // SSRF: literal checks (above, per-key ip_check) + DNS-resolved IP check
    // (per-key dns_check) + admin blocklist (always on).
    // Blocklist runs even on cache hits — we must not serve cached content of
    // a host that got blocked after the fact.
    if (row?.dns_check !== 0) await assertPublicHost(host);
    await checkDbBlocklist(c.env.DB, host);

    // Public-tier daily quotas (caller origin / target host / whole key). Runs
    // before the cache so a cache hit still consumes the caller's budget —
    // otherwise "N requests per day" would be bypassed by any cached URL.
    if (isPublic && row) {
      const quota = await checkPublicQuota(c.env.DB, {
        keyId: row.id,
        origin: caller,
        host,
        ip,
        row,
      });
      for (const [name, value] of Object.entries(quotaHeaders(quota))) pending.set(name, value);
    }

    // Auth: optional unless REQUIRE_API_KEY=true (key resolved by apiKeyMiddleware).
    apiKeyId = row?.id ?? null;
    if ((c.env.REQUIRE_API_KEY ?? "false").toLowerCase() === "true" && !apiKeyId) {
      throw new ProxyError(401, "Valid API key required (X-Api-Key, Authorization: Bearer, or ?corx-key=)");
    }

    // Param rules go into the effective upstream URL *before* the cache key:
    // two keys injecting different values must not share cached responses.
    let fetchUrl = url;
    if (injection.params.length > 0) {
      fetchUrl = applyParamRules(url, injection.params, vars, host);
      if (fetchUrl.toString() !== url.toString()) injected = true;
      if (fetchUrl.toString().length > 8192) {
        throw new ProxyError(414, "Target URL too long after injecting params");
      }
    }

    // R2 cache for GET. Runs BEFORE the rate limit so cheap cache hits don't
    // burn D1 writes/reads (and don't consume the caller's quota). Keys with
    // header rules are excluded by shouldBypassCache (personalized requests).
    // Response rules do not bypass the cache — they change what the caller
    // receives, so they go into the cache key instead (two keys with different
    // rules must never share an entry). The body transforms go in for the same
    // reason: the same URL yields different bytes and content-type.
    const responseFingerprint = [
      responseRulesFingerprint(injection.responseHeaders, vars),
      transformFingerprint(transform),
    ]
      .filter(Boolean)
      .join("\n");
    const bypass = shouldBypassCache(c.req.raw, reqUrl, row);
    let cacheKey: string | null = null;
    if (!bypass) {
      try {
        cacheKey = await cacheKeyForUrl(fetchUrl.toString(), responseFingerprint);
        const hit = await getCached(c.env.CACHE_BUCKET, cacheKey);
        if (hit) {
          cached = true;
          resBytes = hit.body.byteLength;
          finish(hit.status);
          const res = cachedResponse(hit);
          res.headers.set("X-Corx-Target", host);
          res.headers.set("X-Corx-Latency-Ms", String(Date.now() - started));
          return withPending(res);
        }
      } catch {
        // cache errors are non-fatal
      }
    }

    // Rate limit per key (or per IP for anonymous) — cache misses only.
    // Keyless traffic is metered per origin+IP so one site's visitors can't
    // drain the whole key's quota.
    const bucket =
      authVia === "origin" && caller
        ? `rl:origin:${caller}:ip:${ip || "unknown"}`
        : // A public key is shared by every caller, so a per-key bucket would
          // put all of them in one bucket. Meter per IP instead.
          isPublic
          ? `rl:public:ip:${ip || "unknown"}`
          : `rl:${apiKeyId ?? `ip:${ip || "unknown"}`}`;
    const { limit, remaining } = await checkRateLimit(c.env.DB, c.env, bucket, row?.rate_limit_per_min);
    pending.set("X-RateLimit-Limit", String(limit));
    pending.set("X-RateLimit-Remaining", String(remaining));

    // Build upstream request.
    const timeoutMs = num(c.env.TIMEOUT_MS, 30_000);
    const maxBody = num(c.env.MAX_BODY_BYTES, 10 * 1024 * 1024);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // Client headers + injection rules, rebuilt for every redirect hop so a
      // rule scoped to api.vendor.com is never attached to a different host.
      const buildOutHeaders = (forUrl: URL, dropClientAuth: boolean): Headers => {
        const outHeaders = new Headers();
        c.req.raw.headers.forEach((value, key) => {
          const k = key.toLowerCase();
          if (STRIP_REQUEST.has(k)) return;
          if (dropClientAuth && DROP_ON_CROSS_ORIGIN.has(k)) return;
          // The public key is shared with the world, so it never forwards the
          // caller's credentials — "no secrets through the public instance" is
          // a promise the code keeps, not just a line in the terms.
          if (isPublic && (k === "cookie" || k === "authorization")) return;
          outHeaders.set(key, value);
        });
        if (injection.headers.length > 0) {
          const applied = applyHeaderRules(outHeaders, injection.headers, vars, forUrl.hostname);
          if (applied > 0) injected = true;
        }
        outHeaders.set("X-Forwarded-For", ip);
        outHeaders.set("X-Proxied-By", "corx");
        // Ask upstreams for identity bodies: runtimes decompress fetch() bodies
        // themselves, so a Content-Encoding header upstream is a double-encoding
        // hazard downstream (browsers decode it again).
        outHeaders.set("accept-encoding", "identity");
        return outHeaders;
      };

      let body: BodyInit | undefined;
      if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        // Reject declared-oversized uploads before buffering anything.
        const declared = Number(c.req.header("content-length") ?? NaN);
        if (Number.isFinite(declared) && declared > maxBody) {
          throw new ProxyError(413, `Request body too large (>${maxBody} bytes)`);
        }
        let buf: ArrayBuffer;
        try {
          buf = await c.req.raw.arrayBuffer();
        } catch {
          // A failed read must never become a silently-empty forwarded body.
          throw new ProxyError(400, "Failed to read request body");
        }
        if (buf.byteLength > maxBody) {
          throw new ProxyError(413, `Request body too large (>${maxBody} bytes)`);
        }
        reqBytes = buf.byteLength;
        body = buf;
      }

      let upstream: Response | null = null;
      let stoppedRedirect: string | null = null;
      let currentUrl = fetchUrl;
      let method = c.req.method;
      let hopBody = body;
      let dropClientAuth = false;
      let hops = 0;

      // When the key injects anything (or bounds its hosts), redirects are
      // followed manually: the fetch spec drops `Authorization` on a
      // cross-origin redirect but keeps custom headers (X-Api-Key, …), which
      // would leak injected secrets to the redirect target.
      for (;;) {
        const outHeaders = buildOutHeaders(currentUrl, dropClientAuth);
        const attempt = (): Promise<Response> =>
          fetch(currentUrl.toString(), {
            method,
            headers: outHeaders,
            body: hopBody,
            signal: controller.signal,
            redirect: manualRedirects ? "manual" : "follow",
          });
        try {
          // One retry on transient network errors (fetch failed), for
          // idempotent methods only: a re-sent POST body could double-apply
          // side effects upstream. The shared AbortController keeps the total
          // time bounded by timeoutMs.
          try {
            upstream = await attempt();
          } catch (err) {
            if ((err as Error)?.name === "AbortError") throw err;
            if (method !== "GET" && method !== "HEAD") throw err;
            await new Promise((r) => setTimeout(r, 300));
            upstream = await attempt();
          }
        } catch (err) {
          if ((err as Error)?.name === "AbortError") throw new ProxyError(504, "Upstream timed out");
          throw new ProxyError(502, `Upstream fetch failed: ${(err as Error)?.message ?? "unknown"}`);
        }

        if (!manualRedirects) break;
        const location =
          upstream.status >= 300 && upstream.status < 400 ? upstream.headers.get("location") : null;
        if (!location) break;

        let next: URL;
        try {
          next = new URL(location, currentUrl);
        } catch {
          break;
        }
        if (next.protocol !== "http:" && next.protocol !== "https:") break;

        // Outside the key's host allowlist: stop and hand the 3xx to the
        // caller (absolute Location) — no injected header ever reaches it.
        if (!hostAllowed(next.hostname, injection.hosts)) {
          stoppedRedirect = next.toString();
          break;
        }
        if (++hops > MAX_REDIRECTS) throw new ProxyError(502, "Too many redirects");

        // A redirect target inside the allowlist still goes through the same
        // SSRF checks as the original host (a rebinding name can't sneak in).
        await checkDbBlocklist(c.env.DB, next.hostname);
        if (row?.dns_check !== 0) await assertPublicHost(next.hostname);

        if (next.origin !== currentUrl.origin) dropClientAuth = true;
        // fetch spec: 301/302 rewrite only POST to GET; 303 rewrites every
        // method except GET/HEAD. Both drop the body — re-sending it would
        // double-apply a side effect the upstream already handled.
        if (
          (method === "POST" && (upstream.status === 301 || upstream.status === 302)) ||
          (upstream.status === 303 && method !== "GET" && method !== "HEAD")
        ) {
          method = "GET";
          hopBody = undefined;
        }
        const nextUrl = applyParamRules(next, injection.params, vars, next.hostname);
        if (nextUrl.toString() !== next.toString()) injected = true;
        currentUrl = nextUrl;
      }
      if (!upstream) throw new ProxyError(502, "Upstream fetch failed");

      // Transforms only apply to text, JSON and XML — check the upstream's
      // content type before touching the body, so a binary response is a 400
      // instead of a corrupted one.
      if (transforming && !isTextualContentType(upstream.headers.get("content-type"))) {
        throw new ProxyError(
          400,
          `corx-charset/corx-wrap need a text, JSON or XML response (got ${
            upstream.headers.get("content-type") ?? "no content-type"
          })`,
        );
      }

      // Response rules are scoped by the host that actually answered (the last
      // hop), not by the URL the caller asked for.
      const finalHost = currentUrl.hostname;

      /** Apply the key's response header rules + report them for the log flag. */
      const applyResponseRules = (headers: Headers): void => {
        if (injection.responseHeaders.length === 0) return;
        if (applyHeaderRules(headers, injection.responseHeaders, vars, finalHost) > 0) injected = true;
      };

      // Subdomain mode serves the target under the proxy's hostname, so a
      // `Location` pointing back at the target origin must be rewritten to a
      // relative path — absolute, it would resolve against the proxy host and
      // send the browser somewhere else. Every response path applies it, since
      // a redirect can come back buffered or streamed.
      const rewriteSubdomainLocation = (headers: Headers) => {
        if (!viaSubdomain) return;
        const loc = headers.get("location");
        if (!loc) return;
        try {
          const abs = new URL(loc, url.toString());
          if (abs.origin === url.origin) headers.set("location", abs.pathname + abs.search + abs.hash);
        } catch {
          /* keep original Location */
        }
      };

      // Stream helper: minimal header stripping so Range/206 + media metadata survive.
      // res_bytes/latency are recorded by countStream when the body finishes
      // (or the client disconnects), not at header time.
      const streamIt = (body: ReadableStream<Uint8Array> | null) => {
        const streamHeaders = new Headers();
        upstream.headers.forEach((value, key) => {
          if (!STREAM_STRIP_RESPONSE.has(key.toLowerCase())) streamHeaders.set(key, value);
        });
        if (stoppedRedirect) streamHeaders.set("location", stoppedRedirect);
        rewriteSubdomainLocation(streamHeaders);
        // Streamed responses get the same rules as buffered ones — before
        // corx's own markers, so a rule can never clobber them.
        applyResponseRules(streamHeaders);
        streamHeaders.set("X-Corx-Cache", "MISS");
        streamHeaders.set("X-Corx-Target", host);
        streamHeaders.set("X-Corx-Latency-Ms", String(Date.now() - started));
        if (!body) {
          resBytes = null;
          finish(upstream.status);
          return withPending(new Response(null, { status: upstream.status, headers: streamHeaders }));
        }
        return withPending(
          new Response(countStream(body, (bytes) => {
            resBytes = bytes;
            finish(upstream.status);
          }), { status: upstream.status, headers: streamHeaders }),
        );
      };

      // Non-cacheable responses (Range/206, non-GET, bypassed, no-store/private,
      // vary-dependent) stream untouched — no OOM, no wrong cache sharing.
      if (jsonpName) {
        // `corx-wrap=json` turns any textual body into JSON, so it satisfies
        // JSONP's requirement; otherwise the upstream itself must be JSON.
        if (!transform.wrap && !isJsonContentType(upstream.headers.get("content-type"))) {
          throw new ProxyError(
            400,
            `JSONP needs a JSON response (got ${upstream.headers.get("content-type") ?? "no content-type"})`,
          );
        }
        const jsonpResHeaders = jsonpHeaders();
        jsonpResHeaders.set("X-Corx-Cache", "MISS");
        jsonpResHeaders.set("X-Corx-Target", host);
        jsonpResHeaders.set("X-Corx-Latency-Ms", String(Date.now() - started));
        if (c.req.method === "HEAD") {
          finish(upstream.status);
          return withPending(new Response(null, { status: upstream.status, headers: jsonpResHeaders }));
        }
        const bounded = await readBounded(upstream.body, JSONP_MAX_BYTES);
        if ("stream" in bounded) {
          throw new ProxyError(413, `JSONP response exceeds ${JSONP_MAX_BYTES} bytes — use fetch instead`);
        }
        let bytes = bounded.bytes;
        if (transforming) {
          // Transform before parsing: the wrapped envelope is what the script
          // receives, and JSON.parse then validates exactly those bytes.
          bytes = applyTextTransforms(bytes, new Headers(upstream.headers), transform);
        }
        try {
          JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          throw new ProxyError(502, "Upstream returned invalid JSON");
        }
        resBytes = bytes.byteLength;
        finish(upstream.status);
        return withPending(
          new Response(wrapJsonp(jsonpName, bytes), { status: upstream.status, headers: jsonpResHeaders }),
        );
      }

      const cacheable = c.req.method === "GET" && !bypass && upstream.status === 200 && responseCacheable(upstream);
      const contentLength = Number(upstream.headers.get("content-length") ?? NaN);
      const tooLarge = Number.isFinite(contentLength) && contentLength > CACHE_MAX_BYTES;

      // A transform needs the whole body, so it buffers a response that would
      // otherwise stream (an uncacheable one included). Too large is a 413 —
      // never a silently untransformed body.
      if (transforming) {
        if (tooLarge) throw new ProxyError(413, `Response too large to transform (>${CACHE_MAX_BYTES} bytes)`);
      } else if (!cacheable || tooLarge) {
        // Known-huge bodies stream without ever buffering.
        return streamIt(upstream.body);
      }

      // Bounded read: small/chunked bodies buffer for the R2 cache;
      // overflow re-emits everything as a stream (no OOM).
      const bounded = await readBounded(upstream.body, CACHE_MAX_BYTES);
      if ("stream" in bounded) {
        if (transforming) throw new ProxyError(413, `Response too large to transform (>${CACHE_MAX_BYTES} bytes)`);
        return streamIt(bounded.stream);
      }

      let resBody = bounded.bytes;
      const resHeaders = new Headers();
      upstream.headers.forEach((value, key) => {
        if (!STRIP_RESPONSE.has(key.toLowerCase())) resHeaders.set(key, value);
      });
      if (stoppedRedirect) resHeaders.set("location", stoppedRedirect);
      rewriteSubdomainLocation(resHeaders);
      applyResponseRules(resHeaders);
      // Transform after the response rules, so an explicit charset/wrap request
      // always wins over a key's header rules on content-type.
      if (transforming) resBody = applyTextTransforms(resBody, resHeaders, transform);
      // A HEAD response has no body, even though the transform above ran on one.
      resBytes = c.req.method === "HEAD" ? 0 : resBody.byteLength;
      resHeaders.set("X-Corx-Cache", "MISS");
      resHeaders.set("X-Corx-Target", host);
      resHeaders.set("X-Corx-Latency-Ms", String(Date.now() - started));

      // Store the GET 200 in R2 (fire-and-forget) — only when upstream allows it.
      if (cacheable && cacheKey) {
        const ttl = ttlSeconds(c.env, reqUrl, row);
        // Store the headers the caller actually received (rules applied) — the
        // cache key already carries those rules, so a HIT reproduces this run
        // header-for-header instead of resurrecting the upstream's.
        const stored = new Response(null, { status: upstream.status, headers: resHeaders });
        c.executionCtx.waitUntil(putCached(c.env.CACHE_BUCKET, cacheKey, stored, resBody, ttl).catch(() => undefined));
      }

      finish(upstream.status);
      // HEAD reaches this path only when a transform was requested; it has no
      // body, and the transform already corrected the headers above.
      return withPending(
        new Response(c.req.method === "HEAD" ? null : resBody, { status: upstream.status, headers: resHeaders }),
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const status = err instanceof ProxyError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Internal error";
    finish(status, message);
    const data = err instanceof ProxyError ? err.data : undefined;
    if (typeof data?.["retryAfter"] === "number") pending.set("Retry-After", String(data["retryAfter"]));
    const body = { error: message, ...(data ?? {}) };
    // A <script> caller can't read a bare JSON error body — wrap it too, so its
    // callback runs with { error } instead of dying on a syntax error.
    if (jsonpName && (c.req.method === "GET" || c.req.method === "HEAD")) {
      const payload =
        c.req.method === "HEAD" ? null : wrapJsonp(jsonpName, new TextEncoder().encode(JSON.stringify(body)));
      return withPending(new Response(payload, { status, headers: jsonpHeaders() }));
    }
    return withPending(c.json(body, status as 400));
  }
}

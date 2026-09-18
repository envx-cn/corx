import { Hono } from "hono";
import type { Context } from "hono";
import type { ApiKeyRow, Env } from "../../lib/types.js";
import { ProxyError } from "../../lib/types.js";
import type { ProxyVariables } from "../../lib/auth.js";
import { apiKeyMiddleware } from "../../lib/auth.js";
import { queryKeyById } from "../../lib/admin.js";
import { cors } from "../../proxy/cors.js";
import { proxyHandler } from "../../proxy/handler.js";
import { applyParamRules, clientVarMap, effectiveInjection, hasInjection, resolveClientRefs, rulesToText, varMap } from "../../proxy/inject.js";
import { encodeHostname, subdomainTarget } from "../../proxy/subdomain.js";
import {
  MAX_CAPTURE_BYTES,
  PLAYGROUND_FORBIDDEN_HEADERS,
  type PlaygroundInjectionPreview,
  type PlaygroundResult,
  type PlaygroundSpec,
} from "../../lib/playground.js";

type Ctx = Context<{ Bindings: Env; Variables: ProxyVariables }>;

/**
 * Run one playground spec through the REAL proxy pipeline, in-process.
 *
 * A throwaway Hono app mounts the same middleware order as server.ts
 * (apiKeyMiddleware → cors → proxyHandler) and answers a synthetic Request, so
 * the run exercises auth, keyless Origin grants, per-key injection, the SSRF
 * guards, rate limiting, caching and logging exactly like a network call —
 * while letting the console set headers a browser can't (Origin, raw key, …)
 * and use a stored key without ever holding its raw value.
 *
 * The response is captured up to MAX_CAPTURE_BYTES for inspection.
 */
export async function runPlayground(c: Ctx, spec: PlaygroundSpec): Promise<PlaygroundResult> {
  // Resolve a stored key up front: a missing/revoked key is a clean console
  // error rather than a half-run, and the row lets us preview the injection
  // that the handler will apply. Raw key values never leave the worker.
  const storedRow = spec.keyMode === "stored" ? await queryKeyById(c.env.DB, spec.keyId, c.env.INJECTION_KEK) : null;
  if (spec.keyMode === "stored" && (!storedRow || storedRow.revoked_at)) {
    throw new ProxyError(400, "Selected key was not found or is revoked");
  }

  const sub = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });
  sub.use(apiKeyMiddleware);
  if (storedRow) {
    // The console session already proved admin identity — pin the chosen key
    // instead of looking it up from a (non-existent) raw value.
    sub.use(async (c2, next) => {
      c2.set("apiKey", storedRow);
      c2.set("authVia", "key");
      // The console pinned this key out of band — no header presented it, so
      // the spec's own `Authorization` (if any) is meant for the target.
      c2.set("keySource", null);
      await next();
    });
  }
  sub.use(cors());
  sub.all("/*", proxyHandler);

  const { url, target, path } = buildProxyUrl(c.env, spec, new URL(c.req.url).origin);

  const headers = new Headers();
  const ignoredHeaders: string[] = [];
  for (const h of spec.headers) {
    if (PLAYGROUND_FORBIDDEN_HEADERS.has(h.name.toLowerCase())) {
      ignoredHeaders.push(h.name);
      continue;
    }
    try {
      headers.set(h.name, h.value);
    } catch {
      ignoredHeaders.push(h.name);
    }
  }
  if (spec.keyMode === "raw" && spec.rawKey) headers.set("x-api-key", spec.rawKey);
  if (spec.origin) headers.set("origin", spec.origin);
  if (spec.clientIp) headers.set("cf-connecting-ip", spec.clientIp);

  const sendBody = spec.method !== "GET" && spec.method !== "HEAD" && spec.body !== "";
  const started = Date.now();
  const res = await sub.request(
    url.toString(),
    { method: spec.method, headers, body: sendBody ? spec.body : undefined },
    c.env,
    c.executionCtx,
  );
  const latencyMs = Date.now() - started;

  const captured = await readCapped(res);
  const decoded = decodeBody(captured.bytes);

  const headerEntries: Array<[string, string]> = [];
  res.headers.forEach((value, key) => headerEntries.push([key, value]));

  return {
    status: res.status,
    statusText: res.statusText,
    latencyMs,
    headers: headerEntries,
    body: decoded.body,
    bodyEncoding: decoded.encoding,
    bytes: captured.bytes.byteLength,
    truncated: captured.truncated,
    contentType: res.headers.get("content-type") ?? "",
    request: {
      method: spec.method,
      path,
      proxyHost: url.host,
      targetUrl: target.toString(),
      keyMode: spec.keyMode,
      keyName: storedRow?.name ?? null,
      injection: storedRow ? injectionPreview(storedRow, target) : null,
      ignoredHeaders,
    },
  };
}

/** Compose the proxy-side request URL for the chosen routing mode. */
function buildProxyUrl(env: Env, spec: PlaygroundSpec, origin: string): { url: URL; target: URL; path: string } {
  const target = new URL(spec.url);
  // Control params ride the proxy request URL in every mode (the proxy strips
  // them from the target in subdomain mode, where the query is shared).
  const control = new URLSearchParams();
  if (spec.ttl !== null) control.set("corx-ttl", String(spec.ttl));
  if (spec.noCache) control.set("corx-no-cache", "1");
  const base = origin;
  let url: URL;
  switch (spec.route) {
    case "fetch": {
      url = new URL("/fetch", base);
      url.searchParams.set("url", target.toString());
      break;
    }
    case "proxy":
      // Faithful to a real path-style call: the target's ?query becomes the
      // proxy request's query (corx path modes only read the pathname).
      url = new URL(`/proxy/${target.toString()}`, base);
      break;
    case "raw":
      url = new URL(`/${target.toString()}`, base);
      break;
    case "subdomain": {
      const zone = (env.PROXY_ZONE ?? "").trim().replace(/\.+$/, "") || "playground.corx.test";
      url = new URL(target.pathname + target.search, `https://${encodeHostname(target.hostname)}.${zone}`);
      if (target.protocol === "http:") url.searchParams.set("corx-scheme", "http");
      if (target.port) url.searchParams.set("corx-port", target.port);
      break;
    }
  }
  control.forEach((v, k) => url.searchParams.set(k, v));

  if (spec.route === "subdomain" && subdomainTarget(url, env) === null) {
    throw new ProxyError(400, `Subdomain mode can't address "${target.hostname}" — use the /fetch route style`);
  }
  return { url, target, path: url.pathname + url.search };
}

/** Read at most MAX_CAPTURE_BYTES, then cancel the stream (the proxy logs what it delivered). */
async function readCapped(res: Response): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(0), truncated: false };

  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received >= MAX_CAPTURE_BYTES) {
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    const room = MAX_CAPTURE_BYTES - received;
    if (value.byteLength > room) {
      chunks.push(value.subarray(0, room));
      received += room;
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    received += value.byteLength;
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

/** UTF-8 text when the body decodes cleanly, base64 otherwise (binary media). */
function decodeBody(bytes: Uint8Array): { body: string; encoding: "text" | "base64" } {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\u0000")) return { body: toBase64(bytes), encoding: "base64" };
    return { body: text, encoding: "text" };
  } catch {
    return { body: toBase64(bytes), encoding: "base64" };
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * What the handler will do on the way out — with every secret masked. Client
 * references and param rules are applied to a throwaway URL with variable
 * values replaced by ***, header/param rules are shown as written (`${VAR}`
 * stays a reference).
 */
function injectionPreview(row: ApiKeyRow, target: URL): PlaygroundInjectionPreview | null {
  const parts = effectiveInjection(row);
  if (!hasInjection(parts) && parts.hosts.length === 0) return null;

  const masked = varMap(parts.vars.map((v) => ({ name: v.name, value: "***" })));
  // Caller references resolve before the rules run, exactly as in the handler.
  const allowedMasked = new Map<string, string>();
  clientVarMap(parts.vars, target.hostname).forEach((_value, name) => allowedMasked.set(name, "***"));
  let effective: URL = target;
  if (allowedMasked.size > 0) {
    const next = new URL(target.toString());
    const pairs: Array<[string, string]> = [];
    next.searchParams.forEach((v, k) => pairs.push([k, v]));
    let changed = false;
    for (const [name, value] of pairs) {
      const ref = resolveClientRefs(value, allowedMasked);
      if (!ref.resolved) continue;
      next.searchParams.set(name, ref.value);
      changed = true;
    }
    if (changed) effective = next;
  }
  if (parts.params.length > 0) {
    const applied = applyParamRules(effective, parts.params, masked, target.hostname);
    if (applied.toString() !== effective.toString()) effective = applied;
  }
  return {
    hosts: parts.hosts,
    vars: parts.vars.map((v) => v.name),
    headerLines: rulesToText(parts.headers, "header").split("\n").filter(Boolean),
    paramLines: rulesToText(parts.params, "param").split("\n").filter(Boolean),
    responseLines: rulesToText(parts.responseHeaders, "response").split("\n").filter(Boolean),
    effectiveUrl: effective.toString() !== target.toString() ? effective.toString() : null,
  };
}

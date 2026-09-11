import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { signSession } from "../app/lib/session.js";
import { parsePlaygroundSpec } from "../app/lib/playground.js";
import type { Env } from "../app/lib/types.js";

/**
 * Console playground: spec validation + a full integration pass through the
 * real worker (console guard → run route → in-process proxy pipeline).
 */

function mockDb() {
  const q = () => ({
    bind: () => q(),
    run: async () => ({ meta: { changes: 0 } }),
    first: async () => null,
    all: async () => ({ results: [] }),
  });
  return { prepare: q };
}

const env = {
  DB: mockDb(),
  CACHE_BUCKET: {
    get: async () => null,
    put: async () => undefined,
    list: async () => ({ objects: [] }),
    delete: async () => undefined,
  },
  ADMIN_TOKEN: "test-token",
  ALLOWED_ORIGINS: "*",
} as unknown as Env;

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

const sessionCookie = await signSession("tester@example.com", "test-token");
const authHeaders = { cookie: `corx_session=${sessionCookie}`, "content-type": "application/json" };

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, { ...init }), e, ctx);
}

/** D1 whose api_keys lookup answers with one row (everything else empty). */
function envWithKey(row: Record<string, unknown>, opts: { grants?: boolean } = {}) {
  const rateBinds: unknown[][] = [];
  const stmt = (sql: string) => {
    const s = {
      bind: (...values: unknown[]) => {
        if (sql.includes("INTO rate_windows")) rateBinds.push(values);
        return s;
      },
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => {
        if (sql.includes("FROM api_keys")) return row;
        if (sql.includes("FROM keyless_origins") && opts.grants !== false) return row;
        return null;
      },
      all: async () => ({ results: [row] }),
    };
    return s;
  };
  return { env: { ...env, DB: { prepare: stmt } } as unknown as Env, rateBinds };
}

interface UpstreamCall {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

/** fetch stub: answers DoH, records and answers upstream calls. */
function stubFetch(handler: (call: UpstreamCall) => Response | Promise<Response> = () => new Response("ok")): UpstreamCall[] {
  const calls: UpstreamCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      const call: UpstreamCall = {
        url,
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body:
          typeof init?.body === "string"
            ? init.body
            : init?.body instanceof ArrayBuffer
              ? new TextDecoder().decode(init.body)
              : init?.body instanceof Uint8Array
                ? new TextDecoder().decode(init.body)
                : null,
      };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

async function run(body: unknown, e: Env = env): Promise<{ status: number; data: any }> {
  const res = await call("/console/playground/run", { method: "POST", headers: authHeaders, body: JSON.stringify(body) }, e);
  return { status: res.status, data: await res.json() };
}

const injectingRow = {
  id: "k1",
  key_hash: "h",
  name: "vendor",
  rate_limit_per_min: null,
  allowed_origins: null,
  cache_ttl: null,
  no_cache: 0,
  ip_check: 1,
  dns_check: 1,
  vars: JSON.stringify([{ name: "TOKEN", value: "sk-live-1" }]),
  header_rules: JSON.stringify([{ action: "set", name: "Authorization", value: "Bearer ${TOKEN}" }]),
  param_rules: JSON.stringify([{ action: "set", name: "api_key", value: "${TOKEN}" }]),
  allowed_hosts: "api.vendor.com",
  keyless: 0,
  created_at: "2026-01-01T00:00:00.000Z",
  revoked_at: null,
};

afterEach(() => vi.unstubAllGlobals());

describe("parsePlaygroundSpec", () => {
  it("normalizes a full spec", () => {
    const parsed = parsePlaygroundSpec({
      url: "  https://example.com/data  ",
      method: "post",
      route: "proxy",
      headers: [{ name: " Accept ", value: "text/html" }, { name: "", value: "dropped" }],
      body: '{"a":1}',
      keyMode: "raw",
      rawKey: " corx_x ",
      origin: "https://app.example",
      clientIp: "203.0.113.7",
      ttl: "120",
      noCache: true,
    });
    expect(parsed).toMatchObject({
      spec: {
        url: "https://example.com/data",
        method: "POST",
        route: "proxy",
        headers: [{ name: "Accept", value: "text/html" }],
        body: '{"a":1}',
        keyMode: "raw",
        rawKey: "corx_x",
        origin: "https://app.example",
        clientIp: "203.0.113.7",
        ttl: 120,
        noCache: true,
      },
    });
  });

  it("rejects invalid input with a readable error", () => {
    expect(parsePlaygroundSpec(null)).toEqual({ error: "Invalid playground spec" });
    expect(parsePlaygroundSpec({})).toEqual({ error: "Target URL is required" });
    expect(parsePlaygroundSpec({ url: "ftp://x.test" })).toMatchObject({ error: expect.stringContaining("http") });
    expect(parsePlaygroundSpec({ url: "https://x.test", method: "TRACE" })).toMatchObject({
      error: expect.stringContaining("Unsupported method"),
    });
    expect(parsePlaygroundSpec({ url: "https://x.test", method: "GET", route: "telepathy" })).toMatchObject({
      error: expect.stringContaining("route"),
    });
    expect(parsePlaygroundSpec({ url: "https://x.test", method: "GET", ttl: "5.5" })).toMatchObject({
      error: expect.stringContaining("TTL"),
    });
    expect(parsePlaygroundSpec({ url: "https://x.test", method: "GET", origin: "not-an-origin" })).toMatchObject({
      error: expect.stringContaining("Origin"),
    });
    expect(parsePlaygroundSpec({ url: "https://x.test", method: "GET", clientIp: "not an ip" })).toMatchObject({
      error: expect.stringContaining("Client IP"),
    });
    expect(parsePlaygroundSpec({ url: "https://x.test", method: "GET", keyMode: "stored" })).toMatchObject({
      error: expect.stringContaining("stored key"),
    });
  });
});

describe("console playground (integration)", () => {
  it("renders the page with the island (presets + builder fields)", async () => {
    const res = await call("/console/playground", { headers: { cookie: `corx_session=${sessionCookie}` } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Playground");
    expect(html).toContain("Cache MISS→HIT");
    expect(html).toContain("Presets");
    // The island's builder inputs are server-rendered too.
    expect(html).toContain("https://jsonplaceholder.typicode.com/todos/1");
    expect(html).toContain("Anonymous (no key)");
  });

  it("bounces unauthenticated runs to login", async () => {
    const res = await call("/console/playground/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/login");
  });

  it("runs a GET through the proxy and captures status, headers and body", async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json", "x-upstream": "yes" },
    }));
    const { status, data } = await run({
      url: "https://example.com/data",
      method: "GET",
      route: "fetch",
      headers: [{ name: "Accept", value: "application/json" }],
      ttl: 60,
    });

    expect(status).toBe(200);
    expect(data.status).toBe(200);
    expect(data.body).toContain('"ok":true');
    expect(data.contentType).toContain("application/json");
    expect(data.request.targetUrl).toBe("https://example.com/data");
    expect(data.request.path).toContain("/fetch?url=");
    expect(data.request.path).toContain("ttl=60");
    // Response headers are exposed to the console, including proxy-owned ones.
    const headerNames = data.headers.map(([name]: [string, string]) => name.toLowerCase());
    expect(headerNames).toContain("x-upstream");
    expect(headerNames).toContain("x-corx-cache");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://example.com/data");
    expect(calls[0]?.method).toBe("GET");
    expect(calls[0]?.headers.get("accept")).toBe("application/json");
    expect(calls[0]?.headers.get("x-proxied-by")).toBe("corx");
  });

  it("surfaces proxy errors as inspectable responses (SSRF literal block)", async () => {
    const calls = stubFetch();
    const { status, data } = await run({ url: "http://127.0.0.1:8080/", method: "GET" });
    expect(status).toBe(200); // the console run succeeded; the proxy answered 403
    expect(data.status).toBe(403);
    expect(data.body).toContain("Blocked host");
    expect(calls).toHaveLength(0);
  });

  it("applies a stored key's injection without exposing its secret", async () => {
    const calls = stubFetch();
    const { data } = await run(
      { url: "https://api.vendor.com/data", method: "GET", keyMode: "stored", keyId: "k1" },
      envWithKey(injectingRow).env,
    );

    expect(calls[0]?.url).toBe("https://api.vendor.com/data?api_key=sk-live-1");
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-live-1");
    expect(data.request.keyName).toBe("vendor");
    expect(data.request.injection).toMatchObject({ hosts: ["api.vendor.com"], vars: ["TOKEN"] });
    expect(data.request.injection.effectiveUrl).toContain("api_key=***");
    // The secret must never reach the console payload.
    expect(JSON.stringify(data)).not.toContain("sk-live-1");
  });

  it("resolves a keyless grant from the simulated Origin", async () => {
    const keylessRow = { ...injectingRow, keyless: 1, allowed_origins: "https://app.example", vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null };
    const calls = stubFetch();
    const { env: keyed, rateBinds } = envWithKey(keylessRow);
    const { data } = await run(
      { url: "https://example.com/data", method: "GET", origin: "https://app.example" },
      { ...keyed, REQUIRE_API_KEY: "true" } as Env,
    );
    expect(data.status).toBe(200);
    expect(calls).toHaveLength(1);
    // Keyless traffic is metered per origin + IP — the simulated Origin is
    // what resolved the grant (the proxy never forwards Origin upstream).
    expect(rateBinds[0]?.[0]).toBe("rl:origin:https://app.example:ip:unknown");
  });

  it("presents a pasted raw key (and rejects a bad one when required)", async () => {
    const calls = stubFetch();
    const good = await run(
      { url: "https://example.com/data", method: "GET", keyMode: "raw", rawKey: "corx_secret" },
      envWithKey({ ...injectingRow, vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null }).env,
    );
    expect(good.data.status).toBe(200);
    expect(calls[0]?.headers.get("x-api-key")).toBe("corx_secret");

    // The stub DB only resolves the row for the recorded key_hash — an
    // anonymous run against REQUIRE_API_KEY is refused by the proxy.
    const anon = await run({ url: "https://example.com/data", method: "GET" }, {
      ...envWithKey({ ...injectingRow, vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null }, { grants: false }).env,
      REQUIRE_API_KEY: "true",
    } as Env);
    expect(anon.data.status).toBe(401);
  });

  it("drops fetch-forbidden headers the composer can't send", async () => {
    const calls = stubFetch();
    const { data } = await run({
      url: "https://example.com/data",
      method: "GET",
      headers: [
        { name: "Connection", value: "keep-alive" },
        { name: "X-Kept", value: "1" },
      ],
    });
    expect(data.request.ignoredHeaders).toEqual(["Connection"]);
    expect(calls[0]?.headers.get("x-kept")).toBe("1");
    expect(calls[0]?.headers.get("connection")).toBeNull();
  });

  it("forwards method + body, and answers OPTIONS preflights without upstream", async () => {
    const calls = stubFetch((call) => new Response(JSON.stringify({ echo: call.body }), { status: 200 }));
    const posted = await run({
      url: "https://httpbin.test/anything",
      method: "POST",
      headers: [{ name: "Content-Type", value: "application/json" }],
      body: '{"hello":"world"}',
    });
    expect(posted.data.status).toBe(200);
    expect(calls[0]?.method).toBe("POST");
    expect(calls[0]?.body).toBe('{"hello":"world"}');

    const preflight = await run({
      url: "https://httpbin.test/anything",
      method: "OPTIONS",
      origin: "https://app.example",
    });
    expect(preflight.data.status).toBe(204);
    expect(calls).toHaveLength(1); // preflight never reached upstream
    const headerNames = preflight.data.headers.map(([name]: [string, string]) => name.toLowerCase());
    expect(headerNames).toContain("access-control-allow-origin");
  });

  it("supports the path, raw and simulated-subdomain route styles", async () => {
    stubFetch();
    const viaProxy = await run({ url: "https://example.com/a", method: "GET", route: "proxy" });
    expect(viaProxy.data.request.path).toBe("/proxy/https://example.com/a");
    const viaRaw = await run({ url: "https://example.com/a", method: "GET", route: "raw" });
    expect(viaRaw.data.request.path).toBe("/https://example.com/a");
    const viaSub = await run({ url: "https://example.com/a", method: "GET", route: "subdomain" });
    expect(viaSub.data.request.proxyHost).toContain("example-com.playground.corx.test");
    expect(viaSub.data.request.path).toBe("/a");
    expect(viaSub.data.request.targetUrl).toBe("https://example.com/a");
  });

  it("truncates huge streamed bodies instead of buffering them", async () => {
    const big = "x".repeat(300 * 1024);
    stubFetch(() => new Response(big, { status: 200, headers: { "cache-control": "no-store" } }));
    const { data } = await run({ url: "https://example.com/big.txt", method: "GET" });
    expect(data.status).toBe(200);
    expect(data.truncated).toBe(true);
    expect(data.bytes).toBe(128 * 1024);
    expect(data.body.length).toBe(128 * 1024);
  });

  it("rejects an invalid spec before touching the network", async () => {
    const calls = stubFetch();
    const res = await call(
      "/console/playground/run",
      { method: "POST", headers: authHeaders, body: JSON.stringify({ url: "", method: "GET" }) },
      env,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("URL") });
    expect(calls).toHaveLength(0);
  });

  it("reports a missing stored key as a console error", async () => {
    const { status, data } = await run({ url: "https://example.com/", method: "GET", keyMode: "stored", keyId: "nope" });
    expect(status).toBe(400);
    expect(data.error).toContain("not found");
  });
});

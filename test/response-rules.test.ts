import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { parseRulesInput, responseRulesFingerprint, varMap } from "../app/proxy/inject.js";
import type { InjectionRule } from "../app/proxy/inject.js";

/**
 * Response header rules (issue #52): headers corx sets/removes on the way *back*
 * to the caller — the embed recipe (`!X-Frame-Options`) and header cleanup.
 *
 * The interesting failures are all about *where* the rules land: on the
 * response (not the upstream request), on both the buffered and the streamed
 * path, and inside the cache key (one key's stripped response must never be
 * served as another key's).
 */

const TOKEN_VARS = [{ name: "TOKEN", value: "sk-live-1" }];

/** Rules under test: two removes, one plain set, one interpolated set. */
const RULE_ARRAY: InjectionRule[] = [
  { action: "remove", name: "X-Frame-Options" },
  { action: "remove", name: "X-Upstream-Only" },
  { action: "set", name: "X-Embedded", value: "yes" },
  { action: "set", name: "X-Injected", value: "Bearer ${TOKEN}" },
];

function keyRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "k1",
    key_hash: "h",
    name: "embed",
    tier: "standard",
    rate_limit_per_min: null,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    vars: JSON.stringify(TOKEN_VARS),
    header_rules: "[]",
    param_rules: "[]",
    response_rules: JSON.stringify(RULE_ARRAY),
    allowed_hosts: "api.vendor.com",
    keyless: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

/** In-memory R2 stub: records keys, serves what was written. */
function memoryBucket() {
  const objects = new Map<string, { body: ArrayBuffer; customMetadata: Record<string, string> }>();
  return {
    objects,
    get: async (key: string) => {
      const hit = objects.get(key);
      if (!hit) return null;
      return {
        arrayBuffer: async () => hit.body,
        customMetadata: hit.customMetadata,
      };
    },
    put: async (key: string, body: ArrayBuffer, opts: { customMetadata?: Record<string, string> }) => {
      objects.set(key, { body, customMetadata: opts.customMetadata ?? {} });
    },
    list: async () => ({ objects: [] }),
    delete: async () => undefined,
  };
}

const env = {
  DB: { prepare: () => ({}) },
  CACHE_BUCKET: memoryBucket(),
  ADMIN_TOKEN: "test-token",
  ALLOWED_ORIGINS: "*",
} as unknown as Env;

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, { ...init, headers: { ...(init.headers ?? {}) } }), e, ctx);
}

/** D1 stub: the API-key lookup answers, everything else is empty. */
function envForKey(row: Record<string, unknown>, bucket = memoryBucket()): Env {
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => (sql.includes("FROM api_keys") ? row : null),
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return { ...env, DB: { prepare: stmt }, CACHE_BUCKET: bucket } as unknown as Env;
}

/** Upstream stub: DoH answers; the target echoes a small JSON document. */
function stubUpstream(headers: Record<string, string>, body = '{"ok":true}', status = 200) {
  const calls: Array<{ url: string; headers: Headers }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      calls.push({ url, headers: new Headers(init?.headers) });
      return new Response(body, {
        status,
        headers: { "content-type": "application/json", ...headers },
      });
    }),
  );
  return calls;
}

const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/data");
/** Flush the fire-and-forget cache write that runs through ctx.waitUntil. */
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.unstubAllGlobals());

describe("response header rules", () => {
  it("sets and removes headers on a buffered response, and never touches the request", async () => {
    const calls = stubUpstream({ "x-frame-options": "DENY", "x-upstream-only": "gone", "x-keep": "yes" });
    const keyed = envForKey(keyRow());
    const res = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, keyed);

    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBeNull(); // removed
    expect(res.headers.get("x-upstream-only")).toBeNull(); // removed
    expect(res.headers.get("x-embedded")).toBe("yes"); // set
    expect(res.headers.get("x-injected")).toBe("Bearer sk-live-1"); // set from a variable
    expect(res.headers.get("x-keep")).toBe("yes"); // untouched
    expect(res.headers.get("content-type")).toContain("application/json"); // untouched
    // The proxy's own markers are written after the rules, so a rule cannot
    // clobber them — and the rules are response-side only.
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("x-embedded")).toBeNull();
    expect(calls[0]?.headers.get("x-injected")).toBeNull();
    expect(calls[0]?.headers.get("x-frame-options")).toBeNull();
  });

  it("applies them to streamed responses too", async () => {
    // `no-store` makes the response non-cacheable, which is the streamed path.
    const calls = stubUpstream({
      "cache-control": "no-store",
      "x-frame-options": "SAMEORIGIN",
      "x-upstream-only": "gone",
    });
    const keyed = envForKey(keyRow());
    const res = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, keyed);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(res.headers.get("x-frame-options")).toBeNull();
    expect(res.headers.get("x-upstream-only")).toBeNull();
    expect(res.headers.get("x-embedded")).toBe("yes");
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(calls).toHaveLength(1);
  });

  it("scopes rules by host", async () => {
    const scoped: InjectionRule[] = [
      { action: "set", name: "X-Embedded", value: "yes", hosts: ["embed.test"] },
      { action: "remove", name: "X-Frame-Options", hosts: ["embed.test"] },
    ];
    const row = keyRow({
      allowed_hosts: "api.vendor.com, embed.test",
      response_rules: JSON.stringify(scoped),
    });
    const keyed = envForKey(row);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("{}", { status: 200, headers: { "content-type": "application/json", "x-frame-options": "DENY" } });
      }),
    );

    const other = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, keyed);
    expect(other.headers.get("x-frame-options")).toBe("DENY");
    expect(other.headers.get("x-embedded")).toBeNull();

    const inScope = await call(
      "/fetch?url=" + encodeURIComponent("https://embed.test/page"),
      { headers: { "x-api-key": "corx_k" } },
      keyed,
    );
    expect(inScope.headers.get("x-frame-options")).toBeNull();
    expect(inScope.headers.get("x-embedded")).toBe("yes");
  });

  it("stores the rewritten headers in the cache, and keeps keys apart", async () => {
    const bucket = memoryBucket();
    const withRules = envForKey(keyRow(), bucket);
    stubUpstream({ "x-frame-options": "DENY", "x-upstream-only": "gone" });

    // Buffered (cacheable) response, twice: the second one is a HIT and must
    // still carry the rewritten headers, not the upstream's.
    const first = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, withRules);
    await flush();
    const second = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, withRules);
    expect(first.headers.get("x-corx-cache")).toBe("MISS");
    expect(second.headers.get("x-corx-cache")).toBe("HIT");
    expect(second.headers.get("x-frame-options")).toBeNull();
    expect(second.headers.get("x-embedded")).toBe("yes");
    expect(bucket.objects.size).toBe(1);

    // The same URL through a key without rules: its own entry, upstream headers.
    const plain = envForKey(keyRow({ id: "k2", response_rules: "[]" }), bucket);
    const foreign = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, plain);
    expect(foreign.headers.get("x-corx-cache")).toBe("MISS");
    expect(foreign.headers.get("x-frame-options")).toBe("DENY");
    expect(foreign.headers.get("x-embedded")).toBeNull();
    await flush();
    expect(bucket.objects.size).toBe(2); // two keys, two entries — no sharing

    // …and rotating a variable value is a third entry: the resolved rules are
    // part of the key, not the rule text.
    const rotated = envForKey(
      keyRow({
        id: "k3",
        vars: JSON.stringify([{ name: "TOKEN", value: "sk-live-2" }]),
      }),
      bucket,
    );
    const afterRotation = await call(TARGET, { headers: { "x-api-key": "corx_k" } }, rotated);
    expect(afterRotation.headers.get("x-corx-cache")).toBe("MISS");
    expect(afterRotation.headers.get("x-injected")).toBe("Bearer sk-live-2");
  });
});

describe("response rule validation", () => {
  it("refuses to touch headers the proxy owns", () => {
    for (const name of [
      "Content-Length",
      "Content-Encoding",
      "Transfer-Encoding",
      "Set-Cookie",
      "Access-Control-Allow-Origin",
      "Access-Control-Expose-Headers",
      "X-Corx-Cache",
      "X-Corx-Target",
      "X-RateLimit-Remaining",
      "X-Robots-Tag",
    ]) {
      expect(() => parseRulesInput(`${name}: x`, "response", new Set()), name).toThrowError(/managed by the proxy/);
      expect(() => parseRulesInput(`!${name}`, "response", new Set()), name).toThrowError(/managed by the proxy/);
    }
  });

  it("parses the same grammar as request rules, including @hosts and !remove", () => {
    const rules = parseRulesInput(
      ["!X-Frame-Options", "@embed.test", "Content-Security-Policy: frame-ancestors 'self'", "@", "X-Back: 1"].join(
        "\n",
      ),
      "response",
      new Set(),
    );
    expect(rules).toEqual([
      { action: "remove", name: "X-Frame-Options" },
      { action: "set", name: "Content-Security-Policy", value: "frame-ancestors 'self'", hosts: ["embed.test"] },
      { action: "set", name: "X-Back", value: "1" },
    ]);
  });

  it("rejects unknown variables at save time", () => {
    expect(() => parseRulesInput("X-Injected: ${NOPE}", "response", new Set(["TOKEN"]))).toThrowError(
      /unknown variable/,
    );
  });

  it("fingerprints resolved rules so the cache key changes with them", () => {
    const vars = varMap(TOKEN_VARS);
    const base = responseRulesFingerprint(RULE_ARRAY, vars);
    expect(base).not.toBe("");
    expect(responseRulesFingerprint([], vars)).toBe("");
    // Same rules, same fingerprint — stable across calls.
    expect(responseRulesFingerprint(RULE_ARRAY, vars)).toBe(base);
    // A different variable value must move the fingerprint.
    expect(responseRulesFingerprint(RULE_ARRAY, varMap([{ name: "TOKEN", value: "other" }]))).not.toBe(base);
    // So must a different rule set.
    expect(responseRulesFingerprint([{ action: "set", name: "X-A", value: "1" }], vars)).not.toBe(
      responseRulesFingerprint([{ action: "set", name: "X-B", value: "1" }], vars),
    );
    // Host scope is part of it (the same rule can apply to a different host).
    expect(responseRulesFingerprint([{ action: "remove", name: "X-A", hosts: ["a.test"] }], vars)).not.toBe(
      responseRulesFingerprint([{ action: "remove", name: "X-A" }], vars),
    );
  });
});

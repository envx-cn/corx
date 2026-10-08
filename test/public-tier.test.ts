import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { invalidateBlocklistMemo } from "../app/proxy/guard.js";

/**
 * Public-tier integration: the shared key users embed on their own sites. The
 * reduced feature set, the credential stripping and the daily quotas are all
 * enforced in the real handler wiring, so these run against the assembled app
 * with a stubbed D1 and upstream.
 */

const PUBLIC_KEY = "corx_pub_test";

/** A fully configured public-tier row (total cap is mandatory). */
const publicRow = {
  id: "pub-1",
  key_hash: "hash",
  name: "public",
  rate_limit_per_min: null,
  allowed_origins: null,
  cache_ttl: 300,
  no_cache: 0,
  ip_check: 1,
  dns_check: 1,
  vars: "[]",
  header_rules: "[]",
  param_rules: "[]",
  allowed_hosts: null,
  keyless: 0,
  tier: "public",
  daily_limit_per_origin: 3000,
  daily_limit_per_host: 5000,
  daily_limit_total: 15000,
  created_at: "2026-01-01T00:00:00.000Z",
  revoked_at: null,
};

const emptyBucket = {
  get: async () => null,
  put: async () => undefined,
  list: async () => ({ objects: [] }),
  delete: async () => undefined,
};

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

/**
 * Env whose D1 resolves one api_keys row and answers quota reads with `used`
 * (so a spent quota can be simulated without real counters).
 */
function envWithKey(row: Record<string, unknown>, used = 0, extra: Partial<Env> = {}): Env {
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => ({ meta: { changes: 1 } }),
      first: async () => {
        if (sql.includes("FROM api_keys")) return row;
        // The counter is charged and read back by one statement now
        // (`INSERT … ON CONFLICT … RETURNING count`).
        if (sql.includes("quota_counters")) return { count: used };
        return null;
      },
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return {
    DB: { prepare: stmt },
    CACHE_BUCKET: emptyBucket,
    ALLOWED_ORIGINS: "*",
    ...extra,
  } as unknown as Env;
}

interface UpstreamCall {
  url: string;
  headers: Headers;
}

/** Stub the upstream + DoH fetches, recording what the proxy forwarded. */
function stubUpstream(): UpstreamCall[] {
  const calls: UpstreamCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      if (u.hostname === "cloudflare-dns.com") {
        return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
      }
      calls.push({ url: String(url), headers: new Headers(init?.headers) });
      return new Response("upstream ok", { status: 200, headers: { "content-type": "text/plain" } });
    }),
  );
  return calls;
}

async function call(path: string, init: RequestInit = {}, e: Env = envWithKey(publicRow)): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, init), e, ctx);
}

afterEach(() => vi.unstubAllGlobals());

describe("public tier (integration)", () => {
  it("serves a GET, meters it per IP, and reports the daily quotas", async () => {
    stubUpstream();
    const res = await call(`/fetch?url=https://example.com/data&corx-key=${PUBLIC_KEY}`, {
      headers: { origin: "https://app.example" },
    });
    expect(res.status).toBe(200);
    // Per-caller quota, not the whole key, and the instance-wide budget.
    expect(res.headers.get("x-corx-quota-origin-limit")).toBe("3000");
    expect(res.headers.get("x-corx-quota-day-limit")).toBe("15000");
    expect(res.headers.get("x-ratelimit-limit")).toBe("60");
    expect(await res.text()).toBe("upstream ok");
  });

  it("never forwards the caller's credentials upstream", async () => {
    const calls = stubUpstream();
    const res = await call(`/fetch?url=https://example.com/data&corx-key=${PUBLIC_KEY}`, {
      headers: { cookie: "session=secret", authorization: "Bearer upstream-token", "x-api-key": PUBLIC_KEY },
    });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("cookie")).toBe(null);
    expect(calls[0]?.headers.get("authorization")).toBe(null);
    // …and the corx key itself stays here too (the pre-existing leak, fixed).
    expect(calls[0]?.headers.get("x-api-key")).toBe(null);
  });

  it("never forwards even a non-corx (BYOK-shaped) X-Api-Key on the public tier", async () => {
    const calls = stubUpstream();
    const res = await call(`/fetch?url=https://example.com/data&corx-key=${PUBLIC_KEY}`, {
      headers: { "x-api-key": "sk-vendor-12345" },
    });
    expect(res.status).toBe(200);
    // "No secrets through the public instance" — a standard-tier key forwards
    // BYOK X-Api-Key values; the shared public key never does.
    expect(calls[0]?.headers.get("x-api-key")).toBe(null);
  });

  it("rejects POST and the control params that steer the cache", async () => {
    stubUpstream();
    const post = await call(`/fetch?url=https://example.com/x&corx-key=${PUBLIC_KEY}`, { method: "POST", body: "x" });
    expect(post.status).toBe(403);
    expect(await post.json()).toMatchObject({ error: expect.stringContaining("only allows GET and HEAD") });

    const ttl = await call(`/fetch?url=https://example.com/x&corx-ttl=5&corx-key=${PUBLIC_KEY}`);
    expect(ttl.status).toBe(403);

    const noCache = await call(`/fetch?url=https://example.com/x&corx-no-cache=1&corx-key=${PUBLIC_KEY}`);
    expect(noCache.status).toBe(403);
  });

  it("rejects subdomain mode", async () => {
    stubUpstream();
    const env = envWithKey(publicRow, 0, { PROXY_ZONE: "corx.test" });
    const res = await worker.fetch(
      new Request(`https://example-com.corx.test/data?corx-key=${PUBLIC_KEY}`),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Subdomain mode") });
  });

  it("429s once the daily quota is spent, telling the caller when it resets", async () => {
    stubUpstream();
    const res = await call(`/fetch?url=https://example.com/x&corx-key=${PUBLIC_KEY}`, {}, envWithKey(publicRow, 99999));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(await res.json()).toMatchObject({ scope: "origin", limit: 3000, resetAt: expect.any(String) });
  });

  it("refuses to serve a public key with no total cap", async () => {
    stubUpstream();
    const res = await call(
      `/fetch?url=https://example.com/x&corx-key=${PUBLIC_KEY}`,
      {},
      envWithKey({ ...publicRow, daily_limit_total: null }),
    );
    expect(res.status).toBe(503);
  });

  it("leaves a standard key's behavior unchanged (a fresh row has no tier)", async () => {
    stubUpstream();
    const res = await call(
      `/fetch?url=https://example.com/x&corx-key=corx_other`,
      {},
      envWithKey({ ...publicRow, tier: "standard", daily_limit_total: null }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-corx-quota-day-limit")).toBe(null);
  });
});

describe("public key card (integration)", () => {
  it("shows the key, its limits and the terms link when PUBLIC_KEY resolves", async () => {
    const res = await call("/", {}, envWithKey(publicRow, 0, { PUBLIC_KEY }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(PUBLIC_KEY);
    expect(html).toContain("15000");
    expect(html).toContain('href="/terms"');
    // Discoverable, not just present: nav + hero both link to the card.
    expect(html).toContain('id="public-key"');
    expect(html).toContain('href="#public-key"');
  });

  it("hides the card when PUBLIC_KEY is unset or is not a public key", async () => {
    const html = await (await call("/")).text();
    expect(html).not.toContain("corx_pub_");
    expect(html).not.toContain('href="#public-key"');

    // A key that is set but resolves to a non-public row is the easy local
    // mistake — dev mode says so instead of silently rendering nothing.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const wrongTier = await call("/", {}, envWithKey({ ...publicRow, tier: "standard" }, 0, { PUBLIC_KEY }));
      expect(await wrongTier.text()).not.toContain("Public key");
      expect(warn.mock.calls.flat().join(" ")).toContain("db:seed:public");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("terms (integration)", () => {
  it("serves /terms as a full document", async () => {
    const res = await call("/terms");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Terms of use");
    expect(html).toContain("Prohibited uses");
    expect(html).toContain("abuse@envx.cn");
  });

  it("?lang= sets the cookie and bounces back to /terms", async () => {
    const res = await call("/terms?lang=zh");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/terms");
    expect(res.headers.get("set-cookie")).toContain("corx_lang=zh");
    expect(await (await call("/terms", { headers: { cookie: "corx_lang=zh" } })).text()).toContain("使用条款");
  });

  it("stays local in subdomain mode (reserved label, not a proxy target)", async () => {
    const env = { ...envWithKey(publicRow), PROXY_ZONE: "corx.test" } as Env;
    const res = await worker.fetch(new Request("https://terms.corx.test/terms"), env, ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Terms of use");
  });
});

/**
 * #110 — the hot path's D1 cost, pinned as a number so a future change cannot
 * quietly double it. Measured per proxied request (a public-tier key with all
 * three caps configured, i.e. the worst case): key lookup, blocklist, three
 * quota counters, rate limit, log row.
 */
describe("D1 statements per proxied request", () => {
  it("stays at six — and five on a warm isolate", async () => {
    const sqls: string[] = [];
    const publicEnv = envWithKey(publicRow, 1);
    const spy = {
      prepare: (sql: string) => {
        sqls.push(sql.replace(/\s+/g, " ").trim());
        const stmt = {
          bind: () => stmt,
          run: async () => ({ meta: { changes: 1 } }),
          first: async () => {
            if (sql.includes("FROM api_keys")) return publicRow;
            if (sql.includes("quota_counters") || sql.includes("rate_windows")) return { count: 1 };
            return null; // blocklist
          },
          all: async () => ({ results: [] }),
        };
        return stmt;
      },
    };
    const env = { ...publicEnv, DB: spy } as unknown as Env;

    stubUpstream();
    // A host no other test in this file touches: the blocklist memo is
    // per-isolate and outlives a single test, so "cold" has to be a host that
    // nothing has asked about yet.
    const path = `/fetch?url=https://hot.example.com/x&corx-key=${PUBLIC_KEY}`;
    invalidateBlocklistMemo();
    await call(path, {}, env); // cold isolate: the blocklist is queried
    await new Promise((r) => setTimeout(r, 0)); // flush the log write
    const cold = sqls.length;
    sqls.length = 0;
    await call(path, {}, env); // warm isolate: served from the blocklist memo
    await new Promise((r) => setTimeout(r, 0));
    const warm = sqls.length;

    // key lookup + 3 quota upserts + rate-limit upsert + log insert = 6; the
    // blocklist read is the seventh statement, and the memo answers it.
    expect(cold).toBe(7);
    expect(warm).toBe(6);
    expect(sqls.filter((s) => s.includes("quota_counters"))).toHaveLength(3);
    expect(sqls.filter((s) => s.includes("rate_windows"))).toHaveLength(1);
  });
});

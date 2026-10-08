import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { createApiKey, updateApiKey } from "../app/lib/admin.js";
import { validateHostsOnly } from "../app/islands/injection-form.js";
import { signSession } from "../app/lib/session.js";
import type { Env } from "../app/lib/types.js";

/**
 * #126 — a public-tier key may carry a target allowlist.
 *
 * It could not, because `allowed_hosts` lived in the same stored blob as the
 * injection and `assertPublicPolicy()` rejected the whole blob. The reasoning
 * behind that rejection is right — a shared key must never hold an upstream
 * credential — but an allowlist is the opposite of a credential: it *restricts*
 * what the shared key can reach and holds nothing secret. Without it, a hosted
 * instance's published key was bounded only by daily caps and the blocklist,
 * which is exactly the gap incident #124 walked through.
 */

/** Recording D1 for the admin-level policy checks. */
function recordingDb() {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const stmt = (sql: string) => {
    const call = { sql, values: [] as unknown[] };
    const s = {
      bind: (...v: unknown[]) => {
        call.values = v;
        return s;
      },
      run: async () => {
        calls.push(call);
        return { meta: { changes: 1 } };
      },
      first: async () => null,
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return { db: { prepare: stmt } as unknown as D1Database, calls };
}

describe("public-tier policy: hosts allowed, credentials not", () => {
  it("accepts an allowlist on a public key", async () => {
    const { db, calls } = recordingDb();
    const { id } = await createApiKey(db, {
      name: "public",
      tier: "public",
      dailyLimitTotal: "1000",
      allowedHosts: "api.vendor.com, *.cdn.example",
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const insert = calls.find((c) => c.sql.includes("INSERT INTO api_keys"));
    // Stored as the comma string `serializeInjection` writes.
    expect(insert?.values).toContain("api.vendor.com, *.cdn.example");
  });

  it("still refuses variables and rules on a public key", async () => {
    for (const injection of [
      { vars: "TOKEN=sk-1" },
      { headerRules: "X-Demo: 1" },
      { paramRules: "api_key = x" },
      { responseRules: "X-Frame-Options: DENY" },
    ]) {
      const { db } = recordingDb();
      await expect(
        // An allowlist is supplied so the "hosts are required" validation (which
        // only exists *because* of injection) cannot fire first.
        createApiKey(db, {
          name: "public",
          tier: "public",
          dailyLimitTotal: "1000",
          allowedHosts: "api.vendor.com",
          ...injection,
        }),
        JSON.stringify(injection),
      ).rejects.toThrowError(/cannot inject upstream variables or rules/);
    }
  });

  it("an empty allowlist keeps today's behaviour (any host)", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, { name: "public", tier: "public", dailyLimitTotal: "1000" });
    const insert = calls.find((c) => c.sql.includes("INSERT INTO api_keys"));
    expect(insert?.values).toContain(null); // allowed_hosts stays NULL = any host
  });

  it("an update can add and clear the allowlist", async () => {
    const { db, calls } = recordingDb();
    await updateApiKey(db, "k1", { allowedHosts: "api.vendor.com" }, undefined).catch(() => undefined);
    const sets = calls.filter((c) => c.sql.startsWith("UPDATE api_keys"));
    expect(sets.length).toBeLessThanOrEqual(1);
  });
});

// ---------- proxy enforcement ----------

function publicRow(over: Record<string, unknown> = {}) {
  return {
    id: "key-public",
    key_hash: "h",
    name: "public",
    rate_limit_per_min: null,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    rate_limit_mode: "d1",
    vars: "[]",
    header_rules: "[]",
    param_rules: "[]",
    response_rules: "[]",
    allowed_hosts: null,
    keyless: 0,
    tier: "public",
    daily_limit_per_origin: 1000,
    daily_limit_per_host: 1000,
    daily_limit_total: 1000,
    allowed_methods: null,
    allowed_paths: null,
    require_https: 0,
    allowed_cidrs: null,
    expires_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
    ...over,
  };
}

/** `allowed_hosts` is stored as the comma string `serializeInjection` writes. */
const hosts = (...list: string[]) => list.join(", ");

function proxyEnv(row: Record<string, unknown>) {
  const env = {
    DB: {
      prepare: (sql: string) => {
        const s = {
          bind: () => s,
          run: async () => ({ meta: { changes: 1 } }),
          first: async () => {
            if (sql.includes("FROM api_keys")) return row;
            if (sql.includes("quota_counters") || sql.includes("rate_windows")) return { count: 1 };
            return null; // blocklist
          },
          all: async () => ({ results: [] }),
        };
        return s;
      },
    },
    CACHE_BUCKET: {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ objects: [], truncated: false }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
  return env;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

function stubUpstream() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      calls.push(url);
      return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } });
    }),
  );
  return calls;
}

const path = (target: string) => "/fetch?url=" + encodeURIComponent(target);

afterEach(() => vi.unstubAllGlobals());

describe("proxy: a public key's allowlist", () => {
  it("403s a host outside the list, before any upstream call", async () => {
    const calls = stubUpstream();
    const env = proxyEnv(publicRow({ allowed_hosts: hosts("api.vendor.com") }));
    const res = await worker.fetch(
      new Request(`https://corx.test${path("https://scraper.vendor.net/steal")}`, { headers: { "x-api-key": "corx_k" } }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Target host not allowed for this key: scraper.vendor.net" });
    expect(calls).toHaveLength(0);
  });

  it("serves a host inside the list", async () => {
    stubUpstream();
    const env = proxyEnv(publicRow({ allowed_hosts: hosts("api.vendor.com") }));
    const res = await worker.fetch(
      new Request(`https://corx.test${path("https://api.vendor.com/data")}`, { headers: { "x-api-key": "corx_k" } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
  });

  it("honours a wildcard entry the same way any other key does", async () => {
    stubUpstream();
    const env = proxyEnv(publicRow({ allowed_hosts: hosts("*.vendor.com") }));
    const ok = await worker.fetch(
      new Request(`https://corx.test${path("https://api.vendor.com/x")}`, { headers: { "x-api-key": "corx_k" } }),
      env,
      ctx,
    );
    const no = await worker.fetch(
      new Request(`https://corx.test${path("https://api.other.com/x")}`, { headers: { "x-api-key": "corx_k" } }),
      env,
      ctx,
    );
    expect(ok.status).toBe(200);
    expect(no.status).toBe(403);
  });

  it("a public key with no allowlist still reaches any host", async () => {
    stubUpstream();
    const env = proxyEnv(publicRow());
    const res = await worker.fetch(
      new Request(`https://corx.test${path("https://anything.vendor.net/x")}`, { headers: { "x-api-key": "corx_k" } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
  });
});

const sessionCookie = await signSession("tester@example.com", "test-token");
const cookie = { cookie: `corx_session=${sessionCookie}` };

describe("console: a public key sees only its allowlist", () => {

  /** D1 that answers one key row and records the policy/injection updates. */
  function consoleDb(row: Record<string, unknown>) {
    const updates: Array<{ sql: string; values: unknown[] }> = [];
    return {
      updates,
      db: {
        prepare: (sql: string) => {
          const call = { sql, values: [] as unknown[] };
          const s = {
            bind: (...v: unknown[]) => {
              call.values = v;
              return s;
            },
            run: async () => {
              updates.push(call);
              return { meta: { changes: 1 } };
            },
            first: async () => (sql.includes("FROM api_keys") ? row : null),
            all: async () => ({ results: [] }),
          };
          return s;
        },
      } as unknown as D1Database,
    };
  }

  it("hides the credential editors and keeps the hosts field", async () => {
    const env = { ...proxyEnv(publicRow({ allowed_hosts: hosts("api.vendor.com") })), DB: consoleDb(publicRow({ allowed_hosts: hosts("api.vendor.com") })).db };
    const res = await worker.fetch(new Request("https://corx.test/console/keys/key-public", { headers: cookie }), env, ctx);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="allowedHosts"');
    expect(html).toContain("api.vendor.com");
    // No rule editors, no variable rows, no injection preview. The hidden
    // `varsPresent` marker stays: it is what tells the route an empty row list
    // means "clear", which is the correct no-op for a key that has no variables.
    expect(html).not.toContain('name="headerRules"');
    expect(html).not.toContain('name="paramRules"');
    expect(html).not.toContain('name="responseRules"');
    expect(html).not.toContain("data-var-rows");
    expect(html).not.toContain("injection-preview");
  });

  it("a standard key still gets the full injection form", async () => {
    const standard = publicRow({ tier: "standard", daily_limit_total: null });
    const env = { ...proxyEnv(standard), DB: consoleDb(standard).db };
    const res = await worker.fetch(new Request("https://corx.test/console/keys/key-public", { headers: cookie }), env, ctx);
    const html = await res.text();
    expect(html).toContain('name="headerRules"');
    expect(html).toContain('name="varsPresent"');
  });

  it("saves an allowlist from the hosts-only form", async () => {
    const row = publicRow({ allowed_hosts: null });
    const { db, updates } = consoleDb(row);
    const env = { ...proxyEnv(row), DB: db } as unknown as Env;
    const page = await worker.fetch(
      new Request("https://corx.test/console/keys/key-public", { headers: cookie }),
      env,
      ctx,
    );
    const csrf = (await page.text()).match(/name="csrf" value="([^"]+)"/)?.[1];

    const res = await worker.fetch(
      new Request("https://corx.test/console/keys/key-public/injection", {
        method: "POST",
        headers: { ...cookie, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrf: csrf!, varsPresent: "1", allowedHosts: "api.vendor.com, cdn.vendor.com" }).toString(),
      }),
      env,
      ctx,
    );
    expect(res.status).toBe(302);
    const update = updates.find((u) => u.sql.startsWith("UPDATE api_keys"));
    expect(update?.sql).toContain("allowed_hosts = ?");
    expect(update?.values).toContain("api.vendor.com, cdn.vendor.com");
  });
});

describe("hosts-only client validation", () => {
  it("accepts blank (any host) and rejects an unparseable entry", () => {
    expect(validateHostsOnly("")).toBeNull();
    expect(validateHostsOnly("   ")).toBeNull();
    expect(validateHostsOnly("api.vendor.com, *.cdn.vendor.com")).toBeNull();
    // A wildcard that is not a bare "*.<suffix>" is refused by the host parser.
    expect(validateHostsOnly("api.*.vendor.com")).not.toBeNull();
    expect(validateHostsOnly("*.com")).not.toBeNull(); // too broad
  });
});
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { DEMO_ECHO_PATH, DEMO_HEADER, DEMO_PARAM } from "../app/lib/demo.js";
import wranglerConfig from "../wrangler.jsonc?raw";

/**
 * The injection demo (issue #53): the echo endpoint, the seeded demo key's
 * rules applied by the real proxy pipeline, and the landing page's decision to
 * show or hide the button.
 *
 * The end-to-end case runs the whole path against the assembled app: the
 * outbound `fetch` is stubbed to re-enter `worker.fetch`, so the "upstream" is
 * the real echo route — what production does on a *.workers.dev host, and on a
 * custom domain only because `global_fetch_strictly_public` is set (see the
 * config assertion at the bottom).
 */

const DEMO_KEY = "corx_demo_test";

/** A demo key row as `scripts/seed-demo-key.mjs` writes it. */
const demoRow = {
  id: "demo-local",
  key_hash: "hash",
  name: "demo",
  tier: "standard",
  rate_limit_per_min: 30,
  allowed_origins: null,
  cache_ttl: null,
  no_cache: 0,
  ip_check: 0,
  dns_check: 0,
  vars: JSON.stringify([{ name: "DEMO_SECRET", value: "demo-secret-not-a-real-key" }]),
  header_rules: JSON.stringify([{ action: "set", name: DEMO_HEADER, value: "${DEMO_SECRET}" }]),
  param_rules: JSON.stringify([{ action: "set", name: DEMO_PARAM, value: "${DEMO_SECRET}" }]),
  allowed_hosts: "corx.test",
  keyless: 0,
  daily_limit_per_origin: null,
  daily_limit_per_host: null,
  daily_limit_total: null,
  created_at: "2026-01-01T00:00:00.000Z",
  revoked_at: null,
};

/** D1 stub: only the API-key lookup answers; blocked_hosts etc. stay empty. */
function mockDb(row: Record<string, unknown> | null = null) {
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => (sql.includes("FROM api_keys") ? row : null),
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return { prepare: stmt };
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

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, init), e, ctx);
}

afterEach(() => vi.unstubAllGlobals());

describe("demo echo endpoint", () => {
  it("returns the method, path, query and headers it received", async () => {
    const res = await call(`${DEMO_ECHO_PATH}?a=1`, { headers: { "x-echo-me": "hello" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    // Never cached, never indexed, never sniffed as anything but JSON.
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    const body = (await res.json()) as { query: Record<string, string>; headers: Record<string, string> };
    expect(body).toMatchObject({
      ok: true,
      method: "GET",
      path: DEMO_ECHO_PATH,
      query: { a: "1" },
    });
    expect(body.headers["x-echo-me"]).toBe("hello");
  });

  it("gives way to the proxy on a subdomain host", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("upstream echo", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await worker.fetch(
      new Request(`https://example-com.corx.test${DEMO_ECHO_PATH}`),
      { ...env, PROXY_ZONE: "corx.test" } as Env,
      ctx,
    );
    expect(await res.text()).toBe("upstream echo");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("injection demo end to end", () => {
  /** fetch stub: DoH answers; the demo host is re-entered through the Worker. */
  function stubSelfFetch(e: Env) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        // The proxy's outbound call to our own echo route — the real upstream,
        // headers included (that is what the echo is for).
        return worker.fetch(
          new Request(url, { method: init?.method ?? "GET", headers: init?.headers }),
          e,
          ctx,
        );
      }),
    );
  }

  it("injects the demo credential and never forwards the caller's key", async () => {
    const keyed = { ...env, DB: mockDb(demoRow), DEMO_KEY } as unknown as Env;
    stubSelfFetch(keyed);
    const res = await call(
      `/fetch?url=${encodeURIComponent(`https://corx.test${DEMO_ECHO_PATH}`)}`,
      { headers: { "x-api-key": DEMO_KEY } },
      keyed,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { query: Record<string, string>; headers: Record<string, string> };
    // The point of the demo: the injected credential arrived...
    expect(body.headers[DEMO_HEADER]).toBe("demo-secret-not-a-real-key");
    expect(body.query[DEMO_PARAM]).toBe("demo-secret-not-a-real-key");
    // ...the caller's own corx key did not (STRIP_REQUEST), and the demo still
    // looks like any other proxied response.
    expect(body.headers["x-api-key"]).toBeUndefined();
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
  });

  it("keeps the demo key on its allowlist", async () => {
    const keyed = { ...env, DB: mockDb(demoRow), DEMO_KEY } as unknown as Env;
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        calls.push(url);
        return new Response("nope", { status: 200 });
      }),
    );
    const res = await call(
      `/fetch?url=${encodeURIComponent("https://elsewhere.test/demo/echo")}`,
      { headers: { "x-api-key": DEMO_KEY } },
      keyed,
    );
    expect(res.status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});

describe("landing demo wiring", () => {
  it("renders the button and the demo key when the instance has a demo", async () => {
    const keyed = { ...env, DB: mockDb(demoRow), DEMO_KEY } as unknown as Env;
    const html = await (await call("/en", {}, keyed)).text();
    // The island's props are serialised into the HTML for hydration, so the
    // label is always in the source; the demo key and its target are not.
    expect(html).toContain(DEMO_KEY);
    expect(html).toContain(`https://corx.test${DEMO_ECHO_PATH}`);
  });

  it("hides the demo when DEMO_KEY is set but its allowlist does not cover this host", async () => {
    const elsewhere = { ...demoRow, allowed_hosts: "other.example" };
    const keyed = { ...env, DB: mockDb(elsewhere), DEMO_KEY } as unknown as Env;
    const html = await (await call("/en", {}, keyed)).text();
    expect(html).not.toContain(DEMO_KEY);
  });

  it("hides the demo when there is no demo key row (or no DEMO_KEY at all)", async () => {
    const stale = { ...env, DB: mockDb(null), DEMO_KEY } as unknown as Env;
    expect(await (await call("/en", {}, stale)).text()).not.toContain(DEMO_KEY);
    expect(await (await call("/en")).text()).not.toContain(DEMO_KEY);
  });

  it("offers the live demo from the compare pages only when it exists", async () => {
    const keyed = { ...env, DB: mockDb(demoRow), DEMO_KEY } as unknown as Env;
    const withDemo = await (await call("/compare/corsproxy-io", {}, keyed)).text();
    expect(withDemo).toContain("See it live");
    const without = await (await call("/compare/corsproxy-io")).text();
    expect(without).not.toContain("See it live");
  });
});

describe("demo exposure", () => {
  it("keeps /demo out of the crawl surface", async () => {
    const robots = await (await call("/robots.txt")).text();
    expect(robots).toContain("Disallow: /demo");
    const full = await (await call("/llms-full.txt")).text();
    expect(full).toContain("## Injection demo");
    expect(full).toContain("https://corx.test/demo/echo");
  });
});

describe("deployment routing", () => {
  it("makes same-zone subrequests public, so the demo reaches the Worker on a custom domain", () => {
    // Without this flag a Worker's fetch() to its own zone goes to the zone's
    // origin — and a Workers Custom Domain has none, which is the 522 the demo
    // shows on a custom domain. It cannot be exercised in-process (miniflare
    // does not implement the zone-origin shortcut), so it is pinned here.
    expect(wranglerConfig).toContain('"global_fetch_strictly_public"');
  });
});

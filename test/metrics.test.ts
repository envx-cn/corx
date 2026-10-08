import { describe, expect, it } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

function dbWithStats() {
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => (sql.includes("COUNT(*) AS n FROM api_keys") ? { n: 3 } : { ok: 1 }),
      all: async () => ({
        results: sql.includes("target_host")
          ? [{ target_host: "api.vendor.com", n: 5, bytes: 10 }]
          : sql.includes("GROUP BY status")
          ? [{ status: 200, n: 4 }]
          : sql.includes("GROUP BY country")
          ? [{ country: "DE", n: 2 }]
          : [],
      }),
    };
    return s;
  };
  return {
    DB: { prepare: stmt },
    CACHE_BUCKET: {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ objects: [], truncated: false }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
    CACHE_TTL_SECONDS: "3600",
  } as unknown as Env;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

describe("GET /metrics", () => {
  it("needs the admin credential", async () => {
    const res = await worker.fetch(new Request("https://corx.test/api/metrics"), dbWithStats(), ctx);
    expect(res.status).toBe(401);
  });

  it("renders Prometheus text with the breakdown series", async () => {
    const res = await worker.fetch(
      new Request("https://corx.test/api/metrics", { headers: { authorization: "Bearer test-token" } }),
      dbWithStats(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("# TYPE corx_requests_24h gauge");
    expect(body).toContain("corx_active_keys 3");
    expect(body).toContain("corx_default_cache_ttl_seconds 3600");
    expect(body).toMatch(/corx_host_requests_24h\{host="api\.vendor\.com"\} 5/);
    expect(body).toMatch(/corx_responses_by_status_24h\{status="200"\} 4/);
    expect(body).toMatch(/corx_requests_by_country_24h\{country="DE"\} 2/);
  });

  it("is not readable from a browser (no ACAO on an API route)", async () => {
    const res = await worker.fetch(
      new Request("https://corx.test/api/metrics", {
        headers: { authorization: "Bearer test-token", origin: "https://evil.example" },
      }),
      dbWithStats(),
      ctx,
    );
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("GET /health", () => {
  it("shallow by default: cheap, and says nothing about bindings", async () => {
    const res = await worker.fetch(new Request("https://corx.test/health"), dbWithStats(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, service: "corx" });
  });

  it("deep is admin-gated: it costs a D1 query + an R2 LIST and names the bindings", async () => {
    const res = await worker.fetch(new Request("https://corx.test/health?deep=1"), dbWithStats(), ctx);
    expect(res.status).toBe(401);
    // The shallow form stays open — that is the liveness probe.
    const shallow = await worker.fetch(new Request("https://corx.test/health"), dbWithStats(), ctx);
    expect(shallow.status).toBe(200);
  });

  it("deep exercises D1 and R2", async () => {
    const res = await worker.fetch(
      new Request("https://corx.test/health?deep=1", { headers: { authorization: "Bearer test-token" } }),
      dbWithStats(),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, checks: { d1: { ok: true }, r2: { ok: true } } });
  });

  it("deep reports 503 when a binding is down", async () => {
    const env = dbWithStats();
    const broken = {
      ...env,
      DB: {
        prepare: () => ({
          bind: function () {
            return this;
          },
          first: async () => {
            throw new Error("d1 down");
          },
          all: async () => ({ results: [] }),
          run: async () => ({ meta: { changes: 0 } }),
        }),
      },
    } as unknown as Env;
    const res = await worker.fetch(
      new Request("https://corx.test/health?deep=1", { headers: { authorization: "Bearer test-token" } }),
      broken,
      ctx,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; checks: { d1: { ok: boolean; error?: string } } };
    expect(body.ok).toBe(false);
    expect(body.checks.d1.ok).toBe(false);
  });
});

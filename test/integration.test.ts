import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import { signSession } from "../app/lib/session.js";
import type { Env } from "../app/lib/types.js";

/**
 * Integration tests against the REAL app wiring (honox file routes + the
 * manually mounted proxy routes in server.ts). Catches ordering regressions —
 * e.g. the /* proxy catch-all swallowing /console/* or /api/* — that unit
 * tests can't see.
 */

/** Minimal D1 mock (empty tables). */
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

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, { ...init, headers: { ...(init.headers ?? {}) } }), env, ctx);
}

afterEach(() => vi.unstubAllGlobals());

describe("route wiring (integration)", () => {
  it("serves /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("404s unknown /api/* (not the proxy catch-all)", async () => {
    const res = await call("/api/nope", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Unknown API endpoint") });
  });

  it("bare /api also gets 404 JSON, not the HTML 404 page", async () => {
    const res = await call("/api", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Unknown API endpoint") });
  });

  it("serves the login page (public console path, no auth bounce)", async () => {
    const res = await call("/console/login");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("CORX console");
  });

  it("serves the landing page in Chinese via /zh and Accept-Language", async () => {
    const zh = await call("/zh");
    expect(zh.status).toBe(200);
    expect(await zh.text()).toContain("告别 CORS");

    const detected = await call("/", { headers: { "accept-language": "zh-CN,zh;q=0.9" } });
    expect(await detected.text()).toContain("告别 CORS");

    const en = await call("/en");
    expect(await en.text()).toContain("without CORS.");
  });

  it("?lang= switches the console language via cookie + redirect", async () => {
    const res = await call("/console/keys?lang=zh", {
      headers: { cookie: `corx_session=${sessionCookie}` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/keys");
    expect(res.headers.get("set-cookie")).toContain("corx_lang=zh");

    const zh = await call("/console/keys", {
      headers: { cookie: `corx_session=${sessionCookie}; corx_lang=zh` },
    });
    expect(await zh.text()).toContain("API 密钥");
  });

  it("bounces unauthenticated console pages to login", async () => {
    const res = await call("/console/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/login");
  });

  it("authenticated console pages render; creating a key shows the Copy island", async () => {
    const res = await call("/console/keys", { headers: { cookie: `corx_session=${sessionCookie}` } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("API keys");

    // Creating a key renders the CopyButton island (assert SSR output — the
    // hydration meta itself is injected at build time by the honox plugin).
    const created = await call("/console/keys", {
      method: "POST",
      headers: {
        cookie: `corx_session=${sessionCookie}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "name=my-app",
    });
    expect(created.status).toBe(200);
    const html = await created.text();
    expect(html).toContain("New key created");
    expect(html).toContain("Copy");
    expect(html).toContain('type="button"');
  });

  it("unknown /console/* paths redirect to the console root", async () => {
    const res = await call("/console/nonexistent", { headers: { cookie: `corx_session=${sessionCookie}` } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/");
  });

  it("unknown non-console paths get the branded HTML 404 page", async () => {
    const res = await call("/random/path");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    // Cloudflare-style 404: outlined digits, subtitle, dual CTAs, shared chrome.
    expect(html).toContain("nf-404");
    expect(html).toContain("Take me home");
    expect(html).toContain("Open console");
    expect(html).toContain("We can&#39;t find the page you were looking for");
    expect(html).toContain("/random/path");
  });
});

describe("proxy wiring (integration)", () => {
  it("blocks private-IP targets before any network call", async () => {
    const res = await call("/fetch?url=http://127.0.0.1/");
    expect(res.status).toBe(403);
  });

  it("proxies a valid target (DNS check + upstream fetch)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("hello upstream", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await call("/fetch?url=https://example.com/data");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello upstream");
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("path-style /https://… works through the catch-all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
        return new Response("path-style ok", { status: 200 });
      }),
    );
    const res = await call("/https://example.com/path");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("path-style ok");
  });

  it("admin API is reachable with a bearer token", async () => {
    const res = await call("/api/blocked-hosts", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hosts: [] });
  });
});

import { describe, expect, it } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

/**
 * `/blocked` — the instance's blocklist, published.
 *
 * Two properties are the whole feature, and both are asserted here:
 *
 *  - it **never leaks the operator's note**. `blocked_hosts.reason` is free text
 *    the operator writes for themselves; only hostname + date go out.
 *  - it **cannot be a 500**. D1 erroring renders an empty list, because a public
 *    status page that breaks with the database is worse than one that says
 *    "nothing recorded".
 */

/** D1 that answers the blocklist query, or fails it. */
function blockedDb(rows: Array<{ hostname: string; reason: string; created_at: string }>, fail = false) {
  return {
    prepare: (sql: string) => {
      const s = {
        bind: () => s,
        run: async () => ({ meta: { changes: 0 } }),
        first: async () => null,
        all: async () => {
          if (fail) throw new Error("d1 down");
          if (sql.includes("FROM blocked_hosts")) return { results: rows };
          return { results: [] };
        },
      };
      return s;
    },
  } as unknown as D1Database;
}

function envWith(rows: Array<{ hostname: string; reason: string; created_at: string }>, fail = false): Env {
  return {
    DB: blockedDb(rows, fail),
    CACHE_BUCKET: {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ objects: [] }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

const ROWS = [
  { hostname: "scraper.example.com", reason: "abuse: 4k req/day resold; ticket 1234", created_at: "2026-10-02T11:22:33.000Z" },
  { hostname: "meta.example.net", reason: "complained by their counsel", created_at: "2026-09-14T08:00:00.000Z" },
];

async function get(path: string, headers: Record<string, string> = {}, e = envWith(ROWS)): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, { headers }), e, ctx);
}

describe("GET /blocked", () => {
  it("lists the blocked hosts and nothing else", async () => {
    const res = await get("/blocked");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("scraper.example.com");
    expect(html).toContain("meta.example.net");
    expect(html).toContain("2026-10-02");
    // The operator's note never leaves the console.
    expect(html).not.toContain("resold");
    expect(html).not.toContain("ticket 1234");
    expect(html).not.toContain("counsel");
    expect(html).not.toContain("abuse: 4k");
  });

  it("is server-rendered in the caller's language", async () => {
    const en = await (await get("/blocked")).text();
    expect(en).toContain("Blocked hosts");
    const zh = await (await get("/blocked", { "accept-language": "zh-CN,zh;q=0.9" })).text();
    expect(zh).toContain("已封禁的主机");
    expect(zh).toContain('lang="zh"');
  });

  it("?lang= sets the cookie and redirects, like /terms", async () => {
    const res = await get("/blocked?lang=zh");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/blocked");
    expect(res.headers.get("set-cookie")).toContain("corx_lang=zh");
  });

  it("stays out of every index", async () => {
    const html = await (await get("/blocked")).text();
    expect(html).toContain('name="robots"');
    expect(html).toContain("noindex");
    // …and robots.txt agrees, so a crawler that ignores the meta tag still doesn't
    // walk in.
    const robots = await get("/robots.txt");
    expect(await robots.text()).toContain("Disallow: /blocked");
  });

  it("does not share-cache a language-varying page", async () => {
    const res = await get("/blocked");
    expect(res.headers.get("cache-control")).toContain("private");
    expect(res.headers.get("vary")).toContain("Cookie");
  });

  it("renders an empty state, never a 500, when D1 fails", async () => {
    const res = await get("/blocked", {}, envWith([], true));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Nothing is blocked");
  });

  it("says so when the instance has blocked nothing", async () => {
    const html = await (await get("/blocked", {}, envWith([]))).text();
    expect(html).toContain("Nothing is blocked");
  });

  it("truncates a very long list and says how many are hidden", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      hostname: `h${String(i).padStart(3, "0")}.example.com`,
      reason: "",
      created_at: "2026-10-02T00:00:00.000Z",
    }));
    const html = await (await get("/blocked", {}, envWith(many))).text();
    expect(html).toContain("h000.example.com");
    expect(html).toContain("h199.example.com");
    expect(html).not.toContain("h200.example.com");
    expect(html).toContain("50 more");
  });
});

describe("subdomain mode", () => {
  it("never decodes the /blocked label as a target host", async () => {
    // The coupling #106 established for every new top-level route.
    const html = await import("../app/routes/_blocked.js").then((m) => m.BLOCKED_PAGE_MAX_ROWS);
    expect(html).toBe(200);
    const reserved = await import("../app/proxy/subdomain.js").then((m) => m.reservedLabels());
    expect(reserved).toContain("blocked");
  });
});
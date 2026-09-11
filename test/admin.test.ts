import { describe, expect, it } from "vitest";
import { createApiKey, updateApiKey } from "../app/lib/admin.js";
import { ProxyError } from "../app/lib/types.js";

/**
 * The admin D1 helpers run against a recording stub: we assert the SQL shape
 * and the bound values, which is where the per-key policy (name required,
 * SSRF-guard defaults) actually lives.
 */
interface Call {
  sql: string;
  values: unknown[];
}

function recordingDb() {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const stmt = {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return stmt;
        },
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => null,
        all: async () => ({ results: [] }),
      };
      return stmt;
    },
  };
  return { db: db as unknown as D1Database, calls };
}

describe("createApiKey", () => {
  it("binds the name, policy and both checks", async () => {
    const { db, calls } = recordingDb();
    const { id, key } = await createApiKey(db, {
      name: "  my-app  ",
      rateLimitPerMin: 120,
      allowedOrigins: "https://a.example",
      cacheTtl: "300",
      noCache: true,
      ipCheck: false,
      dnsCheck: true,
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(key).toMatch(/^corx_/);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.sql).toContain("INSERT INTO api_keys");
    expect(calls[0]?.values).toEqual([
      id,
      // hashed, never the raw key
      expect.stringMatching(/^[0-9a-f]{64}$/),
      "my-app", // trimmed
      120,
      "https://a.example",
      300,
      1, // no_cache
      0, // ip_check off
      1, // dns_check on
    ]);
  });

  it("defaults both checks to on", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, { name: "app", rateLimitPerMin: null });
    expect(calls[0]?.values.slice(7)).toEqual([1, 1]);
  });

  it("requires a name", async () => {
    const { db, calls } = recordingDb();
    await expect(createApiKey(db, { name: "   ", rateLimitPerMin: null })).rejects.toBeInstanceOf(ProxyError);
    expect(calls).toHaveLength(0);
  });
});

describe("updateApiKey", () => {
  it("updates the checks alongside the rest", async () => {
    const { db, calls } = recordingDb();
    await updateApiKey(db, "key-1", { ipCheck: false, dnsCheck: true, name: "renamed" });
    expect(calls[0]?.sql).toContain("name = ?");
    expect(calls[0]?.sql).toContain("ip_check = ?");
    expect(calls[0]?.sql).toContain("dns_check = ?");
    expect(calls[0]?.values).toEqual(["renamed", 0, 1, "key-1"]);
  });

  it("requires a non-blank name when a name is sent", async () => {
    const { db, calls } = recordingDb();
    await expect(updateApiKey(db, "key-1", { name: "  " })).rejects.toBeInstanceOf(ProxyError);
    expect(calls).toHaveLength(0);
  });
});

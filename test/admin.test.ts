import { describe, expect, it } from "vitest";
import { createApiKey, queryLogs, queryStats, updateApiKey } from "../app/lib/admin.js";
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

function recordingDb(current?: Record<string, unknown>, owner?: { key_id: string; name: string }) {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      // Recorded on prepare (queryStats never binds); bind() fills the values.
      const call: Call = { sql, values: [] };
      calls.push(call);
      const stmt = {
        bind(...values: unknown[]) {
          call.values = values;
          return stmt;
        },
        run: async () => ({ meta: { changes: 1 } }),
        first: async () => {
          if (sql.includes("FROM api_keys WHERE id = ?")) return current ?? null;
          if (sql.includes("FROM keyless_origins")) return owner ?? null;
          return null;
        },
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
      "[]", // vars
      "[]", // header_rules
      "[]", // param_rules
      null, // allowed_hosts: no injection, so unrestricted
      0, // keyless
    ]);
  });

  it("defaults both checks to on (and no injection/keyless)", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, { name: "app", rateLimitPerMin: null });
    expect(calls[0]?.values.slice(7)).toEqual([1, 1, "[]", "[]", "[]", null, 0]);
  });

  it("stores injection fields and requires a host allowlist", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, {
      name: "vendor",
      vars: "TOKEN=sk-1",
      headerRules: "Authorization: Bearer ${TOKEN}",
      allowedHosts: "api.vendor.com",
    });
    const values = calls[0]?.values ?? [];
    expect(JSON.parse(String(values[9]))).toEqual([{ name: "TOKEN", value: "sk-1" }]);
    expect(JSON.parse(String(values[10]))).toEqual([
      { action: "set", name: "Authorization", value: "Bearer ${TOKEN}" },
    ]);
    expect(values[12]).toBe("api.vendor.com");

    const withoutHosts = recordingDb();
    await expect(
      createApiKey(withoutHosts.db, { name: "leaky", vars: "TOKEN=x", allowedHosts: "" }),
    ).rejects.toThrowError(/allowed target host/);
    expect(withoutHosts.calls).toHaveLength(0);
  });

  it("keyless access requires explicit origins and keeps the SSRF checks", async () => {
    for (const bad of [
      { allowedOrigins: "", keyless: true },
      { allowedOrigins: "*", keyless: true },
      { allowedOrigins: "https://a.example", keyless: true, ipCheck: false },
      { allowedOrigins: "https://a.example", keyless: true, dnsCheck: false },
    ]) {
      const { db } = recordingDb();
      await expect(createApiKey(db, { name: "pub", ...bad })).rejects.toBeInstanceOf(ProxyError);
    }
  });

  it("keyless creation writes the origin grants and marks the key", async () => {
    const { db, calls } = recordingDb();
    const { id } = await createApiKey(db, {
      name: "pub",
      allowedOrigins: "https://app.example",
      keyless: true,
    });
    const insert = calls.find((c) => c.sql.includes("INSERT INTO api_keys"));
    expect(insert?.values[13]).toBe(1); // keyless
    const grant = calls.find((c) => c.sql.includes("INSERT OR IGNORE INTO keyless_origins"));
    expect(grant?.values).toEqual(["https://app.example", id]);
    expect(calls.some((c) => c.sql.includes("DELETE FROM keyless_origins"))).toBe(true);
  });

  it("rejects an origin already granted to another key", async () => {
    const { db, calls } = recordingDb(undefined, { key_id: "other-id", name: "other" });
    await expect(
      createApiKey(db, { name: "pub", allowedOrigins: "https://app.example", keyless: true }),
    ).rejects.toThrowError(/already granted to key "other"/);
    expect(calls.some((c) => c.sql.includes("INSERT INTO api_keys"))).toBe(false);
  });

  it("requires a name", async () => {
    const { db, calls } = recordingDb();
    await expect(createApiKey(db, { name: "   ", rateLimitPerMin: null })).rejects.toBeInstanceOf(ProxyError);
    expect(calls.every((c) => c.values.length === 0)).toBe(true); // never bound, so never run
  });
});

describe("updateApiKey", () => {
  const stored = {
    vars: "[]",
    header_rules: "[]",
    param_rules: "[]",
    allowed_hosts: null,
    keyless: 0,
    allowed_origins: null,
    ip_check: 1,
    dns_check: 1,
  };

  it("updates the checks alongside the rest (and syncs grants)", async () => {
    const { db, calls } = recordingDb(stored);
    await updateApiKey(db, "key-1", { ipCheck: false, dnsCheck: true, name: "renamed" });
    const update = calls.find((c) => c.sql.startsWith("UPDATE api_keys"));
    expect(update?.sql).toContain("name = ?");
    expect(update?.sql).toContain("ip_check = ?");
    expect(update?.sql).toContain("dns_check = ?");
    expect(update?.values).toEqual(["renamed", 0, 1, "key-1"]);
    // No keyless → the grant rows are cleared (a no-op for a non-keyless key).
    expect(calls.some((c) => c.sql.includes("DELETE FROM keyless_origins"))).toBe(true);
  });

  it("keeps stored variable values when the editor sends blanks", async () => {
    const { db, calls } = recordingDb({ ...stored, vars: '[{"name":"TOKEN","value":"sk-1"}]' });
    await updateApiKey(db, "key-1", { vars: "TOKEN=", headerRules: "X-Token: ${TOKEN}", allowedHosts: "a.example" });
    const update = calls.find((c) => c.sql.startsWith("UPDATE api_keys"));
    expect(update?.sql).toContain("vars = ?");
    expect(JSON.parse(String(update?.values[0]))).toEqual([{ name: "TOKEN", value: "sk-1" }]);
  });

  it("rejects removing a variable that a stored rule still references", async () => {
    const { db } = recordingDb({
      ...stored,
      vars: '[{"name":"TOKEN","value":"sk-1"}]',
      header_rules: '[{"action":"set","name":"X-Token","value":"${TOKEN}"}]',
    });
    await expect(updateApiKey(db, "key-1", { vars: "" })).rejects.toThrowError(/not a configured variable/);
  });

  it("validates keyless against the effective values (guard toggle alone)", async () => {
    const { db } = recordingDb({ ...stored, keyless: 1, allowed_origins: "https://a.example" });
    await expect(updateApiKey(db, "key-1", { ipCheck: false })).rejects.toThrowError(/cannot disable the SSRF checks/);
  });

  it("requires a non-blank name when a name is sent", async () => {
    const { db, calls } = recordingDb();
    await expect(updateApiKey(db, "key-1", { name: "  " })).rejects.toBeInstanceOf(ProxyError);
    expect(calls).toHaveLength(0);
  });
});

describe("queryLogs", () => {
  it("caps the row limit and skips the time filter by default", async () => {
    const { db, calls } = recordingDb();
    await queryLogs(db, {});
    expect(calls[0]?.sql).not.toContain("WHERE");
    expect(calls[0]?.sql).toContain("ORDER BY created_at DESC, id DESC");
    expect(calls[0]?.values).toEqual([50]);

    await queryLogs(db, { limit: 9999 });
    expect(calls[1]?.values).toEqual([200]);
  });

  it("filters by a clamped hour window, comparing like-for-like timestamps", async () => {
    const { db, calls } = recordingDb();
    await queryLogs(db, { hours: 24, limit: 200 });
    // The boundary must use the stored format ("…T…Z", milliseconds): rows are
    // ISO strings, and datetime('now', …) ("… …", no ms) would sort behind them.
    expect(calls[0]?.sql).toContain("created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)");
    expect(calls[0]?.sql).not.toContain("datetime('now'");
    expect(calls[0]?.values).toEqual(["-24 hours", 200]);

    await queryLogs(db, { hours: 10_000 });
    expect(calls[1]?.values).toEqual(["-168 hours", 50]);

    await queryLogs(db, { hours: 0.2 });
    expect(calls[2]?.values).toEqual(["-1 hours", 50]);
  });
});

describe("queryStats", () => {
  it("filters the 24h window with the stored ISO format (not datetime())", async () => {
    const { db, calls } = recordingDb();
    await queryStats(db);
    expect(calls.length).toBeGreaterThan(4);
    for (const c of calls) expect(c.sql).not.toContain("datetime('now'");
    expect(
      calls.some((c) => c.sql.includes("created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')")),
    ).toBe(true);
  });
});

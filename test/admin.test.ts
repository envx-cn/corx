import { describe, expect, it } from "vitest";
import { createApiKey, queryKeyById, queryLogs, queryStats, updateApiKey } from "../app/lib/admin.js";
import { ProxyError } from "../app/lib/types.js";
import { decryptSecret, encryptVars } from "../app/lib/crypto.js";

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
      "[]", // response_rules
      null, // allowed_hosts: no injection, so unrestricted
      0, // keyless
      "standard", // tier
      null, // daily_limit_per_origin
      null, // daily_limit_per_host
      null, // daily_limit_total
    ]);
  });

  it("defaults both checks to on (and no injection/keyless)", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, { name: "app", rateLimitPerMin: null });
    expect(calls[0]?.values.slice(7)).toEqual([1, 1, "[]", "[]", "[]", "[]", null, 0, "standard", null, null, null]);
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
    expect(JSON.parse(String(values[12]))).toEqual([]); // response_rules
    expect(values[13]).toBe("api.vendor.com");

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
    expect(insert?.values[14]).toBe(1); // keyless
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
    response_rules: "[]",
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

/**
 * Public tier: a reduced product, so the policy is enforced at save time —
 * no injection, SSRF checks on, and a mandatory daily total (that cap is what
 * keeps the shared key's D1 writes inside the platform budget).
 */
describe("public tier policy", () => {
  /** A stored standard row, as updateApiKey reads it back for merging. */
  const standardRow = {
    vars: "[]",
    header_rules: "[]",
    param_rules: "[]",
    response_rules: "[]",
    allowed_hosts: null,
    keyless: 0,
    allowed_origins: null,
    ip_check: 1,
    dns_check: 1,
    tier: "standard",
    daily_limit_per_origin: null,
    daily_limit_per_host: null,
    daily_limit_total: null,
  };

  it("stores the tier and the daily caps on create", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, {
      name: "public",
      tier: "public",
      dailyLimitPerOrigin: "3000",
      dailyLimitPerHost: "5000",
      dailyLimitTotal: "15000",
    });
    expect(calls[0]?.values.slice(15)).toEqual(["public", 3000, 5000, 15000]);
  });

  it("accepts a boolean tier from the console form", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, { name: "public", tier: true, dailyLimitTotal: "15000" });
    expect(calls[0]?.values[15]).toBe("public");
  });

  it("rejects injection on a public key", async () => {
    const { db } = recordingDb();
    await expect(
      createApiKey(db, {
        name: "public",
        tier: "public",
        dailyLimitTotal: "15000",
        vars: "TOKEN=sk-1",
        allowedHosts: "api.vendor.com",
      }),
    ).rejects.toThrowError(/cannot inject/);
  });

  it("rejects response header rules on a public key too", async () => {
    const { db } = recordingDb();
    await expect(
      createApiKey(db, {
        name: "public",
        tier: "public",
        dailyLimitTotal: "15000",
        responseRules: "!X-Frame-Options",
        allowedHosts: "api.vendor.com",
      }),
    ).rejects.toThrowError(/cannot inject/);
  });

  it("flipping a standard key to public re-checks stored response rules", async () => {
    const { db } = recordingDb({
      ...standardRow,
      response_rules: '[{"action":"remove","name":"X-Frame-Options"}]',
      allowed_hosts: "api.vendor.com",
    });
    await expect(updateApiKey(db, "key-1", { tier: "public", dailyLimitTotal: "15000" })).rejects.toThrowError(
      /cannot inject/,
    );
  });

  it("rejects turning the SSRF checks off on a public key", async () => {
    for (const bad of [{ ipCheck: false }, { dnsCheck: false }]) {
      const { db } = recordingDb();
      await expect(createApiKey(db, { name: "public", tier: "public", dailyLimitTotal: "15000", ...bad })).rejects
        .toThrowError(/SSRF checks/);
    }
  });

  it("requires a daily total", async () => {
    const { db } = recordingDb();
    await expect(createApiKey(db, { name: "public", tier: "public" })).rejects.toThrowError(/daily total/);
  });

  it("refuses to flip a key with stored injection to public", async () => {
    const { db } = recordingDb({
      ...standardRow,
      vars: '[{"name":"TOKEN","value":"sk-1"}]',
      allowed_hosts: "api.vendor.com",
    });
    await expect(updateApiKey(db, "id-1", { tier: "public", dailyLimitTotal: "15000" })).rejects.toThrowError(
      /cannot inject/,
    );
  });

  it("requires a daily total when flipping an existing key to public", async () => {
    const { db } = recordingDb(standardRow);
    await expect(updateApiKey(db, "id-1", { tier: "public" })).rejects.toThrowError(/daily total/);
  });

  it("writes the tier and caps when the policy holds", async () => {
    const { db, calls } = recordingDb(standardRow);
    await updateApiKey(db, "id-1", { tier: "public", dailyLimitPerOrigin: "3000", dailyLimitTotal: "15000" });
    const update = calls.find((c) => c.sql.startsWith("UPDATE api_keys SET"));
    expect(update?.sql).toContain("tier = ?");
    expect(update?.sql).toContain("daily_limit_total = ?");
    expect(update?.values).toEqual(["public", 3000, 15000, "id-1"]);
  });

  it("leaves a standard key alone", async () => {
    const { db, calls } = recordingDb();
    await createApiKey(db, { name: "app" });
    expect(calls[0]?.values[15]).toBe("standard");
  });
});

/**
 * Secrets at rest: values are AES-GCM ciphertext in D1 when a KEK is set, and
 * the edit path must merge against plaintext (a blank keeps the secret) without
 * double-encrypting it.
 */
describe("secret encryption at rest", () => {
  const KEK = "kek-for-admin-tests";

  it("encrypts values on create and hands plaintext back on a key read", async () => {
    const created = recordingDb();
    await createApiKey(created.db, { name: "app", vars: "TOKEN=sk-live", allowedHosts: "api.vendor.com" }, KEK);
    const insert = created.calls.find((c) => c.sql.startsWith("INSERT INTO api_keys"));
    const storedVars = String(insert?.values[9]);
    expect(JSON.stringify(insert?.values)).not.toContain("sk-live");
    expect((JSON.parse(storedVars) as Array<{ value: string }>)[0]?.value.startsWith("enc:v1:")).toBe(true);

    const read = recordingDb({
      id: "id-1",
      vars: storedVars,
      header_rules: "[]",
      param_rules: "[]",
      allowed_hosts: "api.vendor.com",
      keyless: 0,
      allowed_origins: null,
      ip_check: 1,
      dns_check: 1,
      tier: "standard",
      daily_limit_per_origin: null,
      daily_limit_per_host: null,
      daily_limit_total: null,
      revoked_at: null,
    });
    const row = await queryKeyById(read.db, "id-1", KEK);
    expect(JSON.parse(String(row?.vars))).toEqual([{ name: "TOKEN", value: "sk-live" }]);
  });

  it("re-encrypts a kept secret exactly once (no double encryption)", async () => {
    const enc = await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }]);
    const { db, calls } = recordingDb({
      vars: JSON.stringify(enc),
      header_rules: JSON.stringify([{ action: "set", name: "X-Token", value: "${TOKEN}" }]),
      param_rules: "[]",
      allowed_hosts: "api.vendor.com",
      keyless: 0,
      allowed_origins: null,
      ip_check: 1,
      dns_check: 1,
      tier: "standard",
      daily_limit_per_origin: null,
      daily_limit_per_host: null,
      daily_limit_total: null,
    });
    await updateApiKey(db, "key-1", { vars: "TOKEN=" }, KEK);
    const update = calls.find((c) => c.sql.startsWith("UPDATE api_keys"));
    const stored = JSON.parse(String(update?.values[0])) as Array<{ name: string; value: string }>;
    expect(stored[0]?.value.startsWith("enc:v1:")).toBe(true);
    expect(await decryptSecret(KEK, stored[0]!.value)).toBe("sk-live");
  });

  it("refuses to edit injection when the stored values can't be decrypted", async () => {
    const enc = await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }]);
    const { db } = recordingDb({
      vars: JSON.stringify(enc),
      header_rules: "[]",
      param_rules: "[]",
      allowed_hosts: "api.vendor.com",
      keyless: 0,
      allowed_origins: null,
      ip_check: 1,
      dns_check: 1,
      tier: "standard",
      daily_limit_per_origin: null,
      daily_limit_per_host: null,
      daily_limit_total: null,
    });
    await expect(updateApiKey(db, "key-1", { vars: "TOKEN=" }, "wrong-kek")).rejects.toThrowError(/INJECTION_KEK/);
  });

  it("still allows a rename when the KEK is absent (injection untouched)", async () => {
    const enc = await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }]);
    const { db, calls } = recordingDb({
      vars: JSON.stringify(enc),
      header_rules: "[]",
      param_rules: "[]",
      allowed_hosts: "api.vendor.com",
      keyless: 0,
      allowed_origins: null,
      ip_check: 1,
      dns_check: 1,
      tier: "standard",
      daily_limit_per_origin: null,
      daily_limit_per_host: null,
      daily_limit_total: null,
    });
    await updateApiKey(db, "key-1", { name: "renamed" });
    const update = calls.find((c) => c.sql.startsWith("UPDATE api_keys"));
    expect(update?.sql).toContain("name = ?");
    expect(update?.sql).not.toContain("vars = ?");
  });
});

import { describe, expect, it } from "vitest";
import {
  decryptRowInjection,
  decryptSecret,
  encryptSecret,
  encryptVars,
  isEncrypted,
} from "../app/lib/crypto.js";
import {
  decryptSecret as scriptDecryptSecret,
  encryptSecret as scriptEncryptSecret,
  isEncrypted as scriptIsEncrypted,
  restoreRows,
  rewrapRows,
  selectSql,
  updateSql,
  verifyRows,
} from "../scripts/rotate-kek.mjs";

/**
 * Rehearses the documented INJECTION_KEK rotation (README → Rotating
 * INJECTION_KEK) end to end: values encrypted by the Worker with the old KEK
 * are re-wrapped by the script, D1 receives the new ciphertext, and the
 * Worker's request path reads it with the new KEK. The script's standalone
 * crypto is pinned to app/lib/crypto.ts here, so the copy can never drift.
 */

const OLD = "old-kek-for-the-rotation-test";
const NEW = "new-kek-for-the-rotation-test";
const OTHER = "an-unrelated-kek";

function row(id: string, vars: string, name = "test key") {
  return { id, name, vars };
}

describe("crypto interop with app/lib/crypto.ts", () => {
  it("each implementation reads what the other writes", async () => {
    const workerBlob = await encryptSecret(OLD, "s3cret");
    expect(scriptIsEncrypted(workerBlob)).toBe(true);
    expect(await scriptDecryptSecret(OLD, workerBlob)).toBe("s3cret");

    const scriptBlob = await scriptEncryptSecret(OLD, "s3cret");
    expect(isEncrypted(scriptBlob)).toBe(true);
    expect(await decryptSecret(OLD, scriptBlob)).toBe("s3cret");

    await expect(scriptDecryptSecret(OTHER, workerBlob)).rejects.toThrow();
  });
});

describe("rewrapRows (rotation)", () => {
  it("round-trips a key's variables across two KEKs (the documented procedure)", async () => {
    const stored = await encryptVars(OLD, [
      { name: "TOKEN", value: "sk-live-123" },
      { name: "REGION", value: "eu-central-1" },
    ]);
    const before = row("key-1", JSON.stringify(stored), "checkout");

    // 1. dry run: a plan per key, nothing written and no plaintext leaked.
    const plan = await rewrapRows(OLD, NEW, [before]);
    expect(plan.failures).toEqual([]);
    expect(plan.reports[0]!.changed).toBe(true);
    expect(plan.reports[0]!.counts).toEqual({ rewrapped: 2, already: 0, plaintext: 0 });
    expect(plan.reports[0]!.after).not.toContain("sk-live-123");

    // 2. apply: one UPDATE per changed key, carrying the re-wrapped JSON.
    const sql = updateSql(plan.reports[0]!.id, plan.reports[0]!.after);
    expect(sql).toContain("UPDATE api_keys SET vars = ");
    expect(sql).toContain("'key-1'");
    expect(sql).not.toContain("sk-live-123");

    // 3. D1 now holds ciphertext the old KEK can no longer read.
    const after = [row("key-1", plan.reports[0]!.after, "checkout")];
    for (const v of JSON.parse(after[0]!.vars) as Array<{ name: string; value: string }>) {
      expect(isEncrypted(v.value)).toBe(true);
      await expect(decryptSecret(OLD, v.value)).rejects.toThrow();
    }

    // 4. the Worker's request path reads every value with the new KEK.
    const decrypted = JSON.parse((await decryptRowInjection(NEW, after[0]!)).vars!) as Array<{
      name: string;
      value: string;
    }>;
    expect(decrypted).toEqual([
      { name: "TOKEN", value: "sk-live-123" },
      { name: "REGION", value: "eu-central-1" },
    ]);

    // 5. post-write verification passes for the new KEK, fails for any other.
    expect((await verifyRows(NEW, after)).failures).toEqual([]);
    expect((await verifyRows(OTHER, after)).failures).toHaveLength(1);
  });

  it("fails closed on a wrong old KEK, naming the variable and writing nothing", async () => {
    const stored = await encryptVars(OLD, [{ name: "TOKEN", value: "sk-live" }]);
    const { reports, failures } = await rewrapRows(OTHER, NEW, [row("key-1", JSON.stringify(stored))]);
    expect(reports).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toContain("TOKEN");
    expect(failures[0]!.reason).toContain("old KEK");
  });

  it("fails closed when an encrypted value has no old KEK at all", async () => {
    const stored = await encryptVars(OLD, [{ name: "TOKEN", value: "sk-live" }]);
    const { reports, failures } = await rewrapRows(undefined, NEW, [row("key-1", JSON.stringify(stored))]);
    expect(reports).toEqual([]);
    expect(failures[0]!.reason).toContain("no old KEK");
  });

  it("is idempotent: a second pass leaves values already under the new KEK alone", async () => {
    const stored = await encryptVars(OLD, [{ name: "TOKEN", value: "sk-live" }]);
    const first = await rewrapRows(OLD, NEW, [row("key-1", JSON.stringify(stored))]);
    const updated = [row("key-1", first.reports[0]!.after)];

    const second = await rewrapRows(OLD, NEW, updated);
    expect(second.failures).toEqual([]);
    expect(second.reports[0]!.changed).toBe(false);
    expect(second.reports[0]!.counts).toEqual({ rewrapped: 0, already: 1, plaintext: 0 });
    expect(second.reports[0]!.after).toBe(updated[0]!.vars);
  });

  it("encrypts legacy plaintext with the new KEK, like a console save would", async () => {
    const { reports, failures } = await rewrapRows(
      undefined,
      NEW,
      [row("key-1", JSON.stringify([{ name: "OLD", value: "legacy" }]))],
    );
    expect(failures).toEqual([]);
    expect(reports[0]!.counts.plaintext).toBe(1);
    expect(reports[0]!.after).not.toContain("legacy");
    const decrypted = JSON.parse((await decryptRowInjection(NEW, { vars: reports[0]!.after })).vars!) as Array<{
      name: string;
      value: string;
    }>;
    expect(decrypted).toEqual([{ name: "OLD", value: "legacy" }]);
  });

  it("reports an unreadable vars column instead of guessing", async () => {
    const { reports, failures } = await rewrapRows(OLD, NEW, [row("key-1", "{not json")]);
    expect(reports).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(failures[0]!.reason).toContain("valid JSON");
  });

  it("puts the pre-rotation ciphertext back from a backup (wrong-new-KEK recovery)", async () => {
    const stored = await encryptVars(OLD, [{ name: "TOKEN", value: "sk-live" }]);
    const before = row("key-1", JSON.stringify(stored));
    const { reports } = await rewrapRows(OLD, NEW, [before]);

    // The apply writes this shape to disk; --restore reads it back verbatim.
    const backup = {
      createdAt: "2026-09-17T14:30:00.000Z",
      target: "local",
      rows: reports.map((r) => ({ id: r.id, name: r.name, vars: r.before })),
    };
    const restored = restoreRows(backup);
    expect(restored.failures).toEqual([]);
    expect(restored.reports[0]!.after).toBe(before.vars);

    // The old KEK reads again, the abandoned new KEK does not.
    const restoredRow = row("key-1", restored.reports[0]!.after);
    const decrypted = JSON.parse((await decryptRowInjection(OLD, restoredRow)).vars!) as Array<{
      name: string;
      value: string;
    }>;
    expect(decrypted).toEqual([{ name: "TOKEN", value: "sk-live" }]);
    expect((await verifyRows(OLD, [restoredRow])).failures).toEqual([]);
    expect((await verifyRows(NEW, [restoredRow])).failures).toHaveLength(1);
  });

  it("rejects a malformed backup instead of writing from it", () => {
    expect(() => restoreRows({ nope: true })).toThrow(/rows/);
    const { reports, failures } = restoreRows({ rows: [{ id: "k" }] });
    expect(reports).toEqual([]);
    expect(failures).toHaveLength(1);
  });
});

describe("SQL helpers", () => {
  it("quotes D1 string literals", () => {
    const sql = updateSql("o'brien", JSON.stringify([{ name: "A", value: "it's" }]));
    expect(sql).toBe(`UPDATE api_keys SET vars = '[{"name":"A","value":"it''s"}]' WHERE id = 'o''brien';`);
    expect(selectSql("o'brien")).toBe(
      "SELECT id, name, vars FROM api_keys WHERE vars IS NOT NULL AND vars != '[]' AND vars != '' AND id = 'o''brien'",
    );
    expect(selectSql()).not.toContain(" AND id = ");
  });
});

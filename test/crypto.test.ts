import { describe, expect, it, vi } from "vitest";
import { ProxyError } from "../app/lib/types.js";
import {
  ENC_PREFIX,
  decryptRowInjection,
  decryptSecret,
  decryptVars,
  decryptVarsForEdit,
  encryptSecret,
  encryptVars,
  isEncrypted,
} from "../app/lib/crypto.js";

const KEK = "test-kek-do-not-use-in-production";
const OTHER = "a-different-kek";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a value and never leaves it in the clear", async () => {
    const enc = await encryptSecret(KEK, "sk-live-12345");
    expect(enc.startsWith(ENC_PREFIX)).toBe(true);
    expect(enc).not.toContain("sk-live-12345");
    expect(isEncrypted(enc)).toBe(true);
    expect(await decryptSecret(KEK, enc)).toBe("sk-live-12345");
  });

  it("uses a fresh IV, so the same plaintext encrypts differently", async () => {
    const a = await encryptSecret(KEK, "same");
    const b = await encryptSecret(KEK, "same");
    expect(a).not.toBe(b);
    expect(await decryptSecret(KEK, a)).toBe("same");
    expect(await decryptSecret(KEK, b)).toBe("same");
  });

  it("passes a legacy plaintext value through unchanged", async () => {
    expect(await decryptSecret(KEK, "plain-old-value")).toBe("plain-old-value");
  });

  it("fails on a wrong key or a tampered blob", async () => {
    const enc = await encryptSecret(KEK, "secret");
    await expect(decryptSecret(OTHER, enc)).rejects.toThrow();
    const flipped = enc.slice(0, -2) + (enc.endsWith("AA") ? "BB" : "AA");
    await expect(decryptSecret(KEK, flipped)).rejects.toThrow();
  });

  it("accepts an empty value", async () => {
    expect(await decryptSecret(KEK, await encryptSecret(KEK, ""))).toBe("");
  });
});

describe("encryptVars / decryptVars", () => {
  const vars = [{ name: "TOKEN", value: "sk-live" }];

  it("no KEK is a plaintext passthrough (local dev / tests)", async () => {
    expect(await encryptVars(undefined, vars)).toEqual(vars);
    expect(await decryptVars(undefined, vars)).toEqual({ ok: true, vars });
  });

  it("encrypts with a KEK and reads back with the same one", async () => {
    const enc = await encryptVars(KEK, vars);
    expect(enc[0]!.name).toBe("TOKEN");
    expect(isEncrypted(enc[0]!.value)).toBe(true);
    expect(await decryptVars(KEK, enc)).toEqual({ ok: true, vars });
  });

  it("fails closed when encrypted values have no KEK", async () => {
    const enc = await encryptVars(KEK, vars);
    expect(await decryptVars(undefined, enc)).toEqual({ ok: false });
  });

  it("keeps the client flag and host scope (they are not secret)", async () => {
    const scoped = [
      { name: "TOKEN", value: "sk-live", client: true, hosts: ["api.vendor.com"] },
    ];
    const enc = await encryptVars(KEK, scoped);
    expect(enc[0]!.client).toBe(true);
    expect(enc[0]!.hosts).toEqual(["api.vendor.com"]);
    expect(await decryptVars(KEK, enc)).toEqual({ ok: true, vars: scoped });
  });

  it("fails closed on a mismatched KEK", async () => {
    const enc = await encryptVars(KEK, vars);
    expect(await decryptVars(OTHER, enc)).toEqual({ ok: false });
  });

  it("migrates legacy plaintext alongside encrypted values", async () => {
    const mixed = [{ name: "OLD", value: "legacy" }, (await encryptVars(KEK, vars))[0]!];
    expect(await decryptVars(KEK, mixed)).toEqual({
      ok: true,
      vars: [
        { name: "OLD", value: "legacy" },
        { name: "TOKEN", value: "sk-live" },
      ],
    });
  });
});

describe("decryptRowInjection", () => {
  const row = {
    vars: JSON.stringify([{ name: "TOKEN", value: "sk-live" }]),
    header_rules: JSON.stringify([{ action: "set", name: "Authorization", value: "Bearer ${TOKEN}" }]),
    param_rules: JSON.stringify([{ action: "set", name: "api_key", value: "${TOKEN}" }]),
    allowed_hosts: "api.vendor.com",
  };

  it("decrypts vars in place and leaves rules/hosts alone", async () => {
    const enc = { ...row, vars: JSON.stringify(await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }])) };
    const out = await decryptRowInjection(KEK, enc);
    expect(JSON.parse(out.vars!)).toEqual([{ name: "TOKEN", value: "sk-live" }]);
    expect(out.header_rules).toBe(row.header_rules);
    expect(out.allowed_hosts).toBe("api.vendor.com");
  });

  it("drops injection entirely when the value can't be read (fail closed)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const enc = { ...row, vars: JSON.stringify(await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }])) };
    const out = await decryptRowInjection(OTHER, enc);
    expect(out.vars).toBe("[]");
    expect(out.header_rules).toBe("[]");
    expect(out.param_rules).toBe("[]");
    spy.mockRestore();
  });

  it("is a no-op for rows with no variables", async () => {
    const out = await decryptRowInjection(KEK, { vars: "[]", header_rules: "[]", param_rules: "[]" });
    expect(out.vars).toBe("[]");
  });
});

describe("decryptVarsForEdit", () => {
  it("throws (400) rather than let an unreadable secret be overwritten", async () => {
    const enc = await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }]);
    await expect(decryptVarsForEdit(OTHER, enc)).rejects.toBeInstanceOf(ProxyError);
  });

  it("returns plaintext values on the right key", async () => {
    const enc = await encryptVars(KEK, [{ name: "TOKEN", value: "sk-live" }]);
    expect(await decryptVarsForEdit(KEK, enc)).toEqual([{ name: "TOKEN", value: "sk-live" }]);
  });
});

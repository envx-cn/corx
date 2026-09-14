import { describe, it, expect } from "vitest";
import { blocklistCandidates, checkDbBlocklist, extractTargetUrl, validateTargetUrl } from "../app/proxy/guard.js";
import { ProxyError } from "../app/lib/types.js";

describe("extractTargetUrl", () => {
  it("reads ?url=", () => {
    const u = new URL("https://corx.workers.dev/fetch?url=https://example.com/a?b=c");
    expect(extractTargetUrl(u, "/fetch")).toBe("https://example.com/a?b=c");
  });
  it("reads /proxy/https://…", () => {
    const u = new URL("https://corx.workers.dev/proxy/https://example.com/a");
    expect(extractTargetUrl(u, "/proxy/https://example.com/a")).toBe("https://example.com/a");
  });
  it("reads /https://…", () => {
    const u = new URL("https://corx.workers.dev/https://example.com/a");
    expect(extractTargetUrl(u, "/https://example.com/a")).toBe("https://example.com/a");
  });
});

describe("validateTargetUrl", () => {
  it("accepts https", () => {
    expect(validateTargetUrl("https://example.com/x").hostname).toBe("example.com");
  });
  it("rejects missing", () => {
    expect(() => validateTargetUrl(null)).toThrowError(ProxyError);
  });
  it("rejects non-http", () => {
    expect(() => validateTargetUrl("ftp://example.com")).toThrowError(ProxyError);
  });
  it("blocks localhost + private ranges + metadata", () => {
    for (const raw of [
      "http://localhost:3000/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://foo.internal/",
    ]) {
      expect(() => validateTargetUrl(raw), raw).toThrowError(ProxyError);
    }
  });

  it('ipCheck: false (per-key opt-out) allows internal targets', () => {
    expect(validateTargetUrl("http://10.0.0.5/x", { ipCheck: false }).hostname).toBe("10.0.0.5");
    expect(validateTargetUrl("http://localhost:3000/", { ipCheck: false }).port).toBe("3000");
  });

  it("ipCheck: false still enforces syntax and scheme", () => {
    for (const raw of ["ftp://example.com", "https://user:pw@example.com/", "not-a-url"]) {
      expect(() => validateTargetUrl(raw, { ipCheck: false }), raw).toThrowError(ProxyError);
    }
  });
});

describe("blocklistCandidates", () => {
  it("includes the host and its parent domains, never a bare TLD", () => {
    expect(blocklistCandidates("api.evil.example")).toEqual(["api.evil.example", "evil.example"]);
    expect(blocklistCandidates("evil.example")).toEqual(["evil.example"]);
    expect(blocklistCandidates("localhost")).toEqual(["localhost"]);
  });
});

describe("checkDbBlocklist", () => {
  /** Fake D1 whose blocked_hosts row is the given hostname. */
  const dbWith = (blocked: string) =>
    ({
      prepare: () => ({
        bind: (...args: string[]) => ({
          first: async () => (args.includes(blocked) ? { hostname: blocked } : null),
        }),
      }),
    }) as unknown as D1Database;

  it("blocks the exact host", async () => {
    await expect(checkDbBlocklist(dbWith("evil.example"), "evil.example")).rejects.toThrowError(ProxyError);
  });

  it("a blocked parent domain covers its subdomains", async () => {
    await expect(checkDbBlocklist(dbWith("evil.example"), "api.evil.example")).rejects.toThrowError(ProxyError);
  });

  it("does not block siblings or unrelated hosts", async () => {
    await expect(checkDbBlocklist(dbWith("evil.example"), "other.example")).resolves.toBeUndefined();
    await expect(checkDbBlocklist(dbWith("evil.example"), "example.com")).resolves.toBeUndefined();
  });

  it("a bare TLD entry never matches", async () => {
    await expect(checkDbBlocklist(dbWith("com"), "example.com")).resolves.toBeUndefined();
  });

  it("fails open when D1 errors", async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => { throw new Error("down"); } }) }) } as unknown as D1Database;
    await expect(checkDbBlocklist(db, "evil.example")).resolves.toBeUndefined();
  });
});

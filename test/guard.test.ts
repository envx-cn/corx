import { describe, it, expect } from "vitest";
import { extractTargetUrl, validateTargetUrl } from "../app/proxy/guard.js";
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
});

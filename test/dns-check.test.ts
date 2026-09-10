import { afterEach, describe, expect, it, vi } from "vitest";
import { assertPublicHost } from "../app/proxy/dns-check.js";
import { ProxyError } from "../app/lib/types.js";

/** Stub global fetch to answer DoH queries from a table of type:host → answers. */
function stubDoh(answers: Record<string, Array<{ type: number; data: string }>>) {
  const calls: string[] = [];
  const spy = vi.fn(async (input: string | URL | Request) => {
    const u = new URL(String(input));
    calls.push(`${u.searchParams.get("type")}:${u.searchParams.get("name")}`);
    const list = answers[`${u.searchParams.get("type")}:${u.searchParams.get("name")}`] ?? [];
    return new Response(JSON.stringify({ Answer: list }), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", spy);
  return { spy, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertPublicHost", () => {
  it("allows hostnames resolving to public IPs only", async () => {
    stubDoh({
      "A:example.com": [{ type: 1, data: "93.184.216.34" }],
      "AAAA:example.com": [],
    });
    await expect(assertPublicHost("example.com")).resolves.toBeUndefined();
  });

  it("blocks hostnames resolving to private/loopback IPs", async () => {
    stubDoh({
      "A:localtest.me": [{ type: 1, data: "127.0.0.1" }],
      "AAAA:localtest.me": [],
    });
    await expect(assertPublicHost("localtest.me")).rejects.toThrowError(ProxyError);
  });

  it("blocks when ANY AAAA record is private", async () => {
    stubDoh({
      "A:dual.example": [{ type: 1, data: "93.184.216.34" }],
      "AAAA:dual.example": [{ type: 28, data: "fe80::1" }],
    });
    await expect(assertPublicHost("dual.example")).rejects.toThrowError(ProxyError);
  });

  it("ignores CNAME answers (they carry names, not IPs)", async () => {
    stubDoh({
      "A:cdn.example": [
        { type: 5, data: "edge.example" }, // CNAME — must not trip the guard
        { type: 1, data: "1.2.3.4" },
      ],
      "AAAA:cdn.example": [],
    });
    await expect(assertPublicHost("cdn.example")).resolves.toBeUndefined();
  });

  it("skips IP literals (guard.ts already classified them) — no fetch", async () => {
    const { calls } = stubDoh({});
    await expect(assertPublicHost("127.0.0.1")).resolves.toBeUndefined();
    await expect(assertPublicHost("::1")).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("fails open when DoH errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(assertPublicHost("down.example")).resolves.toBeUndefined();
  });

  it("caches per hostname (second call does not re-resolve)", async () => {
    const { calls } = stubDoh({
      "A:cached.example": [{ type: 1, data: "1.2.3.4" }],
      "AAAA:cached.example": [],
    });
    await assertPublicHost("cached.example");
    await assertPublicHost("cached.example");
    expect(calls.filter((c) => c === "A:cached.example")).toHaveLength(1);
  });

  it("cached private verdict still blocks", async () => {
    stubDoh({
      "A:bad.example": [{ type: 1, data: "10.1.2.3" }],
      "AAAA:bad.example": [],
    });
    await expect(assertPublicHost("bad.example")).rejects.toThrowError(ProxyError);
    await expect(assertPublicHost("bad.example")).rejects.toThrowError(ProxyError);
  });
});

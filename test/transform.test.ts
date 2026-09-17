import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import {
  applyTextTransforms,
  isTextualContentType,
  readTextTransforms,
  transformFingerprint,
} from "../app/proxy/transform.js";
import { ProxyError } from "../app/lib/types.js";

/**
 * `corx-charset` and `corx-wrap` (#51): the two response conveniences AllOrigins
 * ships and CORX did not. The interesting cases are the refusals (binary,
 * unknown labels) and the cache key — a transformed body must never be served
 * to a caller who asked for the raw one.
 */

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

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, init), e, ctx);
}

/** fetch stub: DoH answers a public IP, everything else is the upstream. */
function stubUpstream(upstream: () => Response): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      calls.push(url);
      return upstream();
    }),
  );
  return calls;
}

/** In-memory R2 with the subset getCached/putCached use. */
function memoryBucket() {
  const store = new Map<
    string,
    { body: Uint8Array; httpMetadata: Record<string, unknown>; customMetadata: Record<string, string> }
  >();
  const bucket = {
    get: async (key: string) => {
      const entry = store.get(key);
      if (!entry) return null;
      return {
        arrayBuffer: async () =>
          entry.body.buffer.slice(entry.body.byteOffset, entry.body.byteOffset + entry.body.byteLength),
        httpMetadata: entry.httpMetadata,
        customMetadata: entry.customMetadata,
      };
    },
    put: async (key: string, value: ArrayBuffer | Uint8Array, opts?: Record<string, unknown>) => {
      const body = value instanceof Uint8Array ? value : new Uint8Array(value);
      store.set(key, {
        body,
        httpMetadata: (opts?.["httpMetadata"] as Record<string, unknown>) ?? {},
        customMetadata: (opts?.["customMetadata"] as Record<string, string>) ?? {},
      });
    },
    list: async () => ({ objects: [] }),
    delete: async () => undefined,
  };
  return { bucket, size: () => store.size };
}

afterEach(() => vi.unstubAllGlobals());

describe("transform params", () => {
  const read = (qs: string) => readTextTransforms(new URL(`https://corx.test/fetch?url=https://x.test/${qs}`));

  it("reads both params and normalises the label", () => {
    expect(read("&corx-charset=UTF-8&corx-wrap=json")).toEqual({ charset: "utf-8", wrap: true });
    expect(read("")).toEqual({ charset: null, wrap: false });
  });

  it("rejects an unknown label or wrap value with a 400", () => {
    for (const qs of ["&corx-charset=made-up-9", "&corx-charset=", "&corx-wrap=xml", "&corx-wrap="]) {
      expect(() => read(qs), qs).toThrowError(ProxyError);
      try {
        read(qs);
      } catch (err) {
        expect((err as ProxyError).status, qs).toBe(400);
      }
    }
  });

  it("keeps text, JSON and XML apart from binary", () => {
    for (const ct of ["text/plain", "text/html; charset=iso-8859-1", "application/json", "application/xml", "image/svg+xml"]) {
      expect(isTextualContentType(ct), ct).toBe(true);
    }
    for (const ct of ["image/png", "application/octet-stream", "application/pdf", "video/mp4", null]) {
      expect(isTextualContentType(ct), String(ct)).toBe(false);
    }
  });

  it("fingerprints only what changes the body", () => {
    expect(transformFingerprint({ charset: null, wrap: false })).toBe("");
    const charset = transformFingerprint({ charset: "utf-8", wrap: false });
    const wrap = transformFingerprint({ charset: null, wrap: true });
    const both = transformFingerprint({ charset: "utf-8", wrap: true });
    expect(new Set([charset, wrap, both]).size).toBe(3);
    expect(both).toContain("charset=utf-8");
    expect(both).toContain("wrap=json");
  });

  it("decodes with the upstream's declared charset when redirecting to UTF-8", () => {
    const body = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in latin-1
    const headers = new Headers({ "content-type": "text/plain; charset=iso-8859-1" });
    const out = applyTextTransforms(body, headers, { charset: "windows-1252", wrap: false });
    expect(new TextDecoder().decode(out)).toBe("café");
    expect(headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  it("fails a wrap whose upstream declared an unsupported charset", () => {
    const headers = new Headers({ "content-type": "text/plain; charset=not-a-real-charset" });
    expect(() => applyTextTransforms(new Uint8Array(), headers, { charset: null, wrap: true })).toThrowError(
      ProxyError,
    );
  });
});

describe("corx-charset", () => {
  it("re-decodes a mislabelled body and corrects the content type", async () => {
    const utf8 = new TextEncoder().encode("中文");
    stubUpstream(() => new Response(utf8, { headers: { "content-type": "text/plain; charset=iso-8859-1" } }));

    // Raw: the upstream's (wrong) label rides along untouched.
    const raw = await call("/fetch?url=https://api.example.com/x");
    expect(raw.headers.get("content-type")).toBe("text/plain; charset=iso-8859-1");
    expect(new Uint8Array(await raw.arrayBuffer())).toEqual(utf8);

    const res = await call("/fetch?url=https://api.example.com/x&corx-charset=utf-8");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("中文");
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(res.headers.get("x-corx-target")).toBe("api.example.com");
  });

  it("applies to JSON and XML bodies too", async () => {
    stubUpstream(
      () => new Response('{"name":"caf\u00e9"}', { headers: { "content-type": "application/json; charset=iso-8859-1" } }),
    );
    const res = await call("/fetch?url=https://api.example.com/x&corx-charset=utf-8");
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.text()).toBe('{"name":"café"}');
  });

  it("rejects a binary response instead of corrupting it", async () => {
    const calls = stubUpstream(
      () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { headers: { "content-type": "image/png" } }),
    );
    const res = await call("/fetch?url=https://api.example.com/x&corx-charset=utf-8");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("need a text, JSON or XML response");
    expect(calls).toHaveLength(1); // the body was never read
  });
});

describe("corx-wrap=json", () => {
  it("wraps HTML as {\"contents\"} with application/json", async () => {
    stubUpstream(
      () => new Response("<h1>hi</h1>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    const res = await call("/fetch?url=https://api.example.com/x&corx-wrap=json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.json()).toEqual({ contents: "<h1>hi</h1>" });
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(res.headers.get("x-corx-target")).toBe("api.example.com");
    expect(res.headers.get("x-corx-latency-ms")).toMatch(/^\d+$/);
  });

  it("uses the upstream's declared charset when none is forced", async () => {
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    stubUpstream(() => new Response(latin1, { headers: { "content-type": "text/plain; charset=iso-8859-1" } }));
    const res = await call("/fetch?url=https://api.example.com/x&corx-wrap=json");
    expect(await res.json()).toEqual({ contents: "café" });
  });

  it("combines with corx-charset, decoding with the forced label first", async () => {
    const windows1252 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]);
    stubUpstream(() => new Response(windows1252, { headers: { "content-type": "text/plain" } }));
    const res = await call("/fetch?url=https://api.example.com/x&corx-charset=windows-1252&corx-wrap=json");
    expect(await res.json()).toEqual({ contents: "café" });
  });

  it("refuses a binary body", async () => {
    stubUpstream(
      () => new Response(new Uint8Array([0x00, 0x01]), { headers: { "content-type": "application/octet-stream" } }),
    );
    const res = await call("/fetch?url=https://api.example.com/x&corx-wrap=json");
    expect(res.status).toBe(400);
  });

  it("works under JSONP: the envelope satisfies the JSON requirement", async () => {
    stubUpstream(() => new Response("<p>x</p>", { headers: { "content-type": "text/html" } }));
    const res = await call("/fetch?url=https://api.example.com/x&corx-wrap=json&corx-callback=cb");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('/**/ cb({"contents":"<p>x</p>"});\n');
  });
});

describe("transform validation happens before the fetch", () => {
  it("400s an unknown label without contacting upstream", async () => {
    const calls = stubUpstream(() => new Response("x"));
    const res = await call("/fetch?url=https://api.example.com/x&corx-charset=nope-9");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Unknown corx-charset");
    expect(calls).toHaveLength(0);
  });

  it("400s an unknown wrap value without contacting upstream", async () => {
    const calls = stubUpstream(() => new Response("x"));
    const res = await call("/fetch?url=https://api.example.com/x&corx-wrap=xml");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Unknown corx-wrap");
    expect(calls).toHaveLength(0);
  });

  it("keeps a caller-supplied target's own charset/wrap params untouched", async () => {
    const calls = stubUpstream(() => new Response("x", { headers: { "content-type": "text/plain" } }));
    const target = encodeURIComponent("https://api.example.com/x?charset=shift_jis&wrap=1");
    const res = await call(`/fetch?url=${target}`);
    expect(res.status).toBe(200);
    expect(calls[0]).toBe("https://api.example.com/x?charset=shift_jis&wrap=1");
  });
});

describe("cache key separation", () => {
  it("never serves a transformed body to a caller who asked for the raw one", async () => {
    stubUpstream(
      () => new Response("<h1>hi</h1>", { headers: { "content-type": "text/html; charset=utf-8" } }),
    );
    const { bucket, size } = memoryBucket();
    const e = { ...env, CACHE_BUCKET: bucket } as unknown as Env;

    const plain = "/fetch?url=https://api.example.com/x";
    const wrapped = `${plain}&corx-wrap=json`;

    expect((await call(plain, {}, e)).headers.get("x-corx-cache")).toBe("MISS");
    expect((await call(wrapped, {}, e)).headers.get("x-corx-cache")).toBe("MISS");
    // Two URLs, two entries: the transform is part of the key.
    expect(size()).toBe(2);

    const plainHit = await call(plain, {}, e);
    expect(plainHit.headers.get("x-corx-cache")).toBe("HIT");
    expect(await plainHit.text()).toBe("<h1>hi</h1>");

    const wrappedHit = await call(wrapped, {}, e);
    expect(wrappedHit.headers.get("x-corx-cache")).toBe("HIT");
    expect(wrappedHit.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await wrappedHit.json()).toEqual({ contents: "<h1>hi</h1>" });

    // And a different label is a third entry, not a collision.
    const latin = `${plain}&corx-charset=iso-8859-1`;
    expect((await call(latin, {}, e)).headers.get("x-corx-cache")).toBe("MISS");
    expect(size()).toBe(3);
  });
});

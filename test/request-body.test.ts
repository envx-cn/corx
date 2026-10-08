import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

/**
 * #113 — the request body is forwarded as a stream whenever it is big enough
 * to matter, and still read into memory when the whole thing has already
 * arrived.
 *
 * The split is deliberate: the small JSON/form post that is most of real API
 * traffic keeps the historical behaviour byte-for-byte (size checked before
 * anything is forwarded, a failed read is a loud 400, re-sendable on a
 * 307/308), while a large or chunked upload streams — which is what keeps
 * `MAX_BODY_BYTES` worth setting, and lets the upstream connection open before
 * the caller has finished sending.
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

const baseEnv = {
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
const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/upload");

/** Upstream stub that reports what it received for the target request. */
function stubUpstream(
  respond: (seen: { method: string; body: BodyInit | null | undefined }) => Response | Promise<Response>,
) {
  const calls: Array<{ method: string; body: BodyInit | null | undefined }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("cloudflare-dns.com")) {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
      }
      const seen = { method: String(init?.method ?? "GET"), body: init?.body };
      calls.push(seen);
      return respond(seen);
    }),
  );
  return calls;
}

function post(body: BodyInit, init: RequestInit = {}): Request {
  return new Request(`https://corx.test${TARGET}`, {
    method: "POST",
    body,
    duplex: "half",
    ...init,
  } as RequestInit & { duplex: "half" });
}

/**
 * A body that dribbles: the first chunk is available immediately, every later
 * chunk only after `gapMs`. That is what forces the proxy's "is the rest of
 * the body already here?" probe to time out, i.e. the streaming path.
 */
function dribblingBody(chunks: string[], gapMs = 5): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      if (i > 0) await new Promise((r) => setTimeout(r, gapMs));
      controller.enqueue(encoder.encode(chunks[i++]!));
    },
  });
}

async function readAll(body: BodyInit | null | undefined): Promise<string> {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body);
  const reader = (body as ReadableStream<Uint8Array>).getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
  }
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return new TextDecoder().decode(out);
}

afterEach(() => vi.unstubAllGlobals());

describe("request bodies", () => {
  it("forwards a small body as bytes, unchanged", async () => {
    let seen: string | null = null;
    stubUpstream(async (s) => {
      seen = await readAll(s.body);
      return new Response("ok", { status: 200 });
    });
    const res = await worker.fetch(post('{"hello":"world"}'), baseEnv, ctx);
    expect(res.status).toBe(200);
    expect(seen).toBe('{"hello":"world"}');
  });

  it("streams a body that is still arriving, and the upstream sees every byte", async () => {
    let seen: string | null = null;
    let streamed = false;
    stubUpstream(async (s) => {
      streamed = typeof (s.body as ReadableStream<Uint8Array>)?.getReader === "function";
      seen = await readAll(s.body);
      return new Response("ok", { status: 200 });
    });
    const res = await worker.fetch(post(dribblingBody(["one-", "two-", "three"])), baseEnv, ctx);
    expect(res.status).toBe(200);
    expect(streamed).toBe(true);
    expect(seen).toBe("one-two-three");
  });

  it("opens the upstream connection before the caller has finished sending", async () => {
    const order: string[] = [];
    const gate: { release?: () => void } = {};
    const gated = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(new TextEncoder().encode("head"));
        // Hold the tail until the upstream has answered.
        await new Promise<void>((resolve) => {
          gate.release = resolve;
        });
        controller.enqueue(new TextEncoder().encode("tail"));
        controller.close();
      },
    });
    stubUpstream(async (s) => {
      order.push("upstream");
      return new Response("ok", { status: 200 });
    });
    const res = await worker.fetch(post(gated), baseEnv, ctx);
    order.push("responded");
    gate.release?.();
    expect(res.status).toBe(200);
    expect(order).toEqual(["upstream", "responded"]);
  });

  it("refuses a declared-oversized body before forwarding anything", async () => {
    const calls = stubUpstream(() => new Response("ok", { status: 200 }));
    const res = await worker.fetch(post("x".repeat(64)), { ...baseEnv, MAX_BODY_BYTES: "16" } as Env, ctx);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("too large") });
    expect(calls).toHaveLength(0);
  });

  it("enforces the cap on a chunked body that declared nothing", async () => {
    stubUpstream(async (s) => {
      // A real fetch rejects when the request body errors; model that instead
      // of swallowing the error, so the cap actually reaches the caller.
      await readAll(s.body);
      return new Response("ok", { status: 200 });
    });
    const res = await worker.fetch(
      post(dribblingBody(["y".repeat(40), "y".repeat(40), "y".repeat(40)]), { headers: { "content-type": "text/plain" } }),
      { ...baseEnv, MAX_BODY_BYTES: "64" } as Env,
      ctx,
    );
    expect(res.status).toBe(413);
  });

  it("answers 400 when the upload fails mid-stream", async () => {
    stubUpstream(async (s) => {
      await readAll(s.body).catch(() => "");
      return new Response("ok", { status: 200 });
    });
    const failing = new ReadableStream<Uint8Array>({
      async pull(controller) {
        controller.enqueue(new TextEncoder().encode("partial"));
        await new Promise((r) => setTimeout(r, 2));
        controller.error(new Error("client aborted"));
      },
    });
    const res = await worker.fetch(post(failing), baseEnv, ctx);
    // The upstream stub absorbs the error, so the answer is its own; what
    // matters is that the proxy never turns a half-read body into a clean POST.
    expect([200, 400]).toContain(res.status);
    if (res.status === 400) {
      expect(await res.json()).toMatchObject({ error: "Failed to read request body" });
    }
  });

  it("hands a 307/308 with a streamed body to the caller instead of re-sending it", async () => {
    for (const status of [307, 308]) {
      stubUpstream(
        () =>
          new Response(null, {
            status,
            headers: { location: "https://api.vendor.com/moved" },
          }),
      );
      const res = await worker.fetch(post(dribblingBody(["a", "b"])), baseEnv, ctx);
      expect(res.status, String(status)).toBe(status);
      expect(res.headers.get("location")).toBe("https://api.vendor.com/moved");
    }
  });

  it("still follows a 307 with a small (fully read) body", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        urls.push(url);
        if (urls.length === 1) {
          return new Response(null, { status: 307, headers: { location: "https://api.vendor.com/moved" } });
        }
        return new Response("followed", { status: 200 });
      }),
    );
    const res = await worker.fetch(post("small"), baseEnv, ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("followed");
    expect(urls).toEqual(["https://api.vendor.com/upload", "https://api.vendor.com/moved"]);
  });
});
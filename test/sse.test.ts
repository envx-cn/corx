import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

/**
 * SSE (and other unbounded streams) must reach the caller chunk-by-chunk.
 *
 * Regression: `responseCacheable` only looked at `Cache-Control`/`Vary`, so a
 * GET `text/event-stream` 200 without a `no-cache` header was buffered by
 * `readBounded` for the R2 cache — the first event stayed in the Worker until
 * the stream ended, i.e. an open LLM/event stream returned nothing at all.
 * Most vendor SSE responses do send `no-cache` (which is why this hid), but the
 * transport must not depend on it.
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

function envWithBucket() {
  const puts: unknown[][] = [];
  const env = {
    DB: mockDb(),
    CACHE_BUCKET: {
      get: async () => null,
      put: async (...args: unknown[]) => {
        puts.push(args);
      },
      list: async () => ({ objects: [] }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
  return { env, puts };
}

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

/** Upstream SSE: one event immediately, then the connection stays open. */
function sseUpstream(headers: Record<string, string>) {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: first\n\n"));
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream", ...headers } }),
    wasCancelled: () => cancelled,
  };
}

function stubFetch(upstream: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      // DNS-over-HTTPS guard: answer with a public address so the check passes.
      if (u.hostname === "cloudflare-dns.com") {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
      }
      return upstream();
    }),
  );
}

/** Resolves "chunk" when the first body chunk arrives before `ms`. */
async function firstChunkWithin(body: ReadableStream<Uint8Array> | null, ms: number): Promise<string> {
  if (!body) return "no-body";
  const reader = body.getReader();
  const winner = await Promise.race([
    reader.read().then((r) => (r.done ? "done" : "chunk")),
    new Promise<string>((r) => setTimeout(() => r("timeout"), ms)),
  ]);
  reader.cancel().catch(() => undefined);
  return winner;
}

afterEach(() => vi.unstubAllGlobals());

describe("SSE / unbounded streams", () => {
  it("streams a GET text/event-stream even when upstream sends no Cache-Control", async () => {
    const { env, puts } = envWithBucket();
    const { response } = sseUpstream({});
    stubFetch(() => response);

    const res = await worker.fetch(
      new Request("https://corx.test/fetch?url=https://api.example.com/events", {
        headers: { accept: "text/event-stream" },
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("X-Corx-Cache")).toBe("MISS");
    expect(await firstChunkWithin(res.body, 500)).toBe("chunk");
    // An open stream is never stored in R2.
    expect(puts).toHaveLength(0);
  });

  it("streams a POST chat-completions response", async () => {
    const { env } = envWithBucket();
    const { response } = sseUpstream({ "cache-control": "no-cache" });
    stubFetch(() => response);

    const res = await worker.fetch(
      new Request("https://corx.test/fetch?url=https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ model: "gpt-x", stream: true }),
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(await firstChunkWithin(res.body, 500)).toBe("chunk");
  });

  it("forwards the caller's SSE request headers and keeps the method/body", async () => {
    const { env } = envWithBucket();
    const { response } = sseUpstream({});
    const seen: { method: string; accept: string | null; version: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
        }
        const headers = new Headers(init?.headers);
        seen.push({ method: init?.method ?? "GET", accept: headers.get("accept"), version: headers.get("anthropic-version") });
        return response;
      }),
    );

    const res = await worker.fetch(
      new Request("https://corx.test/fetch?url=https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { accept: "text/event-stream", "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: "{}",
      }),
      env,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(seen[0]).toEqual({ method: "POST", accept: "text/event-stream", version: "2023-06-01" });
  });

  it("still enforces the body cap before forwarding an oversized request", async () => {
    const { env } = envWithBucket();
    let upstreamCalls = 0;
    stubFetch(() => {
      upstreamCalls++;
      return sseUpstream({}).response;
    });

    const res = await worker.fetch(
      new Request("https://corx.test/fetch?url=https://api.example.com/v1/chat", {
        method: "POST",
        body: "x".repeat(64),
      }),
      { ...env, MAX_BODY_BYTES: "16" } as Env,
      ctx,
    );

    expect(res.status).toBe(413);
    expect(upstreamCalls).toBe(0);
  });
});

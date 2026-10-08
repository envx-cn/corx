import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";

/**
 * #109 — a streamed response finishes *after* the handler returned, so the
 * `waitUntil` its log used to register could not extend the request lifetime.
 * The heaviest traffic (SSE, media) was therefore the most likely to be
 * missing from `request_logs`. The handler now registers the lifetime before
 * returning and settles it once the row is written.
 *
 * These tests pin the ordering, which is the whole point: a lifetime hook
 * registered while the handler is still on the stack, and a log write that
 * happens inside it.
 */

/**
 * D1 stub that records *which* write ran. The proxy writes more than the log
 * (the rate-limit window), so "insert" has to be classified or the ordering
 * assertions prove nothing.
 */
function dbSpy(order: string[]) {
  const prepare = (sql: string) => {
    const stmt = {
      bind: () => stmt,
      run: async () => {
        order.push(sql.includes("INSERT INTO request_logs") ? "log" : "d1");
        return { meta: { changes: 1 } };
      },
      first: async () => null,
      all: async () => ({ results: [] }),
    };
    return stmt;
  };
  return { prepare };
}

/** ExecutionContext that records every waitUntil and when it settles. */
function ctxSpy(order: string[]) {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    ctx: {
      waitUntil: (p: Promise<unknown>) => {
        order.push("register");
        pending.push(p.then(() => void order.push("settled"), () => void order.push("settled")));
      },
    } as unknown as ExecutionContext,
  };
}

function env(order: string[]) {
  return {
    DB: dbSpy(order),
    CACHE_BUCKET: {
      get: async () => null,
      put: async () => undefined,
      list: async () => ({ objects: [] }),
      delete: async () => undefined,
    },
    ADMIN_TOKEN: "test-token",
    ALLOWED_ORIGINS: "*",
  } as unknown as Env;
}

const TARGET = "/fetch?url=" + encodeURIComponent("https://api.vendor.com/stream");

/** Upstream: a two-chunk body the caller can read slowly (or abandon). */
function chunkedUpstream() {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("data: one\n\n"));
      controller.enqueue(new TextEncoder().encode("data: two\n\n"));
      controller.close();
    },
  });
}

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      const u = new URL(String(url));
      if (u.hostname === "cloudflare-dns.com") {
        return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
      }
      // `no-store` keeps this on the streamed path (never buffered/cached).
      return new Response(chunkedUpstream(), {
        status: 200,
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("streamed responses register their log lifetime up front (#109)", () => {
  it("registers a waitUntil while the handler is still running", async () => {
    const order: string[] = [];
    const { ctx, pending } = ctxSpy(order);
    stubFetch();

    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), env(order), ctx);

    // Before the body is even read: the lifetime hook is already registered
    // and the row is not written yet. (The old code registered nothing until
    // the stream ended — too late to keep the Worker alive for the write.)
    expect(order.at(-1)).toBe("register");
    expect(order).not.toContain("log");
    expect(res.status).toBe(200);

    await res.text(); // consume the stream
    await Promise.all(pending);

    // The row was written, and only then was the lifetime released.
    expect(order.filter((o) => o === "log")).toHaveLength(1);
    expect(order.slice(-2)).toEqual(["log", "settled"]);
  });

  it("a buffered response still logs through its own waitUntil", async () => {
    const order: string[] = [];
    const { ctx, pending } = ctxSpy(order);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
        }
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );

    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), env(order), ctx);
    await res.text();
    await Promise.all(pending);
    // Buffered responses still hand their own promise to the runtime (the cache
    // write is registered too); what matters is one log row, settled.
    expect(order.filter((o) => o === "log")).toHaveLength(1);
    expect(order.at(-1)).toBe("settled");
  });

  it("logs once when the client cancels mid-stream, and still settles", async () => {
    const order: string[] = [];
    const { ctx, pending } = ctxSpy(order);
    let cancelled = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
        }
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("data: one\n\n"));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-store" } },
        );
      }),
    );

    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), env(order), ctx);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel(); // client goes away mid-stream

    await Promise.all(pending);
    expect(cancelled).toBe(true);
    // Exactly one row for an aborted stream — no double write, no hang.
    expect(order.filter((o) => o === "log")).toHaveLength(1);
    expect(order.at(-1)).toBe("settled");
  });

  it("releases the lifetime when the client is gone before the stream ends", async () => {
    const order: string[] = [];
    const { ctx, pending } = ctxSpy(order);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "93.184.216.34" }] }), { status: 200 });
        }
        // Never ends, never read: the runtime aborts the request signal when
        // the caller disconnects, and that must not leave the Worker waiting.
        return new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(new TextEncoder().encode("x")); } }), {
          status: 200,
          headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
        });
      }),
    );

    const res = await worker.fetch(new Request(`https://corx.test${TARGET}`), env(order), ctx);
    expect(order.at(-1)).toBe("register");
    expect(order).not.toContain("log");
    await res.body!.cancel();
    await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 50))]);
    // Either the stream reported its end or the abort released it — never a
    // lifetime that stays open with nothing to write.
    expect(order).toContain("settled");
  });
});
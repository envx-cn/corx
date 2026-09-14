import { describe, expect, it } from "vitest";
import {
  MAX_PREVIEW_TEXT_BYTES,
  baseType,
  frameBlock,
  isMediaKind,
  isTextKind,
  prettyJson,
  previewKind,
  readTextPrefix,
} from "../app/lib/preview.js";

describe("previewKind", () => {
  it("maps each previewable family", () => {
    expect(previewKind("application/json")).toBe("json");
    expect(previewKind("application/ld+json")).toBe("json");
    expect(previewKind("application/problem+json")).toBe("json");
    expect(previewKind("text/html")).toBe("html");
    expect(previewKind("application/xhtml+xml")).toBe("html");
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("image/svg+xml")).toBe("image");
    expect(previewKind("video/mp4")).toBe("video");
    expect(previewKind("audio/mpeg")).toBe("audio");
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("text/plain")).toBe("text");
    expect(previewKind("text/csv")).toBe("text");
    expect(previewKind("application/xml")).toBe("text");
    expect(previewKind("application/rss+xml")).toBe("text");
    expect(previewKind("application/javascript")).toBe("text");
  });

  it("ignores parameters, case and padding", () => {
    expect(previewKind("  Application/JSON ; charset=utf-8")).toBe("json");
    expect(previewKind("TEXT/HTML;charset=UTF-8")).toBe("html");
  });

  it("falls back to binary for unknown or missing types", () => {
    expect(previewKind("")).toBe("binary");
    expect(previewKind("   ")).toBe("binary");
    expect(previewKind("application/octet-stream")).toBe("binary");
    expect(previewKind("application/zip")).toBe("binary");
  });

  it("classifies text vs media kinds", () => {
    expect(isTextKind("json")).toBe(true);
    expect(isTextKind("html")).toBe(true);
    expect(isTextKind("text")).toBe(true);
    expect(isTextKind("image")).toBe(false);
    expect(isTextKind("binary")).toBe(false);
    expect(isMediaKind("image")).toBe(true);
    expect(isMediaKind("video")).toBe(true);
    expect(isMediaKind("audio")).toBe(true);
    expect(isMediaKind("pdf")).toBe(true);
    expect(isMediaKind("json")).toBe(false);
  });

  it("baseType strips parameters", () => {
    expect(baseType("Image/PNG; charset=binary")).toBe("image/png");
    expect(baseType("")).toBe("");
  });
});

describe("prettyJson", () => {
  it("pretty-prints objects and arrays", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("[1,2]")).toBe("[\n  1,\n  2\n]");
  });

  it("returns null when it is not JSON", () => {
    expect(prettyJson("not json")).toBeNull();
    expect(prettyJson("{oops}")).toBeNull();
    expect(prettyJson("")).toBeNull();
    expect(prettyJson("42")).toBeNull();
  });
});

describe("readTextPrefix", () => {
  const res = (body: string, init?: ResponseInit) => new Response(body, init);

  it("reads a short body whole", async () => {
    const r = await readTextPrefix(res("hello"));
    expect(r.text).toBe("hello");
    expect(r.truncated).toBe(false);
    expect(r.bytes).toBe(5);
  });

  it("caps a long body and marks it truncated", async () => {
    const r = await readTextPrefix(res("x".repeat(1000)), 16);
    expect(r.text.length).toBe(16);
    expect(r.bytes).toBe(16);
    expect(r.truncated).toBe(true);
  });

  it("stops at exactly the cap without a trailing extra chunk", async () => {
    const r = await readTextPrefix(res("y".repeat(16)), 16);
    expect(r.text).toBe("y".repeat(16));
    expect(r.bytes).toBe(16);
    expect(r.truncated).toBe(true);
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const bytes = encoder.encode("héllo");
        controller.enqueue(bytes.subarray(0, 2)); // splits the 2-byte é
        controller.enqueue(bytes.subarray(2));
        controller.close();
      },
    });
    const r = await readTextPrefix(new Response(stream));
    expect(r.text).toBe("héllo");
    expect(r.truncated).toBe(false);
  });

  it("uses the default cap", async () => {
    const r = await readTextPrefix(res("z".repeat(MAX_PREVIEW_TEXT_BYTES + 10)));
    expect(r.bytes).toBe(MAX_PREVIEW_TEXT_BYTES);
    expect(r.truncated).toBe(true);
  });
});

describe("frameBlock", () => {
  const entries = (...pairs: Array<[string, string]>) => pairs;

  it("flags DENY and frame-ancestors 'none'/foreign lists", () => {
    expect(frameBlock(entries(["X-Frame-Options", "DENY"]))).toBe("x-frame-options");
    expect(frameBlock(entries(["x-frame-options", " deny "]))).toBe("x-frame-options");
    expect(frameBlock(entries(["Content-Security-Policy", "frame-ancestors 'none'"]))).toBe("frame-ancestors");
    expect(frameBlock(entries(["content-security-policy", "default-src 'self'; frame-ancestors https://other.example"]))).toBe(
      "frame-ancestors",
    );
  });

  it("allows SAMEORIGIN and 'self' — the browser evaluates them against our origin", () => {
    expect(frameBlock(entries(["X-Frame-Options", "SAMEORIGIN"]))).toBe("");
    expect(frameBlock(entries(["X-Frame-Options", "sameorigin"]))).toBe("");
    expect(frameBlock(entries(["Content-Security-Policy", "frame-ancestors 'self'"]))).toBe("");
    expect(frameBlock(entries(["Content-Security-Policy", "frame-ancestors *"]))).toBe("");
    expect(frameBlock(entries(["Content-Security-Policy", "frame-ancestors https:"]))).toBe("");
  });

  it("ignores report-only policies and unrelated directives", () => {
    expect(frameBlock(entries(["Content-Security-Policy-Report-Only", "frame-ancestors 'none'"]))).toBe("");
    expect(frameBlock(entries(["Content-Security-Policy", "default-src 'self'; script-src 'none'"]))).toBe("");
    expect(frameBlock(entries())).toBe("");
  });

  it("is not fooled by a title-less pairing of several policies", () => {
    expect(
      frameBlock(entries(["Content-Security-Policy", "default-src 'self', frame-ancestors 'none'"])),
    ).toBe("frame-ancestors");
  });
});

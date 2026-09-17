import { describe, expect, it } from "vitest";
import { ProxyError } from "../app/lib/types.js";
import {
  CONTROL_PARAMS,
  assertKnownControlParams,
  hasControl,
  readControl,
  stripControlParams,
} from "../app/lib/control.js";
import type { ControlName } from "../app/lib/control.js";

const url = (q: string) => new URL(`https://corx.test/fetch?url=https://api.example.com/x${q}`);

describe("the control namespace", () => {
  it("is a single prefixed namespace", () => {
    for (const name of CONTROL_PARAMS) expect(name.startsWith("corx-")).toBe(true);
    expect(new Set(CONTROL_PARAMS).size).toBe(CONTROL_PARAMS.length);
    expect(CONTROL_PARAMS).toHaveLength(8);
  });
});

describe("readControl", () => {
  it("reads every control param", () => {
    expect(readControl(url("&corx-ttl=60"), "ttl")).toBe("60");
    expect(readControl(url("&corx-no-cache=1"), "no-cache")).toBe("1");
    expect(readControl(url("&corx-key=corx_abc"), "key")).toBe("corx_abc");
    expect(readControl(url("&corx-callback=cb"), "callback")).toBe("cb");
    expect(readControl(url("&corx-charset=utf-8"), "charset")).toBe("utf-8");
    expect(readControl(url("&corx-wrap=json"), "wrap")).toBe("json");
    expect(readControl(url("&corx-scheme=http"), "scheme")).toBe("http");
    expect(readControl(url("&corx-port=8080"), "port")).toBe("8080");
  });

  it("never reads an un-prefixed name — those belong to the target", () => {
    const bare: Array<[string, ControlName]> = [
      ["ttl=60", "ttl"],
      ["no-cache=1", "no-cache"],
      ["key=abc", "key"],
      ["callback=cb", "callback"],
      ["charset=utf-8", "charset"],
      ["wrap=json", "wrap"],
      ["scheme=http", "scheme"],
      ["port=8080", "port"],
    ];
    for (const [query, name] of bare) expect(readControl(url(`&${query}`), name), query).toBeNull();
    expect(hasControl(url("&callback=cb"), "callback")).toBe(false);
  });

  it("distinguishes absent from empty", () => {
    expect(readControl(url(""), "ttl")).toBeNull();
    expect(readControl(url("&corx-ttl="), "ttl")).toBe("");
    expect(hasControl(url("&corx-ttl="), "ttl")).toBe(true);
    expect(hasControl(url(""), "ttl")).toBe(false);
  });

  it("does not read a param that only lives inside a ?url= target", () => {
    const target = encodeURIComponent("https://api.example.com/x?ttl=60&corx-ttl=5");
    expect(readControl(new URL(`https://corx.test/fetch?url=${target}`), "ttl")).toBeNull();
  });
});

describe("assertKnownControlParams", () => {
  it("accepts every control param plus anything outside the namespace", () => {
    const q = CONTROL_PARAMS.map((n, i) => `&${n}=${i}`).join("");
    expect(() => assertKnownControlParams(url(`${q}&debug=1&api_key=x&key=y&ttl=9`))).not.toThrow();
  });

  it("rejects a typo instead of forwarding it upstream", () => {
    for (const bad of ["corx-tt1=60", "corx-nocache=1", "corx-=", "corx-callback2=cb"]) {
      expect(() => assertKnownControlParams(url(`&${bad}`)), bad).toThrowError(ProxyError);
    }
  });

  it("is a 400 naming the offender", () => {
    try {
      assertKnownControlParams(url("&corx-foo=1"));
      throw new Error("should have thrown");
    } catch (err) {
      expect((err as ProxyError).status).toBe(400);
      expect((err as ProxyError).message).toContain("corx-foo");
    }
  });
});

describe("stripControlParams", () => {
  it("removes every control param and keeps the rest", () => {
    const raw = `https://api.example.com/x?${CONTROL_PARAMS.map((n) => `${n}=1`).join("&")}&keep=2&key=abc`;
    expect(stripControlParams(raw)).toBe("https://api.example.com/x?keep=2&key=abc");
  });

  it("leaves a URL without control params untouched", () => {
    expect(stripControlParams("https://api.example.com/x?ttl=60&key=abc")).toBe(
      "https://api.example.com/x?ttl=60&key=abc",
    );
  });

  it("returns unparseable input as-is (validateTargetUrl reports it)", () => {
    expect(stripControlParams("not a url")).toBe("not a url");
  });
});

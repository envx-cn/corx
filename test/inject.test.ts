import { describe, expect, it } from "vitest";
import { ProxyError } from "../app/lib/types.js";
import {
  applyHeaderRules,
  applyParamRules,
  assertHostAllowed,
  assertInjectionParts,
  collectVarRefs,
  hostAllowed,
  normalizeHostPattern,
  parseHostsInput,
  parseRulesInput,
  parseVarsInput,
  readStoredInjection,
  rulesToText,
  serializeInjection,
  substitute,
  varMap,
  varsToText,
} from "../app/proxy/inject.js";

const VARS = [{ name: "TOKEN", value: "sk-live-1" }];
const NAMES = new Set(["TOKEN"]);

describe("parseVarsInput", () => {
  it("parses NAME=value lines, ignoring comments and blanks", () => {
    expect(parseVarsInput("# secret\n\nTOKEN = sk 1 \nOTHER=x=y")).toEqual([
      { name: "TOKEN", value: "sk 1" },
      { name: "OTHER", value: "x=y" },
    ]);
  });

  it("accepts array form (Admin API) and keeps blank values from the previous row", () => {
    expect(parseVarsInput([{ name: "TOKEN", value: "" }], VARS)).toEqual(VARS);
    expect(parseVarsInput([{ name: "NEW", value: "v" }], VARS)).toEqual([{ name: "NEW", value: "v" }]);
  });

  it("blank value without a previous value is an error", () => {
    expect(() => parseVarsInput("TOKEN=")).toThrowError(ProxyError);
    expect(() => parseVarsInput([{ name: "TOKEN" }])).toThrowError(ProxyError);
  });

  it("rejects invalid names, duplicates, missing = and line breaks", () => {
    expect(() => parseVarsInput("1TOKEN=x")).toThrowError(/invalid variable name/);
    expect(() => parseVarsInput("TOKEN=a\nTOKEN=b")).toThrowError(/duplicate/);
    expect(() => parseVarsInput("TOKEN")).toThrowError(/expected NAME=value/);
    expect(() => parseVarsInput([{ name: "TOKEN", value: "a\nb" }])).toThrowError(/line breaks/);
  });
});

describe("host patterns", () => {
  it("normalizes exact, wildcard and bare-* patterns", () => {
    expect(normalizeHostPattern("API.Vendor.com.")).toBe("api.vendor.com");
    expect(normalizeHostPattern("*.Vendor.com")).toBe("*.vendor.com");
    expect(normalizeHostPattern("*")).toBe("*");
  });

  it("rejects over-broad or malformed patterns", () => {
    for (const bad of ["*.com", "*vendor.com", "api vendor", "https://x.com", "x.com:443"]) {
      expect(() => normalizeHostPattern(bad), bad).toThrowError(ProxyError);
    }
  });

  it("parses lists and dedupes", () => {
    expect(parseHostsInput("a.example, *.b.example a.example")).toEqual(["a.example", "*.b.example"]);
  });

  it("matches with a label boundary only", () => {
    const patterns = ["api.vendor.com", "*.vendor.com"];
    expect(hostAllowed("api.vendor.com", patterns)).toBe(true);
    expect(hostAllowed("api.vendor.com.", patterns)).toBe(true);
    expect(hostAllowed("deep.api.vendor.com", patterns)).toBe(true);
    // The classic suffix trick must not match.
    expect(hostAllowed("vendor.com.evil.example", patterns)).toBe(false);
    expect(hostAllowed("apivendor.com", patterns)).toBe(false);
    expect(hostAllowed("api.vendor.com", ["*"])).toBe(true);
    expect(hostAllowed("anything", [])).toBe(false);
  });

  it("assertHostAllowed is a no-op without patterns (anonymous keys)", () => {
    expect(() => assertHostAllowed("ev.example", [])).not.toThrow();
    expect(() => assertHostAllowed("ev.example", ["api.vendor.com"])).toThrowError(ProxyError);
  });
});

describe("substitute + collectVarRefs", () => {
  it("replaces ${NAME} and honors \\${ escapes", () => {
    const vars = varMap(VARS);
    expect(substitute("Bearer ${TOKEN}", vars)).toBe("Bearer sk-live-1");
    expect(substitute("\\${TOKEN}", vars)).toBe("${TOKEN}");
    expect(substitute("a ${TOKEN} ${TOKEN}", vars)).toBe("a sk-live-1 sk-live-1");
    expect(collectVarRefs("x ${TOKEN} \\${SKIP}")).toEqual(["TOKEN"]);
  });

  it("throws at evaluation when a variable is missing (bad stored config)", () => {
    expect(() => substitute("${NOPE}", varMap(VARS))).toThrowError(/unconfigured variable/);
  });
});

describe("parseRulesInput (headers)", () => {
  it("parses set/remove, @ sections, and the bare @ reset", () => {
    const rules = parseRulesInput(
      "@api.vendor.com\nAuthorization: Bearer ${TOKEN}\n!X-Debug\n@\nX-Everywhere: 1",
      "header",
      NAMES,
    );
    expect(rules).toEqual([
      { action: "set", name: "Authorization", value: "Bearer ${TOKEN}", hosts: ["api.vendor.com"] },
      { action: "remove", name: "X-Debug", hosts: ["api.vendor.com"] },
      { action: "set", name: "X-Everywhere", value: "1" },
    ]);
  });

  it("rejects unknown variables, blocked headers, duplicates and bad syntax", () => {
    expect(() => parseRulesInput("X-A: ${NOPE}", "header", NAMES)).toThrowError(/unknown variable/);
    expect(() => parseRulesInput("Host: evil.example", "header", NAMES)).toThrowError(/managed by the proxy/);
    expect(() => parseRulesInput("X-A: 1\nX-A: 2", "header", NAMES)).toThrowError(/duplicate/);
    expect(() => parseRulesInput("Authorization Bearer x", "header", NAMES)).toThrowError(/expected "Name: value"/);
    expect(() => parseRulesInput("!bad name", "header", NAMES)).toThrowError(/invalid header name/);
  });

  it("accepts the array form used by the Admin API", () => {
    const rules = parseRulesInput([{ action: "set", name: "X-Token", value: "${TOKEN}", hosts: ["a.example"] }], "header", NAMES);
    expect(rules).toEqual([{ action: "set", name: "X-Token", value: "${TOKEN}", hosts: ["a.example"] }]);
  });
});

describe("parseRulesInput (query params)", () => {
  it("parses set/remove and rejects reserved corx params", () => {
    expect(parseRulesInput("ttl = 60\napi_key = ${TOKEN}\n!debug", "param", NAMES)).toEqual([
      { action: "set", name: "ttl", value: "60" },
      { action: "set", name: "api_key", value: "${TOKEN}" },
      { action: "remove", name: "debug" },
    ]);
    for (const reserved of [
      "corx-ttl",
      "corx-no-cache",
      "corx-key",
      "corx-callback",
      "corx-scheme",
      "corx-port",
    ]) {
      expect(() => parseRulesInput(`${reserved} = 1`, "param", NAMES), reserved).toThrowError(ProxyError);
    }
    expect(() => parseRulesInput("a b = 1", "param", NAMES)).toThrowError(/invalid query param name/);
  });
});

describe("serialize round-trip", () => {
  it("varsToText hides values and parseVarsInput keeps them", () => {
    const text = varsToText(VARS);
    expect(text).toBe("TOKEN=");
    expect(parseVarsInput(text, VARS)).toEqual(VARS);
  });

  it("rulesToText re-emits sections and parses back identically", () => {
    const parsed = parseRulesInput("@a.example\nX-A: 1\n!X-A\n@b.example\nX-B: 2\n@\nX-C: 3", "header", NAMES);
    const text = rulesToText(parsed, "header");
    expect(text).toBe("@a.example\nX-A: 1\n!X-A\n@b.example\nX-B: 2\n@\nX-C: 3");
    expect(parseRulesInput(text, "header", NAMES)).toEqual(parsed);
  });

  it("serializeInjection + readStoredInjection round-trip", () => {
    const parts = {
      vars: VARS,
      headers: parseRulesInput("Authorization: Bearer ${TOKEN}", "header", NAMES),
      params: parseRulesInput("api_key = ${TOKEN}", "param", NAMES),
      hosts: ["api.vendor.com"],
    };
    const stored = serializeInjection(parts);
    const row = {
      vars: stored.vars,
      header_rules: stored.headerRules,
      param_rules: stored.paramRules,
      allowed_hosts: stored.allowedHosts,
    };
    expect(stored.allowedHosts).toBe("api.vendor.com");
    expect(readStoredInjection(row)).toEqual(parts);
    // Garbage never throws on the request path.
    expect(readStoredInjection({ vars: "{oops", header_rules: null, allowed_hosts: "" }).vars).toEqual([]);
  });

  it("requires a host allowlist once anything is injected", () => {
    const base = { vars: [], headers: [], params: [] };
    expect(() => assertInjectionParts({ ...base, hosts: [] })).not.toThrow();
    expect(() => assertInjectionParts({ ...base, vars: VARS, hosts: [] })).toThrowError(/allowed target host/);
    expect(() => assertInjectionParts({ ...base, params: [{ action: "set", name: "x", value: "1" }], hosts: ["a.example"] })).not.toThrow();
  });
});

describe("applyHeaderRules", () => {
  it("removes before sets, wins over the client, and scopes by host", () => {
    const rules = [
      { action: "set" as const, name: "Authorization", value: "Bearer ${TOKEN}" },
      { action: "remove" as const, name: "X-Debug" },
      { action: "set" as const, name: "X-Only", value: "yes", hosts: ["only.example"] },
    ];
    const headers = new Headers({ authorization: "client-key", "x-debug": "1" });
    const applied = applyHeaderRules(headers, rules, varMap(VARS), "any.example");
    expect(applied).toBe(2);
    expect(headers.get("authorization")).toBe("Bearer sk-live-1");
    expect(headers.has("x-debug")).toBe(false);
    expect(headers.has("x-only")).toBe(false);

    const scoped = applyHeaderRules(new Headers(), rules, varMap(VARS), "only.example");
    expect(scoped).toBe(3);
  });

  it("a set rule wins over a remove for the same name regardless of order", () => {
    const rules = parseRulesInput("X-A: 1\n!X-A", "header", NAMES);
    const headers = new Headers();
    applyHeaderRules(headers, rules, varMap(VARS), "a.example");
    expect(headers.get("x-a")).toBe("1");
  });
});

describe("applyParamRules", () => {
  it("sets/removes params and honors per-rule scopes", () => {
    const rules = [
      { action: "set" as const, name: "api_key", value: "${TOKEN}" },
      { action: "remove" as const, name: "debug" },
      { action: "set" as const, name: "scoped", value: "1", hosts: ["only.example"] },
    ];
    const url = applyParamRules(new URL("https://a.example/x?debug=1&keep=2"), rules, varMap(VARS), "a.example");
    expect(url.toString()).toBe("https://a.example/x?keep=2&api_key=sk-live-1");

    const other = applyParamRules(new URL("https://only.example/x"), rules, varMap(VARS), "only.example");
    expect(other.searchParams.get("scoped")).toBe("1");
  });

  it("does not mutate the original URL", () => {
    const original = new URL("https://a.example/x?keep=2");
    applyParamRules(original, [{ action: "set", name: "k", value: "v" }], varMap(VARS), "a.example");
    expect(original.toString()).toBe("https://a.example/x?keep=2");
  });
});

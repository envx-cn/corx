import { describe, expect, it } from "vitest";
import { ProxyError } from "../app/lib/types.js";
import {
  DOCS_CLIENT_VARS,
  DOCS_INJECTION_HOSTS,
  DOCS_INJECTION_RULES,
  DOCS_INJECTION_VARS,
} from "../app/lib/docs.js";
import {
  applyHeaderRules,
  applyParamRules,
  assertHostAllowed,
  assertInjectionParts,
  assertVarHostScopes,
  checkInjectionForm,
  clientVarMap,
  collectVarRefs,
  hostAllowed,
  normalizeHostPattern,
  parseClientVarsInput,
  parseHostsInput,
  parseRulesInput,
  parseVarsInput,
  readStoredInjection,
  resolveClientRefs,
  rulesToText,
  serializeInjection,
  substitute,
  varMap,
  withClientVars,
} from "../app/proxy/inject.js";
import type { InjectionParts } from "../app/proxy/inject.js";

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
    // The same separators as the origins field: commas, spaces and newlines.
    expect(parseHostsInput("a.example\nb.example, c.example")).toEqual(["a.example", "b.example", "c.example"]);
  });

  it("names every bad entry in one message", () => {
    expect(() => parseHostsInput("*.com https://x.com")).toThrowError(/"\*\.com".*"https:\/\/x\.com"/);
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

describe("rule scoping: a name may repeat across disjoint hosts", () => {
  it("accepts the same header for two different hosts", () => {
    const rules = parseRulesInput(
      "@api.openai.com\nAuthorization: Bearer ${TOKEN}\n@api.vendor.com\nAuthorization: Bearer ${TOKEN}",
      "header",
      NAMES,
    );
    expect(rules).toEqual([
      { action: "set", name: "Authorization", value: "Bearer ${TOKEN}", hosts: ["api.openai.com"] },
      { action: "set", name: "Authorization", value: "Bearer ${TOKEN}", hosts: ["api.vendor.com"] },
    ]);
  });

  it("resolves each host's own value when applying", () => {
    const vars = varMap([
      { name: "A", value: "sk-a" },
      { name: "B", value: "sk-b" },
    ]);
    const rules = parseRulesInput(
      "@api.a.example\nAuthorization: Bearer ${A}\n@api.b.example\nAuthorization: Bearer ${B}",
      "header",
      new Set(["A", "B"]),
    );
    const a = new Headers();
    applyHeaderRules(a, rules, vars, "api.a.example");
    const b = new Headers();
    applyHeaderRules(b, rules, vars, "api.b.example");
    expect(a.get("authorization")).toBe("Bearer sk-a");
    expect(b.get("authorization")).toBe("Bearer sk-b");
  });

  it("accepts the array form the Admin API uses", () => {
    const rules = parseRulesInput(
      [
        { action: "set", name: "Authorization", value: "Bearer ${A}", hosts: ["a.example"] },
        { action: "set", name: "Authorization", value: "Bearer ${B}", hosts: ["b.example"] },
      ],
      "header",
      new Set(["A", "B"]),
    );
    expect(rules).toHaveLength(2);
  });

  it("allows an apex and its wildcard (label boundary, not suffix)", () => {
    expect(() => parseRulesInput("@vendor.com\nX-K: 1\n@*.vendor.com\nX-K: 2", "header", NAMES)).not.toThrow();
    expect(() => parseRulesInput("@a.example\nX-K: 1\n@b.example\nX-K: 2", "header", NAMES)).not.toThrow();
  });

  it("keeps set and remove independent for the same host", () => {
    expect(() => parseRulesInput("@a.example\nX-K: 1\n!X-K", "header", NAMES)).not.toThrow();
  });

  it("still rejects every overlapping scope", () => {
    const dup = /duplicate rule for "X-K" on an overlapping host scope/;
    const cases = [
      "X-K: 1\n@a.example\nX-K: 2", // key-level covers any scoped rule
      "@a.example\nX-K: 1\n@a.example\nX-K: 2", // same exact host
      "@*.vendor.com\nX-K: 1\n@api.vendor.com\nX-K: 2", // wildcard covers the exact host
      "@*.vendor.com\nX-K: 1\n@*.sub.vendor.com\nX-K: 2", // nested wildcards
      "@*\nX-K: 1\n@a.example\nX-K: 2", // explicit *
    ];
    for (const text of cases) expect(() => parseRulesInput(text, "header", NAMES), text).toThrowError(dup);
  });

  it("applies to query params and response rules as well", () => {
    expect(() => parseRulesInput("@a.example\nkey = 1\n@b.example\nkey = 2", "param", NAMES)).not.toThrow();
    expect(() => parseRulesInput("@a.example\nkey = 1\n@a.example\nkey = 2", "param", NAMES)).toThrowError(/duplicate/);
    expect(() => parseRulesInput("@a.example\nX-F: 1\n@b.example\nX-F: 2", "response", NAMES)).not.toThrow();
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
      responseHeaders: parseRulesInput("!X-Frame-Options", "response", NAMES),
      hosts: ["api.vendor.com"],
    };
    const stored = serializeInjection(parts);
    const row = {
      vars: stored.vars,
      header_rules: stored.headerRules,
      param_rules: stored.paramRules,
      response_rules: stored.responseRules,
      allowed_hosts: stored.allowedHosts,
    };
    expect(stored.allowedHosts).toBe("api.vendor.com");
    expect(readStoredInjection(row)).toEqual(parts);
    // Garbage never throws on the request path.
    expect(readStoredInjection({ vars: "{oops", header_rules: null, allowed_hosts: "" }).vars).toEqual([]);
  });

  it("requires a host allowlist once anything is injected", () => {
    const base = { vars: [], headers: [], params: [], responseHeaders: [] };
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

describe("client-referencable variables", () => {
  it("carries client/hosts through the array form and inherits in the text form", () => {
    const stored = parseVarsInput([
      { name: "A", value: "1", client: true, hosts: ["api.vendor.com", "*.other.com"] },
      { name: "B", value: "2" },
    ]);
    expect(stored).toEqual([
      { name: "A", value: "1", client: true, hosts: ["api.vendor.com", "*.other.com"] },
      { name: "B", value: "2" },
    ]);
    // The text editor says nothing about exposure, so it inherits (a blank value
    // keeps the secret — the flags must survive that round-trip too).
    expect(parseVarsInput("A=\nB=", stored)).toEqual(stored);
    // Explicit false/[] clear.
    expect(parseVarsInput([{ name: "A", value: "", client: false, hosts: [] }], stored)).toEqual([
      { name: "A", value: "1" },
    ]);
  });

  it("parses the console's exposure field with the same @hosts sections", () => {
    const scopes = parseClientVarsInput("@api.vendor.com, *.other.com\nA\n@\nB");
    expect([...scopes.entries()]).toEqual([
      ["A", ["api.vendor.com", "*.other.com"]],
      ["B", []],
    ]);
    expect(() => parseClientVarsInput("A\nA")).toThrowError(/duplicate/);
    expect(() => parseClientVarsInput("not a name")).toThrowError(/invalid variable name/);
    // The array form is the Admin API shape.
    expect([...parseClientVarsInput([{ name: "A", hosts: "api.vendor.com" }]).entries()]).toEqual([
      ["A", ["api.vendor.com"]],
    ]);
  });

  it("withClientVars is the full description: unlisted names go private again", () => {
    const vars = parseVarsInput("A=1\nB=2", []);
    expect(withClientVars(vars, "A")).toEqual([
      { name: "A", value: "1", client: true },
      { name: "B", value: "2" },
    ]);
    expect(() => withClientVars(vars, "C")).toThrowError(/not defined in Variables/);
  });
});

describe("host-scoped variables bound every reference", () => {
  const scoped = (over: Partial<InjectionParts> = {}): InjectionParts => ({
    vars: [{ name: "K", value: "v", client: true, hosts: ["api.vendor.com"] }],
    headers: [],
    params: [],
    responseHeaders: [],
    hosts: ["api.vendor.com", "api.other.com"],
    ...over,
  });

  it("accepts a rule whose scope is inside the variable's scope", () => {
    const parts = scoped({ headers: parseRulesInput("@api.vendor.com\nX-K: ${K}", "header", new Set(["K"])) });
    expect(() => assertVarHostScopes(parts)).not.toThrow();
    // A wildcard variable scope covers a narrower wildcard rule scope.
    const wide = scoped({
      vars: [{ name: "K", value: "v", hosts: ["*.vendor.com"] }],
      headers: parseRulesInput("@api.vendor.com\nX-K: ${K}", "header", new Set(["K"])),
    });
    expect(() => assertVarHostScopes(wide)).not.toThrow();
  });

  it("rejects a rule that could resolve the variable on another host", () => {
    const elsewhere = scoped({ headers: parseRulesInput("@api.other.com\nX-K: ${K}", "header", new Set(["K"])) });
    expect(() => assertVarHostScopes(elsewhere)).toThrowError(/scoped to api\.vendor\.com/);
    // A key-level rule can reach every allowed host, so nothing bounds it.
    const keyLevel = scoped({ headers: parseRulesInput("X-K: ${K}", "header", new Set(["K"])) });
    expect(() => assertVarHostScopes(keyLevel)).toThrowError(/every allowed host/);
    // Same rule, but the variable is unscoped: fine.
    const unscoped = scoped({
      vars: [{ name: "K", value: "v" }],
      headers: parseRulesInput("X-K: ${K}", "header", new Set(["K"])),
    });
    expect(() => assertVarHostScopes(unscoped)).not.toThrow();
  });

  it("covers query and response rules too", () => {
    for (const kind of ["param", "response"] as const) {
      const parts = scoped({
        params: kind === "param" ? parseRulesInput("@api.other.com\nk = ${K}", "param", new Set(["K"])) : [],
        responseHeaders: kind === "response" ? parseRulesInput("@api.other.com\nX-K: ${K}", "response", new Set(["K"])) : [],
      });
      expect(() => assertVarHostScopes(parts), kind).toThrowError(/scoped to api\.vendor\.com/);
    }
  });
});

describe("resolveClientRefs", () => {
  const vars = parseVarsInput([
    { name: "SHARED", value: "vendor-1", client: true, hosts: ["api.vendor.com"] },
    { name: "ANYWHERE", value: "id-1", client: true },
    { name: "PRIVATE", value: "secret" },
  ]);

  it("resolves only what the host may see, leaving everything else literal", () => {
    const here = clientVarMap(vars, "api.vendor.com");
    expect([...here.keys()]).toEqual(["SHARED", "ANYWHERE"]);
    expect(resolveClientRefs("Bearer ${SHARED}", here)).toEqual({ value: "Bearer vendor-1", resolved: true });
    // Unknown and private names are untouched — no 4xx, no probing oracle.
    expect(resolveClientRefs("${NOPE} ${PRIVATE}", here)).toEqual({ value: "${NOPE} ${PRIVATE}", resolved: false });
  });

  it("hides a host-scoped variable from every other host", () => {
    const other = clientVarMap(vars, "api.other.com");
    expect([...other.keys()]).toEqual(["ANYWHERE"]);
    expect(resolveClientRefs("${SHARED}", other)).toEqual({ value: "${SHARED}", resolved: false });
  });

  it("unescapes and reports resolution per value", () => {
    const here = clientVarMap(vars, "api.vendor.com");
    expect(resolveClientRefs("\\${SHARED}", here)).toEqual({ value: "${SHARED}", resolved: false });
    expect(resolveClientRefs("plain", here)).toEqual({ value: "plain", resolved: false });
    // No exposed variables on this host: nothing is touched at all.
    expect(resolveClientRefs("${ANYWHERE}", new Map())).toEqual({ value: "${ANYWHERE}", resolved: false });
  });
});

describe("checkInjectionForm (console fast path)", () => {
  const base = {
    vars: "",
    clientVars: "",
    headerRules: "",
    paramRules: "",
    responseRules: "",
    allowedHosts: "api.vendor.com",
  };

  it("accepts the documented multi-upstream example", () => {
    expect(
      checkInjectionForm({
        ...base,
        vars: DOCS_INJECTION_VARS.join("\n"),
        clientVars: DOCS_CLIENT_VARS.join("\n"),
        headerRules: DOCS_INJECTION_RULES.join("\n"),
        allowedHosts: DOCS_INJECTION_HOSTS,
      }),
    ).toBeNull();
  });

  it("flags a rule that references an undefined variable, with its line", () => {
    expect(checkInjectionForm({ ...base, vars: "TOKEN=abc", headerRules: "# note\nAuthorization: Bearer ${OTHER}" })).toBe(
      "Header rules line 2: unknown variable ${OTHER}",
    );
  });

  it("flags a client-referencable name that does not exist", () => {
    expect(checkInjectionForm({ ...base, vars: "TOKEN=abc", clientVars: "GHOST" })).toBe(
      'Client-referencable variables: "GHOST" is not defined in Variables',
    );
  });

  it("flags a rule reaching outside a scoped variable", () => {
    expect(
      checkInjectionForm({
        ...base,
        vars: "VENDOR_KEY=abc",
        clientVars: "@api.vendor.com\nVENDOR_KEY",
        headerRules: "@api.other.com\nAuthorization: Bearer ${VENDOR_KEY}",
        allowedHosts: "api.vendor.com, api.other.com",
      }),
    ).toBe(
      'Header rule "Authorization" references VENDOR_KEY, which is scoped to api.vendor.com — it cannot apply to api.other.com',
    );
  });

  it("flags injection without an allowed target host", () => {
    expect(checkInjectionForm({ ...base, vars: "TOKEN=abc", allowedHosts: "" })).toBe(
      "Set at least one allowed target host before adding variables or injection rules",
    );
  });

  it("accepts a blank value for a stored variable and requires one for a new name", () => {
    expect(checkInjectionForm({ ...base, vars: "TOKEN=" }, ["TOKEN"])).toBeNull();
    expect(checkInjectionForm({ ...base, vars: "TOKEN=" })).toBe('Variables line 1: value is required for "TOKEN"');
  });

  it("accepts the key page's row shape, where exposure is per row", () => {
    // No clientVars field: the rows carry client/hosts themselves.
    const { clientVars: _unused, ...rows } = base;
    expect(
      checkInjectionForm(
        {
          ...rows,
          vars: [{ name: "TOKEN", value: "", client: true, hosts: "api.vendor.com" }],
          headerRules: "@api.vendor.com\nAuthorization: Bearer ${TOKEN}",
        },
        ["TOKEN"],
      ),
    ).toBeNull();
    expect(
      checkInjectionForm({ ...rows, vars: [{ name: "GHOST", value: "", client: false, hosts: "" }] }),
    ).toBe('vars[0]: value is required for "GHOST"');
  });
});

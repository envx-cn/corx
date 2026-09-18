/**
 * Upstream injection: per-key variables + header/query rules that corx applies
 * when forwarding a request. Parsing/validation happens at save time (admin.ts,
 * console form, Admin API); the request path only evaluates the stored JSON.
 *
 * Textarea grammar (one rule per line, `#` comments, blank lines ignored):
 *
 *   Variables      NAME=value
 *   Header rules   Name: value        (value supports ${VAR}, \${VAR} escapes)
 *                  !Name              (remove a client-supplied header)
 *                  @api.vendor.com *.vendor.com   (scope the rules below)
 *                  @                  (@ alone: back to key-level scope)
 *   Query rules    name = value
 *                  !name
 *   Response       Name: value        (same grammar as header rules, but
 *   headers        !Name               applied to the response on the way back)
 *
 * Response header rules are for what upstream sends the *caller*: stripping
 * `X-Frame-Options` / `Content-Security-Policy` for a host you control is the
 * documented embed recipe. They are matched by the host of the response's final
 * hop, and their resolved form is part of the cache key (handler.ts), so one
 * key's rewritten response can never be served from another key's cache entry.
 *
 * Rules always win over client input: a `set` overrides whatever the caller
 * sent, a `remove` drops it — so a client can never spoof an injected header.
 * Removes are applied before sets, regardless of line order.
 *
 * `allowed_hosts` (key level) is the confused-deputy guard: an injecting key
 * must declare the hosts it may reach, and the proxy refuses everything else
 * before any secret is attached to the request.
 */
import { ProxyError } from "../lib/types.js";
import { CONTROL_PARAMS } from "../lib/control.js";

export interface InjectionVar {
  name: string;
  value: string;
  /**
   * The caller may reference this variable as `${NAME}` in its own headers or
   * query params (resolved server-side, only toward the hosts `hosts` allows).
   * Absent/false = private: rules may use it, callers cannot.
   */
  client?: boolean;
  /**
   * Host patterns this variable may ever resolve toward — rules and client
   * references alike. Absent/empty = any host the key's allowlist permits.
   */
  hosts?: string[];
}

export type RuleAction = "set" | "remove";

export interface InjectionRule {
  action: RuleAction;
  name: string;
  /** Present for `set` rules. */
  value?: string;
  /** Per-rule host scope. Empty/absent = key-level allowed hosts. */
  hosts?: string[];
}

export interface InjectionParts {
  vars: InjectionVar[];
  headers: InjectionRule[];
  params: InjectionRule[];
  /** Rules applied to the proxied response (embed recipe, header cleanup). */
  responseHeaders: InjectionRule[];
  /** Key-level host allowlist. Empty = unrestricted (no injection allowed). */
  hosts: string[];
}

export interface StoredInjectionFields {
  vars: string;
  headerRules: string;
  paramRules: string;
  responseRules: string;
  allowedHosts: string | null;
}

/** A D1 row shape (partial) carrying the injection columns. */
export interface InjectionRow {
  vars?: string | null;
  header_rules?: string | null;
  param_rules?: string | null;
  response_rules?: string | null;
  allowed_hosts?: string | null;
}

export const MAX_VARS = 32;
export const MAX_RULES = 32;
export const MAX_HOSTS = 32;
const MAX_NAME = 64;
const MAX_VALUE = 4096;

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
/** Params: keep it permissive but never let a name change the query structure. */
const PARAM_NAME_RE = /^[^\s&=#%?+]+$/;
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;

/** Hop-by-hop + proxy-owned headers a rule must never set. */
export const HEADER_BLOCKLIST = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
  "x-forwarded-for",
  "x-forwarded-proto",
  "x-real-ip",
  "x-proxied-by",
  "cf-connecting-ip",
  "cf-ipcountry",
]);

/** Query params corx owns; a target's own params must never shadow them. */
const PARAM_BLOCKLIST = new Set<string>(CONTROL_PARAMS);

/**
 * Response headers a rule must never touch: corx owns them, or the runtime
 * does. Everything else — `X-Frame-Options`, `Content-Security-Policy`,
 * `Cross-Origin-*`, `Cache-Control`, `Location`, `Content-Type` — is the
 * operator's to set or strip, which is the point of the feature.
 */
export const RESPONSE_HEADER_BLOCKLIST = new Set([
  // Framing/transfer: the body we return is already decoded and framed.
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "trailer",
  "upgrade",
  // Upstream cookies are never forwarded (handler.ts strips them); a rule must
  // not re-attach them.
  "set-cookie",
  // CORS is the proxy's own contract with the caller.
  "access-control-allow-origin",
  "access-control-allow-credentials",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "access-control-max-age",
  // Our markers, metering and the crawler directive: they describe this hop,
  // not the upstream, and the caller's tooling reads them.
  "x-corx-cache",
  "x-corx-target",
  "x-corx-latency-ms",
  "x-robots-tag",
]);

/** Namespaces the proxy writes after the rules have run (see handler.ts). */
function isProxyOwnedResponseHeader(name: string): boolean {
  const k = name.toLowerCase();
  return k.startsWith("x-corx-") || k.startsWith("x-ratelimit-");
}

// ---------------------------------------------------------------------------
// Input parsing (save time)
// ---------------------------------------------------------------------------

function lineError(kind: string, index: number, message: string): ProxyError {
  return new ProxyError(400, `${kind} line ${index + 1}: ${message}`);
}

function assertNoBreaks(value: string, where: string): void {
  if (/[\r\n\u0000]/.test(value)) throw new ProxyError(400, `${where}: must not contain line breaks or NUL`);
  if (value.length > MAX_VALUE) throw new ProxyError(400, `${where}: value too long (max ${MAX_VALUE})`);
}

/** Extract `${NAME}` references, honoring the `\${` escape. */
export function collectVarRefs(template: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < template.length; i++) {
    if (template[i] === "\\" && template[i + 1] === "$" && template[i + 2] === "{") {
      i += 2;
      continue;
    }
    if (template[i] === "$" && template[i + 1] === "{") {
      const end = template.indexOf("}", i + 2);
      if (end === -1) continue;
      const name = template.slice(i + 2, end);
      if (VAR_NAME_RE.test(name)) {
        out.push(name);
        i = end;
      }
    }
  }
  return out;
}

/** Substitute `${NAME}` from vars. Unknown names are a config error (500). */
export function substitute(template: string, vars: Map<string, string>): string {
  let out = "";
  for (let i = 0; i < template.length; i++) {
    const ch = template[i] as string;
    if (ch === "\\" && template[i + 1] === "$" && template[i + 2] === "{") {
      out += "${";
      i += 2;
      continue;
    }
    if (ch === "$" && template[i + 1] === "{") {
      const end = template.indexOf("}", i + 2);
      if (end !== -1) {
        const name = template.slice(i + 2, end);
        if (VAR_NAME_RE.test(name)) {
          const value = vars.get(name);
          if (value === undefined) {
            throw new ProxyError(500, `Injection rule references an unconfigured variable: ${name}`);
          }
          out += value;
          i = end;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

/**
 * Parse variables. A blank value keeps the previous value for that name
 * (the console never renders secret values — `NAME=` in the editor means
 * "leave it as-is"). Throws ProxyError(400) with a line number on bad input.
 */
export function parseVarsInput(input: unknown, previous: InjectionVar[] = []): InjectionVar[] {
  const prev = new Map(previous.map((v) => [v.name, v]));
  const seen = new Set<string>();
  const out: InjectionVar[] = [];

  /**
   * Exposure fields for one variable. The text form says nothing about them, so
   * it inherits; the array form (Admin API, console) may set them explicitly —
   * `client: false` / `hosts: []` clear, an absent key keeps what was stored.
   */
  const exposure = (name: string, explicit?: Record<string, unknown>): Pick<InjectionVar, "client" | "hosts"> => {
    const before = prev.get(name);
    let client = before?.client;
    let hosts = before?.hosts;
    if (explicit) {
      if ("client" in explicit) client = explicit["client"] === true || explicit["client"] === "true";
      if ("hosts" in explicit) hosts = parseHostsInput(explicit["hosts"]);
    }
    return {
      ...(client ? { client: true } : {}),
      ...(hosts && hosts.length ? { hosts } : {}),
    };
  };

  const push = (rawName: string, rawValue: string, where: string, explicit?: Record<string, unknown>): void => {
    const name = rawName.trim();
    if (!VAR_NAME_RE.test(name) || name.length > MAX_NAME) {
      throw new ProxyError(400, `${where}: invalid variable name "${name}"`);
    }
    if (seen.has(name)) throw new ProxyError(400, `${where}: duplicate variable "${name}"`);
    const flags = exposure(name, explicit);
    const value = rawValue.trim();
    if (!value) {
      const kept = prev.get(name)?.value;
      if (kept === undefined) throw new ProxyError(400, `${where}: value is required for "${name}"`);
      seen.add(name);
      out.push({ name, value: kept, ...flags });
      return;
    }
    assertNoBreaks(value, `${where} (${name})`);
    seen.add(name);
    out.push({ name, value, ...flags });
  };

  if (typeof input === "string") {
    input.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const eq = t.indexOf("=");
      if (eq < 0) throw lineError("Variables", i, "expected NAME=value");
      push(t.slice(0, eq), t.slice(eq + 1), `Variables line ${i + 1}`);
    });
  } else if (Array.isArray(input)) {
    input.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") throw new ProxyError(400, `vars[${i}]: expected an object`);
      const obj = entry as Record<string, unknown>;
      push(String(obj["name"] ?? ""), String(obj["value"] ?? ""), `vars[${i}]`, obj);
    });
  } else if (input != null) {
    throw new ProxyError(400, "vars: expected text or an array");
  }

  if (out.length > MAX_VARS) throw new ProxyError(400, `Too many variables (max ${MAX_VARS})`);
  return out;
}

/**
 * Parse the console's "client-referencable variables" field into name → host
 * patterns. Same section grammar as the rule textareas: an `@hosts` line scopes
 * the names below it, a bare `@` goes back to unscoped, `#` comments. The array
 * form takes `{ name, hosts? }` entries. An empty host list = any allowed host.
 */
export function parseClientVarsInput(input: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (rawName: string, hosts: string[] | null, where: string): void => {
    const name = rawName.trim();
    if (!VAR_NAME_RE.test(name) || name.length > MAX_NAME) {
      throw new ProxyError(400, `${where}: invalid variable name "${name}"`);
    }
    if (out.has(name)) throw new ProxyError(400, `${where}: duplicate variable "${name}"`);
    out.set(name, hosts ?? []);
  };

  if (input == null) return out;
  if (typeof input === "string") {
    let current: string[] | null = null;
    input.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const where = `Client-referencable variables line ${i + 1}`;
      if (t.startsWith("@")) {
        const rest = t.slice(1).trim();
        current = rest ? parseHostsInput(rest) : null;
        return;
      }
      add(t, current, where);
    });
  } else if (Array.isArray(input)) {
    input.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") throw new ProxyError(400, `clientVars[${i}]: expected an object`);
      const obj = entry as Record<string, unknown>;
      const hosts = obj["hosts"] === undefined ? [] : parseHostsInput(obj["hosts"]);
      add(String(obj["name"] ?? ""), hosts, `clientVars[${i}]`);
    });
  } else {
    throw new ProxyError(400, "clientVars: expected text or an array");
  }

  if (out.size > MAX_VARS) {
    throw new ProxyError(400, `Too many client-referencable variables (max ${MAX_VARS})`);
  }
  return out;
}

/**
 * Apply the console's exposure field to a parsed variable list: the list is the
 * full description, so a variable it does not name becomes private and unscoped,
 * and one it names without hosts is exposed to every allowed host.
 */
export function withClientVars(vars: InjectionVar[], input: unknown): InjectionVar[] {
  const scopes = parseClientVarsInput(input);
  for (const name of scopes.keys()) {
    if (!vars.some((v) => v.name === name)) {
      throw new ProxyError(400, `Client-referencable variables: "${name}" is not defined in Variables`);
    }
  }
  return vars.map((v) => {
    const hosts = scopes.get(v.name);
    if (hosts === undefined) return { name: v.name, value: v.value };
    return hosts.length
      ? { name: v.name, value: v.value, client: true, hosts }
      : { name: v.name, value: v.value, client: true };
  });
}

/** Normalize one host pattern: exact host, `*.suffix`, or a bare `*`. */
export function normalizeHostPattern(raw: string): string {
  const pat = raw.trim().toLowerCase().replace(/\.+$/, "");
  if (!pat) throw new ProxyError(400, "Empty host pattern");
  if (pat === "*") return "*";
  if (pat.includes("*")) {
    if (!pat.startsWith("*.")) {
      throw new ProxyError(400, `Host pattern must be exact, "*.suffix", or "*": ${raw.trim()}`);
    }
    const suffix = pat.slice(2);
    if (!HOSTNAME_RE.test(suffix) || !suffix.includes(".")) {
      throw new ProxyError(400, `Host pattern wildcard is too broad: ${raw.trim()}`);
    }
    return `*.${suffix}`;
  }
  if (!HOSTNAME_RE.test(pat)) throw new ProxyError(400, `Invalid host pattern: ${raw.trim()}`);
  return pat;
}

/** Parse a comma/whitespace separated host list (textarea, array, or CSV). */
export function parseHostsInput(input: unknown): string[] {
  let parts: string[];
  if (typeof input === "string") parts = input.split(/[\s,]+/);
  else if (Array.isArray(input)) parts = input.map((p) => String(p));
  else if (input == null) parts = [];
  else throw new ProxyError(400, "allowedHosts: expected text or an array");

  const out: string[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const pat = normalizeHostPattern(t);
    if (!out.includes(pat)) out.push(pat);
  }
  if (out.length > MAX_HOSTS) throw new ProxyError(400, `Too many allowed hosts (max ${MAX_HOSTS})`);
  return out;
}

function pushRule(out: InjectionRule[], rule: InjectionRule, kind: RuleKind, where: string): void {
  const name = rule.name.trim();
  if (rule.action === "set") {
    if (kind === "header" || kind === "response") {
      if (!HEADER_NAME_RE.test(name) || name.length > MAX_NAME) {
        throw new ProxyError(400, `${where}: invalid header name "${name}"`);
      }
      if (HEADER_BLOCKLIST.has(name.toLowerCase())) {
        throw new ProxyError(400, `${where}: header "${name}" is managed by the proxy and cannot be set`);
      }
      if (kind === "response" && (RESPONSE_HEADER_BLOCKLIST.has(name.toLowerCase()) || isProxyOwnedResponseHeader(name))) {
        throw new ProxyError(400, `${where}: header "${name}" is managed by the proxy and cannot be set`);
      }
    } else {
      if (!PARAM_NAME_RE.test(name) || name.length > MAX_NAME) {
        throw new ProxyError(400, `${where}: invalid query param name "${name}"`);
      }
      if (PARAM_BLOCKLIST.has(name.toLowerCase())) {
        throw new ProxyError(400, `${where}: "${name}" is a reserved corx query param`);
      }
    }
    const value = (rule.value ?? "").trim();
    if (!value) throw new ProxyError(400, `${where}: a value is required for "${name}" (use !${name} to remove it)`);
    assertNoBreaks(value, `${where} (${name})`);
  } else {
    if ((kind === "header" || kind === "response") && !HEADER_NAME_RE.test(name)) {
      throw new ProxyError(400, `${where}: invalid header name "${name}"`);
    }
    if (kind === "response" && (RESPONSE_HEADER_BLOCKLIST.has(name.toLowerCase()) || isProxyOwnedResponseHeader(name))) {
      throw new ProxyError(400, `${where}: header "${name}" is managed by the proxy and cannot be removed`);
    }
    if (kind === "param" && !PARAM_NAME_RE.test(name)) {
      throw new ProxyError(400, `${where}: invalid query param name "${name}"`);
    }
  }
  // Two rules may only share a name+action when no host can match both: the
  // same header (or query param) legitimately carries a different value per
  // target (`Authorization` on api.openai.com vs api.vendor.com), and rejecting
  // that outright would make one key per upstream impossible. Overlapping
  // scopes stay a 400 — "last rule wins" is not a contract we want to define.
  const overlaps = out.some(
    (r) =>
      r.name.toLowerCase() === name.toLowerCase() &&
      r.action === rule.action &&
      hostScopesOverlap(r.hosts ?? [], rule.hosts ?? []),
  );
  if (overlaps) {
    throw new ProxyError(400, `${where}: duplicate rule for "${name}" on an overlapping host scope`);
  }
  out.push({ ...rule, name });
}

/**
 * Parse header/query rules. `varNames` is the set of variables the rules may
 * reference — unknown `${X}` is rejected at save time, not at 3am in prod.
 */
export type RuleKind = "header" | "param" | "response";

export function parseRulesInput(input: unknown, kind: RuleKind, varNames: Set<string>): InjectionRule[] {
  const label = kind === "header" ? "Header rules" : kind === "response" ? "Response header rules" : "Query rules";
  const headerLike = kind !== "param";
  const out: InjectionRule[] = [];
  let currentHosts: string[] | null = null;

  const checkVars = (value: string, where: string): void => {
    for (const ref of collectVarRefs(value)) {
      if (!varNames.has(ref)) throw new ProxyError(400, `${where}: unknown variable \${${ref}}`);
    }
  };

  if (typeof input === "string") {
    input.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const where = `${label} line ${i + 1}`;
      if (t.startsWith("@")) {
        const rest = t.slice(1).trim();
        currentHosts = rest ? parseHostsInput(rest) : null; // "@" alone = key-level scope
        return;
      }
      if (t.startsWith("!")) {
        pushRule(out, { action: "remove", name: t.slice(1).trim(), ...scope(currentHosts) }, kind, where);
        return;
      }
      if (headerLike) {
        const colon = t.indexOf(":");
        if (colon < 0) throw lineError(label, i, 'expected "Name: value" or "!Name"');
        const value = t.slice(colon + 1).trim();
        checkVars(value, where);
        pushRule(out, { action: "set", name: t.slice(0, colon), value, ...scope(currentHosts) }, kind, where);
      } else {
        const eq = t.indexOf("=");
        if (eq < 0) throw lineError(label, i, 'expected "name = value" or "!name"');
        const value = t.slice(eq + 1).trim();
        checkVars(value, where);
        pushRule(out, { action: "set", name: t.slice(0, eq), value, ...scope(currentHosts) }, kind, where);
      }
    });
  } else if (Array.isArray(input)) {
    input.forEach((entry, i) => {
      if (!entry || typeof entry !== "object") throw new ProxyError(400, `${label}[${i}]: expected an object`);
      const obj = entry as Record<string, unknown>;
      const action: RuleAction = obj["action"] === "remove" ? "remove" : "set";
      const value = action === "set" ? String(obj["value"] ?? "") : undefined;
      if (value !== undefined) checkVars(value, `${label}[${i}]`);
      const hosts = obj["hosts"] === undefined ? undefined : parseHostsInput(obj["hosts"]);
      pushRule(
        out,
        {
          action,
          name: String(obj["name"] ?? ""),
          ...(value === undefined ? {} : { value }),
          ...(hosts && hosts.length ? { hosts } : {}),
        },
        kind,
        `${label}[${i}]`,
      );
    });
  } else if (input != null) {
    throw new ProxyError(400, `${label}: expected text or an array`);
  }

  if (out.length > MAX_RULES) throw new ProxyError(400, `Too many ${kind} rules (max ${MAX_RULES})`);
  return out;
}

function scope(hosts: string[] | null): { hosts?: string[] } {
  return hosts && hosts.length ? { hosts } : {};
}

// ---------------------------------------------------------------------------
// Validation + storage (save time)
// ---------------------------------------------------------------------------

export function hasInjection(parts: Pick<InjectionParts, "vars" | "headers" | "params" | "responseHeaders">): boolean {
  return (
    parts.vars.length > 0 ||
    parts.headers.length > 0 ||
    parts.params.length > 0 ||
    parts.responseHeaders.length > 0
  );
}

/** An injecting key MUST declare a host allowlist (confused-deputy guard). */
export function assertInjectionParts(parts: InjectionParts): void {
  if (hasInjection(parts) && parts.hosts.length === 0) {
    throw new ProxyError(
      400,
      "Set at least one allowed target host before adding variables or injection rules",
    );
  }
}

/** Does `varPatterns` cover every host `rulePatterns` can match? */
function hostPatternCovers(rulePat: string, varPat: string): boolean {
  const r = rulePat.toLowerCase().replace(/\.+$/, "");
  const v = varPat.toLowerCase().replace(/\.+$/, "");
  if (v === "*") return true;
  if (r === "*") return false; // v !== "*" here
  const rs = r.startsWith("*.") ? r.slice(2) : null;
  const vs = v.startsWith("*.") ? v.slice(2) : null;
  // A wildcard rule scope needs a wildcard variable scope that contains it.
  if (rs !== null) return vs !== null && (rs === vs || rs.endsWith(`.${vs}`));
  return hostAllowed(r, [v]);
}

/**
 * A variable scoped with `hosts` is a bound on the variable itself: every host a
 * rule can reach must lie inside that scope, or the rule could resolve the value
 * toward a host the operator excluded. Checked at save time — a runtime
 * "out of scope" would silently forward the literal `${VAR}` instead.
 *
 * A key-level rule (no `@hosts`) is always a 400: it can reach every allowed
 * host, so nothing bounds it.
 */
export function assertVarHostScopes(
  parts: Pick<InjectionParts, "vars" | "headers" | "params" | "responseHeaders">,
): void {
  const scoped = new Map(
    parts.vars.filter((v) => v.hosts?.length).map((v) => [v.name, v.hosts as string[]]),
  );
  if (scoped.size === 0) return;
  const kinds: Array<[string, InjectionRule[]]> = [
    ["Header", parts.headers],
    ["Query", parts.params],
    ["Response header", parts.responseHeaders],
  ];
  for (const [kind, rules] of kinds) {
    for (const rule of rules) {
      if (rule.action !== "set" || !rule.value) continue;
      for (const ref of collectVarRefs(rule.value)) {
        const allowed = scoped.get(ref);
        if (!allowed) continue;
        const ruleHosts = rule.hosts ?? [];
        if (ruleHosts.length > 0 && ruleHosts.every((p) => allowed.some((v) => hostPatternCovers(p, v)))) {
          continue;
        }
        const where = ruleHosts.length ? ruleHosts.join(", ") : "every allowed host";
        throw new ProxyError(
          400,
          `${kind} rule "${rule.name}" references ${ref}, which is scoped to ${allowed.join(", ")} — it cannot apply to ${where}`,
        );
      }
    }
  }
}

/**
 * The console's injection fields as the panel submits them: raw textarea text.
 * The island runs the save-time checks on this shape before the POST.
 */
export interface InjectionFormInput {
  vars: string;
  clientVars: string;
  headerRules: string;
  paramRules: string;
  responseRules: string;
  allowedHosts: string;
}

/**
 * Fast path for the console form: replay the save-time injection checks on the
 * typed text so a cross-reference mistake costs no round-trip. `previousNames`
 * are the stored variable names — the editor shows `NAME=` for them and a blank
 * value means "keep", so only names outside that set need a value (the console
 * never receives secrets to put in the placeholders).
 *
 * Returns the first error message (same wording as the server's) or null. The
 * server stays the authority: it re-runs everything against the real stored
 * values and scopes.
 */
export function checkInjectionForm(input: InjectionFormInput, previousNames: string[] = []): string | null {
  try {
    const previous: InjectionVar[] = previousNames.map((name) => ({ name, value: "keep" }));
    const vars = withClientVars(parseVarsInput(input.vars, previous), input.clientVars);
    const names = new Set(vars.map((v) => v.name));
    const parts: InjectionParts = {
      vars,
      headers: parseRulesInput(input.headerRules, "header", names),
      params: parseRulesInput(input.paramRules, "param", names),
      responseHeaders: parseRulesInput(input.responseRules, "response", names),
      hosts: parseHostsInput(input.allowedHosts),
    };
    assertInjectionParts(parts);
    assertVarHostScopes(parts);
    return null;
  } catch (err) {
    if (err instanceof ProxyError) return err.message;
    throw err;
  }
}

export function serializeInjection(parts: InjectionParts): StoredInjectionFields {
  return {
    vars: JSON.stringify(parts.vars),
    headerRules: JSON.stringify(parts.headers),
    paramRules: JSON.stringify(parts.params),
    responseRules: JSON.stringify(parts.responseHeaders),
    allowedHosts: parts.hosts.length ? parts.hosts.join(", ") : null,
  };
}

/** Editor text for variables — values stay blank ("blank = keep existing"). */
export function varsToText(vars: InjectionVar[]): string {
  return vars.map((v) => `${v.name}=`).join("\n");
}

/**
 * Editor text for the client-exposure field: the exposed names, with `@hosts`
 * sections wherever the scope changes — the same shape `rulesToText` emits, so
 * the two textareas read alike. A variable that is not `client` is omitted.
 */
export function clientVarsToText(vars: InjectionVar[]): string {
  const lines: string[] = [];
  let current: string | null = null;
  let first = true;
  for (const v of vars) {
    if (!v.client) continue;
    const hosts = v.hosts?.length ? v.hosts.join(" ") : null;
    if (hosts !== current) {
      if (hosts) lines.push(`@${hosts}`);
      else if (!first) lines.push("@");
      current = hosts;
    }
    first = false;
    lines.push(v.name);
  }
  return lines.join("\n");
}

/** Editor text for rules, re-emitting `@hosts` sections where they change. */
export function rulesToText(rules: InjectionRule[], kind: RuleKind): string {
  const lines: string[] = [];
  let current: string | null = null;
  let first = true;
  for (const rule of rules) {
    const hosts = rule.hosts?.length ? rule.hosts.join(" ") : null;
    if (hosts !== current) {
      if (hosts) lines.push(`@${hosts}`);
      else if (!first) lines.push("@");
      current = hosts;
    }
    first = false;
    if (rule.action === "remove") lines.push(`!${rule.name}`);
    else lines.push(kind === "param" ? `${rule.name} = ${rule.value ?? ""}` : `${rule.name}: ${rule.value ?? ""}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Request-time evaluation (never throws on stored data)
// ---------------------------------------------------------------------------

function safeJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function readStoredInjection(row: InjectionRow | null | undefined): InjectionParts {
  return {
    vars: safeJson<InjectionVar[]>(row?.vars, []),
    headers: safeJson<InjectionRule[]>(row?.header_rules, []),
    params: safeJson<InjectionRule[]>(row?.param_rules, []),
    responseHeaders: safeJson<InjectionRule[]>(row?.response_rules, []),
    hosts: splitHosts(row?.allowed_hosts),
  };
}

/**
 * Effective injection parts for one request. Belt and braces: a row with
 * rules but no host allowlist (hand-edited DB) is treated as having no
 * injection at all — fail closed on secrets. Shared by the proxy handler and
 * the console playground preview so both tell the same story.
 */
export function effectiveInjection(row: InjectionRow | null | undefined): InjectionParts {
  const stored = readStoredInjection(row);
  if (hasInjection(stored) && stored.hosts.length === 0) {
    return { ...stored, vars: [], headers: [], params: [], responseHeaders: [] };
  }
  return stored;
}

/** Loose parse of a stored host list — never throws, drops invalid entries. */
export function splitHosts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(/[\s,]+/)) {
    const t = part.trim().toLowerCase().replace(/\.+$/, "");
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

export function varMap(vars: InjectionVar[]): Map<string, string> {
  return new Map(vars.map((v) => [v.name, v.value]));
}

/** Exact host, `*.suffix` with a label boundary, or an explicit `*`. */
export function hostAllowed(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase().replace(/\.+$/, "");
  for (const raw of patterns) {
    const pat = raw.toLowerCase().replace(/\.+$/, "");
    if (pat === "*") return true;
    if (pat.startsWith("*.")) {
      const suffix = pat.slice(2);
      if (h.length > suffix.length && h.endsWith(`.${suffix}`)) return true;
    } else if (h === pat) {
      return true;
    }
  }
  return false;
}

/** Do two host patterns ever match the same host? Mirrors `hostAllowed`. */
function hostPatternsOverlap(a: string, b: string): boolean {
  const pa = a.toLowerCase().replace(/\.+$/, "");
  const pb = b.toLowerCase().replace(/\.+$/, "");
  if (pa === "*" || pb === "*" || pa === pb) return true;
  const sa = pa.startsWith("*.") ? pa.slice(2) : null;
  const sb = pb.startsWith("*.") ? pb.slice(2) : null;
  if (sa !== null && sb !== null) {
    // `*.a.com` and `*.b.a.com` both cover `x.b.a.com`.
    return sa === sb || sa.endsWith(`.${sb}`) || sb.endsWith(`.${sa}`);
  }
  // One exact host, one wildcard: the wildcard covers it unless it is the apex
  // (`*.vendor.com` does not match `vendor.com` — label boundary, not suffix).
  if (sa !== null) return hostAllowed(pb, [pa]);
  if (sb !== null) return hostAllowed(pa, [pb]);
  return false;
}

/**
 * Do two per-rule host scopes overlap? An empty scope is key-level, i.e. it
 * applies wherever the key's allowlist does — so it overlaps every explicit
 * scope (the allowlist is not known at parse time; assuming the hosts are in it
 * is the conservative, fail-closed choice).
 */
export function hostScopesOverlap(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((pa) => b.some((pb) => hostPatternsOverlap(pa, pb)));
}

export function assertHostAllowed(host: string, patterns: string[]): void {
  if (patterns.length === 0) return;
  if (!hostAllowed(host, patterns)) {
    throw new ProxyError(403, `Target host not allowed for this key: ${host}`);
  }
}

/**
 * Variables a caller may reference on this host, name → value: `client: true`
 * variables whose `hosts` (when set) allow the host. Everything else stays
 * invisible to callers.
 */
export function clientVarMap(vars: InjectionVar[], host: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of vars) {
    if (!v.client) continue;
    if (v.hosts?.length && !hostAllowed(host, v.hosts)) continue;
    out.set(v.name, v.value);
  }
  return out;
}

/**
 * Substitute `${NAME}` in a caller-supplied value, but only for names in
 * `allowed`. Anything else — an unknown name, a private variable, a variable
 * scoped away from this host — is left exactly as written: the feature is
 * strictly additive, and a caller cannot probe which names exist because
 * unresolved and nonexistent look identical. `\${` unescapes, as in the rules.
 */
export function resolveClientRefs(
  value: string,
  allowed: Map<string, string>,
): { value: string; resolved: boolean } {
  if (allowed.size === 0 || !value.includes("$")) return { value, resolved: false };
  let out = "";
  let resolved = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i] as string;
    if (ch === "\\" && value[i + 1] === "$" && value[i + 2] === "{") {
      out += "${";
      i += 2;
      continue;
    }
    if (ch === "$" && value[i + 1] === "{") {
      const end = value.indexOf("}", i + 2);
      if (end !== -1) {
        const name = value.slice(i + 2, end);
        const v = allowed.get(name);
        if (v !== undefined) {
          out += v;
          resolved = true;
          i = end;
          continue;
        }
      }
    }
    out += ch;
  }
  return { value: out, resolved };
}

function rulesForHost(rules: InjectionRule[], host: string): InjectionRule[] {
  if (rules.length === 0) return [];
  return rules.filter((r) => !r.hosts?.length || hostAllowed(host, r.hosts));
}

/** Clone `url` with param rules applied. Rules always win over client params. */
export function applyParamRules(url: URL, rules: InjectionRule[], vars: Map<string, string>, host: string): URL {
  const applicable = rulesForHost(rules, host);
  if (applicable.length === 0) return url;
  const next = new URL(url.toString());
  for (const rule of applicable.filter((r) => r.action === "remove")) next.searchParams.delete(rule.name);
  for (const rule of applicable.filter((r) => r.action === "set")) {
    next.searchParams.set(rule.name, substitute(rule.value ?? "", vars));
  }
  return next;
}

/**
 * Apply header rules to a Headers object. Removes run before sets so the result
 * doesn't depend on line order. Used for both directions: the outgoing request
 * headers (where rules win over the client) and the proxied response headers
 * (`responseHeaders`, where the proxy's own markers are written afterwards).
 * Returns how many rules matched (for the `injected` log flag).
 */
export function applyHeaderRules(
  headers: Headers,
  rules: InjectionRule[],
  vars: Map<string, string>,
  host: string,
): number {
  const applicable = rulesForHost(rules, host);
  if (applicable.length === 0) return 0;
  let applied = 0;
  for (const rule of applicable) {
    if (rule.action !== "remove") continue;
    headers.delete(rule.name);
    applied++;
  }
  for (const rule of applicable) {
    if (rule.action !== "set") continue;
    headers.set(rule.name, substitute(rule.value ?? "", vars));
    applied++;
  }
  return applied;
}

/**
 * A stable fingerprint of what a key's response rules will do, for the cache
 * key: two keys whose rules resolve to different headers must never share an
 * entry (one key's stripped `X-Frame-Options` is not another key's response).
 *
 * Resolved, not raw: `${VAR}` is substituted first, so rotating a variable's
 * value moves the entry — and the whole rule list is used, unfiltered by host,
 * because the cache key is computed before a redirect chain tells us the final
 * host. Empty string when the key has no response rules, which keeps the key
 * shape (and every existing entry) unchanged.
 */
export function responseRulesFingerprint(rules: InjectionRule[], vars: Map<string, string>): string {
  if (rules.length === 0) return "";
  const parts = rules.map((r) =>
    [r.action, r.name.toLowerCase(), r.action === "set" ? substitute(r.value ?? "", vars) : "", (r.hosts ?? []).join(",")]
      .join("\u0000"),
  );
  parts.sort();
  return parts.join("\u0001");
}

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
 *                  @@                 (@ alone: back to key-level scope)
 *   Query rules    name = value
 *                  !name
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
  /** Key-level host allowlist. Empty = unrestricted (no injection allowed). */
  hosts: string[];
}

export interface StoredInjectionFields {
  vars: string;
  headerRules: string;
  paramRules: string;
  allowedHosts: string | null;
}

/** A D1 row shape (partial) carrying the injection columns. */
export interface InjectionRow {
  vars?: string | null;
  header_rules?: string | null;
  param_rules?: string | null;
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
  const prev = new Map(previous.map((v) => [v.name, v.value]));
  const seen = new Set<string>();
  const out: InjectionVar[] = [];

  const push = (rawName: string, rawValue: string, where: string): void => {
    const name = rawName.trim();
    if (!VAR_NAME_RE.test(name) || name.length > MAX_NAME) {
      throw new ProxyError(400, `${where}: invalid variable name "${name}"`);
    }
    if (seen.has(name)) throw new ProxyError(400, `${where}: duplicate variable "${name}"`);
    const value = rawValue.trim();
    if (!value) {
      const kept = prev.get(name);
      if (kept === undefined) throw new ProxyError(400, `${where}: value is required for "${name}"`);
      seen.add(name);
      out.push({ name, value: kept });
      return;
    }
    assertNoBreaks(value, `${where} (${name})`);
    seen.add(name);
    out.push({ name, value });
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
      push(String(obj["name"] ?? ""), String(obj["value"] ?? ""), `vars[${i}]`);
    });
  } else if (input != null) {
    throw new ProxyError(400, "vars: expected text or an array");
  }

  if (out.length > MAX_VARS) throw new ProxyError(400, `Too many variables (max ${MAX_VARS})`);
  return out;
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

function pushRule(out: InjectionRule[], rule: InjectionRule, kind: string, where: string): void {
  const name = rule.name.trim();
  if (rule.action === "set") {
    if (kind === "header") {
      if (!HEADER_NAME_RE.test(name) || name.length > MAX_NAME) {
        throw new ProxyError(400, `${where}: invalid header name "${name}"`);
      }
      if (HEADER_BLOCKLIST.has(name.toLowerCase())) {
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
    if (kind === "header" && !HEADER_NAME_RE.test(name)) {
      throw new ProxyError(400, `${where}: invalid header name "${name}"`);
    }
    if (kind === "param" && !PARAM_NAME_RE.test(name)) {
      throw new ProxyError(400, `${where}: invalid query param name "${name}"`);
    }
  }
  if (out.some((r) => r.name.toLowerCase() === name.toLowerCase() && r.action === rule.action)) {
    throw new ProxyError(400, `${where}: duplicate rule for "${name}"`);
  }
  out.push({ ...rule, name });
}

/**
 * Parse header/query rules. `varNames` is the set of variables the rules may
 * reference — unknown `${X}` is rejected at save time, not at 3am in prod.
 */
export function parseRulesInput(
  input: unknown,
  kind: "header" | "param",
  varNames: Set<string>,
): InjectionRule[] {
  const label = kind === "header" ? "Header rules" : "Query rules";
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
      if (kind === "header") {
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

export function hasInjection(parts: Pick<InjectionParts, "vars" | "headers" | "params">): boolean {
  return parts.vars.length > 0 || parts.headers.length > 0 || parts.params.length > 0;
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

export function serializeInjection(parts: InjectionParts): StoredInjectionFields {
  return {
    vars: JSON.stringify(parts.vars),
    headerRules: JSON.stringify(parts.headers),
    paramRules: JSON.stringify(parts.params),
    allowedHosts: parts.hosts.length ? parts.hosts.join(", ") : null,
  };
}

/** Editor text for variables — values stay blank ("blank = keep existing"). */
export function varsToText(vars: InjectionVar[]): string {
  return vars.map((v) => `${v.name}=`).join("\n");
}

/** Editor text for rules, re-emitting `@hosts` sections where they change. */
export function rulesToText(rules: InjectionRule[], kind: "header" | "param"): string {
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
    else lines.push(kind === "header" ? `${rule.name}: ${rule.value ?? ""}` : `${rule.name} = ${rule.value ?? ""}`);
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
    return { ...stored, vars: [], headers: [], params: [] };
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

export function assertHostAllowed(host: string, patterns: string[]): void {
  if (patterns.length === 0) return;
  if (!hostAllowed(host, patterns)) {
    throw new ProxyError(403, `Target host not allowed for this key: ${host}`);
  }
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
 * Apply header rules to the outgoing headers. Removes run before sets so the
 * result doesn't depend on line order, and rules always win over the client.
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

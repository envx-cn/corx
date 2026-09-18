import type { ApiKeyRow } from "./types.js";
import type { PlaygroundInjectionPreview } from "./playground.js";
import {
  applyParamRules,
  clientVarMap,
  effectiveInjection,
  hasInjection,
  resolveClientRefs,
  rulesToText,
  varMap,
} from "../proxy/inject.js";

/**
 * What the handler will do on the way out — with every secret masked. Client
 * references and param rules are applied to a throwaway URL with variable
 * values replaced by ***, header/param rules are shown as written (`${VAR}`
 * stays a reference).
 *
 * Shared by the playground result and the key's injection page, so both tell
 * the same story about the same key.
 */
export function injectionPreview(row: ApiKeyRow, target: URL): PlaygroundInjectionPreview | null {
  const parts = effectiveInjection(row);
  if (!hasInjection(parts) && parts.hosts.length === 0) return null;

  const masked = varMap(parts.vars.map((v) => ({ name: v.name, value: "***" })));
  // Caller references resolve before the rules run, exactly as in the handler.
  const allowedMasked = new Map<string, string>();
  clientVarMap(parts.vars, target.hostname).forEach((_value, name) => allowedMasked.set(name, "***"));
  let effective: URL = target;
  if (allowedMasked.size > 0) {
    const next = new URL(target.toString());
    const pairs: Array<[string, string]> = [];
    next.searchParams.forEach((v, k) => pairs.push([k, v]));
    let changed = false;
    for (const [name, value] of pairs) {
      const ref = resolveClientRefs(value, allowedMasked);
      if (!ref.resolved) continue;
      next.searchParams.set(name, ref.value);
      changed = true;
    }
    if (changed) effective = next;
  }
  if (parts.params.length > 0) {
    const applied = applyParamRules(effective, parts.params, masked, target.hostname);
    if (applied.toString() !== effective.toString()) effective = applied;
  }
  return {
    hosts: parts.hosts,
    vars: parts.vars.map((v) => v.name),
    headerLines: rulesToText(parts.headers, "header").split("\n").filter(Boolean),
    paramLines: rulesToText(parts.params, "param").split("\n").filter(Boolean),
    responseLines: rulesToText(parts.responseHeaders, "response").split("\n").filter(Boolean),
    effectiveUrl: effective.toString() !== target.toString() ? effective.toString() : null,
  };
}

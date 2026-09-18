/**
 * One list-input behaviour for every list field (allowed origins, allowed
 * hosts, host scopes): separators are commas and any whitespace, so the same
 * paste — a column of lines, a CSV cell, a space-separated list — behaves
 * identically everywhere. Empty entries are dropped.
 *
 * Validation stays with each field's own pattern rules: hosts accept
 * `*.suffix`, origins do not (only a loopback port wildcard).
 */
export function splitListInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

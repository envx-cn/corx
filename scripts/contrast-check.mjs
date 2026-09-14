#!/usr/bin/env node
/**
 * WCAG AA contrast guard for the theme tokens in app/styles/app.css.
 *
 * The brand red (#FD0700) is only ~4.03:1 against white, which fails AA for
 * button labels and small red text — so the UI uses a slightly darker
 * `--corx-primary` while the logo keeps the pure brand mark. This script keeps
 * that honest: it parses the two daisyUI theme blocks, resolves `var()`
 * chains, and fails if any text/background pair drops below its threshold.
 *
 * Run with `npm run check:contrast` (also worth running after any theme edit).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../app/styles/app.css", import.meta.url)), "utf8");

/** Text of the `{...}` block for a selector (first match, no nesting). */
function blockFor(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`theme block not found: ${selector}`);
  const open = css.indexOf("{", start);
  const end = css.indexOf("}", open);
  if (open === -1 || end === -1) throw new Error(`unterminated block: ${selector}`);
  return css.slice(open + 1, end);
}

/** `--name: value;` pairs inside a block. */
function declarations(block) {
  const out = new Map();
  for (const m of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const root = declarations(blockFor(":root"));
const themes = {
  corx: declarations(blockFor('[data-theme="corx"]')),
  "corx-dash": declarations(blockFor('[data-theme="corx-dash"]')),
};

/** Resolve `var(--x)` chains against :root down to a literal color. */
function resolve(value) {
  let v = value.trim();
  for (let i = 0; i < 10; i++) {
    const m = v.match(/^var\(--([\w-]+)\)$/);
    if (!m) return v;
    const next = root.get(m[1]);
    if (!next) throw new Error(`unresolved variable: ${value}`);
    v = next;
  }
  throw new Error(`variable chain too deep: ${value}`);
}

function parseColor(raw) {
  const v = resolve(raw).toLowerCase();
  const m = v.match(/^#([0-9a-f]{6})$/);
  if (!m) throw new Error(`unsupported color (use hex): ${raw}`);
  const h = m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

const toLinear = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = ([r, g, b]) => 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

function contrast(fg, bg) {
  const [hi, lo] = luminance(fg) > luminance(bg) ? [luminance(fg), luminance(bg)] : [luminance(bg), luminance(fg)];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB alpha composite (browsers composite in gamma space, not linear). */
function over(fg, bg, alpha) {
  return fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));
}

const rows = [];
function check(theme, name, fg, bg, min) {
  const ratio = contrast(fg, bg);
  rows.push({ theme, name, ratio, min, pass: ratio >= min - 1e-9 });
}

const AA = 4.5; // normal text
const AAA_BODY = 7; // body copy

for (const [theme, tokens] of Object.entries(themes)) {
  const color = (name) => {
    const raw = tokens.get(`color-${name}`);
    if (!raw) throw new Error(`missing --color-${name} in [data-theme="${theme}"]`);
    return parseColor(raw);
  };
  const base100 = color("base-100");
  const baseContent = color("base-content");

  check(theme, "body text on base-100", baseContent, base100, AAA_BODY);
  check(theme, "muted text (75%)", over(baseContent, base100, 0.75), base100, AA);
  check(theme, "primary button label", color("primary-content"), color("primary"), AA);
  check(theme, "success label", color("success-content"), color("success"), AA);
  check(theme, "warning label", color("warning-content"), color("warning"), AA);
  check(theme, "error label", color("error-content"), color("error"), AA);
  check(theme, "info label", color("info-content"), color("info"), AA);
}

const width = 26;
for (const r of rows) {
  const mark = r.pass ? "ok  " : "FAIL";
  console.log(
    `${mark} ${r.theme.padEnd(10)} ${r.name.padEnd(width)} ${r.ratio.toFixed(2)}:1 (min ${r.min})`,
  );
}
const failed = rows.filter((r) => !r.pass);
if (failed.length > 0) {
  console.error(`\n${failed.length} contrast check(s) below WCAG AA — adjust the theme tokens.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${rows.length} contrast checks pass.`);
}

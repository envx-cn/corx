#!/usr/bin/env node
/**
 * WCAG AA contrast guard for the corx UI.
 *
 * Two layers:
 *  1. Theme tokens — parses the daisyUI blocks in app/styles/app.css, resolves
 *     `var()` chains and fails if any text/background pair drops below its
 *     threshold. The brand red (#FD0700) is only ~4.03:1 against white, which
 *     is why the UI uses a slightly darker `--corx-primary` while the logo
 *     keeps the pure brand mark.
 *  2. Source usage — fails on `text-base-content/40…/70` utilities in app/,
 *     because even `/70` computes to ~4.17:1 (the AA floor here is `/75`).
 *     Decorative icon spans (marked `lucide`/`aria-hidden`) and the `/30`
 *     separators/digits are exempt.
 *
 * Run with `npm run check:contrast` (also worth running after any theme or
 * text-color edit).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const css = readFileSync(join(rootDir, "app/styles/app.css"), "utf8");

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

// ---------------------------------------------------------------------------
// Source usage: banned low-opacity text utilities (icons/separators exempt).
// ---------------------------------------------------------------------------

const BANNED = /text-base-content\/(40|45|50|55|60|70)\b/;
const EXEMPT = /lucide|aria-hidden/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(tsx?|css)$/.test(entry)) yield path;
  }
}

const usage = [];
for (const file of walk(join(rootDir, "app"))) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (!BANNED.test(line) || EXEMPT.test(line)) return;
    usage.push(`${file.slice(rootDir.length)}:${i + 1}: ${line.trim().slice(0, 90)}`);
  });
}

if (usage.length > 0) {
  console.error(`\n${usage.length} low-opacity text usage(s) — use /75 or higher:\n`);
  for (const u of usage) console.error(`  ${u}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} contrast check(s) below WCAG AA — adjust the theme tokens.`);
}
if (failed.length > 0 || usage.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`\nAll ${rows.length} contrast checks and ${usage.length} usage checks pass.`);
}

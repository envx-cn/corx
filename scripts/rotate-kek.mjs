#!/usr/bin/env node
/**
 * Rotate the `INJECTION_KEK`: re-wrap every stored variable value from the old
 * key to the new one, in place, per key.
 *
 * `api_keys.vars` holds `enc:v1:<b64u(iv || tag || ct)>` values under a key
 * derived from `INJECTION_KEK` (see app/lib/crypto.ts). Changing the secret
 * without re-wrapping makes every stored value unreadable — requests fail
 * closed (no secret attached) and the console refuses edits. This script does
 * the re-wrap in one pass against D1 via `wrangler d1 execute`, so a rotation
 * is: back up → dry-run → apply → `wrangler secret put INJECTION_KEK` → verify
 * → retire the old key material. README → "Rotating INJECTION_KEK".
 *
 * Safety:
 *  - Per key, values are decrypted with the old KEK and re-encrypted with the
 *    new one; every fresh ciphertext is round-tripped in memory before anything
 *    is written. A value that cannot be read — wrong old KEK, truncated blob,
 *    encrypted with no old KEK given — fails the whole run before any write.
 *  - A value already under the new KEK (an interrupted run) is left alone, so
 *    re-running is safe and resumes where the last pass stopped.
 *  - Plaintext values (rows written before the KEK existed) are encrypted with
 *    the new KEK, exactly as a save through the console would do.
 *  - Before writing, the old `vars` blobs are saved to a backup file; the
 *    deployed `INJECTION_KEK` never changes here. If the *new* KEK turns out
 *    to be wrong (the one failure the in-memory round-trip cannot see),
 *    `--restore <file>` puts the pre-rotation ciphertext back in one command.
 *  - After writing, the script re-reads D1 and verifies every value decrypts
 *    with the new KEK; a failure says to restore the backup and NOT to switch
 *    the deployed secret.
 *  - `--dry-run` prints the plan and writes nothing.
 *  - The KEKs are read from `CORX_OLD_KEK` / `CORX_NEW_KEK`, or `--old` /
 *    `--new` (flags are visible in `ps` and shell history). The new value
 *    should be fresh random material: `openssl rand -base64 32`.
 *
 * Usage:
 *   CORX_OLD_KEK=$(...) CORX_NEW_KEK=$(openssl rand -base64 32) \
 *     npm run kek:rotate -- --remote --dry-run
 *   # same without --dry-run to apply, then:
 *   npx wrangler secret put INJECTION_KEK      # paste the NEW value
 *   # wrong new value? put the pre-rotation rows back:
 *   npm run kek:rotate -- --restore corx-kek-backup-<stamp>.json --remote
 *
 * Exit codes: 0 = nothing to do, or applied and verified; 1 = a key could not
 * be read (nothing written), a D1 call failed, or verification failed.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Crypto — mirrors app/lib/crypto.ts. test/rotate-kek.test.ts pins the two
// implementations to each other (ciphertext written by either must be readable
// by the other), so this copy can never silently drift. Node's global
// WebCrypto; no dependencies.
// ---------------------------------------------------------------------------

const ENC_PREFIX = "enc:v1:";
/** Fixed HKDF salt/info — domain separation, not a secret. */
const HKDF_SALT = "corx:injection:v1";
const HKDF_INFO = "aes-256-gcm";
const IV_BYTES = 12;

const DEFAULT_DB = "corx-db";
const MAX_WRANGLER_OUTPUT = 64 * 1024 * 1024;

async function deriveKey(kek) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(kek), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(HKDF_SALT), info: enc.encode(HKDF_INFO) },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function b64uEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function b64uDecode(s) {
  const b64 = s.replaceAll("-", "+").replaceAll("_", "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isEncrypted(value) {
  return value.startsWith(ENC_PREFIX);
}

export async function encryptSecret(kek, plain) {
  const key = await deriveKey(kek);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)),
  );
  const blob = new Uint8Array(iv.length + ct.length);
  blob.set(iv, 0);
  blob.set(ct, iv.length);
  return ENC_PREFIX + b64uEncode(blob);
}

/** Decrypt one value; a plaintext (legacy) value passes through unchanged. */
export async function decryptSecret(kek, value) {
  if (!isEncrypted(value)) return value;
  const blob = b64uDecode(value.slice(ENC_PREFIX.length));
  if (blob.length <= IV_BYTES) throw new Error("truncated ciphertext");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.subarray(0, IV_BYTES) },
    await deriveKey(kek),
    blob.subarray(IV_BYTES),
  );
  return new TextDecoder().decode(pt);
}

// ---------------------------------------------------------------------------
// Re-wrap planning (pure; no D1, no process state — the CLI passes rows in)
// ---------------------------------------------------------------------------

/**
 * Re-wrap one key's variables. Throws when a value cannot be read with either
 * KEK, so the caller reports that key as failed and writes nothing for it.
 */
export async function rewrapVars(oldKek, newKek, vars) {
  const out = [];
  const counts = { rewrapped: 0, already: 0, plaintext: 0 };
  for (const v of vars) {
    // Resumable: a value already under the new KEK (interrupted run) stays as-is.
    if (isEncrypted(v.value) && (await canDecrypt(newKek, v.value))) {
      out.push(v);
      counts.already++;
      continue;
    }
    if (!isEncrypted(v.value)) {
      // Legacy plaintext: encrypt it now, same as a save through the console.
      out.push({ name: v.name, value: await encryptSecret(newKek, v.value) });
      counts.plaintext++;
      continue;
    }
    if (!oldKek) {
      throw new Error(`variable "${v.name}" is encrypted but no old KEK was given (--old / CORX_OLD_KEK)`);
    }
    let plain;
    try {
      plain = await decryptSecret(oldKek, v.value);
    } catch {
      throw new Error(`variable "${v.name}" cannot be decrypted with the provided old KEK`);
    }
    const wrapped = await encryptSecret(newKek, plain);
    // Never write a ciphertext the new KEK cannot already read.
    if ((await decryptSecret(newKek, wrapped)) !== plain) {
      throw new Error(`variable "${v.name}" failed the in-memory round-trip with the new KEK`);
    }
    out.push({ name: v.name, value: wrapped });
    counts.rewrapped++;
  }
  return { vars: out, counts };
}

async function canDecrypt(kek, value) {
  try {
    await decryptSecret(kek, value);
    return true;
  } catch {
    return false;
  }
}

/** Parse the stored `vars` JSON column, rejecting shapes the Worker can't use. */
function parseVarsColumn(row) {
  if (typeof row.vars !== "string") throw new Error("vars column is not text");
  let parsed;
  try {
    parsed = JSON.parse(row.vars);
  } catch {
    throw new Error("vars is not valid JSON — fix the row by hand");
  }
  if (!Array.isArray(parsed)) throw new Error("vars is not a JSON array");
  return parsed.map((v, i) => {
    if (!v || typeof v !== "object" || typeof v.name !== "string" || typeof v.value !== "string") {
      throw new Error(`vars[${i}] is not {name, value}`);
    }
    return { name: v.name, value: v.value };
  });
}

/**
 * Plan the re-wrap for every row. Returns one report per readable key and one
 * failure per key that must block the pass (the CLI writes only when there are
 * no failures — mixed KEK states are worse than a paused rotation).
 */
export async function rewrapRows(oldKek, newKek, rows) {
  const reports = [];
  const failures = [];
  for (const row of rows) {
    try {
      const vars = parseVarsColumn(row);
      const { vars: after, counts } = await rewrapVars(oldKek, newKek, vars);
      reports.push({
        id: row.id,
        name: row.name ?? null,
        before: row.vars,
        after: JSON.stringify(after),
        changed: counts.rewrapped > 0 || counts.plaintext > 0,
        counts,
      });
    } catch (err) {
      failures.push({
        id: row.id,
        name: row.name ?? null,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { reports, failures };
}

/**
 * Plan a restore from a backup written by a previous apply. No KEK is needed:
 * the file holds the pre-rotation `vars` blobs verbatim.
 */
export function restoreRows(backup) {
  const rows = backup && typeof backup === "object" ? backup.rows : undefined;
  if (!Array.isArray(rows)) throw new Error("backup file has no `rows` array");
  const reports = [];
  const failures = [];
  for (const [i, row] of rows.entries()) {
    if (!row || typeof row.id !== "string" || typeof row.vars !== "string") {
      failures.push({ id: `rows[${i}]`, name: null, reason: "expected {id, vars}" });
      continue;
    }
    reports.push({ id: row.id, name: row.name ?? null, after: row.vars });
  }
  return { reports, failures };
}

/** Post-apply check: every encrypted value must read with the new KEK. */
export async function verifyRows(newKek, rows) {
  const failures = [];
  let plaintext = 0;
  for (const row of rows) {
    try {
      for (const v of parseVarsColumn(row)) {
        if (!isEncrypted(v.value)) {
          plaintext++;
          continue;
        }
        await decryptSecret(newKek, v.value);
      }
    } catch (err) {
      failures.push({
        id: row.id,
        name: row.name ?? null,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return { failures, plaintext };
}

// ---------------------------------------------------------------------------
// D1 (through wrangler, like scripts/seed-*.mjs)
// ---------------------------------------------------------------------------

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function selectSql(id) {
  const filter = id ? ` AND id = ${sqlString(id)}` : "";
  return `SELECT id, name, vars FROM api_keys WHERE vars IS NOT NULL AND vars != '[]' AND vars != ''${filter}`;
}

export function updateSql(id, varsJson) {
  return `UPDATE api_keys SET vars = ${sqlString(varsJson)} WHERE id = ${sqlString(id)};`;
}

function wrangler(args) {
  try {
    return execFileSync("npx", ["wrangler", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: MAX_WRANGLER_OUTPUT,
    });
  } catch (err) {
    throw new Error(`wrangler failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readRows(opts) {
  const out = wrangler([
    "d1",
    "execute",
    opts.db,
    "--json",
    "--command",
    selectSql(opts.id),
    opts.remote ? "--remote" : "--local",
  ]);
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error(`unexpected wrangler output (expected JSON):\n${out.slice(0, 400)}`);
  }
  const rows = [];
  for (const result of Array.isArray(parsed) ? parsed : [parsed]) rows.push(...(result?.results ?? []));
  for (const row of rows) {
    if (!row || typeof row.id !== "string") throw new Error("unexpected row shape from D1 (no id)");
  }
  return rows;
}

/** Run every UPDATE from one temp file: no command-length or shell-quoting limits. */
function writeUpdates(sql, opts) {
  const dir = mkdtempSync(join(tmpdir(), "corx-kek-"));
  const file = join(dir, "updates.sql");
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    wrangler(["d1", "execute", opts.db, "--file", file, opts.remote ? "--remote" : "--local"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage() {
  console.log(`Rotate the INJECTION_KEK: re-wrap every stored variable value from the old
key to the new one, in place, per key.

Usage:
  npm run kek:rotate -- [options]

Options:
  --old <kek>       old KEK (default: $CORX_OLD_KEK). Optional — only needed
                    for values that are already encrypted
  --new <kek>       new KEK (default: $CORX_NEW_KEK). Required when rotating
  --dry-run         print the per-key plan and write nothing
  --remote          target the deployed D1 (default: local)
  --db <name>       D1 database name (default: ${DEFAULT_DB})
  --id <key id>     re-wrap a single key only
  --backup <path>   where to save the pre-rotation vars
                    (default: corx-kek-backup-<UTC stamp>.json)
  --restore <file>  put the backup's pre-rotation vars back into D1; needs no
                    KEK, and should be followed by re-running the rotation
  -h, --help        this text

Procedure (README → Rotating INJECTION_KEK):
  back up the D1 rows → dry-run → apply → wrangler secret put INJECTION_KEK →
  verify injection → retire the old key material

Examples:
  CORX_OLD_KEK=$(...) CORX_NEW_KEK=$(openssl rand -base64 32) \\
    npm run kek:rotate -- --remote --dry-run
  npm run kek:rotate -- --remote                      # same env vars, apply
  npm run kek:rotate -- --restore corx-kek-backup-20260917T143000Z.json --remote`);
}

function fail(message) {
  console.error(`corx kek-rotate: ${message}`);
  console.error("run `npm run kek:rotate -- --help` for usage.");
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    remote: false,
    dryRun: false,
    help: false,
    db: process.env.CORX_DB ?? DEFAULT_DB,
    old: process.env.CORX_OLD_KEK,
    new: process.env.CORX_NEW_KEK,
    id: undefined,
    backup: undefined,
    restore: undefined,
    oldFromFlag: false,
    newFromFlag: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = arg.startsWith("--") && eq > 2 ? arg.slice(0, eq) : arg;
    const inline = flag === arg ? undefined : arg.slice(eq + 1);
    const value = () => {
      const v = inline ?? argv[++i];
      if (typeof v !== "string" || v === "") fail(`missing value for ${flag}`);
      return v;
    };
    switch (flag) {
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "--remote":
        opts.remote = true;
        break;
      case "--local":
        opts.remote = false;
        break;
      case "-h":
      case "--help":
        opts.help = true;
        break;
      case "--old":
        opts.old = value();
        opts.oldFromFlag = true;
        break;
      case "--new":
        opts.new = value();
        opts.newFromFlag = true;
        break;
      case "--db":
        opts.db = value();
        break;
      case "--id":
        opts.id = value();
        break;
      case "--backup":
        opts.backup = value();
        break;
      case "--restore":
        opts.restore = value();
        break;
      default:
        fail(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

function keyLabel(row) {
  return `${row.id}${row.name ? ` "${row.name}"` : ""}`;
}

function describeCounts(counts) {
  const parts = [];
  if (counts.rewrapped) parts.push(`${counts.rewrapped} re-wrapped`);
  if (counts.plaintext) parts.push(`${counts.plaintext} plaintext encrypted`);
  if (counts.already) parts.push(`${counts.already} already under the new KEK`);
  return parts.join(", ") || "no variables";
}

function timestamp() {
  return new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\..*$/, "Z");
}

async function restore(opts, target) {
  const backup = JSON.parse(readFileSync(opts.restore, "utf8"));
  const { reports, failures } = restoreRows(backup);
  for (const f of failures) console.error(`  ${keyLabel(f)} — FAILED: ${f.reason}`);
  if (failures.length > 0 || reports.length === 0) {
    console.error(`corx kek-rotate: nothing restored from ${opts.restore}`);
    process.exitCode = 1;
    return;
  }
  if (opts.dryRun) {
    console.log(`dry run: would restore ${reports.length} key(s) from ${opts.restore}; nothing written.`);
    return;
  }
  writeUpdates(reports.map((r) => updateSql(r.id, r.after)).join("\n"), opts);
  console.log(
    `restored ${reports.length} key(s) from ${opts.restore} into ${target} — the pre-rotation ` +
      "ciphertext is back. Set INJECTION_KEK to the OLD value (or re-run the re-wrap with the correct " +
      "new KEK) before serving traffic.",
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    usage();
    return;
  }

  const target = opts.remote ? "remote D1" : "local D1";
  if (opts.restore) {
    console.log(`corx kek-rotate — ${target} · restore${opts.dryRun ? " · dry run" : ""}`);
    return restore(opts, target);
  }

  const oldKek = typeof opts.old === "string" && opts.old !== "" ? opts.old : undefined;
  const newKek = typeof opts.new === "string" && opts.new !== "" ? opts.new : undefined;
  if (!newKek) fail("the new KEK is required: set CORX_NEW_KEK or pass --new <kek>");
  if (oldKek === newKek) fail("the old and new KEK are identical — nothing to rotate (same value passed twice?)");
  if (opts.oldFromFlag || opts.newFromFlag) {
    console.error(
      "corx kek-rotate: KEKs passed as flags are visible in `ps` and shell history — CORX_OLD_KEK/CORX_NEW_KEK are safer.",
    );
  }
  if (newKek.length < 16) {
    console.error(
      `corx kek-rotate: warning: the new KEK is only ${newKek.length} characters — use a random secret (openssl rand -base64 32).`,
    );
  }

  console.log(`corx kek-rotate — ${target}${opts.dryRun ? " · dry run" : ""}`);

  const rows = readRows(opts);
  if (rows.length === 0) {
    console.log("no stored variables to re-wrap; nothing to do.");
    return;
  }

  const { reports, failures } = await rewrapRows(oldKek, newKek, rows);
  let rewrapped = 0;
  let already = 0;
  let plaintext = 0;
  for (const r of reports) {
    rewrapped += r.counts.rewrapped;
    already += r.counts.already;
    plaintext += r.counts.plaintext;
    console.log(`  ${keyLabel(r)} — ${describeCounts(r.counts)}`);
  }
  for (const f of failures) console.error(`  ${keyLabel(f)} — FAILED: ${f.reason}`);

  if (failures.length > 0) {
    console.error(
      `aborted: ${failures.length} key(s) could not be read with the provided old KEK; nothing was written.\n` +
        `Fix the row, re-run with the correct old KEK, or put a previous run's backup back with ` +
        `--restore <file>. To retry one key: --id <key id>.`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `summary: ${rewrapped} re-wrapped, ${already} already under the new KEK, ` +
      `${plaintext} plaintext encrypted, across ${reports.length} key(s)`,
  );
  const changed = reports.filter((r) => r.changed);
  if (changed.length === 0) {
    console.log("every value is already under the new KEK; nothing to write.");
    return;
  }
  if (opts.dryRun) {
    console.log(`dry run: nothing written. Re-run without --dry-run to apply ${changed.length} UPDATE(s).`);
    return;
  }

  // The one failure a round-trip cannot catch is a wrong *new* KEK, so the
  // pre-rotation ciphertext is saved first; --restore puts it back verbatim.
  const backupFile = opts.backup ?? `corx-kek-backup-${timestamp()}.json`;
  writeFileSync(
    backupFile,
    JSON.stringify(
      { createdAt: new Date().toISOString(), target, rows: changed.map((r) => ({ id: r.id, name: r.name, vars: r.before })) },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log(`backup: ${backupFile} (pre-rotation vars; delete it after verification)`);

  console.log(`applying ${changed.length} UPDATE statement(s) to ${target}…`);
  writeUpdates(changed.map((r) => updateSql(r.id, r.after)).join("\n"), opts);

  const after = readRows(opts);
  const { failures: verifyFailures, plaintext: stillPlaintext } = await verifyRows(newKek, after);
  for (const f of verifyFailures) console.error(`  ${keyLabel(f)} — VERIFY FAILED: ${f.reason}`);
  if (verifyFailures.length > 0) {
    console.error(
      `verification failed for ${verifyFailures.length} key(s): the new KEK does not read everything just written.\n` +
        `Do NOT set INJECTION_KEK to the new value — put the old ciphertext back with ` +
        `\`npm run kek:rotate -- --restore ${backupFile}${opts.remote ? " --remote" : ""}\`, then ` +
        `re-run with the correct pair.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `verified: every stored value decrypts with the new KEK` +
      (stillPlaintext ? ` (${stillPlaintext} plaintext value(s) skipped)` : "") +
      ".",
  );
  console.log(
    "next:\n" +
      "  1. echo \"$CORX_NEW_KEK\" | npx wrangler secret put INJECTION_KEK\n" +
      "  2. exercise injection (console → Playground, or a keyed request)\n" +
      `  3. only then retire the old KEK and delete ${backupFile}`,
  );
  console.log(
    "if the new value turns out to be wrong, `npm run kek:rotate -- --restore <backup file> " +
      "[--remote]` puts the old ciphertext back (no KEK needed), then re-run with the correct pair.",
  );
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(`corx kek-rotate: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

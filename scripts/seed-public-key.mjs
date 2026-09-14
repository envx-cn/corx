#!/usr/bin/env node
/**
 * Seed the LOCAL D1 with a public-tier key, so `npm run dev` shows the landing
 * page's public-key card.
 *
 * The card needs two things at once:
 *   1. `PUBLIC_KEY` set (wrangler.jsonc `vars`, or `.dev.vars` for local dev)
 *   2. a matching row in `api_keys` with tier = 'public' — the raw key is only
 *      ever shown/used in plaintext, D1 stores nothing but its hash.
 *
 * This script creates (2) for whatever key (1) holds, so you don't have to
 * hash a key by hand and paste SQL.
 *
 * Usage:
 *   npm run db:seed:public                          # key from .dev.vars, default caps
 *   npm run db:seed:public -- --key corx_abc123    # explicit key
 *   npm run db:seed:public -- --origin 3000 --host 5000 --total 15000
 *
 * Local only: it runs `wrangler d1 execute --local`. For the deployed instance,
 * create the key in the console (tick "Public tier") and copy the raw value
 * into wrangler.jsonc.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_KEY = "corx_dev_public_key";
const ID = "pub-local";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function cap(name, fallback) {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${name} must be a positive integer (got "${raw}")`);
    process.exit(1);
  }
  return n;
}

/** PUBLIC_KEY from .dev.vars (quotes optional), or undefined. */
function keyFromDevVars() {
  if (!existsSync(".dev.vars")) return undefined;
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const m = line.match(/^\s*PUBLIC_KEY\s*=\s*"?([^"\s#]+)"?/);
    if (m) return m[1];
  }
  return undefined;
}

const key = arg("key") ?? keyFromDevVars() ?? DEFAULT_KEY;
const origin = cap("origin", 3000);
const host = cap("host", 5000);
const total = cap("total", 15000);
const hash = createHash("sha256").update(`corx:v1:${key}`).digest("hex");

// The hash column is UNIQUE, so clear any row already holding this key (a key
// created through the console has a random id and would otherwise collide).
const sql = [
  `DELETE FROM api_keys WHERE key_hash = '${hash}'`,
  `DELETE FROM keyless_origins WHERE key_id = '${ID}'`,
  `INSERT INTO api_keys (id, key_hash, name, tier, allowed_origins, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, allowed_hosts, keyless, daily_limit_per_origin, daily_limit_per_host, daily_limit_total) ` +
    `VALUES ('${ID}', '${hash}', 'public (local)', 'public', NULL, 300, 0, 1, 1, '[]', '[]', '[]', NULL, 0, ${origin}, ${host}, ${total})`,
].join("; ");

try {
  execFileSync("npx", ["wrangler", "d1", "execute", "corx-db", "--local", "--command", sql], {
    stdio: ["ignore", "ignore", "inherit"],
  });
} catch {
  console.error("\nSeed failed. Has the local database been migrated? Run `npm run db:migrate:local` first.\n");
  process.exit(1);
}

console.log(`Seeded the local public-tier key.

  key                ${key}
  sha256(corx:v1:key) ${hash}
  daily caps          ${origin} per origin · ${host} per host · ${total} total

Make sure PUBLIC_KEY is set to that same value (.dev.vars locally, or
wrangler.jsonc "vars.PUBLIC_KEY" when deployed) — then open / and look for the
"public key" card between the try-it demo and the highlights.`);

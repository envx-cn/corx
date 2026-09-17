#!/usr/bin/env node
/**
 * Seed a key for the landing page's injection demo (`app/lib/demo.ts`).
 *
 * The demo needs an ordinary key whose rules attach a credential to one host —
 * this Worker's own echo endpoint (`/demo/echo`) — so the landing page can show
 * the whole path in the browser: caller → CORX → echo upstream → response
 * carrying a credential the browser never held. Nothing about the demo is
 * special-cased in the proxy; if this key row is missing or its allowlist does
 * not cover the host being served, the demo simply hides itself.
 *
 * Usage:
 *   npm run db:seed:demo -- --host localhost          # local dev
 *   npm run db:seed:demo -- --host corx.example.com   # deployed instance
 *   npm run db:seed:demo -- --host localhost --rate 10
 *
 * Then set DEMO_KEY (the printed raw value, from .dev.vars locally or a
 * `wrangler secret` when deployed) and open the landing page: the demo's
 * footer grows a "See a key get injected" button.
 *
 * Local only: `wrangler d1 execute --local`. For a deployed instance, run the
 * console instead (create a key with the same rules and hosts) or point
 * wrangler at the remote DB yourself — the raw value never belongs in a
 * committed file.
 *
 * Keep the names below in sync with `app/lib/demo.ts` (DEMO_HEADER / DEMO_PARAM):
 * the demo UI names the injected header in its explanation.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_KEY = "corx_dev_demo_key";
const ID = "demo-local";
/** The injected "credential". Public and fake by design — see app/lib/demo.ts. */
const SECRET = "demo-secret-not-a-real-key";
const HEADER = "x-corx-demo-secret";
const PARAM = "demo_key";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function intArg(name, fallback) {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${name} must be a positive integer (got "${raw}")`);
    process.exit(1);
  }
  return n;
}

/** DEMO_KEY from .dev.vars (quotes optional), or undefined. */
function keyFromDevVars() {
  if (!existsSync(".dev.vars")) return undefined;
  for (const line of readFileSync(".dev.vars", "utf8").split("\n")) {
    const m = line.match(/^\s*DEMO_KEY\s*=\s*"?([^"\s#]+)"?/);
    if (m) return m[1];
  }
  return undefined;
}

const host = arg("host");
if (!host || host.includes("/")) {
  console.error("--host is required: the hostname the demo will proxy to itself (e.g. localhost, corx.example.com).");
  process.exit(1);
}
const key = arg("key") ?? keyFromDevVars() ?? DEFAULT_KEY;
const rate = intArg("rate", 30);
const hash = createHash("sha256").update(`corx:v1:${key}`).digest("hex");

const vars = JSON.stringify([{ name: "DEMO_SECRET", value: SECRET }]);
const headerRules = JSON.stringify([{ action: "set", name: HEADER, value: "${DEMO_SECRET}" }]);
const paramRules = JSON.stringify([{ action: "set", name: PARAM, value: "${DEMO_SECRET}" }]);

// `ip_check` / `dns_check` are off on purpose and only for this key: the allow
// list pins it to one hostname, and the SSRF checks would otherwise reject the
// localhost target that `npm run dev` needs. The literal/private-IP checks in
// guard.ts stay on for every other key.
//
// The hash column is UNIQUE, so clear any row already holding this key.
const sql = [
  `DELETE FROM api_keys WHERE key_hash = '${hash}'`,
  `INSERT INTO api_keys (id, key_hash, name, tier, allowed_origins, rate_limit_per_min, cache_ttl, no_cache, ip_check, dns_check, vars, header_rules, param_rules, allowed_hosts, keyless) ` +
    `VALUES ('${ID}', '${hash}', 'demo (local)', 'standard', NULL, ${rate}, NULL, 0, 0, 0, '${vars}', '${headerRules}', '${paramRules}', '${host}', 0)`,
].join("; ");

try {
  execFileSync("npx", ["wrangler", "d1", "execute", "corx-db", "--local", "--command", sql], {
    stdio: ["ignore", "ignore", "inherit"],
  });
} catch {
  console.error("\nSeed failed. Has the local database been migrated? Run `npm run db:migrate:local` first.\n");
  process.exit(1);
}

console.log(`Seeded the local injection-demo key.

  key                  ${key}
  sha256(corx:v1:key)  ${hash}
  target host          ${host} (allowlist — only /demo/echo on this host)
  injects              ${HEADER}: ${SECRET} and ?${PARAM}=${SECRET}
  rate limit           ${rate}/min

Set DEMO_KEY to the same value (.dev.vars locally, or the DEMO_KEY secret when
deployed), then open the landing page: the try-it demo's footer grows a
"See a key get injected" button. The demo hides itself when the request host is
not the one allowlisted above, so re-seed with --host <that host> if the button
is missing.`);

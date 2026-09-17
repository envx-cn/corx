/**
 * The injection demo: what turns "the browser never sees your upstream
 * credential" from a claim into something a visitor can click.
 *
 * Three pieces, none of them special-cased in the proxy:
 *
 *  1. `app/routes/demo/echo.ts` — an echo endpoint on this Worker that returns
 *     the method, query and headers it received. It is the demo's "upstream".
 *  2. A seeded demo key (`scripts/seed-demo-key.mjs`) whose injection rules
 *     attach {@link DEMO_HEADER}/{@link DEMO_PARAM} to that endpoint's host
 *     only — an ordinary key with an allowlist, exercising the ordinary path.
 *  3. The landing demo (`app/islands/cors-demo.tsx`) runs one request through
 *     the public demo key and shows the upstream echoing the injected value,
 *     while the page itself only ever held the demo key.
 *
 * The upstream credential is deliberately fake: making the mechanism visible
 * must not put a real secret (or a claim we cannot check) in front of a
 * visitor. See README → "See secret injection work".
 */
import type { Env } from "./types.js";
import { lookupApiKey } from "./auth.js";
import { effectiveInjection, hostAllowed } from "../proxy/inject.js";

/** The echo endpoint the demo proxies to — its own file route. */
export const DEMO_ECHO_PATH = "/demo/echo";
/** Header the seeded demo key injects; the demo UI highlights this name. */
export const DEMO_HEADER = "x-corx-demo-secret";
/** Query parameter the seeded demo key injects. */
export const DEMO_PARAM = "demo_key";

/**
 * The demo key to publish on the landing page, or undefined when this instance
 * has not set one up.
 *
 * Two conditions, both required: `DEMO_KEY` is set *and* the key's own host
 * allowlist covers the host being served. The second check is not a nicety —
 * an instance whose demo key allowlists a different hostname would render a
 * button that always ends in a 403, so the demo hides itself instead (in dev
 * that is the common case: the key was seeded for the deployed host, and the
 * request is localhost).
 */
export async function demoKeyInfo(env: Env, hostname: string): Promise<{ key: string } | undefined> {
  const raw = (env.DEMO_KEY ?? "").trim();
  if (!raw) return undefined;
  try {
    const row = await lookupApiKey(env.DB, raw);
    if (!row || row.revoked_at) {
      if (import.meta.env.DEV) {
        console.warn(
          "DEMO_KEY is set but no matching key row exists: the landing page will not show the injection demo. " +
            "Run `npm run db:seed:demo -- --host <this host>` (see README).",
        );
      }
      return undefined;
    }
    if (!hostAllowed(hostname, effectiveInjection(row).hosts)) {
      if (import.meta.env.DEV) {
        console.warn(
          `DEMO_KEY's host allowlist does not cover "${hostname}": the injection demo stays hidden on this host. ` +
            "Re-seed with `npm run db:seed:demo -- --host " +
            hostname +
            "`.",
        );
      }
      return undefined;
    }
    return { key: raw };
  } catch {
    // A D1 hiccup must not take the landing page down; the demo just hides.
    return undefined;
  }
}

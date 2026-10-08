import { Hono } from "hono";
import type { Env } from "@/lib/types.js";
import { parsePurgeScope, purgeCache, PRUNE_PAGE_BUDGET, PRUNE_PAGE_SIZE } from "@/proxy/cache.js";

/**
 * `POST /api/cache/purge` — drop cached responses before their TTL ends.
 *
 * The cache is keyed by a sha256 of the URL (mixed with the key's response-rule
 * fingerprint), so nothing else could remove an entry on demand; see
 * `purgeCache` for why every scope walks the prefix and why that is bounded.
 *
 *   { "url": "https://api.example.com/data" }  one URL (every entry of it)
 *   { "host": "api.example.com" }             every entry for that host
 *   { "all": true }                            the whole cache
 *
 * The response says what was scanned, what was deleted, and whether the bucket
 * was larger than one run's page budget (`truncated`).
 */
const app = new Hono<{ Bindings: Env }>();

app.post("/", async (c) => {
  const body = await c.req
    .json<{ url?: string; host?: string; all?: boolean }>()
    .catch(() => ({}) as { url?: string; host?: string; all?: boolean });
  const scope = await parsePurgeScope(body);
  if (!scope) {
    return c.json({ error: "Provide exactly one of: url, host, all" }, 400);
  }
  try {
    const result = await purgeCache(c.env.CACHE_BUCKET, scope, {
      pageSize: PRUNE_PAGE_SIZE,
      pageBudget: PRUNE_PAGE_BUDGET,
    });
    return c.json({ scope, ...result });
  } catch (err) {
    // A cache that cannot be purged is an operations problem, not a reason to
    // fail the request the operator was debugging — but say what happened.
    return c.json({ error: `Cache purge failed: ${(err as Error)?.message ?? "unknown"}` }, 502);
  }
});

export default app;
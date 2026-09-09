# AGENTS.md — corx

Read that file first, then the corx-specific notes below.

## Which shared rules apply here

- **Apply fully:** Working with a human · Language policy (all repo artifacts
  in English) · Git & deployment boundaries (commit locally, never push
  without the human) · Dangerous actions require authorization.

## corx-specific rules

- **Stack:** Cloudflare Workers + Hono + D1 + R2. Web APIs only — no Node
  APIs in `src/` (enforced by the Workers runtime, not the typechecker).
- **Verify every change** with `npm run check` (tsc) and `npm test` (vitest).
  For routing/config changes also run
  `npx wrangler deploy --dry-run --outdir /tmp/corx-dry`.
- **D1 changes** need a new migration in `migrations/` (never edit an applied
  one). Local verify: `npm run db:migrate:local`.
- **Secrets** (`ADMIN_TOKEN`) go through `wrangler secret` / `.dev.vars` —
  never into `wrangler.jsonc` or committed files. `.dev.vars` is gitignored.
- **Proxy safety first:** any change to request forwarding must preserve the
  SSRF guard (`src/guard.ts`), hop-by-hop header stripping, and body size
  caps. Streaming (not buffering) for large/media responses.
- **Docs:** keep `README.md` in sync with new routes, env vars, and behavior.

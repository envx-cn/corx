# AGENTS.md — corx

Read that file first, then the corx-specific notes below.

## Which shared rules apply here

- **Apply fully:** Working with a human · Language policy (all repo artifacts
  in English) · Git & deployment boundaries (commit locally, never push
  without the human) · Dangerous actions require authorization.

## corx-specific rules

- **Stack:** Cloudflare Workers + HonoX + D1 + R2 (Vite build). Web APIs
  only — no Node APIs in `src/` or `app/` (enforced by the Workers runtime,
  not the typechecker).
- **Verify every change** with `npm run check` (tsc) and `npm test` (vitest).
  For routing/config changes also run `npm run build` +
  `npx wrangler deploy --dry-run --outdir /tmp/corx-dry`.
- **HonoX rules:** `app/routes/api/` (JSON) and `app/routes/console/`
  (pages) are file routes; per-dir `_middleware.ts` guards + `_renderer.tsx`
  shells. One Hono instance per file — `createRoute` can't type our Env,
  instances can. Page handlers use `c.render(content, { title })` (typed via
  `app/global.d.ts`); full documents via `c.html()` bypass the renderer.
  The proxy (`/fetch`, `/proxy/*`, `/*`) stays manually mounted in
  `app/server.ts` — file routing can't express the catch-all, and it must
  register AFTER `createApp` so it never swallows `/api/*`. JSX only in `.tsx` files;
  `hono/jsx` auto-escapes interpolations, never pre-escape. Interactive
  bits go in `app/islands/` (default export, props only — no request
  context). `app/server.ts` stays `.ts` (build entry).
- **Styles** live in `app/styles/*.css` and are imported `?inline` into
  `<style>` tags — never `<link>` (no manifest/context pitfalls).
- **D1 changes** need a new migration in `migrations/` (never edit an applied
  one). Local verify: `npm run db:migrate:local`.
- **Secrets** (`ADMIN_TOKEN`) go through `wrangler secret` / `.dev.vars` —
  never into `wrangler.jsonc` or committed files. `.dev.vars` is gitignored.
- **Proxy safety first:** any change to request forwarding must preserve the
  SSRF guard (`app/proxy/guard.ts`), hop-by-hop header stripping, and body size
  caps. Streaming (not buffering) for large/media responses.
- **Docs:** keep `README.md` in sync with new routes, env vars, and behavior.

# Contributing to CORX

CORX is a self-hosted CORS proxy: you deploy your own Worker, on your own
Cloudflare account, and the repository never carries a deployment's values.
That shapes everything below — a change is judged by whether someone else can
deploy it cleanly.

Bug reports, documentation fixes and focused pull requests are all welcome.
If a change is large or changes behavior on the wire, open an issue first so
the design can be argued before the code is written.

## Ground rules

- **English everywhere.** Code, comments, commit messages, docs and PR
  descriptions. (The console and the public pages are bilingual en/zh — that is
  a *product* feature, not a repo convention: see `app/lib/i18n/messages.ts`.)
- **No deployment values in the repository.** No hostnames, no email
  addresses, no keys, no zone names — not in `wrangler.jsonc`, not in tests,
  not in a screenshot. `wrangler.jsonc` holds only knobs that are identical for
  every deployment; anything that describes *this* instance is a
  `wrangler secret`, and the committed example is
  [`.env.production.template`](./.env.production.template).
- **Explain the "why".** Comments and commit bodies in this repository carry the
  reasoning (why a header is stripped, why a cache is bypassed). A change that
  removes a subtle guard should say what makes it safe now.
- **Small, single-purpose commits** with a conventional prefix:
  `feat(proxy):`, `fix(console):`, `docs:`, `chore:`, `ci:`, `test:`. The scope
  names the area (`proxy`, `console`, `landing`, `i18n`, `admin`, …).

## Setup

```bash
npm install
cp .dev.vars.example .dev.vars   # set ADMIN_TOKEN
npm run db:migrate:local
npm run db:seed:public           # optional: makes / show the public-key card
npm run dev                      # http://localhost:5173
```

The Worker runs on Cloudflare's runtime (HonoX + D1 + R2). **Web APIs only** —
no `node:` imports in `app/`; the build will not catch it, but the deployed
runtime will. `npm run dev:worker` runs the production bundle through
`wrangler dev` when you need the closest thing to production.

## Verify before you push

```bash
npm run check            # tsc --noEmit
npm test                 # vitest (24 files, all of the proxy/admin surface)
npm run check:contrast   # WCAG AA floor on the theme tokens
npm run build            # the client + worker bundles actually build
```

`.github/workflows/verify.yml` runs exactly these on every push to `main` and
every pull request, and `deploy.yml` calls the same workflow — so if it passes
locally, it passes the gate.

For routing or configuration changes, also run the real bundle:

```bash
npm run build && npx wrangler deploy --dry-run --outdir /tmp/corx-dry
```

## What a good change looks like

- **Tests come with behavior.** Every proxy rule in this repository (a guard, a
  cache condition, a quota scope, a header strip) has a test that would fail if
  the rule were removed. `test/integration.test.ts` drives the **real** app
  wiring (`app/server.ts` — HonoX file routes plus the manually mounted proxy)
  with a mocked D1/R2, which is where ordering regressions surface; it is
  usually the fastest place to assert a wire-level behavior.
- **Both locales move together.** A new console or landing string needs an `en`
  *and* a `zh` entry in `app/lib/i18n/messages.ts`; `zh` is type-checked to
  mirror `en`, and a missing key silently falls back to English.
- **Migrations are append-only.** `migrations/NNNN_*.sql` files that have been
  applied are never edited — add `NNNN+1` instead. SQL goes in the migration,
  never in a route handler.
- **Docs move with the code.** `README.md` is the manual (routes, config,
  behavior, secrets) and `FEATURES.md` is the code-mapped inventory. A new route
  or env var that isn't in the README is an incomplete change. Where a count or
  a list would rot — test totals, page lists — prefer prose that cannot go
  stale over a number nobody updates.

## Repo-specific traps

These have bitten before; the long-form versions live in
[`AGENTS.md`](./AGENTS.md) and the README's project layout.

- **HonoX routing:** `app/routes/api/**` and `app/routes/console/**` are file
  routes; the proxy's catch-all (`/fetch`, `/proxy/*`, `/*`) is mounted by hand
  in `app/server.ts` *after* `createApp`, because file routing cannot express
  the ordering. One Hono instance per file — `createRoute` cannot type our
  `Env`.
- **Styles** are Tailwind v4 + daisyUI, imported `?inline` and injected with
  `dangerouslySetInnerHTML`. Never `<link>` a stylesheet, and never pre-escape
  the CSS: `hono/jsx` escapes interpolations, which silently drops rules whose
  selector contains `>` or `&`.
- **Islands are not a state container.** HonoX re-renders an island's own DOM
  subtree on state change, so anything outside it (the console sidebar) gets
  wiped. Drive that state from a plain inline `<script>` in the document
  instead.
- **Proxy safety is not negotiable.** Any change to request forwarding must
  preserve the SSRF guard (`app/proxy/guard.ts`), the hop-by-hop header
  stripping, the body size caps, and streaming (not buffering) for large or
  media responses.

## Security

Do not open a public issue for a vulnerability — see
[`SECURITY.md`](./SECURITY.md).

## License

By contributing you agree your work is licensed under the [MIT
License](./LICENSE).

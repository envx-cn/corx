# Security Policy

## Reporting a vulnerability

Email **abuse@envx.cn** with a subject line starting `[corx security]`.
Please do not open a public issue, and do not test against the hosted instance
in a way that degrades it for other people.

A useful report contains:

- what the issue is and which component (`app/proxy/*`, the admin API, the
  console, the deployment config);
- the smallest request or sequence that reproduces it (a `curl` line is ideal);
- what an attacker gains that they should not, and what they would need to
  already control (a valid key? a granted origin? nothing?);
- whether the hosted instance, a self-hosted copy, or both are affected.

**What to expect.** CORX is a personal, single-maintainer project with no
funding: reports are acknowledged on a best-effort basis, there is no bug
bounty, and no response-time guarantee. What you will get is an honest answer —
including "that is intended behavior" with the reasoning, which is why the
accepted limitations below are written down rather than left implicit.

## Supported versions

Only `main` and the currently deployed Worker are supported. There are no
maintained release branches and no backports: fixes land on `main`, and a
self-hosted copy gets them by pulling and redeploying. Pin a commit if you need
stability.

## The threat model (what CORX is defending)

A CORS proxy is a deliberately attractive target: it fetches a URL the caller
chooses, from inside Cloudflare's network, and can be handed secrets to attach
on the way out. The interesting properties, and where each is enforced:

| Property | Where |
| --- | --- |
| A caller cannot reach private, reserved or internal addresses (IPv4 and IPv6, including CGNAT), by literal or by DNS | `app/proxy/guard.ts`, `app/proxy/ip.ts`, `app/proxy/dns-check.ts` (DoH resolve-and-classify) |
| A key that injects secrets can only reach hosts it declares (the confused-deputy guard) | `app/proxy/inject.ts` → `allowedHosts`, mandatory once anything is injected |
| Injected credentials are not readable in D1, and are never logged | AES-256-GCM with an HKDF-derived key (`app/lib/crypto.ts`); `request_logs.target_url` is the pre-injection URL |
| A secret is not leaked on a cross-origin redirect | Manual redirect handling with per-hop re-application when a key injects or bounds hosts |
| CORX's own credentials (`X-Api-Key`, `X-Admin-Token`) never reach a target | `STRIP_REQUEST` in `app/proxy/handler.ts` |
| Cached responses never leak across callers | Requests carrying `Authorization`/`Cookie` never read or write the R2 cache; `no-store`/`private`/`Vary` responses are not stored |
| A public-tier caller cannot authenticate upstream as themselves | `Cookie`/`Authorization` stripped from public-key requests |
| Admin surfaces are authenticated | Cloudflare Access JWT verified in-process (RS256, issuer, audience, expiry) with the `ADMIN_EMAILS` allowlist re-checked per request; `ADMIN_TOKEN` bearer for the JSON API |
| API keys are not recoverable from the database | SHA-256 hashed at rest; the raw value is shown once |

If you find a path around any of these, that is a security bug and worth
reporting.

## Accepted limitations (please don't report these as new)

These are known, reasoned about, and documented in
[`FEATURES.md`](./FEATURES.md) → *Remaining limitations*. A report is only
interesting if it shows one of them being worse than described.

1. **Keyless access is quota attribution, not authentication.** Browsers cannot
   forge `Origin`/`Referer`, but non-browser clients can. It is exactly as
   strict as shipping a key in a frontend — which is the model CORX targets —
   so it grants only what that key may do. Keep the allowed hosts tight.
2. **Public-tier quotas fail open.** A D1 write error means the request is
   allowed; the total cap is sized under the free-plan write budget so this
   should not arise from proxied traffic, but it is not a hard guarantee. Abuse
   is bounded by `daily_limit_total`, not by a hard edge limit.
3. **Rate limiting is fixed-window** (D1-backed, fail-open). A burst can
   straddle a window boundary.
4. **Console forms carry no CSRF token.** `SameSite=Lax` on the session cookie
   blocks cross-site POSTs in current browsers; a token would make that
   explicit rather than inherited.
5. **The SSRF guards can be switched off per key** (`ipCheck`/`dnsCheck`) — by
   design, for trusted internal keys, and never in combination with keyless
   access or the public tier.
6. **No KEK rotation.** Changing `INJECTION_KEK` makes existing ciphertext
   unreadable; injection fails closed and edits are refused rather than
   overwriting values that cannot be read. Recovery is re-entering the values.
7. **The hosted instance is best-effort** with no SLA, no uptime target and no
   support commitment ([terms](./README.md#terms-of-use)). Its availability is
   not a security boundary, and an outage is not a vulnerability.

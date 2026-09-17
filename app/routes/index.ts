import { Hono } from "hono";
import type { Handler } from "hono";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { lookupApiKey } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { demoKeyInfo } from "../lib/demo.js";
import { detectLocale, makeT, type Locale } from "../lib/i18n/locale.js";
import { setLangCookie } from "../lib/i18n/hono.js";
import { LandingPage } from "./_landing.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

/**
 * The public key (raw value from `PUBLIC_KEY`) plus its configured daily caps,
 * for the landing page's no-deploy card. Everything degrades to "no card": a
 * missing, revoked or non-public key never gets advertised. One D1 read per
 * landing view only when PUBLIC_KEY is configured.
 */
async function publicKeyInfo(
  env: Env,
): Promise<{ key: string; perOrigin: number | null; perHost: number | null; total: number | null } | undefined> {
  const raw = (env.PUBLIC_KEY ?? "").trim();
  if (!raw) return undefined;
  try {
    const row = await lookupApiKey(env.DB, raw);
    if (!row || row.tier !== "public") {
      if (import.meta.env.DEV) {
        // The card needs PUBLIC_KEY *and* a matching public-tier row; a key
        // that is set but unresolvable is the easy one to get wrong locally.
        console.warn(
          "PUBLIC_KEY is set but no public-tier key matches it in the database: the landing page will not show " +
            "the public-key card. Run `npm run db:seed:public` for local dev, or tick \"Public tier\" on that key " +
            "in the console when deployed.",
        );
      }
      return undefined;
    }
    return {
      key: raw,
      perOrigin: row.daily_limit_per_origin,
      perHost: row.daily_limit_per_host,
      total: row.daily_limit_total,
    };
  } catch {
    // A D1 hiccup shouldn't hide the documented public path; show it without
    // the numbers (the terms still spell out that quotas apply).
    return { key: raw, perOrigin: null, perHost: null, total: null };
  }
}

/**
 * GET / (plus /zh and /en URL-prefixed versions) serves the landing page —
 * unless subdomain mode (or ?url=) targets a site, in which case the request
 * is proxied (in subdomain mode every path is a proxy path, /zh included).
 * Language: URL prefix > corx_lang cookie > Accept-Language.
 */
function landing(locale?: Locale): Handler<{ Bindings: Env; Variables: ProxyVariables }> {
  return async (c) => {
    const reqUrl = new URL(c.req.url);
    try {
      if (resolveRawTarget(reqUrl, c.env).target) return proxyHandler(c);
    } catch {
      return proxyHandler(c); // malformed target -> let proxyHandler return the 400
    }
    const lang = locale ?? detectLocale({
      pathname: reqUrl.pathname,
      cookie: c.req.header("cookie"),
      acceptLanguage: c.req.header("accept-language"),
    });
    // An explicit /zh or /en URL is a language *choice*, not just this page's
    // language: remember it, so /terms and the console — which have no URL
    // prefix — follow what the reader was just looking at instead of their
    // browser's Accept-Language. `/` deliberately writes nothing: it is the
    // auto-detecting entry point, not a choice.
    if (locale) setLangCookie(c, lang);
    // Rendered per request (origin, language, the D1 public key) and pinned by
    // a cookie, so it must not land in a shared cache in any of those shapes.
    c.header("Cache-Control", "private, max-age=0, must-revalidate");
    c.header("Vary", "Accept-Language, Cookie");
    // Plain call (not JSX) so this handler file stays .ts. c.html() doesn't add
    // a doctype; prepend one so browsers stay in standards mode.
    return c.html(
      `<!DOCTYPE html>${LandingPage({
        host: reqUrl.host,
        origin: `${reqUrl.protocol}//${reqUrl.host}`,
        path: reqUrl.pathname,
        locale: lang,
        t: makeT(lang),
        publicKey: await publicKeyInfo(c.env),
        // The injection demo: present only when this instance has a demo key
        // whose allowlist covers this host (app/lib/demo.ts).
        demo: await demoKeyInfo(c.env, reqUrl.hostname),
      })}`,
    );
  };
}

app.get("/", landing());
app.get("/zh", landing("zh"));
app.get("/en", landing("en"));

export default app;

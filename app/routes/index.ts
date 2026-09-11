import { Hono } from "hono";
import type { Handler } from "hono";
import type { Env } from "../lib/types.js";
import type { ProxyVariables } from "../lib/auth.js";
import { proxyHandler } from "../proxy/handler.js";
import { resolveRawTarget } from "../proxy/subdomain.js";
import { detectLocale, makeT, type Locale } from "../lib/i18n/locale.js";
import { LandingPage } from "./_landing.js";

const app = new Hono<{ Bindings: Env; Variables: ProxyVariables }>({ strict: false });

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
    // Plain call (not JSX) so this handler file stays .ts. c.html() doesn't add
    // a doctype; prepend one so browsers stay in standards mode.
    return c.html(
      `<!DOCTYPE html>${LandingPage({
        host: reqUrl.host,
        origin: `${reqUrl.protocol}//${reqUrl.host}`,
        locale: lang,
        t: makeT(lang),
      })}`,
    );
  };
}

app.get("/", landing());
app.get("/zh", landing("zh"));
app.get("/en", landing("en"));

export default app;

import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import type { Env } from "../../lib/types.js";
import { accessDetected, getAdminUser } from "../../lib/access.js";
import { sessionSecret, signSession } from "../../lib/session.js";
import { LoginShell } from "./_layout.js";
import { CorxLogo } from "../../components/logo.js";
import { consoleT } from "../../lib/i18n/hono.js";
import type { TFunc } from "../../lib/i18n/locale.js";

const app = new Hono<{ Bindings: Env }>({ strict: false });

const COOKIE = "corx_session";

/** Secure cookies only over https (local http dev otherwise can't log in). */
function cookieOptions(c: { req: { url: string } }) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
    maxAge: 12 * 3600,
  };
}

app.get("/", async (c) => {
  const t = consoleT(c);
  if (await getAdminUser(c)) return c.redirect("/console/", 302);
  const assertion = c.req.header("cf-access-jwt-assertion");
  // Full document (bypasses the console renderer — no shell for login, and the
  // renderer's doctype with it), so the doctype is prepended here.
  const page = (
    <LoginPage
      accessDetected={accessDetected(c.env, c.req.raw)}
      accessEmail={assertion ? `(${t("console.login.verifying")})` : null}
      t={t}
    />
  );
  return c.html(`<!DOCTYPE html>${page}`);
});

app.post("/", async (c) => {
  const t = consoleT(c);
  const form = await c.req.parseBody();
  const fail = (error: string) =>
    c.html(
      `<!DOCTYPE html>${<LoginPage accessDetected={accessDetected(c.env, c.req.raw)} accessEmail={null} error={error} t={t} />}`,
      401,
    );

  if (form["mode"] === "access") {
    const user = await getAdminUser(c);
    if (!user || user.via !== "access") return fail(t("console.login.errAccess"));
    // Access is decoupled from ADMIN_TOKEN: the JWT itself authenticates every
    // request (getAdminUser checks cf-access-jwt-assertion first), so the
    // cookie is just an optimization. Set it only when a signing secret exists.
    const secret = sessionSecret(c.env);
    if (secret) setCookie(c, COOKIE, await signSession(user.email, secret, undefined, "access"), cookieOptions(c));
    return c.redirect("/console/", 302);
  }

  const token = String(form["token"] ?? "");
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) return fail(t("console.login.errToken"));
  const secret = sessionSecret(c.env);
  if (!secret) return fail(t("console.login.errMisconfig"));
  setCookie(c, COOKIE, await signSession("local-admin (token)", secret, undefined, "token"), cookieOptions(c));
  return c.redirect("/console/", 302);
});

export default app;

// ---------- Page markup (colocated) ----------
function LoginPage(props: { accessDetected: boolean; accessEmail: string | null; error?: string; t: TFunc }) {
  const { t } = props;
  return (
    <LoginShell title={t("console.title.login")}>
      <h1 class="card-title">
        <CorxLogo class="h-9" />
        <span class="sr-only">{t("console.login.consoleTitle")}</span>
      </h1>
      {props.error && (
        <div role="alert" class="alert alert-error">
          <span>{props.error}</span>
        </div>
      )}
      {props.accessDetected ? (
        <>
          <p class="text-sm text-base-content/60">
            {t("console.login.detected")} <b>{props.accessEmail ?? t("console.login.unknown")}</b>
          </p>
          <form method="post" action="/console/login">
            <input type="hidden" name="mode" value="access" />
            <button class="btn btn-primary w-full">{t("console.login.continueAccess")}</button>
          </form>
        </>
      ) : (
        <>
          <p class="text-sm text-base-content/60">{t("console.login.noAccess")}</p>
          <button class="btn btn-primary w-full" disabled title={t("console.login.accessTitle")}>
            {t("console.login.continueAccess")}
          </button>
        </>
      )}
      <div class="divider">{t("console.login.or")}</div>
      <p class="text-sm text-base-content/60">{t("console.login.tokenHint", { code: "ADMIN_TOKEN" })}</p>
      <form method="post" action="/console/login">
        <input type="hidden" name="mode" value="token" />
        <div class="form-control mb-4">
          <label class="label pb-1" for="admin-token">
            <span class="label-text">{t("console.login.adminToken")}</span>
          </label>
          <input id="admin-token" type="password" name="token" autocomplete="off" class="input input-bordered" />
        </div>
        <button class="btn w-full">{t("console.login.signIn")}</button>
      </form>
    </LoginShell>
  );
}

import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../../lib/types.js";
import { accessDetected, getAdminUser } from "../../lib/access.js";
import { sessionSecret, signSession } from "../../lib/session.js";
import { LoginShell } from "./_layout.js";

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
  if (await getAdminUser(c)) return c.redirect("/console/", 302);
  const assertion = c.req.header("cf-access-jwt-assertion");
  // Full document (bypasses the console renderer — no shell for login).
  return c.html(
    <LoginPage accessDetected={accessDetected(c.env, c.req.raw)} accessEmail={assertion ? "(verifying on sign-in)" : null} />,
  );
});

app.post("/", async (c) => {
  const form = await c.req.parseBody();
  const fail = (error: string) =>
    c.html(<LoginPage accessDetected={accessDetected(c.env, c.req.raw)} accessEmail={null} error={error} />, 401);

  if (form["mode"] === "access") {
    const user = await getAdminUser(c);
    if (!user || user.via !== "access") return fail("No valid Cloudflare Access identity on this request.");
    // Access is decoupled from ADMIN_TOKEN: the JWT itself authenticates every
    // request (getAdminUser checks cf-access-jwt-assertion first), so the
    // cookie is just an optimization. Set it only when a signing secret exists.
    const secret = sessionSecret(c.env);
    if (secret) setCookie(c, COOKIE, await signSession(user.email, secret), cookieOptions(c));
    return c.redirect("/console/", 302);
  }

  const token = String(form["token"] ?? "");
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) return fail("Invalid token.");
  const secret = sessionSecret(c.env);
  if (!secret) return fail("Server misconfigured: SESSION_SECRET (or ADMIN_TOKEN) is not set.");
  setCookie(c, COOKIE, await signSession("local-admin (token)", secret), cookieOptions(c));
  return c.redirect("/console/", 302);
});

export default app;

// ---------- Page markup (colocated) ----------
function LoginPage(props: { accessDetected: boolean; accessEmail: string | null; error?: string }) {
  return (
    <LoginShell title="Sign in">
      <h1 class="card-title flex items-center gap-2.5">
        <span class="corx-mark size-8 rounded-lg text-white inline-flex items-center justify-center text-xs font-extrabold">
          cx
        </span>
        corx console
      </h1>
      {props.error && (
        <div role="alert" class="alert alert-error">
          <span>{props.error}</span>
        </div>
      )}
      {props.accessDetected ? (
        <>
          <p class="text-sm text-base-content/60">
            Detected Access identity: <b>{props.accessEmail ?? "unknown"}</b>
          </p>
          <form method="post" action="/console/login">
            <input type="hidden" name="mode" value="access" />
            <button class="btn btn-primary w-full">Continue with Cloudflare</button>
          </form>
        </>
      ) : (
        <>
          <p class="text-sm text-base-content/60">
            No Cloudflare Access session detected on this request. In production, put an Access application in front of
            the admin host — then this button signs you in.
          </p>
          <button class="btn btn-primary w-full" disabled title="Available behind Cloudflare Access">
            Continue with Cloudflare
          </button>
        </>
      )}
      <div class="divider">or</div>
      <p class="text-sm text-base-content/60">
        Local development without Access: paste <code>ADMIN_TOKEN</code>.
      </p>
      <form method="post" action="/console/login">
        <input type="hidden" name="mode" value="token" />
        <div class="form-control mb-4">
          <label class="label pb-1" for="admin-token">
            <span class="label-text">Admin token</span>
          </label>
          <input id="admin-token" type="password" name="token" autocomplete="off" class="input input-bordered" />
        </div>
        <button class="btn w-full">Sign in</button>
      </form>
    </LoginShell>
  );
}

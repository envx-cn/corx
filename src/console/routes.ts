import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types.js";
import { accessDetected, getAdminUser, type AdminIdentity, type AdminVariables } from "../access.js";
import { signSession } from "../session.js";
import {
  createApiKey,
  queryBlockedHosts,
  queryKeys,
  queryLogs,
  queryStats,
} from "../admin.js";
import { blockedPage, dashboardPage, keysPage, loginPage, logsPage } from "./views.js";

export const consoleApp = new Hono<{ Bindings: Env; Variables: AdminVariables }>({ strict: false });

const COOKIE = "corx_session";

function sessionCookie(c: Parameters<typeof setCookie>[0], value: string): void {
  setCookie(c, COOKIE, value, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 12 * 3600,
  });
}

/** Page guard: redirect to login instead of 401 JSON. */
async function pageUser(c: {
  env: Env;
  req: { header(name: string): string | undefined };
  redirect: (url: string, status?: 301 | 302) => Response;
}): Promise<AdminIdentity | Response> {
  // getAdminUser only needs { env, req } shape.
  const user = await getAdminUser(c as Parameters<typeof getAdminUser>[0]);
  if (!user) return c.redirect("/console/login", 302);
  return user;
}

// --- Public: login ---

consoleApp.get("/login", async (c) => {
  if (await getAdminUser(c)) return c.redirect("/console/", 302);
  const assertion = c.req.header("cf-access-jwt-assertion");
  return c.html(
    loginPage({
      accessDetected: accessDetected(c.env, c.req.raw),
      accessEmail: assertion ? "(verifying on sign-in)" : null,
    }),
  );
});

consoleApp.post("/login", async (c) => {
  const form = await c.req.parseBody();
  const fail = (error: string) =>
    c.html(loginPage({ accessDetected: accessDetected(c.env, c.req.raw), accessEmail: null, error }), 401);

  if (form["mode"] === "access") {
    const user = await getAdminUser(c);
    if (!user || user.via !== "access") return fail("No valid Cloudflare Access identity on this request.");
    if (!c.env.ADMIN_TOKEN) return fail("Server misconfigured: ADMIN_TOKEN secret is not set.");
    sessionCookie(c, await signSession(user.email, c.env.ADMIN_TOKEN));
    return c.redirect("/console/", 302);
  }

  const token = String(form["token"] ?? "");
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) return fail("Invalid token.");
  sessionCookie(c, await signSession("local-admin (token)", c.env.ADMIN_TOKEN));
  return c.redirect("/console/", 302);
});

consoleApp.post("/logout", async (c) => {
  deleteCookie(c, COOKIE, { path: "/" });
  return c.redirect("/console/login", 302);
});

// --- Protected pages ---

consoleApp.get("/", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  const [stats, keys, blocked] = await Promise.all([
    queryStats(c.env.DB),
    queryKeys(c.env.DB),
    queryBlockedHosts(c.env.DB),
  ]);
  return c.html(dashboardPage(user.email, stats, keys.filter((k) => !k.revoked_at).length, blocked.length));
});

consoleApp.get("/keys", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  return c.html(keysPage(user.email, await queryKeys(c.env.DB), null));
});

consoleApp.post("/keys", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  const form = await c.req.parseBody();
  const rateRaw = String(form["rateLimitPerMin"] ?? "").trim();
  const rate = rateRaw === "" ? null : Number(rateRaw);
  const name = String(form["name"] ?? "");
  const { id, key } = await createApiKey(c.env.DB, name, Number.isFinite(rate) ? rate : null);
  return c.html(keysPage(user.email, await queryKeys(c.env.DB), { id, key, name }));
});

consoleApp.post("/keys/:id/revoke", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  await c.env.DB.prepare("UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
    .bind(c.req.param("id"))
    .run();
  return c.redirect("/console/keys", 302);
});

consoleApp.get("/logs", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  const limit = Number(c.req.query("limit") ?? 100);
  return c.html(logsPage(user.email, await queryLogs(c.env.DB, limit), Number.isFinite(limit) ? limit : 100));
});

consoleApp.get("/blocked", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  return c.html(blockedPage(user.email, await queryBlockedHosts(c.env.DB)));
});

consoleApp.post("/blocked", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  const form = await c.req.parseBody();
  const hostname = String(form["hostname"] ?? "").trim().toLowerCase();
  if (hostname) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO blocked_hosts (hostname, reason) VALUES (?, ?)")
      .bind(hostname, String(form["reason"] ?? ""))
      .run();
  }
  return c.redirect("/console/blocked", 302);
});

consoleApp.post("/blocked/:hostname/delete", async (c) => {
  const user = await pageUser(c);
  if (user instanceof Response) return user;
  await c.env.DB.prepare("DELETE FROM blocked_hosts WHERE hostname = ?")
    .bind(c.req.param("hostname").toLowerCase())
    .run();
  return c.redirect("/console/blocked", 302);
});

import { describe, expect, it } from "vitest";
import worker from "../app/server.js";
import { signSession } from "../app/lib/session.js";
import { csrfToken, issueCsrfToken, verifyCsrfToken } from "../app/lib/csrf.js";
import type { AdminIdentity } from "../app/lib/access.js";
import type { Env } from "../app/lib/types.js";
import type { Context } from "hono";

/**
 * Console CSRF: the signed, session-bound token rendered into every mutating
 * form and verified by the console middleware. Unit tests pin the derivation;
 * the integration pass covers the real wiring (missing and forged tokens,
 * session rotation, the JSON playground call, the login exemption).
 */

const SECRET = "test-token";
const COOKIE = "corx_session";

function mockDb() {
  const q = () => ({
    bind: () => q(),
    run: async () => ({ meta: { changes: 0 } }),
    first: async () => null,
    all: async () => ({ results: [] }),
  });
  return { prepare: q };
}

const env = {
  DB: mockDb(),
  CACHE_BUCKET: {
    get: async () => null,
    put: async () => undefined,
    list: async () => ({ objects: [] }),
    delete: async () => undefined,
  },
  ADMIN_TOKEN: SECRET,
  ALLOWED_ORIGINS: "*",
} as unknown as Env;

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

const sessionCookie = await signSession("tester@example.com", SECRET);

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, { ...init }), e, ctx);
}

const authed = (extra: Record<string, string> = {}) => ({
  cookie: `${COOKIE}=${sessionCookie}`,
  "content-type": "application/x-www-form-urlencoded",
  ...extra,
});

/** Minimal Context for the pure token helpers (no HTTP needed). */
function fakeContext(opts: { cookie?: string; user?: AdminIdentity; env?: Env } = {}): Context<{ Bindings: Env }> {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", `${COOKIE}=${opts.cookie}`);
  return {
    env: opts.env ?? env,
    req: { raw: new Request("https://corx.test/console/", { headers }), header: (name: string) => headers.get(name) ?? undefined },
    get: (key: string) => (key === "consoleUser" ? opts.user : undefined),
  } as unknown as Context<{ Bindings: Env }>;
}

describe("csrf token derivation", () => {
  it("round-trips for the same session, and rotates with the cookie", async () => {
    const ctxA = fakeContext({ cookie: "session-a" });
    const token = await issueCsrfToken(ctxA);
    expect(token).toBeTruthy();
    expect(await verifyCsrfToken(ctxA, token)).toBe(true);

    // A new login mints a new cookie, so the old token is dead.
    const ctxB = fakeContext({ cookie: "session-b" });
    expect(await verifyCsrfToken(ctxB, token)).toBe(false);
  });

  it("rejects missing, forged and truncated tokens", async () => {
    const ctxA = fakeContext({ cookie: "session-a" });
    const token = (await issueCsrfToken(ctxA))!;
    expect(await verifyCsrfToken(ctxA, undefined)).toBe(false);
    expect(await verifyCsrfToken(ctxA, "")).toBe(false);
    expect(await verifyCsrfToken(ctxA, "forged")).toBe(false);
    expect(await verifyCsrfToken(ctxA, token.slice(0, -2) + "AA")).toBe(false);
    // Same secret, someone else's session.
    expect(await verifyCsrfToken(ctxA, await csrfToken(SECRET, "session:other"))).toBe(false);
  });

  it("binds Access-only sessions to the verified identity", async () => {
    const ctxA = fakeContext({ user: { email: "ops@example.com", via: "access" } });
    const token = await issueCsrfToken(ctxA);
    expect(token).toBeTruthy();
    expect(await verifyCsrfToken(ctxA, token)).toBe(true);
    expect(
      await verifyCsrfToken(fakeContext({ user: { email: "other@example.com", via: "access" } }), token),
    ).toBe(false);
  });

  it("issues nothing (and verifies nothing) without a session or a secret", async () => {
    expect(await issueCsrfToken(fakeContext({}))).toBeNull();
    expect(await issueCsrfToken(fakeContext({ cookie: "session-a", env: {} as Env }))).toBeNull();
    expect(await verifyCsrfToken(fakeContext({}), "anything")).toBe(false);
  });
});

describe("console CSRF (integration)", () => {
  it("renders a token into the pages that carry forms", async () => {
    for (const path of ["/console/keys", "/console/blocked", "/console/profile"]) {
      const res = await call(path, { headers: authed() });
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toMatch(/name="csrf" value="[A-Za-z0-9_-]{20,}"/);
      // The shell's logout dialog carries one too.
      if (path === "/console/profile") expect(html).toContain("data-corx-confirm");
    }
  });

  it("refuses a console POST with a missing token, on the console error page", async () => {
    const res = await call("/console/blocked", { method: "POST", headers: authed(), body: "hostname=evil.test" });
    expect(res.status).toBe(403);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("CSRF token");
    expect(html).toContain("Back to console"); // the shell, not a bare 403
  });

  it("refuses a forged token, and accepts the one the page rendered", async () => {
    const page = await call("/console/keys", { headers: authed() });
    const rendered = (await page.text()).match(/name="csrf" value="([^"]+)"/)?.[1];
    expect(rendered).toBeTruthy();

    const forged = await call("/console/blocked", {
      method: "POST",
      headers: authed(),
      body: `hostname=evil.test&csrf=${"A".repeat(43)}`,
    });
    expect(forged.status).toBe(403);

    // A token minted for a different session is equally dead.
    const otherSession = await signSession("someone@example.com", SECRET);
    const stolen = await csrfToken(SECRET, `session:${otherSession}`);
    const wrongSession = await call("/console/blocked", {
      method: "POST",
      headers: authed(),
      body: `hostname=evil.test&csrf=${stolen}`,
    });
    expect(wrongSession.status).toBe(403);

    const ok = await call("/console/blocked", {
      method: "POST",
      headers: authed(),
      body: `hostname=evil.test&csrf=${rendered}`,
    });
    expect(ok.status).toBe(302);
    expect(ok.headers.get("location")).toBe("/console/blocked");
  });

  it("would not clear the session cookie on a token-less logout", async () => {
    const res = await call("/console/logout", { method: "POST" });
    expect(res.status).toBe(403);
    expect(res.headers.get("set-cookie")).toBeNull();

    const page = await call("/console/profile", { headers: authed() });
    const token = (await page.text()).match(/name="csrf" value="([^"]+)"/)?.[1];
    const ok = await call("/console/logout", { method: "POST", headers: authed(), body: `csrf=${token}` });
    expect(ok.status).toBe(302);
    expect(ok.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("verifies the playground before parsing it: JSON 403, header token passes", async () => {
    const missing = await call("/console/playground/run", {
      method: "POST",
      headers: { cookie: `${COOKIE}=${sessionCookie}`, "content-type": "application/json" },
      body: "{}",
    });
    expect(missing.status).toBe(403);
    expect(missing.headers.get("content-type")).toContain("application/json");
    expect(await missing.json()).toMatchObject({ error: expect.stringContaining("CSRF token") });

    const token = await csrfToken(SECRET, `session:${sessionCookie}`);
    const withToken = await call("/console/playground/run", {
      method: "POST",
      headers: { cookie: `${COOKIE}=${sessionCookie}`, "content-type": "application/json", "x-corx-csrf": token },
      body: "{}",
    });
    // CSRF passed, so the route's own spec validation answered (not the 403).
    expect(withToken.status).toBe(400);
  });

  it("leaves the login form exempt (no session to bind to yet)", async () => {
    const res = await call("/console/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "mode=token&token=wrong",
    });
    expect(res.status).toBe(401);
    expect(await res.text()).toContain("Invalid token.");
  });
});

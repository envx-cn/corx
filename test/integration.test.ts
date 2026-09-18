import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import keyPanelSrc from "../app/islands/key-panel.tsx?raw";
import { signSession } from "../app/lib/session.js";
import type { Env } from "../app/lib/types.js";

/**
 * Integration tests against the REAL app wiring (honox file routes + the
 * manually mounted proxy routes in server.ts). Catches ordering regressions —
 * e.g. the /* proxy catch-all swallowing /console/* or /api/* — that unit
 * tests can't see.
 */

/** Minimal D1 mock (empty tables). */
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
  ADMIN_TOKEN: "test-token",
  ALLOWED_ORIGINS: "*",
} as unknown as Env;

const ctx = { waitUntil: (p: Promise<unknown>) => p.catch(() => undefined) } as unknown as ExecutionContext;

const sessionCookie = await signSession("tester@example.com", "test-token");

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, { ...init, headers: { ...(init.headers ?? {}) } }), e, ctx);
}

/** The CSRF token a console page rendered into its forms (browser flow). */
async function csrfFrom(path: string, e: Env = env): Promise<string> {
  const res = await call(path, { headers: { cookie: `corx_session=${sessionCookie}` } }, e);
  const html = await res.text();
  const m = html.match(/name="csrf" value="([^"]+)"/);
  if (!m) throw new Error(`no CSRF token rendered on ${path}`);
  return m[1]!;
}

/** Env whose D1 answers the API-key lookup with one row (everything else empty). */
function envWithKey(row: Record<string, unknown>): Env {
  const stmt = (sql: string) => {
    const s = {
      bind: () => s,
      run: async () => ({ meta: { changes: 0 } }),
      first: async () => (sql.includes("FROM api_keys") ? row : null),
      all: async () => ({ results: [] }),
    };
    return s;
  };
  return { ...env, DB: { prepare: stmt } } as unknown as Env;
}

afterEach(() => vi.unstubAllGlobals());

describe("route wiring (integration)", () => {
  it("serves /health", async () => {
    const res = await call("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("404s unknown /api/* (not the proxy catch-all)", async () => {
    const res = await call("/api/nope", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Unknown API endpoint") });
  });

  it("bare /api also gets 404 JSON, not the HTML 404 page", async () => {
    const res = await call("/api", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Unknown API endpoint") });
  });

  it("serves the login page (public console path, no auth bounce)", async () => {
    const res = await call("/console/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    // Full-document page: it bypasses the console renderer, so it carries its own doctype.
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("CORX console");
    // Logged out there is no topbar, so the page carries its own zh/EN switch
    // and the document lang follows the resolved locale.
    expect(html).toContain('<html lang="en"');
    expect(html).toContain('href="?lang=zh"');

    const zh = await call("/console/login", { headers: { "accept-language": "zh-CN,zh;q=0.9" } });
    const zhHtml = await zh.text();
    expect(zhHtml).toContain('<html lang="zh"');
    expect(zhHtml).toContain("管理员令牌");
    expect(zhHtml).toContain('href="?lang=en"');

    // …and the same switch flips it back to English.
    const en = await call("/console/login", {
      headers: { "accept-language": "zh-CN,zh;q=0.9", cookie: "corx_lang=en" },
    });
    expect(await en.text()).toContain("Admin token");
  });

  it("serves the landing page in Chinese via /zh and Accept-Language", async () => {
    const zh = await call("/zh");
    expect(zh.status).toBe(200);
    const zhHtml = await zh.text();
    expect(zhHtml).toContain("<!DOCTYPE html>");
    expect(zhHtml).toContain("告别 CORS");

    const detected = await call("/", { headers: { "accept-language": "zh-CN,zh;q=0.9" } });
    expect(await detected.text()).toContain("告别 CORS");

    const en = await call("/en");
    const enHtml = await en.text();
    expect(enHtml).toContain("without CORS.");
    // Social/search previews: description + Open Graph tags on the landing.
    expect(enHtml).toContain('<meta name="description"');
    expect(enHtml).toContain('property="og:title"');
    expect(enHtml).toContain('property="og:url" content="https://corx.test/en"');
    // The public source repo is linked from the nav and the footer.
    expect(enHtml).toContain('href="https://github.com/envx-cn/corx"');
    expect(zhHtml).toContain('href="https://github.com/envx-cn/corx"');
    // The trust band's self-host card opens Cloudflare's one-click deploy flow
    // (clone to the visitor's GitHub, provision D1 + R2, deploy).
    const deployUrl = "https://deploy.workers.cloudflare.com/?url=https://github.com/envx-cn/corx";
    expect(enHtml).toContain(`href="${deployUrl}"`);
    expect(zhHtml).toContain(`href="${deployUrl}"`);
    expect(enHtml).toContain("Deploy to Cloudflare");
    expect(zhHtml).toContain("部署到 Cloudflare");
  });

  it("remembers an explicit /zh or /en URL in the language cookie", async () => {
    // The prefixes are a *choice*, not just this page's language: /terms and the
    // console have no prefix and read the cookie, so without this an English
    // landing page could hand a 中文-preferring browser a Chinese Terms page.
    for (const [path, lang] of [["/en", "en"], ["/zh", "zh"]] as const) {
      const res = await call(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie"), path).toContain(`corx_lang=${lang}`);
    }
    // `/` auto-detects: pinning it would freeze the first guess in the cookie.
    expect((await call("/")).headers.get("set-cookie")).toBeNull();
  });

  it("keeps /terms in the language the reader just came from", async () => {
    // English landing on a browser that prefers 中文: the URL prefix wins for
    // the landing, and the cookie it sets has to win for /terms too.
    const landing = await call("/en", { headers: { "accept-language": "zh-CN,zh;q=0.9" } });
    expect(await landing.text()).toContain("without CORS.");
    const cookie = landing.headers.get("set-cookie")!.split(";")[0]!;
    expect(cookie).toBe("corx_lang=en");
    const terms = await call("/terms", { headers: { cookie, "accept-language": "zh-CN,zh;q=0.9" } });
    expect(await terms.text()).toContain("Terms of use");

    // ...and the mirror image: Chinese landing, English-preferring browser.
    const zhLanding = await call("/zh", { headers: { "accept-language": "en-US,en;q=0.9" } });
    const zhCookie = zhLanding.headers.get("set-cookie")!.split(";")[0]!;
    const zhTerms = await call("/terms", { headers: { cookie: zhCookie, "accept-language": "en-US,en;q=0.9" } });
    expect(await zhTerms.text()).toContain("使用条款");
  });

  it("?lang= on /terms sets the cookie and bounces back to the clean URL", async () => {
    const res = await call("/terms?lang=zh");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/terms");
    expect(res.headers.get("set-cookie")).toContain("corx_lang=zh");
  });

  it("?lang= switches the console language via cookie + redirect", async () => {
    const res = await call("/console/keys?lang=zh", {
      headers: { cookie: `corx_session=${sessionCookie}` },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/keys");
    expect(res.headers.get("set-cookie")).toContain("corx_lang=zh");

    const zh = await call("/console/keys", {
      headers: { cookie: `corx_session=${sessionCookie}; corx_lang=zh` },
    });
    const zhHtml = await zh.text();
    expect(zhHtml).toContain("API 密钥");
    // The document language follows the UI language (screen readers, auto-translate).
    expect(zhHtml).toContain('<html lang="zh"');
  });

  it("bounces unauthenticated console pages to login", async () => {
    const res = await call("/console/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/login");
  });

  it("authenticated console pages render; creating a key shows the Copy island", async () => {
    const res = await call("/console/keys", { headers: { cookie: `corx_session=${sessionCookie}` } });
    expect(res.status).toBe(200);
    const page = await res.text();
    expect(page).toContain("API keys");
    // The key panel carries the injection + keyless fields (island SSR).
    expect(page).toContain("Upstream injection");
    expect(page).toContain("Keyless access");
    // Create opens on the fast path: name/rate/origins and keyless. The
    // advanced policy is a collapsed <details> whose inputs still submit.
    expect(page).toContain("Advanced policy");
    expect(page).not.toMatch(/<details[^>]*\sopen/);
    expect(page).toContain('name="allowedHosts"');
    // The allowed-hosts dependency is stated where the injection fields are.
    expect(page).toContain("Needs at least one allowed target host");
    expect(page).toContain('name="headerRules"');
    expect(page).toContain('name="clientVars"');
    expect(page).toContain("Client-referencable variables");
    expect(page).toContain('name="allowedHosts"');
    // Public tier: the shared-key switch and its three daily caps.
    expect(page).toContain('name="tier"');
    expect(page).toContain('name="dailyLimitPerOrigin"');
    expect(page).toContain('name="dailyLimitTotal"');

    // Creating a key renders the CopyButton island (assert SSR output — the
    // hydration meta itself is injected at build time by the honox plugin).
    const created = await call("/console/keys", {
      method: "POST",
      headers: {
        cookie: `corx_session=${sessionCookie}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `name=my-app&csrf=${await csrfFrom("/console/keys")}`,
    });
    expect(created.status).toBe(200);
    const html = await created.text();
    expect(html).toContain("New key created");
    expect(html).toContain("Copy");
    expect(html).toContain('type="button"');
  });

  it("requires an API key name on the admin API", async () => {
    const res = await call("/api/keys", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify({ rateLimitPerMin: 10 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Name is required" });
  });

  it("renders the logs window slider and clamps ?hours=", async () => {
    const res = await call("/console/logs?hours=9999", {
      headers: { cookie: `corx_session=${sessionCookie}` },
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('type="range"');
    expect(html).toContain('value="168"');
    expect(html).toContain("7d"); // the slider label, clamped to the 7-day max
    // Via / Caller columns: which credential authorized the request, and the
    // origin keyless matched on. Both were written to D1 but unreadable before.
    expect(html).toContain("Via");
    expect(html).toContain("Caller");
  });

  it("server-renders the shell confirm dialog (logout needs no island)", async () => {
    const res = await call("/console/profile", { headers: { cookie: `corx_session=${sessionCookie}` } });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("data-corx-confirm"); // trigger → showModal() hook
    expect(html).toContain('id="corx-confirm-'); // the dialog itself
    expect(html).toContain("Log out?");
    expect(html).toContain("[data-corx-confirm]"); // the Doc's wiring script
    // Profile renders no island at all now, so there is no hydration to fail.
    expect(html).not.toContain("<honox-island");
  });

  it("logout clears the cookie, and bounces through Access when configured", async () => {
    const csrf = await csrfFrom("/console/profile");
    const logout = {
      method: "POST",
      headers: {
        cookie: `corx_session=${sessionCookie}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `csrf=${csrf}`,
    } as const;
    const res = await call("/console/logout", logout);
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toContain("corx_session=");
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    // No Access configured: fall back to the console login page.
    expect(res.headers.get("location")).toBe("/console/login");

    // With Access in front, our cookie is not the whole session — the edge has
    // to revoke its own, otherwise the next request re-authenticates.
    const accessEnv = {
      ...env,
      ACCESS_TEAM_DOMAIN: "https://envx.cloudflareaccess.com/",
      ACCESS_AUD: "aud-tag",
    } as Env;
    const viaAccess = await call("/console/logout", logout, accessEnv);
    expect(viaAccess.headers.get("location")).toBe("https://envx.cloudflareaccess.com/cdn-cgi/access/logout");
  });

  it("delete route reports an unknown key instead of deleting", async () => {
    const res = await call("/console/keys/nope/delete", {
      method: "POST",
      headers: {
        cookie: `corx_session=${sessionCookie}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: `confirmName=x&csrf=${await csrfFrom("/console/keys")}`,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Failed to delete key");
  });

  it("unknown /console/* paths redirect to the console root", async () => {
    const res = await call("/console/nonexistent", { headers: { cookie: `corx_session=${sessionCookie}` } });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/console/");
  });

  it("unknown non-console paths get the branded HTML 404 page", async () => {
    const res = await call("/random/path");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    // Cloudflare-style 404: outlined digits, subtitle, dual CTAs, shared chrome.
    expect(html).toContain("status-code");
    expect(html).toContain("Take me home");
    expect(html).toContain("Open console");
    expect(html).toContain("We can&#39;t find the page you were looking for");
    expect(html).toContain("/random/path");
  });
});

describe("upstream injection + keyless access (integration)", () => {
  interface UpstreamCall {
    url: string;
    headers: Headers;
    method: string;
    body: unknown;
  }

  /** fetch stub: answers DoH, records (and answers) upstream calls. */
  function stubFetch(handler: (url: string, call: UpstreamCall) => Response | Promise<Response>): UpstreamCall[] {
    const calls: UpstreamCall[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        const call: UpstreamCall = {
          url,
          headers: new Headers(init?.headers),
          method: init?.method ?? "GET",
          body: init?.body ?? undefined,
        };
        calls.push(call);
        return handler(url, call);
      }),
    );
    return calls;
  }

  /** Env whose D1 answers key + keyless-origin lookups, capturing rate buckets. */
  function envForKey(row: Record<string, unknown>, opts: { grants?: boolean } = {}) {
    const rateBinds: unknown[][] = [];
    const stmt = (sql: string) => {
      const s = {
        bind: (...values: unknown[]) => {
          if (sql.includes("INTO rate_windows")) rateBinds.push(values);
          return s;
        },
        run: async () => ({ meta: { changes: 0 } }),
        first: async () => {
          if (sql.includes("FROM api_keys")) return row;
          if (sql.includes("FROM keyless_origins") && opts.grants !== false) return row;
          return null;
        },
        all: async () => ({ results: [] }),
      };
      return s;
    };
    return { env: { ...env, DB: { prepare: stmt } } as unknown as Env, rateBinds };
  }

  const injectingRow = {
    id: "k1",
    key_hash: "h",
    name: "vendor",
    rate_limit_per_min: null,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    vars: JSON.stringify([{ name: "TOKEN", value: "sk-live-1" }]),
    header_rules: JSON.stringify([{ action: "set", name: "Authorization", value: "Bearer ${TOKEN}" }]),
    param_rules: JSON.stringify([{ action: "set", name: "api_key", value: "${TOKEN}" }]),
    allowed_hosts: "api.vendor.com",
    keyless: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
  };

  it("injects headers + params and overrides client-supplied values", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(injectingRow);
    const res = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, keyed);

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-live-1");
    expect(calls[0]?.url).toBe("https://api.vendor.com/data?api_key=sk-live-1");
    // The pre-injection URL is what gets logged — no secrets in request_logs.
    expect(res.headers.get("x-corx-target")).toBe("api.vendor.com");
  });

  it("client headers can never spoof an injected one", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(injectingRow);
    await call(
      "/fetch?url=https://api.vendor.com/data",
      { headers: { "x-api-key": "corx_k", authorization: "Bearer attacker" } },
      keyed,
    );
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer sk-live-1");
  });

  it("never forwards the credential it authenticated this proxy with", async () => {
    const row = { ...injectingRow, vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null };
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(row);

    // The CORX key presented as `Authorization: Bearer corx_…` is CORX's own
    // credential, not the target's — it must not reach upstream.
    const bearer = await call(
      "/fetch?url=https://example.com/data",
      { headers: { authorization: "Bearer corx_k" } },
      keyed,
    );
    expect(bearer.status).toBe(200);

    // The same key presented any other way leaves the caller's own bearer
    // token alone (the OAuth passthrough the proxy exists for).
    await call(
      "/fetch?url=https://example.com/data",
      { headers: { "x-api-key": "corx_k", authorization: "Bearer user-token" } },
      keyed,
    );
    await call(
      "/fetch?url=https://example.com/data&corx-key=corx_k",
      { headers: { authorization: "Basic dXNlcjpwdw==" } },
      keyed,
    );

    expect(calls.map((c) => c.headers.get("authorization"))).toEqual([
      null,
      "Bearer user-token",
      "Basic dXNlcjpwdw==",
    ]);
    expect(calls.every((c) => c.headers.get("x-api-key") === null)).toBe(true);
  });

  it("gives the same header a different value per target host", async () => {
    // The multi-upstream case: one key, two APIs that both authenticate with
    // `Authorization`, each getting its own credential — and never the other's.
    const row = {
      ...injectingRow,
      id: "k-multi",
      name: "multi-target",
      vars: JSON.stringify([
        { name: "OPENAI_KEY", value: "sk-openai" },
        { name: "VENDOR_KEY", value: "sk-vendor" },
      ]),
      header_rules: JSON.stringify([
        { action: "set", name: "Authorization", value: "Bearer ${OPENAI_KEY}", hosts: ["api.openai.com"] },
        { action: "set", name: "Authorization", value: "Bearer ${VENDOR_KEY}", hosts: ["api.vendor.com"] },
      ]),
      param_rules: "[]",
      response_rules: "[]",
      allowed_hosts: "api.openai.com, api.vendor.com",
    };
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(row);

    const openai = await call("/fetch?url=https://api.openai.com/v1/models", { headers: { "x-api-key": "corx_k" } }, keyed);
    const vendor = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, keyed);

    expect(openai.status).toBe(200);
    expect(vendor.status).toBe(200);
    const byHost = new Map(calls.map((c) => [new URL(c.url).hostname, c.headers.get("authorization")]));
    expect(byHost.get("api.openai.com")).toBe("Bearer sk-openai");
    expect(byHost.get("api.vendor.com")).toBe("Bearer sk-vendor");
    // And a host outside the key's allowlist is still refused before any fetch.
    const blocked = await call("/fetch?url=https://evil.test/steal", { headers: { "x-api-key": "corx_k" } }, keyed);
    expect(blocked.status).toBe(403);
    expect(calls).toHaveLength(2);
  });

  it("refuses a target outside the key's allowed hosts before any fetch", async () => {
    const calls = stubFetch(() => new Response("should not happen", { status: 200 }));
    const { env: keyed } = envForKey(injectingRow);
    const res = await call("/fetch?url=https://evil.test/steal", { headers: { "x-api-key": "corx_k" } }, keyed);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("not allowed") });
    expect(calls).toHaveLength(0);
  });

  it("stops at a redirect that leaves the allowed hosts — no header leak", async () => {
    const calls = stubFetch(() => new Response(null, { status: 302, headers: { location: "https://evil.test/steal" } }));
    const { env: keyed } = envForKey(injectingRow);
    const res = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, keyed);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://evil.test/steal");
    expect(calls).toHaveLength(1); // evil.test was never fetched
  });

  it("follows an in-scope redirect and re-applies the rules on every hop", async () => {
    let hop = 0;
    const calls = stubFetch(() => {
      hop++;
      if (hop === 1) return new Response(null, { status: 302, headers: { location: "/next" } });
      return new Response("done", { status: 200 });
    });
    const { env: keyed } = envForKey(injectingRow);
    const res = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, keyed);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("done");
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("https://api.vendor.com/next?api_key=sk-live-1");
    expect(calls[1]?.headers.get("authorization")).toBe("Bearer sk-live-1");
  });

  it("303 rewrites any non-GET/HEAD method to GET and drops the body", async () => {
    let hop = 0;
    const calls = stubFetch(() => {
      hop++;
      if (hop === 1) return new Response(null, { status: 303, headers: { location: "/next" } });
      return new Response("done", { status: 200 });
    });
    const { env: keyed } = envForKey(injectingRow);
    const res = await call(
      "/fetch?url=https://api.vendor.com/data",
      { method: "PUT", body: "payload", headers: { "x-api-key": "corx_k" } },
      keyed,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[1]?.method).toBe("GET");
    expect(calls[1]?.body).toBeUndefined();
  });

  it("302 keeps a non-POST method and re-sends its body", async () => {
    let hop = 0;
    const calls = stubFetch(() => {
      hop++;
      if (hop === 1) return new Response(null, { status: 302, headers: { location: "/next" } });
      return new Response("done", { status: 200 });
    });
    const { env: keyed } = envForKey(injectingRow);
    await call(
      "/fetch?url=https://api.vendor.com/data",
      { method: "PUT", body: "payload", headers: { "x-api-key": "corx_k" } },
      keyed,
    );
    expect(calls).toHaveLength(2);
    expect(calls[1]?.method).toBe("PUT");
    expect(new TextDecoder().decode(calls[1]?.body as ArrayBuffer)).toBe("payload");
  });

  it("rewrites an absolute subdomain Location even on the streamed path", async () => {
    const calls = stubFetch(() => new Response(null, { status: 302, headers: { location: "https://example.com/new" } }));
    const subEnv = { ...env, PROXY_ZONE: "corx.test" } as Env;
    const res = await worker.fetch(new Request("https://example.corx.test/old"), subEnv, ctx);
    expect(res.status).toBe(302);
    expect(calls[0]?.url).toBe("https://example.com/old");
    // Relative, so the browser stays on the proxy instead of leaving for the target.
    expect(res.headers.get("location")).toBe("/new");
  });

  it("header rules keep the key out of the shared cache", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const puts: unknown[] = [];
    const { env: keyed } = envForKey(injectingRow);
    const withBucket = {
      ...keyed,
      CACHE_BUCKET: {
        get: async () => null,
        put: async (...args: unknown[]) => {
          puts.push(args);
        },
        list: async () => ({ objects: [] }),
        delete: async () => undefined,
      },
    } as unknown as Env;
    const res = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, withBucket);
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(puts).toHaveLength(0);
  });

  it("never injects without a host allowlist, even if the row was hand-edited", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey({ ...injectingRow, allowed_hosts: null });
    const res = await call("/fetch?url=https://example.com/data", { headers: { "x-api-key": "corx_k" } }, keyed);
    expect(res.status).toBe(200);
    expect(calls[0]?.headers.get("authorization")).toBeNull();
    expect(calls[0]?.url).toBe("https://example.com/data");
  });

  it("keyless access resolves the key from the Origin and meters per origin+IP", async () => {
    const keylessRow = { ...injectingRow, keyless: 1, allowed_origins: "https://app.example", vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null };
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed, rateBinds } = envForKey(keylessRow);
    const res = await call(
      "/fetch?url=https://example.com/data",
      { headers: { origin: "https://app.example", "cf-connecting-ip": "203.0.113.9" } },
      { ...keyed, REQUIRE_API_KEY: "true" } as Env,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(rateBinds[0]?.[0]).toBe("rl:origin:https://app.example:ip:203.0.113.9");
  });

  it("keyless access resolves from the Referer too (same-origin GET / no-cors loads)", async () => {
    // Browsers omit Origin on same-origin GETs and on no-cors subresource loads
    // (<img>, <script>, JSONP), but do send Referer — the landing page's live
    // demo takes exactly that path.
    const keylessRow = { ...injectingRow, keyless: 1, allowed_origins: "https://app.example", vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null };
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed, rateBinds } = envForKey(keylessRow);
    const res = await call(
      "/fetch?url=https://example.com/data",
      { headers: { referer: "https://app.example/some/page", "cf-connecting-ip": "203.0.113.9" } },
      { ...keyed, REQUIRE_API_KEY: "true" } as Env,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
    // Same bucket as an Origin match: one caller, one bucket.
    expect(rateBinds[0]?.[0]).toBe("rl:origin:https://app.example:ip:203.0.113.9");
  });

  it("keyless access stays anonymous without Origin or Referer", async () => {
    const keylessRow = { ...injectingRow, keyless: 1, allowed_origins: "https://app.example", vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null };
    const { env: keyed } = envForKey(keylessRow);
    const res = await call(
      "/fetch?url=https://example.com/data",
      { headers: { "cf-connecting-ip": "203.0.113.9" } },
      { ...keyed, REQUIRE_API_KEY: "true" } as Env,
    );
    expect(res.status).toBe(401);
  });

  it("keyless access still 401s an origin without a grant", async () => {
    const keylessRow = { ...injectingRow, keyless: 1, allowed_origins: "https://app.example", vars: "[]", header_rules: "[]", param_rules: "[]", allowed_hosts: null };
    const { env: keyed } = envForKey(keylessRow, { grants: false });
    const res = await call(
      "/fetch?url=https://example.com/data",
      { headers: { origin: "https://evil.test" } },
      { ...keyed, REQUIRE_API_KEY: "true" } as Env,
    );
    expect(res.status).toBe(401);
  });

  it("a loopback port wildcard grant authorizes every localhost port", async () => {
    const grants = ["http://localhost:*"];
    const keylessRow = {
      ...injectingRow,
      id: "k-dev",
      name: "dev",
      keyless: 1,
      allowed_origins: "http://localhost:*",
      vars: "[]",
      header_rules: "[]",
      param_rules: "[]",
      allowed_hosts: null,
    };
    // Emulates the keyless lookup: the statement binds the candidates first and
    // the exact-origin tiebreak last, so matching on the binds tests the real
    // candidate set (exact origin + loopback wildcard).
    const stmt = (sql: string) => {
      let values: unknown[] = [];
      const s = {
        bind: (...v: unknown[]) => {
          values = v;
          return s;
        },
        run: async () => ({ meta: { changes: 0 } }),
        all: async () => ({ results: [] }),
        first: async () => {
          if (sql.includes("FROM api_keys")) return null; // no key presented
          if (sql.includes("FROM keyless_origins")) {
            const candidates = values.slice(0, -1).map(String);
            return candidates.some((c) => grants.includes(c)) ? keylessRow : null;
          }
          return null;
        },
      };
      return s;
    };
    const keyed = { ...env, DB: { prepare: stmt }, REQUIRE_API_KEY: "true" } as unknown as Env;
    const calls = stubFetch(() => new Response("ok", { status: 200 }));

    const granted = await call(
      "/fetch?url=https://example.com/data",
      { headers: { origin: "http://localhost:5173" } },
      keyed,
    );
    expect(granted.status).toBe(200);
    expect(calls).toHaveLength(1);

    // A different loopback host is a different origin, and a lookalike host the
    // wildcard must not reach.
    const otherHost = await call(
      "/fetch?url=https://example.com/data",
      { headers: { origin: "http://127.0.0.1:5173" } },
      keyed,
    );
    expect(otherHost.status).toBe(401);
    const lookalike = await call(
      "/fetch?url=https://example.com/data",
      { headers: { origin: "http://localhost.evil.test" } },
      keyed,
    );
    expect(lookalike.status).toBe(401);
    expect(calls).toHaveLength(1);
  });

  /** One key with a host-scoped client variable, an unscoped one and a private one. */
  function clientVarRow(over: Record<string, unknown> = {}) {
    return {
      ...injectingRow,
      id: "k-cv",
      name: "client-vars",
      vars: JSON.stringify([
        { name: "VENDOR_KEY", value: "vendor-secret", client: true, hosts: ["api.vendor.com"] },
        { name: "PUBLIC_ID", value: "id-1", client: true },
        { name: "PRIVATE_KEY", value: "private-secret" },
      ]),
      header_rules: "[]",
      param_rules: "[]",
      response_rules: "[]",
      allowed_hosts: "api.vendor.com, api.other.com",
      ...over,
    };
  }

  it("resolves a caller's reference only where the variable allows", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(clientVarRow());
    const headers = { "x-api-key": "corx_k", "x-vendor": "Bearer ${VENDOR_KEY}" };
    await call("/fetch?url=https://api.vendor.com/data", { headers }, keyed);
    await call("/fetch?url=https://api.other.com/data", { headers }, keyed);
    expect(calls.map((c) => c.headers.get("x-vendor"))).toEqual([
      "Bearer vendor-secret",
      "Bearer ${VENDOR_KEY}", // out of the variable's scope: left as written
    ]);
  });

  it("leaves unknown and private references literal — no probing oracle", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(clientVarRow());
    const res = await call(
      "/fetch?url=https://api.vendor.com/data",
      { headers: { "x-api-key": "corx_k", "x-a": "${PRIVATE_KEY}", "x-b": "${NOPE}" } },
      keyed,
    );
    expect(res.status).toBe(200);
    expect(calls[0]?.headers.get("x-a")).toBe("${PRIVATE_KEY}");
    expect(calls[0]?.headers.get("x-b")).toBe("${NOPE}");
  });

  it("never substitutes a reference in a header the proxy owns", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(clientVarRow());
    await call(
      "/fetch?url=https://api.vendor.com/data",
      { headers: { "x-api-key": "corx_k", "x-admin-token": "${PUBLIC_ID}", "x-other": "${PUBLIC_ID}" } },
      keyed,
    );
    // X-Api-Key / X-Admin-Token are STRIP_REQUEST, so they are dropped before
    // anything is resolved: neither substituted nor forwarded (a caller cannot
    // reach the target with them at all). Everything else resolves normally.
    expect(calls[0]?.headers.get("x-api-key")).toBeNull();
    expect(calls[0]?.headers.get("x-admin-token")).toBeNull();
    expect(calls[0]?.headers.get("x-other")).toBe("id-1");
  });

  it("lets an operator rule win over the caller's reference", async () => {
    const row = clientVarRow({
      header_rules: JSON.stringify([
        { action: "set", name: "X-Vendor", value: "rule-value", hosts: ["api.vendor.com"] },
      ]),
    });
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(row);
    await call(
      "/fetch?url=https://api.vendor.com/data",
      { headers: { "x-api-key": "corx_k", "x-vendor": "${VENDOR_KEY}" } },
      keyed,
    );
    expect(calls[0]?.headers.get("x-vendor")).toBe("rule-value");
  });

  it("resolves references in the caller's query and keeps unknown ones literal", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(clientVarRow());
    const target = "https://api.vendor.com/data?k=${VENDOR_KEY}&n=${NOPE}";
    await call(`/fetch?url=${encodeURIComponent(target)}`, { headers: { "x-api-key": "corx_k" } }, keyed);
    // Resolving re-serializes the query (as param rules already do), so compare
    // decoded values: the reference resolved, the unknown one stayed literal.
    const sent = new URL(calls[0]?.url as string);
    expect(sent.searchParams.get("k")).toBe("vendor-secret");
    expect(sent.searchParams.get("n")).toBe("${NOPE}");
  });

  it("never touches the shared cache for a key with client references", async () => {
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const puts: unknown[] = [];
    const { env: keyed } = envForKey(clientVarRow());
    const withBucket = {
      ...keyed,
      CACHE_BUCKET: {
        get: async () => null,
        put: async (...args: unknown[]) => {
          puts.push(args);
        },
        list: async () => ({ objects: [] }),
        delete: async () => undefined,
      },
    } as unknown as Env;
    const first = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, withBucket);
    const second = await call("/fetch?url=https://api.vendor.com/data", { headers: { "x-api-key": "corx_k" } }, withBucket);
    expect([first.headers.get("x-corx-cache"), second.headers.get("x-corx-cache")]).toEqual(["MISS", "MISS"]);
    expect(puts).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });

  it("re-scopes a reference on every redirect hop", async () => {
    let hop = 0;
    const calls = stubFetch(() => {
      hop++;
      if (hop === 1) return new Response(null, { status: 302, headers: { location: "https://api.other.com/next" } });
      return new Response("ok", { status: 200 });
    });
    const { env: keyed } = envForKey(clientVarRow());
    const res = await call(
      "/fetch?url=https://api.vendor.com/data",
      { headers: { "x-api-key": "corx_k", "x-vendor": "Bearer ${VENDOR_KEY}" } },
      keyed,
    );
    expect(res.status).toBe(200);
    expect(calls.map((c) => c.headers.get("x-vendor"))).toEqual(["Bearer vendor-secret", "Bearer ${VENDOR_KEY}"]);
  });

  it("lets a keyless caller reference an exposed variable", async () => {
    const row = clientVarRow({
      keyless: 1,
      allowed_origins: "https://app.example",
      vars: JSON.stringify([{ name: "PUBLIC_ID", value: "id-1", client: true }]),
    });
    const calls = stubFetch(() => new Response("ok", { status: 200 }));
    const { env: keyed } = envForKey(row);
    const res = await call(
      "/fetch?url=https://api.vendor.com/data",
      { headers: { origin: "https://app.example", "x-pub": "${PUBLIC_ID}" } },
      { ...keyed, REQUIRE_API_KEY: "true" } as Env,
    );
    expect(res.status).toBe(200);
    expect(calls[0]?.headers.get("x-pub")).toBe("id-1");
  });
});

describe("error pages (integration)", () => {
  /** D1 that throws on any query — forces a 500 out of a console page. */
  const brokenDb = {
    prepare: () => {
      throw new Error("boom");
    },
  } as unknown as D1Database;

  it("keeps the console shell when an authenticated console route fails", async () => {
    const res = await call(
      "/console/keys",
      { headers: { cookie: `corx_session=${sessionCookie}` } },
      { ...env, DB: brokenDb } as Env,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    // The shell survives: sidebar drawer + the signed-in user in the topbar.
    expect(html).toContain("console-drawer");
    expect(html).toContain("tester@example.com");
    // …with the error card as the page content and a support-friendly reference.
    expect(html).toContain("Back to console");
    expect(html).toContain("/console/keys");
  });

  it("keeps the JSON wire format for the admin API", async () => {
    const res = await call(
      "/api/keys",
      { headers: { authorization: "Bearer test-token" } },
      { ...env, DB: brokenDb } as Env,
    );
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ error: "Internal error" });
  });
});

describe("per-key SSRF guard toggles (integration)", () => {
  const keyRow = {
    id: "k1",
    key_hash: "h",
    name: "key",
    rate_limit_per_min: null,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
  };
  const headers = { "x-api-key": "corx_test-key" };

  it("ip_check=0 lets a private IP literal reach the upstream", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream ok", { status: 200 })));
    const res = await call("/fetch?url=http://10.0.0.5/x", { headers }, envWithKey({ ...keyRow, ip_check: 0 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("upstream ok");
  });

  it("ip_check=1 (default) blocks the same literal", async () => {
    const res = await call("/fetch?url=http://10.0.0.5/x", { headers }, envWithKey(keyRow));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "Blocked host: 10.0.0.5" });
  });

  it("dns_check=1 blocks a name that resolves to a private IP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ Answer: [{ type: 1, data: "127.0.0.1" }] }), { status: 200 })),
    );
    const res = await call("/fetch?url=http://localtest.me/", { headers }, envWithKey(keyRow));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("non-public IP") });
  });

  it("dns_check=0 skips the resolve check", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream ok", { status: 200 })));
    const res = await call("/fetch?url=http://localtest.me/", { headers }, envWithKey({ ...keyRow, dns_check: 0 }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("upstream ok");
  });
});

describe("proxy wiring (integration)", () => {
  it("blocks private-IP targets before any network call", async () => {
    const res = await call("/fetch?url=http://127.0.0.1/");
    expect(res.status).toBe(403);
  });

  it("proxies a valid target (DNS check + upstream fetch)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("hello upstream", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await call("/fetch?url=https://example.com/data");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello upstream");
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("path-style /https://… works through the catch-all", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
        return new Response("path-style ok", { status: 200 });
      }),
    );
    const res = await call("/https://example.com/path");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("path-style ok");
  });

  it("/fetch errors keep CORS headers for browser callers", async () => {
    const res = await call("/fetch", { headers: { origin: "https://app.example" } });
    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects an oversized upload before forwarding anything", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
        seen.push(u.hostname);
        return new Response("ok", { status: 200 });
      }),
    );
    const res = await call(
      "/fetch?url=https://example.com/upload",
      { method: "POST", body: "x".repeat(64) },
      { ...env, MAX_BODY_BYTES: "16" } as Env,
    );
    expect(res.status).toBe(413);
    expect(seen).toEqual([]);
  });

  it("a failed body read fails loudly instead of forwarding an empty POST", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = new URL(String(url));
        if (u.hostname === "cloudflare-dns.com") return new Response(JSON.stringify({ Answer: [] }), { status: 200 });
        return new Response("ok", { status: 200 });
      }),
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("client aborted"));
      },
    });
    const req = new Request("https://corx.test/fetch?url=https://example.com/upload", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    const res = await worker.fetch(req, env, ctx);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "Failed to read request body" });
  });

  it("admin API is reachable with a bearer token", async () => {
    const res = await call("/api/blocked-hosts", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hosts: [] });
  });

  it("logs API accepts a lookback window", async () => {
    const res = await call("/api/logs?limit=5&hours=48", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ logs: [] });
  });

  it("stats API keeps the bare call as the 24h detail", async () => {
    const res = await call("/api/stats", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: string; hourly: unknown[] };
    expect(body.window).toBe("24h");
    expect(body.hourly).toBeInstanceOf(Array);
  });

  it("stats API returns a week-over-week comparison for ?days=28", async () => {
    const res = await call("/api/stats?days=28", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      window: string;
      days: number;
      daily: unknown[];
      current: Record<string, number>;
      previous: Record<string, number>;
      delta: { origins: unknown };
    };
    expect(body.window).toBe("28d");
    expect(body.days).toBe(28);
    expect(body.daily).toHaveLength(56); // current + previous period
    // Both periods are on screen at once — the whole point of the endpoint.
    expect(body.current).toMatchObject({ requests: 0, origins: 0, keys: 0 });
    expect(body.previous).toMatchObject({ requests: 0, origins: 0, keys: 0 });
    expect(body.delta.origins).toEqual({ current: 0, previous: 0, abs: 0, pct: 0 });
  });

  it("stats API clamps ?days= to 1…365", async () => {
    const res = await call("/api/stats?days=9999", { headers: { authorization: "Bearer test-token" } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window: string; daily: unknown[] };
    expect(body.window).toBe("365d");
    expect(body.daily).toHaveLength(730);
  });
});

describe("JSONP (integration)", () => {
  /** fetch stub: answers DoH, returns `res` for the target. */
  function stubUpstream(res: () => Response) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return res();
      }),
    );
  }

  it("wraps a JSON response as a script call", async () => {
    stubUpstream(() => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }));
    const res = await call("/fetch?url=https://api.example.com/data&corx-callback=cb");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe('/**/ cb({"ok":true});\n');
  });

  it("wraps errors too, so the script callback still fires", async () => {
    stubUpstream(() => new Response("not json", { status: 200, headers: { "content-type": "text/plain" } }));
    const res = await call("/fetch?url=https://api.example.com/data&corx-callback=cb");
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text.startsWith("/**/ cb(")).toBe(true);
    const payload = text.slice(text.indexOf("(") + 1, text.lastIndexOf(")"));
    expect(JSON.parse(payload)).toMatchObject({ error: expect.stringContaining("JSONP needs a JSON response") });
  });

  it("returns a plain JSON 400 for an invalid callback name", async () => {
    const res = await call("/fetch?url=https://api.example.com/data&corx-callback=1bad");
    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Invalid JSONP callback") });
  });

  it("never caches a JSONP body (the callback is caller-specific)", async () => {
    stubUpstream(() => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }));
    const puts: unknown[] = [];
    const bucket = {
      get: async () => null,
      put: async (...args: unknown[]) => {
        puts.push(args);
      },
      list: async () => ({ objects: [] }),
      delete: async () => undefined,
    };
    const res = await call(
      "/fetch?url=https://api.example.com/data&corx-callback=cb",
      {},
      { ...env, CACHE_BUCKET: bucket } as unknown as Env,
    );
    expect(res.status).toBe(200);
    expect(puts).toHaveLength(0);
  });

  /** fetch stub that records the upstream URL it was asked for. */
  function recordUpstream(res: () => Response): string[] {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        calls.push(url);
        return res();
      }),
    );
    return calls;
  }

  it("leaves a target's own callback param alone when JSONP isn't requested", async () => {
    const calls = recordUpstream(() => new Response("x", { status: 200 }));
    const target = encodeURIComponent("https://api.example.com/x?callback=upstream");
    await call(`/fetch?url=${target}`);
    expect(calls[0]).toContain("callback=upstream");
  });

  it("does not forward the JSONP callback to the upstream", async () => {
    const calls = recordUpstream(
      () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    await call("/https://api.example.com/x?corx-callback=cb");
    expect(calls[0]).not.toContain("callback");
  });
});

describe("control params (integration)", () => {
  /** fetch stub: answers DoH, records the upstream URLs it was asked for. */
  function recordUpstream(res: () => Response): string[] {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        calls.push(url);
        return res();
      }),
    );
    return calls;
  }

  function bucketSpy() {
    const puts: string[] = [];
    const bucket = {
      get: async () => null,
      put: async (key: string) => {
        puts.push(key);
      },
      list: async () => ({ objects: [] }),
      delete: async () => undefined,
    };
    return { puts, env: { ...env, CACHE_BUCKET: bucket } as unknown as Env };
  }

  const plainRow = {
    id: "k2",
    key_hash: "h",
    name: "plain",
    rate_limit_per_min: null,
    allowed_origins: null,
    cache_ttl: null,
    no_cache: 0,
    ip_check: 1,
    dns_check: 1,
    vars: "[]",
    header_rules: "[]",
    param_rules: "[]",
    allowed_hosts: null,
    keyless: 0,
    created_at: "2026-01-01T00:00:00.000Z",
    revoked_at: null,
  };

  it("accepts every control param in the prefixed spelling", async () => {
    const calls = recordUpstream(() => new Response("ok", { status: 200 }));
    const res = await call("/fetch?url=https://api.example.com/x&corx-key=corx_abc&corx-ttl=60");
    expect(res.status).toBe(200);
    // Control params are the proxy's: the target never sees them.
    expect(calls[0]).toBe("https://api.example.com/x");
  });

  it("lets a caller-supplied target keep its own key/ttl/callback", async () => {
    const calls = recordUpstream(() => new Response("ok", { status: 200 }));
    const target = encodeURIComponent("https://api.example.com/x?key=abc&ttl=7&callback=upstream");
    const res = await call(`/fetch?url=${target}`);
    expect(res.status).toBe(200);
    expect(calls[0]).toBe("https://api.example.com/x?key=abc&ttl=7&callback=upstream");
  });

  it("never forwards the corx key when it is a request param", async () => {
    const calls = recordUpstream(() => new Response('{"ok":true}', { status: 200 }));
    const res = await call(`/fetch?url=https://api.example.com/x&corx-key=corx_abc`, {}, envWithKey(plainRow));
    expect(res.status).toBe(200);
    expect(calls[0]).toBe("https://api.example.com/x");
  });

  it("honours corx-no-cache: the response is never written to R2", async () => {
    recordUpstream(() => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }));
    const cached = bucketSpy();
    expect((await call("/fetch?url=https://api.example.com/x", {}, cached.env)).status).toBe(200);
    expect(cached.puts).toHaveLength(1);

    const bypassed = bucketSpy();
    const res = await call("/fetch?url=https://api.example.com/x&corx-no-cache=1", {}, bypassed.env);
    expect(res.status).toBe(200);
    expect(bypassed.puts).toHaveLength(0);
  });

  it("wraps a JSON body for corx-callback too", async () => {
    recordUpstream(
      () => new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } }),
    );
    const res = await call("/fetch?url=https://api.example.com/x&corx-callback=cb");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('/**/ cb({"ok":true});\n');
  });

  it("rejects an unknown corx-* param instead of forwarding the typo", async () => {
    const calls = recordUpstream(() => new Response("ok", { status: 200 }));
    const res = await call("/fetch?url=https://api.example.com/x&corx-tt1=60");
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("corx-tt1") });
    expect(calls).toHaveLength(0);
  });

  it("never reads the un-prefixed names: they are the target's params", async () => {
    const calls = recordUpstream(() => new Response("ok", { status: 200 }));
    const buckets = bucketSpy();
    // `ttl`/`no-cache`/`key` on the proxy query mean nothing to corx now.
    const res = await call("/fetch?url=https://api.example.com/x&ttl=1&no-cache=1&callback=cb", {}, buckets.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-corx-cache")).toBe("MISS");
    expect(buckets.puts).toHaveLength(1); // still cached: no-cache=1 was ignored
    expect(calls[0]).toBe("https://api.example.com/x");
  });
});

describe("console key form (integration)", () => {
  /** D1 that answers the update flow and records the UPDATE it ran. */
  function updateDb(current: Record<string, unknown>) {
    const updates: Array<{ sql: string; values: unknown[] }> = [];
    const prepare = (sql: string) => {
      const call = { sql, values: [] as unknown[] };
      const stmt = {
        bind(...values: unknown[]) {
          call.values = values;
          return stmt;
        },
        run: async () => {
          if (sql.startsWith("UPDATE api_keys")) updates.push(call);
          return { meta: { changes: 1 } };
        },
        first: async () => (sql.includes("FROM api_keys") ? current : null),
        all: async () => ({ results: sql.includes("FROM api_keys") ? [current] : [] }),
      };
      return stmt;
    };
    return { env: { ...env, DB: { prepare } } as unknown as Env, updates };
  }

  const storedKey = {
    id: "key-1",
    name: "my-app",
    vars: "[]",
    header_rules: "[]",
    param_rules: "[]",
    response_rules: "[]",
    allowed_hosts: null,
    keyless: 0,
    allowed_origins: null,
    ip_check: 1,
    dns_check: 1,
    tier: "standard",
    daily_limit_per_origin: null,
    daily_limit_per_host: null,
    daily_limit_total: null,
  };

  const revokedKey = {
    ...storedKey,
    id: "key-dead",
    name: "old-app",
    revoked_at: "2026-01-03T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
  };

  it("saves the response header rules the edit panel collected", async () => {
    const { env: withDb, updates } = updateDb(storedKey);
    const csrf = await csrfFrom("/console/keys", withDb);
    const res = await call(
      "/console/keys/key-1",
      {
        method: "POST",
        headers: {
          cookie: `corx_session=${sessionCookie}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body:
          `csrf=${csrf}&checks=1&name=my-app&allowedHosts=${encodeURIComponent("api.vendor.com")}` +
          `&responseRules=${encodeURIComponent("!X-Frame-Options")}`,
      },
      withDb,
    );
    expect(res.status).toBe(302);
    const update = updates.find((u) => u.sql.includes("response_rules = ?"));
    expect(update, "the update must carry the response rules column").toBeDefined();
    expect(update?.values.some((v) => typeof v === "string" && v.includes("X-Frame-Options"))).toBe(true);
  });

  it("carries the save form's double-submit guard", async () => {
    // The double click itself has no DOM harness here (the issue says so), and
    // an island's onSubmit never reaches the SSR markup — so this pins the
    // guard at the island's source, like the referrer-policy assertions in
    // test/auth.test.ts. It fails if the guard is dropped.
    expect(keyPanelSrc).toContain("onSubmit={onSubmit}");
    expect(keyPanelSrc).toContain('setAttribute("aria-busy", "true")');
    expect(keyPanelSrc).toContain("submitRef.current.disabled = true");
    expect(keyPanelSrc).toContain("submitRef.current.textContent = labels.saving");
    // ...the form it guards is on the console page it is rendered into.
    const res = await call("/console/keys", { headers: { cookie: `corx_session=${sessionCookie}` } });
    const html = await res.text();
    expect(html).toContain('action="/console/keys"');
    expect(html).toContain('type="submit"');
  });

  it("renders a failed save inside the re-opened edit panel, not behind it", async () => {
    // The keys table has to render the row, otherwise there is no edit panel
    // to re-open — that is the state a failed save comes back in.
    const row = { ...storedKey, created_at: "2026-01-02T03:04:05Z" };
    const { env: withDb } = updateDb(row);
    const csrf = await csrfFrom("/console/keys", withDb);
    const res = await call(
      "/console/keys/key-1",
      {
        method: "POST",
        headers: {
          cookie: `corx_session=${sessionCookie}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body:
          `csrf=${csrf}&checks=1&name=my-app&allowedHosts=${encodeURIComponent("api.vendor.com")}` +
          `&headerRules=${encodeURIComponent("X-A: 1\nX-B: 2\nX-C: 3\n=bad")}`,
      },
      withDb,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    // The server's line prefix survives, so the operator can find line 4.
    expect(html).toContain("Header rules line 4");
    // The message lands in the edit dialog that hydration re-opens over the page
    // (the island-prop copy outside the dialogs is the hydration payload).
    const dialogs = html.match(/<dialog[\s\S]*?<\/dialog>/g) ?? [];
    const withError = dialogs.filter((d) => d.includes("Header rules line 4"));
    expect(withError).toHaveLength(1);
    expect(withError[0]).toContain('action="/console/keys/key-1"');
    // A failed save re-opens the advanced policy expanded, so a rejected rule
    // is on screen without another click.
    expect(withError[0]).toMatch(/<details[^>]*\sopen/);
    // ...not in the page-level alert, which the top layer would cover.
    expect(html).not.toContain("alert-error mb-4");
  });

  it("hides revoked keys by default, and shows the badge behind ?revoked=1", async () => {
    const { env: withDb } = updateDb(revokedKey);

    const hidden = await call("/console/keys", { headers: { cookie: `corx_session=${sessionCookie}` } }, withDb);
    const hiddenHtml = await hidden.text();
    expect(hiddenHtml).not.toContain("old-app");
    // The toggle reports what is one click away, even while hidden.
    expect(hiddenHtml).toContain("Show revoked (1)");

    const shown = await call("/console/keys?revoked=1", { headers: { cookie: `corx_session=${sessionCookie}` } }, withDb);
    const shownHtml = await shown.text();
    expect(shownHtml).toContain("old-app");
    expect(shownHtml).toContain(">revoked</span>");
    expect(shownHtml).toContain("Hide revoked");
    // Policy is history: the panel opens read-only (every control disabled)
    // with no Save button — and Delete stays available for cleanup.
    expect(shownHtml).toContain("<fieldset disabled");
    expect(shownHtml).not.toContain(">Save</button>");
    expect(shownHtml).toContain("This key is revoked");
    // Nothing left to revoke: no revoke dialog and no revoke button.
    expect(shownHtml).not.toContain("/console/keys/key-dead/revoke");
  });

  it("revokes from the console behind the type-the-name check, keeping the row", async () => {
    const { env: withDb, updates } = updateDb(storedKey);
    const csrf = await csrfFrom("/console/keys", withDb);
    const post = (body: string) =>
      call(
        "/console/keys/key-1/revoke",
        {
          method: "POST",
          headers: {
            cookie: `corx_session=${sessionCookie}`,
            "content-type": "application/x-www-form-urlencoded",
          },
          body,
        },
        withDb,
      );

    const mismatch = await post(`confirmName=nope&csrf=${csrf}`);
    expect(mismatch.status).toBe(200);
    expect(await mismatch.text()).toContain("was not revoked");
    expect(updates).toHaveLength(0);

    const ok = await post(`confirmName=my-app&csrf=${csrf}`);
    expect(ok.status).toBe(302);
    // The redirect turns the toggle on: the dead key is still visible.
    expect(ok.headers.get("location")).toBe("/console/keys?revoked=1");
    const revoke = updates.find((u) => u.sql.includes("revoked_at"));
    expect(revoke, "revoke must set revoked_at").toBeDefined();
    expect(revoke?.values).toContain("key-1");
  });
});


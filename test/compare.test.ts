import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../app/server.js";
import type { Env } from "../app/lib/types.js";
import { COMPARISONS, sourceNoteKey } from "../app/lib/compare.js";
import { makeT } from "../app/lib/i18n/locale.js";

/**
 * The /compare/<name> surface: the registry's own rules, and the page contract
 * (canonical + hreflang cluster, dated JSON-LD, sources on the page, the row
 * the competitor wins, FAQ entry point, sitemap/llms coverage).
 *
 * Issue #39 calls this the highest "reads as marketing" risk in the project, so
 * the invariants are tests, not review notes.
 */

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

async function call(path: string, init: RequestInit = {}, e: Env = env): Promise<Response> {
  return worker.fetch(new Request(`https://corx.test${path}`, init), e, ctx);
}

afterEach(() => vi.unstubAllGlobals());

describe("comparison registry", () => {
  it("keeps slugs unique", () => {
    const slugs = COMPARISONS.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every competitor claim a dated https source", () => {
    for (const comparison of COMPARISONS) {
      expect(comparison.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(comparison.site).toMatch(/^https:\/\//);
      expect(comparison.docs).toMatch(/^https:\/\//);
      expect(comparison.rows.length).toBeGreaterThanOrEqual(7); // the issue's checklist
      for (const row of comparison.rows) {
        expect(row.source.url, `${comparison.slug}/${row.id}`).toMatch(/^https:\/\//);
        expect(row.source.checked, `${comparison.slug}/${row.id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        // The note that says what the source supports is page copy, so it must
        // exist in both dictionaries — not just the English one.
        for (const locale of ["en", "zh"] as const) {
          const note = makeT(locale)(sourceNoteKey(comparison.slug, row.id));
          expect(note.length, `${locale} ${comparison.slug}/${row.id}`).toBeGreaterThan(20);
          expect(note, `${locale} ${comparison.slug}/${row.id} fell back to the key`).not.toBe(
            sourceNoteKey(comparison.slug, row.id),
          );
        }
      }
    }
  });

  it("marks at least one row per page as the competitor's", () => {
    for (const comparison of COMPARISONS) {
      const theirs = comparison.rows.filter((r) => r.theirs).length;
      // A table the competitor never wins is marketing, not a comparison.
      expect(theirs, `${comparison.slug} has no row the competitor wins`).toBeGreaterThan(0);
    }
  });

  it("dates every claim, and the page by its most recent claim", () => {
    // A later pass over one page must not re-date the rows nobody re-read, so
    // dates are per row and the page-level date (header + JSON-LD) is the
    // freshest of them — it can never understate how recent the page is.
    const today = new Date().toISOString().slice(0, 10);
    for (const comparison of COMPARISONS) {
      const dates = comparison.rows.map((row) => {
        const where = `${comparison.slug}/${row.id}`;
        expect(row.source.checked, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(row.source.checked <= today, `${where}: source dated in the future`).toBe(true);
        return row.source.checked;
      });
      expect(comparison.checked, `${comparison.slug}: page date is not its latest claim`).toBe(
        [...dates].sort().at(-1),
      );
    }
  });

  it("states why every theirs row stays in the table, and links the open work", () => {
    for (const comparison of COMPARISONS) {
      for (const row of comparison.rows) {
        const id = `${comparison.slug}/${row.id}`;
        if (row.status === "planned") {
          // A planned row is a promise: it must be a loss the tracker owns.
          expect(row.theirs, `${id}: planned but not a theirs row`).toBe(true);
          expect(row.trackedIn, `${id}: planned without a tracking issue`).toMatch(
            /^https:\/\/github\.com\/envx-cn\/corx\/issues\/\d+$/,
          );
        } else {
          expect(row.trackedIn, `${id}: trackedIn without status planned`).toBeUndefined();
          if (row.theirs) {
            expect(row.status, `${id}: theirs row without an explicit status`).toBe("accepted");
          }
        }
      }
    }
    // Planned rows exist only while their task is open; the last one
    // (AllOrigins' `extras`) flipped when #51 landed. The per-row rendering
    // test below follows whatever statuses the registry carries.
  });
});

describe("compare page contract", () => {
  it("renders the x-default page with canonical, cluster and dated JSON-LD", async () => {
    const res = await call("/compare/corsproxy-io");
    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('<link rel="canonical" href="https://corx.test/compare/corsproxy-io"/>');
    expect(html).toContain('<link rel="alternate" hreflang="en" href="https://corx.test/en/compare/corsproxy-io"/>');
    expect(html).toContain('<link rel="alternate" hreflang="zh" href="https://corx.test/zh/compare/corsproxy-io"/>');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="https://corx.test/compare/corsproxy-io"/>');
    expect(html).toContain('name="robots" content="index, follow, max-image-preview:large, max-snippet:-1"');
    expect(html).toContain("CORX vs corsproxy.io");

    // The honest half of the table is rendered, not just stored.
    expect(html).toContain("They win this row");
    // The CORX column names the capability that closed the response-header gap
    // (#52), so the page cannot quietly understate the repo again.
    expect(html).toContain("response header rules");

    // Sources: links out to the competitor's own documentation, with the date.
    expect(html).toContain('href="https://corsproxy.io/docs/header-rewrites/"');
    expect(html).toContain("Last checked 2026-09-17");

    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const graph = JSON.parse(match![1]!);
    const page = graph["@graph"][0];
    expect(page["@type"]).toBe("WebPage");
    expect(page["url"]).toBe("https://corx.test/compare/corsproxy-io");
    expect(page["dateModified"]).toBe("2026-09-17");
    // The comparison hangs off the landing page's entities rather than
    // inventing a parallel product identity.
    expect(page["isPartOf"]["@id"]).toBe("https://corx.test/#website");
    expect(JSON.stringify(page)).toContain("corsproxy.io");
  });

  it("labels every theirs row as accepted or planned, in both languages", async () => {
    for (const comparison of COMPARISONS) {
      const en = await (await call(`/compare/${comparison.slug}`)).text();
      const zh = await (await call(`/zh/compare/${comparison.slug}`)).text();
      for (const row of comparison.rows.filter((r) => r.theirs)) {
        const status = row.status ?? "accepted";
        const where = `${comparison.slug}/${row.id}`;
        expect(en, `${where} en`).toContain(makeT("en")(`compare.status.${status}`));
        expect(zh, `${where} zh`).toContain(makeT("zh")(`compare.status.${status}`));
        if (status === "planned") {
          // The label is a link to the issue that closes the gap.
          expect(en, where).toContain(`href="${row.trackedIn}"`);
          expect(zh, where).toContain(`href="${row.trackedIn}"`);
        }
      }
    }
  });

  it("serves the prefixed URLs as their own canonical documents and remembers the choice", async () => {
    const en = await call("/en/compare/allorigins");
    expect(en.status).toBe(200);
    expect(en.headers.get("set-cookie")).toContain("corx_lang=en");
    const enHtml = await en.text();
    expect(enHtml).toContain('<link rel="canonical" href="https://corx.test/en/compare/allorigins"/>');
    // The language switch stays inside the comparison, not on the landing.
    expect(enHtml).toContain('href="/zh/compare/allorigins"');

    const zh = await call("/zh/compare/allorigins");
    const zhHtml = await zh.text();
    expect(zhHtml).toContain('<html lang="zh"');
    expect(zhHtml).toContain("CORX 对比 AllOrigins");
    expect(zhHtml).toContain("这一项它更好");
    expect(zhHtml).toContain("响应头规则");
    expect(zhHtml).toContain('<link rel="canonical" href="https://corx.test/zh/compare/allorigins"/>');
  });

  it("turns ?lang= into the prefixed URL, the way the terms page does", async () => {
    const res = await call("/compare/allorigins?lang=zh");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/zh/compare/allorigins");
    expect(res.headers.get("set-cookie")).toContain("corx_lang=zh");
  });

  it("renders the source notes in the page's language", async () => {
    const en = await (await call("/compare/corsproxy-io")).text();
    expect(en).toContain("Header overrides are query parameters");
    const zh = await (await call("/zh/compare/corsproxy-io")).text();
    expect(zh).toContain("Header 覆盖走查询参数");
    expect(zh).not.toContain("Header overrides are query parameters");
  });

  it("renders the credential-scoping row with its own source and date", async () => {
    const en = await (await call("/compare/corsfix")).text();
    expect(en).toContain("Credential scoping");
    // Its own source, dated later than the page's original pass.
    expect(en).toContain('href="https://corsfix.com/docs/dashboard/application"');
    expect(en).toContain("Last checked 2026-09-18");
    const zh = await (await call("/zh/compare/corsfix")).text();
    expect(zh).toContain("凭证作用域");
    expect(zh).toContain("https://corsfix.com/docs/dashboard/application");
  });

  it("404s an unknown comparison with the branded page", async () => {
    const res = await call("/compare/nope-not-a-proxy");
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain("404");
  });

  it("gives way to the proxy on a subdomain host, prefixed URLs included", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("cloudflare-dns.com")) {
          return new Response(JSON.stringify({ Answer: [{ type: 1, data: "1.2.3.4" }] }), { status: 200 });
        }
        return new Response("upstream compare", { status: 200, headers: { "content-type": "text/plain" } });
      }),
    );
    const res = await worker.fetch(
      new Request("https://example-com.corx.test/en/compare/corsproxy-io"),
      { ...env, PROXY_ZONE: "corx.test" } as Env,
      ctx,
    );
    expect(await res.text()).toBe("upstream compare");
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("compare discovery", () => {
  it("lists every comparison in the sitemap with its own hreflang cluster", async () => {
    const xml = await (await call("/sitemap.xml")).text();
    for (const comparison of COMPARISONS) {
      for (const path of [
        `/compare/${comparison.slug}`,
        `/en/compare/${comparison.slug}`,
        `/zh/compare/${comparison.slug}`,
      ]) {
        expect(xml).toContain(`<loc>https://corx.test${path}</loc>`);
      }
      expect(xml).toContain(
        `<xhtml:link rel="alternate" hreflang="x-default" href="https://corx.test/compare/${comparison.slug}"/>`,
      );
    }
  });

  it("links the comparisons from the FAQ and from the agent files", async () => {
    const landing = await (await call("/en")).text();
    expect(landing).toContain("Comparing it with another hosted proxy?");
    for (const comparison of COMPARISONS) {
      expect(landing).toContain(`href="/compare/${comparison.slug}"`);
    }
    // The FAQ JSON-LD stays the nine questions (including "Is CORX free?");
    // the compare links are page chrome.
    const graph = JSON.parse(
      (await (await call("/en")).text()).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!,
    );
    expect(graph["@graph"].find((n: Record<string, unknown>) => n["@type"] === "FAQPage")["mainEntity"].length).toBe(9);

    const zh = await (await call("/zh")).text();
    expect(zh).toContain("想和其他托管代理对比？");

    const index = await (await call("/llms.txt")).text();
    expect(index).toContain("(https://corx.test/compare/corsproxy-io)");
    const full = await (await call("/llms-full.txt")).text();
    expect(full).toContain("https://corx.test/compare/allorigins");
  });
});

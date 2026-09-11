import { describe, expect, it } from "vitest";
import { ErrorPage } from "../app/routes/_error-page.js";
import { makeT } from "../app/lib/i18n/locale.js";

/**
 * Standalone (no-shell) error document — the fallback base.onError uses when a
 * console request has no identity or the shell render itself fails. The
 * in-shell variant is covered end-to-end in test/integration.test.ts.
 */
describe("standalone error page", () => {
  const base = {
    status: 500,
    locale: "en" as const,
    origin: "https://corx.test",
    path: "/console/keys",
    t: makeT("en"),
  };

  it("renders the branded document with console CTAs for /console/*", () => {
    const html = String(ErrorPage(base));
    expect(html).toContain("status-code");
    expect(html).toContain("Back to console");
    expect(html).toContain("/console/keys");
    expect(html).toContain("Reference: 500");
  });

  it("offers the public CTAs outside the console", () => {
    const html = String(ErrorPage({ ...base, path: "/somewhere" }));
    expect(html).toContain("Take me home");
    expect(html).toContain("Open console");
    expect(html).not.toContain("Back to console");
  });

  it("localizes the copy (中文)", () => {
    const html = String(ErrorPage({ ...base, locale: "zh", t: makeT("zh") }));
    expect(html).toContain("返回控制台");
    expect(html).toContain("服务器错误");
  });
});

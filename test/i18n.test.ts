import { describe, expect, it } from "vitest";
import { detectLocale, detectLocaleConsole, makeT } from "../app/lib/i18n/locale.js";

describe("detectLocale (public pages)", () => {
  it("URL prefix wins over everything", () => {
    expect(
      detectLocale({ pathname: "/zh", cookie: "corx_lang=en", acceptLanguage: "en-US,en;q=0.9" }),
    ).toBe("zh");
    expect(
      detectLocale({ pathname: "/en/anything", cookie: "corx_lang=zh", acceptLanguage: "zh-CN,zh;q=0.9" }),
    ).toBe("en");
  });

  it("cookie beats Accept-Language", () => {
    expect(detectLocale({ pathname: "/", cookie: "corx_lang=zh", acceptLanguage: "en-US,en;q=0.9" })).toBe("zh");
    expect(detectLocale({ pathname: "/", cookie: "corx_lang=en", acceptLanguage: "zh-CN,zh;q=0.9" })).toBe("en");
  });

  it("Accept-Language is the fallback", () => {
    expect(detectLocale({ pathname: "/" })).toBe("en");
    expect(detectLocale({ pathname: "/", acceptLanguage: "zh-CN,zh;q=0.9" })).toBe("zh");
    expect(detectLocale({ pathname: "/", acceptLanguage: "fr-FR,fr;q=0.9,zh;q=0.5" })).toBe("en");
  });
});

describe("detectLocaleConsole", () => {
  it("cookie > Accept-Language, no URL prefix handling", () => {
    expect(detectLocaleConsole({ cookie: "corx_lang=zh", acceptLanguage: "en-US" })).toBe("zh");
    expect(detectLocaleConsole({ cookie: "corx_lang=en", acceptLanguage: "zh-CN" })).toBe("en");
    expect(detectLocaleConsole({ cookie: null, acceptLanguage: "zh-CN,zh;q=0.9" })).toBe("zh");
    expect(detectLocaleConsole({})).toBe("en");
  });
});

describe("makeT / lookup", () => {
  it("returns translated strings per locale", () => {
    const en = makeT("en");
    const zh = makeT("zh");
    expect(en("site.openConsole")).toBe("Open console");
    expect(zh("site.openConsole")).toBe("打开控制台");
  });

  it("interpolates {vars}", () => {
    expect(makeT("en")("site.copyright", { year: 2026 })).toBe("© 2026 CORX");
    expect(makeT("zh")("console.keys.ttlValue", { ttl: 300 })).toBe("TTL 300s");
  });

  it("falls back to en for a missing zh key (and the key itself as a last resort)", () => {
    const zh = makeT("zh");
    // @ts-expect-error testing runtime fallback with an unknown key
    expect(zh("does.not.exist")).toBe("does.not.exist");
    // en is complete; zh mirrors it, so nothing should fall back in practice
    expect(zh("lang.zh")).toBe("中文");
  });
});

/**
 * Origin-independent facts about corx, in one place.
 *
 * Four very different surfaces quote these and must never disagree: the public
 * pages' <head> (canonical / Open Graph / JSON-LD), the crawler files
 * (robots.txt, sitemap.xml, llms.txt), the shared site chrome, and the terms
 * page's abuse contact.
 *
 * Everything about a *deployment* — hostnames, keys, quotas, zone — comes from
 * the request or the environment instead, so this file is identical in every
 * copy of the repository (and can't leak one instance's values into another's
 * published pages).
 */

/** Public source repository (nav + footer links, JSON-LD `codeRepository`). */
export const GITHUB_URL = "https://github.com/envx-cn/corx";

/**
 * The canonical prose lives in the repository, not in these pages. llms.txt and
 * the landing page link to the rendered GitHub blobs so an answer engine can
 * always fetch the full, current text (and the code it describes).
 */
export const REPO_DOCS = {
  readme: `${GITHUB_URL}/blob/main/README.md`,
  readmeRaw: `${GITHUB_URL}/raw/main/README.md`,
  features: `${GITHUB_URL}/blob/main/FEATURES.md`,
  featuresRaw: `${GITHUB_URL}/raw/main/FEATURES.md`,
  contributing: `${GITHUB_URL}/blob/main/CONTRIBUTING.md`,
  security: `${GITHUB_URL}/blob/main/SECURITY.md`,
  license: `${GITHUB_URL}/blob/main/LICENSE`,
} as const;

/** Where abuse, security and content reports go (terms §7, robots/llms contact). */
export const ABUSE_EMAIL = "abuse@envx.cn";

/** SPDX id + human name, for JSON-LD (`license`) and llms.txt. */
export const LICENSE = { spdx: "MIT", url: "https://spdx.org/licenses/MIT.html" } as const;

/**
 * Date (YYYY-MM-DD) the public copy last materially changed — the sitemap's
 * `lastmod`, and the terms' own "last updated" line. Bump it when the landing
 * or terms content changes; a fabricated per-request timestamp would make the
 * sitemap useless as a freshness signal.
 */
export const CONTENT_UPDATED = "2026-09-16";

/** The two locales every public page exists in, default first. */
export const LOCALES = ["en", "zh"] as const;

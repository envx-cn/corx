/**
 * The `/compare/<name>` pages: the hosted CORS proxies CORX is most often
 * measured against.
 *
 * This file is the registry: structure, source URLs and dates. The prose — the
 * page copy and the per-claim source notes — lives in app/lib/i18n/messages.ts
 * (`compare.*`, en + zh), keyed by the unions below, so a row without copy
 * fails `tsc` instead of rendering blank.
 *
 * Rules for this file (issue #39 — the highest "reads as marketing" risk in the
 * project):
 *
 *  - Every competitor claim carries the URL it came from and the day it was
 *    read. Claims age: re-read the source before touching the page, and move
 *    `checked` when you do.
 *  - A row is marked `theirs` when the competitor is simply better. A table the
 *    competitor never wins reads as marketing, not as a comparison.
 *  - Never paraphrase a limit the competitor does not have; link their docs and
 *    say what they say. A claim without a source does not go on the page.
 *
 * Sources below were read on 2026-09-17.
 */
import type { MessageKey } from "./i18n/messages.js";

/** Row identity — maps to `compare.row.<id>`, `compare.us.<id>` and
    `compare.<slug>.row.<id>`. */
export type CompareRowId =
  | "auth"
  | "secrets"
  | "hosting"
  | "caching"
  | "logging"
  | "limits"
  | "price"
  | "setup"
  | "extras"
  | "availability";

export type CompareSlug = "corsproxy-io" | "corsfix" | "allorigins";

/** One place a claim came from, and the day it was read from there. */
export interface CompareSource {
  url: string;
  /** ISO day the source was read (YYYY-MM-DD). */
  checked: string;
}

export interface CompareRow {
  id: CompareRowId;
  /** True when the competitor is the better answer here. Rendered on the page. */
  theirs?: boolean;
  source: CompareSource;
}

export interface Comparison {
  slug: CompareSlug;
  /** Competitor name, spelled the way their own docs spell it. */
  name: string;
  /** Their site — linked from the page. */
  site: string;
  /** Their documentation: the primary source for every row's competitor cell. */
  docs: string;
  /** ISO day this page's claims were last read from the sources. */
  checked: string;
  rows: CompareRow[];
}

/** All rows were read on this date; a single constant keeps them consistent. */
const CHECKED = "2026-09-17";

export const COMPARISONS: Comparison[] = [
  {
    slug: "corsproxy-io",
    name: "corsproxy.io",
    site: "https://corsproxy.io/",
    docs: "https://corsproxy.io/docs/",
    checked: CHECKED,
    rows: [
      {
        id: "auth",
        source: { url: "https://corsproxy.io/", checked: CHECKED },
      },
      {
        // The category difference this whole page exists for: they have no
        // server-side secret store, so a caller's key can only travel with the
        // caller. Read the header-rewrites page before rewording this row.
        id: "secrets",
        source: { url: "https://corsproxy.io/docs/header-rewrites/", checked: CHECKED },
      },
      {
        id: "hosting",
        source: { url: "https://corsproxy.io/", checked: CHECKED },
      },
      {
        id: "caching",
        source: { url: "https://corsproxy.io/docs/dynamic-cache/", checked: CHECKED },
      },
      {
        id: "logging",
        source: { url: "https://corsproxy.io/privacy/", checked: CHECKED },
      },
      {
        id: "limits",
        source: { url: "https://corsproxy.io/pricing/", checked: CHECKED },
      },
      {
        id: "price",
        source: { url: "https://corsproxy.io/pricing/", checked: CHECKED },
      },
      {
        id: "setup",
        theirs: true,
        source: { url: "https://corsproxy.io/", checked: CHECKED },
      },
      {
        id: "extras",
        theirs: true,
        source: { url: "https://corsproxy.io/pricing/", checked: CHECKED },
      },
      {
        id: "availability",
        theirs: true,
        source: { url: "https://corsproxy.io/pricing/", checked: CHECKED },
      },
    ],
  },
  {
    // The closest match to CORX's own model: server-side secrets, open source,
    // a self-hosting path. Do not write this page as if Corsfix lacked the key
    // feature — it does not, and saying so would be the one lie that destroys
    // the other two pages' credibility.
    slug: "corsfix",
    name: "Corsfix",
    site: "https://corsfix.com/",
    docs: "https://corsfix.com/docs",
    checked: CHECKED,
    rows: [
      {
        id: "auth",
        source: { url: "https://corsfix.com/docs/getting-started", checked: CHECKED },
      },
      {
        id: "secrets",
        source: { url: "https://corsfix.com/docs/cors-proxy/secrets-variable", checked: CHECKED },
      },
      {
        id: "hosting",
        source: { url: "https://corsfix.com/docs/open-source/self-hosting", checked: CHECKED },
      },
      {
        id: "caching",
        source: { url: "https://corsfix.com/docs/cors-proxy/cached-response", checked: CHECKED },
      },
      {
        id: "logging",
        theirs: true,
        source: { url: "https://corsfix.com/privacy", checked: CHECKED },
      },
      {
        id: "limits",
        source: { url: "https://corsfix.com/docs/cors-proxy/quotas", checked: CHECKED },
      },
      {
        id: "price",
        source: { url: "https://corsfix.com/pricing", checked: CHECKED },
      },
      {
        id: "setup",
        theirs: true,
        source: { url: "https://corsfix.com/docs/free-tier", checked: CHECKED },
      },
      {
        id: "extras",
        source: { url: "https://corsfix.com/docs", checked: CHECKED },
      },
      {
        id: "availability",
        theirs: true,
        source: { url: "https://corsfix.com/", checked: CHECKED },
      },
    ],
  },
  {
    slug: "allorigins",
    name: "AllOrigins",
    site: "https://allorigins.win/",
    docs: "https://github.com/gnuns/allorigins",
    checked: CHECKED,
    rows: [
      {
        id: "auth",
        source: { url: "https://github.com/gnuns/allorigins", checked: CHECKED },
      },
      {
        id: "secrets",
        source: { url: "https://github.com/gnuns/allorigins", checked: CHECKED },
      },
      {
        id: "hosting",
        source: { url: "https://github.com/gnuns/allorigins", checked: CHECKED },
      },
      {
        id: "caching",
        source: { url: "https://allorigins.win/", checked: CHECKED },
      },
      {
        id: "logging",
        source: { url: "https://github.com/gnuns/allorigins/blob/main/package.json", checked: CHECKED },
      },
      {
        id: "limits",
        source: { url: "https://allorigins.win/", checked: CHECKED },
      },
      {
        id: "price",
        source: { url: "https://github.com/gnuns/allorigins", checked: CHECKED },
      },
      {
        id: "setup",
        theirs: true,
        source: { url: "https://allorigins.win/", checked: CHECKED },
      },
      {
        id: "extras",
        source: { url: "https://github.com/gnuns/allorigins", checked: CHECKED },
      },
      {
        id: "availability",
        source: { url: "https://github.com/gnuns/allorigins/commits/main", checked: CHECKED },
      },
    ],
  },
];

const BY_SLUG = new Map(COMPARISONS.map((c) => [c.slug, c]));

export function comparisonBySlug(slug: string): Comparison | undefined {
  return BY_SLUG.get(slug as CompareSlug);
}

/**
 * Message keys, derived rather than written out, so the copy can never drift
 * from the rows: adding a slug or a row id fails the build in messages.ts until
 * both locales have it.
 */
export function rowLabelKey(id: CompareRowId): MessageKey {
  return `compare.row.${id}`;
}
export function usCellKey(id: CompareRowId): MessageKey {
  return `compare.us.${id}`;
}
export function themCellKey(slug: CompareSlug, id: CompareRowId): MessageKey {
  return `compare.${slug}.row.${id}`;
}
/** What the source says, in the reader's language — shown under its URL. */
export function sourceNoteKey(slug: CompareSlug, id: CompareRowId): MessageKey {
  return `compare.${slug}.src.${id}`;
}
export function pageTitleKey(slug: CompareSlug): MessageKey {
  return `compare.${slug}.title`;
}
export function pageDescriptionKey(slug: CompareSlug): MessageKey {
  return `compare.${slug}.description`;
}
export function pageLeadKey(slug: CompareSlug): MessageKey {
  return `compare.${slug}.lead`;
}
export function pageWinsKey(slug: CompareSlug): MessageKey {
  return `compare.${slug}.wins`;
}

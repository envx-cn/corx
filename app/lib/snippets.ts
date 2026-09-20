/**
 * The `/snippets` page's code-coupled half.
 *
 * The page explains *where* each snippet runs (browser vs server) and why that
 * decides whether a key may appear in it; the code itself lives here so it is
 * built against the requesting deployment's own origin and covered by
 * `test/snippets.test.ts` (every snippet renders, every label exists in both
 * dictionaries, the base URL is never hard-coded to one deployment).
 *
 * Prose lives in `app/lib/i18n/messages.ts` (`snippets.*`, en + zh), keyed by
 * the unions below, so a snippet without copy fails `tsc` instead of rendering
 * blank.
 */
import type { MessageKey } from "./i18n/messages.js";

/** One code block, keyed by `snippets.block.<id>`. */
export type SnippetId = "fetch" | "axios" | "ky" | "keyless" | "stream" | "viteEnv" | "serverRoute";

/** The groups the page renders, and the order it renders them in. */
export type SnippetGroupId = "libraries" | "browser" | "server";

export const SNIPPET_GROUPS: readonly SnippetGroupId[] = ["libraries", "browser", "server"];

export interface Snippet {
  id: SnippetId;
  group: SnippetGroupId;
  /** Syntax label shown on the block; there is no highlighter behind it. */
  lang: "js" | "ts";
  /** The copyable code, built against this deployment's origin. */
  code: (origin: string) => string;
  /** Prose keys: `snippets.block.<id>.title` / `.desc`. */
  titleKey: MessageKey;
  descKey: MessageKey;
}

/** The shared line that keeps the key out of the browser build. */
const SERVER_ENV = "// server-side env var";

export const SNIPPETS: readonly Snippet[] = [
  {
    id: "fetch",
    group: "libraries",
    lang: "js",
    titleKey: "snippets.block.fetch.title",
    descKey: "snippets.block.fetch.desc",
    code: (origin) => `const CORX = "${origin}";

const res = await fetch(\`\${CORX}/fetch?url=\${encodeURIComponent(target)}\`, {
  headers: { "X-Api-Key": process.env.CORX_KEY }, ${SERVER_ENV}
});
if (!res.ok) throw new Error(\`CORX \${res.status}: \${await res.text()}\`);
const data = await res.json();`,
  },
  {
    id: "axios",
    group: "libraries",
    lang: "js",
    titleKey: "snippets.block.axios.title",
    descKey: "snippets.block.axios.desc",
    code: (origin) => `import axios from "axios";

const CORX = "${origin}";

const { data } = await axios.get(\`\${CORX}/fetch\`, {
  params: { url: target },
  headers: { "X-Api-Key": process.env.CORX_KEY }, ${SERVER_ENV}
});`,
  },
  {
    id: "ky",
    group: "libraries",
    lang: "js",
    titleKey: "snippets.block.ky.title",
    descKey: "snippets.block.ky.desc",
    code: (origin) => `import ky from "ky";

const CORX = "${origin}";

const data = await ky
  .get(\`\${CORX}/fetch\`, {
    searchParams: { url: target },
    headers: { "X-Api-Key": process.env.CORX_KEY }, ${SERVER_ENV}
  })
  .json();`,
  },
  {
    id: "keyless",
    group: "browser",
    lang: "js",
    titleKey: "snippets.block.keyless.title",
    descKey: "snippets.block.keyless.desc",
    // No key in the code at all: the page's origin is granted on the key.
    code: (origin) => `// The page's origin is granted on the key — nothing secret ships.
const CORX = "${origin}";

const res = await fetch(\`\${CORX}/fetch?url=\${encodeURIComponent(target)}\`);
const data = await res.json();`,
  },
  {
    id: "stream",
    group: "browser",
    lang: "js",
    titleKey: "snippets.block.stream.title",
    descKey: "snippets.block.stream.desc",
    // No key either: an origin grant (or the public tier) covers the request,
    // and the body is read as it arrives instead of being buffered whole.
    code: (origin) => `const CORX = "${origin}";

const res = await fetch(\`\${CORX}/fetch?url=\${encodeURIComponent(sseUrl)}\`, {
  headers: { Accept: "text/event-stream" },
});

const reader = res.body.getReader();
const decoder = new TextDecoder();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value, { stream: true }).split("\\n")) {
    if (line.startsWith("data: ")) onEvent(line.slice(6));
  }
}`,
  },
  {
    id: "viteEnv",
    group: "browser",
    lang: "js",
    titleKey: "snippets.block.viteEnv.title",
    descKey: "snippets.block.viteEnv.desc",
    code: (origin) => `// ✗ Vite inlines every VITE_* value into the browser bundle.
const key = import.meta.env.VITE_CORX_KEY;        // readable by every visitor

// ✓ The instance URL is public; the key belongs on the server.
const corx = import.meta.env.VITE_CORX_URL;       // ${origin}
// The browser calls CORX through a keyless grant, or through your own route.`,
  },
  {
    id: "serverRoute",
    group: "server",
    lang: "ts",
    titleKey: "snippets.block.serverRoute.title",
    descKey: "snippets.block.serverRoute.desc",
    code: (origin) => `// app/api/corx/route.ts (Next.js App Router) — any serverless function works.
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  const res = await fetch(
    \`\${process.env.CORX_URL}/fetch?url=\${encodeURIComponent(target)}\`,
    { headers: { "X-Api-Key": process.env.CORX_KEY! } }, ${SERVER_ENV}
  );
  return new Response(res.body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/octet-stream" },
  });
}
// CORX_URL = "${origin}" (or the deployment you run yourself)`,
  },
];

/** Snippets of one group, in registry order. */
export function snippetsOf(group: SnippetGroupId): Snippet[] {
  return SNIPPETS.filter((s) => s.group === group);
}

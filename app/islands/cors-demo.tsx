import { useEffect, useRef, useState } from "hono/jsx/dom";
import { Lucide } from "../components/lucide.js";
import { ResponsePreview } from "../components/response-preview.js";
import { humanBytes } from "../lib/format.js";
import {
  MAX_PREVIEW_IMAGE_BYTES,
  MAX_PREVIEW_TEXT_BYTES,
  frameBlock,
  isMediaKind,
  isTextKind,
  previewKind,
  readTextPrefix,
  type FrameBlock,
  type PreviewKind,
} from "../lib/preview.js";
import searchSvg from "lucide-static/icons/search.svg?raw";
import pauseSvg from "lucide-static/icons/pause.svg?raw";
import playSvg from "lucide-static/icons/play.svg?raw";
import arrowUpRightSvg from "lucide-static/icons/arrow-up-right.svg?raw";

/** Demo sites shown in the rotating examples (CORS-friendly public APIs, no keys). */
const EXAMPLES = [
  { name: "JSONPlaceholder · a todo", url: "https://jsonplaceholder.typicode.com/todos/1" },
  { name: "ipify · your IP", url: "https://api.ipify.org?format=json" },
  { name: "Cat Facts", url: "https://catfact.ninja/fact" },
  { name: "Picsum · a random photo", url: "https://picsum.photos/seed/corx/720/405" },
  { name: "example.com · a web page", url: "https://example.com/" },
  { name: "MDN · a short video", url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" },
  { name: "httpbin · robots.txt", url: "https://httpbin.org/robots.txt" },
] as const;

export interface CorsDemoI18n {
  urlAria: string;
  urlPh: string;
  go: string;
  error: string;
  cache: string;
  truncated: string;
  requestFailed: string;
  waiting: string;
  autoRotating: string;
  manualMode: string;
  pause: string;
  resume: string;
  tabPreview: string;
  tabRaw: string;
  tabHeaders: string;
  openRaw: string;
  imageAlt: string;
  mediaHint: string;
  frameHint: string;
  frameBlocked: string;
  binary: string;
  array: string;
  object: string;
}

type ResultTab = "preview" | "raw" | "headers";

interface DemoResult {
  status: number;
  ok: boolean;
  latency: number;
  /** Declared content-length, or the bytes actually read for a text body. */
  bytes: number | null;
  cache: string;
  type: string;
  kind: PreviewKind;
  headers: Array<[string, string]>;
  /** Decoded text body for text kinds (bounded); empty otherwise. */
  text: string;
  truncated: boolean;
  /** Parsed JSON when kind === "json"; undefined when it didn't parse. */
  json?: unknown;
  /** Proxy URL the viewer can render directly (media/html), or null. */
  mediaUrl: string | null;
  rawUrl: string;
  /** Non-empty when the upstream refuses to be framed (html only). */
  frameBlock: FrameBlock;
}

/** JSON.parse that keeps "not JSON" distinct from a literal `null` payload. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Live "try it" browser mockup: examples rotate every 10s and auto-load
 * through the proxy; typing in the URL bar pauses rotation and takes over.
 *
 * The response is rendered by content type (JSON tree, sandboxed page, image,
 * video, audio, PDF, text, binary card) instead of always as text: see
 * lib/preview.ts for the classification and components/response-preview.tsx
 * for the viewers.
 */
export default function CorsDemo({ base, i18n, apiKey }: { base: string; i18n: CorsDemoI18n; apiKey?: string }) {
  const [url, setUrl] = useState<string>(EXAMPLES[0]!.url);
  const [auto, setAuto] = useState(true);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
  const [tab, setTab] = useState<ResultTab>("preview");
  // Pause the rotation when the demo is off-screen or the tab is hidden.
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  // Bumped on every example switch; used as an input key so the URL bar
  // replays its slide-up animation on rotation.
  const [flipKey, setFlipKey] = useState(0);
  // Burst guard: effect re-runs (resume, island re-hydration) must not refetch
  // the same example repeatedly.
  const lastLoad = useRef<{ url: string; at: number } | null>(null);

  async function load(target: string) {
    const now = Date.now();
    if (lastLoad.current && lastLoad.current.url === target && now - lastLoad.current.at < 1500) {
      return; // same URL requested twice in quick succession — ignore the burst
    }
    lastLoad.current = { url: target, at: now };
    setLoading(true);
    setTab("preview");
    const t0 = performance.now();
    const rawUrl = `${base}/fetch?url=${encodeURIComponent(target)}${apiKey ? `&corx-key=${encodeURIComponent(apiKey)}` : ""}`;
    try {
      const res = await fetch(rawUrl, { headers: { Accept: "*/*" } });
      const latency = Math.round(performance.now() - t0);
      const type = res.headers.get("content-type") ?? "";
      const headers: Array<[string, string]> = [];
      res.headers.forEach((value, name) => headers.push([name, value]));
      const declared = Number(res.headers.get("content-length") ?? NaN);
      const declaredBytes = Number.isFinite(declared) && declared >= 0 ? declared : null;

      // Error pages read better as source than as a framed document — and a
      // framed 500 could still be huge. JSON errors keep their tree.
      const resolved = !res.ok && previewKind(type) === "html" ? "text" : previewKind(type);

      let text = "";
      let truncated = false;
      let bytes = declaredBytes;
      if (isTextKind(resolved)) {
        // Bounded read: never buffer a multi-MB document to show a snippet.
        const read = await readTextPrefix(res, MAX_PREVIEW_TEXT_BYTES);
        text = read.text;
        truncated = read.truncated;
        bytes = declaredBytes ?? read.bytes;
      } else {
        // Media renders straight from the proxy URL (streaming, Range-friendly,
        // and a cache hit on the second request); drop the probe's body.
        await res.body?.cancel().catch(() => undefined);
      }

      const oversizedImage = resolved === "image" && declaredBytes !== null && declaredBytes > MAX_PREVIEW_IMAGE_BYTES;
      setResult({
        status: res.status,
        ok: res.ok,
        latency,
        bytes,
        cache: res.headers.get("x-corx-cache") ?? "",
        type,
        kind: resolved,
        headers,
        text,
        truncated,
        json: resolved === "json" ? parseJson(text) : undefined,
        mediaUrl: isMediaKind(resolved) && !oversizedImage ? rawUrl : null,
        rawUrl,
        frameBlock: resolved === "html" ? frameBlock(headers) : "",
      });
      // Let the hero's X panel spark on a successful proxied request.
      if (res.ok) window.dispatchEvent(new CustomEvent("corx:request", { detail: { ok: true, status: res.status } }));
    } catch (err) {
      setResult({
        status: 0,
        ok: false,
        latency: Math.round(performance.now() - t0),
        bytes: null,
        cache: "",
        type: "",
        kind: "text",
        headers: [],
        text: i18n.requestFailed.replace("{err}", String(err)),
        truncated: false,
        mediaUrl: null,
        rawUrl,
        frameBlock: "",
      });
    } finally {
      setLoading(false);
    }
  }

  // Rotating timer: advance the example index every 10s while the demo is on
  // screen, and at a slower ambient cadence while it is scrolled out of view
  // (the hero's X panel sparks on each successful request, so the page keeps a
  // subtle sign of life). Hidden tabs stay paused.
  const rotating = auto && visible;
  useEffect(() => {
    if (!rotating) return;
    const every = inView ? 10_000 : 30_000;
    const t = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), every);
    return () => clearInterval(t);
  }, [rotating, inView]);

  // Accessibility + data hygiene: honor prefers-reduced-motion (start paused)
  // and stop rotating on hidden tabs; off-screen rotation just slows down.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    const el = rootRef.current;
    let observer: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), {
        threshold: 0.2,
      });
      observer.observe(el);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);

  // Load the current example whenever the index changes (and on mount).
  useEffect(() => {
    if (!rotating) return;
    const example = EXAMPLES[idx]!;
    setUrl(example.url);
    setFlipKey((k) => k + 1); // replay the URL bar slide-up
    void load(example.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, rotating]);

  function go() {
    setAuto(false);
    void load(url);
  }

  const statusCls = result == null ? "text-base-content/75" : result.ok ? "text-success" : "text-error";
  const showRawTab = result != null && isTextKind(result.kind);

  return (
    <div ref={rootRef} class="mockup-browser w-full max-w-[760px] mx-auto bg-base-100 border border-base-300 shadow-xl">
      <div class="mockup-browser-toolbar">
        <div class="flex w-full items-center gap-2 mr-[1.4em] bg-base-200 border border-base-300 rounded-full! py-1 pl-3 pr-1 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/25">
          <span class="lucide text-base-content/60 shrink-0">
            <Lucide svg={searchSvg} />
          </span>
          <input
            key={flipKey}
            value={url}
            spellcheck={false}
            placeholder={i18n.urlPh}
            aria-label={i18n.urlAria}
            onInput={(e) => {
              const value = (e.currentTarget as HTMLInputElement | null)?.value ?? "";
              setUrl(value);
              setAuto(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") go();
            }}
            class="flex-1 min-w-0 bg-transparent outline-none text-sm font-mono py-1 url-slide"
          />
          <button type="button" onClick={go} class="btn btn-primary btn-sm rounded-full! shrink-0">
            {i18n.go}
          </button>
        </div>
      </div>

      {/* Fixed height AND width: the browser's shape never follows the loaded
          content; the result pane scrolls internally. */}
      <div class="demo-pane">
        {loading ? (
          <div key="skeleton" class="demo-skeleton" aria-busy="true">
            <div class="flex flex-wrap gap-2 mb-4">
              <div class="bar w-24 h-6"></div>
              <div class="bar w-16 h-6"></div>
              <div class="bar w-20 h-6"></div>
              <div class="bar w-28 h-6"></div>
            </div>
            <div class="bar w-3/4"></div>
            <div class="bar w-full"></div>
            <div class="bar w-5/6"></div>
            <div class="bar w-2/3"></div>
            <div class="bar w-4/5"></div>
            <div class="bar w-1/2"></div>
          </div>
        ) : result ? (
          <>
            {/* Live region on the status line only — the viewer below may hold
                an iframe/video whose content must not be announced. */}
            <div role="status" aria-live="polite" class="demo-meta">
              <span class={`font-medium ${statusCls}`}>
                {result.status === 0 ? i18n.error : `HTTP ${result.status}`}
              </span>
              <span>{result.latency} ms</span>
              <span>{humanBytes(result.bytes)}</span>
              {result.cache && <span>{i18n.cache.replace("{value}", result.cache)}</span>}
              <span class="truncate max-w-[45%]">{result.type || "—"}</span>
              {result.truncated && <span class="text-warning">{i18n.truncated}</span>}
            </div>

            <div class="demo-tabs">
              <button
                type="button"
                class={tab === "preview" ? "demo-tab demo-tab-active" : "demo-tab"}
                onClick={() => setTab("preview")}
              >
                {i18n.tabPreview}
              </button>
              {showRawTab && (
                <button
                  type="button"
                  class={tab === "raw" ? "demo-tab demo-tab-active" : "demo-tab"}
                  onClick={() => setTab("raw")}
                >
                  {i18n.tabRaw}
                </button>
              )}
              <button
                type="button"
                class={tab === "headers" ? "demo-tab demo-tab-active" : "demo-tab"}
                onClick={() => setTab("headers")}
              >
                {i18n.tabHeaders} ({result.headers.length})
              </button>
              <a
                href={result.rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="ml-auto inline-flex items-center gap-1 pr-1 text-xs text-base-content/75 hover:text-base-content"
              >
                {i18n.openRaw}
                <span class="lucide">
                  <Lucide svg={arrowUpRightSvg} />
                </span>
              </a>
            </div>

            <div class="demo-view demo-fade-in">
              {tab === "preview" ? (
                <ResponsePreview
                  kind={result.kind}
                  contentType={result.type}
                  text={result.text}
                  json={result.json}
                  mediaUrl={result.mediaUrl}
                  rawUrl={result.rawUrl}
                  bytes={result.bytes}
                  frameBlock={result.frameBlock}
                  i18n={i18n}
                />
              ) : tab === "raw" ? (
                <pre class="preview-text">{result.text}</pre>
              ) : (
                <div class="p-4">
                  <table class="table table-xs">
                    <tbody>
                      {result.headers.map(([name, value]) => (
                        <tr>
                          <td class="w-56 align-top font-mono text-xs text-base-content/75">{name}</td>
                          <td class="break-all font-mono text-xs">{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <div class="py-20 text-center text-sm text-base-content/75">{i18n.waiting}</div>
        )}
      </div>
      <div class="flex items-center justify-between px-4 py-2 border-t border-base-300 text-xs text-base-content/75 bg-base-100">
        <span>
          {auto ? (
            <>
              <span class="inline-flex items-center gap-1.5">
                <span class="size-1.5 rounded-full bg-primary animate-pulse"></span>
                {i18n.autoRotating}
              </span>
            </>
          ) : (
            <span>{i18n.manualMode}</span>
          )}
        </span>
        <button type="button" onClick={() => setAuto((a) => !a)} class="btn btn-ghost btn-xs gap-1 rounded-full!">
          <Lucide svg={auto ? pauseSvg : playSvg} />
          {auto ? i18n.pause : i18n.resume}
        </button>
      </div>
    </div>
  );
}

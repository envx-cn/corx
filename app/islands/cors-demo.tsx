import { useEffect, useRef, useState } from "hono/jsx/dom";
import { Lucide } from "../components/lucide.js";
import searchSvg from "lucide-static/icons/search.svg?raw";
import refreshCwSvg from "lucide-static/icons/refresh-cw.svg?raw";
import pauseSvg from "lucide-static/icons/pause.svg?raw";
import playSvg from "lucide-static/icons/play.svg?raw";

/** Demo sites shown in the rotating examples (CORS-friendly public APIs, no keys). */
const EXAMPLES = [
  { name: "JSONPlaceholder · a todo", url: "https://jsonplaceholder.typicode.com/todos/1" },
  { name: "ipify · your IP", url: "https://api.ipify.org?format=json" },
  { name: "dog.ceo · a random dog", url: "https://dog.ceo/api/breeds/image/random" },
  { name: "Cat Facts", url: "https://catfact.ninja/fact" },
  { name: "Zippopotam · Beverly Hills zip", url: "https://api.zippopotam.us/us/90210" },
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
}

interface DemoResult {
  status: number;
  ok: boolean;
  latency: number;
  bytes: number;
  cache: string;
  type: string;
  snippet: string;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Live "try it" browser mockup: examples rotate every 10s and auto-load
 * through the proxy; typing in the URL bar pauses rotation and takes over.
 */
export default function CorsDemo({ base, i18n }: { base: string; i18n: CorsDemoI18n }) {
  const [url, setUrl] = useState<string>(EXAMPLES[0]!.url);
  const [auto, setAuto] = useState(true);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DemoResult | null>(null);
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
    const t0 = performance.now();
    try {
      const res = await fetch(`${base}/fetch?url=${encodeURIComponent(target)}`, { headers: { Accept: "*/*" } });
      const latency = Math.round(performance.now() - t0);
      const text = await res.text();
      let snippet = text;
      try {
        snippet = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* not JSON — show raw text */
      }
      if (snippet.length > 4000) snippet = `${snippet.slice(0, 4000)}\n${i18n.truncated}`;
      setResult({
        status: res.status,
        ok: res.ok,
        latency,
        bytes: text.length,
        cache: res.headers.get("x-corx-cache") ?? "",
        type: res.headers.get("content-type") ?? "",
        snippet,
      });
    } catch (err) {
      setResult({
        status: 0,
        ok: false,
        latency: Math.round(performance.now() - t0),
        bytes: 0,
        cache: "",
        type: "",
        snippet: `Request failed: ${String(err)}`,
      });
    } finally {
      setLoading(false);
    }
  }

  // Rotating timer: advance the example index every 10s while auto is on and
  // the demo is actually on screen in a visible tab.
  const rotating = auto && inView && visible;
  useEffect(() => {
    if (!rotating) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % EXAMPLES.length), 10_000);
    return () => clearInterval(t);
  }, [rotating]);

  // Accessibility + data hygiene: honor prefers-reduced-motion (start paused)
  // and stop rotating while scrolled out of view or on a hidden tab.
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

  const statusCls =
    result == null
      ? "text-base-content/75"
      : result.ok
        ? "text-success"
        : "text-error";

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
          content; the result pane scrolls internally. role=status announces
          fresh results to screen readers. */}
      <div
        data-inner-scroll
        role="status"
        aria-live="polite"
        class="h-[38vh] min-h-[300px] max-h-[480px] overflow-auto bg-base-200/60 border-t border-base-300"
      >
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
          <div key="result" class="demo-fade-in p-4">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 font-sans text-xs text-base-content/75">
              <span class={`font-medium ${statusCls}`}>
                {result.status === 0 ? i18n.error : `HTTP ${result.status}`}
              </span>
              <span>{result.latency} ms</span>
              <span>{humanBytes(result.bytes)}</span>
              {result.cache && <span>{i18n.cache.replace("{value}", result.cache)}</span>}
              <span class="truncate max-w-[50%]">{result.type || "—"}</span>
            </div>
            <pre class="font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">{result.snippet}</pre>
          </div>
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

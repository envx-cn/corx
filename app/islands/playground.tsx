import { useEffect, useRef, useState } from "hono/jsx/dom";
import { Lucide } from "../components/lucide.js";
import { ResponsePreview, type ResponsePreviewI18n } from "../components/response-preview.js";
import { frameBlock, prettyJson, previewKind } from "../lib/preview.js";
import playSvg from "lucide-static/icons/play.svg?raw";
import plusSvg from "lucide-static/icons/plus.svg?raw";
import trashSvg from "lucide-static/icons/trash-2.svg?raw";
import copySvg from "lucide-static/icons/copy.svg?raw";
import checkSvg from "lucide-static/icons/check.svg?raw";
import historySvg from "lucide-static/icons/history.svg?raw";
import zapSvg from "lucide-static/icons/zap.svg?raw";
import type { PlaygroundResult } from "../lib/playground.js";
import { PLAYGROUND_METHODS } from "../lib/playground.js";

export interface PlaygroundKeyOption {
  id: string;
  name: string;
}

/** UI strings for the playground (injected from the server dict). */
export interface PlaygroundI18n {
  request: string;
  response: string;
  run: string;
  running: string;
  url: string;
  urlPh: string;
  method: string;
  route: string;
  routeFetch: string;
  routeProxy: string;
  routeRaw: string;
  routeSubdomain: string;
  auth: string;
  key: string;
  keyNone: string;
  keyRaw: string;
  keyRawPh: string;
  origin: string;
  originPh: string;
  clientIp: string;
  clientIpPh: string;
  headers: string;
  headerName: string;
  headerValue: string;
  addHeader: string;
  removeHeader: string;
  body: string;
  bodyPh: string;
  bodyHint: string;
  cache: string;
  ttl: string;
  ttlPh: string;
  noCache: string;
  presetsHint: string;
  empty: string;
  tabBody: string;
  tabPreview: string;
  tabHeaders: string;
  tabRequest: string;
  pretty: string;
  truncated: string;
  /** "binary body (base64 preview)" */
  binary: string;
  copyBody: string;
  copyCurl: string;
  copied: string;
  rerun: string;
  failed: string;
  injection: string;
  injectionHint: string;
  ignored: string;
  history: string;
  historyEmpty: string;
  clear: string;
  historyHint: string;
  presetCache: string;
  presetSsrf: string;
  presetMetadata: string;
  presetPreflight: string;
  presetRange: string;
  presetEcho: string;
}

interface HeaderRow {
  name: string;
  value: string;
}

/** Form state — strings throughout so every field stays editable mid-typing. */
interface Spec {
  url: string;
  method: string;
  route: string;
  keyMode: "none" | "stored" | "raw";
  keyId: string;
  rawKey: string;
  origin: string;
  clientIp: string;
  headers: HeaderRow[];
  body: string;
  ttl: string;
  noCache: boolean;
}

interface HistoryEntry {
  at: number;
  spec: Spec;
  status: number;
  latencyMs: number;
  bytes: number;
  cache: string;
  host: string;
}

interface Preset {
  id: string;
  label: string;
  spec: Partial<Spec>;
}

const HISTORY_KEY = "corx:playground:history";
const HISTORY_MAX = 12;

function emptySpec(): Spec {
  return {
    url: "https://jsonplaceholder.typicode.com/todos/1",
    method: "GET",
    route: "fetch",
    keyMode: "none",
    keyId: "",
    rawKey: "",
    origin: "",
    clientIp: "",
    headers: [{ name: "Accept", value: "application/json" }],
    body: "",
    ttl: "",
    noCache: false,
  };
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "—";
  }
}

function statusClass(status: number): string {
  if (status < 300) return "text-success";
  if (status < 400) return "text-info";
  if (status < 500) return "text-warning";
  return "text-error";
}

/** Pretty-print only when the text is JSON; otherwise return it as-is. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The replayable public URL of the response the proxy produced (same path +
 * query on the same host), when a plain GET/HEAD would reproduce it. Empty for
 * non-idempotent requests and during SSR.
 */
function replayUrlOf(result: PlaygroundResult | null): string {
  if (!result || typeof window === "undefined") return "";
  const method = result.request.method;
  if (method !== "GET" && method !== "HEAD") return "";
  return `${window.location.protocol}//${result.request.proxyHost}${result.request.path}`;
}

/**
 * Console playground: compose an arbitrary proxy request (method, headers,
 * forbidden-for-browsers fields like Origin, body, stored/raw key, cache
 * controls) and inspect the raw response the proxy produced. Runs server-side
 * so stored keys never expose their value and every guard applies for real.
 */
export default function Playground(props: { keys: PlaygroundKeyOption[]; i18n: PlaygroundI18n; preview: ResponsePreviewI18n }) {
  const { i18n, preview } = props;
  const [spec, setSpec] = useState<Spec>(emptySpec());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [lastSpec, setLastSpec] = useState<Spec | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"preview" | "body" | "headers" | "request">("preview");
  const [pretty, setPretty] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setHistory(parsed.filter((e): e is HistoryEntry => !!e && typeof (e as HistoryEntry).spec?.url === "string").slice(0, HISTORY_MAX));
        }
      }
    } catch {
      /* ignore corrupt history */
    }
    hydrated.current = true;
  }, []);

  function saveHistory(next: HistoryEntry[]) {
    setHistory(next);
    if (!hydrated.current) return;
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, HISTORY_MAX)));
    } catch {
      /* storage disabled */
    }
  }

  const patch = (part: Partial<Spec>) => setSpec((s) => ({ ...s, ...part }));

  function setHeader(i: number, part: Partial<HeaderRow>) {
    setSpec((s) => ({ ...s, headers: s.headers.map((h, idx) => (idx === i ? { ...h, ...part } : h)) }));
  }

  function addHeader() {
    setSpec((s) => ({ ...s, headers: [...s.headers, { name: "", value: "" }] }));
  }

  function removeHeader(i: number) {
    setSpec((s) => ({ ...s, headers: s.headers.filter((_, idx) => idx !== i) }));
  }

  async function run() {
    setRunning(true);
    setError("");
    const at = spec;
    try {
      const res = await fetch("/console/playground/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toWire(at)),
      });
      const data = (await res.json()) as PlaygroundResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult(data);
      setLastSpec(at);
      setTab("preview");
      const entry: HistoryEntry = {
        at: Date.now(),
        // Never persist a pasted raw key — history lives in localStorage.
        spec: { ...at, rawKey: "" },
        status: data.status,
        latencyMs: data.latencyMs,
        bytes: data.bytes,
        cache: headerOf(data, "x-corx-cache") ?? "",
        host: hostOf(data.request?.targetUrl ?? at.url),
      };
      saveHistory([entry, ...history].slice(0, HISTORY_MAX));
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — text is selectable */
    }
  }

  const presets: Preset[] = [
    {
      id: "cache",
      label: i18n.presetCache,
      spec: {
        url: "https://example.com/",
        method: "GET",
        route: "fetch",
        headers: [{ name: "Accept", value: "text/html" }],
        ttl: "300",
        noCache: false,
        body: "",
      },
    },
    {
      id: "ssrf",
      label: i18n.presetSsrf,
      spec: { url: "http://127.0.0.1:8080/", method: "GET", route: "fetch", headers: [], body: "", ttl: "" },
    },
    {
      id: "metadata",
      label: i18n.presetMetadata,
      spec: { url: "http://169.254.169.254/latest/meta-data/", method: "GET", route: "fetch", headers: [], body: "", ttl: "" },
    },
    {
      id: "preflight",
      label: i18n.presetPreflight,
      spec: {
        url: "https://httpbin.org/anything",
        method: "OPTIONS",
        route: "fetch",
        origin: "https://app.example",
        headers: [
          { name: "Access-Control-Request-Method", value: "POST" },
          { name: "Access-Control-Request-Headers", value: "content-type" },
        ],
        body: "",
        ttl: "",
      },
    },
    {
      id: "range",
      label: i18n.presetRange,
      spec: {
        url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        method: "GET",
        route: "fetch",
        headers: [{ name: "Range", value: "bytes=0-1023" }],
        body: "",
        ttl: "",
      },
    },
    {
      id: "echo",
      label: i18n.presetEcho,
      spec: {
        url: "https://httpbin.org/anything",
        method: "POST",
        route: "fetch",
        headers: [
          { name: "Content-Type", value: "application/json" },
          { name: "X-Corx-Test", value: "playground" },
        ],
        body: '{\n  "hello": "world"\n}',
        ttl: "",
      },
    },
  ];

  function applyPreset(preset: Preset) {
    setSpec({ ...emptySpec(), ...preset.spec, keyMode: spec.keyMode, keyId: spec.keyId, rawKey: spec.rawKey });
  }

  function loadHistory(entry: HistoryEntry) {
    setSpec({ ...emptySpec(), ...entry.spec });
    setResult(null);
    setLastSpec(null);
    setError("");
  }

  const responseHeaders = result ? new Map(result.headers) : new Map<string, string>();
  // Preview tab renders by content type; the Body tab stays the raw inspector
  // (pretty-printed JSON, plain text, or a base64 excerpt for binaries).
  const responseKind = result ? previewKind(result.contentType) : "binary";
  const previewJson = result != null && result.bodyEncoding === "text" ? parseJson(result.body) : undefined;
  const isJsonBody = result != null && result.bodyEncoding === "text" && parseJson(result.body) !== undefined;
  const shownBody = result == null || result.bodyEncoding === "base64" ? "" : result.body;
  const prettyBody = isJsonBody && pretty ? (prettyJson(result!.body) ?? shownBody) : shownBody;
  const hasBody = result != null && result.body !== "";
  const replayUrl = replayUrlOf(result);
  const frame = result && responseKind === "html" ? frameBlock(result.headers) : "";

  return (
    <div class="grid gap-4 xl:grid-cols-2">
      {/* ---------------- Request builder ---------------- */}
      <section class="bg-base-100 border border-base-300 rounded-box p-4">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/75">{i18n.request}</h2>
          <span class="inline-flex items-center gap-1.5 text-xs text-base-content/75">
            <span class="lucide">
              <Lucide svg={zapSvg} />
            </span>
            {i18n.presetsHint}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button type="button" class="btn btn-xs btn-outline font-normal" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <select
            class="select select-bordered select-sm w-24 font-mono"
            aria-label={i18n.method}
            value={spec.method}
            onChange={(e) => patch({ method: (e.target as HTMLSelectElement).value })}
          >
            {PLAYGROUND_METHODS.map((m) => (
              <option value={m}>{m}</option>
            ))}
          </select>
          <input
            class="input input-bordered input-sm flex-1 min-w-[14rem] font-mono"
            aria-label={i18n.url}
            placeholder={i18n.urlPh}
            spellcheck={false}
            value={spec.url}
            onInput={(e) => patch({ url: (e.target as HTMLInputElement).value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
          />
          <button type="button" class="btn btn-primary btn-sm shrink-0 gap-1" disabled={running} onClick={() => void run()}>
            <span class="lucide">
              <Lucide svg={playSvg} />
            </span>
            {running ? i18n.running : i18n.run}
          </button>
        </div>

        <div class="mt-2 grid gap-2 sm:grid-cols-2">
          <label class="form-control">
            <div class="label py-0 pb-1">
              <span class="label-text text-xs">{i18n.route}</span>
            </div>
            <select
              class="select select-bordered select-sm w-full font-mono text-xs"
              aria-label={i18n.route}
              value={spec.route}
              onChange={(e) => patch({ route: (e.target as HTMLSelectElement).value })}
            >
              <option value="fetch">{i18n.routeFetch}</option>
              <option value="proxy">{i18n.routeProxy}</option>
              <option value="raw">{i18n.routeRaw}</option>
              <option value="subdomain">{i18n.routeSubdomain}</option>
            </select>
          </label>
          <label class="form-control">
            <div class="label py-0 pb-1">
              <span class="label-text text-xs">{i18n.cache}</span>
            </div>
            <div class="flex items-center gap-2">
              <input
                class="input input-bordered input-sm w-24"
                inputmode="numeric"
                aria-label={i18n.ttl}
                placeholder={i18n.ttlPh}
                title={i18n.ttl}
                value={spec.ttl}
                onInput={(e) => patch({ ttl: (e.target as HTMLInputElement).value })}
              />
              <label class="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  class="checkbox"
                  checked={spec.noCache}
                  onChange={(e) => patch({ noCache: (e.target as HTMLInputElement).checked })}
                />
                {i18n.noCache}
              </label>
            </div>
          </label>
        </div>

        {/* Auth & client identity */}
        <div class="mt-4 rounded-box border border-base-300 p-3">
          <div class="mb-2 text-xs font-medium uppercase tracking-wide text-base-content/75">{i18n.auth}</div>
          <div class="grid gap-2 sm:grid-cols-2">
            <label class="form-control">
              <div class="label py-0 pb-1">
                <span class="label-text text-xs">{i18n.key}</span>
              </div>
              <select
                class="select select-bordered select-sm w-full"
                aria-label={i18n.key}
                value={spec.keyMode === "stored" ? `stored:${spec.keyId}` : spec.keyMode}
                onChange={(e) => {
                  const v = (e.target as HTMLSelectElement).value;
                  if (v.startsWith("stored:")) patch({ keyMode: "stored", keyId: v.slice(7) });
                  else if (v === "raw") patch({ keyMode: "raw" });
                  else patch({ keyMode: "none", keyId: "" });
                }}
              >
                <option value="none">{i18n.keyNone}</option>
                {props.keys.map((k) => (
                  <option value={`stored:${k.id}`}>{k.name}</option>
                ))}
                <option value="raw">{i18n.keyRaw}</option>
              </select>
            </label>
            <label class="form-control">
              <div class="label py-0 pb-1">
                <span class="label-text text-xs">{i18n.origin}</span>
              </div>
              <input
                class="input input-bordered input-sm w-full font-mono text-xs"
                aria-label={i18n.origin}
                placeholder={i18n.originPh}
                spellcheck={false}
                value={spec.origin}
                onInput={(e) => patch({ origin: (e.target as HTMLInputElement).value })}
              />
            </label>
            {spec.keyMode === "raw" ? (
              <label class="form-control sm:col-span-2">
                <div class="label py-0 pb-1">
                  <span class="label-text text-xs">{i18n.keyRaw}</span>
                </div>
                <input
                  type="password"
                  class="input input-bordered input-sm w-full font-mono text-xs"
                  placeholder={i18n.keyRawPh}
                  autocomplete="off"
                  value={spec.rawKey}
                  onInput={(e) => patch({ rawKey: (e.target as HTMLInputElement).value })}
                />
              </label>
            ) : null}
            <label class="form-control sm:col-span-2">
              <div class="label py-0 pb-1">
                <span class="label-text text-xs">{i18n.clientIp}</span>
              </div>
              <input
                class="input input-bordered input-sm w-full font-mono text-xs"
                aria-label={i18n.clientIp}
                placeholder={i18n.clientIpPh}
                spellcheck={false}
                value={spec.clientIp}
                onInput={(e) => patch({ clientIp: (e.target as HTMLInputElement).value })}
              />
            </label>
          </div>
        </div>

        {/* Headers */}
        <div class="mt-4">
          <div class="mb-2 text-xs font-medium uppercase tracking-wide text-base-content/75">{i18n.headers}</div>
          <div class="space-y-1.5">
            {spec.headers.map((h, i) => (
              <div class="flex items-center gap-1.5">
                <input
                  class="input input-bordered input-sm w-40 font-mono text-xs"
                  aria-label={i18n.headerName}
                  placeholder={i18n.headerName}
                  spellcheck={false}
                  value={h.name}
                  onInput={(e) => setHeader(i, { name: (e.target as HTMLInputElement).value })}
                />
                <input
                  class="input input-bordered input-sm flex-1 min-w-0 font-mono text-xs"
                  aria-label={i18n.headerValue}
                  placeholder={i18n.headerValue}
                  spellcheck={false}
                  value={h.value}
                  onInput={(e) => setHeader(i, { value: (e.target as HTMLInputElement).value })}
                />
                <button
                  type="button"
                  class="btn btn-ghost btn-sm btn-square"
                  title={i18n.removeHeader}
                  aria-label={i18n.removeHeader}
                  onClick={() => removeHeader(i)}
                >
                  <span class="lucide">
                    <Lucide svg={trashSvg} />
                  </span>
                </button>
              </div>
            ))}
          </div>
          <button type="button" class="btn btn-ghost btn-xs mt-1 gap-1" onClick={addHeader}>
            <span class="lucide">
              <Lucide svg={plusSvg} />
            </span>
            {i18n.addHeader}
          </button>
        </div>

        {/* Body */}
        <div class="mt-4">
          <div class="mb-2 flex items-center justify-between">
            <span class="text-xs font-medium uppercase tracking-wide text-base-content/75">{i18n.body}</span>
            <span class="text-xs text-base-content/75">{i18n.bodyHint}</span>
          </div>
          <textarea
            rows={5}
            class="textarea textarea-bordered w-full font-mono text-xs leading-5"
            placeholder={i18n.bodyPh}
            spellcheck={false}
            value={spec.body}
            onInput={(e) => patch({ body: (e.target as HTMLTextAreaElement).value })}
          ></textarea>
        </div>
      </section>

      {/* ---------------- Response inspector ---------------- */}
      {/* Flex column: the grid row is as tall as the request builder, so the
          viewer below has to grow to fill the rest of the card. */}
      <section class="flex flex-col bg-base-100 border border-base-300 rounded-box p-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-base-content/75">{i18n.response}</h2>
          {result ? (
            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-ghost btn-xs gap-1" onClick={() => void run()} disabled={running}>
                <span class="lucide">
                  <Lucide svg={playSvg} />
                </span>
                {i18n.rerun}
              </button>
              <button type="button" class="btn btn-ghost btn-xs gap-1" onClick={() => void copy("curl", toCurl(lastSpec ?? spec, result))}>
                <span class="lucide">
                  <Lucide svg={copied === "curl" ? checkSvg : copySvg} />
                </span>
                {copied === "curl" ? i18n.copied : i18n.copyCurl}
              </button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div class="alert alert-error text-sm">
            <span>
              <b>{i18n.failed}:</b> {error}
            </span>
          </div>
        ) : result == null ? (
          <div class="flex grow items-center justify-center py-12 text-center text-sm text-base-content/75">{i18n.empty}</div>
        ) : (
          <>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span class={`font-mono text-2xl font-semibold ${statusClass(result.status)}`}>
                {result.status}
                {result.statusText ? ` ${result.statusText}` : ""}
              </span>
              <span class="text-sm text-base-content/75">{result.latencyMs} ms</span>
              <span class="text-sm text-base-content/75">{humanBytes(result.bytes)}</span>
              {responseHeaders.get("x-corx-cache") ? (
                <span
                  class={`badge badge-sm ${
                    responseHeaders.get("x-corx-cache") === "HIT" ? "badge-success" : "badge-ghost"
                  }`}
                >
                  {responseHeaders.get("x-corx-cache")}
                </span>
              ) : null}
              {result.truncated ? <span class="text-xs text-warning">{i18n.truncated.replace("{n}", humanBytes(result.bytes))}</span> : null}
            </div>

            {/* Meta: what the proxy did */}
            <div class="mt-2 space-y-0.5 font-mono text-[11px] leading-4 break-all text-base-content/75">
              <div>{result.request.method} {result.request.path}</div>
              <div>→ {result.request.targetUrl}</div>
              {result.request.keyName ? <div>key: {result.request.keyName}</div> : null}
              {result.request.ignoredHeaders.length > 0 ? (
                <div class="text-warning">{i18n.ignored.replace("{list}", result.request.ignoredHeaders.join(", "))}</div>
              ) : null}
            </div>

            {/* Tabs */}
            <div class="mt-3 flex items-center gap-1 border-b border-base-300">
              {(
                [
                  ["preview", i18n.tabPreview],
                  ["body", i18n.tabBody],
                  ["headers", i18n.tabHeaders],
                  ["request", i18n.tabRequest],
                ] as const
              ).map(([key, label]) => (
                <button
                  type="button"
                  class={`rounded-t-xs px-3 py-1.5 text-xs font-medium ${
                    tab === key ? "border-b-2 border-primary text-base-content" : "text-base-content/75 hover:text-base-content"
                  }`}
                  onClick={() => setTab(key)}
                >
                  {label}
                  {key === "headers" ? ` (${result.headers.length})` : ""}
                </button>
              ))}
              {tab === "body" ? (
                <div class="ml-auto flex items-center gap-2">
                  {isJsonBody ? (
                    <label class="flex cursor-pointer items-center gap-1 text-xs text-base-content/75">
                      <input
                        type="checkbox"
                        class="checkbox checkbox-xs"
                        checked={pretty}
                        onChange={(e) => setPretty((e.target as HTMLInputElement).checked)}
                      />
                      {i18n.pretty}
                    </label>
                  ) : null}
                  <button
                    type="button"
                    class="btn btn-ghost btn-xs gap-1"
                    onClick={() => void copy("body", result.body)}
                    disabled={!hasBody}
                  >
                    <span class="lucide">
                      <Lucide svg={copied === "body" ? checkSvg : copySvg} />
                    </span>
                    {copied === "body" ? i18n.copied : i18n.copyBody}
                  </button>
                </div>
              ) : null}
            </div>

            {/* One viewer box for every tab: a definite 52vh so a framed page,
                image or player can fill it, then flex-grow to take whatever the
                request card leaves over — the card has no dead strip at the
                bottom, and a tall body still scrolls inside instead of
                stretching the row. */}
            <div
              class={`mt-2 grow h-[52vh] overflow-auto rounded-box ${
                tab === "preview" ? "bg-base-200/60" : ""
              }`}
            >
              {tab === "preview" ? (
                <ResponsePreview
                  kind={responseKind}
                  contentType={result.contentType}
                  text={shownBody}
                  json={previewJson}
                  mediaUrl={replayUrl || null}
                  rawUrl={replayUrl}
                  bytes={result.bytes}
                  frameBlock={frame}
                  i18n={preview}
                />
              ) : tab === "body" ? (
                result.bodyEncoding === "base64" ? (
                  <div>
                    <p class="mb-1 text-xs text-base-content/75">{i18n.binary}</p>
                    <pre class="whitespace-pre-wrap break-all bg-base-200 rounded-box p-3 font-mono text-[12px] leading-5">{result.body.slice(0, 4096)}</pre>
                  </div>
                ) : hasBody ? (
                  <pre class="whitespace-pre-wrap break-all bg-base-200 rounded-box p-3 font-mono text-[12px] leading-5">{prettyBody}</pre>
                ) : (
                  <p class="py-6 text-center text-xs text-base-content/75">—</p>
                )
              ) : tab === "headers" ? (
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
              ) : (
                <div class="space-y-3 text-xs">
                  <div>
                    <div class="mb-1 font-medium uppercase tracking-wide text-base-content/75">{i18n.tabRequest}</div>
                    <pre class="whitespace-pre-wrap break-all bg-base-200 rounded-box p-3 font-mono text-[12px] leading-5">{requestPreview(spec, result)}</pre>
                  </div>
                  {result.request.injection ? (
                    <div>
                      <div class="mb-1 font-medium uppercase tracking-wide text-base-content/75">{i18n.injection}</div>
                      <p class="mb-2 text-base-content/75">{i18n.injectionHint}</p>
                      <pre class="whitespace-pre-wrap break-all bg-base-200 rounded-box p-3 font-mono text-[12px] leading-5">{injectionPreview(result)}</pre>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ---------------- History ---------------- */}
      <section class="xl:col-span-2 bg-base-100 border border-base-300 rounded-box p-4">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 class="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-base-content/75">
            <span class="lucide">
              <Lucide svg={historySvg} />
            </span>
            {i18n.history}
          </h2>
          <div class="flex items-center gap-2">
            <span class="text-xs text-base-content/75">{i18n.historyHint}</span>
            {history.length > 0 ? (
              <button type="button" class="btn btn-ghost btn-xs" onClick={() => saveHistory([])}>
                {i18n.clear}
              </button>
            ) : null}
          </div>
        </div>
        {history.length === 0 ? (
          <p class="py-3 text-center text-xs text-base-content/75">{i18n.historyEmpty}</p>
        ) : (
          <div class="overflow-x-auto">
            <table class="table table-xs table-hover">
              <tbody>
                {history.map((h) => (
                  <tr class="cursor-pointer" onClick={() => loadHistory(h)}>
                    <td class="font-mono text-xs text-base-content/75">
                      {new Date(h.at).toLocaleTimeString()}
                    </td>
                    <td class="w-16 font-mono text-xs">{h.spec.method}</td>
                    <td class="max-w-[16rem] truncate font-mono text-xs" title={h.spec.url}>
                      {h.host}
                    </td>
                    <td class={`font-mono text-xs font-medium ${statusClass(h.status)}`}>{h.status}</td>
                    <td class="text-right text-xs text-base-content/75">{h.latencyMs} ms</td>
                    <td class="text-right text-xs text-base-content/75">{humanBytes(h.bytes)}</td>
                    <td class="text-xs text-base-content/75">{h.cache || "—"}</td>
                    <td class="max-w-[24rem] truncate text-xs text-base-content/75" title={h.spec.url}>
                      {h.spec.url}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Form state → wire spec (trim empties, filter blank header rows). */
function toWire(spec: Spec) {
  return {
    url: spec.url.trim(),
    method: spec.method,
    route: spec.route,
    headers: spec.headers.filter((h) => h.name.trim() !== ""),
    body: spec.body,
    keyMode: spec.keyMode,
    keyId: spec.keyId,
    rawKey: spec.keyMode === "raw" ? spec.rawKey : "",
    origin: spec.origin.trim(),
    clientIp: spec.clientIp.trim(),
    ttl: spec.ttl.trim() === "" ? null : Number(spec.ttl),
    noCache: spec.noCache,
  };
}

function headerOf(result: PlaygroundResult, name: string): string | null {
  const hit = result.headers.find(([k]) => k.toLowerCase() === name);
  return hit ? hit[1] : null;
}

/** The headers the composer will actually send (minus the raw key). */
function requestPreview(spec: Spec, result: PlaygroundResult): string {
  const lines = [
    `${result.request.method} ${result.request.path}`,
    `host: ${result.request.proxyHost}`,
    `→ ${result.request.targetUrl}`,
    "",
  ];
  for (const h of spec.headers) {
    if (h.name.trim()) lines.push(`${h.name}: ${h.value}`);
  }
  if (spec.origin) lines.push(`Origin: ${spec.origin}`);
  if (spec.clientIp) lines.push(`cf-connecting-ip: ${spec.clientIp}`);
  if (spec.keyMode === "stored" && result.request.keyName) lines.push(`X-Api-Key: <stored key "${result.request.keyName}">`);
  if (spec.keyMode === "raw") lines.push("X-Api-Key: <pasted key>");
  return lines.join("\n");
}

/** Injection preview with secrets masked (built server-side). */
function injectionPreview(result: PlaygroundResult): string {
  const inj = result.request.injection;
  if (!inj) return "";
  const lines: string[] = [];
  if (inj.hosts.length > 0) lines.push(`allowed hosts: ${inj.hosts.join(", ")}`);
  if (inj.vars.length > 0) lines.push(`variables: ${inj.vars.join(", ")} (values hidden)`);
  if (inj.headerLines.length > 0) lines.push("", ...inj.headerLines.map((l) => (l.startsWith("@") ? l : `  ${l}`)));
  if (inj.paramLines.length > 0) lines.push("", ...inj.paramLines.map((l) => (l.startsWith("@") ? l : `  ${l}`)));
  if (inj.responseLines.length > 0)
    lines.push("", "response headers (on the way back):", ...inj.responseLines.map((l) => (l.startsWith("@") ? l : `  ${l}`)));
  if (inj.effectiveUrl) lines.push("", `effective URL: ${inj.effectiveUrl}`);
  return lines.join("\n");
}

/** A reproducible curl command against the real proxy host. */
function toCurl(spec: Spec, result: PlaygroundResult | null): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://corx.example";
  const path = result?.request.path ?? "";
  const parts = [`curl -i '${origin}${path}'`];
  if (spec.method !== "GET") parts.push(`-X ${spec.method}`);
  for (const h of spec.headers) {
    if (h.name.trim()) parts.push(`-H '${h.name}: ${h.value.replaceAll("'", "'\\''")}'`);
  }
  if (spec.origin) parts.push(`-H 'Origin: ${spec.origin}'`);
  if (spec.keyMode === "raw" && spec.rawKey) parts.push(`-H 'X-Api-Key: ${spec.rawKey}'`);
  if (spec.body && spec.method !== "GET" && spec.method !== "HEAD") {
    parts.push(`--data-raw '${spec.body.replaceAll("'", "'\\''")}'`);
  }
  return parts.join(" \\\n  ");
}

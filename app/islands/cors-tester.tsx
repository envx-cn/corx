import { useState } from "hono/jsx/dom";
import { ResponsePreview } from "../components/response-preview.js";
import { Lucide } from "../components/lucide.js";
import {
  buildCorsCalls,
  corsFindings,
  testerTarget,
  type CorsCalls,
  type CorsObservations,
  type TesterFindingId,
  type TesterUrlError,
} from "../lib/cors-check.js";
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
import type { ResponsePreviewI18n } from "../components/response-preview.js";
import searchSvg from "lucide-static/icons/search.svg?raw";
import checkSvg from "lucide-static/icons/check.svg?raw";
import xSvg from "lucide-static/icons/x.svg?raw";
import copySvg from "lucide-static/icons/copy.svg?raw";

/** How long one probe may take before it counts as "did not complete". */
const PROBE_TIMEOUT_MS = 8000;

export interface CorsTesterFindingText {
  title: string;
  body: string;
}

export interface CorsTesterI18n {
  urlAria: string;
  urlPh: string;
  run: string;
  running: string;
  invalid: Record<TesterUrlError, string>;
  /** "Access-Control-Allow-Origin: {value}" / "not sent". */
  allowOrigin: string;
  allowCredentials: string;
  none: string;
  probe: {
    title: string;
    /** One row per probe. */
    cors: string;
    opaque: string;
    credentials: string;
    preflight: string;
    pass: string;
    fail: string;
    skip: string;
  };
  finding: Record<TesterFindingId, CorsTesterFindingText>;
  proxied: {
    title: string;
    failed: string;
    note: string;
  };
  fix: {
    title: string;
    lead: string;
    proxyUrl: string;
    browser: string;
    server: string;
  };
  copy: string;
  copied: string;
  note: string;
}

interface PreviewState {
  status: number;
  ok: boolean;
  bytes: number | null;
  type: string;
  kind: PreviewKind;
  text: string;
  json?: unknown;
  mediaUrl: string | null;
  rawUrl: string;
  frameBlock: FrameBlock;
}

interface Report {
  target: string;
  findings: TesterFindingId[];
  observations: CorsObservations;
  calls: CorsCalls;
  proxied?: PreviewState;
  proxiedError?: string;
}

/** One probe: resolves to null on any failure (CORS block, DNS, timeout, CSP). */
async function probe(url: string, init: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The public CORS tester (#54). It probes the pasted URL from the visitor's own
 * browser — the only place a CORS verdict is real — then runs the same URL
 * through this CORX instance and renders the response with the shared preview
 * component, so "the proxy fixes it" is shown, not claimed.
 *
 * What a browser deliberately hides: the *reason* a cross-origin fetch was
 * blocked. The diagnosis is inference from which probes resolved (see
 * app/lib/cors-check.ts), and the copy says so rather than pretending.
 */
export default function CorsTester(props: {
  /** This deployment's origin, for the generated calls. */
  base: string;
  /** Public key of this instance, when it publishes one. */
  publicKey?: string;
  i18n: CorsTesterI18n;
  preview: ResponsePreviewI18n;
}) {
  const { i18n } = props;
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [copied, setCopied] = useState("");

  async function run() {
    setError("");
    const parsed = testerTarget(input, window.location.origin);
    if ("error" in parsed) {
      setReport(null);
      setError(i18n.invalid[parsed.error]);
      return;
    }
    const target = parsed.target;
    setRunning(true);
    setReport(null);
    try {
      const mixedContent = window.location.protocol === "https:" && target.startsWith("http://");
      let observations: CorsObservations = {
        corsOk: false,
        opaqueOk: false,
        credentialedOk: null,
        preflightOk: null,
        mixedContent,
      };

      if (!mixedContent) {
        // 1. The plain cross-origin GET: what a caller's fetch actually does.
        const direct = await probe(target, { mode: "cors", redirect: "follow" });
        if (direct) {
          observations = {
            ...observations,
            corsOk: true,
            allowOrigin: direct.headers.get("access-control-allow-origin"),
            allowCredentials: direct.headers.get("access-control-allow-credentials"),
          };
          await direct.body?.cancel().catch(() => undefined);
          // 2. Does it still hold with credentials? A wildcard Allow-Origin
          //    fails this while passing the plain GET.
          observations.credentialedOk =
            (await probe(target, { mode: "cors", credentials: "include", redirect: "follow" })) !== null;
          // 3. Does a preflighted request survive? A custom header forces one.
          observations.preflightOk =
            (await probe(target, { mode: "cors", headers: { "x-corx-probe": "1" }, redirect: "follow" })) !== null;
        } else {
          // 4. Opaque probe: it cannot be read, but it resolving proves the
          //    server answered — which separates "no CORS headers" from
          //    "the request never completed".
          observations.opaqueOk = (await probe(target, { mode: "no-cors", redirect: "follow" })) !== null;
        }
      }

      const findings: TesterFindingId[] = corsFindings(observations);
      const calls = buildCorsCalls(props.base, target, props.publicKey);
      const baseReport: Report = { target, findings, observations, calls };
      setReport(baseReport);

      // The fix, demonstrated: the same URL through this instance. Same-origin
      // from the page's point of view, so CORS cannot get in the way.
      try {
        const res = await fetch(calls.proxiedUrl, { headers: { Accept: "*/*" } });
        const type = res.headers.get("content-type") ?? "";
        const headers: Array<[string, string]> = [];
        res.headers.forEach((value, name) => headers.push([name, value]));
        const declared = Number(res.headers.get("content-length") ?? NaN);
        const declaredBytes = Number.isFinite(declared) && declared >= 0 ? declared : null;
        const resolved = !res.ok && previewKind(type) === "html" ? "text" : previewKind(type);
        let text = "";
        let bytes = declaredBytes;
        if (isTextKind(resolved)) {
          const read = await readTextPrefix(res, MAX_PREVIEW_TEXT_BYTES);
          text = read.text;
          bytes = declaredBytes ?? read.bytes;
        } else {
          await res.body?.cancel().catch(() => undefined);
        }
        const oversizedImage = resolved === "image" && declaredBytes !== null && declaredBytes > MAX_PREVIEW_IMAGE_BYTES;
        const framed = resolved === "html" ? frameBlock(headers) : "";
        // A framing block is a real finding even when CORS is not the issue:
        // fetch works, embedding does not.
        if (framed && !findings.includes("framing")) findings.push("framing");
        setReport({
          ...baseReport,
          findings: [...findings],
          proxied: {
            status: res.status,
            ok: res.ok,
            bytes,
            type,
            kind: resolved,
            text,
            json: resolved === "json" ? parseJson(text) : undefined,
            mediaUrl: isMediaKind(resolved) && !oversizedImage ? calls.proxiedUrl : null,
            rawUrl: calls.proxiedUrl,
            frameBlock: framed,
          },
        });
      } catch (err) {
        setReport({ ...baseReport, proxiedError: String(err) });
      }
    } finally {
      setRunning(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard unavailable — the code is selectable */
    }
  }

  const Copy = ({ text, what }: { text: string; what: string }) => (
    <button type="button" class="btn btn-sm btn-icon" onClick={() => copy(text, what)}>
      <span class="lucide">
        <Lucide svg={copySvg} />
      </span>
      {copied === what ? i18n.copied : i18n.copy}
    </button>
  );

  const ProbeRow = ({ label, state }: { label: string; state: boolean | null }) => (
    <li class="flex items-start gap-2">
      {state === null ? (
        <span class="text-xs text-base-content/75">—</span>
      ) : (
        <span class={state ? "lucide text-success" : "lucide text-error"}>
          <Lucide svg={state ? checkSvg : xSvg} />
        </span>
      )}
      <span class="text-sm text-base-content/75">
        {label}: <span class="font-medium">{state === null ? i18n.probe.skip : state ? i18n.probe.pass : i18n.probe.fail}</span>
      </span>
    </li>
  );

  return (
    <div class="rounded-box border border-base-300 bg-base-100 p-4 sm:p-5">
      <form
        class="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          type="url"
          value={input}
          onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          placeholder={i18n.urlPh}
          aria-label={i18n.urlAria}
          class="input input-bordered w-full font-mono text-sm"
          autocomplete="off"
          spellcheck={false}
        />
        <button type="submit" class="btn btn-primary rounded-full! px-6" disabled={running}>
          <span class="lucide">
            <Lucide svg={searchSvg} />
          </span>
          {running ? i18n.running : i18n.run}
        </button>
      </form>
      {error && <p class="mt-3 text-sm text-error">{error}</p>}

      {report && (
        <div class="mt-5 border-t border-base-300 pt-5">
          <h3 class="text-base font-semibold">
            {i18n.finding[report.findings[0] ?? "ok"].title}
          </h3>
          {(report.observations.allowOrigin || report.observations.allowCredentials) && (
            <p class="mt-1 font-mono text-xs text-base-content/75">
              {report.observations.allowOrigin
                ? i18n.allowOrigin.replace("{value}", report.observations.allowOrigin)
                : i18n.allowOrigin.replace("{value}", i18n.none)}
              <br />
              {report.observations.allowCredentials
                ? i18n.allowCredentials.replace("{value}", report.observations.allowCredentials)
                : i18n.allowCredentials.replace("{value}", i18n.none)}
            </p>
          )}
          <p class="mt-3 text-xs font-medium uppercase tracking-wide text-base-content/75">{i18n.probe.title}</p>
          <ul class="mt-2 space-y-1.5">
            <ProbeRow label={i18n.probe.cors} state={report.observations.corsOk} />
            <ProbeRow
              label={i18n.probe.opaque}
              state={report.observations.corsOk ? null : report.observations.opaqueOk}
            />
            <ProbeRow label={i18n.probe.credentials} state={report.observations.credentialedOk} />
            <ProbeRow label={i18n.probe.preflight} state={report.observations.preflightOk} />
          </ul>
          <div class="mt-4 space-y-4">
            {report.findings.map((id) => (
              <div>
                <p class="text-sm font-semibold">{i18n.finding[id].title}</p>
                <p class="mt-1 text-sm text-base-content/75 leading-relaxed">{i18n.finding[id].body}</p>
              </div>
            ))}
          </div>

          <div class="mt-6">
            <h4 class="text-sm font-semibold">{i18n.proxied.title}</h4>
            {report.proxied ? (
              <>
                <p class="mt-1 text-xs text-base-content/75">
                  {i18n.proxied.note.replace("{status}", String(report.proxied.status))}
                </p>
                <div class="mt-3">
                  <ResponsePreview
                    kind={report.proxied.kind}
                    contentType={report.proxied.type}
                    text={report.proxied.text}
                    json={report.proxied.json}
                    mediaUrl={report.proxied.mediaUrl}
                    rawUrl={report.proxied.rawUrl}
                    bytes={report.proxied.bytes}
                    frameBlock={report.proxied.frameBlock}
                    i18n={props.preview}
                  />
                </div>
              </>
            ) : (
              <p class="mt-1 text-sm text-base-content/75">
                {i18n.proxied.failed.replace("{error}", report.proxiedError ?? "")}
              </p>
            )}
          </div>

          <div class="mt-6">
            <h4 class="text-sm font-semibold">{i18n.fix.title}</h4>
            <p class="mt-1 text-sm text-base-content/75 leading-relaxed">{i18n.fix.lead}</p>
            {(
              [
                [i18n.fix.proxyUrl, report.calls.proxiedUrl],
                [i18n.fix.browser, report.calls.browser],
                [i18n.fix.server, report.calls.server],
              ] as Array<[string, string]>
            ).map(([label, code]) => (
              <div class="mt-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <span class="text-xs font-medium uppercase tracking-wide text-base-content/75">{label}</span>
                  <Copy text={code} what={label} />
                </div>
                <pre class="mt-2 overflow-x-auto rounded-box bg-base-200 px-3 py-2 text-xs leading-relaxed">
                  <code>{code}</code>
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
      <p class="mt-4 text-xs leading-relaxed text-base-content/75">{i18n.note}</p>
    </div>
  );
}

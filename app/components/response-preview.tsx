import type { FrameBlock, PreviewKind } from "../lib/preview.js";
import { humanBytes } from "../lib/format.js";
import { JsonTree } from "./json-tree.js";
import { Lucide } from "./lucide.js";
import arrowUpRightSvg from "lucide-static/icons/arrow-up-right.svg?raw";

/**
 * Body renderer shared by the landing demo and the console playground: pick a
 * viewer from the response's `previewKind` instead of dumping every body into
 * a <pre>.
 *
 * Security: everything that reaches the DOM comes from JSX text nodes
 * (hono/jsx escapes), and upstream HTML/PDF only ever runs inside an
 * <iframe sandbox=""> — no `allow-same-origin`, so the framed document has an
 * opaque origin and cannot touch corx's cookies, storage or admin API, no
 * `allow-scripts`/`allow-forms`/`allow-top-navigation`. Documents that refuse
 * framing (X-Frame-Options: DENY, foreign frame-ancestors) are detected up
 * front and replaced by a card + raw link instead of a blank box.
 */
export interface ResponsePreviewI18n {
  imageAlt: string;
  /** Hint under <video>/<audio>: streamed through the proxy, press play. */
  mediaHint: string;
  /** Hint under the HTML iframe: sandboxed, scripts disabled. */
  frameHint: string;
  /** "This site refuses to be embedded ({reason})" */
  frameBlocked: string;
  /** "Binary body · {type} · {bytes}" */
  binary: string;
  openRaw: string;
  /** Screen-reader names for JSON tree expand/collapse buttons. */
  array: string;
  object: string;
}

export interface ResponsePreviewProps {
  kind: PreviewKind;
  contentType: string;
  /** Decoded text body (text kinds only), already bounded. */
  text: string;
  /** Parsed JSON for `kind === "json"`; `undefined` when it didn't parse. */
  json?: unknown;
  /** Proxy URL a real element can render (image/video/audio/pdf/html). */
  mediaUrl: string | null;
  /** Proxy URL of the original response — used for "open raw" and iframes. */
  rawUrl: string;
  bytes: number | null;
  /** The document's own headers refuse framing (see lib/preview §frameBlock). */
  frameBlock: FrameBlock;
  i18n: ResponsePreviewI18n;
}

function RawLink({ href, label, className = "" }: { href: string; label: string; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" class={`preview-raw-link ${className}`}>
      {label}
      <span class="lucide">
        <Lucide svg={arrowUpRightSvg} />
      </span>
    </a>
  );
}

function Notice({ title, body, href, link }: { title: string; body: string; href: string; link: string }) {
  return (
    <div class="preview-notice">
      <p class="font-medium text-base-content">{title}</p>
      <p class="mt-1 text-base-content/75">{body}</p>
      <RawLink href={href} label={link} className="mt-3" />
    </div>
  );
}

export function ResponsePreview(props: ResponsePreviewProps) {
  const { kind, mediaUrl, rawUrl, bytes, i18n } = props;

  if (kind === "json") {
    return props.json === undefined ? (
      <pre class="preview-text">{props.text}</pre>
    ) : (
      <JsonTree value={props.json} labels={{ array: i18n.array, object: i18n.object }} />
    );
  }

  if (kind === "text") return <pre class="preview-text">{props.text}</pre>;

  if (kind === "html") {
    if (props.frameBlock) {
      // Name the header that blocked it (a wire token, so it stays as-is).
      const reason = props.frameBlock === "x-frame-options" ? "X-Frame-Options" : "CSP frame-ancestors";
      return (
        <Notice
          title={i18n.frameBlocked.replace("{reason}", reason)}
          body={i18n.frameHint}
          href={rawUrl}
          link={i18n.openRaw}
        />
      );
    }
    return (
      <div class="preview-stack">
        <iframe
          src={rawUrl}
          title={i18n.frameHint}
          sandbox=""
          referrerpolicy="no-referrer"
          loading="lazy"
          class="preview-frame"
        ></iframe>
        <p class="preview-hint">{i18n.frameHint}</p>
      </div>
    );
  }

  if (mediaUrl) {
    if (kind === "image") {
      return (
        <div class="preview-media preview-checker">
          <img src={mediaUrl} alt={i18n.imageAlt} class="preview-image" />
        </div>
      );
    }
    if (kind === "video") {
      return (
        <div class="preview-stack">
          <div class="preview-media">
            <video src={mediaUrl} controls preload="none" playsinline class="preview-video"></video>
          </div>
          <p class="preview-hint">{i18n.mediaHint}</p>
        </div>
      );
    }
    if (kind === "audio") {
      return (
        <div class="preview-stack">
          <div class="preview-media p-6">
            <audio src={mediaUrl} controls preload="none" class="w-full"></audio>
          </div>
          <p class="preview-hint">{i18n.mediaHint}</p>
        </div>
      );
    }
    if (kind === "pdf") {
      return (
        <div class="preview-stack">
          <iframe src={mediaUrl} title={i18n.openRaw} sandbox="" loading="lazy" class="preview-frame"></iframe>
        </div>
      );
    }
  }

  // Non-previewable body (unknown binary, or media too large / not addressable).
  return (
    <div class="preview-notice">
      <p class="font-medium text-base-content">
        {i18n.binary.replace("{type}", props.contentType || "—").replace("{bytes}", humanBytes(bytes))}
      </p>
      <RawLink href={rawUrl} label={i18n.openRaw} className="mt-3" />
    </div>
  );
}

import type { FrameBlock, PreviewKind } from "../lib/preview.js";
import { humanBytes } from "../lib/format.js";
import { JsonTree } from "./json-tree.js";
import { REPO_DOCS } from "../lib/site-info.js";
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
  /** What a self-hosted deployment can do about it (response header rules). */
  frameBlockHint: string;
  /** Link label for the README section that documents the recipe. */
  frameBlockDoc: string;
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
    <a href={href} target="_blank" rel="noopener" class={`preview-raw-link ${className}`}>
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
      // Not just "can't be done": a self-hosted deployment can strip the header
      // for a host it controls (response header rules), and this is where a
      // caller finds that out. The sandbox warning travels with the recipe.
      return (
        <div class="preview-notice">
          <p class="font-medium text-base-content">{i18n.frameBlocked.replace("{reason}", reason)}</p>
          <p class="mt-1 text-base-content/75">
            {i18n.frameBlockHint}{" "}
            <a
              href={`${REPO_DOCS.readme}#embed-a-page-that-refuses-framing`}
              target="_blank"
              /* `noopener` only: this file must never add `noreferrer`/`referrerpolicy`,
                 because the preview's own proxy URLs rely on the Referer for
                 caller identity (test/auth.test.ts). A public GitHub link does
                 not need the extra suppression. */
              rel="noopener"
              class="link link-primary"
            >
              {i18n.frameBlockDoc}
            </a>
          </p>
          <RawLink href={rawUrl} label={i18n.openRaw} className="mt-3" />
        </div>
      );
    }
    return (
      <div class="preview-stack">
        {/* The referrer policy is deliberately left at the default here: after
            the fetch, the preview re-requests the same proxy URL, and a
            same-origin navigation sends no Origin — dropping the Referer too
            left that request anonymous (a 401 under REQUIRE_API_KEY). corx
            strips `referer` before forwarding upstream, so nothing leaks to
            the target. Same reason the raw links only use rel="noopener". */}
        <iframe
          src={rawUrl}
          title={i18n.frameHint}
          sandbox=""
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

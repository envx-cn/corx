import { useState } from "hono/jsx/dom";
import copySvg from "lucide-static/icons/copy.svg?raw";
import checkSvg from "lucide-static/icons/check.svg?raw";

/** UI strings for the copy button (injected from the server dict). */
export interface CopyButtonLabels {
  copy: string;
  copied: string;
}

export default function CopyButton({ text, labels }: { text: string; labels: CopyButtonLabels }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      class="btn btn-sm btn-icon"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard unavailable — key text is selectable */
        }
      }}
    >
      <span class="lucide" dangerouslySetInnerHTML={{ __html: done ? checkSvg : copySvg }} />
      {done ? labels.copied : labels.copy}
    </button>
  );
}

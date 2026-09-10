import { useState } from "hono/jsx/dom";
import copySvg from "lucide-static/icons/copy.svg?raw";
import checkSvg from "lucide-static/icons/check.svg?raw";

export default function CopyButton({ text }: { text: string }) {
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
      {done ? "Copied" : "Copy"}
    </button>
  );
}

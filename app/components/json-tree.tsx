import { useState } from "hono/jsx/dom";

/**
 * Collapsible JSON tree (no dependency, no innerHTML — every value is a JSX
 * text node, so a hostile payload is escaped by hono/jsx like any other text).
 *
 * The first two levels start expanded, deeper ones collapsed, which keeps a
 * large API payload readable inside the demo's 38vh pane.
 */

interface Entry {
  /** Property name, or null for array items (no index noise). */
  key: string | null;
  value: unknown;
}

function isBranch(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === "object" && value !== null;
}

function entriesOf(value: Record<string, unknown> | unknown[]): Entry[] {
  if (Array.isArray(value)) return value.map((item) => ({ key: null, value: item }));
  return Object.entries(value).map(([key, item]) => ({ key, value: item }));
}

function JsonLeaf({ value }: { value: unknown }) {
  if (typeof value === "string") return <span class="json-string">"{value}"</span>;
  if (typeof value === "number") return <span class="json-number">{String(value)}</span>;
  if (typeof value === "boolean") return <span class="json-boolean">{String(value)}</span>;
  return <span class="json-null">null</span>;
}

function JsonChild({ value, depth, labels }: { value: unknown; depth: number; labels: BranchLabels }) {
  if (!isBranch(value)) return <JsonLeaf value={value} />;
  const entries = entriesOf(value);
  if (entries.length === 0) {
    return <span class="json-punct">{Array.isArray(value) ? "[]" : "{}"}</span>;
  }
  return <JsonBranch entries={entries} array={Array.isArray(value)} depth={depth} labels={labels} />;
}

interface BranchLabels {
  array: string;
  object: string;
}

function JsonBranch({
  entries,
  array,
  depth,
  labels,
}: {
  entries: Entry[];
  array: boolean;
  depth: number;
  labels: BranchLabels;
}) {
  const [open, setOpen] = useState(depth < 2);
  const openBracket = array ? "[" : "{";
  const closeBracket = array ? "]" : "}";

  return (
    <div class="json-node">
      <button
        type="button"
        class="json-toggle"
        aria-expanded={open ? "true" : "false"}
        aria-label={array ? labels.array : labels.object}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span class={open ? "json-caret json-caret-open" : "json-caret"} aria-hidden="true">
          ▶
        </span>
        <span class="json-punct">{openBracket}</span>
        {!open ? <span class="json-count">{entries.length}</span> : null}
        {!open ? <span class="json-punct">{closeBracket}</span> : null}
      </button>
      {open ? (
        <>
          <div class="json-children">
            {entries.map((entry) => (
              <div class="json-row">
                {entry.key === null ? null : (
                  <>
                    <span class="json-key">"{entry.key}"</span>
                    <span class="json-punct">:</span>
                  </>
                )}
                <JsonChild value={entry.value} depth={depth + 1} labels={labels} />
              </div>
            ))}
          </div>
          <div class="json-punct json-close">{closeBracket}</div>
        </>
      ) : null}
    </div>
  );
}

export function JsonTree({
  value,
  depth = 0,
  labels = { array: "Array", object: "Object" },
}: {
  value: unknown;
  depth?: number;
  /** Screen-reader names for the expand/collapse buttons (i18n). */
  labels?: { array: string; object: string };
}) {
  return (
    <div class="json-tree">
      <JsonChild value={value} depth={depth} labels={labels} />
    </div>
  );
}

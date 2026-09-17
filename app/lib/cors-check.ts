/**
 * The public CORS tester's pure half (`/tools/cors-tester`, #54).
 *
 * The island (`app/islands/cors-tester.tsx`) does the browser probes — a
 * `cors` fetch, an opaque `no-cors` probe, and credentialed/preflight variants
 * — and hands the raw observations here. The mapping from what the browser
 * reported to what it *means* is a pure function, which is the only way it can
 * be tested: a browser gives a page no reason for a blocked cross-origin fetch,
 * so the diagnosis is inference from the probes that did or did not resolve.
 *
 * The snippets are built here too, from the deployment's own origin, so the
 * generated call is copy-paste correct for the instance serving the page.
 */

/** What the probes observed. All booleans mean "the fetch resolved". */
export interface CorsObservations {
  /** `fetch(target, { mode: "cors" })` resolved. */
  corsOk: boolean;
  /** `fetch(target, { mode: "no-cors" })` resolved — the server did answer. */
  opaqueOk: boolean;
  /** `credentials: "include"` variant; null when not attempted. */
  credentialedOk: boolean | null;
  /** A custom-header (therefore preflighted) variant; null when not attempted. */
  preflightOk: boolean | null;
  /** The page is https and the target http — blocked before any request. */
  mixedContent: boolean;
  /** Readable only when `corsOk`: the header that allowed the read. */
  allowOrigin?: string | null;
  allowCredentials?: string | null;
}

export type CorsFindingId =
  | "ok"
  | "missing-allow-origin"
  | "unreachable"
  | "mixed-content"
  | "credentials"
  | "preflight";

/** A finding the page can also raise outside the CORS probes (see the island). */
export type TesterFindingId = CorsFindingId | "framing";

/**
 * Map observations to findings, most fundamental first. More than one can
 * apply (a wildcard `Allow-Origin` plus a preflight that only allows `GET`
 * with no custom headers, say), so the page shows all of them rather than
 * picking one and hiding the rest.
 */
export function corsFindings(o: CorsObservations): CorsFindingId[] {
  if (o.mixedContent) return ["mixed-content"];
  if (!o.corsOk) {
    // The opaque probe resolving proves the network path works and the server
    // answered — which leaves the CORS negotiation as the blocker.
    return [o.opaqueOk ? "missing-allow-origin" : "unreachable"];
  }
  const out: CorsFindingId[] = ["ok"];
  // The plain fetch working is the headline; credentials and preflight are
  // caveats a caller may or may not care about, so they follow it rather than
  // replacing it.
  if (o.credentialedOk === false) out.push("credentials");
  if (o.preflightOk === false) out.push("preflight");
  return out;
}

export type TesterUrlError = "empty" | "invalid" | "scheme" | "self";

/**
 * Validate the pasted URL. `pageOrigin` is the tester's own origin: pointing it
 * at itself is a same-origin request, which says nothing about CORS — worth
 * telling the user instead of "testing" it.
 */
export function testerTarget(raw: string, pageOrigin: string): { target: string } | { error: TesterUrlError } {
  const trimmed = raw.trim();
  if (!trimmed) return { error: "empty" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { error: "invalid" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { error: "scheme" };
  if (url.origin === pageOrigin) return { error: "self" };
  return { target: url.toString() };
}

export interface CorsCalls {
  /** The URL to fetch through the proxy, key included when the instance has one. */
  proxiedUrl: string;
  /** Browser snippet: the public key inlined (it is public by design). */
  browser: string;
  /** Server snippet: the key from an environment variable. */
  server: string;
}

/**
 * Build the copyable calls. When the instance publishes a public key it is
 * inlined verbatim — it is printed on the landing page, so a snippet that says
 * `<YOUR_KEY>` would be less useful than one that just runs. Without one, the
 * browser snippet is anonymous (fine on an instance that allows it, or behind
 * a keyless origin grant) and the server snippet is the honest path.
 */
export function buildCorsCalls(origin: string, target: string, publicKey?: string | null): CorsCalls {
  const key = (publicKey ?? "").trim();
  const encoded = encodeURIComponent(target);
  const proxiedUrl = key ? `${origin}/fetch?url=${encoded}&corx-key=${key}` : `${origin}/fetch?url=${encoded}`;
  const browser = key
    ? `const res = await fetch(\n  "${origin}/fetch?url=" + encodeURIComponent(target) +\n    "&corx-key=${key}",\n);\nconst data = await res.json();`
    : `// Anonymous: works when the instance allows it, or when your page's\n// origin is granted on a key (a "keyless" grant).\nconst res = await fetch(\n  "${origin}/fetch?url=" + encodeURIComponent(target),\n);\nconst data = await res.json();`;
  const server = `const res = await fetch(\n  "${origin}/fetch?url=" + encodeURIComponent(target),\n  { headers: { "X-Api-Key": process.env.CORX_KEY! } }, // server-side env var\n);\nconst data = await res.json();`;
  return { proxiedUrl, browser, server };
}

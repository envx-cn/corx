import type { AdminIdentity } from "../lib/access.js";

declare global {
  /** Injected at build time from package.json (vite.config.ts → define). */
  const __CORX_VERSION__: string;
}

declare module "hono" {
  interface ContextVariableMap {
    /** Set by app/routes/console/_middleware.ts after verifying identity. */
    consoleUser: AdminIdentity;
    /** CSRF token for this console request (null when no session/secret). */
    csrfToken: string | null;
  }
  interface ContextRenderer {
    (
      content: string | Promise<string>,
      props?: { title?: string },
    ): Response | Promise<Response>;
  }
}

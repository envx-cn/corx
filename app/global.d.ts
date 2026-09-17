import type { AdminIdentity } from "../lib/access.js";

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

import appCss from "../styles/app.css?inline";

/**
 * Branded 404 document for non-proxy paths that match nothing (unknown
 * routes outside /api/* and /console/*). Rendered by the /* catch-all in
 * app/server.ts — not a route file, so it never registers its own path.
 */
export function NotFoundPage(props: { path: string; origin: string }) {
  return (
    <html lang="en" data-theme="corx">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>404 — Not found · corx</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
          rel="stylesheet"
        />
        {/* Inject compiled CSS raw — hono/jsx would HTML-escape selectors with > / & (see AGENTS.md). */}
        <style dangerouslySetInnerHTML={{ __html: appCss }}></style>
      </head>
      <body class="bg-base-100 min-h-svh flex flex-col font-sans antialiased">
        <nav class="sticky top-0 z-30 bg-base-100/85 backdrop-blur border-b border-base-300">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <a href="/" class="flex items-center gap-2.5">
              <span class="corx-mark size-8 rounded-lg text-white inline-flex items-center justify-center text-xs font-extrabold shadow-sm">
                cx
              </span>
              <b class="text-lg tracking-tight">corx</b>
            </a>
            <a href="/console/" class="btn btn-primary btn-sm rounded-full! px-4">
              Open console
            </a>
          </div>
        </nav>

        <main class="flex-1 flex items-center justify-center px-4 sm:px-6 py-16">
          <div class="relative max-w-xl w-full mx-auto text-center">
            <div class="hero-glow absolute inset-x-0 top-0 h-44 pointer-events-none"></div>
            <p class="relative text-7xl sm:text-8xl font-extrabold tracking-tight text-base-content/15 select-none">
              404
            </p>
            <h1 class="relative mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-base-content">
              This page doesn&apos;t exist
            </h1>
            <p class="relative mt-3 text-sm sm:text-base text-base-content/60 break-all">
              No corx route matches <code class="px-1.5 py-0.5 rounded bg-base-200 text-base-content/80">{props.path}</code>.
            </p>
            <div class="relative mt-8 flex flex-wrap items-center justify-center gap-3">
              <a href="/" class="btn btn-primary btn-lg rounded-full! px-8">
                Back to home
              </a>
              <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                Open console
              </a>
            </div>
          </div>
        </main>

        <footer class="border-t border-base-200">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-base-content/50 flex items-center justify-between">
            <span>© {new Date().getFullYear()} corx</span>
            <span>{props.origin}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

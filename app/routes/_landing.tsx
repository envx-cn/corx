import type { Child } from "hono/jsx";
import { HasIslands } from "honox/server";
import appCss from "../styles/app.css?inline";
import linkSvg from "lucide-static/icons/link-2.svg?raw";
import zapSvg from "lucide-static/icons/zap.svg?raw";
import shieldSvg from "lucide-static/icons/shield-check.svg?raw";
import keySvg from "lucide-static/icons/key-round.svg?raw";
import chartSvg from "lucide-static/icons/bar-chart-3.svg?raw";
import globeSvg from "lucide-static/icons/globe.svg?raw";
import arrowUpRightSvg from "lucide-static/icons/arrow-up-right.svg?raw";
import { Lucide } from "../components/lucide.js";
import CorsDemo from "../islands/cors-demo.js";

/**
 * Marketing landing page, styled after cloudflare.com: white canvas, orange
 * CTAs, marker-highlighted hero word, a live mockup-browser "try it" demo
 * (rotating example URLs proxied in real time), feature grid and a dark navy
 * footer.
 */
export function LandingPage(props: { host: string; origin: string }) {
  return (
    <html lang="en" data-theme="corx">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>corx — CORS proxy on Cloudflare</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap"
          rel="stylesheet"
        />
        {/* Inject compiled CSS raw — hono/jsx would HTML-escape selectors with > / & (see AGENTS.md). */}
        <style dangerouslySetInnerHTML={{ __html: appCss }}></style>
        {/* Island hydration entry (the CorsDemo below needs it). */}
        {import.meta.env.PROD ? (
          <HasIslands>
            <script type="module" src="/static/client.js"></script>
          </HasIslands>
        ) : (
          <script type="module" src="/app/client.ts"></script>
        )}
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
            <div class="hidden md:flex items-center gap-1 text-sm text-base-content/70">
              <a href="#try-it" class="px-3 py-2 rounded-lg hover:bg-base-200">
                Try it
              </a>
              <a href="#features" class="px-3 py-2 rounded-lg hover:bg-base-200">
                Features
              </a>
            </div>
            <div class="flex items-center gap-3">
              <a href="/console/" class="btn btn-primary btn-sm rounded-full! px-4">
                Open console
              </a>
            </div>
          </div>
        </nav>

        <main class="flex-1">
          {/* Hero — fills the viewport below the nav; nothing peeks underneath. */}
          <section class="snap-page relative overflow-hidden min-h-[calc(100svh-4rem)] flex items-center justify-center">
            <div class="hero-glow absolute inset-x-0 top-0 h-[65%] pointer-events-none"></div>
            <div class="relative max-w-4xl w-full mx-auto px-4 sm:px-6 py-16 text-center">
              <h1 class="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.08] text-base-content">
                Fetch any URL,
                <br />
                <span class="marker">without CORS.</span>
              </h1>
              <p class="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-base-content/60">
                corx is an edge CORS proxy. Prefix any URL and fetch it cross-origin —
                responses are cached at the edge, rate-limited, and guarded against SSRF.
              </p>
              <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
                <a href="#try-it" class="btn btn-primary btn-lg rounded-full! px-8">
                  Try it live
                </a>
                <a href="/console/" class="btn btn-lg btn-outline rounded-full! px-8">
                  Open console
                  <Lucide svg={arrowUpRightSvg} />
                </a>
              </div>
            </div>
          </section>

          {/* Live demo */}
          {/* Live demo — full-viewport section so
              nothing below leaks. */}
          <section id="try-it" class="snap-page min-h-[calc(100svh-4rem)] flex flex-col items-center justify-center max-w-4xl mx-auto px-4 sm:px-6 py-16">
            <div class="text-center mb-8">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Try it live</h2>
              <p class="mt-2 text-base-content/60">
                Examples rotate every 10s and load straight through the proxy. Type any URL to take over.
              </p>
            </div>
            <CorsDemo base={props.origin} />
            <p class="mt-4 text-xs text-base-content/55 text-center leading-relaxed">
              Same as <code>GET {props.origin}/fetch?url=…</code>. Every request goes through the edge proxy — watch
              the status, latency, size and cache <code>HIT/MISS</code> badges update as examples rotate.
            </p>
          </section>

          {/* Features */}
          {/* Features */}
          <section id="features" class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="text-center mb-10">
              <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Everything you need at the edge</h2>
            </div>
            <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Feature
                icon={linkSvg}
                title="Simple by design"
                desc="One URL prefix works from any origin — no SDK, no config, no special headers."
              />
              <Feature
                icon={zapSvg}
                title="Edge-cached"
                desc="Responses are cached in R2 and served from the edge, with TTL control and a no-cache escape hatch."
              />
              <Feature
                icon={shieldSvg}
                title="SSRF-safe"
                desc="Private ranges are blocked by default, and you can blocklist hosts from the console."
              />
              <Feature
                icon={keySvg}
                title="API keys"
                desc="Per-key origins, rate limits and cache policy — revoke any key in one click."
              />
              <Feature
                icon={chartSvg}
                title="Usage analytics"
                desc="Requests, traffic, latency and error rates, charted per hour inside the console."
              />
              <Feature
                icon={globeSvg}
                title="Subdomain mode"
                desc="Give every target its own host: example.com becomes example-com.your.host."
              />
            </div>
          </section>

          {/* CTA band */}
          {/* CTA band */}
          <section class="max-w-6xl mx-auto px-4 sm:px-6 py-20">
            <div class="relative overflow-hidden bg-secondary text-secondary-content rounded-box px-6 py-14 text-center">
              <div class="hero-glow absolute inset-x-0 top-0 h-44 opacity-60 pointer-events-none"></div>
              <h2 class="relative text-2xl sm:text-3xl font-bold tracking-tight">
                Ship your first proxy call in 60 seconds
              </h2>
              <p class="relative mt-3 text-secondary-content/70">
                Head to the console, grab an API key, and start fetching.
              </p>
              <a href="/console/" class="relative mt-8 btn btn-primary btn-lg rounded-full! px-8">
                Open console
              </a>
            </div>
          </section>
        </main>

        <footer class="bg-secondary text-secondary-content">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 py-12 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div class="flex items-center gap-2.5">
              <span class="corx-mark size-8 rounded-lg text-white inline-flex items-center justify-center text-xs font-extrabold">
                cx
              </span>
              <div>
                <b>corx</b>
                <div class="text-xs text-secondary-content/60">CORS proxy, served from the edge</div>
              </div>
            </div>
            <div class="flex items-center gap-6 text-sm text-secondary-content/70">
              <a href="/console/" class="hover:text-secondary-content">
                Console
              </a>
            </div>
          </div>
          <div class="border-t border-white/10">
            <div class="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-secondary-content/50 flex items-center justify-between">
              <span>© {new Date().getFullYear()} corx</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Feature({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div class="feature-card">
      <span class="feature-icon">
        <Lucide svg={icon} />
      </span>
      <h3 class="font-semibold mb-1.5">{title}</h3>
      <p class="text-sm text-base-content/60 leading-relaxed">{desc}</p>
    </div>
  );
}

#!/usr/bin/env node
/**
 * Regenerate `public/og.png` — the 1200×630 social card referenced by
 * `og:image` / `twitter:image` on the public pages.
 *
 * The card is a committed binary, so this script is how it stays reproducible:
 * edit the HTML below, run `npm run og`, commit the new PNG. Kept out of the
 * build on purpose (a build-time browser would slow every deploy and the card
 * changes about once a year).
 *
 *   npm run og
 *   CHROMIUM_PATH=/path/to/chrome npm run og   # non-default browser
 *
 * Needs a Chrome/Chromium binary: playwright-core ships no browsers, so either
 * `npx playwright install chromium` or point CHROMIUM_PATH at any local Chrome.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = fileURLToPath(new URL("..", import.meta.url));
const logo = readFileSync(`${root}app/assets/corx-logo.svg`, "utf8")
  .replace(
    'viewBox="0 0 1681 835"',
    // Crop the artwork's dead margins (the source viewBox reserves room for the
    // X's diagonal beams) so the wordmark sits flush with the card's padding.
    // Bounds measured from the file: x 322.3 → 1680.5, y 32.3 → 833.0.
    'viewBox="310 24 1385 818" width="330"',
  );

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono:wght@400&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    background: #fdfdfd; color: #3e454b;
    font-family: Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex; flex-direction: column; justify-content: center; gap: 24px;
    padding: 64px 88px;
  }
  /* Brand glow: the same soft red radial the landing hero uses. */
  body::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(ellipse 58% 55% at 90% 8%, rgba(253, 7, 0, 0.10), transparent 62%);
  }
  .logo { line-height: 0; }
  h1 { font-size: 46px; font-weight: 800; letter-spacing: -0.02em; color: #262b2f; line-height: 1.1; }
  .sub { margin-top: 10px; font-size: 26px; color: #757b82; }
  .call {
    display: inline-flex; align-items: center; gap: 14px; align-self: flex-start;
    border: 1px solid #e3e6e8; background: #f5f6f7; border-radius: 14px;
    padding: 14px 22px; font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 22px; color: #3e454b;
  }
  .call b { color: #e10600; font-weight: 400; }
  .meta { display: flex; gap: 26px; font-size: 20px; font-weight: 600; color: #757b82; }
</style></head>
<body>
  <div class="logo">${logo}</div>
  <div>
    <h1>CORS proxy, served from the edge</h1>
    <p class="sub" style="margin-top:14px">Fetch any URL cross-origin — cached, rate-limited, SSRF-guarded.</p>
  </div>
  <div class="call"><b>/fetch?url=</b>https://api.example.com/data</div>
  <div class="meta"><span>Open source · MIT</span><span>Cloudflare Workers · D1 · R2</span><span>github.com/envx-cn/corx</span></div>
</body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
}).catch((err) => {
  console.error(
    "Could not launch Chromium. Install one (`npx playwright install chromium`) or set CHROMIUM_PATH.\n" +
      `Underlying error: ${err.message}`,
  );
  process.exit(1);
});

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  const png = await page.screenshot({ type: "png" });
  writeFileSync(`${root}public/og.png`, png);
  console.log(`wrote public/og.png (${(png.length / 1024).toFixed(1)} KiB)`);
} finally {
  await browser.close();
}

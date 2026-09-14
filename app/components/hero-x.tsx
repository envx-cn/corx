import markSvg from "../assets/corx-mark.svg?raw";

/** Inline script idempotently wiring every `hero-x--hover` backdrop. */
const HOVER_SCRIPT = `(() => {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const VIEW = { x: 1040, y: 8, w: 664, h: 848 };
  for (const root of document.querySelectorAll("[data-hero-x].hero-x--hover")) {
    if (root.dataset.hoverReady) continue;
    root.dataset.hoverReady = "1";
    const hit = root.querySelector(".hero-x-hit path");
    const layer = root.querySelector(".hero-x-layer");
    const beams = [root.querySelector(".hero-x-beam--a"), root.querySelector(".hero-x-beam--b")];
    // Pointer tracking spans the whole scope (the hero + demo wrapper), not just
    // the panel box, so the halo is catchable wherever the X reaches.
    const scope = root.closest("[data-hero-x-scope]") || root.parentElement;
    if (!hit || !layer || !scope || beams.some((b) => !b)) continue;

    const cs = getComputedStyle(root);
    const angle = ((parseFloat(cs.getPropertyValue("--hero-x-angle")) || 52) * Math.PI) / 180;
    const beamW = parseFloat(cs.getPropertyValue("--hero-x-beam-w")) || 0.7;
    const travel = parseFloat(cs.getPropertyValue("--hero-x-travel")) || 110;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    // Pointer -> the X's own geometry. getScreenCTM maps client coords straight
    // into viewBox units, so the test is unaffected by the layer's rotation.
    let inv = null;
    const toUser = (x, y) => {
      inv = hit.getScreenCTM();
      return inv ? new DOMPoint(x, y).matrixTransform(inv.inverse()) : null;
    };
    const inShape = (p) => hit.isPointInFill(p) || hit.isPointInStroke(p);

    // Where along each diagonal the pointer sits (0 = crossing, +/-1 = the
    // layer's edge), plus the travel direction toward the *far* end.
    const offsets = (p) => {
      const fx = (p.x - VIEW.x) / VIEW.w - 0.5;
      const fy = (p.y - VIEW.y) / VIEW.h - 0.5;
      const out = [];
      for (const sign of [1, -1]) {
        const s = (fx * cos + sign * fy * sin) / beamW * 100;
        const from = clamp(s, -100, 100);
        out.push({ from, to: from >= 0 ? -travel : travel });
      }
      return out;
    };

    let hot = false;
    let queued = false;
    let flip = false;
    const restart = () => {
      root.classList.remove("is-firing");
      void root.offsetWidth;
      root.classList.add("is-firing");
    };
    const fire = (a, b) => {
      beams[0].style.setProperty("--hero-x-from-a", a.from + "%");
      beams[0].style.setProperty("--hero-x-to-a", a.to + "%");
      beams[1].style.setProperty("--hero-x-from-b", b.from + "%");
      beams[1].style.setProperty("--hero-x-to-b", b.to + "%");
      restart();
    };
    const update = (e) => {
      queued = false;
      if (e.pointerType === "touch") return;
      const p = toUser(e.clientX, e.clientY);
      const next = p ? inShape(p) : false;
      if (next === hot) return;
      hot = next;
      root.classList.toggle("is-hot", hot);
      if (!hot || !p) return;
      const [a, b] = offsets(p);
      fire(a, b);
    };

    scope.addEventListener("pointermove", (e) => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => update(e));
    });
    scope.addEventListener("pointerleave", () => {
      hot = false;
      root.classList.remove("is-hot");
    });

    // A successful proxied request (dispatched by the try-it demo) sparks the
    // crossing: both beams leave the centre, alternating halves each time.
    window.addEventListener("corx:request", (e) => {
      if (!e.detail || !e.detail.ok) return;
      flip = !flip;
      const dir = flip ? 1 : -1;
      fire({ from: 0, to: travel * dir }, { from: 0, to: -travel * dir });
    });
  }
})();`;

/**
 * Animated COR X backdrop for the landing hero.
 *
 * Variants (motion):
 *   draw  — the X fades/scales in once and stays; no perpetual motion.
 *   pulse — two soft streaks travel the crossing diagonals in opposite
 *           directions, clipped by a mask of the mark.
 *   combo — draw + pulse.
 *   hover — a faint watermark (pair with the `watermark` placement) that plays
 *           one cross-pulse when the pointer crosses the X itself. The light
 *           starts at the pointer's position on the diagonal and runs out
 *           toward the far end. Geometry comes from an invisible copy of the
 *           mark (fill + a wide transparent stroke = a forgiving halo), so the
 *           hit test ignores the copy block painted on top and nothing blocks
 *           clicks or text selection.
 *
 * Placements (geometry):
 *   right     — bleeds off the right edge (asymmetric, keeps text clear).
 *   right-far — even further out; only the inner half of the X shows.
 *   corner-br — anchored to the bottom-right corner.
 *   center    — centered behind the copy, fainter (watermark).
 *   low       — centered but pushed down so the crossing sits below the H1.
 *   bottom    — cropped by the section's bottom edge, upper half visible.
 *   watermark — centered, no crop; the quietest option.
 *   panel     — fills its own container (the hero's right column).
 *
 * Everything is decorative: `aria-hidden`, `pointer-events: none` for the
 * visuals, no layout impact (absolute), and every animation ends on the static
 * frame, so `prefers-reduced-motion` leaves a clean background.
 */
export function HeroX({
  variant = "combo",
  placement = "right",
  faint = false,
  watermark = false,
}: {
  variant?: "draw" | "pulse" | "combo" | "hover";
  placement?: "right" | "right-far" | "corner-br" | "center" | "low" | "bottom" | "watermark" | "panel";
  faint?: boolean;
  watermark?: boolean;
}) {
  // The mark is inlined as a data-URI mask so the light is clipped to the
  // exact logo silhouette. `?raw` keeps the build semantics identical to
  // components/logo.tsx (no extra asset pipeline).
  const mask = `url("data:image/svg+xml,${encodeURIComponent(markSvg)}")`;
  // The mark's outline doubles as the pointer hit test geometry.
  const pathD = /<path[^>]*\sd="([^"]+)"/.exec(markSvg)?.[1] ?? "";
  const cls = [
    "hero-x",
    `hero-x--${variant}`,
    `hero-x--pos-${placement}`,
    faint ? "hero-x--faint" : "",
    watermark ? "hero-x--watermark" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div class={cls} aria-hidden="true" data-hero-x>
      <div class="hero-x-layer">
        <span class="hero-x-glyph" dangerouslySetInnerHTML={{ __html: markSvg }} />
        <span class="hero-x-light" style={`--hero-x-mask: ${mask}`}>
          <span class="hero-x-beam hero-x-beam--a"></span>
          <span class="hero-x-beam hero-x-beam--b"></span>
        </span>
        {variant === "hover" && (
          <>
            <svg class="hero-x-hit" viewBox="1040 8 664 848" aria-hidden="true">
              <path d={pathD} />
            </svg>
            <script dangerouslySetInnerHTML={{ __html: HOVER_SCRIPT }}></script>
          </>
        )}
      </div>
    </div>
  );
}

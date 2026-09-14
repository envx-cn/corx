import markSvg from "../assets/corx-mark.svg?raw";

/** Inline script that wires the hero X panel (idempotent). */
const HOVER_SCRIPT = `(() => {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const VIEW = { x: 1040, y: 8, w: 664, h: 848 };
  for (const root of document.querySelectorAll("[data-hero-x]")) {
    if (root.dataset.heroReady) continue;
    root.dataset.heroReady = "1";
    const hit = root.querySelector(".hero-x-hit path");
    const beams = [root.querySelector(".hero-x-beam--a"), root.querySelector(".hero-x-beam--b")];
    // Pointer tracking spans the whole scope (the hero + demo wrapper), not
    // just the panel box, so the halo is catchable wherever the X reaches.
    const scope = root.closest("[data-hero-x-scope]") || root.parentElement;
    if (!hit || !scope || beams.some((b) => !b)) continue;

    const cs = getComputedStyle(root);
    const angle = ((parseFloat(cs.getPropertyValue("--hero-x-angle")) || 52) * Math.PI) / 180;
    const beamW = parseFloat(cs.getPropertyValue("--hero-x-beam-w")) || 0.7;
    const travel = parseFloat(cs.getPropertyValue("--hero-x-travel")) || 110;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

    // Pointer -> the X's own geometry. getScreenCTM maps client coords straight
    // into viewBox units, so the test is unaffected by rotation or sticky
    // positioning, and the copy block painted on top never blocks it.
    const toUser = (x, y) => {
      const m = hit.getScreenCTM();
      return m ? new DOMPoint(x, y).matrixTransform(m.inverse()) : null;
    };
    const inShape = (p) => hit.isPointInFill(p) || hit.isPointInStroke(p);

    // Where along each diagonal the pointer sits (0 = crossing, +/-1 = the
    // layer's edge), plus the travel direction toward the *far* end.
    const offsets = (p) => {
      const fx = (p.x - VIEW.x) / VIEW.w - 0.5;
      const fy = (p.y - VIEW.y) / VIEW.h - 0.5;
      const out = [];
      for (const sign of [1, -1]) {
        const s = ((fx * cos + sign * fy * sin) / beamW) * 100;
        const from = clamp(s, -100, 100);
        out.push({ from, to: from >= 0 ? -travel : travel });
      }
      return out;
    };

    let hot = false;
    let queued = false;
    let flip = false;
    const fire = (a, b) => {
      beams[0].style.setProperty("--hero-x-from-a", a.from + "%");
      beams[0].style.setProperty("--hero-x-to-a", a.to + "%");
      beams[1].style.setProperty("--hero-x-from-b", b.from + "%");
      beams[1].style.setProperty("--hero-x-to-b", b.to + "%");
      // Restart the one-shot animation from the new origin.
      root.classList.remove("is-firing");
      void root.offsetWidth;
      root.classList.add("is-firing");
    };
    const update = (e) => {
      queued = false;
      if (e.pointerType === "touch") return;
      const p = toUser(e.clientX, e.clientY);
      const next = p ? inShape(p) : false;
      if (next === hot) return;
      hot = next;
      root.classList.toggle("is-hot", hot);
      if (hot && p) fire(...offsets(p));
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
 * The landing hero's animated X panel (right-hand column).
 *
 * A ghost X with light sweeping through its silhouette: hovering the mark
 * itself fires a cross-pulse from the pointer's position along the diagonal,
 * and every successful proxied request from the try-it demo sparks one from
 * the centre. Purely decorative — `aria-hidden`, `pointer-events: none`, no
 * layout impact, and every animation ends on the static frame, so
 * `prefers-reduced-motion` leaves a clean background (the script bails out).
 *
 * The hit test uses the mark's own geometry (an invisible copy of the path, so
 * clicks and text selection are untouched); the panel is positioned by the
 * page — the landing keeps it sticky across the hero and the live demo.
 */
export function HeroX() {
  // The mark is inlined as a data-URI mask so the light is clipped to the
  // exact logo silhouette. `?raw` keeps the build semantics identical to
  // components/logo.tsx (no extra asset pipeline).
  const mask = `url("data:image/svg+xml,${encodeURIComponent(markSvg)}")`;
  const pathD = /<path[^>]*\sd="([^"]+)"/.exec(markSvg)?.[1] ?? "";
  return (
    <div class="hero-x" aria-hidden="true" data-hero-x>
      <div class="hero-x-layer">
        <span class="hero-x-glyph" dangerouslySetInnerHTML={{ __html: markSvg }} />
        <span class="hero-x-light" style={`--hero-x-mask: ${mask}`}>
          <span class="hero-x-beam hero-x-beam--a"></span>
          <span class="hero-x-beam hero-x-beam--b"></span>
        </span>
        <svg class="hero-x-hit" viewBox="1040 8 664 848" aria-hidden="true">
          <path d={pathD} />
        </svg>
        <script dangerouslySetInnerHTML={{ __html: HOVER_SCRIPT }}></script>
      </div>
    </div>
  );
}

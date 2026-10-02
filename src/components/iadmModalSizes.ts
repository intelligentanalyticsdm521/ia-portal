/**
 * components/iadmModalSizes.ts — the IadmModal size table, on its own.
 *
 * Lifted out of IadmModal.tsx so it can be driven by a test without a DOM
 * (the Portal's runner is `node --test` over pure modules — scripts/test-ts-loader
 * says so in as many words). IadmModal.tsx imports it; the table has one home.
 *
 * ── F-107 SIZES (LOCKED 2026-05-29) ───────────────────────────────────────
 * Pick the size that matches what the modal IS, not how much content it has.
 *
 *   "nav"     → 560 × 50vh   selection / picker / "what do you want to create?"
 *   "info"    → 1200 × 80vh  THE STANDARD. Forms, records, editors.
 *   "report"  → 1400 × 90vh  drilldowns, dashboards-in-modal.
 *   "confirm" → 420 × auto   destructive confirms. The only auto height.
 *   "xl"      → 90vw × 90vh  consultant workspace (an embedded client Portal).
 *   "builder" → the whole viewport minus the Portal chrome. SEE BELOW.
 *
 * ── WHY "builder" EXISTS (SD-010 addendum, Brandon 2026-09-15) ────────────
 * "Every builder opens as the largest surface we have — at least 80% of the
 * viewport's width and height (rethink the current 'extra large' modal, which
 * is smaller), so the widget pane fits beside the canvas. Bigger is better; he
 * works on large monitors."
 *
 * The Template Studio was the ONLY builder at a proper size and it used "xl"
 * (90vw × 90vh), which on Brandon's 2560px screen still throws away 256px of
 * width — a whole second pane. "builder" is:
 *
 *   width   96vw normally, and the FULL viewport width from 1400px up, because
 *           on a large monitor a gutter buys nothing and the inspector is what
 *           gets squeezed. Both are ≥ 80% at every screen size, which is the
 *           floor the standing decision sets.
 *   height  94vh — the viewport minus a thin margin, so the canvas is as tall
 *           as the screen allows.
 *
 * Expressed as a media rule rather than a number because the width genuinely
 * changes with the screen; every other size in the table is fixed on purpose
 * (the Stripe pattern: same dimensions every open, whitespace if light).
 */

export type IadmModalSize =
  | "nav" | "info" | "report" | "confirm"
  | "md" | "lg" | "xl"
  | "builder";

export interface ModalDims {
  /** A CSS width value, already resolved. */
  width: string;
  /** A CSS height value, or "auto" for the one content-sized size. */
  height: string;
  /** Present only when the width changes with the viewport. */
  widthAtWide?: string;
  /** The breakpoint `widthAtWide` applies from, in px. */
  wideFrom?: number;
  /** Whether this size carries the three-pane builder shell. */
  panes?: boolean;
  /**
   * THE SURFACE IS THE WHOLE WINDOW (D-172, round 2).
   *
   * Measured in the reference on 2026-09-19: top bar 0,0 1680x48; panel 0,48
   * 300x952; canvas 300,48 1380x952. Nothing behind it, above it or under it.
   * Ours was 94vh CENTRED, so at 1000px of viewport the builder's bar started
   * at y=30 and its foot ended at 970 — a strip of the Portal's own nav
   * showing above the editor and a strip of the proposals table showing below
   * it, with the dark scrim over both. A builder is not a dialog laid on the
   * app; for as long as it is open it IS the app.
   *
   * Set, this drops the centring gutter, the rounded corner and the backdrop.
   */
  fullBleed?: boolean;
}

/** The floor SD-010 sets for a builder, as a number a test can check. */
export const BUILDER_MIN_VIEWPORT_FRACTION = 0.8;

/** Left pane width, in px. The widget pane: picture + label + one line each. */
export const BUILDER_PANE_WIDTH = 320;

/** Right inspector width, in px. Optional — a builder may render no inspector. */
/* 300px, MEASURED IN THE REFERENCE EDITOR (D-172, 2026-09-19): its panel
   reports exactly 300 whether it is showing Elements or Edit Container.
   Ours was 320, which is 20px of canvas gone on every builder. */
export const BUILDER_INSPECTOR_WIDTH = 300;

export const MODAL_SIZES: Record<IadmModalSize, ModalDims> = {
  nav: { width: "min(560px, 94vw)", height: "50vh" },
  info: { width: "min(1200px, 94vw)", height: "80vh" },
  report: { width: "min(1400px, 94vw)", height: "90vh" },
  confirm: { width: "min(420px, 94vw)", height: "auto" },

  // Deprecated aliases — both legacy names map to the "info" standard. Existing
  // call sites keep working; new code reaches for nav/info/report/confirm.
  md: { width: "min(1200px, 94vw)", height: "80vh" },
  lg: { width: "min(1200px, 94vw)", height: "80vh" },

  // 2026-06-27 — consultant workspace: ClientTenantModal embeds the client's
  // whole Portal in an iframe. 2026-10-01 — also the OLIVER portal settings
  // window (Look / Signup form / Domain / Workflow), Brandon's call: "since
  // there is so much with this customer portal settings, layout and forms and
  // whatnot, lets make this our extra large modal".
  xl: { width: "90vw", height: "90vh" },

  // 2026-09-15 — THE builder surface (SD-010 addendum), full-bleed since
  // D-172 round 2: the reference's editor fills the window exactly.
  builder: { width: "100vw", height: "100vh", panes: true, fullBleed: true },
};

/**
 * The width this size actually occupies at a given viewport width, as a
 * fraction of it. Pure, so the "at least 80% on any screen" rule is a test and
 * not a comment.
 */
export function widthFractionAt(size: IadmModalSize, viewportPx: number): number {
  const dims = MODAL_SIZES[size];
  const spec = dims.widthAtWide && dims.wideFrom && viewportPx >= dims.wideFrom ? dims.widthAtWide : dims.width;
  return cssWidthToPx(spec, viewportPx) / viewportPx;
}

/** Resolve the small CSS width grammar this table uses: `NNvw`, `NNNpx`, `min(a, b)`. */
export function cssWidthToPx(spec: string, viewportPx: number): number {
  const s = spec.trim();
  const min = /^min\((.+),(.+)\)$/.exec(s);
  if (min) return Math.min(cssWidthToPx(min[1], viewportPx), cssWidthToPx(min[2], viewportPx));
  const vw = /^([\d.]+)vw$/.exec(s);
  if (vw) return (parseFloat(vw[1]) / 100) * viewportPx;
  const px = /^([\d.]+)px$/.exec(s);
  if (px) return parseFloat(px[1]);
  throw new Error(`cssWidthToPx: unsupported width "${spec}"`);
}

/** Height as a fraction of the viewport. "auto" has none. */
export function heightFractionOf(size: IadmModalSize): number | null {
  const h = MODAL_SIZES[size].height;
  const vh = /^([\d.]+)vh$/.exec(h);
  return vh ? parseFloat(vh[1]) / 100 : null;
}

/** Does this size render the left pane / canvas / inspector shell? */
export function hasBuilderPanes(size: IadmModalSize): boolean {
  return MODAL_SIZES[size].panes === true;
}

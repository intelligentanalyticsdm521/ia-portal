/**
 * builder/adapters/mybrand/scene.ts — the pixel scene, as pure data.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §5 step 5. My Brand's Template Studio moved
 * onto the shared builder shell; this file is the half of the old 3,249-line
 * TemplateStudioEditorModal that has nothing to do with React or Fabric.
 *
 * ── WHY IT IS ITS OWN FILE ────────────────────────────────────────────────
 * The same reason builder/model.ts is: a model you can only exercise by
 * clicking is a model nobody tests. Every operation below returns a NEW scene,
 * so undo is builder/history.ts — the SAME history the proposal builder uses,
 * now generic over its value — and the whole of it runs under `node --test`.
 *
 * ── THE SHAPE, UNCHANGED ──────────────────────────────────────────────────
 * `CanvasDoc` is exactly what LUMEN's renderer already reads and writes
 * (LUMEN-API/src/lib/myBrand/templateStudio.js), down to the field names:
 *
 *   { version: 1, width, height, background_color, background_gradient,
 *     layers: [ text | image | shape | chart ] }
 *
 * It is NOT migrated to sections and columns, and it never should be: a layer
 * has an x, a y, a rotation and a z-index, none of which a flowing document
 * has anywhere to put. "One builder" is one SHELL, one registry and one undo
 * — not one model for a proposal and a poster.
 */

import { NEUTRAL_BRAND_KIT } from "../../../lib/brandKit";
import {
  applyCase, curvedTextSvg, dashArray, dashLineCap, isCurved,
  measureRun, needsSvgText, straightTextSvg, wrapLines,
  type StrokeStyle, type TextCase, type TextEffect,
} from "./textEffects";

/**
 * The ONE neutral, borrowed — never a second literal.
 *
 * Several helpers below are pure and cannot call `useBrandKit()`. They used to
 * write Intelligent Analytics' navy and gold straight into a CLIENT's design as
 * the default fill, stroke, outline, tint and gradient. Everything a business
 * actually SEES is seeded from the live kit by templates.ts and insert.ts; this
 * is only what a chart falls back to when a scene carries no colours at all.
 */
const FALLBACK = NEUTRAL_BRAND_KIT.colours;

export interface BaseLayer {
  id: string;
  kind: "text" | "image" | "shape" | "chart";
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  flipH?: boolean;
  flipV?: boolean;
  /** Locked layers render but can't be selected/moved on the canvas. */
  locked?: boolean;
  /**
   * GROUPING, as a tag rather than a container (G-01).
   *
   * Canva's Group makes several things move, rotate and scale as one. The
   * obvious model is a `group` LAYER holding children — and it is the wrong
   * one here, because every painter (Fabric, LUMEN's SVG exporter, the PDF, the
   * gallery thumbnail) would need to learn a recursive scene, and a stored
   * design that a painter does not understand is a design that opens blank.
   *
   * A shared tag gets the whole behaviour with no new shape: selecting one
   * member selects the tag, Fabric's own ActiveSelection moves the set, and
   * EVERY EXISTING PAINTER IGNORES THE FIELD, which is exactly right — a group
   * changes how a design is EDITED, never how it is drawn. Ungroup clears the
   * tag. Nothing is nested, so nothing can be nested wrongly.
   */
  groupId?: string;
  /**
   * HOW FAR A SLANTED QUAD LEANS, in degrees on the page (round-3 R3-E).
   *
   * Only read when the shape or the crop is one of `SLANT_SHAPES`. Absent means
   * "draw the authored path", so every design saved before this existed is
   * untouched. See `slantPathD`.
   */
  slantDeg?: number | null;
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  content: string;
  font?: string;
  size?: number;
  color?: string;
  weight?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  shadow?: boolean;
  /** Outline color (behind-stroke); absent/none = no outline. */
  outline?: string;
  /**
   * Canva's Effects panel. "lift" and "hollow" predate the rest and are
   * unchanged; "echo", "splice" and "neon" arrived with G-04. Every painter
   * asks textEffects.ts what each one means, so the three of them cannot drift.
   */
  effect?: TextEffect;
  /** Echo / Splice / Neon's second colour. Falls back to the text colour. */
  effectColor?: string;
  /** Italic, underline and strikethrough — Canva's other three type buttons. */
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  /**
   * UPPERCASE / lowercase / Title Case as a DISPLAY transform. The layer keeps
   * the author's own words, so turning it off gives them back exactly as typed.
   */
  textCase?: TextCase;
  /**
   * Canva's Curve, as the bulge in canvas pixels: how far the middle of the
   * line bows away from its baseline. Positive is a rainbow, negative a bowl,
   * absent or under a pixel is a straight line. Never a radius — a radius is
   * the number the maths wants and the bulge is the one a person can see.
   */
  curve?: number;
}

export interface ImageFilters {
  brightness?: number; // 0.5..1.5, 1 = neutral
  saturation?: number; // 0..2, 1 = neutral
  grayscale?: boolean;
  /** Brand duotone — grayscale + this color (usually the brand primary). */
  tint?: string;
}

/**
 * THE SHAPE A PHOTO IS CUT TO — Canva calls the result a Frame (G-06).
 *
 * Round 1 offered five: circle, rounded, two blobs and an arch. Design 03's
 * diagonal photo edge had to be faked with a turned rectangle, "and a turned
 * rectangle cannot be a *crop*", which is exactly right — the photo kept its
 * corners and the shape sat on top of it.
 *
 * So the list is now CIRCLE, ROUNDED, OR ANY KEY IN `ICON_PATHS`: every
 * polygon, blob, wave, arch, shield, hexagon and seal the studio already
 * draws, all forty-seven, with no new path data and no new server list — the
 * exporter validates the same keys it has always validated. A string type
 * rather than a union because the set is `ICON_PATHS`' keys and a second copy
 * of that set would be a second thing to keep in step.
 */
export type ImageMask = string;

/** Circle and rounded are not icons; every other mask is an ICON_PATHS key. */
export function isValidMask(mask: string | undefined | null): boolean {
  if (!mask || mask === "none") return false;
  return mask === "circle" || mask === "rounded" || Object.prototype.hasOwnProperty.call(ICON_PATHS, mask);
}

export interface ImageLayer extends BaseLayer {
  kind: "image";
  blob_ref?: string | null;
  src?: string | null;  // local dataURL/URL for in-editor display
  /** Set when placed from the Media Library — enables Remove background. */
  asset_id?: string | null;
  /** GIMP-style adjustments — previewed via Fabric, baked by sharp at export. */
  filters?: ImageFilters;
  /** Clip the photo to a shape — raw rectangles are the amateur tell. */
  mask?: ImageMask;
  /**
   * A FRAME'S BORDER, drawn along the mask's own outline rather than around
   * the box. A circle frame with a gold ring is one layer, not a photo with an
   * ellipse balanced on top that comes adrift the moment either is nudged.
   */
  frameStroke?: string;
  frameStrokeWidth?: number;
  frameDash?: StrokeStyle;
  /**
   * What an EMPTY frame is filled with while it waits for a photo. Canva shows
   * a grey well; a designer laying out a page before the photography arrives
   * wants it in their own colour.
   */
  frameFill?: string;
  /**
   * Corner rounding in canvas pixels, for a photo with no mask — the plain
   * "round the corners of this picture" that needed a mask before. Ignored
   * when `mask` is set, because a mask already says what the shape is.
   */
  radius?: number;
  /**
   * R4-F: size the frame by its mask's INK rather than by the 0–100 box the
   * path was authored in, so a 700 px arch frame is 700 px of arch. The crop
   * and the border read the same flag, so they cannot come apart.
   */
  fitInk?: boolean;
}
// ── Color math for Brand Sync + Fix contrast (deterministic, no model) ─────
function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function relLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function nearestBrandColor(hex: string, palette: string[]): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const prgb = hexToRgb(p);
    if (!prgb) continue;
    const d = (rgb[0] - prgb[0]) ** 2 + (rgb[1] - prgb[1]) ** 2 + (rgb[2] - prgb[2]) ** 2;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Exposed for the inspector's contrast helper and its test. */
export { hexToRgb, relLuminance, nearestBrandColor };

export interface GradientSpec {
  from: string;
  to: string;
  dir: "h" | "v" | "d1" | "d2";
}

/**
 * A REPEATING FILL — stripes, dots, a grid, a check.
 *
 * Three of the ten reference designs call for one ("no diagonal stripe texture
 * for the photo", 01; "no stripe texture", 03), and every one of them is a flat
 * panel today. It is a fill, so it lives beside `fill` and `gradient` and the
 * same precedence question is answered once, in `shapeFill`: pattern beats
 * gradient beats colour, because it is the most specific thing the author
 * asked for.
 *
 * `size` is the tile's side in CANVAS pixels, not a fraction, so a 12 px stripe
 * is 12 px whether it is on a business card or a poster — the one thing a
 * texture must not do is change scale when a design is resized. `angle` turns
 * the tile, which is how one stripe tile serves horizontal, vertical and both
 * diagonals.
 */
export interface PatternSpec {
  kind: "stripe" | "dot" | "grid" | "check";
  /** The ink. */
  colour: string;
  /** The paper. "none" leaves whatever is behind showing through. */
  background?: string;
  /** Tile side in canvas pixels. */
  size?: number;
  /** Degrees, clockwise. */
  angle?: number;
  /** How much of the tile is ink, 0..1. Stripe width, dot radius, line weight. */
  weight?: number;
}

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  shape: "rect" | "ellipse" | "line" | "icon";
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /**
   * Solid, dashed or dotted. Reference designs 9 and 10 both need it — a
   * dashed ring around a circle frame and three dotted fill-in rules — and a
   * stroke control that can only draw one kind of line is the control lying.
   */
  dash?: StrokeStyle;
  /** rect only — corner radius in canvas px. */
  radius?: number;
  /** icon only — key into ICON_PATHS (validated server-side by key). */
  icon?: string;
  /** Overrides fill when present. */
  gradient?: GradientSpec;
  /** Overrides BOTH fill and gradient when present — see PatternSpec. */
  pattern?: PatternSpec;
  /**
   * R4-E: icon only — "outline" draws the path's edge instead of filling it.
   * Absent means filled, which is what every icon stored before round 5 is.
   */
  iconWeight?: "filled" | "outline";
  /**
   * R4-F: icon only — size the layer box by the path's INK rather than by the
   * 0–100 box it was authored in. See `inkViewBox`.
   */
  fitInk?: boolean;
}

const GRADIENT_COORDS: Record<GradientSpec["dir"], { x1: number; y1: number; x2: number; y2: number }> = {
  h:  { x1: 0, y1: 0, x2: 1, y2: 0 },
  v:  { x1: 0, y1: 0, x2: 0, y2: 1 },
  d1: { x1: 0, y1: 0, x2: 1, y2: 1 },
  d2: { x1: 0, y1: 1, x2: 1, y2: 0 },
};

export { GRADIENT_COORDS };

// Curated icon pack (§8b bucket 1) — IDENTICAL map lives server-side in
// LUMEN templateStudio.js ICON_PATHS; the server validates by KEY and owns
// the render, so keep the two in lockstep. 100×100 viewBox.
export const ICON_PATHS: Record<string, string> = {
  star:     "M50 5 L61 38 L96 38 L68 59 L79 92 L50 71 L21 92 L32 59 L4 38 L39 38 Z",
  heart:    "M50 88 C20 62 5 44 5 28 C5 12 18 4 30 4 C39 4 46 9 50 16 C54 9 61 4 70 4 C82 4 95 12 95 28 C95 44 80 62 50 88 Z",
  arrow:    "M5 42 H60 V22 L95 50 L60 78 V58 H5 Z",
  check:    "M10 55 L38 83 L90 22 L78 12 L38 60 L22 44 Z",
  bubble:   "M10 10 H90 Q95 10 95 15 V60 Q95 65 90 65 H45 L25 85 V65 H10 Q5 65 5 60 V15 Q5 10 10 10 Z",
  seal:     "M50 2 L62 12 L78 8 L82 24 L98 30 L90 45 L98 60 L82 66 L78 82 L62 78 L50 88 L38 78 L22 82 L18 66 L2 60 L10 45 L2 30 L18 24 L22 8 L38 12 Z",
  bolt:     "M55 2 L15 55 H42 L35 98 L85 40 H55 Z",
  pin:      "M50 2 C30 2 15 17 15 37 C15 62 50 98 50 98 C50 98 85 62 85 37 C85 17 70 2 50 2 Z M50 50 A13 13 0 1 1 50 24 A13 13 0 1 1 50 50 Z",
  plus:     "M38 5 H62 V38 H95 V62 H62 V95 H38 V62 H5 V38 H38 Z",
  triangle: "M50 8 L95 92 H5 Z",
  arrowleft: "M95 42 H40 V22 L5 50 L40 78 V58 H95 Z",
  arrowup: "M42 95 V40 H22 L50 5 L78 40 H58 V95 Z",
  arrowdown: "M42 5 V60 H22 L50 95 L78 60 H58 V5 Z",
  xmark: "M20 8 L50 38 L80 8 L92 20 L62 50 L92 80 L80 92 L50 62 L20 92 L8 80 L38 50 L8 20 Z",
  diamond: "M50 2 L98 50 L50 98 L2 50 Z",
  hexagon: "M25 7 H75 L98 50 L75 93 H25 L2 50 Z",
  pentagon: "M50 4 L97 38 L79 94 H21 L3 38 Z",
  ring: "M50 5 A45 45 0 1 0 50 95 A45 45 0 1 0 50 5 Z M50 30 A20 20 0 1 1 50 70 A20 20 0 1 1 50 30 Z",
  burst: "M50 0 L60 40 L100 50 L60 60 L50 100 L40 60 L0 50 L40 40 Z",
  sparkle: "M50 5 L58 42 L95 50 L58 58 L50 95 L42 58 L5 50 L42 42 Z",
  tag: "M5 5 H55 L95 45 L55 85 L5 45 Z M25 20 A8 8 0 1 1 25 36 A8 8 0 1 1 25 20 Z",
  gift: "M10 32 H90 V48 H10 Z M18 54 H82 V95 H18 Z M45 32 H55 V95 H45 Z M30 8 Q45 8 50 26 Q55 8 70 8 Q82 8 82 20 Q82 30 66 30 H34 Q18 30 18 20 Q18 8 30 8 Z",
  percent: "M70 5 L85 15 L30 95 L15 85 Z M27 8 A16 16 0 1 0 27 40 A16 16 0 1 0 27 8 Z M73 60 A16 16 0 1 0 73 92 A16 16 0 1 0 73 60 Z",
  home: "M50 5 L95 45 H83 V95 H60 V65 H40 V95 H17 V45 H5 Z",
  user: "M50 8 A20 20 0 1 0 50 48 A20 20 0 1 0 50 8 Z M10 95 Q10 58 50 58 Q90 58 90 95 Z",
  phone: "M35 5 H65 Q72 5 72 12 V88 Q72 95 65 95 H35 Q28 95 28 88 V12 Q28 5 35 5 Z M44 84 H56 V88 H44 Z",
  mail: "M5 20 H95 V80 H5 Z M9 24 L50 56 L91 24 L91 30 L50 62 L9 30 Z",
  calendar: "M10 20 H90 V95 H10 Z M14 36 H86 V42 H14 Z M25 5 H33 V20 H25 Z M67 5 H75 V20 H67 Z",
  thumbs: "M30 45 L50 10 Q60 5 60 18 L57 40 H88 Q96 42 94 52 L86 88 Q84 95 76 95 H30 Z M8 45 H24 V95 H8 Z",
  camera: "M20 25 L30 12 H70 L80 25 H95 V90 H5 V25 Z M50 35 A20 20 0 1 0 50 75 A20 20 0 1 0 50 35 Z",
  music: "M35 15 L85 5 V70 A14 11 0 1 1 79 59 V22 L41 30 V82 A14 11 0 1 1 35 71 Z",
  leaf: "M85 15 Q40 15 25 50 Q15 78 15 90 Q40 88 62 75 Q88 58 85 15 Z",
  coffee: "M15 30 H75 V70 A20 20 0 0 1 55 90 H35 A20 20 0 0 1 15 70 Z M75 38 H85 A12 12 0 0 1 85 62 H75 V54 H83 A5 5 0 0 0 83 46 H75 Z",
  flag: "M20 5 H28 V95 H20 Z M28 10 H85 L70 30 L85 50 H28 Z",
  crown: "M10 75 L5 30 L32 48 L50 15 L68 48 L95 30 L90 75 Z M10 82 H90 V92 H10 Z",
  shield: "M50 3 L90 18 V50 Q90 82 50 97 Q10 82 10 50 V18 Z",
  gem: "M30 8 H70 L92 35 L50 95 L8 35 Z",
  blob1: "M83 18 Q97 34 93 55 Q89 76 70 88 Q49 99 30 89 Q10 79 6 57 Q3 36 18 20 Q34 4 57 5 Q72 6 83 18 Z",
  blob2: "M76 10 Q95 22 96 45 Q97 70 78 84 Q58 97 36 92 Q13 86 6 64 Q0 42 14 24 Q28 6 52 4 Q66 3 76 10 Z",
  blob3: "M70 6 Q92 12 95 34 Q98 55 86 72 Q73 90 50 94 Q26 97 12 80 Q-1 62 5 40 Q11 18 32 9 Q50 2 70 6 Z",
  wave: "M0 60 Q12 40 25 55 Q38 70 50 55 Q62 40 75 55 Q88 70 100 55 V100 H0 Z",
  wave2: "M0 45 Q25 15 50 45 Q75 75 100 45 V100 H0 Z",
  arch: "M10 100 V50 Q10 5 50 5 Q90 5 90 50 V100 Z",
  halfcircle: "M0 100 A50 50 0 0 1 100 100 Z",
  quartercircle: "M0 0 H100 A100 100 0 0 1 0 100 Z",
  scallop: "M0 100 V20 Q12 6 25 20 Q38 34 50 20 Q62 6 75 20 Q88 34 100 20 V100 Z",
  dots: "M15 8 A7 7 0 1 0 15 22 A7 7 0 1 0 15 8 Z M50 8 A7 7 0 1 0 50 22 A7 7 0 1 0 50 8 Z M85 8 A7 7 0 1 0 85 22 A7 7 0 1 0 85 8 Z M15 43 A7 7 0 1 0 15 57 A7 7 0 1 0 15 43 Z M50 43 A7 7 0 1 0 50 57 A7 7 0 1 0 50 43 Z M85 43 A7 7 0 1 0 85 57 A7 7 0 1 0 85 43 Z M15 78 A7 7 0 1 0 15 92 A7 7 0 1 0 15 78 Z M50 78 A7 7 0 1 0 50 92 A7 7 0 1 0 50 78 Z M85 78 A7 7 0 1 0 85 92 A7 7 0 1 0 85 78 Z",
  /**
   * THE FOUR SLANTED QUADS (round-3 R2-D).
   *
   * Designs 03 and 07 both want a photograph with a slanted edge, and round 2
   * had to fake both with a turned rectangle laid OVER the picture — which is
   * not a crop: the photo keeps its own corners underneath and the two come
   * apart the moment either is nudged. Forty-seven paths and not one of them a
   * slanted quad, so "any shape is a frame" could not answer the one shape the
   * references actually asked for.
   *
   * Authored in the same 100×100 box as every other path, so they are frames,
   * icons, patterned shapes and pickable symbols with no further work — and
   * the server validates them by the same key lookup.
   */
  parallelogram: "M24 6 H98 L76 94 H2 Z",
  trapezoid: "M20 6 H80 L98 94 H2 Z",
  /** A rectangle whose right edge leans — design 03's photo edge. */
  slant: "M0 0 H100 V72 L0 100 Z",
  octagon: "M30 2 H70 L98 30 V70 L70 98 H30 L2 70 V30 Z",
};

/* ══════════════════════════════════════════════════════════════════════════
   A SHAPE'S BOX AND ITS INK ARE TWO DIFFERENT RECTANGLES — ROUND-5 R4-F
   ══════════════════════════════════════════════════════════════════════════

   Every path above is authored in a 0–100 box and almost none of them fills
   it. `arch` runs x 10…90, so design 02's 700 px arch layer draws 560 px of
   arch and reads narrower than the reference's — and a frame could not be
   sized by the one thing anybody can see, which is its ink. Round 3 made the
   crop and the border coincide; this makes the pair sizeable.

   MEASURED, not read off the path data: a quadratic's control point lies
   OUTSIDE its own curve, so the bounding box of the numbers in a `d` string is
   wrong for every blob, wave and arch in the pack. Each path was rasterised on
   its own at 1000 × 1000 with `preserveAspectRatio="none"` — the very stretch
   both engines apply — and the ink looked for (ink.mjs in the round-5 parity
   harness, 2026-09-19). In viewBox units, to one decimal, [x0, y0, x1, y1].

   Three paths fill their box exactly (burst, quartercircle, slant) and are not
   listed; `inkViewBox` falls back to the full box, so the table carries only
   the paths it changes anything for.

   The identical table is in LUMEN's `templateStudio.js` ICON_INK, and both
   suites assert the same worked numbers.
*/
export const ICON_INK: Record<string, [number, number, number, number]> = {
  star: [4, 5.1, 96, 92],
  heart: [5, 4, 95, 88],
  arrow: [5, 22, 95, 78],
  check: [10, 12, 90, 83],
  bubble: [5, 10, 95, 85],
  seal: [2, 2, 98, 88],
  bolt: [15, 2, 85, 98],
  pin: [15, 2, 85, 98],
  plus: [5, 5, 95, 95],
  triangle: [5, 8, 95, 92],
  arrowleft: [5, 22, 95, 78],
  arrowup: [22, 5, 78, 95],
  arrowdown: [22, 5, 78, 95],
  xmark: [8, 8, 92, 92],
  diamond: [2, 2, 98, 98],
  hexagon: [2, 7, 98, 93],
  pentagon: [3, 4, 97, 94],
  ring: [5, 5, 95, 95],
  sparkle: [5.1, 5.1, 94.9, 94.9],
  tag: [5, 5, 95, 85],
  gift: [10, 8, 90, 95],
  percent: [11, 5, 89, 95],
  home: [5, 5, 95, 95],
  user: [10, 8, 90, 95],
  phone: [28, 5, 72, 95],
  mail: [5, 20, 95, 80],
  calendar: [10, 5, 90, 95],
  thumbs: [8, 8.6, 94.4, 95],
  camera: [5, 12, 95, 90],
  music: [13.2, 5, 85, 91.2],
  leaf: [15, 15, 85.3, 90],
  coffee: [15, 30, 97, 90],
  flag: [20, 5, 85, 95],
  crown: [5, 15, 95, 92],
  shield: [10, 3, 90, 97],
  gem: [8, 8, 92, 95],
  blob1: [5.5, 4.9, 93.9, 93.8],
  blob2: [4.2, 3.8, 96.1, 93.4],
  blob3: [3.1, 4.5, 95.6, 94.5],
  wave: [0, 47.5, 100, 100],
  wave2: [0, 30, 100, 100],
  arch: [10, 5, 90, 100],
  halfcircle: [0, 50, 100, 100],
  scallop: [0, 13, 100, 100],
  dots: [8, 8, 92, 92],
  parallelogram: [2, 6, 98, 94],
  trapezoid: [2, 6, 98, 94],
  octagon: [2, 2, 98, 98],
};

/**
 * The viewBox that makes a path's INK fill the layer box, as [x, y, w, h].
 *
 * Without `fitInk` this is the authored box, so every design stored before
 * round 5 draws exactly what it always drew.
 *
 * LINE FOR LINE with LUMEN's `inkViewBox`.
 */
export function inkViewBox(
  key: string | null | undefined, fitInk?: boolean,
): [number, number, number, number] {
  const ink = fitInk ? ICON_INK[String(key || "")] : null;
  if (!ink) return [0, 0, 100, 100];
  return [ink[0], ink[1], Math.max(0.1, ink[2] - ink[0]), Math.max(0.1, ink[3] - ink[1])];
}

/**
 * HOW HEAVY AN OUTLINE ICON'S LINE IS — ROUND-5 R4-E.
 *
 * The pack had one weight: filled. Design 01's instagram mark came out as a
 * filled blob where the reference draws a camera outline, and an icon offered
 * no choice between the two. An outline icon is the same path with no fill and
 * a stroke, and 6 viewBox units — six per cent of the icon's own box — reads as
 * a line rather than a hairline or a second fill at every size the studio
 * places an icon at.
 *
 * LINE FOR LINE with LUMEN's `ICON_OUTLINE_WEIGHT`.
 */
export const ICON_OUTLINE_WEIGHT = 6;

export const DECOR_KEYS = new Set(["blob1","blob2","blob3","wave","wave2","arch","halfcircle","quartercircle","scallop","dots"]);

/* ══════════════════════════════════════════════════════════════════════════
   A SLANTED FRAME'S ANGLE CAN BE SET (round-3 R3-E)
   ══════════════════════════════════════════════════════════════════════════

   Round 3 added the four quads above and they ARE real crops — but the lean is
   baked into the path. `parallelogram` carries a 22-unit offset across an
   88-unit drop, so designs 03 and 07, both of which want about nine degrees,
   came out at nineteen and fifteen. Widening the box to bleed the far edge off
   the page only steepens it, because the path stretches with the box.

   So the lean is a NUMBER the author sets, and the path is written from it.
   `slantPathD` is given the layer's real width and height and returns a path
   whose slanted edge lands at exactly the asked-for angle ON THE PAGE — which
   is the only angle anybody can see. The identical function is in LUMEN's
   `templateStudio.js`, and both suites assert the same worked paths.

   The authored path stays the default: a layer with no `slantDeg` draws exactly
   what it drew before, so nothing already saved moves. */

export const SLANT_SHAPES = ["parallelogram", "trapezoid", "slant"] as const;
export type SlantShape = (typeof SLANT_SHAPES)[number];

export function isSlantShape(key: string | null | undefined): key is SlantShape {
  return (SLANT_SHAPES as readonly string[]).includes(String(key || ""));
}

/** Three decimals — enough for a 100-unit box, short enough to read. */
const vb = (n: number) => Number(n.toFixed(3));

/** How far the edge travels sideways, in viewBox units, for `deg` on the page. */
function slantOffset(deg: number, across: number, along: number): number {
  const a = Math.max(-60, Math.min(60, Number(deg) || 0));
  const t = Math.abs(Math.tan((a * Math.PI) / 180));
  return Math.min(100, (t * Math.max(1, along)) / Math.max(1, across) * 100);
}

/**
 * One of the three quads, leaning by `deg` degrees in a `w` × `h` box.
 *
 * Positive leans the way the authored path does; negative mirrors it.
 */
export function slantPathD(kind: SlantShape, deg: number, w: number, h: number): string {
  const a = Math.max(-60, Math.min(60, Number(deg) || 0));
  if (kind === "slant") {
    // The BOTTOM edge leans, so the run is measured across the width.
    const dy = slantOffset(a, h, w);
    return a >= 0
      ? `M0 0 H100 V${vb(100 - dy)} L0 100 Z`
      : `M0 0 H100 V100 L0 ${vb(100 - dy)} Z`;
  }
  const dx = slantOffset(a, w, h);
  if (kind === "parallelogram") {
    return a >= 0
      ? `M${vb(dx)} 0 H100 L${vb(100 - dx)} 100 H0 Z`
      : `M0 0 H${vb(100 - dx)} L100 100 H${vb(dx)} Z`;
  }
  // A trapezoid leans BOTH edges outward by the same angle, so each one moves
  // half as far or the two would cross at forty-five degrees.
  const half = Math.min(50, dx);
  return `M${vb(half)} 0 H${vb(100 - half)} L100 100 H0 Z`;
}

/**
 * The lean the AUTHORED path already has, on the page, in this box.
 *
 * What the slider reads before anybody has dragged it — so the control starts
 * on the truth rather than on zero, and the first drag is a nudge instead of a
 * jump.
 */
export function bakedSlantDeg(kind: SlantShape, w: number, h: number): number {
  const W = Math.max(1, Number(w) || 1);
  const H = Math.max(1, Number(h) || 1);
  // Measured off the authored paths above: parallelogram M24 6 → H2 (22 across
  // an 88 drop), trapezoid M20 6 → H2 (18 across 88), slant V72 → 100 (28 down
  // a 100 run).
  const run = kind === "slant" ? (28 / 100) * H : (kind === "parallelogram" ? 22 / 88 : 18 / 88) * W;
  const rise = kind === "slant" ? W : H;
  return Math.round((Math.atan(run / Math.max(1, rise)) * 180) / Math.PI);
}

/**
 * The path a shape key draws with, once the layer has had its say.
 *
 * ONE answer, asked by the frame's crop, the frame's border and the icon
 * picture alike, so a slanted frame's crop and its border can never lean by
 * different amounts.
 */
export function shapePathD(
  key: string | null | undefined,
  layer: { slantDeg?: number | null; w?: number; h?: number },
): string | undefined {
  const k = String(key || "");
  const authored = ICON_PATHS[k];
  if (!authored) return undefined;
  const deg = layer?.slantDeg;
  if (isSlantShape(k) && deg != null && Number.isFinite(Number(deg))) {
    return slantPathD(k, Number(deg), Number(layer.w) || 1, Number(layer.h) || 1);
  }
  return authored;
}

/**
 * HOW MUCH AN ICON'S OWN 100×100 SPACE IS STRETCHED BY (parity D-3).
 *
 * Every icon is authored in a 100×100 box and drawn into the layer's box, so a
 * 6 px outline asked for in the inspector came out at 6 × (700 / 100) = 42 px
 * on design 02's arch. The report put it plainly: "its 6 px rule came out
 * ~45 px because a stroke on an icon scales with the icon".
 *
 * A non-uniform box (700 × 400) has no single scale, and SVG has no way to
 * stroke one path at two widths, so the honest answer is the GEOMETRIC MEAN of
 * the two — the same number SVG itself uses for a percentage length in a
 * non-square viewport, and the number that makes a stroke on a wide box look
 * right rather than right in one axis and wrong in the other.
 *
 * Exported because LUMEN's `emitShapeLayer` does the identical division on the
 * identical formula, and the two suites assert the same worked example.
 */
export function iconStrokeScale(w: number, h: number): number {
  const sx = Math.max(1, Number(w) || 1) / 100;
  const sy = Math.max(1, Number(h) || 1) / 100;
  return Math.sqrt(sx * sy);
}

/**
 * The fill for a shape, as an SVG paint string, plus any defs it needs.
 *
 * ONE function, because three separate answers to "what colour is this shape"
 * is how round 1 ended up with a gradient that worked on a rectangle and not
 * on an icon. Precedence: pattern, then gradient, then colour.
 *
 * "none" MEANS NONE (parity D-3). An icon with an empty fill used to paint the
 * brand primary, so an outline-only arch became a solid arch that hid the label
 * behind it. An author who cleared the fill wants no fill; the only place a
 * fallback colour belongs is a shape that was never given one at all, and
 * `insert.ts` gives every shape one.
 */
export function shapeFill(
  layer: Pick<ShapeLayer, "fill" | "gradient" | "pattern">,
  idPrefix: string,
  defs: string[],
  /** Where this little SVG sits on the page — see `patternDef` (R3-G). */
  originX = 0,
  originY = 0,
): string {
  if (layer.pattern) {
    const id = `${idPrefix}p`;
    defs.push(patternDef(layer.pattern, id, originX, originY));
    return `url(#${id})`;
  }
  if (layer.gradient) {
    const id = `${idPrefix}g`;
    const c = GRADIENT_COORDS[layer.gradient.dir] || GRADIENT_COORDS.d1;
    defs.push(`<linearGradient id="${id}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">` +
      `<stop offset="0" stop-color="${layer.gradient.from}"/><stop offset="1" stop-color="${layer.gradient.to}"/></linearGradient>`);
    return `url(#${id})`;
  }
  if (!layer.fill || layer.fill === "none") return "none";
  return layer.fill;
}

/**
 * A repeating fill as an SVG `<pattern>`, in USER SPACE.
 *
 * userSpaceOnUse and not the default objectBoundingBox: a bounding-box pattern
 * is a FRACTION of the shape, so the same stripe setting would be four pixels
 * wide on a badge and forty on a banner, and resizing a panel would change its
 * texture. In user space the tile is the size the author typed, everywhere.
 *
 * The identical geometry is in LUMEN's `patternDef`; both suites assert the
 * same worked tile.
 */
export function patternDef(spec: PatternSpec, id: string, originX = 0, originY = 0): string {
  const size = Math.max(2, Number(spec.size) || 16);
  const weight = Math.min(0.95, Math.max(0.05, Number(spec.weight) || 0.5));
  const angle = Number(spec.angle) || 0;
  const ink = spec.colour || FALLBACK.primary;
  const paper = spec.background && spec.background !== "none" ? spec.background : null;
  /**
   * WHERE THE FIRST TILE STARTS, AND WHY THE EDITOR HAS TO BE TOLD (R3-G).
   *
   * A `userSpaceOnUse` pattern is laid out from the ORIGIN OF THE DOCUMENT it
   * is in. LUMEN's document is the whole page, and the editor's is the layer's
   * own little SVG — so the same stripe setting started its first band at two
   * different places, and at 120 px nobody could see it. At the 400 px this
   * round allows, a band-and-a-half of daylight moves, and the download stops
   * matching the screen.
   *
   * `translate(-x -y)` before the turn puts the editor's tile back on the
   * page's own grid: a point in the layer is then given the tile the page would
   * have given it. LUMEN passes no origin, because the page IS the origin.
   */
  const shift = originX || originY ? `translate(${-originX} ${-originY})` : "";
  const spin = angle ? `rotate(${angle})` : "";
  const moves = [shift, spin].filter(Boolean).join(" ");
  const turn = moves ? ` patternTransform="${moves}"` : "";
  const bg = paper ? `<rect width="${size}" height="${size}" fill="${paper}"/>` : "";
  let ink_ = "";
  if (spec.kind === "stripe") {
    ink_ = `<rect x="0" y="0" width="${(size * weight).toFixed(3)}" height="${size}" fill="${ink}"/>`;
  } else if (spec.kind === "dot") {
    const r = (size * weight) / 2;
    ink_ = `<circle cx="${size / 2}" cy="${size / 2}" r="${r.toFixed(3)}" fill="${ink}"/>`;
  } else if (spec.kind === "grid") {
    const t = Math.max(0.5, size * weight * 0.25);
    ink_ = `<path d="M0 0 H${size} M0 0 V${size}" stroke="${ink}" stroke-width="${t.toFixed(3)}" fill="none"/>`;
  } else {
    const half = size / 2;
    ink_ = `<rect x="0" y="0" width="${half}" height="${half}" fill="${ink}"/>` +
      `<rect x="${half}" y="${half}" width="${half}" height="${half}" fill="${ink}"/>`;
  }
  return `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}"${turn}>${bg}${ink_}</pattern>`;
}

function iconToSvg(layer: ShapeLayer): string {
  const d = shapePathD(layer.icon, layer) || ICON_PATHS.star;
  const defsParts: string[] = [];
  // The id carries the layer so two icons in one document cannot collide, and
  // so a pattern tile is never shared between two shapes that set it apart.
  const fillPaint = shapeFill(layer, `i${String(layer.id || "x").replace(/[^A-Za-z0-9]/g, "")}`, defsParts);
  /**
   * R4-E: AN OUTLINE ICON IS THE SAME PATH WITH NO FILL AND A LINE.
   *
   * The colour the outline is drawn in is the colour the fill would have been,
   * so switching an icon from filled to outline keeps it the author's colour
   * without asking a second question — unless a stroke was already set, which
   * is theirs and stays. A gradient or pattern fill cannot be a line, so an
   * outline icon falls back to the flat colour under it.
   */
  const outline = layer.iconWeight === "outline";
  const authoredStroke = layer.stroke && layer.stroke !== "none" ? layer.stroke : null;
  const lineColour = authoredStroke
    || (layer.fill && layer.fill !== "none" ? layer.fill : FALLBACK.primary);
  const fill = outline ? "none" : fillPaint;
  const stroke = outline ? lineColour : (authoredStroke || "none");
  // R4-F: with `fitInk` the layer box is filled by the path's INK, so a 700 px
  // arch draws 700 px of arch. Without it these are the authored 0–100 box and
  // nothing that was stored before round 5 moves.
  const [vx, vy, vw, vh] = inkViewBox(layer.icon, layer.fitInk === true);
  // D-3: divide the asked-for width by the icon's own stretch, so the number in
  // the inspector is the number of canvas pixels that get painted.
  const sw = Number(layer.strokeWidth) || 0;
  const swInBox = sw > 0
    ? sw / iconStrokeScale(layer.w * (100 / vw), layer.h * (100 / vh))
    : (outline ? ICON_OUTLINE_WEIGHT : 0);
  const dash = dashArray(layer.dash, swInBox || 1);
  const dashAttrs = dash.length && swInBox > 0
    ? ` stroke-dasharray="${dash.map((n) => Number(n.toFixed(4))).join(" ")}" stroke-linecap="${dashLineCap(layer.dash)}"`
    : "";
  const defs = defsParts.length ? `<defs>${defsParts.join("")}</defs>` : "";
  /**
   * R3-B: AN ICON THAT IS NOT SQUARE WAS DRAWN SQUARE IN THE BROWSER.
   *
   * The server stretches its icons outright — `transform="translate(x y)
   * scale(w/100 h/100)"` in `emitShapeLayer` — but this picture handed Chrome a
   * 100×100 viewBox in a 1275×220 box and said nothing about how to reconcile
   * the two, so SVG's default `xMidYMid meet` LETTERBOXED it: design 09's wave
   * band came out 220 wide, square, and centred, and Fabric then scaled that
   * already-wrong picture to the layer. `none` is what makes the two halves the
   * same stretch.
   */
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.w}" height="${layer.h}" ` +
    `viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="none">${defs}` +
    `<path d="${d}" fill-rule="evenodd" fill="${fill}" stroke="${stroke}" stroke-width="${Number(swInBox.toFixed(4))}"${dashAttrs} /></svg>`;
}

/**
 * A rect or an ellipse as an SVG picture — ONLY for the fills Fabric has no
 * object for.
 *
 * Fabric paints a flat colour and a linear gradient natively, and a native
 * object stays a real editable rectangle, so it keeps them. It has no
 * equivalent of an SVG `<pattern>`, and hand-rolling one as a Fabric pattern
 * would be a SECOND drawing of the same texture that agrees with the exporter
 * today and drifts tomorrow. So a patterned shape becomes the exporter's own
 * picture, exactly as an icon already does.
 */
export function shapeToSvg(layer: ShapeLayer): string {
  const w = Math.max(1, layer.w);
  const h = Math.max(1, layer.h);
  const defsParts: string[] = [];
  const fill = shapeFill(
    layer, `s${String(layer.id || "x").replace(/[^A-Za-z0-9]/g, "")}`, defsParts,
    Number(layer.x) || 0, Number(layer.y) || 0,
  );
  const stroke = layer.stroke && layer.stroke !== "none" ? layer.stroke : "none";
  const sw = Number(layer.strokeWidth) || 0;
  const dash = dashArray(layer.dash, sw || 1);
  const dashAttrs = dash.length && sw > 0
    ? ` stroke-dasharray="${dash.map((n) => Number(n.toFixed(4))).join(" ")}" stroke-linecap="${dashLineCap(layer.dash)}"`
    : "";
  // Half the stroke sits outside the shape, so the picture is inset by that
  // much or the outline is clipped by its own box.
  const inset = sw / 2;
  const common = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dashAttrs}`;
  const body = layer.shape === "ellipse"
    ? `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0.5, w / 2 - inset)}" ry="${Math.max(0.5, h / 2 - inset)}" ${common}/>`
    : `<rect x="${inset}" y="${inset}" width="${Math.max(1, w - sw)}" height="${Math.max(1, h - sw)}"` +
      (layer.radius ? ` rx="${Math.min(Number(layer.radius), Math.min(w, h) / 2)}"` : "") + ` ${common}/>`;
  const defs = defsParts.length ? `<defs>${defsParts.join("")}</defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${defs}${body}</svg>`;
}

/**
 * A text layer that Fabric cannot paint, as the SAME SVG the exporter writes.
 *
 * Echo, Splice and Neon need more than one painted copy of the words, and a
 * Fabric object has exactly one shadow. Curve needs each glyph placed and
 * rotated on an arc, which no text object anywhere does. So those four become
 * a picture — drawn from textEffects.ts, which is also what LUMEN's emitter
 * reads, so the canvas and the download are the same drawing rather than two
 * drawings that agree today.
 *
 * The returned `h` is the height the words actually NEED, not the layer's own
 * `h`: a text layer's height has always been nominal (Fabric's Textbox
 * auto-grows) and an SVG rendered at a shorter box would clip the last line
 * off silently, which is the worst possible failure for a design tool.
 */
export function textLayerSvg(layer: TextLayer, fontFaceCss?: string | null): { svg: string; w: number; h: number } | null {
  if (!needsSvgText(layer)) return null;
  const size = Math.max(1, layer.size || 24);
  const w = Math.max(1, layer.w);
  const font = familyOf(layer.font || DEFAULT_FONTS[0]);
  const weight = layer.weight || "400";
  const bold = Number(weight) >= 600 || weight === "bold";
  const content = applyCase(layer.content || "", layer.textCase);
  const effectInput = {
    effect: layer.effect ?? null,
    shadow: layer.shadow === true,
    outline: layer.outline ?? null,
    size,
    colour: layer.color || "#111827",
    effectColour: layer.effectColor ?? null,
  };
  if (isCurved(layer.curve)) {
    const bulge = Number(layer.curve);
    const boxH = Math.max(size * 1.6, layer.h, Math.abs(bulge) + size * 1.6);
    const svg = curvedTextSvg({
      text: content,
      cx: w / 2,
      // A rainbow's middle is its highest point and its ends drop by the bulge;
      // a bowl is the other way up. Anchoring each at the edge it grows away
      // from is what keeps the whole arc inside the picture.
      y: bulge > 0 ? size * 1.05 : boxH - size * 0.35,
      span: w * 0.92,
      bulge,
      size,
      letterSpacing: layer.letterSpacing || 0,
      // D-1: the arc is packed with the REAL advances of the face that will be
      // drawn, not a flat average — see textEffects.ADVANCE_TABLES.
      family: font,
      bold,
      font,
      weight,
      italic: layer.italic === true,
      boxW: w,
      boxH,
      effectInput,
      // D-2: without the face's own bytes an SVG loaded through <img> cannot
      // reach the page's webfonts and falls back to a system serif.
      fontFaceCss,
    });
    return svg ? { svg, w, h: Math.round(boxH) } : null;
  }
  // R3-D: measured against the FACE, not counted in characters — see
  // textEffects.wrapLines.
  const lines = wrapLines(content, w, size, weight, font, layer.letterSpacing || 0);
  const lineHeight = layer.lineHeight || 1.2;
  const align = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
  const anchorX = align === "middle" ? w / 2 : align === "end" ? w : 0;
  const boxH = Math.max(1, Math.round(size * 1.05 + (lines.length - 1) * size * lineHeight + size * 0.4));
  const svg = straightTextSvg({
    lines,
    anchorX,
    firstBaselineY: size,
    align,
    size,
    lineHeight,
    letterSpacing: layer.letterSpacing || 0,
    font,
    weight,
    italic: layer.italic === true,
    underline: layer.underline === true,
    strike: layer.strike === true,
    boxW: w,
    boxH,
    effectInput,
    fontFaceCss,
  });
  return { svg, w, h: boxH };
}

/* ══════════════════════════════════════════════════════════════════════════
   Does the text fit? (parity D-8)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * WHAT A TEXT BOX IS ABOUT TO DO TO THE WORDS IN IT.
 *
 * Round 1: *"Three designs lost a line to a box a few pixels too narrow with
 * no warning on the canvas; two of them only showed it in the exported PNG."*
 * The headline on design 08 had to be re-set from 82 px to 76 px to stop it
 * wrapping, and the only way to find that out was to download the file.
 *
 * This answers the question BEFORE the download, from the same `wrapLines`
 * the export wraps with, so the warning and the wrap can never disagree. It
 * returns facts, not a sentence — the canvas badge and the inspector word it
 * differently and neither should own the arithmetic.
 *
 * `null` means the box is fine, so a caller can write `if (fit)`.
 */
export interface TextFit {
  /** How many lines the words actually take at this width. */
  lines: number;
  /** How tall the words need the box to be. */
  neededH: number;
  /** The box's own height. */
  boxH: number;
  /** The words wrapped onto more than one line. */
  wrapped: boolean;
  /** The words need more height than the box has. */
  overflows: boolean;
  /** One word on its own is wider than the box — no wrap can save it. */
  wordTooWide: boolean;
}

export function textFit(layer: TextLayer): TextFit | null {
  if (layer.kind !== "text") return null;
  const size = Math.max(1, layer.size || 24);
  const w = Math.max(1, layer.w);
  const content = applyCase(layer.content || "", layer.textCase);
  if (!content.trim()) return null;
  const family0 = familyOf(layer.font || DEFAULT_FONTS[0]);
  const lines = wrapLines(content, w, size, layer.weight, family0, layer.letterSpacing || 0);
  const lineHeight = layer.lineHeight || 1.2;
  const neededH = Math.round(size * 1.05 + (lines.length - 1) * size * lineHeight + size * 0.4);
  const boxH = Math.max(0, Number(layer.h) || 0);
  // A single word wider than the box cannot be wrapped out of trouble, and it
  // is the one case where making the box taller does not help — so it is
  // reported apart from plain overflow rather than folded into it.
  const bold = Number(layer.weight) >= 600 || layer.weight === "bold";
  // R5-B: against the BOX, which is the same edge the wrap now respects. It
  // used to be the box less a side-bearing allowance, and that allowance is
  // gone — see `textEffects.wrapLines`. A warning that fires on a word which
  // actually fits is a warning an author learns to ignore.
  const widest = content.split(/\s+/).reduce(
    (max, word) => Math.max(max, measureRun(family0, word, size, bold, layer.letterSpacing || 0)),
    0,
  );
  const packable = Math.max(1, w);
  const fit: TextFit = {
    lines: lines.length,
    neededH,
    boxH,
    wrapped: lines.length > 1,
    overflows: boxH > 0 && neededH > boxH + 1,
    wordTooWide: widest > packable + 1,
  };
  return fit;
}

/** The one sentence the canvas badge and the inspector both show. */
export function textFitWarning(layer: TextLayer): string | null {
  const fit = textFit(layer);
  if (!fit) return null;
  if (fit.wordTooWide) return "A word is wider than this box — widen it or use a smaller size.";
  if (fit.overflows) return `These words need ${fit.neededH} px of height and the box is ${Math.round(fit.boxH)} px.`;
  return null;
}

// Canva-style text presets — sized for a 1080 canvas; addTextLayer scales
// them relative to the current canvas width.
export { iconToSvg };

const TEXT_PRESETS = {
  heading:    { label: "Add a heading",    size: 84, weight: "700" },
  subheading: { label: "Add a subheading", size: 48, weight: "600" },
  body:       { label: "Add body text",    size: 30, weight: "400" },
} as const;
export type TextPresetKey = keyof typeof TEXT_PRESETS;

// L3 (locked 2026-07-22): chart element for infographics — enter numbers →
// bar/donut/line rendered in brand colors, pure code (no chart.js). The
// server renderer (templateStudio.js emitChartLayer) draws the SAME
// geometry for exports — keep the two in lockstep.
export interface ChartLayer extends BaseLayer {
  kind: "chart";
  chart: "bar" | "donut" | "line";
  /**
   * One row per mark. `colour` is THAT MARK'S own colour (G-10): design 08
   * wanted the last bar picked out in the brand teal and the rest in a
   * neutral, and a cycle cannot say that. A row with no colour falls back to
   * the cycle, so nothing that was stored before this field changes at all.
   */
  values: Array<{ label?: string; value: number; colour?: string }>;
  colors?: string[];
  /**
   * R4-D: one brand colour, and every mark that was NOT picked out drawn in a
   * tint of it. See `rampColour`.
   */
  ramp?: string | null;
  /**
   * Print the number on the mark (G-10). Canva calls it a value label, and
   * without it a bar chart on a slide is a shape with no reading.
   */
  showValues?: boolean;
  /** Written before and after the number: "$" and "k", "" and "%". */
  valuePrefix?: string;
  valueSuffix?: string;
}

/**
 * The value written on a mark. One function, so the editor and the exporter
 * cannot round the same number two ways.
 *
 * Whole numbers stay whole; anything else keeps one decimal. A chart is read at
 * a glance and "12.4" reads; "12.4375" is noise on a bar.
 */
export function formatChartValue(value: number, prefix?: string, suffix?: string): string {
  const n = Number(value) || 0;
  const body = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${prefix || ""}${body}${suffix || ""}`;
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | ChartLayer;

/**
 * ONE SIDE OF A DESIGN — a card front, a card back, slide two.
 *
 * Every page is the same size as the design; a leaflet whose second side is a
 * different shape is two designs, not one, and pretending otherwise would put
 * a width on a page and then have to answer what the DESIGN's width means.
 */
export interface CanvasPage {
  background_color?: string | null;
  background_gradient?: GradientSpec | null;
  layers: Layer[];
}

/**
 * ── MULTIPLE PAGES, WITHOUT BREAKING ONE STORED DESIGN (G-09) ─────────────
 *
 * Round 1 had to deliver design 05 as TWO FILES, "because a design has exactly
 * one artboard" — and a business card without its back is half a business
 * card.
 *
 * The obvious model is `pages: [page1, page2]` and it is the wrong one HERE,
 * for the same reason grouping is a tag and not a container: four painters
 * read this shape (Fabric, LUMEN's SVG exporter, the PDF writer, the gallery
 * thumbnail) and a design stored in a shape a painter does not understand is a
 * design that OPENS BLANK. Every design in the database today, and every
 * template, is the old shape.
 *
 * So PAGE ONE STAYS EXACTLY WHERE IT IS — in `layers`, `background_color` and
 * `background_gradient` on the document itself — and `pages` carries pages two
 * onward. An old painter reading a two-page design draws page one, which is
 * the right thing to draw and is what it did yesterday. A new painter asks
 * `pageAt(doc, i)` and never touches either field directly. Nothing migrates,
 * nothing opens blank, and the ugliness is confined to six functions below
 * that are the only code allowed to know about it.
 */
export interface CanvasDoc {
  version: 1;
  width: number;
  height: number;
  background_color?: string | null;
  /** Overrides background_color when present (ignored on transparent). */
  background_gradient?: GradientSpec | null;
  /** PAGE ONE's layers. See the note above before touching this. */
  layers: Layer[];
  /** Pages TWO onward. Absent or empty means a one-page design. */
  pages?: CanvasPage[];
}

/**
 * A card has two sides and a short deck has a dozen slides. Twenty is well
 * past either, and it is a ceiling rather than an ambition. LUMEN's
 * `templateStudio.MAX_PAGES` is the same number and both suites assert it.
 */
export const MAX_PAGES = 20;

/** How many sides this design has. Always at least one. */
export function pageCount(doc: CanvasDoc): number {
  return 1 + (Array.isArray(doc.pages) ? doc.pages.length : 0);
}

/** Page `index` (0-based) as a plain page, or page one for anything out of range. */
export function pageAt(doc: CanvasDoc, index: number): CanvasPage {
  if (index <= 0 || !Array.isArray(doc.pages) || index > doc.pages.length) {
    return {
      background_color: doc.background_color,
      background_gradient: doc.background_gradient,
      layers: doc.layers,
    };
  }
  return doc.pages[index - 1];
}

/** Page `index` as a one-page document — what every existing painter wants. */
export function docForPage(doc: CanvasDoc, index: number): CanvasDoc {
  const page = pageAt(doc, index);
  return {
    version: 1,
    width: doc.width,
    height: doc.height,
    background_color: page.background_color,
    background_gradient: page.background_gradient,
    layers: page.layers,
  };
}

/** Put a page back. Page one writes the document's own fields. */
export function setPage(doc: CanvasDoc, index: number, page: CanvasPage): CanvasDoc {
  if (index <= 0) {
    return {
      ...doc,
      background_color: page.background_color,
      background_gradient: page.background_gradient,
      layers: page.layers,
    };
  }
  const rest = Array.isArray(doc.pages) ? [...doc.pages] : [];
  if (index > rest.length) return doc;
  rest[index - 1] = page;
  return { ...doc, pages: rest };
}

/** A new blank side, added at the end. Returns the new page's index. */
export function addPage(doc: CanvasDoc): { doc: CanvasDoc; index: number } {
  const rest = Array.isArray(doc.pages) ? [...doc.pages] : [];
  rest.push({ background_color: doc.background_color, background_gradient: doc.background_gradient, layers: [] });
  return { doc: { ...doc, pages: rest }, index: rest.length };
}

/** A copy of one side, placed straight after it. Every layer gets a fresh id. */
export function duplicatePage(doc: CanvasDoc, index: number): { doc: CanvasDoc; index: number } {
  const source = pageAt(doc, index);
  const copy: CanvasPage = {
    background_color: source.background_color,
    background_gradient: source.background_gradient,
    // Fresh ids: two pages sharing a layer id would make "select this layer"
    // ambiguous the first time somebody edited either side.
    layers: source.layers.map((l) => ({ ...l, id: uid(l.kind) })),
  };
  const rest = Array.isArray(doc.pages) ? [...doc.pages] : [];
  rest.splice(Math.max(0, index), 0, copy);
  return { doc: { ...doc, pages: rest }, index: Math.max(0, index) + 1 };
}

/**
 * Drop a side.
 *
 * Removing PAGE ONE promotes page two into the document's own fields rather
 * than refusing, because "I do not want this side any more" is the same wish
 * whichever side is showing. A one-page design is returned unchanged: a design
 * with no pages at all is not a thing the editor can open.
 */
export function removePage(doc: CanvasDoc, index: number): CanvasDoc {
  if (pageCount(doc) <= 1) return doc;
  const rest = Array.isArray(doc.pages) ? [...doc.pages] : [];
  if (index <= 0) {
    const promoted = rest.shift();
    if (!promoted) return doc;
    return {
      ...doc,
      background_color: promoted.background_color,
      background_gradient: promoted.background_gradient,
      layers: promoted.layers,
      pages: rest,
    };
  }
  if (index > rest.length) return doc;
  rest.splice(index - 1, 1);
  return { ...doc, pages: rest };
}

/** Move a side up or down the strip. */
export function movePage(doc: CanvasDoc, from: number, to: number): CanvasDoc {
  const n = pageCount(doc);
  if (from === to || from < 0 || to < 0 || from >= n || to >= n) return doc;
  const all: CanvasPage[] = [];
  for (let i = 0; i < n; i++) all.push(pageAt(doc, i));
  const [moved] = all.splice(from, 1);
  all.splice(to, 0, moved);
  const [first, ...rest] = all;
  return {
    ...doc,
    background_color: first.background_color,
    background_gradient: first.background_gradient,
    layers: first.layers,
    pages: rest,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Empty picture slots (parity D-6)
   ══════════════════════════════════════════════════════════════════════════ */

/** One empty slot, named the way a person would point at it. */
export interface EmptySlot {
  /** Which side it is on, 0-based. */
  page: number;
  id: string;
  /** "the logo slot", "the picture at 120 × 340". */
  where: string;
}

/**
 * EVERY VISIBLE PICTURE SLOT WITH NOTHING IN IT.
 *
 * Round 1: *"'Leave an empty slot for now' draws a grey slot with instructions
 * on the canvas and writes no ink into the PNG. That is defensible, but nothing
 * says so before the download."*
 *
 * It is not defensible, actually — it is a silent drop, and a silent drop is
 * the failure a design tool can least afford, because the author does not find
 * out until the flyer is at the printer. Exporting the grey instruction box
 * would be worse: then the slot ships. So the download REFUSES and says which
 * slot, and this function is the one that knows which.
 *
 * A hidden slot is not counted: hiding a layer is how an author says "not this
 * one", and refusing over something they have already put away would be the
 * tool arguing.
 */
export function emptyPictureSlots(doc: CanvasDoc): EmptySlot[] {
  const out: EmptySlot[] = [];
  for (let p = 0; p < pageCount(doc); p++) {
    for (const layer of pageAt(doc, p).layers) {
      if (layer.kind !== "image") continue;
      if (layer.visible === false) continue;
      const il = layer as ImageLayer;
      if (il.src || il.blob_ref) continue;
      const isLogo = /logo/i.test(String(il.id || ""));
      out.push({
        page: p,
        id: il.id,
        where: isLogo ? "the logo slot" : `the picture slot at ${Math.round(il.x)} × ${Math.round(il.y)}`,
      });
    }
  }
  return out;
}

/**
 * The plain sentence a refused download shows, or null when it may go ahead.
 *
 * The SAME WORDS are built server-side by `templateStudio.emptySlotMessage`,
 * so a person who hits this from the browser and a person who hits it from a
 * scheduled render read one message rather than two.
 */
export function emptySlotMessage(doc: CanvasDoc): string | null {
  const slots = emptyPictureSlots(doc);
  if (!slots.length) return null;
  const multi = pageCount(doc) > 1;
  const named = slots.map((s) => (multi ? `${s.where} on page ${s.page + 1}` : s.where));
  const list = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `This design still has ${named.length === 1 ? "an empty picture slot" : "empty picture slots"}: ${list}. ` +
    `An empty slot downloads as nothing at all, so add a picture or delete the slot, then try again.`;
}

export interface TemplateDto {
  template_id: string;
  tenant_id: string | null;
  name: string;
  kind: string;
  canvas: CanvasDoc | null;
  thumbnail_blob_ref: string | null;
  tags: string[];
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface DesignDto {
  design_id: string;
  tenant_id: string;
  template_id: string | null;
  name: string | null;
  canvas: CanvasDoc | null;
  export_asset_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportResult {
  assetId: string;
  blobRef: string;
  byteSize: number;
  dimensions: string;
  width: number;
  height: number;
}
function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// Brand font pack — six bundled OFL faces loaded via @fontsource here and
// shipped as TTFs in LUMEN assets/fonts for export parity (real typography
// is most of the distance between amateur and professional output). A few
export { uid };

const BLANK_CANVAS_DEFAULTS: CanvasDoc = {
  version: 1,
  width: 1080,
  height: 1080,
  background_color: "#FFFFFF",
  layers: [],
};

function emptyCanvas(width = 1080, height = 1080): CanvasDoc {
  return {
    version: 1,
    width,
    height,
    background_color: "#FFFFFF",
    layers: [],
  };
}
export { BLANK_CANVAS_DEFAULTS, emptyCanvas };

// ── Platform size presets + Smart Resize (re-cut §8b, Pro+) ────────────────
// One design → every platform size. Deterministic anchor-based relayout:
// content scales uniformly; layers hugging an edge keep their (scaled)
// margin to that edge, full-bleed bands re-stretch, everything else keeps
// its proportional center. No model call — this is a bucket-2 Smart Tool.
export const SIZE_PRESETS = [
  { key: "ig_post",       label: "Instagram post",   w: 1080, h: 1080 },
  { key: "ig_story",      label: "Instagram story",  w: 1080, h: 1920 },
  { key: "fb_post",       label: "Facebook post",    w: 1200, h: 630 },
  { key: "fb_cover",      label: "Facebook cover",   w: 820,  h: 312 },
  { key: "li_post",       label: "LinkedIn post",    w: 1200, h: 627 },
  { key: "li_banner",     label: "LinkedIn banner",  w: 1584, h: 396 },
  { key: "flyer",         label: "Flyer (Letter)",   w: 1275, h: 1650 },
  { key: "business_card", label: "Business card",    w: 1050, h: 600 },
  { key: "email_header",  label: "Email header",     w: 1200, h: 400 },
  // G-11. Four of the ten reference designs are sizes the list did not carry:
  // a 16:9 presentation slide, a YouTube thumbnail, a landscape Letter gift
  // certificate and the 4:5 portrait post every social planner asks for.
  { key: "ig_portrait",   label: "Instagram portrait", w: 1080, h: 1350 },
  { key: "slide_16_9",    label: "Presentation slide", w: 1920, h: 1080 },
  { key: "thumbnail",     label: "Video thumbnail",    w: 1280, h: 720 },
  { key: "letter_land",   label: "Letter, landscape",  w: 1650, h: 1275 },
  { key: "a4_portrait",   label: "A4 portrait",        w: 1240, h: 1754 },
  { key: "a4_landscape",  label: "A4 landscape",       w: 1754, h: 1240 },
] as const;

export type SizePresetKey = (typeof SIZE_PRESETS)[number]["key"];

/**
 * The two presets that are a PHYSICAL piece of paper rather than a screen, and
 * how big that piece of paper is. ONE place, read by the PDF export (`pdf.ts`)
 * so a printed flyer comes out Letter-sized.
 *
 * Everything else is a screen: 96 CSS pixels to the inch, which is where a
 * 1080-pixel square's 11.25 in comes from. These two are not — 1275×1650 is
 * 8.5×11 in at 150 dpi and 1050×600 is 3.5×2 in at 300 dpi, which is exactly
 * why those numbers were chosen. Keyed by the preset KEY, never by the pixels,
 * so the two facts cannot drift apart; test/mybrand-studio.test.mjs checks that
 * the inches and the pixels still describe the same rectangle.
 */
export const PRINT_INCHES: Partial<Record<SizePresetKey, { inches: readonly [number, number]; label: string }>> = {
  flyer:         { inches: [8.5, 11], label: "Letter" },
  business_card: { inches: [3.5, 2],  label: "Business card" },
  letter_land:   { inches: [11, 8.5], label: "Letter, landscape" },
  // A4 is 210 × 297 MILLIMETRES, so its inches are not round numbers and the
  // pixels cannot be an exact whole-dpi multiple of them. The full figures are
  // here because the PDF page is cut from them; the menu rounds them.
  a4_portrait:   { inches: [8.2677, 11.6929], label: "A4" },
  a4_landscape:  { inches: [11.6929, 8.2677], label: "A4, landscape" },
};

/**
 * A custom size a person typed. The Resize dialog refuses anything the SERVER
 * would refuse — `templateStudio.js` caps an export at 6000 px a side — so a
 * design cannot be authored at a size that can never be downloaded.
 */
export const MAX_CANVAS_SIDE = 6000;
export const MIN_CANVAS_SIDE = 40;

export function clampCanvasSide(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MIN_CANVAS_SIDE;
  return Math.min(MAX_CANVAS_SIDE, Math.max(MIN_CANVAS_SIDE, n));
}

const EDGE_ZONE = 0.18; // a layer whose center sits in the outer 18% is edge-anchored

export function smartResize(doc: CanvasDoc, newW: number, newH: number): CanvasDoc {
  const W = doc.width, H = doc.height;
  if (W <= 0 || H <= 0 || newW <= 0 || newH <= 0) return doc;
  const s = Math.min(newW / W, newH / H); // uniform content scale
  const layers = doc.layers.map((l) => {
    const w = l.w * s;
    const h = l.h * s;
    const cx = l.x + l.w / 2;
    const cy = l.y + l.h / 2;
    // Full-bleed bands re-stretch along the axis they span.
    const spansW = l.w >= W * 0.98;
    const spansH = l.h >= H * 0.98;
    // Horizontal placement.
    let newCx: number;
    if (spansW) newCx = newW / 2;
    else if (cx < W * EDGE_ZONE) newCx = cx * s;                    // keep left margin
    else if (cx > W * (1 - EDGE_ZONE)) newCx = newW - (W - cx) * s; // keep right margin
    else newCx = (cx / W) * newW;                                   // proportional
    // Vertical placement.
    let newCy: number;
    if (spansH) newCy = newH / 2;
    else if (cy < H * EDGE_ZONE) newCy = cy * s;
    else if (cy > H * (1 - EDGE_ZONE)) newCy = newH - (H - cy) * s;
    else newCy = (cy / H) * newH;
    const outW = spansW ? newW : w;
    const outH = spansH ? newH : h;
    const next: Layer = {
      ...JSON.parse(JSON.stringify(l)),
      x: Math.round(newCx - outW / 2),
      y: Math.round(newCy - outH / 2),
      w: Math.round(outW),
      h: Math.round(outH),
    };
    if (next.kind === "text") {
      (next as TextLayer).size = Math.max(6, Math.round(((l as TextLayer).size ?? 24) * s));
      if ((l as TextLayer).letterSpacing) {
        (next as TextLayer).letterSpacing = Math.round((l as TextLayer).letterSpacing! * s * 10) / 10;
      }
    }
    if (next.kind === "shape" && (l as ShapeLayer).strokeWidth) {
      (next as ShapeLayer).strokeWidth = Math.max(1, Math.round((l as ShapeLayer).strokeWidth! * s));
    }
    if (next.kind === "shape" && (l as ShapeLayer).radius) {
      (next as ShapeLayer).radius = Math.max(0, Math.round((l as ShapeLayer).radius! * s));
    }
    return next;
  });
  return { ...doc, width: newW, height: newH, layers };
}
// ── Client-side chart → SVG (mirror of the server emitChartLayer) ─────────
// Renders at the layer's own w×h with origin 0,0; Fabric positions the
// resulting image. New charts default to the IA palette cycle in the
// editor; the server export resolves the cycle against the tenant's real
// brand palette, so exports are always brand-true.
// A new chart cycles the brand pair first, then neutrals. The first two used
// to be IA navy and IA gold written out, on a CLIENT's chart.
const CHART_DEFAULT_CYCLE = [FALLBACK.primary, FALLBACK.secondary, "#64748B", "#94A3B8", "#CBD5E1", "#475569"];

/* ══════════════════════════════════════════════════════════════════════════
   THE REST OF THE BARS, IN THE BRAND'S OWN COLOUR — ROUND-5 R4-D
   ══════════════════════════════════════════════════════════════════════════

   Design 08 picks one bar out in the brand teal and leaves the other three
   quiet. Until now "quiet" meant the cycle's neutrals — #64748B, #94A3B8,
   #CBD5E1 — which are a cold blue-grey, and the only way to get the
   reference's pale teal was to type a hex into every unpicked row by hand.

   A RAMP is the thing that was missing: one brand colour, and the rest of the
   marks in tints of it, palest at the start and deepest at the end, so a chart
   reads as one family instead of a highlight sitting on somebody else's greys.

   The two ends are 0.72 and 0.28 of the way to white. 0.72 is as pale as a
   mark can go and still hold an edge against white paper; 0.28 is as deep as
   the quiet marks can go before they compete with a mark that was picked out
   in the full colour. A row with its OWN colour is untouched, so picking one
   bar out still works exactly as it did.

   `tintTowardWhite` and these two numbers are mirrored in LUMEN's
   `templateStudio.js`, and both suites assert the same worked hex.
*/
export const RAMP_PALEST = 0.72;
export const RAMP_DEEPEST = 0.28;

/** A hex colour mixed `amount` of the way to white. Anything else comes back. */
export function tintTowardWhite(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return hex;
  const t = Math.max(0, Math.min(1, Number(amount) || 0));
  const n = parseInt(m[1], 16);
  const mix = (c: number) => Math.round(c + (255 - c) * t);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** The `index`-th of `count` marks, in a ramp of tints of `base`. */
export function rampColour(base: string, index: number, count: number): string {
  const n = Math.max(1, Math.floor(count));
  if (n === 1) return tintTowardWhite(base, RAMP_DEEPEST);
  const step = (RAMP_PALEST - RAMP_DEEPEST) / (n - 1);
  return tintTowardWhite(base, RAMP_PALEST - step * Math.max(0, Math.min(n - 1, index)));
}

export function chartToSvg(layer: ChartLayer): string {
  const w = layer.w, h = layer.h;
  const values = (layer.values || []).map((v) => ({
    label: String(v.label ?? ""),
    value: Math.max(0, Number(v.value) || 0),
  }));
  const cycle = layer.colors?.length ? layer.colors : CHART_DEFAULT_CYCLE;
  // G-10: a row's OWN colour wins over the cycle, so one bar can be picked out.
  // R4-D: with a ramp set, everything that has NOT been picked out is a tint of
  // the ramp colour rather than the cycle's cold neutrals.
  const ramp = layer.ramp && layer.ramp !== "none" ? layer.ramp : null;
  const color = (i: number) => (layer.values || [])[i]?.colour
    || (ramp ? rampColour(ramp, i, (layer.values || []).length) : cycle[i % cycle.length]);
  const labelSize = Math.max(10, Math.round(Math.min(w, h) * 0.055));
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts: string[] = [];
  if (!values.length || w <= 0 || h <= 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;
  const showValues = layer.showValues === true;
  const valueSize = Math.max(9, Math.round(labelSize * 0.92));

  if (layer.chart === "bar") {
    const labelBand = labelSize * 1.6;
    // G-10: the number sits ABOVE the bar, so the plot has to give up a band
    // at the top or the tallest bar's own label is drawn off the picture.
    const valueBand = showValues ? valueSize * 1.35 : 0;
    const plotH = Math.max(1, h - labelBand);
    const barTop = valueBand;
    const max = Math.max(...values.map((v) => v.value), 1);
    const slot = w / values.length;
    const barW = slot * 0.68;
    values.forEach((v, i) => {
      const barH = (v.value / max) * (plotH - barTop);
      const bx = i * slot + (slot - barW) / 2;
      parts.push(`<rect x="${bx}" y="${plotH - barH}" width="${barW}" height="${barH}" rx="${Math.min(6, barW / 6)}" fill="${color(i)}" />`);
      if (showValues) {
        parts.push(`<text x="${bx + barW / 2}" y="${plotH - barH - valueSize * 0.4}" font-family="sans-serif" font-size="${valueSize}" font-weight="600" fill="#111827" text-anchor="middle">${esc(formatChartValue(v.value, layer.valuePrefix, layer.valueSuffix))}</text>`);
      }
      if (v.label) parts.push(`<text x="${bx + barW / 2}" y="${plotH + labelSize * 1.15}" font-family="sans-serif" font-size="${labelSize}" fill="#111827" text-anchor="middle">${esc(v.label)}</text>`);
    });
  } else if (layer.chart === "donut") {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) / 2 * 0.92;
    const ring = r * 0.38;
    const rMid = r - ring / 2;
    const total = values.reduce((a, v) => a + v.value, 0) || 1;
    const circ = 2 * Math.PI * rMid;
    let offset = 0;
    values.forEach((v, i) => {
      const frac = v.value / total;
      const dash = Math.max(0, frac * circ - 1.5);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${rMid}" fill="none" stroke="${color(i)}" stroke-width="${ring}" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-offset * circ}" transform="rotate(-90 ${cx} ${cy})" />`);
      offset += frac;
    });
  } else {
    const hasLabels = values.some((v) => v.label);
    const labelBand = hasLabels ? labelSize * 1.6 : 0;
    const plotH = Math.max(1, h - labelBand);
    const max = Math.max(...values.map((v) => v.value), 1);
    const stepX = values.length > 1 ? w / (values.length - 1) : 0;
    const pts = values.map((v, i) => ({
      px: values.length > 1 ? i * stepX : w / 2,
      py: plotH - (v.value / max) * plotH * 0.92,
    }));
    parts.push(`<polyline points="${pts.map((p) => `${p.px},${p.py}`).join(" ")}" fill="none" stroke="${color(0)}" stroke-width="${Math.max(2, Math.round(Math.min(w, h) * 0.012))}" stroke-linejoin="round" stroke-linecap="round" />`);
    pts.forEach((p, i) => {
      parts.push(`<circle cx="${p.px}" cy="${p.py}" r="${Math.max(3, Math.round(Math.min(w, h) * 0.016))}" fill="${color(i)}" />`);
      if (showValues) {
        parts.push(`<text x="${p.px}" y="${p.py - valueSize * 0.8}" font-family="sans-serif" font-size="${valueSize}" font-weight="600" fill="#111827" text-anchor="middle">${esc(formatChartValue(values[i].value, layer.valuePrefix, layer.valueSuffix))}</text>`);
      }
      if (values[i].label) parts.push(`<text x="${p.px}" y="${plotH + labelSize * 1.15}" font-family="sans-serif" font-size="${labelSize}" fill="#111827" text-anchor="middle">${esc(values[i].label)}</text>`);
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join("")}</svg>`;
}

/** True when the canvas has no backdrop (logo/icon mode) — exports keep alpha. */
function isTransparent(doc: CanvasDoc): boolean {
  return doc.background_color == null || String(doc.background_color).toLowerCase() === "transparent";
}
export { isTransparent };

/* ══════════════════════════════════════════════════════════════════════════
   Operations — every one returns a NEW scene
   ══════════════════════════════════════════════════════════════════════════ */

export { TEXT_PRESETS };

/** Add layers on top of the stack. */
export function addLayers(doc: CanvasDoc, layers: Layer[]): CanvasDoc {
  if (!layers.length) return doc;
  return { ...doc, layers: [...doc.layers, ...layers] };
}

/** Add layers UNDER everything — what a background is for. */
export function addLayersBehind(doc: CanvasDoc, layers: Layer[]): CanvasDoc {
  if (!layers.length) return doc;
  return { ...doc, layers: [...layers, ...doc.layers] };
}

export function patchLayer(doc: CanvasDoc, id: string, patch: Partial<Layer>): CanvasDoc {
  return { ...doc, layers: doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function removeLayer(doc: CanvasDoc, id: string): CanvasDoc {
  return { ...doc, layers: doc.layers.filter((l) => l.id !== id) };
}

export function duplicateLayer(doc: CanvasDoc, id: string): { doc: CanvasDoc; id: string | null } {
  const src = doc.layers.find((l) => l.id === id);
  if (!src) return { doc, id: null };
  const copy: Layer = {
    ...(JSON.parse(JSON.stringify(src)) as Layer),
    id: uid(src.kind),
    x: (src.x || 0) + 20,
    y: (src.y || 0) + 20,
  };
  return { doc: { ...doc, layers: [...doc.layers, copy] }, id: copy.id };
}

/** "up" moves toward the front — later in the array is painted on top. */
export function reorderLayer(doc: CanvasDoc, id: string, direction: "up" | "down"): CanvasDoc {
  const idx = doc.layers.findIndex((l) => l.id === id);
  if (idx === -1) return doc;
  const to = direction === "up" ? Math.min(doc.layers.length - 1, idx + 1) : Math.max(0, idx - 1);
  if (to === idx) return doc;
  const next = [...doc.layers];
  const [moved] = next.splice(idx, 1);
  next.splice(to, 0, moved);
  return { ...doc, layers: next };
}

export function toggleLayerVisibility(doc: CanvasDoc, id: string): CanvasDoc {
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.id === id ? { ...l, visible: l.visible === false } : l)),
  };
}

export function setBackgroundColor(doc: CanvasDoc, colour: string): CanvasDoc {
  return { ...doc, background_color: colour, background_gradient: null };
}

export function setBackgroundGradient(doc: CanvasDoc, gradient: GradientSpec | null): CanvasDoc {
  return { ...doc, background_gradient: gradient };
}

/** Align one layer's box to the canvas. The inspector's six buttons, as data. */
export function alignLayer(
  doc: CanvasDoc,
  id: string,
  which: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom",
): CanvasDoc {
  const l = doc.layers.find((x) => x.id === id);
  if (!l) return doc;
  if (which === "left") return patchLayer(doc, id, { x: 0 });
  if (which === "hcenter") return patchLayer(doc, id, { x: Math.round((doc.width - l.w) / 2) });
  if (which === "right") return patchLayer(doc, id, { x: Math.round(doc.width - l.w) });
  if (which === "top") return patchLayer(doc, id, { y: 0 });
  if (which === "vcenter") return patchLayer(doc, id, { y: Math.round((doc.height - l.h) / 2) });
  return patchLayer(doc, id, { y: Math.round(doc.height - l.h) });
}

/* ══════════════════════════════════════════════════════════════════════════
   Arranging more than one thing — G-01
   ══════════════════════════════════════════════════════════════════════════

   Canva's Arrange panel, as pure functions over an ID LIST. Three of the ten
   reference designs are impossible without them: a rotated sticker made of a
   ring and a word, two display lines that must turn as one, and a medallion of
   three parts.

   Every one of these takes `ids` and not a single id, and every one returns a
   new scene. The editor holds the selection; the scene holds the grouping tag.
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Box { x: number; y: number; w: number; h: number }

/** The one rectangle that contains all of them. Null when nothing matches. */
export function boundsOf(doc: CanvasDoc, ids: string[]): Box | null {
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  if (!picked.length) return null;
  const x1 = Math.min(...picked.map((l) => l.x));
  const y1 = Math.min(...picked.map((l) => l.y));
  const x2 = Math.max(...picked.map((l) => l.x + l.w));
  const y2 = Math.max(...picked.map((l) => l.y + l.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/* ══════════════════════════════════════════════════════════════════════════
   WHERE A TURNED LAYER IS PINNED (round-3 R2-G)
   ══════════════════════════════════════════════════════════════════════════

   Design 10's second arch — 620 × 620 at (1150, −120), turned 180° — never
   drew in the editor, while the identical arch at 0° drew fine. It was not the
   arch: EVERY turned layer has been in the wrong place since the studio was
   written, and 180° is simply the angle at which "wrong place" becomes "off
   the paper entirely".

   The two halves hold two different conventions and neither was written down:

     • the SCENE (and LUMEN's `rotationAttr`) says x,y is the UNTURNED
       top-left of the box and the turn pivots on the box's CENTRE;
     • FABRIC pins the origin point — with the default left/top origin, the
       (left, top) CORNER stays exactly where it is and the body swings round
       it. `translateToCenterPoint` rotates the centre about that corner, which
       is the line of Fabric this whole defect lives in.

   At 180° the body swings a full width up and a full height left: the arch was
   painted at (530, −740), entirely above the page. At 15° it was out by a
   handful of pixels, which is why round 1 and round 2 both put "rotate them
   one at a time and nudge" in the notes instead of naming a bug.

   So the scene's convention wins — it is the one the server, the PDF and the
   stored document already use — and these two functions convert. They are
   exact inverses, they are the identity at 0°, and the unturned path therefore
   comes out byte-identical to what it was. */

/** The scene's box → the `left`/`top` Fabric must be given to land on it. */
export function rotatedTopLeft(x: number, y: number, w: number, h: number, deg: number): { left: number; top: number } {
  const a = ((Number(deg) || 0) * Math.PI) / 180;
  const hx = (Number(w) || 0) / 2;
  const hy = (Number(h) || 0) / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    left: x + hx - (hx * cos - hy * sin),
    top: y + hy - (hx * sin + hy * cos),
  };
}

/** Fabric's `left`/`top` → the scene's box. The exact inverse of the above. */
export function modelTopLeft(left: number, top: number, w: number, h: number, deg: number): { x: number; y: number } {
  const a = ((Number(deg) || 0) * Math.PI) / 180;
  const hx = (Number(w) || 0) / 2;
  const hy = (Number(h) || 0) / 2;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    x: left - hx + (hx * cos - hy * sin),
    y: top - hy + (hx * sin + hy * cos),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   A GROUP HAS A SIZE, A PLACE AND AN ANGLE (round-3 R2-E)
   ══════════════════════════════════════════════════════════════════════════

   Round 1 asked for it and round 2 did not build it: a multi-selection could
   be aligned, distributed and tidied, but it could not be typed a number. So
   design 07's two display lines had to be turned one at a time BEFORE they
   were grouped, which is the author doing by hand the one thing a group is
   for.

   Three pure functions, because "move the selection" is scene arithmetic and
   not a React concern. Each takes the ids and returns a whole new scene. */

/** The angle every member shares, or null when they disagree. */
export function selectionRotation(doc: CanvasDoc, ids: string[]): number | null {
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  if (!picked.length) return null;
  const first = Math.round(((((picked[0].rotation || 0) % 360) + 360) % 360));
  for (const l of picked) {
    if (Math.round(((((l.rotation || 0) % 360) + 360) % 360)) !== first) return null;
  }
  return first;
}

/**
 * Put the whole selection in a new box.
 *
 * Moving is a translation; resizing scales each member's own box about the
 * selection's top-left, INCLUDING its width and height, so the arrangement
 * survives — five things in a row stay five things in a row. A text layer's
 * point size rides the vertical scale, the same rule `PixelCanvas` already
 * applies when a set is dragged by its handles, so typing 50 % into W and H is
 * the same act as halving it with the mouse.
 */
export function setSelectionBox(doc: CanvasDoc, ids: string[], box: Partial<Box>): CanvasDoc {
  const from = boundsOf(doc, ids);
  if (!from) return doc;
  const toW = Math.max(1, Math.round(Number(box.w ?? from.w)));
  const toH = Math.max(1, Math.round(Number(box.h ?? from.h)));
  const toX = Math.round(Number(box.x ?? from.x));
  const toY = Math.round(Number(box.y ?? from.y));
  const sx = toW / Math.max(1, from.w);
  const sy = toH / Math.max(1, from.h);
  if (sx === 1 && sy === 1 && toX === from.x && toY === from.y) return doc;
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!ids.includes(l.id)) return l;
      const next: Layer = {
        ...l,
        x: Math.round(toX + (l.x - from.x) * sx),
        y: Math.round(toY + (l.y - from.y) * sy),
        w: Math.max(1, Math.round(l.w * sx)),
        h: Math.max(0, Math.round(l.h * sy)),
      };
      if (next.kind === "text" && sy !== 1) {
        (next as TextLayer).size = Math.max(6, Math.round(((l as TextLayer).size ?? 24) * sy));
      }
      return next;
    }),
  };
}

/**
 * Turn the whole selection to an angle.
 *
 * Every member's own angle moves by the SAME delta and its centre orbits the
 * selection's centre by that delta — which is what turning one object made of
 * several parts means. `from` is the angle the panel was showing, so the delta
 * is what the author actually changed; a selection whose members disagree
 * shows 0 and is turned relative to that, which is the only honest reading of
 * "turn these by".
 */
export function turnSelection(doc: CanvasDoc, ids: string[], to: number, from = 0): CanvasDoc {
  const delta = (((Math.round(Number(to) || 0) - Math.round(Number(from) || 0)) % 360) + 360) % 360;
  if (!delta) return doc;
  const box = boundsOf(doc, ids);
  if (!box) return doc;
  const a = (delta * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const gx = box.x + box.w / 2;
  const gy = box.y + box.h / 2;
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!ids.includes(l.id)) return l;
      const cx = l.x + l.w / 2 - gx;
      const cy = l.y + l.h / 2 - gy;
      const nx = gx + cx * cos - cy * sin;
      const ny = gy + cx * sin + cy * cos;
      return {
        ...l,
        x: Math.round(nx - l.w / 2),
        y: Math.round(ny - l.h / 2),
        rotation: ((Math.round((l.rotation || 0) + delta) % 360) + 360) % 360,
      };
    }),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   PUTTING A PICTURE INTO A SLOT THAT IS ALREADY THERE (round-3 R2-C)
   ══════════════════════════════════════════════════════════════════════════

   The photo grid lays its cells out correctly and then nothing on either side
   of the screen can fill one: the Media Library and the upload button both add
   a NEW centred layer, and the download then refuses the design for the empty
   slots it can never lose. A built gallery was unreachable.

   Filling a slot is a patch and not an insert — the cell's box, its corner
   radius, its mask and its border are the LAYOUT, and they must survive the
   picture landing in it. That is the whole function, and it is here rather
   than in the component so the rule can be executed by a test. */

export interface SlotAsset {
  src: string;
  asset_id?: string | null;
  blob_ref?: string | null;
}

/** True when this layer is a picture slot waiting for a picture. */
export function isEmptySlot(layer: Layer | null | undefined): boolean {
  return !!layer && layer.kind === "image" && !(layer as ImageLayer).src;
}

/** The first empty slot in the CURRENT page, in stack order. Null when none. */
export function firstEmptySlot(doc: CanvasDoc): ImageLayer | null {
  for (const l of doc.layers) if (isEmptySlot(l)) return l as ImageLayer;
  return null;
}

/** Drop a picture into an existing slot, keeping every layout property of it. */
export function fillPictureSlot(doc: CanvasDoc, id: string, asset: SlotAsset): CanvasDoc {
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer || layer.kind !== "image" || !asset?.src) return doc;
  return patchLayer(doc, id, {
    src: asset.src,
    asset_id: asset.asset_id ?? null,
    blob_ref: asset.blob_ref ?? null,
  } as Partial<Layer>);
}

/**
 * Clicking ONE member of a group selects the whole group — that is what makes
 * a group a group. Locked layers are dropped: a lock has to mean "this cannot
 * move", including when something it was grouped with moves.
 */
export function expandSelection(doc: CanvasDoc, ids: string[]): string[] {
  const wanted = new Set(ids);
  const groups = new Set(
    doc.layers.filter((l) => wanted.has(l.id) && l.groupId).map((l) => l.groupId as string),
  );
  const out: string[] = [];
  for (const l of doc.layers) {
    if (l.locked === true) continue;
    if (wanted.has(l.id) || (l.groupId && groups.has(l.groupId))) out.push(l.id);
  }
  return out;
}

/** Ctrl+G. Two or more layers gain one shared tag; fewer is not a group. */
export function groupLayers(doc: CanvasDoc, ids: string[]): { doc: CanvasDoc; groupId: string | null } {
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  if (picked.length < 2) return { doc, groupId: null };
  const groupId = uid("group");
  return {
    doc: { ...doc, layers: doc.layers.map((l) => (ids.includes(l.id) ? { ...l, groupId } : l)) },
    groupId,
  };
}

/** Ctrl+Shift+G. The tag goes; nothing else about the layers changes. */
export function ungroupLayers(doc: CanvasDoc, ids: string[]): CanvasDoc {
  const groups = new Set(doc.layers.filter((l) => ids.includes(l.id) && l.groupId).map((l) => l.groupId));
  if (!groups.size) return doc;
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!l.groupId || !groups.has(l.groupId)) return l;
      const next = { ...l };
      delete next.groupId;
      return next;
    }),
  };
}

/**
 * Align. ONE thing lines up with the page (that is `alignLayer`); TWO OR MORE
 * line up with each other, inside the box they already occupy — which is what
 * Canva does and what an author means by "line these up".
 */
export function alignLayers(
  doc: CanvasDoc,
  ids: string[],
  which: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom",
): CanvasDoc {
  if (ids.length <= 1) return ids.length === 1 ? alignLayer(doc, ids[0], which) : doc;
  const box = boundsOf(doc, ids);
  if (!box) return doc;
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!ids.includes(l.id)) return l;
      if (which === "left") return { ...l, x: Math.round(box.x) };
      if (which === "hcenter") return { ...l, x: Math.round(box.x + (box.w - l.w) / 2) };
      if (which === "right") return { ...l, x: Math.round(box.x + box.w - l.w) };
      if (which === "top") return { ...l, y: Math.round(box.y) };
      if (which === "vcenter") return { ...l, y: Math.round(box.y + (box.h - l.h) / 2) };
      return { ...l, y: Math.round(box.y + box.h - l.h) };
    }),
  };
}

/**
 * Distribute — equal SPACE between the outer two, which is the honest reading
 * of "space them evenly". Distributing by centre leaves a wide item looking
 * crowded; distributing by gap does not. Three or more, or there is nothing
 * between the ends to space.
 */
export function distributeLayers(doc: CanvasDoc, ids: string[], axis: "h" | "v"): CanvasDoc {
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  if (picked.length < 3) return doc;
  const sorted = [...picked].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
  const start = axis === "h" ? sorted[0].x : sorted[0].y;
  const last = sorted[sorted.length - 1];
  const end = axis === "h" ? last.x + last.w : last.y + last.h;
  const used = sorted.reduce((sum, l) => sum + (axis === "h" ? l.w : l.h), 0);
  const gap = (end - start - used) / (sorted.length - 1);
  const at = new Map<string, number>();
  let cursor = start;
  for (const l of sorted) {
    at.set(l.id, Math.round(cursor));
    cursor += (axis === "h" ? l.w : l.h) + gap;
  }
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const pos = at.get(l.id);
      if (pos == null) return l;
      return axis === "h" ? { ...l, x: pos } : { ...l, y: pos };
    }),
  };
}

/**
 * Tidy up. Canva's one-click "make this look deliberate": pick the axis the
 * things are already strung along, give them one even gap, and line them up on
 * the other axis. The gap is the MEDIAN of the gaps already there, so a tidy
 * keeps the spacing the author was aiming for instead of imposing one.
 */
export function tidyUp(doc: CanvasDoc, ids: string[]): CanvasDoc {
  const picked = doc.layers.filter((l) => ids.includes(l.id));
  if (picked.length < 2) return doc;
  const spanX = Math.max(...picked.map((l) => l.x + l.w)) - Math.min(...picked.map((l) => l.x));
  const spanY = Math.max(...picked.map((l) => l.y + l.h)) - Math.min(...picked.map((l) => l.y));
  const axis: "h" | "v" = spanX >= spanY ? "h" : "v";
  const sorted = [...picked].sort((a, b) => (axis === "h" ? a.x - b.x : a.y - b.y));
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    gaps.push(axis === "h" ? cur.x - (prev.x + prev.w) : cur.y - (prev.y + prev.h));
  }
  const ordered = [...gaps].sort((a, b) => a - b);
  const median = ordered.length % 2
    ? ordered[(ordered.length - 1) / 2]
    : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
  const gap = Math.round(Math.max(0, median));
  // Centre everything on the axis it is NOT strung along.
  const centres = picked.map((l) => (axis === "h" ? l.y + l.h / 2 : l.x + l.w / 2));
  const centre = centres.reduce((a, b) => a + b, 0) / centres.length;
  const at = new Map<string, { x: number; y: number }>();
  let cursor = axis === "h" ? sorted[0].x : sorted[0].y;
  for (const l of sorted) {
    at.set(l.id, axis === "h"
      ? { x: Math.round(cursor), y: Math.round(centre - l.h / 2) }
      : { x: Math.round(centre - l.w / 2), y: Math.round(cursor) });
    cursor += (axis === "h" ? l.w : l.h) + gap;
  }
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      const pos = at.get(l.id);
      return pos ? { ...l, x: pos.x, y: pos.y } : l;
    }),
  };
}

/** Arrow keys. One pixel, or ten with Shift — the same as every design tool. */
export function nudgeLayers(doc: CanvasDoc, ids: string[], dx: number, dy: number): CanvasDoc {
  if (!ids.length || (dx === 0 && dy === 0)) return doc;
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      ids.includes(l.id) && l.locked !== true
        ? { ...l, x: Math.round(l.x + dx), y: Math.round(l.y + dy) }
        : l),
  };
}

/**
 * To front / to back, in one move rather than the N presses of "one step up"
 * the panel offered. Relative order inside the moved set is kept.
 */
export function moveLayersToEdge(doc: CanvasDoc, ids: string[], edge: "front" | "back"): CanvasDoc {
  const moving = doc.layers.filter((l) => ids.includes(l.id));
  if (!moving.length || moving.length === doc.layers.length) return doc;
  const rest = doc.layers.filter((l) => !ids.includes(l.id));
  return { ...doc, layers: edge === "front" ? [...rest, ...moving] : [...moving, ...rest] };
}

/** Drop a layer at an exact index — what dragging a row in Structure means. */
export function moveLayerToIndex(doc: CanvasDoc, id: string, index: number): CanvasDoc {
  const from = doc.layers.findIndex((l) => l.id === id);
  if (from === -1) return doc;
  const to = Math.min(doc.layers.length - 1, Math.max(0, Math.round(index)));
  if (to === from) return doc;
  const next = [...doc.layers];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...doc, layers: next };
}

/**
 * Copy style / format painter (G-13).
 *
 * The LOOK and nothing else: never the words, never the picture, never the
 * position. A paste that moved things would be a paste nobody could undo in
 * their head — which is the whole reason the field list is explicit here
 * rather than "everything except x, y, w, h".
 */
export const TEXT_STYLE_FIELDS = [
  "font", "size", "color", "weight", "align", "lineHeight", "letterSpacing",
  "shadow", "outline", "effect", "effectColor", "italic", "underline", "strike",
  "textCase", "curve",
] as const;

export const SHAPE_STYLE_FIELDS = ["fill", "stroke", "strokeWidth", "dash", "radius", "gradient"] as const;

export const IMAGE_STYLE_FIELDS = ["filters", "mask"] as const;

export type CopiedStyle = { kind: Layer["kind"]; style: Record<string, unknown> };

function fieldsFor(kind: Layer["kind"]): readonly string[] {
  if (kind === "text") return TEXT_STYLE_FIELDS;
  if (kind === "shape") return SHAPE_STYLE_FIELDS;
  if (kind === "image") return IMAGE_STYLE_FIELDS;
  return [];
}

export function copyStyleOf(layer: Layer | null | undefined): CopiedStyle | null {
  if (!layer) return null;
  const fields = fieldsFor(layer.kind);
  if (!fields.length) return null;
  const style: Record<string, unknown> = {};
  const any = layer as unknown as Record<string, unknown>;
  for (const f of fields) if (any[f] !== undefined) style[f] = JSON.parse(JSON.stringify(any[f]));
  style.opacity = layer.opacity ?? 1;
  return { kind: layer.kind, style };
}

/**
 * Paste onto every layer of the SAME kind in the selection, and say nothing
 * about the others rather than half-applying: a text style on a photo is not a
 * smaller version of itself, it is a different thing.
 */
export function pasteStyle(doc: CanvasDoc, ids: string[], copied: CopiedStyle | null): CanvasDoc {
  if (!copied || !ids.length) return doc;
  const fields = fieldsFor(copied.kind);
  return {
    ...doc,
    layers: doc.layers.map((l) => {
      if (!ids.includes(l.id) || l.kind !== copied.kind) return l;
      const next = { ...l } as Layer & Record<string, unknown>;
      for (const f of fields) {
        if (copied.style[f] === undefined) delete next[f];
        else next[f] = JSON.parse(JSON.stringify(copied.style[f]));
      }
      next.opacity = copied.style.opacity as number;
      return next as Layer;
    }),
  };
}

/** What a text layer actually READS as, once its case toggle is applied. */
export function displayText(layer: TextLayer): string {
  return applyCase(layer.content || "", layer.textCase);
}

/**
 * Brand Sync — remap every colour in the scene to the nearest brand swatch.
 *
 * Deterministic, no model call. `swatches` is the business's own palette and
 * the CALLER hands it in; nothing in this file can reach the brand kit at all.
 * That is what makes "a design override never writes back to the kit" a fact
 * about the code rather than a promise.
 */
export function brandSync(doc: CanvasDoc, swatches: string[]): CanvasDoc {
  const palette = swatches.filter(Boolean);
  if (!palette.length) return doc;
  const remap = (c: string | undefined | null) =>
    c && c !== "none" && !c.startsWith("{{") ? nearestBrandColor(c, palette) : c;
  return {
    ...doc,
    background_color: isTransparent(doc)
      ? doc.background_color
      : remap(doc.background_color) ?? doc.background_color,
    layers: doc.layers.map((l) => {
      const next = { ...l } as Layer & Record<string, unknown>;
      for (const key of ["fill", "stroke", "color", "outline", "effectColor"]) {
        if (typeof next[key] === "string") next[key] = remap(next[key] as string);
      }
      const g = (next as Record<string, unknown>).gradient as GradientSpec | undefined;
      if (g && typeof g === "object") {
        (next as Record<string, unknown>).gradient = { ...g, from: remap(g.from) || g.from, to: remap(g.to) || g.to };
      }
      if (l.kind === "chart") delete (next as Record<string, unknown>).colors; // brand cycle takes over
      return next as Layer;
    }),
  };
}

/**
 * Fix contrast — flip one text layer to white or near-black depending on what
 * sits behind its centre. Standard tier, deterministic.
 */
export function fixTextContrast(doc: CanvasDoc, id: string): CanvasDoc {
  const idx = doc.layers.findIndex((l) => l.id === id);
  const text = doc.layers[idx] as TextLayer | undefined;
  if (!text || text.kind !== "text") return doc;
  const cx = text.x + text.w / 2;
  const cy = text.y + text.h / 2;
  let behind = isTransparent(doc) ? "#FFFFFF" : (doc.background_color || "#FFFFFF");
  for (let i = idx - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (l.kind !== "shape" && l.kind !== "image") continue;
    const contains = cx >= l.x && cx <= l.x + l.w && cy >= l.y && cy <= l.y + l.h;
    if (!contains) continue;
    if (l.kind === "image") { behind = "#888888"; break; }   // photos: assume mid-tone
    const fill = (l as ShapeLayer).fill;
    if (fill && fill !== "none") { behind = fill; break; }
  }
  return patchLayer(doc, id, { color: relLuminance(behind) < 0.4 ? "#FFFFFF" : "#111827" } as Partial<Layer>);
}

/* ══════════════════════════════════════════════════════════════════════════
   Fonts
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The faces we ship. Six OFL families bundled through @fontsource in the
 * browser AND as TTFs in LUMEN's assets/fonts, so a downloaded PNG really uses
 * the face you picked, plus three web-safe stacks.
 *
 * `export_safe: false` means the browser renders it and the export substitutes
 * — a fact the studio SHOWS rather than hides. All nine bundled faces are safe;
 * the flag exists so a brand face we do not carry cannot quietly lie.
 */
export interface StudioFont {
  /** The CSS stack, and the value stored on a layer. */
  stack: string;
  /** What a person sees in the list. */
  label: string;
  export_safe: boolean;
}

export const STUDIO_FONTS: StudioFont[] = [
  { stack: "Poppins, Inter, sans-serif", label: "Poppins", export_safe: true },
  { stack: "Montserrat, Verdana, sans-serif", label: "Montserrat", export_safe: true },
  { stack: "Playfair Display, Georgia, serif", label: "Playfair Display", export_safe: true },
  { stack: "Bebas Neue, Impact, sans-serif", label: "Bebas Neue", export_safe: true },
  { stack: "Lora, Georgia, serif", label: "Lora", export_safe: true },
  { stack: "Oswald, Arial Narrow, sans-serif", label: "Oswald", export_safe: true },
  { stack: "Inter, Helvetica, Arial, sans-serif", label: "Inter", export_safe: true },
  { stack: "Georgia, serif", label: "Georgia", export_safe: true },
  { stack: "Courier New, monospace", label: "Courier New", export_safe: true },
];

/** Every stack, in list order — for the places that only want the strings. */
export const DEFAULT_FONTS: string[] = STUDIO_FONTS.map((f) => f.stack);

export interface FontOption extends StudioFont { brand: "heading" | "body" | null }

/**
 * The font list the inspector shows: the business's own two faces FIRST,
 * marked as theirs, then everything else we carry.
 *
 * Q4 (Brandon 2026-09-15) in one function: "any colour, any font we carry; the
 * brand kit pre-fills the swatches and the default fonts". Brand-first is a
 * SORT ORDER, never a restriction — every face below the rule stays pickable,
 * which is what acceptance row (c) checks.
 */
export function fontOptions(headingStack: string | null, bodyStack: string | null): FontOption[] {
  const brandOf = (stack: string): "heading" | "body" | null =>
    headingStack && sameFamily(stack, headingStack) ? "heading"
      : bodyStack && sameFamily(stack, bodyStack) ? "body"
        : null;
  const decorated: FontOption[] = STUDIO_FONTS.map((f) => ({ ...f, brand: brandOf(f.stack) }));
  // A brand face we do not carry is still offered — it is THEIR font.
  for (const [stack, which] of [[headingStack, "heading"], [bodyStack, "body"]] as const) {
    if (!stack) continue;
    if (decorated.some((f) => sameFamily(f.stack, stack))) continue;
    decorated.push({ stack, label: familyOf(stack), export_safe: false, brand: which });
  }
  const rank = (f: FontOption) => (f.brand === "heading" ? 0 : f.brand === "body" ? 1 : 2);
  return [...decorated].sort((a, b) => rank(a) - rank(b));
}

/** The first family in a CSS stack — "Poppins, Inter, sans-serif" → "Poppins". */
export function familyOf(stack: string): string {
  return String(stack || "").split(",")[0].replace(/["']/g, "").trim();
}

function sameFamily(a: string, b: string): boolean {
  return familyOf(a).toLowerCase() === familyOf(b).toLowerCase();
}

/** The filename a download gets. One place, so PNG and SVG cannot disagree. */
export function exportFilename(designName: string | null | undefined, format: string): string {
  const base = String(designName || "design").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "design";
  return `${base}.${format}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   {{brand.*}} tokens
   ══════════════════════════════════════════════════════════════════════════│ */

/**
 * A stored template ROW keeps `{{brand.primary}}` where a colour goes; only a
 * DESIGN carries real colours. LUMEN resolves the tokens when it serves one
 * template by id (routes/myBrand/templateStudio.js), and deliberately does NOT
 * when it serves the LIST — so any surface that draws a template straight out
 * of the list has to resolve them itself.
 *
 * Found on the 2026-09-16 walk: the gallery painted every starter template
 * black, because "{{brand.primary}}" is not a colour any renderer understands
 * and SVG falls back to black. The fix is this function rather than a fetch per
 * card: forty cards would otherwise be forty round trips to be told what the
 * kit on screen already says.
 *
 * Mirrors LUMEN's resolveColorToken exactly, including the substitution INSIDE
 * a longer string, and never mutates its input.
 */
export const BRAND_TOKEN_KEYS = ["primary", "secondary", "accent", "text", "background"] as const;

export function resolveBrandTokens(
  scene: CanvasDoc | null,
  colours: Record<string, string>,
): CanvasDoc | null {
  if (!scene) return scene;
  const table: Record<string, string> = {};
  for (const key of BRAND_TOKEN_KEYS) {
    if (colours[key]) table[`{{brand.${key}}}`] = colours[key];
  }
  const one = (value: unknown): unknown => {
    if (value == null) return value;
    const s = String(value);
    if (table[s] != null) return table[s];
    if (!s.includes("{{brand.")) return value;
    return s.replace(/\{\{brand\.[a-zA-Z_]+\}\}/g, (m) => table[m] || m);
  };
  const out: CanvasDoc = JSON.parse(JSON.stringify(scene));
  if (out.background_color != null) out.background_color = one(out.background_color) as string;
  if (out.background_gradient) {
    out.background_gradient.from = one(out.background_gradient.from) as string;
    out.background_gradient.to = one(out.background_gradient.to) as string;
  }
  for (const layer of Array.isArray(out.layers) ? out.layers : []) {
    const any = layer as unknown as Record<string, unknown>;
    for (const key of ["fill", "stroke", "color", "outline", "effectColor"]) {
      if (any[key] != null) any[key] = one(any[key]);
    }
    const g = any.gradient as { from?: string; to?: string } | undefined;
    if (g && typeof g === "object") { g.from = one(g.from) as string; g.to = one(g.to) as string; }
    if (Array.isArray(any.colors)) any.colors = (any.colors as unknown[]).map(one);
  }
  return out;
}

/** True when anything in the scene is still an unresolved token. */
export function hasUnresolvedBrandTokens(scene: CanvasDoc | null): boolean {
  if (!scene) return false;
  return JSON.stringify(scene).includes("{{brand.");
}

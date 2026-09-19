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
  applyCase, curvedTextSvg, dashArray, dashLineCap, isCurved, isNarrowFamily,
  needsSvgText, straightTextSvg, wrapLines,
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

export type ImageMask = "circle" | "rounded" | "blob1" | "blob2" | "arch";

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
};

export const DECOR_KEYS = new Set(["blob1","blob2","blob3","wave","wave2","arch","halfcircle","quartercircle","scallop","dots"]);

function iconToSvg(layer: ShapeLayer): string {
  const d = ICON_PATHS[layer.icon || ""] || ICON_PATHS.star;
  const stroke = layer.stroke && layer.stroke !== "none" ? layer.stroke : "none";
  let defs = "";
  let fill = layer.fill && layer.fill !== "none" ? layer.fill : FALLBACK.primary;
  if (layer.gradient) {
    const c = GRADIENT_COORDS[layer.gradient.dir] || GRADIENT_COORDS.d1;
    defs = `<defs><linearGradient id="g" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">` +
      `<stop offset="0" stop-color="${layer.gradient.from}"/><stop offset="1" stop-color="${layer.gradient.to}"/></linearGradient></defs>`;
    fill = "url(#g)";
  }
  // The dash array is in the icon's own 100×100 space, so it stays the same
  // pattern whatever size the symbol is dragged to.
  const dash = dashArray(layer.dash, ((layer.strokeWidth || 1) / Math.max(1, layer.w)) * 100);
  const dashAttrs = dash.length
    ? ` stroke-dasharray="${dash.join(" ")}" stroke-linecap="${dashLineCap(layer.dash)}"`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.w}" height="${layer.h}" viewBox="0 0 100 100">${defs}` +
    `<path d="${d}" fill-rule="evenodd" fill="${fill}" stroke="${stroke}" stroke-width="${layer.strokeWidth || 0}"${dashAttrs} /></svg>`;
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
export function textLayerSvg(layer: TextLayer): { svg: string; w: number; h: number } | null {
  if (!needsSvgText(layer)) return null;
  const size = Math.max(1, layer.size || 24);
  const w = Math.max(1, layer.w);
  const font = familyOf(layer.font || DEFAULT_FONTS[0]);
  const weight = layer.weight || "400";
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
      narrow: isNarrowFamily(layer.font),
      font,
      weight,
      italic: layer.italic === true,
      boxW: w,
      boxH,
      effectInput,
    });
    return svg ? { svg, w, h: Math.round(boxH) } : null;
  }
  const lines = wrapLines(content, w, size, weight);
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
  });
  return { svg, w, h: boxH };
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
  values: Array<{ label?: string; value: number }>;
  colors?: string[];
}

export type Layer = TextLayer | ImageLayer | ShapeLayer | ChartLayer;

export interface CanvasDoc {
  version: 1;
  width: number;
  height: number;
  background_color?: string | null;
  /** Overrides background_color when present (ignored on transparent). */
  background_gradient?: GradientSpec | null;
  layers: Layer[];
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

export function chartToSvg(layer: ChartLayer): string {
  const w = layer.w, h = layer.h;
  const values = (layer.values || []).map((v) => ({
    label: String(v.label ?? ""),
    value: Math.max(0, Number(v.value) || 0),
  }));
  const cycle = layer.colors?.length ? layer.colors : CHART_DEFAULT_CYCLE;
  const color = (i: number) => cycle[i % cycle.length];
  const labelSize = Math.max(10, Math.round(Math.min(w, h) * 0.055));
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts: string[] = [];
  if (!values.length || w <= 0 || h <= 0) return `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>`;

  if (layer.chart === "bar") {
    const labelBand = labelSize * 1.6;
    const plotH = Math.max(1, h - labelBand);
    const max = Math.max(...values.map((v) => v.value), 1);
    const slot = w / values.length;
    const barW = slot * 0.68;
    values.forEach((v, i) => {
      const barH = (v.value / max) * plotH;
      const bx = i * slot + (slot - barW) / 2;
      parts.push(`<rect x="${bx}" y="${plotH - barH}" width="${barW}" height="${barH}" rx="${Math.min(6, barW / 6)}" fill="${color(i)}" />`);
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
      parts.push(`<circle cx="${p.px}" cy="${p.py}" r="${Math.max(3, Math.round(Math.min(w, h) * 0.016))}" fill="${color(0)}" />`);
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

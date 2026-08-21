// TemplateStudioEditorModal — My Brand · Template Studio design editor.
//
// The Fabric.js canvas editor, re-hosted from the old full-page
// TemplateStudioPage into the canonical IadmModal (F-107 size "info",
// 1200×80vh) per the portal skeleton: all create/edit flows live in
// centered modals launched from a library page.
//
// In-house creative editor backed by Fabric.js. The whole point is to keep
// the canvas authoring experience inside the portal — no Placid / Canva /
// Bannerbear embeds — while staying portable: Fabric.js is just a primitive
// HTML canvas library, not a vendor SaaS surface, so it cleanly satisfies
// Brandon's "no 3rd-party UI SDKs" rule (same reason chart.js / recharts /
// lucide ship in the portal today).
//
// CRUD contract (canon: SparkTemplateEditorModal):
//   { open, onClose, designId: string | null, templateId?, onChanged? }
//   - designId null + templateId null  → blank new design
//   - designId null + templateId set   → new design seeded from a template
//   - designId set                     → edit an existing saved design
//   onChanged fires after every successful persist so the parent library
//   refreshes. NOTE: unlike the one-shot form editors, Save does NOT close
//   this modal — design work is iterative and the 2s auto-save on rename
//   depends on the editor staying open.
//
// API surface (LUMEN-API My Brand, wave 1 — no DELETE route exists):
//   GET    /api/v1/my-brand/templates/:id
//   POST   /api/v1/my-brand/designs           { templateId?, canvas, name }
//   GET    /api/v1/my-brand/designs/:id
//   PUT    /api/v1/my-brand/designs/:id       { canvas, name }
//   POST   /api/v1/my-brand/designs/:id/export { format, width, height }
//
// Canvas JSON shape (matches templateStudio.js renderer exactly):
//   { version: 1, width, height, background_color, layers: [...] }
//   layer kinds: text | image | shape (rect | ellipse | line)

import {
  useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import * as fabric from "fabric";
import {
  AlertTriangle, AlignCenter, AlignCenterHorizontal, AlignCenterVertical,
  AlignEndHorizontal, AlignEndVertical, AlignLeft, AlignRight,
  AlignStartHorizontal, AlignStartVertical, BarChart3, Bold,
  ChevronDown, ChevronUp, Circle, Contrast, Copy, Download, Eye, EyeOff,
  FileImage, FlipHorizontal2, FlipVertical2, Image as ImageIcon, Layers,
  Loader2, Lock, Maximize, Minus, Palette, Plus, Save, Scaling, Send, Sparkles,
  Square, Star, Trash2, Type as TypeIcon, Unlock, Upload, Wand2, X,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { IadmModal, IadmButton } from "../IadmModal";
import { useLumenApi } from "../../hooks/useLumenApi";
import { useProductTier } from "../../hooks/useProductTier";
import { tierMeets } from "../../lib/tierRank";

// ────────────────────────────────────────────────────────────────────────────
// Canvas JSON types — match the backend renderer in
// LUMEN-API/src/lib/myBrand/templateStudio.js. Kept slightly lenient on
// extra fields so future renderer additions (shadow, blendMode, etc.)
// pass through without breaking. Exported so the library page can type its
// gallery lists off the same DTOs.
// ────────────────────────────────────────────────────────────────────────────

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
  /** "lift" = soft blurred shadow; "hollow" = stroke-only type. */
  effect?: "lift" | "hollow";
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

/** Two-stop linear gradient — the depth device (server: linearGradient defs). */
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

function fabricGradient(g: GradientSpec): fabric.Gradient<"linear"> {
  return new fabric.Gradient({
    type: "linear",
    gradientUnits: "percentage",
    coords: GRADIENT_COORDS[g.dir] || GRADIENT_COORDS.d1,
    colorStops: [
      { offset: 0, color: g.from || "#1A3A4A" },
      { offset: 1, color: g.to || "#FEC82C" },
    ],
  });
}

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
  let fill = layer.fill && layer.fill !== "none" ? layer.fill : "#1A3A4A";
  if (layer.gradient) {
    const c = GRADIENT_COORDS[layer.gradient.dir] || GRADIENT_COORDS.d1;
    defs = `<defs><linearGradient id="g" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">` +
      `<stop offset="0" stop-color="${layer.gradient.from}"/><stop offset="1" stop-color="${layer.gradient.to}"/></linearGradient></defs>`;
    fill = "url(#g)";
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${layer.w}" height="${layer.h}" viewBox="0 0 100 100">${defs}` +
    `<path d="${d}" fill-rule="evenodd" fill="${fill}" stroke="${stroke}" stroke-width="${layer.strokeWidth || 0}" /></svg>`;
}

// Canva-style text presets — sized for a 1080 canvas; addTextLayer scales
// them relative to the current canvas width.
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

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// Brand font pack — six bundled OFL faces loaded via @fontsource here and
// shipped as TTFs in LUMEN assets/fonts for export parity (real typography
// is most of the distance between amateur and professional output). A few
// web-safe stacks stay at the bottom. First family is the display name.
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/bebas-neue/400.css";
import "@fontsource/lora/400.css";
import "@fontsource/lora/700.css";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/700.css";

const DEFAULT_FONTS = [
  "Poppins, Inter, sans-serif",
  "Montserrat, Verdana, sans-serif",
  "Playfair Display, Georgia, serif",
  "Bebas Neue, Impact, sans-serif",
  "Lora, Georgia, serif",
  "Oswald, Arial Narrow, sans-serif",
  "Inter, Helvetica, Arial, sans-serif",
  "Georgia, serif",
  "Courier New, monospace",
];

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
] as const;

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
const CHART_DEFAULT_CYCLE = ["#1A3A4A", "#FEC82C", "#64748B", "#94A3B8", "#CBD5E1", "#475569"];

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

// ────────────────────────────────────────────────────────────────────────────
// Editor modal
// ────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  /** Existing design to edit, or null for create-new. */
  designId: string | null;
  /** When creating (designId null), optional template to seed the canvas. */
  templateId?: string | null;
  /**
   * When creating from scratch (both ids null), the starting canvas — the
   * purpose picker passes the right size + transparency (logo/icon mode).
   */
  initialCanvas?: CanvasDoc | null;
  /** Display name seeded alongside initialCanvas (e.g. "New logo"). */
  initialName?: string;
  /** Called after every successful persist so the parent library refreshes. */
  onChanged?: () => void;
}

/** True when the canvas has no backdrop (logo/icon mode) — exports keep alpha. */
function isTransparent(doc: CanvasDoc): boolean {
  return doc.background_color == null || String(doc.background_color).toLowerCase() === "transparent";
}

export function TemplateStudioEditorModal({
  open, onClose, designId, templateId = null, initialCanvas = null, initialName, onChanged,
}: Props) {
  const { get, post, put, ready } = useLumenApi();
  const navigate = useNavigate();
  // Smart Resize is a Pro+ Smart Tool (re-cut §8b L2 lock). Same tier
  // source as the Social Hub calendar grid gate.
  const { tier } = useProductTier("spark");
  const hasSmartResize = tierMeets(tier, "pro");

  // ── State ─────────────────────────────────────────────────────────────────
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(designId);
  const [designName, setDesignName] = useState<string>("Untitled design");
  const [canvasDoc, setCanvasDoc] = useState<CanvasDoc>(BLANK_CANVAS_DEFAULTS);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const [exporting, setExporting] = useState<"png" | "jpg" | "asset" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  // Export picker — IadmModal size="nav" replaces the old absolute dropdown.
  const [exportPickerOpen, setExportPickerOpen] = useState(false);

  const [zoom, setZoom] = useState(1);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // The full-rebuild renderer needs the current selection without being
  // re-created per selection change (it's bound once).
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Smart Resize picker modal.
  const [resizeOpen, setResizeOpen] = useState(false);
  // "⋯ more" catalog pickers for the rail (elements | icons).
  const [moreOpen, setMoreOpen] = useState<"elements" | "icons" | null>(null);

  // Tenant brand palette for the color swatches — same resolved palette the
  // exporter uses, so what you pick is what ships.
  const [brandPalette, setBrandPalette] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (!open || !ready || brandPalette) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await get<Record<string, string>>("/api/v1/my-brand/templates/brand-palette");
        if (!cancelled && p) setBrandPalette(p);
      } catch { /* swatches degrade to defaults */ }
    })();
    return () => { cancelled = true; };
  }, [open, ready, get, brandPalette]);

  // Snap guides — canvas-space coordinates of the active vertical/horizontal
  // guide line while an object is being dragged, null when not snapping.
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const guidesRef = useRef(guides);
  guidesRef.current = guides;
  // Fabric's object:moving handler is bound once (canvas-init effect) but
  // needs the CURRENT doc dimensions — a ref avoids re-binding per change.
  const docDimsRef = useRef({ w: BLANK_CANVAS_DEFAULTS.width, h: BLANK_CANVAS_DEFAULTS.height });

  // ── Fabric.js canvas ──────────────────────────────────────────────────────
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  // Maps layer.id → Fabric object so layer-list + toolbar can reach into the
  // currently-rendered scene without a full canvas walk on every keystroke.
  const objectsByIdRef = useRef<Map<string, fabric.FabricObject>>(new Map());
  // Two-way bridge: when Fabric fires events (mousedown, modified, etc.) we
  // need to find which layer.id was hit. WeakMap so the GC clears entries
  // automatically when an object leaves the scene.
  const idByObjectRef = useRef<WeakMap<fabric.FabricObject, string>>(new WeakMap());
  // Suppresses the canvas → state sync briefly while we mutate state from
  // outside the canvas (e.g. add layer button, undo). Prevents the
  // "object:modified" handler from clobbering the value we just set.
  const suppressSyncRef = useRef(false);

  // ── Undo stack — snapshot the canvasDoc before each mutation ─────────────
  const undoStackRef = useRef<CanvasDoc[]>([]);
  const lastUndoPushRef = useRef(0);

  function pushUndoSnapshot(prev: CanvasDoc) {
    // Coalesce rapid-fire mutations (opacity/brightness slider drags fire
    // per tick) into ONE undo step — otherwise a single drag floods the
    // stack and ⌘Z replays it a pixel at a time.
    const now = Date.now();
    if (now - lastUndoPushRef.current < 400 && undoStackRef.current.length > 0) return;
    lastUndoPushRef.current = now;
    undoStackRef.current.push(JSON.parse(JSON.stringify(prev)));
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }

  // ── Load record — gated on open && ready (canon CRUD contract) ───────────
  // designId → edit existing design; templateId → seed a NEW design from a
  // template (deep-cloned so edits never mutate the template ref); neither →
  // blank canvas defaults.
  useEffect(() => {
    if (!open || !ready) return;
    setSaveError(null);
    setExportError(null);
    if (!designId && !templateId) {
      setCanvasDoc(initialCanvas ? JSON.parse(JSON.stringify(initialCanvas)) : emptyCanvas());
      setCurrentDesignId(null);
      setDesignName(initialName || "Untitled design");
      undoStackRef.current = [];
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (designId) {
          const d = await get<DesignDto>(`/api/v1/my-brand/designs/${designId}`);
          if (cancelled || !d?.canvas) return;
          const canvas: CanvasDoc = JSON.parse(JSON.stringify(d.canvas));
          // Assign ids to any layers that omit them — older rows may not
          // include them, but the editor needs them for selection.
          canvas.layers = canvas.layers.map((l) => l.id ? l : { ...l, id: uid(l.kind) });
          setCanvasDoc(canvas);
          setCurrentDesignId(d.design_id);
          setDesignName(d.name || "Untitled design");
          undoStackRef.current = [];
        } else if (templateId) {
          // Pull the canvas via the dedicated GET so we don't depend on the
          // gallery list shape (which may omit `canvas` for thumbnail views).
          const tpl = await get<TemplateDto>(`/api/v1/my-brand/templates/${templateId}`);
          if (cancelled || !tpl?.canvas) return;
          const canvas: CanvasDoc = JSON.parse(JSON.stringify(tpl.canvas));
          canvas.layers = canvas.layers.map((l) => l.id ? l : { ...l, id: uid(l.kind) });
          setCanvasDoc(canvas);
          setCurrentDesignId(null);
          setDesignName(tpl.name);
          undoStackRef.current = [];
          // Select the biggest text layer right away — the properties panel
          // opens showing something editable instead of a "select a layer"
          // hint (templates are edited by swapping words first).
          const headline = canvas.layers
            .filter((l): l is TextLayer => l.kind === "text")
            .sort((a, b) => (b.size || 0) - (a.size || 0))[0];
          if (headline) setSelectedId(headline.id);
        }
      } catch (e) {
        if (!cancelled) setSaveError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps — initialCanvas/
    // initialName are creation-time seeds; re-running on their identity
    // would wipe in-progress edits.
  }, [open, ready, designId, templateId, get]);

  // ── Initialize Fabric canvas when the modal opens ────────────────────────
  useEffect(() => {
    if (!open) return;
    if (!canvasElRef.current) return;
    if (fabricRef.current) return;
    const c = new fabric.Canvas(canvasElRef.current, {
      width: BLANK_CANVAS_DEFAULTS.width,
      height: BLANK_CANVAS_DEFAULTS.height,
      backgroundColor: BLANK_CANVAS_DEFAULTS.background_color || "#FFFFFF",
      preserveObjectStacking: true,
      selection: true,
    });
    fabricRef.current = c;
    if (import.meta.env.DEV) {
      // Debug seam — lets dev tooling inspect pointer math / targeting.
      (window as unknown as Record<string, unknown>).__fabricCanvas = c;
    }

    // Selection + modification handlers — keep the React state in sync with
    // Fabric's view of the world. We READ from Fabric only when the user has
    // finished a manipulation (object:modified), not on every mouse move,
    // because re-rendering React mid-drag tanks performance.
    c.on("selection:created", (e) => {
      const obj = (e as { selected?: fabric.FabricObject[] }).selected?.[0];
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (id) setSelectedId(id);
    });
    c.on("selection:updated", (e) => {
      const obj = (e as { selected?: fabric.FabricObject[] }).selected?.[0];
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (id) setSelectedId(id);
    });
    c.on("selection:cleared", () => setSelectedId(null));

    c.on("object:modified", (e) => {
      if (suppressSyncRef.current) return;
      if (guidesRef.current.v !== null || guidesRef.current.h !== null) {
        setGuides({ v: null, h: null });
      }
      const obj = e.target as fabric.FabricObject | undefined;
      if (!obj) return;
      const id = idByObjectRef.current.get(obj);
      if (!id) return;
      syncOneLayerFromFabric(id, obj);
    });

    // Snap guides (bucket-1, re-cut §8b): while dragging, snap the object's
    // edges/center to the canvas edges and center lines within an 8px
    // (canvas-space) threshold, and surface guide lines via React state.
    const SNAP = 8;
    c.on("object:moving", (e) => {
      const obj = e.target as fabric.FabricObject | undefined;
      if (!obj) return;
      const { w: W, h: H } = docDimsRef.current;
      const ow = (obj.width ?? 0) * (obj.scaleX ?? 1);
      const oh = (obj.height ?? 0) * (obj.scaleY ?? 1);
      let v: number | null = null;
      let h: number | null = null;
      // Horizontal snap: left edge, center, right edge → 0, W/2, W.
      for (const line of [0, W / 2, W]) {
        if (Math.abs((obj.left ?? 0) - line) < SNAP) { obj.set({ left: line }); v = line; break; }
        if (Math.abs((obj.left ?? 0) + ow / 2 - line) < SNAP) { obj.set({ left: line - ow / 2 }); v = line; break; }
        if (Math.abs((obj.left ?? 0) + ow - line) < SNAP) { obj.set({ left: line - ow }); v = line; break; }
      }
      // Vertical snap: top edge, middle, bottom edge → 0, H/2, H.
      for (const line of [0, H / 2, H]) {
        if (Math.abs((obj.top ?? 0) - line) < SNAP) { obj.set({ top: line }); h = line; break; }
        if (Math.abs((obj.top ?? 0) + oh / 2 - line) < SNAP) { obj.set({ top: line - oh / 2 }); h = line; break; }
        if (Math.abs((obj.top ?? 0) + oh - line) < SNAP) { obj.set({ top: line - oh }); h = line; break; }
      }
      if (guidesRef.current.v !== v || guidesRef.current.h !== h) {
        setGuides({ v, h });
      }
    });

    return () => {
      try { c.dispose(); } catch { /* ignore disposal errors during HMR */ }
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Sync one Fabric object back to its CanvasDoc layer ───────────────────
  const syncOneLayerFromFabric = useCallback(
    (id: string, obj: fabric.FabricObject) => {
      setCanvasDoc((prev) => {
        const idx = prev.layers.findIndex((l) => l.id === id);
        if (idx === -1) return prev;
        const layer = prev.layers[idx];
        // Use coords()/scaleX,Y to compute the displayed bounding box. Fabric
        // stores x/y as the object's top-left; for some kinds (text/IText)
        // size derives from scaleX*width, scaleY*height because Fabric drives
        // resize via scale rather than rewriting font-size.
        const w = (obj.width ?? layer.w) * (obj.scaleX ?? 1);
        const h = (obj.height ?? layer.h) * (obj.scaleY ?? 1);
        const updates: Partial<BaseLayer> = {
          x: Math.round(obj.left ?? layer.x),
          y: Math.round(obj.top ?? layer.y),
          w: Math.round(w),
          h: Math.round(h),
          rotation: Math.round(((obj.angle ?? layer.rotation ?? 0) % 360 + 360) % 360),
        };
        const next = [...prev.layers];
        // For text layers Fabric scaled the size; bake the scale into the
        // font size so future renders don't compound. This is the standard
        // Fabric pattern documented in the IText recipes.
        if (layer.kind === "text" && obj instanceof fabric.IText) {
          const newSize = (layer.size ?? 24) * (obj.scaleY ?? 1);
          next[idx] = {
            ...layer,
            ...updates,
            size: Math.max(6, Math.round(newSize)),
            content: obj.text ?? layer.content,
          } as TextLayer;
          // Bake the scale back to 1 so subsequent edits behave sanely.
          suppressSyncRef.current = true;
          obj.set({ scaleX: 1, scaleY: 1, width: w, height: h });
          fabricRef.current?.requestRenderAll();
          suppressSyncRef.current = false;
        } else {
          next[idx] = { ...layer, ...updates } as Layer;
        }
        return { ...prev, layers: next };
      });
    },
    []
  );

  // ── Render the entire CanvasDoc into Fabric (full rebuild) ───────────────
  // Called when we switch designs / open a template / undo. Cheap because
  // designs are bounded to MAX_LAYERS=500 server-side and the editor is
  // mostly used in the 5-30 layer range.
  const renderCanvasDocIntoFabric = useCallback((doc: CanvasDoc) => {
    const c = fabricRef.current;
    if (!c) return;
    suppressSyncRef.current = true;
    c.clear();
    c.setDimensions({ width: doc.width, height: doc.height });
    // Transparent canvas (logo/icon mode) — the wrapper div shows a
    // checkerboard behind Fabric's empty background. Gradient backdrop
    // takes precedence over the flat color, matching the export.
    c.backgroundColor = isTransparent(doc)
      ? ""
      : doc.background_gradient
        ? (fabricGradient(doc.background_gradient) as unknown as string)
        : (doc.background_color || "#FFFFFF");
    objectsByIdRef.current.clear();
    idByObjectRef.current = new WeakMap();
    for (const layer of doc.layers) {
      // onSwap: image/chart layers asynchronously replace their placeholder
      // with the real FabricImage — re-register the swapped object in the
      // id maps so selection + object:modified keep syncing to the layer
      // (without this, dragging an image/chart never persisted).
      const obj = layerToFabricObject(layer, (swapped) => {
        objectsByIdRef.current.set(layer.id, swapped);
        idByObjectRef.current.set(swapped, layer.id);
        // If the selected layer just swapped in, re-point the selection at
        // the real object (it was restored onto the placeholder).
        if (selectedIdRef.current === layer.id) c.setActiveObject(swapped);
      });
      if (!obj) continue;
      objectsByIdRef.current.set(layer.id, obj);
      idByObjectRef.current.set(obj, layer.id);
      if (layer.visible === false) obj.set({ visible: false });
      c.add(obj);
    }
    // The rebuild wiped Fabric's selection even though the panel still
    // shows the layer — restore it so the handles never vanish after an
    // edit (the single biggest "feels broken" of the first usability walk).
    const selId = selectedIdRef.current;
    if (selId) {
      const obj = objectsByIdRef.current.get(selId);
      if (obj && obj.selectable !== false) c.setActiveObject(obj);
    }
    // Fresh geometry → fresh pointer offset, or click-to-select drifts.
    c.calcOffset();
    c.requestRenderAll();
    suppressSyncRef.current = false;
  }, []);

  // Re-render whenever the canvasDoc changes. The renderer is deterministic
  // so this is safe to call after every state set. We avoid putting
  // canvasDoc in the dep array for the on:modified handler because that
  // would cause a feedback loop.
  useEffect(() => {
    renderCanvasDocIntoFabric(canvasDoc);
  }, [canvasDoc, renderCanvasDocIntoFabric]);

  // Keep the snap handler's view of the doc dimensions current.
  useEffect(() => {
    docDimsRef.current = { w: canvasDoc.width, h: canvasDoc.height };
  }, [canvasDoc.width, canvasDoc.height]);

  // Auto-fit zoom: size the canvas to the visible host so the WHOLE design
  // is on screen without scrolling (Brandon 2026-07-22 — "you have to
  // scroll to see the whole thing"). Manual +/- still overrides; the Fit
  // button re-fits.
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const fitZoom = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const availW = host.clientWidth - 48;
    const availH = host.clientHeight - 48;
    if (availW <= 0 || availH <= 0) return;
    const z = Math.min(availW / canvasDoc.width, availH / canvasDoc.height, 1);
    setZoom(Math.max(0.05, Math.round(z * 100) / 100));
  }, [canvasDoc.width, canvasDoc.height]);
  useEffect(() => {
    if (!open) return;
    // Let the modal lay out first, then fit.
    const t = setTimeout(fitZoom, 50);
    return () => clearTimeout(t);
  }, [open, fitZoom]);

  // Apply zoom — Fabric handles this with setZoom, but we also need to
  // scale the wrapper so scrollbars + selection handles stay accurate.
  useEffect(() => {
    const c = fabricRef.current;
    if (!c) return;
    c.setZoom(zoom);
    c.setDimensions({
      width: canvasDoc.width * zoom,
      height: canvasDoc.height * zoom,
    });
    // Re-measure the canvas position — the resize re-centers the m-auto
    // wrapper, and Fabric's cached offset otherwise goes stale, which
    // silently breaks click-to-select (pointer math lands off-target).
    // Twice: now, and after the layout actually settles.
    c.calcOffset();
    const t = setTimeout(() => { try { c.calcOffset(); } catch { /* disposed */ } }, 80);
    c.requestRenderAll();
    return () => clearTimeout(t);
  }, [zoom, canvasDoc.width, canvasDoc.height]);

  // ── Layer add helpers ────────────────────────────────────────────────────
  const mutateCanvas = useCallback((mutator: (prev: CanvasDoc) => CanvasDoc) => {
    setCanvasDoc((prev) => {
      pushUndoSnapshot(prev);
      return mutator(prev);
    });
  }, []);

  const addTextLayer = useCallback((preset: TextPresetKey = "subheading") => {
    const p = TEXT_PRESETS[preset];
    // Presets are sized for a 1080 canvas — scale to the current width so a
    // heading looks like a heading on a business card too.
    const s = Math.max(0.3, canvasDoc.width / 1080);
    const size = Math.round(p.size * s);
    const w = Math.round(Math.min(canvasDoc.width * 0.8, p.label.length * size * 0.62));
    const layer: TextLayer = {
      id: uid("text"),
      kind: "text",
      x: Math.round(canvasDoc.width / 2 - w / 2),
      y: Math.round(canvasDoc.height / 2 - size),
      w,
      h: Math.round(size * 1.4),
      content: p.label,
      font: DEFAULT_FONTS[0],
      size,
      color: "#111827",
      weight: p.weight,
      align: "center",
      lineHeight: 1.2,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addIconLayer = useCallback((icon: string) => {
    const side = Math.round(Math.min(canvasDoc.width, canvasDoc.height) * 0.18);
    const layer: ShapeLayer = {
      id: uid("icon"),
      kind: "shape",
      shape: "icon",
      icon,
      x: Math.round(canvasDoc.width / 2 - side / 2),
      y: Math.round(canvasDoc.height / 2 - side / 2),
      w: side,
      h: side,
      fill: "#1A3A4A",
      stroke: "none",
      strokeWidth: 0,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addShapeLayer = useCallback((shape: "rect" | "ellipse" | "line") => {
    const layer: ShapeLayer = {
      id: uid(shape),
      kind: "shape",
      shape,
      x: Math.round(canvasDoc.width / 2 - 100),
      y: Math.round(canvasDoc.height / 2 - 100),
      w: 200,
      h: shape === "line" ? 0 : 200,
      fill: shape === "line" ? "none" : "#FEC82C",
      stroke: shape === "line" ? "#1A3A4A" : "none",
      strokeWidth: shape === "line" ? 4 : 0,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addImageLayer = useCallback((src: string | null) => {
    const layer: ImageLayer = {
      id: uid("image"),
      kind: "image",
      x: Math.round(canvasDoc.width / 2 - 200),
      y: Math.round(canvasDoc.height / 2 - 200),
      w: 400,
      h: 400,
      blob_ref: null,
      src,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  const addChartLayer = useCallback(() => {
    const layer: ChartLayer = {
      id: uid("chart"),
      kind: "chart",
      chart: "bar",
      x: Math.round(canvasDoc.width / 2 - Math.min(400, canvasDoc.width * 0.4)),
      y: Math.round(canvasDoc.height / 2 - Math.min(260, canvasDoc.height * 0.3)),
      w: Math.round(Math.min(800, canvasDoc.width * 0.8)),
      h: Math.round(Math.min(520, canvasDoc.height * 0.6)),
      values: [
        { label: "Q1", value: 24 },
        { label: "Q2", value: 38 },
        { label: "Q3", value: 45 },
        { label: "Q4", value: 61 },
      ],
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  // Smart Resize — deterministic anchor relayout (Pro+; re-cut §8b).
  const applyResize = useCallback((w: number, h: number) => {
    mutateCanvas((prev) => smartResize(prev, w, h));
    setResizeOpen(false);
  }, [mutateCanvas]);

  // ── AI Assist ("describe it, credits do it") ──────────────────────────────
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState<"write" | "image" | null>(null);
  const [aiOptions, setAiOptions] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiWrite = useCallback(async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy("write");
    setAiError(null);
    setAiOptions([]);
    try {
      const sel = canvasDoc.layers.find((l) => l.id === selectedId);
      const r = await post<{ options: string[] }>("/api/v1/my-brand/designs/assist/write", {
        prompt: aiPrompt.trim(),
        current_text: sel?.kind === "text" ? (sel as TextLayer).content : undefined,
      });
      setAiOptions(r?.options || []);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
    }
  }, [aiPrompt, aiBusy, canvasDoc.layers, selectedId, post]);

  const aiApplyOption = useCallback((text: string) => {
    const sel = canvasDoc.layers.find((l) => l.id === selectedId);
    if (sel?.kind === "text") {
      mutateCanvas((prev) => ({
        ...prev,
        layers: prev.layers.map((l) => (l.id === sel.id ? { ...l, content: text } as Layer : l)),
      }));
    } else {
      const s = Math.max(0.3, canvasDoc.width / 1080);
      const size = Math.round(48 * s);
      const w = Math.round(Math.min(canvasDoc.width * 0.85, Math.max(300, text.length * size * 0.55)));
      const layer: TextLayer = {
        id: uid("text"), kind: "text",
        x: Math.round(canvasDoc.width / 2 - w / 2),
        y: Math.round(canvasDoc.height / 2 - size),
        w, h: Math.round(size * 1.4),
        content: text, font: DEFAULT_FONTS[0], size, color: "#111827",
        weight: "600", align: "center", lineHeight: 1.2, visible: true,
      };
      mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
      setSelectedId(layer.id);
    }
    setAiOptions([]);
    setAiPrompt("");
  }, [canvasDoc, selectedId, mutateCanvas]);

  const aiGenerate = useCallback(async () => {
    if (!aiPrompt.trim() || aiBusy) return;
    setAiBusy("image");
    setAiError(null);
    try {
      const r = await post<{ assets: Array<{ assetId: string; blobRef: string; url: string }> }>(
        "/api/v1/my-brand/image-studio/generate",
        { prompt: aiPrompt.trim(), n: 1, size: "1024x1024" },
      );
      const a = r?.assets?.[0];
      if (!a?.url) throw new Error("no image returned");
      const side = Math.round(Math.min(canvasDoc.width, canvasDoc.height) * 0.6);
      const layer: ImageLayer = {
        id: uid("image"), kind: "image",
        x: Math.round(canvasDoc.width / 2 - side / 2),
        y: Math.round(canvasDoc.height / 2 - side / 2),
        w: side, h: side,
        asset_id: a.assetId, blob_ref: a.blobRef, src: a.url, visible: true,
      };
      mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
      setSelectedId(layer.id);
      setAiPrompt("");
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(null);
    }
  }, [aiPrompt, aiBusy, post, canvasDoc.width, canvasDoc.height, mutateCanvas]);

  // ── Compound elements — one click inserts a ready-made arrangement ────────
  const addElementPreset = useCallback((key: string) => {
    const W = canvasDoc.width, H = canvasDoc.height;
    const s = Math.max(0.3, Math.min(W, H) / 1080);
    const cx = W / 2, cy = H / 2;
    const P = brandPalette || { primary: "#1A3A4A", secondary: "#FEC82C", text: "#111827", background: "#FFFFFF" };
    const F = DEFAULT_FONTS[0];
    let layers: Layer[] = [];
    if (key === "cta") {
      const w = Math.round(420 * s), h = Math.round(96 * s);
      layers = [
        { id: uid("rect"), kind: "shape", shape: "rect", x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, radius: h / 2, gradient: { from: P.secondary, to: "#F59E0B", dir: "h" }, visible: true } as ShapeLayer,
        { id: uid("text"), kind: "text", x: Math.round(cx - w / 2), y: Math.round(cy - 24 * s), w, h: Math.round(48 * s), content: "BOOK TODAY", size: Math.round(36 * s), weight: "700", color: P.primary, align: "center", letterSpacing: Math.round(3 * s), font: F, visible: true } as TextLayer,
      ];
    } else if (key === "burst") {
      const d = Math.round(360 * s);
      layers = [
        { id: uid("icon"), kind: "shape", shape: "icon", icon: "seal", x: Math.round(cx - d / 2), y: Math.round(cy - d / 2), w: d, h: d, fill: P.secondary, visible: true } as ShapeLayer,
        { id: uid("text"), kind: "text", x: Math.round(cx - d / 2), y: Math.round(cy - 36 * s), w: d, h: Math.round(72 * s), content: "SALE", size: Math.round(64 * s), weight: "700", color: P.primary, align: "center", font: F, visible: true } as TextLayer,
      ];
    } else if (key === "pricetag") {
      const d = Math.round(340 * s);
      layers = [
        { id: uid("icon"), kind: "shape", shape: "icon", icon: "tag", x: Math.round(cx - d / 2), y: Math.round(cy - d / 2), w: d, h: d, fill: P.primary, visible: true } as ShapeLayer,
        { id: uid("text"), kind: "text", x: Math.round(cx - d / 2), y: Math.round(cy - 30 * s), w: Math.round(d * 0.8), h: Math.round(60 * s), content: "$99", size: Math.round(56 * s), weight: "700", color: P.background, align: "center", font: F, visible: true } as TextLayer,
      ];
    } else if (key === "testimonial") {
      const w = Math.round(Math.min(W * 0.8, 760 * s)), h = Math.round(300 * s);
      const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
      layers = [
        { id: uid("rect"), kind: "shape", shape: "rect", x, y, w, h, radius: Math.round(24 * s), fill: "#FFFFFF", stroke: "#E2E8F0", strokeWidth: 2, visible: true } as ShapeLayer,
        { id: uid("text"), kind: "text", x: x + Math.round(36 * s), y: y + Math.round(36 * s), w: w - Math.round(72 * s), h: Math.round(140 * s), content: "“They did exactly what they promised, on time and on budget. Couldn't recommend them more.”", size: Math.round(30 * s), color: P.text, lineHeight: 1.4, font: "Georgia, serif", visible: true } as TextLayer,
        { id: uid("text"), kind: "text", x: x + Math.round(36 * s), y: y + h - Math.round(70 * s), w: w - Math.round(72 * s), h: Math.round(40 * s), content: "— Jamie R., Homeowner", size: Math.round(24 * s), weight: "700", color: P.primary, font: F, visible: true } as TextLayer,
      ];
    } else if (key === "grid2x2" || key === "strip12") {
      const pad = Math.round(16 * s);
      const gw = Math.round(Math.min(W, H) * 0.8);
      const x0 = Math.round(cx - gw / 2), y0 = Math.round(cy - gw / 2);
      const half = Math.round((gw - pad) / 2);
      if (key === "grid2x2") {
        layers = [
          [x0, y0], [x0 + half + pad, y0], [x0, y0 + half + pad], [x0 + half + pad, y0 + half + pad],
        ].map(([x, y]) => ({ id: uid("image"), kind: "image", x, y, w: half, h: half, visible: true } as ImageLayer));
      } else {
        layers = [
          { id: uid("image"), kind: "image", x: x0, y: y0, w: half, h: gw, visible: true } as ImageLayer,
          { id: uid("image"), kind: "image", x: x0 + half + pad, y: y0, w: half, h: half, visible: true } as ImageLayer,
          { id: uid("image"), kind: "image", x: x0 + half + pad, y: y0 + half + pad, w: half, h: half, visible: true } as ImageLayer,
        ];
      }
    }
    if (!layers.length) return;
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, ...layers] }));
    setSelectedId(layers[layers.length - 1].id);
  }, [canvasDoc.width, canvasDoc.height, brandPalette, mutateCanvas]);

  // Place from Media Library (bucket 1): existing brand assets — including
  // AI-generated and background-removed ones — straight onto the canvas.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const addLibraryImageLayer = useCallback((asset: { asset_id: string; blob_ref: string | null; url: string | null; width_px?: number | null; height_px?: number | null }) => {
    const maxSide = Math.min(canvasDoc.width, canvasDoc.height) * 0.6;
    const aw = asset.width_px || 800;
    const ah = asset.height_px || 800;
    const s = Math.min(maxSide / aw, maxSide / ah, 1);
    const w = Math.round(aw * s);
    const h = Math.round(ah * s);
    const layer: ImageLayer = {
      id: uid("image"),
      kind: "image",
      x: Math.round(canvasDoc.width / 2 - w / 2),
      y: Math.round(canvasDoc.height / 2 - h / 2),
      w, h,
      blob_ref: asset.blob_ref,
      asset_id: asset.asset_id,
      src: asset.url,
      rotation: 0,
      visible: true,
    };
    mutateCanvas((prev) => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedId(layer.id);
    setLibraryOpen(false);
  }, [canvasDoc.width, canvasDoc.height, mutateCanvas]);

  // In-editor Remove background (§8c, Pro+, credit-metered server-side) —
  // available once a layer is library-linked (has asset_id). The result is
  // a NEW asset; the layer re-points at it.
  const [bgRemoveBusy, setBgRemoveBusy] = useState(false);
  const [bgRemoveError, setBgRemoveError] = useState<string | null>(null);
  const removeLayerBackground = useCallback(async (layerId: string) => {
    const layer = canvasDoc.layers.find((l) => l.id === layerId) as ImageLayer | undefined;
    if (!layer?.asset_id) return;
    setBgRemoveBusy(true);
    setBgRemoveError(null);
    try {
      const out = await post<{ assetId: string; blobRef: string; url: string }>(
        `/api/v1/my-brand/image-studio/${layer.asset_id}/edit`,
        { edits: { bg_remove: true } },
      );
      if (!out?.assetId) throw new Error("no asset returned");
      mutateCanvas((prev) => ({
        ...prev,
        layers: prev.layers.map((l) =>
          l.id === layerId
            ? { ...l, asset_id: out.assetId, blob_ref: out.blobRef, src: out.url } as Layer
            : l),
      }));
    } catch (e) {
      setBgRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setBgRemoveBusy(false);
    }
  }, [canvasDoc.layers, post, mutateCanvas]);

  // Brand Sync (Pro+, deterministic): remap every color in the design to
  // the nearest tenant brand color. One undo step reverses it.
  const applyBrandSync = useCallback(() => {
    const swatches = brandPalette
      ? [brandPalette.primary, brandPalette.secondary, brandPalette.text, brandPalette.background]
      : ["#1A3A4A", "#FEC82C", "#111827", "#FFFFFF"];
    const remap = (c: string | undefined | null) =>
      c && c !== "none" && !c.startsWith("{{") ? nearestBrandColor(c, swatches) : c;
    mutateCanvas((prev) => ({
      ...prev,
      background_color: isTransparent(prev)
        ? prev.background_color
        : remap(prev.background_color) ?? prev.background_color,
      layers: prev.layers.map((l) => {
        const next = { ...l } as Layer & Record<string, unknown>;
        for (const key of ["fill", "stroke", "color", "outline"]) {
          if (typeof next[key] === "string") next[key] = remap(next[key] as string);
        }
        if (l.kind === "chart") delete (next as Record<string, unknown>).colors; // brand cycle takes over
        return next as Layer;
      }),
    }));
  }, [brandPalette, mutateCanvas]);

  // Fix contrast (Standard, deterministic): pick white or near-black for a
  // text layer based on the luminance of whatever sits behind its center.
  const fixTextContrast = useCallback((layerId: string) => {
    const idx = canvasDoc.layers.findIndex((l) => l.id === layerId);
    const text = canvasDoc.layers[idx] as TextLayer | undefined;
    if (!text) return;
    const cx = text.x + text.w / 2;
    const cy = text.y + text.h / 2;
    // Topmost filled shape UNDER the text whose box contains its center;
    // canvas background otherwise.
    let behind = isTransparent(canvasDoc) ? "#FFFFFF" : (canvasDoc.background_color || "#FFFFFF");
    for (let i = idx - 1; i >= 0; i--) {
      const l = canvasDoc.layers[i];
      if (l.kind !== "shape" && l.kind !== "image") continue;
      const fill = (l as ShapeLayer).fill;
      const contains = cx >= l.x && cx <= l.x + l.w && cy >= l.y && cy <= l.y + l.h;
      if (!contains) continue;
      if (l.kind === "image") { behind = "#888888"; break; } // photos: assume mid-tone
      if (fill && fill !== "none") { behind = fill; break; }
    }
    const color = relLuminance(behind) < 0.4 ? "#FFFFFF" : "#111827";
    mutateCanvas((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === layerId ? { ...l, color } as Layer : l)),
    }));
  }, [canvasDoc, mutateCanvas]);

  // ── Layer mutators ────────────────────────────────────────────────────────
  const deleteLayer = useCallback((id: string) => {
    mutateCanvas((prev) => ({ ...prev, layers: prev.layers.filter((l) => l.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId, mutateCanvas]);

  const duplicateLayer = useCallback((id: string) => {
    mutateCanvas((prev) => {
      const src = prev.layers.find((l) => l.id === id);
      if (!src) return prev;
      const copy: Layer = {
        ...JSON.parse(JSON.stringify(src)),
        id: uid(src.kind),
        x: (src.x || 0) + 20,
        y: (src.y || 0) + 20,
      };
      return { ...prev, layers: [...prev.layers, copy] };
    });
  }, [mutateCanvas]);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    mutateCanvas((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, ...patch } as Layer : l)),
    }));
  }, [mutateCanvas]);

  const reorderLayer = useCallback((id: string, direction: "up" | "down") => {
    mutateCanvas((prev) => {
      const idx = prev.layers.findIndex((l) => l.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? Math.min(prev.layers.length - 1, idx + 1) : Math.max(0, idx - 1);
      if (newIdx === idx) return prev;
      const next = [...prev.layers];
      const [moved] = next.splice(idx, 1);
      next.splice(newIdx, 0, moved);
      return { ...prev, layers: next };
    });
  }, [mutateCanvas]);

  const toggleLayerVisibility = useCallback((id: string) => {
    mutateCanvas((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => l.id === id ? { ...l, visible: l.visible === false } : l),
    }));
  }, [mutateCanvas]);

  const setBackgroundColor = useCallback((color: string) => {
    mutateCanvas((prev) => ({ ...prev, background_color: color }));
  }, [mutateCanvas]);

  // ── Save ──────────────────────────────────────────────────────────────────
  // POST on create / PUT on edit (the LUMEN-API design verb is PUT, not
  // PATCH). Ends with onChanged?.() so the PARENT library reloads; the modal
  // stays open because design editing is iterative (see docblock).
  const save = useCallback(async () => {
    if (!ready) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (currentDesignId) {
        const updated = await put<DesignDto>(`/api/v1/my-brand/designs/${currentDesignId}`, {
          canvas: canvasDoc,
          name: designName,
        });
        if (updated?.design_id) {
          setLastSavedAt(new Date());
          onChanged?.();
        }
      } else {
        const created = await post<DesignDto>("/api/v1/my-brand/designs", {
          canvas: canvasDoc,
          name: designName,
        });
        if (created?.design_id) {
          setCurrentDesignId(created.design_id);
          setLastSavedAt(new Date());
          onChanged?.();
        }
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [canvasDoc, currentDesignId, designName, post, put, ready, onChanged]);

  // Debounced auto-save on name change (2s after last change). Implemented as
  // a simple setTimeout because there's no need for a full debounce hook.
  useEffect(() => {
    if (!currentDesignId) return;
    const handle = setTimeout(() => { void save(); }, 2000);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designName]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportLocal = useCallback((format: "png" | "jpg") => {
    const c = fabricRef.current;
    if (!c) return;
    setExporting(format);
    try {
      // Render at 1x — Fabric's toDataURL respects current viewport zoom.
      const prevZoom = c.getZoom();
      c.setZoom(1);
      c.setDimensions({ width: canvasDoc.width, height: canvasDoc.height });
      // JPEG has no alpha; a transparent canvas would composite onto black.
      const prevBg = c.backgroundColor;
      if (format === "jpg" && isTransparent(canvasDoc)) c.backgroundColor = "#FFFFFF";
      // Fabric.js v6 uses the MIME-style "jpeg" identifier; we keep the user-
      // facing "jpg" label but translate at the boundary.
      const dataUrl = c.toDataURL({
        format: format === "jpg" ? "jpeg" : "png",
        quality: format === "jpg" ? 0.95 : 1,
        multiplier: 1,
      });
      // Restore viewport.
      c.backgroundColor = prevBg;
      c.setZoom(prevZoom);
      c.setDimensions({ width: canvasDoc.width * prevZoom, height: canvasDoc.height * prevZoom });
      // Trigger browser download.
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${(designName || "design").replace(/[^\w.-]+/g, "_")}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
      setExportPickerOpen(false);
    }
  }, [canvasDoc.width, canvasDoc.height, designName]);

  // Server-side export — saves the design (so we have a design_id), then
  // POSTs /export which renders + stores a brand_asset row, then navigates
  // to the Asset Library so the user sees the new row.
  const exportToAssetLibrary = useCallback(async () => {
    setExporting("asset");
    setExportError(null);
    try {
      // Ensure design exists server-side before we ask the server to export.
      let dId = currentDesignId;
      if (!dId) {
        const created = await post<DesignDto>("/api/v1/my-brand/designs", {
          canvas: canvasDoc,
          name: designName,
        });
        dId = created?.design_id || null;
        if (dId) setCurrentDesignId(dId);
      } else {
        // Make sure the server has the current canvas before it renders.
        await put<DesignDto>(`/api/v1/my-brand/designs/${dId}`, {
          canvas: canvasDoc,
          name: designName,
        });
      }
      if (!dId) throw new Error("could not create design");
      const out = await post<ExportResult>(`/api/v1/my-brand/designs/${dId}/export`, {
        format: "png",
        width: canvasDoc.width,
        height: canvasDoc.height,
      });
      if (!out?.assetId) throw new Error("export returned no assetId");
      setExportPickerOpen(false);
      navigate(`/app/services/my_brand_assets?focus=${encodeURIComponent(out.assetId)}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }, [canvasDoc, currentDesignId, designName, post, put, navigate]);

  // Send to Social — export to asset, then navigate to composer with the
  // asset id as a query param so the composer pre-fills the image slot.
  const sendToSocial = useCallback(async () => {
    setExporting("asset");
    setExportError(null);
    try {
      let dId = currentDesignId;
      if (!dId) {
        const created = await post<DesignDto>("/api/v1/my-brand/designs", {
          canvas: canvasDoc,
          name: designName,
        });
        dId = created?.design_id || null;
        if (dId) setCurrentDesignId(dId);
      } else {
        await put<DesignDto>(`/api/v1/my-brand/designs/${dId}`, {
          canvas: canvasDoc,
          name: designName,
        });
      }
      if (!dId) throw new Error("could not create design");
      const out = await post<ExportResult>(`/api/v1/my-brand/designs/${dId}/export`, {
        format: "png",
        width: canvasDoc.width,
        height: canvasDoc.height,
      });
      if (!out?.assetId) throw new Error("export returned no assetId");
      navigate(`/app/services/my_brand_compose?asset_ids=${encodeURIComponent(out.assetId)}`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }, [canvasDoc, currentDesignId, designName, post, put, navigate]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Don't intercept when the user is typing in an input/textarea/contenteditable.
      const t = e.target as HTMLElement | null;
      const isTextInput = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        if (isTextInput) return;
        e.preventDefault();
        if (selectedId) duplicateLayer(selectedId);
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        if (isTextInput) return;
        e.preventDefault();
        const snap = undoStackRef.current.pop();
        if (snap) setCanvasDoc(snap);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTextInput) {
        if (selectedId) {
          e.preventDefault();
          deleteLayer(selectedId);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, save, duplicateLayer, deleteLayer, selectedId]);

  // ── File upload handler for image layers ─────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const onUploadImage = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // Upload to the Media Library first so the layer is asset-linked —
      // that's what unlocks Remove background and real-image exports for
      // uploads. If the upload fails, fall back to a local-only layer.
      try {
        const up = await post<{ assetId: string; blobRef: string; url: string; width: number | null; height: number | null }>(
          "/api/v1/my-brand/assets/upload",
          { data: dataUrl, filename: file.name },
        );
        if (up?.assetId) {
          addLibraryImageLayer({
            asset_id: up.assetId, blob_ref: up.blobRef, url: up.url || dataUrl,
            width_px: up.width, height_px: up.height,
          });
          return;
        }
      } catch { /* fall through to local layer */ }
      addImageLayer(dataUrl);
    };
    reader.readAsDataURL(file);
    // Reset so re-uploading the same file fires onchange again.
    e.target.value = "";
  }, [addImageLayer, addLibraryImageLayer, post]);

  const selectedLayer = useMemo(
    () => canvasDoc.layers.find((l) => l.id === selectedId) || null,
    [canvasDoc.layers, selectedId]
  );

  const isEdit = currentDesignId != null;
  const errorMessage = saveError
    ? `Save failed: ${saveError}`
    : exportError
      ? `Export failed: ${exportError}`
      : null;

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  return (
    <IadmModal
      open={open}
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · DESIGN STUDIO"
      title={isEdit ? "Edit design" : "New design"}
      size="xl"
      headerActions={
        <>
          {saving ? (
            <span className="text-[11px] text-white/60">Saving…</span>
          ) : lastSavedAt && !saveError ? (
            <span className="text-[11px] text-white/60">
              Saved {lastSavedAt.toLocaleTimeString()}
            </span>
          ) : null}
          <input
            type="text"
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            placeholder="Design name"
            className="w-56 rounded border border-white/20 bg-white/10 px-2 py-1 text-sm text-white placeholder:text-white/40 focus:border-white/50 focus:outline-none"
          />
        </>
      }
      footer={
        <>
          {/* No Delete slot — LUMEN-API has no DELETE /my-brand/designs route. */}
          <IadmButton
            variant="ghost"
            onClick={() => setExportPickerOpen(true)}
            disabled={!!exporting}
            icon={<Download className="h-3 w-3" />}
          >
            {exporting ? "Exporting…" : "Export"}
          </IadmButton>
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={() => void save()}
            disabled={saving || !ready}
            icon={<Save className="h-3 w-3" />}
          >
            {saving ? "Saving…" : "Save"}
          </IadmButton>
          <IadmButton
            variant="accent"
            product="spark"
            onClick={() => void sendToSocial()}
            disabled={!!exporting || !ready}
            icon={<Send className="h-3 w-3" />}
          >
            Send to Social
          </IadmButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {errorMessage && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {/* LEFT — Insert rail (Canva-style: everything you can add) */}
          <InsertRail
            onAddText={addTextLayer}
            onAddShape={addShapeLayer}
            onAddIcon={addIconLayer}
            onAddElement={addElementPreset}
            onUploadImage={() => fileInputRef.current?.click()}
            onOpenLibrary={() => setLibraryOpen(true)}
            onAddChart={addChartLayer}
            onMore={setMoreOpen}
            ai={{
              prompt: aiPrompt, busy: aiBusy, options: aiOptions, error: aiError,
              setPrompt: setAiPrompt, write: () => void aiWrite(),
              generate: () => void aiGenerate(), apply: aiApplyOption,
            }}
          />

          {/* CENTER — canvas */}
          <div className="relative flex min-w-0 flex-1 flex-col bg-slate-100">
            {/* Pan/zoom toolbar */}
            <div className="absolute right-4 top-3 z-10 flex items-center gap-1 rounded border border-slate-200 bg-white px-1 py-0.5 shadow-sm">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.25, z - 0.1))} className="rounded p-1.5 hover:bg-slate-100" title="Zoom out">
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="px-1 text-[11px] tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((z) => Math.min(4, z + 0.1))} className="rounded p-1.5 hover:bg-slate-100" title="Zoom in">
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={fitZoom} className="rounded p-1.5 hover:bg-slate-100" title="Fit to screen">
                <Maximize className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Background-color picker (also acts as the canvas dimensions config) */}
            <div className="absolute left-4 top-3 z-10 flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <label className="text-[10px] uppercase tracking-wide text-slate-500">BG</label>
              <input
                type="color"
                value={isTransparent(canvasDoc) ? "#FFFFFF" : (canvasDoc.background_color || "#FFFFFF")}
                onChange={(e) => setBackgroundColor(e.target.value)}
                className="h-5 w-7 cursor-pointer rounded border border-slate-200"
              />
              <button
                type="button"
                onClick={() => setBackgroundColor(isTransparent(canvasDoc) ? "#FFFFFF" : "transparent")}
                className={"rounded px-1.5 py-0.5 text-[10px] font-semibold " +
                  (isTransparent(canvasDoc) ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100")}
                title="Transparent background — PNG exports keep alpha (logos, icons)"
              >
                None
              </button>
              <span className="text-[10px] text-slate-500">
                {canvasDoc.width}×{canvasDoc.height}
              </span>
              <div className="h-4 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() => setResizeOpen(true)}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                title="Smart Resize — one design, every platform size"
              >
                <Scaling className="h-3 w-3" /> Resize
              </button>
              <button
                type="button"
                onClick={hasSmartResize ? applyBrandSync : undefined}
                disabled={!hasSmartResize}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
                title={hasSmartResize
                  ? "Brand Sync — remap every color in this design to your brand palette (undo with ⌘Z)"
                  : "Brand Sync is a Pro feature"}
              >
                <Palette className="h-3 w-3" /> Brand Sync{!hasSmartResize && " · Pro+"}
              </button>
            </div>

            {/* The canvas itself — auto-fit by default (fitZoom); m-auto
                centers when smaller than the host, scrolls when zoomed in. */}
            <div ref={canvasHostRef} className="flex flex-1 overflow-auto p-6">
              <div
                className="relative m-auto flex-shrink-0 shadow-lg"
                style={{
                  width: canvasDoc.width * zoom,
                  height: canvasDoc.height * zoom,
                  // Checkerboard shows through wherever the design is
                  // transparent (logo/icon mode); solid canvases cover it.
                  backgroundColor: "#fff",
                  backgroundImage: isTransparent(canvasDoc)
                    ? "conic-gradient(#e2e8f0 90deg, transparent 90deg 180deg, #e2e8f0 180deg 270deg, transparent 270deg)"
                    : undefined,
                  backgroundSize: isTransparent(canvasDoc) ? "20px 20px" : undefined,
                }}
              >
                <canvas ref={canvasElRef} />
                {/* Snap guide lines — canvas coords × zoom, drawn over the canvas. */}
                {guides.v !== null && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 w-px bg-pink-500"
                    style={{ left: guides.v * zoom }}
                  />
                )}
                {guides.h !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500"
                    style={{ top: guides.h * zoom }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* RIGHT — properties for the selection + layers */}
          <aside className="flex w-80 flex-col border-l border-slate-200 bg-white">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onUploadImage}
              className="hidden"
            />
            <div className="min-h-0 flex-[1.4] overflow-y-auto border-b border-slate-200">
              {selectedLayer ? (
                <LayerPropertiesPanel
                  layer={selectedLayer}
                  canvasW={canvasDoc.width}
                  canvasH={canvasDoc.height}
                  palette={brandPalette}
                  onUpdate={(patch) => updateLayer(selectedLayer.id, patch)}
                  onDelete={() => deleteLayer(selectedLayer.id)}
                  onDuplicate={() => duplicateLayer(selectedLayer.id)}
                  onForward={() => reorderLayer(selectedLayer.id, "up")}
                  onBack={() => reorderLayer(selectedLayer.id, "down")}
                  onFixContrast={() => fixTextContrast(selectedLayer.id)}
                  onRemoveBackground={
                    selectedLayer.kind === "image" && (selectedLayer as ImageLayer).asset_id && hasSmartResize
                      ? () => void removeLayerBackground(selectedLayer.id)
                      : undefined
                  }
                  removeBackgroundBusy={bgRemoveBusy}
                  removeBackgroundError={bgRemoveError}
                />
              ) : (
                <div className="p-4 text-xs text-slate-500">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Properties</div>
                  Select a layer on the canvas — or add one from the left rail — to
                  edit its text, colors, size, and effects here.
                </div>
              )}
              {/* Chart data editor rides under the properties for chart layers. */}
              {selectedLayer?.kind === "chart" && (
                <ChartDataPanel
                  layer={selectedLayer as ChartLayer}
                  onUpdate={(patch) => updateLayer(selectedLayer.id, patch)}
                />
              )}
            </div>

            <div className="border-b border-slate-200 px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Layers ({canvasDoc.layers.length})
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {canvasDoc.layers.length === 0 ? (
                <div className="m-3 rounded-lg border-2 border-dashed border-slate-200 p-4 text-center">
                  <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <Layers className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="text-xs text-slate-500">
                    No layers yet. Add text or a shape above, or start from a template.
                  </div>
                </div>
              ) : (
                // Render in reverse so the topmost layer (highest z) is at top.
                [...canvasDoc.layers].reverse().map((layer) => (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    selected={layer.id === selectedId}
                    onSelect={() => setSelectedId(layer.id)}
                    onToggleVisibility={() => toggleLayerVisibility(layer.id)}
                    onForward={() => reorderLayer(layer.id, "up")}
                    onBack={() => reorderLayer(layer.id, "down")}
                  />
                ))
              )}
            </div>

            {/* Keyboard shortcuts hint */}
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
              <div className="font-semibold uppercase tracking-wide">Shortcuts</div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
                <span>Save</span><span className="text-right">⌘/Ctrl+S</span>
                <span>Duplicate</span><span className="text-right">⌘/Ctrl+D</span>
                <span>Undo</span><span className="text-right">⌘/Ctrl+Z</span>
                <span>Delete</span><span className="text-right">Del</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Media Library picker — place an existing brand asset on the canvas. */}
      {libraryOpen && (
        <AssetPickerModal
          onClose={() => setLibraryOpen(false)}
          onPick={addLibraryImageLayer}
        />
      )}

      {/* "⋯ more" catalogs — full element/shape/icon grids behind one tap. */}
      {moreOpen && (
        <IadmModal
          open
          onClose={() => setMoreOpen(null)}
          product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO"
          title={moreOpen === "elements" ? "Elements & shapes" : "Icons"}
          size="nav"
        >
          <div className="max-h-[55vh] overflow-y-auto p-4">
            {moreOpen === "elements" ? (
              <>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Ready-made</div>
                <div className="mb-3 grid grid-cols-3 gap-1.5">
                  {ELEMENT_PRESETS.map((p) => (
                    <button key={p.key} type="button"
                      onClick={() => { addElementPreset(p.key); setMoreOpen(null); }}
                      className="rounded border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-700 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5">
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Basic shapes</div>
                <div className="mb-3 grid grid-cols-6 gap-1.5">
                  <AddLayerButton icon={Square} label="Rect" onClick={() => { addShapeLayer("rect"); setMoreOpen(null); }} />
                  <AddLayerButton icon={Circle} label="Ellipse" onClick={() => { addShapeLayer("ellipse"); setMoreOpen(null); }} />
                  <AddLayerButton icon={Minus} label="Line" onClick={() => { addShapeLayer("line"); setMoreOpen(null); }} />
                </div>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Decorative — blobs, waves, arches</div>
                <div className="grid grid-cols-8 gap-1.5">
                  {Object.entries(ICON_PATHS).filter(([k]) => DECOR_KEYS.has(k)).map(([key, d]) => (
                    <button key={key} type="button" title={key}
                      onClick={() => { addIconLayer(key); setMoreOpen(null); }}
                      className="flex aspect-square items-center justify-center rounded border border-slate-200 hover:border-[#EF6C33]">
                      <svg viewBox="0 0 100 100" className="h-7 w-7"><path d={d} fillRule="evenodd" fill="#94A3B8" /></svg>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-8 gap-1.5">
                {Object.entries(ICON_PATHS).filter(([k]) => !DECOR_KEYS.has(k)).map(([key, d]) => (
                  <button key={key} type="button" title={key}
                    onClick={() => { addIconLayer(key); setMoreOpen(null); }}
                    className="flex aspect-square items-center justify-center rounded border border-slate-200 hover:border-[#EF6C33]">
                    <svg viewBox="0 0 100 100" className="h-7 w-7"><path d={d} fillRule="evenodd" fill="#334155" /></svg>
                  </button>
                ))}
              </div>
            )}
          </div>
        </IadmModal>
      )}

      {/* Smart Resize picker — one design → every platform size (Pro+). */}
      {resizeOpen && (
        <IadmModal
          open
          onClose={() => setResizeOpen(false)}
          product="spark"
          eyebrow="MY BRAND · DESIGN STUDIO"
          title="Smart Resize"
          subtitle={hasSmartResize
            ? "Relayout this design for another platform size — text and layers re-anchor automatically."
            : "Smart Resize is a Pro feature."}
          size="nav"
        >
          <div className="p-5">
            {!hasSmartResize && (
              <div className="mb-3 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                Upgrade to Pro to resize a design for every platform in one click.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              {SIZE_PRESETS.map((p) => {
                const active = canvasDoc.width === p.w && canvasDoc.height === p.h;
                return (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!hasSmartResize || active}
                    onClick={() => applyResize(p.w, p.h)}
                    className={`flex items-center justify-between rounded-lg border-2 px-3 py-2 text-left text-xs transition-colors ${
                      active
                        ? "border-[#EF6C33] bg-[#EF6C33]/5 text-slate-900"
                        : hasSmartResize
                          ? "border-slate-200 bg-white text-slate-700 hover:border-[#EF6C33] hover:bg-[#EF6C33]/5"
                          : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                    }`}
                  >
                    <span className="font-semibold">{p.label}</span>
                    <span className="tabular-nums text-slate-400">{p.w}×{p.h}</span>
                  </button>
                );
              })}
            </div>
            {!hasSmartResize && (
              <div className="mt-3 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Pro+
              </div>
            )}
          </div>
        </IadmModal>
      )}

      {/* Export picker — nested IadmModal size="nav" (F-107: pickers are nav-
          sized choice modals; replaces the old hand-rolled absolute dropdown). */}
      {exportPickerOpen && (
        <IadmModal
          open
          onClose={() => setExportPickerOpen(false)}
          product="spark"
          eyebrow="MY BRAND · TEMPLATE STUDIO"
          title="Export design"
          subtitle="Where should this design go?"
          size="nav"
        >
          <div className="grid grid-cols-1 gap-3 p-5">
            <button
              type="button"
              onClick={() => exportLocal("png")}
              disabled={!!exporting}
              className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Download PNG</div>
                <div className="text-xs leading-snug text-slate-500">Full-quality PNG saved to your device.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => exportLocal("jpg")}
              disabled={!!exporting}
              className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Download className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Download JPG</div>
                <div className="text-xs leading-snug text-slate-500">Compressed JPG (95% quality) saved to your device.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => void exportToAssetLibrary()}
              disabled={!!exporting}
              className="group flex items-start gap-3 rounded-lg border-2 border-slate-200 bg-white p-4 text-left transition-colors hover:border-[#EF6C33] hover:bg-[#EF6C33]/5 disabled:opacity-50"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-[#EF6C33]/10 text-[#EF6C33]">
                <FileImage className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">Export to Asset Library</div>
                <div className="text-xs leading-snug text-slate-500">Render server-side and save as a brand asset.</div>
              </div>
            </button>
          </div>
        </IadmModal>
      )}
    </IadmModal>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS — kept in this file because they're tightly coupled to the
// canvas state and don't benefit from being shared elsewhere.
// ────────────────────────────────────────────────────────────────────────────

function AddLayerButton({
  icon: Icon, label, onClick,
}: {
  icon: typeof TypeIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 hover:border-[#1A3A4A] hover:bg-slate-50"
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </button>
  );
}

// ── Chart data editor (L3) ──────────────────────────────────────────────────
// Enter numbers → the chart re-renders in brand colors. Bounded to the same
// 12-value cap the server enforces.
const MAX_CHART_VALUES = 12;

function ChartDataPanel({
  layer, onUpdate,
}: {
  layer: ChartLayer;
  onUpdate: (patch: Partial<ChartLayer>) => void;
}) {
  const values = layer.values || [];
  function setRow(i: number, patch: Partial<{ label: string; value: number }>) {
    const next = values.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onUpdate({ values: next });
  }
  return (
    <div className="border-b border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Chart data</span>
        <div className="flex gap-1 rounded bg-slate-100 p-0.5">
          {(["bar", "donut", "line"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onUpdate({ chart: t })}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                layer.chart === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              type="text"
              value={v.label ?? ""}
              placeholder="Label"
              onChange={(e) => setRow(i, { label: e.target.value })}
              className="w-0 flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[11px]"
            />
            <input
              type="number"
              value={v.value}
              onChange={(e) => setRow(i, { value: Math.max(0, Number(e.target.value) || 0) })}
              className="w-16 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] tabular-nums"
            />
            <button
              type="button"
              onClick={() => onUpdate({ values: values.filter((_, idx) => idx !== i) })}
              disabled={values.length <= 1}
              className="rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
              title="Remove row"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onUpdate({ values: [...values, { label: "", value: 0 }] })}
        disabled={values.length >= MAX_CHART_VALUES}
        className="mt-2 inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        <Plus className="h-3 w-3" /> Add value
      </button>
      <div className="mt-1.5 text-[10px] text-slate-400">
        Exports render in your brand colors automatically.
      </div>
    </div>
  );
}

function LayerRow({
  layer, selected, onSelect, onToggleVisibility, onForward, onBack,
}: {
  layer: Layer;
  selected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onForward: () => void;
  onBack: () => void;
}) {
  const visible = layer.visible !== false;
  let icon: typeof TypeIcon = TypeIcon;
  let label = "Text";
  if (layer.kind === "image") { icon = ImageIcon; label = "Image"; }
  else if (layer.kind === "chart") {
    icon = BarChart3;
    label = `Chart · ${(layer as ChartLayer).chart}`;
  }
  else if (layer.kind === "shape") {
    const sh = (layer as ShapeLayer).shape;
    label = sh === "rect" ? "Rectangle"
      : sh === "ellipse" ? "Ellipse"
      : sh === "icon" ? `Icon · ${(layer as ShapeLayer).icon || "?"}`
      : "Line";
    icon = sh === "ellipse" ? Circle : sh === "line" ? Minus : sh === "icon" ? Star : Square;
  } else if (layer.kind === "text") {
    label = (layer as TextLayer).content || "Text";
  }
  const Icon = icon;
  return (
    <div
      onClick={onSelect}
      className={
        "group flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 " +
        (selected ? "bg-yellow-50" : "hover:bg-slate-50")
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0 text-slate-500" />
      <span className="flex-1 truncate text-xs">{label}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onForward(); }}
        className="invisible rounded p-1 hover:bg-slate-200 group-hover:visible"
        title="Bring forward"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onBack(); }}
        className="invisible rounded p-1 hover:bg-slate-200 group-hover:visible"
        title="Send back"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
        className="rounded p-1 hover:bg-slate-200"
        title={visible ? "Hide" : "Show"}
      >
        {visible ? <Eye className="h-3 w-3 text-slate-500" /> : <EyeOff className="h-3 w-3 text-slate-400" />}
      </button>
    </div>
  );
}

// ── Insert rail (left) — everything you can add, Canva-style ───────────────
const ELEMENT_PRESETS: Array<{ key: string; label: string }> = [
  { key: "cta", label: "CTA button" },
  { key: "burst", label: "SALE burst" },
  { key: "pricetag", label: "Price tag" },
  { key: "testimonial", label: "Testimonial" },
  { key: "grid2x2", label: "Photo grid 2×2" },
  { key: "strip12", label: "Photo strip 1+2" },
];

interface AiRailState {
  prompt: string;
  busy: "write" | "image" | null;
  options: string[];
  error: string | null;
  setPrompt: (v: string) => void;
  write: () => void;
  generate: () => void;
  apply: (text: string) => void;
}

function InsertRail({
  onAddText, onAddShape, onAddIcon, onAddElement, onUploadImage, onOpenLibrary, onAddChart, onMore, ai,
}: {
  onAddText: (preset: TextPresetKey) => void;
  onAddShape: (shape: "rect" | "ellipse" | "line") => void;
  onAddIcon: (icon: string) => void;
  onAddElement: (key: string) => void;
  onUploadImage: () => void;
  onOpenLibrary: () => void;
  onAddChart: () => void;
  onMore: (kind: "elements" | "icons") => void;
  ai: AiRailState;
}) {
  const iconEntries = Object.entries(ICON_PATHS).filter(([k]) => !DECOR_KEYS.has(k));
  return (
    <aside className="flex w-60 flex-shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      {/* AI Assist — describe it, credits do it. */}
      <div className="border-b border-slate-100 bg-slate-50 p-3">
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
          <Sparkles className="h-3 w-3 text-[#EF6C33]" /> AI Assist
        </div>
        <textarea
          value={ai.prompt}
          onChange={(e) => ai.setPrompt(e.target.value)}
          placeholder='Describe it — "punchy headline for our spring special" or "a golden retriever in a hard hat"'
          rows={3}
          className="w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-[11px] focus:border-[#EF6C33] focus:outline-none"
        />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={ai.write}
            disabled={!ai.prompt.trim() || !!ai.busy}
            className="rounded bg-[#1A3A4A] px-2 py-1.5 text-[10px] font-bold text-white hover:bg-[#14303e] disabled:opacity-40"
          >
            {ai.busy === "write" ? "Writing…" : "Write copy · 1cr"}
          </button>
          <button
            type="button"
            onClick={ai.generate}
            disabled={!ai.prompt.trim() || !!ai.busy}
            className="rounded bg-[#EF6C33] px-2 py-1.5 text-[10px] font-bold text-white hover:bg-[#d75a25] disabled:opacity-40"
          >
            {ai.busy === "image" ? "Generating…" : "Make image · 8cr"}
          </button>
        </div>
        {ai.error && (
          <div className="mt-1.5 rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">{ai.error}</div>
        )}
        {ai.options.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {ai.options.map((o, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ai.apply(o)}
                className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-left text-[11px] text-slate-700 hover:border-[#EF6C33]"
              >
                {o}
              </button>
            ))}
            <div className="text-[9px] text-slate-400">Click one — it replaces the selected text or drops in fresh.</div>
          </div>
        )}
      </div>

      <div className="p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Text</div>
        <div className="space-y-1">
          <button type="button" onClick={() => onAddText("heading")}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-left text-base font-bold text-slate-800 hover:border-[#1A3A4A] hover:bg-slate-50">
            Add a heading
          </button>
          <button type="button" onClick={() => onAddText("subheading")}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-left text-sm font-semibold text-slate-700 hover:border-[#1A3A4A] hover:bg-slate-50">
            Add a subheading
          </button>
          <button type="button" onClick={() => onAddText("body")}
            className="w-full rounded border border-slate-200 px-2 py-1.5 text-left text-xs text-slate-600 hover:border-[#1A3A4A] hover:bg-slate-50">
            Add body text
          </button>
        </div>
      </div>

      {/* Elements — the 4 most-used + More (full catalog in a picker). */}
      <div className="border-t border-slate-100 p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Elements</div>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => onAddElement("cta")}
            className="rounded border border-slate-200 px-1.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-[#1A3A4A] hover:bg-slate-50">
            CTA button
          </button>
          <button type="button" onClick={() => onAddElement("grid2x2")}
            className="rounded border border-slate-200 px-1.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-[#1A3A4A] hover:bg-slate-50">
            Photo grid
          </button>
          <AddLayerButton icon={Square} label="Rect" onClick={() => onAddShape("rect")} />
          <AddLayerButton icon={Circle} label="Ellipse" onClick={() => onAddShape("ellipse")} />
        </div>
        <button
          type="button"
          onClick={() => onMore("elements")}
          className="mt-1.5 w-full rounded border border-dashed border-slate-300 px-2 py-1.5 text-[10px] font-semibold text-slate-500 hover:border-[#1A3A4A] hover:text-slate-700"
        >
          ⋯ All elements & shapes
        </button>
      </div>

      {/* Icons — top 5 + More. */}
      <div className="border-t border-slate-100 p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Icons</div>
        <div className="grid grid-cols-5 gap-1">
          {iconEntries.slice(0, 5).map(([key, d]) => (
            <button
              key={key}
              type="button"
              onClick={() => onAddIcon(key)}
              title={key}
              className="flex aspect-square items-center justify-center rounded border border-slate-200 hover:border-[#1A3A4A] hover:bg-slate-50"
            >
              <svg viewBox="0 0 100 100" className="h-5 w-5">
                <path d={d} fillRule="evenodd" fill="#334155" />
              </svg>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onMore("icons")}
          className="mt-1.5 w-full rounded border border-dashed border-slate-300 px-2 py-1.5 text-[10px] font-semibold text-slate-500 hover:border-[#1A3A4A] hover:text-slate-700"
        >
          ⋯ All {iconEntries.length} icons
        </button>
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Media & data</div>
        <div className="grid grid-cols-2 gap-1.5">
          <AddLayerButton icon={Upload} label="Upload" onClick={onUploadImage} />
          <AddLayerButton icon={ImageIcon} label="Library" onClick={onOpenLibrary} />
          <AddLayerButton icon={BarChart3} label="Chart" onClick={onAddChart} />
        </div>
      </div>
    </aside>
  );
}

// ── Media Library asset picker — place an existing brand asset ─────────────
interface PickerAsset {
  asset_id: string;
  blob_ref: string | null;
  url: string | null;
  width_px?: number | null;
  height_px?: number | null;
  kind?: string;
}

function AssetPickerModal({ onClose, onPick }: {
  onClose: () => void;
  onPick: (asset: PickerAsset) => void;
}) {
  const { get, ready } = useLumenApi();
  const [assets, setAssets] = useState<PickerAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        // lumenApi unwraps { data }, leaving { rows } (imageStudio list shape).
        const r = await get<{ rows?: PickerAsset[] }>("/api/v1/my-brand/assets?kind=image&limit=60");
        if (!cancelled) setAssets((r?.rows || []).filter((a) => a.url));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [ready, get]);

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · DESIGN STUDIO"
      title="Place from Media Library"
      subtitle="Your generated, edited, and uploaded images"
      size="nav"
    >
      <div className="max-h-[50vh] overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">{error}</div>
        ) : assets.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No images yet — generate one in Image Studio or upload to the Media Library.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {assets.map((a) => (
              <button
                key={a.asset_id}
                type="button"
                onClick={() => onPick(a)}
                className="group aspect-square overflow-hidden rounded border border-slate-200 bg-slate-50 hover:border-[#EF6C33]"
                title={`${a.width_px || "?"}×${a.height_px || "?"}`}
              >
                <img src={a.url || ""} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </button>
            ))}
          </div>
        )}
      </div>
    </IadmModal>
  );
}

// ── Color field with brand-palette swatches ────────────────────────────────
function ColorField({
  label, value, fallback, palette, onChange,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  palette: Record<string, string> | null;
  onChange: (color: string) => void;
}) {
  const swatches = palette
    ? [palette.primary, palette.secondary, palette.text, palette.background]
    : ["#1A3A4A", "#FEC82C", "#111827", "#FFFFFF"];
  const current = value && value !== "none" ? value : fallback;
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="flex items-center gap-1">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(current) ? current : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 cursor-pointer rounded border border-slate-200"
        />
        {swatches.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            onClick={() => onChange(c)}
            title={["Brand primary", "Brand secondary", "Brand text", "Brand background"][i]}
            className="h-5 w-5 rounded border border-slate-300 hover:scale-110"
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

// Small numeric input for the position/size grid.
function NumField({ label, value, onChange, step = 1, min }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; min?: number;
}) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-slate-600">
      <span className="w-4 text-[10px] font-semibold uppercase text-slate-400">{label}</span>
      <input
        type="number"
        value={Math.round(value * 10) / 10}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-0.5 tabular-nums"
      />
    </label>
  );
}

// ── Layer properties panel (right) — full styling for the selection ────────
function LayerPropertiesPanel({
  layer, canvasW, canvasH, palette, onUpdate, onDelete, onDuplicate, onForward, onBack,
  onFixContrast, onRemoveBackground, removeBackgroundBusy, removeBackgroundError,
}: {
  layer: Layer;
  canvasW: number;
  canvasH: number;
  palette: Record<string, string> | null;
  onUpdate: (patch: Partial<Layer>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBack: () => void;
  onFixContrast?: () => void;
  onRemoveBackground?: () => void;
  removeBackgroundBusy?: boolean;
  removeBackgroundError?: string | null;
}) {
  const kindLabel =
    layer.kind === "text" ? "Text"
    : layer.kind === "image" ? "Image"
    : layer.kind === "chart" ? "Chart"
    : (layer as ShapeLayer).shape === "icon" ? "Icon"
    : "Shape";
  const locked = layer.locked === true;

  // Align the layer's box to the canvas edges/centers (bucket-1 align).
  function align(which: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    if (which === "left") onUpdate({ x: 0 });
    if (which === "hcenter") onUpdate({ x: Math.round((canvasW - layer.w) / 2) });
    if (which === "right") onUpdate({ x: Math.round(canvasW - layer.w) });
    if (which === "top") onUpdate({ y: 0 });
    if (which === "vcenter") onUpdate({ y: Math.round((canvasH - layer.h) / 2) });
    if (which === "bottom") onUpdate({ y: Math.round(canvasH - layer.h) });
  }

  return (
    <div className="p-3">
      {/* Header: kind + quick actions */}
      <div className="mb-2 flex items-center gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kindLabel}</span>
        <div className="ml-auto flex items-center">
          <button type="button" onClick={onForward} className="rounded p-1 hover:bg-slate-100" title="Bring forward">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onBack} className="rounded p-1 hover:bg-slate-100" title="Send back">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDuplicate} className="rounded p-1 hover:bg-slate-100" title="Duplicate (⌘D)">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ locked: !locked })}
            className={"rounded p-1 " + (locked ? "bg-amber-100 text-amber-700" : "hover:bg-slate-100")}
            title={locked ? "Unlock layer" : "Lock layer"}
          >
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onDelete} className="rounded p-1 hover:bg-rose-100 hover:text-rose-600" title="Delete (Del)">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Position + size */}
      <div className="mb-2 grid grid-cols-2 gap-1.5">
        <NumField label="X" value={layer.x} onChange={(v) => onUpdate({ x: Math.round(v) })} />
        <NumField label="Y" value={layer.y} onChange={(v) => onUpdate({ y: Math.round(v) })} />
        <NumField label="W" value={layer.w} min={1} onChange={(v) => onUpdate({ w: Math.max(1, Math.round(v)) })} />
        <NumField label="H" value={layer.h} min={0} onChange={(v) => onUpdate({ h: Math.max(0, Math.round(v)) })} />
      </div>

      {/* Rotation / opacity / flips */}
      <div className="mb-2 flex items-center gap-1.5">
        <NumField label="↻" value={layer.rotation || 0} onChange={(v) => onUpdate({ rotation: ((Math.round(v) % 360) + 360) % 360 })} />
        <button
          type="button"
          onClick={() => onUpdate({ flipH: !layer.flipH })}
          className={"rounded border px-1.5 py-1 text-[10px] font-semibold " + (layer.flipH ? "border-[#1A3A4A] bg-slate-100" : "border-slate-200 hover:bg-slate-50")}
          title="Flip horizontal"
        >
          <FlipHorizontal2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onUpdate({ flipV: !layer.flipV })}
          className={"rounded border px-1.5 py-1 text-[10px] font-semibold " + (layer.flipV ? "border-[#1A3A4A] bg-slate-100" : "border-slate-200 hover:bg-slate-50")}
          title="Flip vertical"
        >
          <FlipVertical2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mb-2">
        <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Opacity</span><span className="tabular-nums">{Math.round((layer.opacity ?? 1) * 100)}%</span>
        </div>
        <input
          type="range" min={0} max={100}
          value={Math.round((layer.opacity ?? 1) * 100)}
          onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
          className="w-full"
        />
      </div>

      {/* Align to canvas */}
      <div className="mb-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Align to canvas</div>
        <div className="flex gap-1">
          {([
            ["left", AlignStartVertical], ["hcenter", AlignCenterVertical], ["right", AlignEndVertical],
            ["top", AlignStartHorizontal], ["vcenter", AlignCenterHorizontal], ["bottom", AlignEndHorizontal],
          ] as const).map(([which, Icon]) => (
            <button
              key={which}
              type="button"
              onClick={() => align(which)}
              className="rounded border border-slate-200 p-1 hover:border-[#1A3A4A] hover:bg-slate-50"
              title={`Align ${which}`}
            >
              <Icon className="h-3.5 w-3.5 text-slate-600" />
            </button>
          ))}
        </div>
      </div>

      {/* Text styling */}
      {layer.kind === "text" && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Text</div>
            <textarea
              value={(layer as TextLayer).content}
              onChange={(e) => onUpdate({ content: e.target.value } as Partial<Layer>)}
              rows={2}
              className="w-full resize-y rounded border border-slate-200 px-2 py-1.5 text-[12px] focus:border-[#EF6C33] focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Font</div>
            <div className="flex gap-1">
              <select
                value={(layer as TextLayer).font || DEFAULT_FONTS[0]}
                onChange={(e) => onUpdate({ font: e.target.value })}
                className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              >
                {DEFAULT_FONTS.map((f) => <option key={f} value={f}>{f.split(",")[0]}</option>)}
              </select>
              <input
                type="number" min={6} max={500}
                value={(layer as TextLayer).size || 24}
                onChange={(e) => onUpdate({ size: Math.max(6, Number(e.target.value) || 24) })}
                className="w-14 rounded border border-slate-200 px-1.5 py-1 text-[11px] tabular-nums"
                title="Font size"
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onUpdate({ weight: (layer as TextLayer).weight === "700" ? "400" : "700" })}
              className={"rounded border p-1.5 " + ((layer as TextLayer).weight === "700" ? "border-[#1A3A4A] bg-slate-100" : "border-slate-200 hover:bg-slate-50")}
              title="Bold"
            >
              <Bold className="h-3 w-3" />
            </button>
            {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([a, Icon]) => (
              <button
                key={a}
                type="button"
                onClick={() => onUpdate({ align: a })}
                className={"rounded border p-1.5 " + ((layer as TextLayer).align === a ? "border-[#1A3A4A] bg-slate-100" : "border-slate-200 hover:bg-slate-50")}
                title={`Align ${a}`}
              >
                <Icon className="h-3 w-3" />
              </button>
            ))}
            <select
              value={
                (layer as TextLayer).effect === "lift" ? "lift"
                : (layer as TextLayer).effect === "hollow" ? "hollow"
                : (layer as TextLayer).outline ? "outline"
                : (layer as TextLayer).shadow ? "shadow"
                : "none"
              }
              onChange={(e) => {
                const v = e.target.value;
                const reset = { shadow: false, effect: undefined, outline: undefined } as Partial<Layer>;
                if (v === "shadow") onUpdate({ ...reset, shadow: true } as Partial<Layer>);
                else if (v === "lift") onUpdate({ ...reset, effect: "lift" } as Partial<Layer>);
                else if (v === "hollow") onUpdate({ ...reset, effect: "hollow" } as Partial<Layer>);
                else if (v === "outline") onUpdate({ ...reset, outline: (palette?.primary || "#1A3A4A") } as Partial<Layer>);
                else onUpdate(reset);
              }}
              className="ml-auto rounded border border-slate-200 px-1.5 py-1 text-[11px]"
              title="Text effect"
            >
              <option value="none">No effect</option>
              <option value="shadow">Shadow</option>
              <option value="lift">Lift</option>
              <option value="outline">Outline</option>
              <option value="hollow">Hollow</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Line height
              <input
                type="number" step={0.05} min={0.7} max={3}
                value={(layer as TextLayer).lineHeight ?? 1.2}
                onChange={(e) => onUpdate({ lineHeight: Math.max(0.7, Number(e.target.value) || 1.2) })}
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
              />
            </label>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Letter spacing
              <input
                type="number" step={0.5} min={-5} max={60}
                value={(layer as TextLayer).letterSpacing ?? 0}
                onChange={(e) => onUpdate({ letterSpacing: Number(e.target.value) || 0 })}
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
              />
            </label>
          </div>
          <ColorField
            label="Color" value={(layer as TextLayer).color} fallback="#111827"
            palette={palette} onChange={(c) => onUpdate({ color: c })}
          />
          {(layer as TextLayer).outline && (
            <ColorField
              label="Outline color" value={(layer as TextLayer).outline} fallback="#1A3A4A"
              palette={palette} onChange={(c) => onUpdate({ outline: c } as Partial<Layer>)}
            />
          )}
          {onFixContrast && (
            <button
              type="button"
              onClick={onFixContrast}
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
              title="Flip this text to white or dark based on what's behind it"
            >
              <Contrast className="h-3 w-3" /> Fix contrast
            </button>
          )}
        </div>
      )}

      {/* Image tools */}
      {layer.kind === "image" && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          {onRemoveBackground ? (
            <button
              type="button"
              onClick={onRemoveBackground}
              disabled={removeBackgroundBusy}
              className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Wand2 className="h-3 w-3" />
              {removeBackgroundBusy ? "Removing…" : "Remove background"}
            </button>
          ) : (
            <div className="text-[10px] text-slate-400">
              Place images from the Library to unlock Remove background (Pro+).
            </div>
          )}
          {removeBackgroundError && (
            <div className="rounded border border-red-200 bg-red-50 p-1.5 text-[10px] text-red-700">
              {removeBackgroundError}
            </div>
          )}
          {/* Photo shape + brand tint — the two-click path to "designed". */}
          <div className="grid grid-cols-2 items-end gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Photo shape
              <select
                value={(layer as ImageLayer).mask || "none"}
                onChange={(e) => onUpdate({ mask: e.target.value === "none" ? undefined : e.target.value as ImageMask } as Partial<Layer>)}
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case"
              >
                <option value="none">Rectangle</option>
                <option value="circle">Circle</option>
                <option value="rounded">Rounded</option>
                <option value="blob1">Organic 1</option>
                <option value="blob2">Organic 2</option>
                <option value="arch">Arch</option>
              </select>
            </label>
            <label className="flex items-center gap-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <input
                type="checkbox"
                checked={!!(layer as ImageLayer).filters?.tint}
                onChange={(e) => onUpdate({
                  filters: {
                    ...((layer as ImageLayer).filters || {}),
                    tint: e.target.checked ? (palette?.primary || "#1A3A4A") : undefined,
                  },
                } as Partial<Layer>)}
              />
              Brand tint
            </label>
          </div>
          {/* GIMP-style adjustments — previewed live, baked into the export. */}
          {(() => {
            const f = (layer as ImageLayer).filters || {};
            const setF = (patch: Partial<ImageFilters>) =>
              onUpdate({ filters: { ...f, ...patch } } as Partial<Layer>);
            return (
              <div className="space-y-1.5">
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Brightness</span><span className="tabular-nums">{Math.round((f.brightness ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range" min={50} max={150}
                    value={Math.round((f.brightness ?? 1) * 100)}
                    onChange={(e) => setF({ brightness: Number(e.target.value) / 100 })}
                    className="w-full"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <span>Saturation</span><span className="tabular-nums">{Math.round((f.saturation ?? 1) * 100)}%</span>
                  </div>
                  <input
                    type="range" min={0} max={200}
                    value={Math.round((f.saturation ?? 1) * 100)}
                    onChange={(e) => setF({ saturation: Number(e.target.value) / 100 })}
                    className="w-full"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <input
                      type="checkbox"
                      checked={f.grayscale === true}
                      onChange={(e) => setF({ grayscale: e.target.checked })}
                    />
                    Black & white
                  </label>
                  {(f.grayscale || (f.brightness && f.brightness !== 1) || (f.saturation && f.saturation !== 1)) && (
                    <button
                      type="button"
                      onClick={() => onUpdate({ filters: undefined } as Partial<Layer>)}
                      className="text-[10px] font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Shape / icon styling */}
      {layer.kind === "shape" && (
        <div className="space-y-2 border-t border-slate-100 pt-2">
          {(layer as ShapeLayer).shape !== "line" && (
            <>
              <div className="flex gap-1 rounded bg-slate-100 p-0.5 text-[10px] font-semibold">
                {(["solid", "gradient"] as const).map((m) => {
                  const active = ((layer as ShapeLayer).gradient ? "gradient" : "solid") === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onUpdate(
                        m === "gradient"
                          ? { gradient: (layer as ShapeLayer).gradient || { from: palette?.primary || "#1A3A4A", to: palette?.secondary || "#FEC82C", dir: "d1" } } as Partial<Layer>
                          : { gradient: undefined } as Partial<Layer>,
                      )}
                      className={`flex-1 rounded px-1.5 py-0.5 capitalize ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
              {(layer as ShapeLayer).gradient ? (
                <>
                  <ColorField
                    label="From" value={(layer as ShapeLayer).gradient!.from} fallback="#1A3A4A"
                    palette={palette}
                    onChange={(c) => onUpdate({ gradient: { ...(layer as ShapeLayer).gradient!, from: c } } as Partial<Layer>)}
                  />
                  <ColorField
                    label="To" value={(layer as ShapeLayer).gradient!.to} fallback="#FEC82C"
                    palette={palette}
                    onChange={(c) => onUpdate({ gradient: { ...(layer as ShapeLayer).gradient!, to: c } } as Partial<Layer>)}
                  />
                  <div className="flex gap-1">
                    {(["h", "v", "d1", "d2"] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onUpdate({ gradient: { ...(layer as ShapeLayer).gradient!, dir: d } } as Partial<Layer>)}
                        className={"rounded border px-2 py-1 text-[11px] " +
                          ((layer as ShapeLayer).gradient!.dir === d ? "border-[#1A3A4A] bg-slate-100 font-bold" : "border-slate-200 hover:bg-slate-50")}
                        title={{ h: "Left to right", v: "Top to bottom", d1: "Diagonal down", d2: "Diagonal up" }[d]}
                      >
                        {{ h: "→", v: "↓", d1: "↘", d2: "↗" }[d]}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ColorField
                  label="Fill" value={(layer as ShapeLayer).fill} fallback="#FEC82C"
                  palette={palette} onChange={(c) => onUpdate({ fill: c })}
                />
              )}
            </>
          )}
          <ColorField
            label="Stroke" value={(layer as ShapeLayer).stroke} fallback="#1A3A4A"
            palette={palette} onChange={(c) => onUpdate({ stroke: c })}
          />
          <div className="grid grid-cols-2 gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Stroke width
              <input
                type="number" min={0} max={60}
                value={(layer as ShapeLayer).strokeWidth ?? 0}
                onChange={(e) => onUpdate({ strokeWidth: Math.max(0, Number(e.target.value) || 0) })}
                className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
              />
            </label>
            {(layer as ShapeLayer).shape === "rect" && (
              <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Corner radius
                <input
                  type="number" min={0} max={400}
                  value={(layer as ShapeLayer).radius ?? 0}
                  onChange={(e) => onUpdate({ radius: Math.max(0, Number(e.target.value) || 0) })}
                  className="mt-0.5 w-full rounded border border-slate-200 px-1.5 py-1 text-[11px] font-normal normal-case tabular-nums"
                />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
// ────────────────────────────────────────────────────────────────────────────
// CanvasDoc <→> Fabric object converter. Encapsulated in pure functions so
// the renderer above stays small and the unit logic is testable in isolation.
// ────────────────────────────────────────────────────────────────────────────

// Swap an async placeholder for its real object AT THE SAME STACK INDEX —
// plain add() appends on top, which floated background blobs above the
// headline in the editor (export order was right; clicks and visuals wrong).
function swapPlaceholder(
  placeholder: fabric.FabricObject,
  real: fabric.FabricObject,
  onSwap?: (obj: fabric.FabricObject) => void,
) {
  const canvas = placeholder.canvas;
  if (!canvas) return;
  const idx = canvas.getObjects().indexOf(placeholder);
  canvas.remove(placeholder);
  canvas.add(real);
  if (idx >= 0) {
    (canvas as unknown as { moveObjectTo?: (o: fabric.FabricObject, i: number) => void })
      .moveObjectTo?.(real, idx);
  }
  onSwap?.(real);
  canvas.requestRenderAll();
}

function layerToFabricObject(
  layer: Layer,
  onSwap?: (obj: fabric.FabricObject) => void,
): fabric.FabricObject | null {
  const locked = layer.locked === true;
  const baseProps = {
    left: layer.x,
    top: layer.y,
    angle: layer.rotation || 0,
    opacity: layer.opacity ?? 1,
    visible: layer.visible !== false,
    flipX: layer.flipH === true,
    flipY: layer.flipV === true,
    selectable: !locked,
    evented: !locked,
    hasControls: !locked,
  };
  if (layer.kind === "text") {
    const t = layer as TextLayer;
    const size = t.size || 24;
    // Textbox (not IText): wraps at the layer width like the export's
    // soft-wrap, so long copy never silently runs off the canvas.
    const itext = new fabric.Textbox(t.content || "", {
      ...baseProps,
      width: t.w,
      fontSize: size,
      fontFamily: t.font || DEFAULT_FONTS[0],
      fontWeight: t.weight || "400",
      textAlign: t.align || "left",
      lineHeight: t.lineHeight || 1.2,
      // Fabric charSpacing is in 1/1000 em; our model stores px.
      charSpacing: t.letterSpacing ? (t.letterSpacing / size) * 1000 : 0,
      // Hollow: stroke-only type. Outline: stroke painted behind the fill.
      ...(t.effect === "hollow"
        ? {
            fill: "transparent",
            stroke: t.color || "#111827",
            strokeWidth: Math.max(1, Math.round(size * 0.05)),
          }
        : {
            fill: t.color || "#111827",
            stroke: t.outline && t.outline !== "none" ? t.outline : undefined,
            strokeWidth: t.outline && t.outline !== "none" ? Math.max(1, Math.round(size * 0.08)) : 0,
          }),
      paintFirst: "stroke",
      // Lift = soft blurred shadow; Shadow = hard offset (both match export).
      shadow: t.effect === "lift"
        ? new fabric.Shadow({
            color: "rgba(0,0,0,0.45)",
            offsetX: 0,
            offsetY: Math.max(1, Math.round(size * 0.06)),
            blur: Math.max(3, Math.round(size * 0.12)),
          })
        : t.shadow
          ? new fabric.Shadow({
              color: "rgba(0,0,0,0.35)",
              offsetX: Math.max(1, Math.round(size * 0.045)),
              offsetY: Math.max(1, Math.round(size * 0.045)),
              blur: 0,
            })
          : undefined,
    });
    return itext;
  }
  if (layer.kind === "image") {
    const il = layer as ImageLayer;
    if (!il.src) {
      // Placeholder rect with diagonal lines — matches the server-side
      // export look so designers see the same slot in editor + export.
      const placeholder = new fabric.Rect({
        ...baseProps,
        width: il.w,
        height: il.h,
        fill: "#E5E7EB",
        stroke: "#9CA3AF",
        strokeWidth: 1,
        strokeDashArray: [6, 4],
      });
      return placeholder;
    }
    // Image is loaded asynchronously — we return a placeholder rect for the
    // synchronous case and swap in the FabricImage when the load resolves.
    // Fabric.js v6 returns a promise from FabricImage.fromURL.
    const placeholder = new fabric.Rect({
      ...baseProps,
      width: il.w,
      height: il.h,
      fill: "#E5E7EB",
      stroke: "#9CA3AF",
      strokeWidth: 1,
    });
    fabric.FabricImage.fromURL(il.src).then((img) => {
      if (!img) return;
      img.set({
        left: il.x,
        top: il.y,
        angle: il.rotation || 0,
        opacity: il.opacity ?? 1,
        visible: il.visible !== false,
        selectable: true,
      });
      // GIMP-style adjustments preview — the export bakes the same values
      // via sharp, so what you see is what ships. Brand tint previews as
      // grayscale + multiply blend (≈ sharp's grayscale().tint()).
      const f = il.filters;
      if (f && (f.grayscale || f.tint || (f.brightness && f.brightness !== 1) || (f.saturation && f.saturation !== 1))) {
        const fx: fabric.filters.BaseFilter<string, Record<string, unknown>>[] = [];
        if (f.brightness && f.brightness !== 1) fx.push(new fabric.filters.Brightness({ brightness: f.brightness - 1 }));
        if (f.saturation && f.saturation !== 1) fx.push(new fabric.filters.Saturation({ saturation: f.saturation - 1 }));
        if (f.grayscale || f.tint) fx.push(new fabric.filters.Grayscale());
        if (f.tint) fx.push(new fabric.filters.BlendColor({ color: f.tint, mode: "multiply" }));
        img.filters = fx;
        try { img.applyFilters(); } catch { /* filter backend unavailable — export still bakes them */ }
      }
      // Photo mask — clip in the image's intrinsic space so it tracks the
      // object's own scaling; identical geometry to the server clipPath.
      if (il.mask) {
        const iw = img.width || 1;
        const ih = img.height || 1;
        let clip: fabric.FabricObject | null = null;
        if (il.mask === "circle") {
          clip = new fabric.Ellipse({ rx: iw / 2, ry: ih / 2, originX: "center", originY: "center" });
        } else if (il.mask === "rounded") {
          const r = Math.min(iw, ih) * 0.12;
          clip = new fabric.Rect({ width: iw, height: ih, rx: r, ry: r, originX: "center", originY: "center" });
        } else {
          const d = ICON_PATHS[il.mask === "arch" ? "arch" : il.mask];
          if (d) {
            clip = new fabric.Path(d, { originX: "center", originY: "center" });
            clip.scaleX = iw / 100;
            clip.scaleY = ih / 100;
          }
        }
        if (clip) img.clipPath = clip;
      }
      // Scale to fit the layer dimensions.
      const sx = il.w / (img.width || 1);
      const sy = il.h / (img.height || 1);
      img.scaleX = sx;
      img.scaleY = sy;
      // Replace the placeholder in the canvas. We have to do this through
      // the live canvas instance from the closure that holds fabricRef.
      swapPlaceholder(placeholder, img, onSwap);
    }).catch(() => { /* swallow — placeholder stays visible */ });
    return placeholder;
  }
  if (layer.kind === "chart") {
    const ch = layer as ChartLayer;
    // Render the chart SVG to a data URL and swap it in asynchronously —
    // same placeholder pattern as image layers.
    const placeholder = new fabric.Rect({
      ...baseProps,
      width: ch.w,
      height: ch.h,
      fill: "transparent",
      stroke: "#CBD5E1",
      strokeWidth: 1,
      strokeDashArray: [4, 3],
    });
    const svg = chartToSvg(ch);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    fabric.FabricImage.fromURL(dataUrl).then((img) => {
      if (!img) return;
      img.set({
        left: ch.x,
        top: ch.y,
        angle: ch.rotation || 0,
        opacity: ch.opacity ?? 1,
        visible: ch.visible !== false,
        selectable: true,
      });
      img.scaleX = ch.w / (img.width || 1);
      img.scaleY = ch.h / (img.height || 1);
      swapPlaceholder(placeholder, img, onSwap);
    }).catch(() => { /* placeholder stays visible */ });
    return placeholder;
  }
  if (layer.kind === "shape") {
    const s = layer as ShapeLayer;
    const fill = s.fill && s.fill !== "none" ? s.fill : "transparent";
    const stroke = s.stroke && s.stroke !== "none" ? s.stroke : undefined;
    const strokeWidth = s.strokeWidth ?? 0;
    if (s.shape === "icon") {
      // Same SVG the server emits, swapped in as an image — guarantees the
      // editor and export show the identical glyph.
      const placeholder = new fabric.Rect({
        ...baseProps,
        width: s.w,
        height: s.h,
        fill: "transparent",
        stroke: "#CBD5E1",
        strokeWidth: 1,
        strokeDashArray: [4, 3],
      });
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconToSvg(s))}`;
      fabric.FabricImage.fromURL(dataUrl).then((img) => {
        if (!img) return;
        img.set({ ...baseProps });
        img.scaleX = s.w / (img.width || 1);
        img.scaleY = s.h / (img.height || 1);
        swapPlaceholder(placeholder, img, onSwap);
      }).catch(() => { /* placeholder stays visible */ });
      return placeholder;
    }
    if (s.shape === "rect") {
      const radius = Math.max(0, Number(s.radius) || 0);
      return new fabric.Rect({
        ...baseProps,
        width: s.w,
        height: s.h,
        rx: radius,
        ry: radius,
        fill: s.gradient ? fabricGradient(s.gradient) : fill,
        stroke,
        strokeWidth,
      });
    }
    if (s.shape === "ellipse") {
      return new fabric.Ellipse({
        ...baseProps,
        rx: s.w / 2,
        ry: s.h / 2,
        // Ellipse rect-aligned bounding box: left/top is the top-left of the
        // bounding rect, not the center.
        originX: "left",
        originY: "top",
        fill: s.gradient ? fabricGradient(s.gradient) : fill,
        stroke,
        strokeWidth,
      });
    }
    if (s.shape === "line") {
      return new fabric.Line(
        [s.x, s.y, s.x + s.w, s.y + s.h],
        {
          stroke: stroke || "#1A3A4A",
          strokeWidth: strokeWidth || 2,
          selectable: true,
          opacity: layer.opacity ?? 1,
          visible: layer.visible !== false,
        }
      );
    }
  }
  return null;
}

export default TemplateStudioEditorModal;

/**
 * families/f3-buttons-icons-panels/deep.ts — what the EIGHT everyday widgets
 * share, written once.
 *
 * ── WHY THIS FILE EXISTS (B-168 wave 2, 2026-09-19) ───────────────────────
 * `button`, `icon`, `icon_box`, `list` (Icon List), `social_links`, `alert`,
 * `divider` and `spacer` were already offered on the panel and were THIN. A
 * Button was four controls and an `<a>` with the accent colour painted on it; a
 * Divider was one select and a bare `<hr/>`; a Spacer was one number. They are
 * the tiles an author reaches for first and the ones Brandon clicks first, and
 * beside Elementor's own panel the difference is the whole Style tab.
 *
 * Each of the eight now carries what Elementor's panel carries — its own
 * sections, its own control labels, its own option values — read off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`. This module is the part
 * more than one of them needs. `shared.ts` beside it is wave one's: the button
 * pill, the no-JS card and the two alignment dialects. Nothing here repeats it.
 *
 * ── NOT A SECOND MECHANISM ────────────────────────────────────────────────
 * The icon picker is still `widgets/glyph.ts`; the editable runs are still
 * `widgets/text.ts`; the escaper is still `builder/esc`. This file holds CSS
 * decisions and Elementor's own option lists, and nothing else.
 */
import { esc } from "../../../esc";
import { str } from "./shared";

/** A number an author typed, clamped, or the fallback when it is not one. */
export function num(v: unknown, fallback: number, lo = -1e6, hi = 1e6): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

/** The first of these that is a non-empty string. `""` when none is. */
export function firstStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = str(v).trim();
    if (s) return s;
  }
  return "";
}

/**
 * A COLOUR THE AUTHOR REALLY CHOSE, or the fallback.
 *
 * A swatch stores `#RRGGBB`; an unset one stores `""`, and `background:""` in a
 * style attribute is a property the browser drops — which reads on the canvas
 * as "that control does nothing". So an unset colour falls back to something
 * visible, and only a value that LOOKS like a colour is let through, because a
 * stored document can carry anything and this reaches a style attribute.
 */
export function colour(v: unknown, fallback: string): string {
  const s = str(v).trim();
  if (!s) return fallback;
  return /^(#[0-9a-fA-F]{3,8}|rgba?\([\d.,\s%]+\)|[a-zA-Z]{3,20})$/.test(s) ? s : fallback;
}

/** Elementor's switcher stores the string "yes"; a checkbox writes a boolean. */
export function on(v: unknown): boolean {
  return v === true || v === "yes";
}

/**
 * ELEMENTOR'S `shape` — square | rounded | circle — as a border radius.
 *
 * Icon, Icon Box and Social Icons all offer it and all three spell the values
 * the same way. The legacy Icon definition offered only TWO of the three, so a
 * document saved before today holds `circle` or `square` and nothing else; both
 * still answer here, which is the whole reason a family reuses the kind.
 */
export function shapeRadius(v: unknown, circle = "999px"): string {
  const s = str(v).toLowerCase();
  if (s === "square") return "0";
  if (s === "rounded") return "6px";
  return circle;
}

/**
 * ELEMENTOR'S `view` — default | stacked | framed — as the skin of one mark.
 *
 * `default` is the glyph in the primary colour and nothing else. `stacked`
 * fills the shape with the primary colour and draws the glyph in the secondary.
 * `framed` outlines the shape in the primary colour and draws the glyph in it.
 * Icon, Icon Box and the Divider's icon each read it, so it is decided once.
 */
export function markSkin(opts: {
  view: unknown;
  shape: unknown;
  size: number;
  primary: string;
  secondary: string;
  padding?: unknown;
  borderWidth?: unknown;
  rotate?: unknown;
}): string {
  const view = str(opts.view) || "default";
  const framed = view === "framed";
  const stacked = view === "stacked";
  const pad = framed || stacked ? num(opts.padding, Math.round(opts.size * 0.5), 0, 200) : 0;
  const border = framed ? `border:${num(opts.borderWidth, 2, 0, 40)}px solid ${esc(opts.primary)};` : "";
  const fill = stacked ? `background:${esc(opts.primary)};` : "";
  const ink = stacked ? opts.secondary : opts.primary;
  const rotate = num(opts.rotate, 0, -360, 360);
  return "display:inline-flex;align-items:center;justify-content:center;"
    + `font-size:${opts.size}px;line-height:1;color:${esc(ink)};`
    + (pad ? `padding:${pad}px;` : "")
    + (framed || stacked ? `border-radius:${shapeRadius(opts.shape)};` : "")
    + border + fill
    + (rotate ? `transform:rotate(${rotate}deg);` : "");
}

/**
 * ELEMENTOR'S BORDER TYPE — the `*_border` select — as a CSS `border-style`.
 *
 * `""` is Elementor's "Default", which on a widget with no border of its own
 * means no border at all. Checked against the list rather than trusted.
 */
const BORDER_STYLES = new Set(["none", "solid", "double", "dotted", "dashed", "groove"]);
export function borderStyle(v: unknown, fallback = "none"): string {
  const s = str(v).toLowerCase();
  return BORDER_STYLES.has(s) ? s : fallback;
}

/** Elementor's Border Type option list, in the machine file's own words. */
export const BORDER_TYPE_OPTIONS = [
  { value: "", label: "Default" }, { value: "none", label: "None" },
  { value: "solid", label: "Solid" }, { value: "double", label: "Double" },
  { value: "dotted", label: "Dotted" }, { value: "dashed", label: "Dashed" },
  { value: "groove", label: "Groove" },
];

/** Elementor's `view` / `icon_view` option list, shared by three widgets. */
export const VIEW_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "stacked", label: "Stacked" },
  { value: "framed", label: "Framed" },
];

/** Elementor's `shape` option list — THREE, not the two we used to offer. */
export const SHAPE_OPTIONS = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

/** Elementor's `start | center | end` choose, the spelling its Style tab uses. */
export const START_CENTER_END = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
];

/** …and the `left | center | right` one its Content tab uses. */
export const LEFT_CENTER_RIGHT = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

/** Elementor's font-weight select: the machine file's own values and words. */
export const FONT_WEIGHT_OPTIONS = [
  { value: "", label: "Default" }, { value: "100", label: "100 (Thin)" },
  { value: "200", label: "200 (Extra Light)" }, { value: "300", label: "300 (Light)" },
  { value: "400", label: "400 (Normal)" }, { value: "500", label: "500 (Medium)" },
  { value: "600", label: "600 (Semi Bold)" }, { value: "700", label: "700 (Bold)" },
  { value: "800", label: "800 (Extra Bold)" }, { value: "900", label: "900 (Black)" },
];

/** …and its Transform select. */
export const TEXT_TRANSFORM_OPTIONS = [
  { value: "", label: "Default" }, { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" }, { value: "capitalize", label: "Capitalize" },
  { value: "none", label: "Normal" },
];

const TRANSFORMS = new Set(["uppercase", "lowercase", "capitalize", "none"]);

/**
 * THE THREE TYPE RULES A WIDGET'S TYPOGRAPHY POPOVER REALLY CHANGES, as CSS.
 *
 * Elementor's Typography is a popover holding nine controls. The three an
 * author reaches for are Size, Weight and Transform, and those are the three
 * these widgets offer — the same judgement Elementor itself makes when it
 * collapses that popover shut. Each contributes NOTHING when it is unset, so a
 * widget nobody has styled carries no rule it did not ask for.
 */
export function typeCss(size: unknown, weight: unknown, transform: unknown): string {
  const s = Number(size);
  const w = str(weight).trim();
  const t = str(transform).toLowerCase();
  return (Number.isFinite(s) && s > 0 ? `font-size:${Math.max(6, Math.min(200, s))}px;` : "")
    + (/^[1-9]00$|^(normal|bold)$/.test(w) ? `font-weight:${w};` : "")
    + (TRANSFORMS.has(t) ? `text-transform:${t};` : "");
}

/**
 * ONE PLACE TO SAY "THIS CONTROL IS SET SEPARATELY PER SCREEN".
 *
 * `responsive: true` is copied from the machine file, never guessed, and the
 * panel stores the twins as `<key>_tablet` / `<key>_mobile` (`deviceKey` in
 * `definitionControls.tsx`). The page renderer draws the DESKTOP value — it has
 * no device on its context — and the twins are what the arion emitter publishes
 * under Elementor's own responsive keys, where a real breakpoint applies them.
 * Written here so the next reader does not have to find that out twice.
 */
export const RESPONSIVE = true;

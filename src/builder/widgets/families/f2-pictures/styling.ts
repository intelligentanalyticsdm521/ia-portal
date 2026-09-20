/**
 * families/f2-pictures/styling.ts — THE STYLE TAB, TURNED INTO CSS, ONCE.
 *
 * Wave 2 of F2 (D-168, 2026-09-19). The five everyday picture widgets — Image,
 * Image Box, Image Carousel, Basic Gallery, Video — now carry Elementor's own
 * Style tab, and four of the five draw a picture with the SAME four decisions
 * on it: a border, a corner radius, how it fills its box, and how see-through
 * it is. Elementor spells those with the same control keys on all four
 * (`image_border_border`, `image_border_width`, `image_border_color`,
 * `image_border_radius`), so there is exactly one reader for them here.
 *
 * ── WHY THIS MATTERS MORE THAN IT LOOKS ───────────────────────────────────
 * The brief is blunt about it: *"a control that changes nothing on the canvas
 * is a defect, not a feature"*. Four copies of "read the border" is four places
 * one of them can quietly stop being read, and the author then changes a
 * setting and watches nothing happen. One reader, four callers.
 *
 * Nothing in here knows a widget's name, and nothing outside this family
 * imports it.
 */
import { esc } from "../../../esc";
import { str } from "./media";

/** A finite number, or `null` when the author has left the control empty. */
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(typeof v === "object" ? (v as any).size : v);
  return Number.isFinite(n) ? n : null;
}

/** A finite number clamped into a range, or `null` when the control is empty. */
export function clamped(v: unknown, min: number, max: number): number | null {
  const n = num(v);
  return n == null ? null : Math.max(min, Math.min(max, n));
}

/**
 * A WIDTH CONTROL, AS CSS — and the one place the unit question is answered.
 *
 * Elementor's Width slider carries its own unit: `{ unit: "%", size: 60 }`. Our
 * panel's number control does not, and the documents already on disk hold a
 * BARE NUMBER that the D-165 Image renderer treated as PIXELS — a 900 there
 * means a 900px picture, and reading it as 900% would blow a page sideways.
 *
 * So: an object says its own unit and is believed; a bare number up to 100 is a
 * percentage, which is Elementor's own default unit and the only thing a slider
 * with a 0-100 range can mean; anything larger can only have been pixels. The
 * `max-width:100%` beside it is what stops either one pushing the page wider
 * than the page, which is the rule `builder-phone-width` exists to keep.
 */
export function widthCss(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "object") {
    const o = v as { unit?: unknown; size?: unknown };
    const n = Number(o.size);
    if (!Number.isFinite(n) || o.size === "") return "";
    return `width:${n}${str(o.unit) || "%"};`;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "";
  return n > 100 ? `width:${n}px;` : `width:${n}%;`;
}

/** One CSS declaration, or "" — so a caller can join a list without holes. */
export function decl(prop: string, value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  return `${prop}:${esc(String(value))};`;
}

/**
 * ELEMENTOR'S BORDER GROUP, on any of the four widgets that carry it.
 *
 * `image_border_border` is Elementor's Border TYPE — `solid`, `dashed`, and so
 * on. Empty or `none` means no border at all, and then the width and the colour
 * are not drawn either: that is Elementor's own condition on those two controls
 * and copying it is what stops a 3px transparent line appearing out of nowhere.
 * The radius is independent of the type, exactly as it is in Elementor.
 */
export function pictureEdge(p: any): string {
  const type = str(p.image_border_border).trim().toLowerCase();
  const radius = num(p.image_border_radius);
  let css = radius == null ? "" : decl("border-radius", `${radius}px`);
  if (!type || type === "none") return css;
  const width = num(p.image_border_width);
  css += decl("border-style", type);
  css += decl("border-width", `${width == null ? 1 : width}px`);
  css += decl("border-color", str(p.image_border_color) || "#E2E8F0");
  return css;
}

/** Elementor's own five Border Type values, by its own words. */
export const BORDER_TYPES = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "double", label: "Double" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dashed" },
  { value: "groove", label: "Groove" },
];

/** Elementor's own Object Fit list, by its own words. */
export const OBJECT_FITS = [
  { value: "", label: "Default" },
  { value: "fill", label: "Fill" },
  { value: "cover", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "scale-down", label: "Scale Down" },
];

/** Elementor's Alignment `choose` control, as the three values it stores. */
export const ALIGNMENTS = [
  { value: "start", label: "Left" },
  { value: "center", label: "Center" },
  { value: "end", label: "Right" },
];

/** …and the four-value version, where Elementor adds Justified. */
export const ALIGNMENTS_4 = [...ALIGNMENTS, { value: "justify", label: "Justified" }];

/** `start` / `end` are CSS logical words; a `text-align` wants left / right. */
export function textAlign(v: unknown, fallback: string): string {
  const a = str(v).trim().toLowerCase();
  if (a === "start" || a === "left") return "left";
  if (a === "end" || a === "right") return "right";
  if (a === "center" || a === "justify") return a;
  return fallback;
}

/**
 * ELEMENTOR'S IMAGE RESOLUTION, as a real cap on how wide the picture is drawn.
 *
 * On a live WordPress page this control picks which generated file the page
 * engine serves. We have one address and no media library, so honouring it
 * means capping the drawn width at the width that resolution actually is —
 * which is a change the author SEES, and the thing the control means. `full`
 * and a size we do not know cap nothing.
 */
export const RESOLUTION_WIDTH: Readonly<Record<string, number>> = {
  thumbnail: 150,
  medium: 300,
  medium_large: 768,
  large: 1024,
};

/** The `max-width` an Image Resolution asks for, or "" for full size. */
export function resolutionCap(v: unknown): string {
  const w = RESOLUTION_WIDTH[str(v).trim()];
  return w ? `max-width:${w}px;` : "";
}

/** Elementor's own Image Resolution options, by its own words. */
export const RESOLUTIONS = [
  { value: "thumbnail", label: "Thumbnail" },
  { value: "medium", label: "Medium" },
  { value: "medium_large", label: "Medium Large" },
  { value: "large", label: "Large" },
  { value: "full", label: "Full" },
];

/** Elementor's Lightbox select — the same three on every picture widget. */
export const LIGHTBOX = [
  { value: "default", label: "Default" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** Elementor's typography Weight select, trimmed to the weights people pick. */
export const FONT_WEIGHTS = [
  { value: "", label: "Default" },
  { value: "300", label: "300" },
  { value: "400", label: "400" },
  { value: "500", label: "500" },
  { value: "600", label: "600" },
  { value: "700", label: "700" },
  { value: "900", label: "900" },
];

/**
 * A CAPTION'S OWN STYLE, shared by Image, Image Carousel and Basic Gallery.
 *
 * Elementor spells the keys differently on each of the three — `caption_align`
 * against `align`, `caption_text_color` against `text_color`,
 * `caption_typography_font_size` against `typography_font_size` — so the CALLER
 * hands over the values it read under its own widget's keys and this decides
 * what they look like. The keys stay literal where they belong: in the def and
 * in the emitter.
 */
export interface CaptionStyle {
  align?: unknown;
  colour?: unknown;
  background?: unknown;
  size?: unknown;
  weight?: unknown;
  space?: unknown;
}

export function captionCss(s: CaptionStyle, fallbackAlign = "center"): string {
  const size = num(s.size);
  const space = num(s.space);
  return `font-size:${size == null ? 12 : size}px;`
    + decl("font-weight", s.weight ? str(s.weight) : "")
    + `color:${esc(str(s.colour) || "#64748B")};`
    + decl("background-color", str(s.background))
    + `text-align:${textAlign(s.align, fallbackAlign)};`
    + `margin-top:${space == null ? 6 : space}px;`;
}

/**
 * THE `data-settings` ATTRIBUTE, the way Elementor's own frontend carries a
 * widget's behaviour.
 *
 * Some of Elementor's controls are about TIME — autoplay, animation speed,
 * pause on hover, infinite loop. A still canvas cannot show them moving and
 * neither does Elementor's own editor. What Elementor DOES do is print the
 * settings on the wrapper as JSON for its script to read, so the value is in
 * the page and a test can see it. We do the same, which is how a temporal
 * control still changes the canvas's output instead of being a switch that does
 * nothing at all.
 */
export function dataSettings(o: Record<string, unknown>): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "" || v == null) continue;
    clean[k] = v;
  }
  if (!Object.keys(clean).length) return "";
  return ` data-settings="${esc(JSON.stringify(clean))}"`;
}

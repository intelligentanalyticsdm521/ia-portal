/**
 * f1-words/words.ts — the pieces the five EVERYDAY word widgets share.
 *
 * Wave 2 of F1. Heading, Text Editor, HTML, Shortcode and Menu Anchor are the
 * widgets an author reaches for first, and until this pass they were the
 * thinnest things on the panel: `heading` had three controls where Elementor
 * has four and a whole Style tab, `paragraph` had one where Elementor has four
 * and two Style sections. This file holds what more than one of them needs, so
 * a rule about how a heading is sized is written once and cannot drift between
 * the canvas, the mailbox and the page we publish.
 *
 * ── WHAT IS DELIBERATELY NOT IN HERE ──────────────────────────────────────
 * **Font family, font size, font weight, line height, letter spacing and text
 * colour are NOT controls these widgets declare.** The platform already has one
 * mechanism for those and it is on the same Style tab: `TypographyGroup`
 * (src/builder/StyleGroups.tsx), reading and writing `widget.style.typography`
 * PER DEVICE, offered for every kind in `TYPOGRAPHIC_KINDS` — which has
 * included `heading` and `paragraph` since §11.8. Declaring Elementor's
 * `typography_font_size` beside it would put two size boxes on one tab, each
 * writing a different key, and whichever the author did not use would look
 * broken. One mechanism per concern: the Typography group IS our Typography
 * popover, and these widgets add only the Style controls Elementor has that it
 * does NOT cover — Transform, Style, Decoration, Word Spacing, Text Stroke,
 * Text Shadow, Blend Mode, Link Color.
 *
 * The one thing that follows from that, and it is written in the handoff for
 * whoever owns arion's tree: `styleToSettings` in
 * `arion-api/lib/websiteBuilder/elementorTree.js` publishes padding, margin,
 * gap, background and border and NOT typography, so a font size set in the
 * Typography group is not on the published WordPress page. That is a defect in
 * one shared function, not a reason to grow a second panel control.
 *
 * ── RESPONSIVE ────────────────────────────────────────────────────────────
 * `responsive: true` is copied from the machine file, never guessed, and a
 * per-device value is stored as `<key>_tablet` / `<key>_mobile` (`deviceKey`).
 * `deviceCss` below turns the three into one style block using the SAME
 * container query the platform's own per-device cascade uses
 * (`deviceContainerQuery`, responsive.ts), so narrowing the canvas with the
 * device switch shows the tablet and phone values rather than nothing.
 */
import { esc } from "../../../esc";
import { deviceContainerQuery } from "../../../responsive";
import type { WidgetOption } from "../../../registry";

export const str = (v: unknown): string => (v == null ? "" : String(v));

/** A number the author typed, or `null` when the box is empty. */
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   Elementor's own option lists, from BUILDER_WIDGET_CATALOG_2026-09-17
   ══════════════════════════════════════════════════════════════════════════ */

/** `heading.size` — Elementor's six, as it spells them. */
export const HEADING_SIZES: WidgetOption[] = [
  { value: "default", label: "Default" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "xl", label: "XL" },
  { value: "xxl", label: "XXL" },
];

/** `heading.header_size` — Elementor's nine. */
export const HTML_TAGS: WidgetOption[] = [
  { value: "h1", label: "H1" }, { value: "h2", label: "H2" }, { value: "h3", label: "H3" },
  { value: "h4", label: "H4" }, { value: "h5", label: "H5" }, { value: "h6", label: "H6" },
  { value: "div", label: "div" }, { value: "span", label: "span" }, { value: "p", label: "p" },
];

/** Elementor's `align` choose control: start / center / end / justify. */
export const ALIGNMENTS: WidgetOption[] = [
  { value: "", label: "The page's own" },
  { value: "start", label: "Left" },
  { value: "center", label: "Center" },
  { value: "end", label: "Right" },
  { value: "justify", label: "Justified" },
];

export const TRANSFORMS: WidgetOption[] = [
  { value: "", label: "Default" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
  { value: "none", label: "Normal" },
];

export const FONT_STYLES: WidgetOption[] = [
  { value: "", label: "Default" },
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
  { value: "oblique", label: "Oblique" },
];

export const DECORATIONS: WidgetOption[] = [
  { value: "", label: "Default" },
  { value: "underline", label: "Underline" },
  { value: "overline", label: "Overline" },
  { value: "line-through", label: "Line Through" },
  { value: "none", label: "None" },
];

export const BLEND_MODES: WidgetOption[] = [
  { value: "", label: "Normal" },
  { value: "multiply", label: "Multiply" }, { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" }, { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" }, { value: "color-dodge", label: "Color Dodge" },
  { value: "saturation", label: "Saturation" }, { value: "color", label: "Color" },
  { value: "difference", label: "Difference" }, { value: "exclusion", label: "Exclusion" },
  { value: "hue", label: "Hue" }, { value: "luminosity", label: "Luminosity" },
];

/** `text-editor.text_columns` — Elementor's ten, plus its empty default. */
export const TEXT_COLUMNS: WidgetOption[] = [
  { value: "", label: "One" },
  ...["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].map((n) => ({ value: n, label: n })),
];

/** `text-editor.drop_cap_view` — Elementor's three. */
export const DROP_CAP_VIEWS: WidgetOption[] = [
  { value: "default", label: "Default" },
  { value: "stacked", label: "Stacked" },
  { value: "framed", label: "Framed" },
];

/* ══════════════════════════════════════════════════════════════════════════
   Values → CSS. Each one reads Elementor's own key.
   ══════════════════════════════════════════════════════════════════════════ */

/** Elementor's `start`/`end` are CSS's `left`/`right` in a left-to-right page. */
export function alignCss(v: unknown): string {
  const s = str(v).toLowerCase();
  if (s === "start" || s === "left") return "left";
  if (s === "end" || s === "right") return "right";
  if (s === "center" || s === "centre") return "center";
  if (s === "justify") return "justify";
  return "";
}

/** The size preset, in px. Elementor ships a class; a canvas needs a number. */
const HEADING_SIZE_PX: Record<string, number> = {
  small: 15, medium: 19, large: 29, xl: 39, xxl: 59,
};

/** `size` → a font-size declaration, or "" for Elementor's `default`. */
export function headingSizeCss(v: unknown): string {
  const px = HEADING_SIZE_PX[str(v)];
  return px ? `font-size:${px}px` : "";
}

/**
 * The text EFFECTS Elementor has and the platform's Typography group does not.
 *
 * `prefix` is how Elementor spells the group on that widget: `""` on Heading
 * and Text Editor, `"drop_cap_"` on the drop cap. Only the keys that are set
 * produce a declaration, so an untouched widget draws exactly as it did before
 * this pass — which is how the golden fixtures stay byte-identical.
 */
export function effectsCss(p: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  const get = (k: string) => (p as any)[`${prefix}${k}`];
  const transform = str(get("typography_text_transform"));
  if (transform) out.push(`text-transform:${transform}`);
  const fontStyle = str(get("typography_font_style"));
  if (fontStyle) out.push(`font-style:${fontStyle}`);
  const decoration = str(get("typography_text_decoration"));
  if (decoration) out.push(`text-decoration:${decoration}`);
  const word = num(get("typography_word_spacing"));
  if (word != null) out.push(`word-spacing:${word}px`);
  return out;
}

/** Elementor's `text_stroke_*` pair, as the one CSS property that draws it. */
export function strokeCss(p: Record<string, unknown>, prefix = ""): string[] {
  const width = num((p as any)[`${prefix}text_stroke_text_stroke`]);
  if (width == null || width <= 0) return [];
  const colour = str((p as any)[`${prefix}text_stroke_stroke_color`]) || "#000";
  return [`-webkit-text-stroke:${width}px ${colour}`, `text-stroke:${width}px ${colour}`];
}

/**
 * Elementor's `text_shadow_text_shadow` composite, from four plain boxes.
 *
 * Elementor draws one popover with Horizontal / Vertical / Blur / Color inside
 * it and stores ONE key holding the four. Our panel has no popover, so the four
 * are four controls, each spelled with the composite's own key in front of it
 * so the emitter can put them back together into the single key Elementor has
 * (`text_shadow_text_shadow`) and the contract helper will accept.
 */
export function shadowCss(p: Record<string, unknown>, prefix = ""): string[] {
  const g = (k: string) => num((p as any)[`${prefix}text_shadow_text_shadow_${k}`]);
  const colour = str((p as any)[`${prefix}text_shadow_text_shadow_color`]);
  const h = g("horizontal"); const v = g("vertical"); const blur = g("blur");
  if (h == null && v == null && blur == null && !colour) return [];
  return [`text-shadow:${h ?? 0}px ${v ?? 0}px ${blur ?? 10}px ${colour || "rgba(0,0,0,0.3)"}`];
}

/** `blend_mode`, which is a real CSS property and not a picture of one. */
export function blendCss(p: Record<string, unknown>): string[] {
  const mode = str((p as any).blend_mode);
  return mode ? [`mix-blend-mode:${mode}`] : [];
}

/* ══════════════════════════════════════════════════════════════════════════
   Per-device, with the platform's own container query
   ══════════════════════════════════════════════════════════════════════════ */

/** The three device spellings of one responsive key, as Elementor stores them. */
export function perDevice(p: Record<string, unknown>, key: string): Record<string, unknown> {
  return {
    desktop: (p as any)[key],
    tablet: (p as any)[`${key}_tablet`],
    phone: (p as any)[`${key}_mobile`],
  };
}

/**
 * A `<style>` block for one widget's per-device declarations.
 *
 * `selector` is a class this widget puts on itself. Tablet and phone are only
 * written when the author actually set them, so a widget with one value for
 * every screen emits no query at all and no extra bytes reach the page.
 */
export function deviceCss(
  selector: string,
  perScreen: { desktop?: string[]; tablet?: string[]; phone?: string[] },
): string {
  const rule = (decls?: string[]) => (decls && decls.length ? `${selector}{${decls.join(";")}}` : "");
  const desktop = rule(perScreen.desktop);
  const tablet = perScreen.tablet && perScreen.tablet.length
    ? `${deviceContainerQuery("tablet")}{${selector}{${perScreen.tablet.join(";")}}}` : "";
  const phone = perScreen.phone && perScreen.phone.length
    ? `${deviceContainerQuery("phone")}{${selector}{${perScreen.phone.join(";")}}}` : "";
  const body = desktop + tablet + phone;
  return body ? `<style>${body}</style>` : "";
}

/**
 * A class unique to one widget, so its style block cannot reach another.
 *
 * The widget's own id, cleaned to the characters a CSS class may hold. Two
 * headings on one page therefore never share a rule — the same reason Text
 * Path gives its `<path>` the widget's own id.
 */
export function ownClass(prefix: string, id: unknown): string {
  const clean = str(id).replace(/[^A-Za-z0-9_-]/g, "") || "x";
  return `${prefix}-${clean}`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Links
   ══════════════════════════════════════════════════════════════════════════ */

/** Elementor's url control is an object; ours has always stored a string. Both. */
export function linkUrl(v: unknown): string {
  if (v && typeof v === "object") return str((v as any).url);
  return str(v);
}

/** …and whether it opens in a new tab, which Elementor keeps beside the url. */
export function linkExternal(v: unknown): boolean {
  if (v && typeof v === "object") {
    const e = (v as any).is_external;
    return e === true || e === "on" || e === "yes";
  }
  return false;
}

/** Wrap words in the author's link, or hand them back untouched. */
export function linked(inner: string, v: unknown): string {
  const url = linkUrl(v).trim();
  if (!url) return inner;
  const target = linkExternal(v) ? ` target="_blank" rel="noopener"` : "";
  return `<a href="${esc(url)}" style="color:inherit"${target}>${inner}</a>`;
}

/**
 * families/f5-sliders-reviews/partType.ts — ELEMENTOR'S PER-PART TYPOGRAPHY,
 * declared once and drawn once.
 *
 * ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────────
 * Elementor's Testimonial has THREE typography groups on its Style tab, one per
 * part of the widget: Content, Name, Title. Each is the same eleven controls
 * with a different key prefix — `content_typography_font_size`,
 * `name_typography_font_size`, `job_typography_font_size` — read control by
 * control out of `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`. Testimonial
 * Carousel, Reviews and Slides repeat the same shape for their own parts.
 *
 * Writing the list out three times per widget is how a panel drifts: the third
 * copy loses a control and nobody notices until a client does. So the list is
 * HERE, once, and a widget asks for it by prefix and by section name.
 *
 * ── IT IS NOT A SECOND TYPOGRAPHY MECHANISM, AND HERE IS THE LINE ─────────
 * The platform already has ONE typography mechanism: `TypographyGroup` on the
 * Style tab, writing `widget.style.typography` through the §11.8 per-device
 * cascade in `style.ts`. That one styles THE WHOLE WIDGET, which is the only
 * thing it can say — one size, one weight, one colour for a quote, the name
 * under it and the job under that. Elementor's are scoped to a PART. Different
 * question, different answer, and the two do not overlap: the widget-wide one
 * sets the baseline through the cascade, and a part control overrides that part
 * only. Said out loud because "one mechanism per concern" is absolute and this
 * is the one place in this family where somebody will reasonably ask.
 *
 * What a family may NOT do is invent a control Elementor does not have. Every
 * key below is Elementor's own, spelled Elementor's way, so the arion emitter
 * publishes it under its literal name and `assertSettingsKeys` accepts it.
 *
 * ── WHAT IS DELIBERATELY LEFT OUT, and why each one ───────────────────────
 *   · `<p>_typography_typography` (the popover toggle) and
 *     `<p>_shadow_text_shadow_type` — Elementor's popovers are a panel widget
 *     our engine does not have, and the fourteen controls behind them are drawn
 *     flat instead, which is the same settings with one fewer click.
 *   · `<p>_shadow_text_shadow` — a COMPOSITE value ({horizontal, vertical,
 *     blur, color}) and the engine's control types are all scalars. Four flat
 *     fields would be four controls Elementor does not have, and a `shadow`
 *     control type is a change to `registry.ts` and `definitionControls.tsx`,
 *     which a family does not own. Written up for the seam instead.
 *   · `<p>_typography_font_family` — the panel's font list is the BRAND KIT's
 *     (`Inspector` hands `fonts` to `TypographyGroup`), and a definition cannot
 *     reach it. A hard-coded list of font names in a family folder would be a
 *     second font list, drifting from the brand kit the day somebody adds one.
 *
 * ── PER DEVICE ────────────────────────────────────────────────────────────
 * `responsive: true` is copied from the machine file's own `_tablet` /
 * `_mobile` twins, never guessed. `definitionControls.deviceKey` is the only
 * place that spelling exists in the panel; `partTypeCss` below is the only
 * place it exists in the renderer, and it emits the two overrides under
 * `responsive.deviceContainerQuery`, which is the platform's own per-device
 * mechanism (§11.8) and not a fourth set of pixel widths.
 */
import { deviceContainerQuery, type PreviewKey } from "../../../responsive";
import type { WidgetControl } from "../../../registry";

/** Elementor's own Weight list, in Elementor's own order. */
const WEIGHTS = [
  { value: "", label: "Default" },
  { value: "100", label: "100" }, { value: "200", label: "200" }, { value: "300", label: "300" },
  { value: "400", label: "400" }, { value: "500", label: "500" }, { value: "600", label: "600" },
  { value: "700", label: "700" }, { value: "800", label: "800" }, { value: "900", label: "900" },
  { value: "normal", label: "Normal" }, { value: "bold", label: "Bold" },
];

const TRANSFORMS = [
  { value: "", label: "Default" },
  { value: "uppercase", label: "Uppercase" },
  { value: "lowercase", label: "Lowercase" },
  { value: "capitalize", label: "Capitalize" },
  { value: "none", label: "Normal" },
];

const STYLES = [
  { value: "", label: "Default" },
  { value: "normal", label: "Normal" },
  { value: "italic", label: "Italic" },
  { value: "oblique", label: "Oblique" },
];

const DECORATIONS = [
  { value: "", label: "Default" },
  { value: "underline", label: "Underline" },
  { value: "overline", label: "Overline" },
  { value: "line-through", label: "Line Through" },
  { value: "none", label: "None" },
];

/**
 * The nine controls of ONE part, with Elementor's keys and Elementor's labels.
 *
 * `prefix` is Elementor's own: `content`, `name`, `job`, `title`, `cite`.
 * `section` is the panel section the machine file puts them in — which is the
 * part's own name, because Elementor gives each part a section of its own.
 *
 * THE COLOUR KEY IS NOT ALWAYS `<prefix>_text_color`, and this is the trap.
 * Testimonial's Name is `name_text_color` and its Title is `job_text_color`,
 * but its Content is **`content_content_color`** — read off the machine file,
 * twice, because it is the one key in the set that does not follow the pattern
 * and the page engine DROPS a key it does not have. `colourKey` is how a widget
 * says so; left off, the pattern applies.
 */
export function partTypeControls(prefix: string, section: string, colourKey?: string): WidgetControl[] {
  const t = `${prefix}_typography`;
  return [
    { key: colourKey ?? `${prefix}_text_color`, label: "Text Color", type: "colour", tab: "style", section },
    { key: `${t}_font_size`, label: "Size", type: "number", tab: "style", section, responsive: true },
    { key: `${t}_font_weight`, label: "Weight", type: "select", tab: "style", section, options: WEIGHTS },
    { key: `${t}_text_transform`, label: "Transform", type: "select", tab: "style", section, options: TRANSFORMS },
    { key: `${t}_font_style`, label: "Style", type: "select", tab: "style", section, options: STYLES },
    { key: `${t}_text_decoration`, label: "Decoration", type: "select", tab: "style", section, options: DECORATIONS },
    { key: `${t}_line_height`, label: "Line Height", type: "number", tab: "style", section, responsive: true },
    { key: `${t}_letter_spacing`, label: "Letter Spacing", type: "number", tab: "style", section, responsive: true },
    { key: `${t}_word_spacing`, label: "Word Spacing", type: "number", tab: "style", section, responsive: true },
  ];
}

/** The defaults a part contributes — every key the controls above can write. */
export function partTypeDefaults(prefix: string, colourKey?: string): Record<string, unknown> {
  const out: Record<string, unknown> = { [colourKey ?? `${prefix}_text_color`]: "" };
  for (const k of ["font_size", "font_weight", "text_transform", "font_style", "text_decoration",
    "line_height", "letter_spacing", "word_spacing"]) {
    out[`${prefix}_typography_${k}`] = "";
  }
  return out;
}

/** A value that is really there. Elementor stores "" for "leave it alone". */
const set = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== "";

/**
 * A VALUE SAFE TO PUT IN A STYLESHEET.
 *
 * `esc` is the HTML escaper and escaping a `<style>` block would break the
 * stylesheet rather than protect it (`&gt;` is not a CSS combinator). What a
 * stylesheet has to be protected from is a stored value carrying `}` or
 * `</style>` and closing the block early, so the rule is a WHITELIST: the
 * characters a colour, a length or a font keyword is made of, and nothing else.
 * Everything a control can legitimately store passes; `#fff`, `rgba(0,0,0,.3)`
 * and `var(--x)` all pass.
 */
export function cssSafe(v: unknown): string {
  return String(v ?? "").replace(/[^A-Za-z0-9#%(),.\-_ ]/g, "").trim();
}

/** A number a person typed, or null. Zero is a real answer and is kept. */
function num(v: unknown): number | null {
  if (!set(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** One of the control's own values, or nothing. A value the control does not
 *  offer is DROPPED rather than written into the page's CSS. */
function oneOf(v: unknown, allowed: Array<{ value: string }>): string {
  const s = String(v ?? "");
  return s && allowed.some((o) => o.value === s && o.value !== "") ? s : "";
}

/**
 * THE CSS DECLARATIONS FOR ONE PART ON ONE DEVICE.
 *
 * Colour is not per device — the machine file marks only the four sliders
 * responsive — so it is read from the bare key on every screen, and the tablet
 * and phone rules say only what that device CHANGES. That is the same rule
 * `style.ts styleBlockFor` follows, for the same reason: a device rule that
 * restated the desktop one would make the desktop rule unreachable.
 */
export function partTypeDeclarations(
  p: Record<string, unknown>, prefix: string, device: PreviewKey, colourKey?: string,
): string[] {
  const t = `${prefix}_typography`;
  const k = (key: string) => (device === "desktop" ? key
    : `${key}${device === "tablet" ? "_tablet" : "_mobile"}`);
  const out: string[] = [];
  const ck = colourKey ?? `${prefix}_text_color`;
  if (device === "desktop" && set(p[ck])) {
    const colour = cssSafe(p[ck]);
    if (colour) out.push(`color:${colour}`);
  }
  const size = num(p[k(`${t}_font_size`)]);
  if (size !== null) out.push(`font-size:${size}px`);
  const lh = num(p[k(`${t}_line_height`)]);
  if (lh !== null) out.push(`line-height:${lh}`);
  const ls = num(p[k(`${t}_letter_spacing`)]);
  if (ls !== null) out.push(`letter-spacing:${ls}px`);
  const ws = num(p[k(`${t}_word_spacing`)]);
  if (ws !== null) out.push(`word-spacing:${ws}px`);
  if (device !== "desktop") return out;
  if (set(p[`${t}_font_weight`])) out.push(`font-weight:${oneOf(p[`${t}_font_weight`], WEIGHTS)}`);
  if (set(p[`${t}_text_transform`])) out.push(`text-transform:${oneOf(p[`${t}_text_transform`], TRANSFORMS)}`);
  if (set(p[`${t}_font_style`])) out.push(`font-style:${oneOf(p[`${t}_font_style`], STYLES)}`);
  if (set(p[`${t}_text_decoration`])) out.push(`text-decoration:${oneOf(p[`${t}_text_decoration`], DECORATIONS)}`);
  return out.filter((d) => !/:\s*$/.test(d));
}

/** The declarations a MAILBOX can carry, as one inline style string.
 *
 *  A mailbox has no container queries and no stylesheet worth trusting, so it
 *  gets the desktop values inline and nothing else. Said here rather than
 *  half-applying a phone size Outlook would ignore anyway. */
export function partTypeInline(p: Record<string, unknown>, prefix: string, colourKey?: string): string {
  const decls = partTypeDeclarations(p, prefix, "desktop", colourKey);
  return decls.length ? `${decls.join(";")};` : "";
}

export interface PartRule {
  /** The selector INSIDE the widget, e.g. `.bx-quote-b`. */
  selector: string;
  /** Elementor's own key prefix for that part. */
  prefix: string;
  /** Only where Elementor's colour key does not follow the pattern. */
  colourKey?: string;
}

/**
 * THE `<style>` BLOCK FOR A WIDGET'S PARTS, desktop plus the two overrides.
 *
 * Scoped to a class of this widget's own id so one testimonial's Size cannot
 * reach the next one. The class is `bx-pt-<id>` and not `widgetStyleClass(id)`:
 * that one belongs to `style.ts`'s own rules for the same widget, and two
 * writers on one class is exactly the drift this family is not allowed to add.
 *
 * Returns "" when nothing is set, so a document nobody has styled produces the
 * same bytes it always did and the goldens do not move.
 */
export function partTypeCss(
  p: Record<string, unknown>, widgetId: string, parts: PartRule[],
): { cls: string; css: string } {
  const cls = `bx-pt-${String(widgetId).replace(/[^A-Za-z0-9_-]/g, "")}`;
  const devices: PreviewKey[] = ["desktop", "tablet", "phone"];
  const blocks: string[] = [];
  for (const device of devices) {
    const rules: string[] = [];
    for (const part of parts) {
      const decls = partTypeDeclarations(p, part.prefix, device, part.colourKey);
      if (decls.length) rules.push(`.${cls} ${part.selector}{${decls.join(";")}}`);
    }
    if (!rules.length) continue;
    const query = device === "desktop" ? "" : deviceContainerQuery(device);
    blocks.push(query ? `${query}{${rules.join("")}}` : rules.join(""));
  }
  return { cls, css: blocks.length ? `<style>${blocks.join("")}</style>` : "" };
}

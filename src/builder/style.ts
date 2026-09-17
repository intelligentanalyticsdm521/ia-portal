/**
 * builder/style.ts — THE styling layer. One shape, one cascade, one emitter.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.8 (decision D-140).
 *
 * ── WHY A MODULE AND NOT A FEW MORE KEYS ON Section ───────────────────────
 * Before this, a section had ONE padding number and columns were always equal.
 * Anything past that — a margin, a 33/67 split, a heading two sizes bigger on
 * a phone — sent the author back to Elementor. The obvious fix is to bolt a
 * dozen more keys onto Section and read them in render.ts, and it is the wrong
 * one twice over: the inspector would then compute "what is the phone value"
 * with its own copy of the cascade, and the email adapter with a third. Two
 * copies of a cascade is two answers to "what does this look like on a phone".
 *
 * So the shape, the cascade AND the CSS live here, and render.ts, the
 * inspector and emailRender.ts all ask this module.
 *
 * ── THE CASCADE, WHICH IS THE WHOLE CONTRACT ──────────────────────────────
 *   desktop → tablet → phone
 * The base layer is desktop. `tablet` is merged for tablet AND for phone (a
 * phone is narrower than a tablet, so a tablet override that is not
 * contradicted still applies), then `phone` is merged for a phone. Per KEY, so
 * a phone override of `padding.top` keeps the desktop `padding.left` rather
 * than blanking the other three sides — which is what an author means when
 * they change one box.
 *
 * ── TOLERANT, LIKE EVERYTHING ELSE THAT IS STORED ─────────────────────────
 * `readStyle` drops anything that is not the right sort of value and returns
 * `undefined` when nothing survives, so a document with no styling comes back
 * with NO `style` key and serialises byte-identically. That is the rule the
 * golden fixtures pin: a style-less document must render exactly as it did
 * before this module existed.
 *
 * PURE: no React, no DOM. `node --test` drives all of it.
 */
import { deviceContainerQuery, type PreviewKey } from "./responsive";

/* ══════════════════════════════════════════════════════════════════════════
   The shape
   ══════════════════════════════════════════════════════════════════════════ */

/** The three widths an author edits for. Same three the preview toggle offers. */
export type Device = PreviewKey;

/** Four sides in px. Every side optional — an author sets the ones they mean. */
export interface BoxSides {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface BorderSpec {
  width?: number;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
}

export type ShadowSpec = "none" | "soft" | "strong";
export type AlignSpec = "left" | "center" | "right";

/* ── A CONTAINER'S LAYOUT (§11.12, D-156) ────────────────────────────────

   How a box arranges what is in it lives HERE, in the style, and not in a
   second `layout` field beside it. One mechanism, and the per-device cascade
   comes free: a row of three cards on a desktop becomes a column on a phone
   with no new machinery at all, because `phone: { direction: "column" }` is
   already a thing this file knows how to merge and how to emit.

   `align` above is TEXT alignment and stays a widget's. `alignItems` is the
   cross axis of a box. Two words because they are two different questions, and
   one key answering both is how a control starts lying. */

/** Which way a box runs. Absent means "column", which is how boxes stack. */
export type DirectionSpec = "row" | "column" | "grid";

/** Along the box's own direction. */
export type JustifySpec = "start" | "center" | "end" | "between";

/** Across it. */
export type ItemsSpec = "start" | "center" | "end" | "stretch";

export interface TypographySpec {
  /** px. */
  size?: number;
  /** 300–800. */
  weight?: number;
  /** A multiple, not px — 1.6, not 24. */
  lineHeight?: number;
  /** px, may be negative. */
  letterSpacing?: number;
  font?: string;
  color?: string;
}

/** One device's worth of styling. A partial: absent means "as inherited". */
export interface StyleLayer {
  /* Both a section and a widget. */
  padding?: BoxSides;
  margin?: BoxSides;
  /** Hide on THIS device. Only meaningful inside `tablet` / `phone`. */
  hidden?: boolean;

  /* Section only. */
  /** Fractions, one per column, renormalised to sum to 1. */
  columnWidths?: number[];
  gap?: number;
  border?: BorderSpec;
  radius?: number;
  shadow?: ShadowSpec;
  minHeight?: number;

  /* Container only — a box, a column, or a section, which is one too. */
  direction?: DirectionSpec;
  justify?: JustifySpec;
  alignItems?: ItemsSpec;
  wrap?: boolean;
  /** Grid only: how many even columns. */
  columns?: number;

  /* Widget only. */
  align?: AlignSpec;
  typography?: TypographySpec;
}

/** What a Section or a Widget carries. Absent on everything untouched. */
export interface ElementStyle extends StyleLayer {
  tablet?: StyleLayer;
  phone?: StyleLayer;
}

/* ══════════════════════════════════════════════════════════════════════════
   Reading a stored style
   ══════════════════════════════════════════════════════════════════════════ */

const SIDES = ["top", "right", "bottom", "left"] as const;
const BORDER_STYLES: ReadonlyArray<NonNullable<BorderSpec["style"]>> = ["solid", "dashed", "dotted"];
const SHADOWS: ReadonlyArray<ShadowSpec> = ["none", "soft", "strong"];
const ALIGNS: ReadonlyArray<AlignSpec> = ["left", "center", "right"];
const DIRECTIONS: ReadonlyArray<DirectionSpec> = ["row", "column", "grid"];
const JUSTIFIES: ReadonlyArray<JustifySpec> = ["start", "center", "end", "between"];
const ITEMS: ReadonlyArray<ItemsSpec> = ["start", "center", "end", "stretch"];

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** A CSS colour we are willing to put in a style attribute, or nothing. */
export function cssColour(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  if (!s) return undefined;
  return /^#[0-9a-fA-F]{3,8}$|^rgba?\(|^hsla?\(|^[a-zA-Z]+$/.test(s) ? s : undefined;
}

function readSides(v: unknown): BoxSides | undefined {
  if (!v || typeof v !== "object") return undefined;
  const out: BoxSides = {};
  for (const s of SIDES) {
    const n = num((v as any)[s]);
    if (n !== undefined) out[s] = n;
  }
  return Object.keys(out).length ? out : undefined;
}

function readTypography(v: unknown): TypographySpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const t: TypographySpec = {};
  const o: any = v;
  const size = num(o.size); if (size !== undefined) t.size = size;
  const weight = num(o.weight); if (weight !== undefined) t.weight = weight;
  const lineHeight = num(o.lineHeight); if (lineHeight !== undefined) t.lineHeight = lineHeight;
  const ls = num(o.letterSpacing); if (ls !== undefined) t.letterSpacing = ls;
  if (typeof o.font === "string" && o.font.trim()) t.font = o.font.trim();
  const colour = cssColour(o.color); if (colour) t.color = colour;
  return Object.keys(t).length ? t : undefined;
}

function readBorder(v: unknown): BorderSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o: any = v;
  const b: BorderSpec = {};
  const w = num(o.width); if (w !== undefined) b.width = Math.max(0, w);
  const colour = cssColour(o.color); if (colour) b.color = colour;
  if (BORDER_STYLES.includes(o.style)) b.style = o.style;
  return Object.keys(b).length ? b : undefined;
}

function readLayer(v: unknown): StyleLayer | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o: any = v;
  const L: StyleLayer = {};
  const padding = readSides(o.padding); if (padding) L.padding = padding;
  const margin = readSides(o.margin); if (margin) L.margin = margin;
  if (o.hidden === true) L.hidden = true;
  if (Array.isArray(o.columnWidths)) {
    const ws = (o.columnWidths as unknown[]).map((x) => num(x)).filter((x): x is number => x !== undefined && x > 0);
    if (ws.length) L.columnWidths = ws;
  }
  const gap = num(o.gap); if (gap !== undefined) L.gap = Math.max(0, gap);
  const border = readBorder(o.border); if (border) L.border = border;
  const radius = num(o.radius); if (radius !== undefined) L.radius = Math.max(0, radius);
  if (SHADOWS.includes(o.shadow)) L.shadow = o.shadow;
  const minHeight = num(o.minHeight); if (minHeight !== undefined) L.minHeight = Math.max(0, minHeight);
  if (ALIGNS.includes(o.align)) L.align = o.align;
  // A box's layout, read as tolerantly as everything else: anything that is not
  // one of the words this file knows is dropped rather than carried.
  if (DIRECTIONS.includes(o.direction)) L.direction = o.direction;
  if (JUSTIFIES.includes(o.justify)) L.justify = o.justify;
  if (ITEMS.includes(o.alignItems)) L.alignItems = o.alignItems;
  if (o.wrap === true) L.wrap = true;
  const columns = num(o.columns);
  if (columns !== undefined && columns >= 1) L.columns = Math.min(12, Math.round(columns));
  const typography = readTypography(o.typography); if (typography) L.typography = typography;
  return Object.keys(L).length ? L : undefined;
}

/**
 * A stored `style` read back, or `undefined` when there is nothing in it.
 *
 * Returning `undefined` rather than `{}` is load-bearing: `makeSection` only
 * sets the key when this returns something, so an untouched document has no
 * `style` key at all and `serialise → deserialise → serialise` is byte-stable.
 */
export function readStyle(raw: unknown): ElementStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const base = readLayer(raw) ?? {};
  const out: ElementStyle = { ...base };
  // A device layer never carries device layers of its own — one level, so the
  // cascade cannot become a tree nobody can hold in their head.
  const tablet = readLayer((raw as any).tablet); if (tablet) out.tablet = tablet;
  const phone = readLayer((raw as any).phone); if (phone) out.phone = phone;
  return Object.keys(out).length ? out : undefined;
}

/** True when this style says anything at all. */
export function hasStyle(s: ElementStyle | undefined | null): boolean {
  return !!s && Object.keys(s).length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   The cascade
   ══════════════════════════════════════════════════════════════════════════ */

function mergeLayer(base: StyleLayer, over: StyleLayer | undefined): StyleLayer {
  if (!over) return base;
  const out: StyleLayer = { ...base, ...over };
  // Per-KEY for the nested groups: changing one padding box on a phone must
  // not blank the other three.
  if (base.padding || over.padding) out.padding = { ...base.padding, ...over.padding };
  if (base.margin || over.margin) out.margin = { ...base.margin, ...over.margin };
  if (base.border || over.border) out.border = { ...base.border, ...over.border };
  if (base.typography || over.typography) out.typography = { ...base.typography, ...over.typography };
  return out;
}

/**
 * What this element looks like on that device.
 *
 * desktop → tablet → phone. `tablet` applies to a PHONE too, because a phone
 * is narrower than a tablet and an override that is not contradicted still
 * holds. Reverse that order and a phone-only change would be swallowed by the
 * tablet one — the mutation test for this breaks exactly here.
 */
export function resolveStyle(
  style: ElementStyle | undefined | null,
  device: Device = "desktop",
): StyleLayer {
  if (!style) return {};
  const { tablet, phone, ...base } = style;
  let out: StyleLayer = { ...base };
  if (device === "tablet" || device === "phone") out = mergeLayer(out, tablet);
  if (device === "phone") out = mergeLayer(out, phone);
  return out;
}

/** The layer an author is editing for a device — NOT the resolved value. */
export function layerFor(style: ElementStyle | undefined | null, device: Device): StyleLayer {
  if (!style) return {};
  if (device === "tablet") return style.tablet ?? {};
  if (device === "phone") return style.phone ?? {};
  const { tablet: _t, phone: _p, ...base } = style;
  return base;
}

/**
 * Write one layer back into a style, dropping it when it empties out.
 *
 * `undefined` for a key means "unset it" — that is how a Reset works, and why
 * resetting a group leaves the document with no `style` at all rather than an
 * empty husk that makes the diff say something changed.
 */
export function withLayer(
  style: ElementStyle | undefined | null,
  device: Device,
  patch: Partial<StyleLayer>,
): ElementStyle | undefined {
  const current = layerFor(style, device);
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) delete next[k];
    else next[k] = v;
  }
  const cleaned = readLayer(next) ?? {};
  const out: ElementStyle = device === "desktop"
    ? { ...cleaned }
    : { ...layerFor(style, "desktop") };
  if (device !== "desktop") {
    const tablet = device === "tablet" ? cleaned : (style?.tablet ?? {});
    const phone = device === "phone" ? cleaned : (style?.phone ?? {});
    if (Object.keys(tablet).length) out.tablet = tablet;
    if (Object.keys(phone).length) out.phone = phone;
  } else {
    if (style?.tablet && Object.keys(style.tablet).length) out.tablet = style.tablet;
    if (style?.phone && Object.keys(style.phone).length) out.phone = style.phone;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Clear a GROUP of keys on every device — the inspector's Reset.
 *
 * Every device and not just the one being edited: "put this back" means the
 * control reads as untouched afterwards, and a reset that left a phone
 * override behind would show a default the author does not have. Clearing the
 * last key removes `style` entirely, so a reset document is byte-identical to
 * one nobody ever styled.
 */
export function resetKeys(
  style: ElementStyle | undefined | null,
  keys: Array<keyof StyleLayer>,
): ElementStyle | undefined {
  let out: ElementStyle | undefined = style ?? undefined;
  for (const device of ["desktop", "tablet", "phone"] as Device[]) {
    const patch: Partial<StyleLayer> = {};
    for (const k of keys) (patch as any)[k] = undefined;
    out = withLayer(out, device, patch);
  }
  return out;
}

/* ═════════════════════════════════════════════════════════════════════════
   Column ratios
   ══════════════════════════════════════════════════════════════════════════ */

/** The presets the inspector offers, by column count. Every one sums to 1. */
export const RATIO_PRESETS: Record<number, Array<{ key: string; label: string; widths: number[] }>> = {
  2: [
    { key: "50-50", label: "50 / 50", widths: [0.5, 0.5] },
    { key: "33-67", label: "33 / 67", widths: [1 / 3, 2 / 3] },
    { key: "67-33", label: "67 / 33", widths: [2 / 3, 1 / 3] },
    { key: "25-75", label: "25 / 75", widths: [0.25, 0.75] },
    { key: "75-25", label: "75 / 25", widths: [0.75, 0.25] },
  ],
  3: [
    { key: "thirds", label: "Equal thirds", widths: [1 / 3, 1 / 3, 1 / 3] },
    { key: "25-50-25", label: "25 / 50 / 25", widths: [0.25, 0.5, 0.25] },
    { key: "50-25-25", label: "50 / 25 / 25", widths: [0.5, 0.25, 0.25] },
    { key: "25-25-50", label: "25 / 25 / 50", widths: [0.25, 0.25, 0.5] },
  ],
};

/**
 * The ratios for a section, always the right length and always summing to 1.
 *
 * RENORMALISED, not validated: a hand-edited document, an older editor or an
 * author dragging a custom split must never produce a row that does not add
 * up — the grid would then be narrower or wider than the section and the
 * author would be told nothing. Absent or unusable ratios mean equal columns.
 */
export function normaliseRatios(widths: unknown, layout: number): number[] | null {
  const n = Math.max(1, Math.floor(layout));
  if (!Array.isArray(widths) || widths.length !== n) return null;
  const ws = widths.map((x) => Number(x)).map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const sum = ws.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  return ws.map((x) => x / sum);
}

/** `1.2fr 2.4fr` for a 33/67 split. Null when the columns are equal. */
export function gridTemplateFor(widths: unknown, layout: number): string | null {
  const ws = normaliseRatios(widths, layout);
  if (!ws) return null;
  const even = ws.every((w) => Math.abs(w - 1 / ws.length) < 0.0005);
  if (even) return null;
  return ws.map((w) => `${round(w * ws.length, 3)}fr`).join(" ");
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/* ══════════════════════════════════════════════════════════════════════════
   CSS
   ══════════════════════════════════════════════════════════════════════════ */

/** Three shadows and no colour picker: a shadow an author tunes is a mess. */
export const SHADOW_CSS: Record<ShadowSpec, string> = {
  none: "none",
  soft: "0 1px 2px rgba(11,28,36,.06), 0 6px 18px rgba(11,28,36,.08)",
  strong: "0 2px 6px rgba(11,28,36,.10), 0 16px 40px rgba(11,28,36,.18)",
};

/** `12px 20px 12px 20px`, with 0 for the sides the author did not set. */
export function sidesToCss(sides: BoxSides | undefined): string | null {
  if (!sides) return null;
  const has = SIDES.some((s) => sides[s] !== undefined);
  if (!has) return null;
  return SIDES.map((s) => `${round(sides[s] ?? 0)}px`).join(" ");
}

/** True for a text-bearing widget kind — the ones that get a Typography group. */
export const TYPOGRAPHIC_KINDS: ReadonlySet<string> = new Set([
  "heading", "paragraph", "list", "callout", "button", "key_facts", "key_value_table",
  "testimonial", "doc_header", "footer_note", "merge_field", "personal_note", "clauses",
  "quote", "site_heading", "site_paragraph", "site_list", "site_button", "site_text",
  // D-156's atomic widgets. Every one of them is words on a page — a card's
  // name and price, a priced line, a label and its answer, a total — so every
  // one of them gets the Typography group, which is the whole promise of
  // §11.12's "its own Content / Typography / Spacing / Advanced".
  "card", "catalog_card", "price_line", "totals", "address_block", "key_fact",
]);

export function isTypographic(kind: string): boolean {
  return TYPOGRAPHIC_KINDS.has(kind) || kind.startsWith("site_");
}

/** Typography as declarations. Used for a CSS rule AND for an email's inline. */
export function typographyDeclarations(t: TypographySpec | undefined): string[] {
  if (!t) return [];
  const out: string[] = [];
  if (t.size !== undefined) out.push(`font-size:${round(t.size)}px`);
  if (t.weight !== undefined) out.push(`font-weight:${Math.round(t.weight)}`);
  if (t.lineHeight !== undefined) out.push(`line-height:${round(t.lineHeight, 3)}`);
  if (t.letterSpacing !== undefined) out.push(`letter-spacing:${round(t.letterSpacing, 2)}px`);
  if (t.font) out.push(`font-family:${t.font}`);
  if (t.color) out.push(`color:${t.color}`);
  return out;
}

/** A widget's own box: margin, padding, alignment, and whether it is there. */
export function widgetBoxDeclarations(layer: StyleLayer): string[] {
  const out: string[] = [];
  if (layer.hidden) out.push("display:none");
  const margin = sidesToCss(layer.margin);
  if (margin) out.push(`margin:${margin}`);
  const padding = sidesToCss(layer.padding);
  if (padding) out.push(`padding:${padding}`);
  if (layer.align) out.push(`text-align:${layer.align}`);
  return out;
}

/**
 * A section's own box.
 *
 * `padding` is NOT here: the section already writes `padding:Npx 40px` inline
 * and the renderer decides which of the two wins (see render.ts). Everything
 * else a section can wear is.
 */
export function sectionBoxDeclarations(layer: StyleLayer): string[] {
  const out: string[] = [];
  if (layer.hidden) out.push("display:none");
  const margin = sidesToCss(layer.margin);
  if (margin) out.push(`margin:${margin}`);
  if (layer.border?.width !== undefined || layer.border?.color || layer.border?.style) {
    const b = layer.border!;
    out.push(`border:${round(b.width ?? 1)}px ${b.style ?? "solid"} ${b.color ?? "#E2E8F0"}`);
  }
  if (layer.radius !== undefined) out.push(`border-radius:${round(layer.radius)}px`);
  if (layer.shadow) out.push(`box-shadow:${SHADOW_CSS[layer.shadow]}`);
  if (layer.minHeight !== undefined) out.push(`min-height:${round(layer.minHeight)}px`);
  return out;
}

/**
 * HOW A BOX ARRANGES WHAT IS IN IT (§11.12).
 *
 * The one place flex and grid are written, so the canvas, the customer's copy,
 * the landing page and the PDF cannot arrange the same box three ways.
 *
 * A box with NO direction emits nothing at all — it is a plain stacked block,
 * which is what the page already does, and emitting `display:flex` for it would
 * change the spacing of every existing document for no reason.
 *
 * `minHeight` and the box's own padding/border/radius come from
 * `sectionBoxDeclarations`; this is only the arranging.
 */
export const JUSTIFY_CSS: Record<JustifySpec, string> = {
  start: "flex-start", center: "center", end: "flex-end", between: "space-between",
};
export const ITEMS_CSS: Record<ItemsSpec, string> = {
  start: "flex-start", center: "center", end: "flex-end", stretch: "stretch",
};

export function containerLayoutDeclarations(layer: StyleLayer): string[] {
  const dir = layer.direction;
  const arranged = dir === "row" || dir === "grid" || !!layer.justify
    || !!layer.alignItems || !!layer.wrap || layer.gap !== undefined;
  if (!arranged) return [];

  const out: string[] = [];
  if (dir === "grid") {
    const n = Math.max(1, Math.min(12, Math.round(layer.columns ?? 3)));
    out.push("display:grid", `grid-template-columns:repeat(${n},minmax(0,1fr))`);
  } else {
    out.push("display:flex", `flex-direction:${dir === "row" ? "row" : "column"}`);
    if (layer.wrap) out.push("flex-wrap:wrap");
  }
  if (layer.justify) out.push(`justify-content:${JUSTIFY_CSS[layer.justify]}`);
  if (layer.alignItems) out.push(`align-items:${ITEMS_CSS[layer.alignItems]}`);
  if (layer.gap !== undefined) out.push(`gap:${round(layer.gap)}px`);
  return out;
}

/** The grid's own declarations: the ratio and the gap between columns. */
export function sectionGridDeclarations(layer: StyleLayer, layout: number): string[] {
  const out: string[] = [];
  const template = gridTemplateFor(layer.columnWidths, layout);
  if (template) out.push(`grid-template-columns:${template}`);
  if (layer.gap !== undefined) out.push(`gap:${round(layer.gap)}px`);
  return out;
}

/** The class a STYLED widget wears, in both modes. Stable, from its id. */
export function widgetStyleClass(widgetId: string): string {
  return `bx-sy-${String(widgetId).replace(/[^A-Za-z0-9_-]/g, "")}`;
}

interface Rule { selector: string; decls: string[] }

function ruleText(r: Rule, important: boolean): string {
  const body = r.decls.map((d) => (important ? `${d} !important` : d)).join(";");
  return `${r.selector}{${body}}`;
}

/**
 * THE stylesheet for one section and everything styled inside it.
 *
 * Emitted as a `<style>` block by the renderer, and ONLY when something is
 * actually styled — a document nobody has touched gets no block, which is what
 * keeps the golden fixtures byte-identical.
 *
 * Rules and not inline declarations, for one reason: typography has to reach
 * the heading INSIDE the widget, and `.bx-h1 { font-size: 26px }` beats
 * anything a wrapper could inherit down. One mechanism for all of it rather
 * than inline-for-spacing and rules-for-type.
 *
 * Device overrides carry `!important` because DOCUMENT_CSS's own phone block
 * already does (`.bx-sec { padding-left: 20px !important }`), and a phone
 * override the author typed has to beat a default the stylesheet assumed.
 */
export function styleBlockFor(
  input: {
    sectionSelector: string;
    gridSelector: string;
    layout: number;
    sectionStyle?: ElementStyle;
    /**
     * Per node: its selector and its style. Only STYLED ones.
     *
     * `container` says this is a BOX, so its style emits the arranging
     * declarations (§11.12) and the box ones — padding, border, radius, shadow,
     * least height — rather than a widget's margin-and-text-align. A box that
     * emitted a widget's declarations would take its padding and drop it.
     */
    widgets: Array<{ selector: string; style: ElementStyle; typographic: boolean; container?: boolean }>;
    /** Included for a section whose padding the style owns. See render.ts. */
    sectionPadding?: boolean;
  },
): string {
  const devices: Device[] = ["desktop", "tablet", "phone"];
  const blocks: string[] = [];

  for (const device of devices) {
    const rules: Rule[] = [];

    if (input.sectionStyle) {
      const layer = resolveStyle(input.sectionStyle, device);
      const own = layerFor(input.sectionStyle, device);
      // A device rule says only what that device CHANGES; the desktop rule
      // says everything. Otherwise every phone rule would restate the desktop
      // one with !important and nothing below it could ever win.
      const use = device === "desktop" ? layer : own;
      const decls = sectionBoxDeclarations(use);
      if (input.sectionPadding) {
        const padding = sidesToCss(use.padding);
        if (padding) decls.unshift(`padding:${padding}`);
      }
      if (decls.length) rules.push({ selector: input.sectionSelector, decls });
      const grid = sectionGridDeclarations(use, input.layout);
      if (grid.length) rules.push({ selector: input.gridSelector, decls: grid });
    }

    for (const w of input.widgets) {
      const layer = resolveStyle(w.style, device);
      const own = layerFor(w.style, device);
      const use = device === "desktop" ? layer : own;
      const box = w.container
        ? [
          ...sectionBoxDeclarations(use),
          ...(sidesToCss(use.padding) ? [`padding:${sidesToCss(use.padding)}`] : []),
          ...containerLayoutDeclarations(use),
        ]
        : widgetBoxDeclarations(use);
      if (box.length) rules.push({ selector: w.selector, decls: box });
      if (w.typographic) {
        const type = typographyDeclarations(use.typography);
        // The wrapper AND its immediate children: the wrapper so plain text
        // follows, the children so `.bx-h1`'s own font-size is beaten.
        if (type.length) rules.push({ selector: `${w.selector},${w.selector}>*`, decls: type });
      }
    }

    if (!rules.length) continue;
    const important = device !== "desktop";
    const body = rules.map((r) => ruleText(r, important)).join("");
    blocks.push(device === "desktop" ? body : `${deviceContainerQuery(device)}{${body}}`);
  }

  return blocks.join("");
}

/* ══════════════════════════════════════════════════════════════════════════
   The email's half
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * What a mailbox may be told, as inline declarations.
 *
 * NO `box-shadow` and NO `border-radius` from an author's style, ever. Outlook
 * renders through Word and drops both; a rounded card with a shadow in the
 * builder and square edges with none in the mailbox is a preview that lies, so
 * the inspector says "not in email" beside those two controls rather than
 * offering something that quietly does nothing.
 *
 * Device overrides do not reach a mailbox either — there are no queries there —
 * so the email resolves the DESKTOP layer and says so in the inspector.
 */
export function emailStyleDeclarations(
  style: ElementStyle | undefined,
  what: "section" | "widget",
): string[] {
  const layer = resolveStyle(style, "desktop");
  const out: string[] = [];
  if (what === "widget") {
    const margin = sidesToCss(layer.margin);
    if (margin) out.push(`padding:${margin}`);
    if (layer.align) out.push(`text-align:${layer.align}`);
    out.push(...typographyDeclarations(layer.typography));
  } else {
    const padding = sidesToCss(layer.padding);
    if (padding) out.push(`padding:${padding}`);
  }
  return out;
}

/** How wide each fluid column may get, given the section's ratios. */
export function emailColumnWidths(
  style: ElementStyle | undefined,
  layout: number,
  contentWidth: number,
): number[] {
  const ws = normaliseRatios(resolveStyle(style, "desktop").columnWidths, layout);
  if (!ws) return Array.from({ length: layout }, () => Math.floor(contentWidth / Math.max(1, layout)));
  return ws.map((w) => Math.floor(contentWidth * w));
}

/* ══════════════════════════════════════════════════════════════════════════
   The inspector's helpers (pure, so `node --test` can drive them)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Set one side, with the link toggle on or off.
 *
 * LINKED means the author is setting "the padding", not "the top padding", so
 * all four move together — the behaviour the chain icon promises in every
 * builder anybody has used. Unlinked, only the side they typed in changes.
 */
export function setSide(
  sides: BoxSides | undefined,
  side: keyof BoxSides,
  value: number | undefined,
  linked: boolean,
): BoxSides | undefined {
  if (linked) {
    if (value === undefined) return undefined;
    return { top: value, right: value, bottom: value, left: value };
  }
  const next: BoxSides = { ...sides };
  if (value === undefined) delete next[side];
  else next[side] = value;
  return Object.keys(next).length ? next : undefined;
}

/** True when all four sides are the same number — what the chain shows as on. */
export function sidesAreLinked(sides: BoxSides | undefined): boolean {
  if (!sides) return true;
  const values = SIDES.map((s) => sides[s]);
  return values.every((v) => v === values[0]);
}

/** The section padding an author starts from: the old single number, spread. */
export function seedFromPadding(padding: number): BoxSides {
  const n = Number.isFinite(Number(padding)) ? Number(padding) : 0;
  // 40 left and right is what renderSection has always written into the HTML;
  // seeding 0 there would make the first click on a spacing box SHIFT the page.
  return { top: n, right: 40, bottom: n, left: 40 };
}

export default {
  resetKeys, readStyle, hasStyle, resolveStyle, layerFor, withLayer, normaliseRatios, gridTemplateFor,
  styleBlockFor, emailStyleDeclarations, emailColumnWidths, setSide, sidesAreLinked, seedFromPadding,
};

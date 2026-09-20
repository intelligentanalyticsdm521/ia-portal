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

/**
 * Which way a box runs. Absent means "column", which is how boxes stack.
 *
 * FIVE words for what the reference editor draws as two controls: *Container
 * Layout* (Flexbox or Grid) and *Direction* (the four arrows → ↓ ← ↑). One
 * stored key answers both, because a box is either a grid or it runs one of
 * four ways and it cannot be both — two keys would let a document say
 * `container_type: grid` and `flex_direction: row` at once, and then every
 * reader has to decide which one wins.
 */
export type DirectionSpec = "row" | "column" | "row-reverse" | "column-reverse" | "grid";

/**
 * Along the box's own direction.
 *
 * SIX, not four (D-172, round 3). Driven in the reference on 2026-09-19: its
 * Justify Content chooser offers Start, Center, End, Space Between, Space
 * Around and Space Evenly. Ours had no word for the last two at all, so an
 * author who wanted even air round three cards could not ask for it.
 */
export type JustifySpec = "start" | "center" | "end" | "between" | "around" | "evenly";

/** Across it. */
export type ItemsSpec = "start" | "center" | "end" | "stretch";

/**
 * THE WRAPPED LINES, not the items (D-172, round 3).
 *
 * The reference's container carries Align Content beside Align Items, with the
 * same six words as Justify Content. It only says anything once the box wraps,
 * which is exactly why it is its own control and not a second meaning for
 * `alignItems`.
 */
export type ContentSpec = JustifySpec;

/**
 * THE UNIT A SIZE IS IN (D-172, round 3).
 *
 * Driven in the reference: every size control carries a unit switcher — Min
 * Height is px/em/rem/vh/custom, Gaps px/%/em/rem/vw/custom, font Size
 * px/em/rem/vw/custom. Ours had none anywhere: every size in the panel was a
 * bare pixel number, so "make this box as tall as the screen" could not be
 * said at all.
 *
 * "custom" is not offered: it takes a CSS expression, and a box that can be
 * given `calc(100% - 3rem)` is a box the PDF and the mailbox cannot promise.
 */
export type SizeUnit = "px" | "%" | "em" | "rem" | "vh" | "vw";

/** Which sizes may carry a unit. One key per size the panel can set. */
export interface UnitMap {
  minHeight?: SizeUnit;
  gap?: SizeUnit;
}

/** Boxed keeps the contents inside the page width; full runs edge to edge. */
export type ContentWidthSpec = "boxed" | "full";

/** Grid ▸ Auto Flow — which way a cell that was not placed is added. */
export type AutoFlowSpec = "row" | "column";

/** Layout ▸ Additional Options ▸ Overflow. */
export type OverflowSpec = "hidden" | "auto";

/** Advanced ▸ Layout ▸ Position. `static` is absent. */
export type PositionSpec = "absolute" | "fixed";

/* ── THE STYLE TAB'S BACKGROUND (§11.13, the reference's own four) ────────
   Classic (a colour and/or a picture), Gradient, Video and Slideshow, plus a
   Background Overlay layer with its own blend mode. ONE spec each, so the
   canvas, the published page, a mailbox and a sheet of paper all read the
   author's background from the same object and each draws as much of it as it
   can. A mailbox gets the colour; paper gets the colour; the page gets all
   four. */

export type BackgroundType = "classic" | "gradient" | "video" | "slideshow";
export type GradientKind = "linear" | "radial";

export interface BackgroundSpec {
  /** Absent means the box has no background of its own. */
  type?: BackgroundType;
  /** classic + gradient: the first colour. */
  color?: string;
  /** gradient: the second colour. */
  colorB?: string;
  gradient?: GradientKind;
  /** Degrees, for a linear gradient. */
  angle?: number;
  /** classic: a picture behind the box. An address, as everything else here. */
  image?: string;
  /** `center center`, `top left` … — the reference's own words. */
  position?: string;
  /** `no-repeat` | `repeat` | `repeat-x` | `repeat-y`. */
  repeat?: string;
  /** `cover` | `contain` | `auto`. */
  size?: string;
  /** video: the address of the film that plays behind the box. */
  videoUrl?: string;
  /** slideshow: the pictures it cycles through. */
  images?: string[];
}

export interface OverlaySpec {
  type?: Exclude<BackgroundType, "video" | "slideshow">;
  color?: string;
  colorB?: string;
  gradient?: GradientKind;
  angle?: number;
  image?: string;
  /** 0 → 1. The reference's own default is 0.5. */
  opacity?: number;
  /** `multiply`, `screen`, `overlay` … — the reference's own list. */
  blend?: string;
}

/** The eighteen shapes the reference editor's Shape Divider offers. */
export const SHAPE_DIVIDERS = [
  "mountains", "drops", "clouds", "zigzag", "pyramids", "triangle",
  "triangle-asymmetrical", "tilt", "opacity-tilt", "opacity-fan", "curve",
  "curve-asymmetrical", "waves", "wave-brush", "waves-pattern", "book",
  "split", "arrow",
] as const;
export type ShapeName = typeof SHAPE_DIVIDERS[number];

export interface ShapeDividerSpec {
  shape?: ShapeName;
  color?: string;
  /** px. */
  height?: number;
  /** %. */
  width?: number;
  flip?: boolean;
  /** The reference calls it Invert. */
  invert?: boolean;
  /** The reference calls it Bring to Front. */
  aboveContent?: boolean;
}

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
  /**
   * THE REFERENCE'S FOUR DIRECTIONS ARE FOUR VALUES, NOT THREE AND A FLAG.
   *
   * Its chooser reads Row - horizontal, Column - vertical, Row - reversed,
   * Column - reversed, and its own machine key `flex_direction` offers exactly
   * `row | column | row-reverse | column-reverse` — which is what
   * `DirectionSpec` holds. A separate `reverse` flag beside it was tried on
   * b168/demo and is DELETED: two keys would let a document say `row` and
   * `reverse` at once while the three server mirrors (arion's container
   * emitter, LUMEN, oliver's PDF) only ever read the value, so the reversal
   * would be lost on publish. Every reader that only wants "row, column or
   * grid?" asks `baseDirection`.
   */
  direction?: DirectionSpec;
  justify?: JustifySpec;
  alignItems?: ItemsSpec;
  /** The wrapped LINES, once `wrap` is on. The reference's Align Content. */
  alignContent?: ContentSpec;
  wrap?: boolean;
  /** Grid only: how many even columns. */
  columns?: number;
  /**
   * WHAT UNIT EACH SIZE IS IN. Absent means px, which is what every stored
   * document already means, so nothing has to be migrated.
   */
  units?: UnitMap;

  /* ── THE REST OF THE REFERENCE EDITOR'S CONTAINER PANEL (B-168, F0) ────
     Every one of these is a control the reference draws and we did not, and
     every one is per device, because every one of them is marked
     `responsive: true` in the machine catalogue. Read that flag off the file;
     never guess it. */

  /** Layout ▸ Container ▸ Content Width. Absent is the reference's `boxed`. */
  contentWidth?: ContentWidthSpec;
  /**
   * Layout ▸ Container ▸ Width. px when the content is boxed, % when it is
   * full — the reference swaps `boxed_width` for `width` on the same control,
   * so one key follows `contentWidth` rather than two keys disagreeing.
   */
  width?: number;
  /**
   * Layout ▸ Items ▸ Gaps, the ROW half. `gap` is the column half AND the
   * value used for both when this is absent, which is the reference's own
   * linked state — the chain is on exactly when nobody has set a row gap.
   */
  rowGap?: number;
  /** Grid only: how many rows. */
  rows?: number;
  /** Grid only: Auto Flow. */
  autoFlow?: AutoFlowSpec;
  /** Layout ▸ Additional Options ▸ Overflow. */
  overflow?: OverflowSpec;

  /* Style tab. */
  background?: BackgroundSpec;
  overlay?: OverlaySpec;
  shapeTop?: ShapeDividerSpec;
  shapeBottom?: ShapeDividerSpec;

  /* Advanced ▸ Layout — how this box sits in the box that holds IT. */
  alignSelf?: ItemsSpec;
  /** A plain number. The reference's Start / End / Custom is 0 / 99 / n. */
  order?: number;
  /** Advanced ▸ Layout ▸ Size, as a percentage of the parent. */
  selfWidth?: number;
  position?: PositionSpec;
  zIndex?: number;

  /* Widget only. */
  align?: AlignSpec;
  typography?: TypographySpec;
}

/** What a Section or a Widget carries. Absent on everything untouched. */
export interface ElementStyle extends StyleLayer {
  /**
   * ADVANCED ▸ ATTRIBUTES — §11.13.1's third Advanced section.
   *
   * Elementor's own Advanced tab ends with a CSS ID and CSS Classes, and they
   * are what a menu anchor links to and what a client's own stylesheet hooks
   * onto. They are NOT per-device: an id is an id on every screen, which is
   * why they sit on `ElementStyle` and not on `StyleLayer`.
   */
  cssId?: string;
  cssClasses?: string;
  /**
   * ADVANCED ▸ CUSTOM CSS and ADVANCED ▸ MOTION EFFECTS ▸ STICKY.
   *
   * Beside the id and the classes, and for the same reason: neither is per
   * device. A stylesheet is a stylesheet on every screen, and "stick this to
   * the top" is answered once and then told WHICH screens it applies to
   * (`stickyOn`) rather than being written three times.
   */
  customCss?: string;
  sticky?: "top" | "bottom";
  /** Which screens it sticks on. Absent means all three. */
  stickyOn?: Device[];
  /** px between the box and the edge it sticks to. */
  stickyOffset?: number;
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
const DIRECTIONS: ReadonlyArray<DirectionSpec> = ["row", "column", "row-reverse", "column-reverse", "grid"];
const JUSTIFIES: ReadonlyArray<JustifySpec> = ["start", "center", "end", "between", "around", "evenly"];
const ITEMS: ReadonlyArray<ItemsSpec> = ["start", "center", "end", "stretch"];
export const SIZE_UNITS: ReadonlyArray<SizeUnit> = ["px", "%", "em", "rem", "vh", "vw"];

/**
 * A UNIT A CONTROL CAN SAY IT IS MEASURED IN (2026-09-20).
 *
 * `SizeUnit` is what the STYLE LAYER stores and `sizeCss` will emit. A widget
 * size is not stored there — a Divider's Weight is a bare number its own
 * renderer writes `px` after, an Icon's Rotate is a bare number it writes `deg`
 * after — so the panel needs one more word than the layer does, and `deg` and
 * `fr` are it. They are deliberately NOT in `SIZE_UNITS`: nothing may store
 * them, `sizeCss` would drop them, and a slider that STATES its unit is doing
 * what `unitsOffered`'s own note describes — "a control with a single unit is
 * stating what it is measured in rather than offering a choice".
 */
export type UnitLabel = SizeUnit | "deg" | "fr";

/** A size with its unit, ready for CSS. Absent unit means px. */
export function sizeCss(value: number, unit: SizeUnit | undefined): string {
  return `${round(value)}${SIZE_UNITS.includes(unit as SizeUnit) ? unit : "px"}`;
}

/**
 * WHICH BUILDERS CANNOT CARRY A UNIT YET (B-168 land, the b168/demo merge).
 *
 * A unit switcher is new; the emitters are not. arion's container emitter
 * (`lib/websiteBuilder/elementorTree.js`) writes every size as
 * `{ unit: 'px', size }` — so a box set to `100vh` here would be published as
 * `100px`, which is worse than losing it: the author watches the control work
 * and the page comes out a different shape. The landing page's inline boxes go
 * through `render.containerLayoutCss`, which writes px the same way.
 *
 * A CONTROL THAT CHANGES NOTHING ON THE PUBLISHED PAGE IS A DEFECT, so on
 * those two builders the switcher offers px and nothing else, in ONE place,
 * rather than each size control remembering. Delete an entry the day that
 * builder's emitter carries the unit.
 */
export const PX_ONLY_BUILDERS: ReadonlyArray<string> = ["website", "landing"];

/**
 * The units a size control may offer in THIS builder.
 *
 * A list of ONE is left alone: a control with a single unit is stating what it
 * is measured in rather than offering a choice — Width says px or % because
 * Content Width already decided which, and the emitter carries that pair.
 */
export function unitsOffered<T extends string>(
  adapter: string | undefined, units: ReadonlyArray<T>,
): ReadonlyArray<T> {
  if (!adapter || units.length < 2 || !PX_ONLY_BUILDERS.includes(adapter)) return units;
  const kept = units.filter((u) => u === "px");
  return kept.length ? kept : units;
}
const CONTENT_WIDTHS: ReadonlyArray<ContentWidthSpec> = ["boxed", "full"];
const AUTO_FLOWS: ReadonlyArray<AutoFlowSpec> = ["row", "column"];
const OVERFLOWS: ReadonlyArray<OverflowSpec> = ["hidden", "auto"];
const POSITIONS: ReadonlyArray<PositionSpec> = ["absolute", "fixed"];
const BACKGROUND_TYPES: ReadonlyArray<BackgroundType> = ["classic", "gradient", "video", "slideshow"];
const GRADIENTS: ReadonlyArray<GradientKind> = ["linear", "radial"];
/** The reference's own words, closed at both ends: junk never reaches CSS. */
const BG_POSITIONS = [
  "center center", "center left", "center right", "top center", "top left", "top right",
  "bottom center", "bottom left", "bottom right", "initial",
] as const;
const BG_REPEATS = ["no-repeat", "repeat", "repeat-x", "repeat-y"] as const;
const BG_SIZES = ["auto", "cover", "contain"] as const;
const BLEND_MODES = [
  "multiply", "screen", "overlay", "darken", "lighten", "color-dodge",
  "saturation", "color", "luminosity",
] as const;

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

/** One of a closed list, or nothing. The rule the whole file already follows. */
function word<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  const s = String(v ?? "").trim();
  return (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

/** A whole number of pixels or degrees, never negative unless said so. */
function positive(v: unknown): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : Math.max(0, n);
}

function readBackground(v: unknown): BackgroundSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o: any = v;
  const b: BackgroundSpec = {};
  const type = word(o.type, BACKGROUND_TYPES); if (type) b.type = type;
  const colour = cssColour(o.color); if (colour) b.color = colour;
  const colourB = cssColour(o.colorB); if (colourB) b.colorB = colourB;
  const gradient = word(o.gradient, GRADIENTS); if (gradient) b.gradient = gradient;
  const angle = num(o.angle); if (angle !== undefined) b.angle = angle;
  if (typeof o.image === "string" && o.image.trim()) b.image = o.image.trim();
  const pos = word(o.position, BG_POSITIONS); if (pos) b.position = pos;
  const rep = word(o.repeat, BG_REPEATS); if (rep) b.repeat = rep;
  const size = word(o.size, BG_SIZES); if (size) b.size = size;
  if (typeof o.videoUrl === "string" && o.videoUrl.trim()) b.videoUrl = o.videoUrl.trim();
  if (Array.isArray(o.images)) {
    const pics = o.images.map((x: unknown) => String(x ?? "").trim()).filter(Boolean);
    if (pics.length) b.images = pics;
  }
  return Object.keys(b).length ? b : undefined;
}

function readOverlay(v: unknown): OverlaySpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o: any = v;
  const x: OverlaySpec = {};
  const type = word(o.type, ["classic", "gradient"] as const); if (type) x.type = type;
  const colour = cssColour(o.color); if (colour) x.color = colour;
  const colourB = cssColour(o.colorB); if (colourB) x.colorB = colourB;
  const gradient = word(o.gradient, GRADIENTS); if (gradient) x.gradient = gradient;
  const angle = num(o.angle); if (angle !== undefined) x.angle = angle;
  if (typeof o.image === "string" && o.image.trim()) x.image = o.image.trim();
  const opacity = num(o.opacity);
  if (opacity !== undefined) x.opacity = Math.min(1, Math.max(0, opacity));
  const blend = word(o.blend, BLEND_MODES); if (blend) x.blend = blend;
  return Object.keys(x).length ? x : undefined;
}

function readShape(v: unknown): ShapeDividerSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o: any = v;
  const s: ShapeDividerSpec = {};
  const shape = word(o.shape, SHAPE_DIVIDERS); if (shape) s.shape = shape;
  const colour = cssColour(o.color); if (colour) s.color = colour;
  const height = positive(o.height); if (height !== undefined) s.height = height;
  const width = positive(o.width); if (width !== undefined) s.width = width;
  if (o.flip === true) s.flip = true;
  if (o.invert === true) s.invert = true;
  if (o.aboveContent === true) s.aboveContent = true;
  // A divider with no SHAPE draws nothing, so its colour and height are not a
  // divider — they are keys that would ride in every document for ever.
  return s.shape ? s : undefined;
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
  if (JUSTIFIES.includes(o.alignContent)) L.alignContent = o.alignContent;
  if (o.wrap === true) L.wrap = true;
  if (o.units && typeof o.units === "object") {
    const u: UnitMap = {};
    if (SIZE_UNITS.includes(o.units.minHeight)) u.minHeight = o.units.minHeight;
    if (SIZE_UNITS.includes(o.units.gap)) u.gap = o.units.gap;
    if (Object.keys(u).length) L.units = u;
  }
  const columns = num(o.columns);
  if (columns !== undefined && columns >= 1) L.columns = Math.min(12, Math.round(columns));
  /* ── The rest of the reference editor's container panel (B-168, F0) ────
     Same rule as everything above it: a word this file does not know is
     dropped rather than carried, so a hand-edited document cannot put
     `position: everywhere` into a style attribute on a customer's page. */
  const contentWidth = word(o.contentWidth, CONTENT_WIDTHS); if (contentWidth) L.contentWidth = contentWidth;
  const width = positive(o.width); if (width !== undefined) L.width = width;
  const rowGap = positive(o.rowGap); if (rowGap !== undefined) L.rowGap = rowGap;
  const rows = num(o.rows);
  if (rows !== undefined && rows >= 1) L.rows = Math.min(12, Math.round(rows));
  const autoFlow = word(o.autoFlow, AUTO_FLOWS); if (autoFlow) L.autoFlow = autoFlow;
  const overflow = word(o.overflow, OVERFLOWS); if (overflow) L.overflow = overflow;
  const background = readBackground(o.background); if (background) L.background = background;
  const overlay = readOverlay(o.overlay); if (overlay) L.overlay = overlay;
  const shapeTop = readShape(o.shapeTop); if (shapeTop) L.shapeTop = shapeTop;
  const shapeBottom = readShape(o.shapeBottom); if (shapeBottom) L.shapeBottom = shapeBottom;
  if (ITEMS.includes(o.alignSelf)) L.alignSelf = o.alignSelf;
  const order = num(o.order); if (order !== undefined) L.order = Math.round(order);
  const selfWidth = positive(o.selfWidth);
  if (selfWidth !== undefined) L.selfWidth = Math.min(100, selfWidth);
  const position = word(o.position, POSITIONS); if (position) L.position = position;
  const zIndex = num(o.zIndex); if (zIndex !== undefined) L.zIndex = Math.round(zIndex);
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
  const r: any = raw;
  /* THE ELEMENT-LEVEL KEYS — not per device, and read here rather than in
     `readLayer` for exactly that reason. `cssId` and `cssClasses` came first
     (§11.13.1); Custom CSS and Sticky join them because neither changes with
     the width of the screen either. */
  if (typeof r.cssId === "string" && r.cssId.trim()) out.cssId = r.cssId.trim();
  if (typeof r.cssClasses === "string" && r.cssClasses.trim()) out.cssClasses = r.cssClasses.trim();
  if (typeof r.customCss === "string" && r.customCss.trim()) out.customCss = r.customCss;
  const sticky = word(r.sticky, ["top", "bottom"] as const); if (sticky) out.sticky = sticky;
  if (Array.isArray(r.stickyOn)) {
    const on: Device[] = [];
    for (const d of r.stickyOn as unknown[]) {
      const key = word(d, ["desktop", "tablet", "phone"] as const);
      if (key && !on.includes(key)) on.push(key);
    }
    if (on.length) out.stickyOn = on;
  }
  const stickyOffset = positive(r.stickyOffset);
  if (stickyOffset !== undefined) out.stickyOffset = stickyOffset;
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
  /* D-165 §11.13.3's set (S2→S1-1, done at integration 2026-09-19). Each of
     these puts WORDS on a page — an alert's title and body, an icon box's
     heading, a record block's labels and values — so each gets the Typography
     group, which is the whole promise of §11.12's "its own Content /
     Typography / Spacing / Advanced". `icon`, `image`, `divider`, `spacer`,
     `menu_anchor`, `shortcode` and the galleries are NOT here: they carry no
     text of their own, and a Typography group over a picture is a control
     that does nothing. */
  "icon_box", "image_box", "star_rating", "alert", "counter", "progress_bar",
  "tabs", "accordion", "toggle", "google_maps",
  "customer", "service_location", "business_info",
  "ia_posts", "reviews", "book_now", "ia_form", "newsletter_signup", "hours_location",
]);

/**
 * THE AUTHOR'S OWN ID AND CLASSES, as attributes, safe to put in markup.
 *
 * ONE reader for the three renderers, so a page, a mailbox and a PDF preview
 * cannot disagree about what the author typed. An id is one token — the first
 * one, with anything an HTML id may not carry stripped — because two elements
 * sharing an id is a menu anchor that jumps to the wrong place. Classes are
 * whitespace-separated tokens, same filter, deduplicated.
 *
 * Returns "" when there is nothing, so an untouched widget's markup is byte for
 * byte what it was and every golden stays valid.
 */
const TOKEN = /[^A-Za-z0-9_-]/g;

export function attributeAttrs(style: ElementStyle | undefined | null): { id: string; classes: string[] } {
  const raw = String(style?.cssId ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";
  const id = raw.replace(TOKEN, "");
  const seen = new Set<string>();
  for (const c of String(style?.cssClasses ?? "").trim().split(/\s+/)) {
    const t = c.replace(TOKEN, "");
    if (t) seen.add(t);
  }
  return { id, classes: [...seen] };
}

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
  if (layer.minHeight !== undefined) out.push(`min-height:${sizeCss(layer.minHeight, layer.units?.minHeight)}`);
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
  around: "space-around", evenly: "space-evenly",
};
export const ITEMS_CSS: Record<ItemsSpec, string> = {
  start: "flex-start", center: "center", end: "flex-end", stretch: "stretch",
};

/** Row and row-reverse both run across; column and column-reverse both stack. */
export function baseDirection(dir: DirectionSpec | undefined): "row" | "column" | "grid" {
  if (dir === "grid") return "grid";
  return dir === "row" || dir === "row-reverse" ? "row" : "column";
}

export function containerLayoutDeclarations(layer: StyleLayer): string[] {
  const dir = layer.direction;
  const arranged = baseDirection(dir) !== "column" || dir === "column-reverse" || !!layer.justify
    || !!layer.alignItems || !!layer.alignContent || !!layer.wrap
    || layer.gap !== undefined || layer.rowGap !== undefined;
  if (!arranged) return [];

  const out: string[] = [];
  if (dir === "grid") {
    const n = Math.max(1, Math.min(12, Math.round(layer.columns ?? 3)));
    out.push("display:grid", `grid-template-columns:repeat(${n},minmax(0,1fr))`);
    // Rows and auto flow only mean something in a grid, so they are only
    // written in one — a `grid-auto-flow` on a flex box is a declaration the
    // browser throws away and the next reader has to wonder about.
    if (layer.rows !== undefined) {
      out.push(`grid-template-rows:repeat(${Math.max(1, Math.min(12, Math.round(layer.rows)))},minmax(0,auto))`);
    }
    if (layer.autoFlow) out.push(`grid-auto-flow:${layer.autoFlow}`);
  } else {
    /* REVERSED IS ONE OF THE FOUR VALUES, not a flag beside three of them: the
       stored direction IS the CSS word, which is why nothing has to be
       assembled here and why the three server mirrors can write the same
       reversal without knowing about a second key. */
    out.push("display:flex", `flex-direction:${dir ?? "column"}`);
    if (layer.wrap) out.push("flex-wrap:wrap");
  }
  if (layer.justify) out.push(`justify-content:${JUSTIFY_CSS[layer.justify]}`);
  if (layer.alignItems) out.push(`align-items:${ITEMS_CSS[layer.alignItems]}`);
  /* ALIGN CONTENT only says anything once the lines wrap, which is the
     reference's own rule for offering it. */
  if (layer.alignContent) out.push(`align-content:${JUSTIFY_CSS[layer.alignContent]}`);
  // THE GAPS CONTROL IS TWO NUMBERS AND A CHAIN (the reference's own `flex_gap`
  // / `grid_gaps`). `gap` is the column half and, when nobody has unlinked the
  // chain by setting a row gap, both halves — which is what a linked chain
  // means and why one key can answer for two. Both halves are written through
  // `sizeCss`, so the unit the author picked is the unit the page gets.
  const unit = layer.units?.gap;
  const column = layer.gap;
  const row = layer.rowGap ?? layer.gap;
  if (column !== undefined || row !== undefined) {
    out.push(row === column
      ? `gap:${sizeCss(column ?? 0, unit)}`
      : `gap:${sizeCss(row ?? 0, unit)} ${sizeCss(column ?? 0, unit)}`);
  }
  /* OVERFLOW IS NOT WRITTEN HERE. It is the BOX's, not the arranging's, and it
     is in `containerBoxDeclarations` — which emits for a plain stacked box
     too, where this function deliberately emits nothing at all. Writing it in
     both would put `overflow:` twice in one rule, because `styleBlockFor`
     concatenates the two lists for the same box. */
  return out;
}

/**
 * WHAT A BOX IS, BEYOND HOW IT ARRANGES ITS CHILDREN (B-168, F0).
 *
 * The rest of the reference editor's container panel that is plain CSS: its
 * width and content width, its background, what it does when the contents do
 * not fit, and how it sits in the box that holds IT. Separate from
 * `containerLayoutDeclarations` because that one answers "how does this
 * arrange what is inside it" and this one answers "what is this box" — two
 * questions, and a reader that only wants the first (the email's inline box)
 * should not be handed the second.
 */
export function containerBoxDeclarations(layer: StyleLayer): string[] {
  const out: string[] = [];
  /* Boxed is the reference's default and means "as wide as the page allows",
     so only FULL is worth saying; a width with no content width is the author
     typing a number into the boxed control, which is a max-width. A full box
     that also carries a width says the WIDTH and not both — `width:100%`
     followed by `width:90%` is one declaration pretending to be two. */
  if (layer.contentWidth === "full") {
    out.push(layer.width === undefined ? "width:100%" : `width:${round(Math.min(100, layer.width))}%`);
    out.push("max-width:none");
  } else if (layer.width !== undefined) {
    out.push(`max-width:${round(layer.width)}px`);
  }
  /* OVERFLOW IS WRITTEN HERE AND ONLY HERE (B-168 land, the b168/demo merge).
     Both branches wrote it, in two different functions that `styleBlockFor`
     concatenates for the same box; this is the one that emits for a PLAIN
     stacked box as well, so the control is never silent. */
  if (layer.overflow) out.push(`overflow:${layer.overflow}`);
  if (layer.position) out.push(`position:${layer.position}`);
  if (layer.zIndex !== undefined) out.push(`z-index:${Math.round(layer.zIndex)}`);
  if (layer.alignSelf) out.push(`align-self:${ITEMS_CSS[layer.alignSelf]}`);
  if (layer.order !== undefined) out.push(`order:${Math.round(layer.order)}`);
  if (layer.selfWidth !== undefined) {
    // A percentage of the parent, and `flex-basis` beside it so the box keeps
    // that share inside a flex row rather than being squeezed by its content.
    out.push(`flex-basis:${round(layer.selfWidth)}%`, `max-width:${round(layer.selfWidth)}%`);
  }
  out.push(...backgroundDeclarations(layer.background));
  // A box with an overlay or a shape divider has something drawn ON it, and
  // both are positioned against the box — so the box has to be a positioning
  // parent, unless the author already made it one.
  if ((layer.overlay || layer.shapeTop || layer.shapeBottom) && !layer.position) {
    out.push("position:relative");
  }
  return out;
}

/** A gradient, in CSS, from the two colours and the angle the author picked. */
function gradientCss(
  kind: GradientKind | undefined, from: string | undefined, to: string | undefined, angle: number | undefined,
): string {
  const a = from || "transparent";
  const b = to || "transparent";
  return kind === "radial"
    ? `radial-gradient(at center center, ${a} 0%, ${b} 100%)`
    : `linear-gradient(${round(angle ?? 180)}deg, ${a} 0%, ${b} 100%)`;
}

/**
 * THE FOUR BACKGROUNDS, as far as CSS can carry them.
 *
 * Classic is a colour and a picture. Gradient is two colours. VIDEO AND
 * SLIDESHOW ARE NOT CSS: the reference plays them with its own script, so here
 * they draw their first frame — the poster picture for a film, the first
 * picture for a slideshow — over the colour. That is the honest half: the
 * canvas shows the author what a reader gets before the script runs, and the
 * published page (arion) gets the real thing. A mailbox and a sheet of paper
 * get the colour and nothing else, which is all either can do.
 */
export function backgroundDeclarations(bg: BackgroundSpec | undefined): string[] {
  if (!bg || !bg.type) return [];
  const out: string[] = [];
  if (bg.type === "gradient") {
    out.push(`background-image:${gradientCss(bg.gradient, bg.color, bg.colorB, bg.angle)}`);
    return out;
  }
  if (bg.color) out.push(`background-color:${bg.color}`);
  const picture = bg.type === "slideshow" ? (bg.images?.[0] ?? "") : (bg.image ?? "");
  if (picture) {
    out.push(`background-image:url(${cssUrl(picture)})`);
    out.push(`background-position:${bg.position || "center center"}`);
    out.push(`background-repeat:${bg.repeat || "no-repeat"}`);
    out.push(`background-size:${bg.size || "cover"}`);
  }
  return out;
}

/** An address that is safe inside `url(...)`: no quote, no bracket, no space. */
export function cssUrl(raw: string): string {
  return `"${String(raw).replace(/["'()\\\s]/g, "")}"`;
}

/**
 * THE BACKGROUND OVERLAY, as a `::before` on the box itself.
 *
 * No extra markup, which matters: the customer's copy, the canvas and the
 * published page all draw the same element tree, and an overlay that added a
 * div on one of them would change what "the first thing in this box" means.
 */
export function overlayDeclarations(o: OverlaySpec | undefined): string[] {
  if (!o || !o.type) return [];
  const out = [
    'content:""', "position:absolute", "inset:0", "pointer-events:none",
  ];
  if (o.type === "gradient") {
    out.push(`background-image:${gradientCss(o.gradient, o.color, o.colorB, o.angle)}`);
  } else {
    if (o.color) out.push(`background-color:${o.color}`);
    if (o.image) {
      out.push(`background-image:url(${cssUrl(o.image)})`, "background-size:cover", "background-position:center center");
    }
  }
  out.push(`opacity:${round(o.opacity ?? 0.5, 2)}`);
  if (o.blend) out.push(`mix-blend-mode:${o.blend}`);
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   Shape dividers — the Style tab's fourth section
   ══════════════════════════════════════════════════════════════════════════

   OUR OWN ARTWORK, NOT THE REFERENCE'S. The eighteen NAMES are Elementor's,
   read out of the machine catalogue's `shape_divider_top` options, and so is
   every control beside them — colour, height, width, Flip, Invert, Bring to
   Front. The eighteen PATHS below are drawn here, because copying another
   product's artwork into ours is not parity, it is taking their file. A wave
   is a wave; it is not their wave.

   One path per shape in a 1000 × 100 box, `preserveAspectRatio="none"` so the
   height control stretches it, exactly as the reference's own do. */

const SHAPE_PATHS: Record<ShapeName, string> = {
  mountains: "M0,100 L250,30 L400,70 L620,10 L800,60 L1000,20 L1000,100 Z",
  drops: "M0,100 L0,40 Q60,0 120,40 Q180,80 240,40 Q300,0 360,40 Q420,80 480,40 Q540,0 600,40 Q660,80 720,40 Q780,0 840,40 Q900,80 960,40 L1000,40 L1000,100 Z",
  clouds: "M0,100 L0,60 Q80,20 160,60 Q240,10 330,55 Q420,15 510,60 Q600,20 690,58 Q780,18 870,60 Q940,35 1000,55 L1000,100 Z",
  zigzag: "M0,100 L0,50 L100,0 L200,50 L300,0 L400,50 L500,0 L600,50 L700,0 L800,50 L900,0 L1000,50 L1000,100 Z",
  pyramids: "M0,100 L166,20 L333,100 L500,20 L666,100 L833,20 L1000,100 Z",
  triangle: "M0,100 L500,0 L1000,100 Z",
  // EIGHTEEN SHAPES, EIGHTEEN PATHS. A test walks the whole list and fails on
  // two that draw the same thing — because a picker whose "Tilt" and
  // "Triangle asymmetrical" are one shape is a control that lies about four of
  // its options. Found by running it, 2026-09-19.
  "triangle-asymmetrical": "M0,100 L350,0 L1000,100 Z",
  tilt: "M0,100 L1000,0 L1000,100 Z",
  "opacity-tilt": "M0,100 L1000,25 L1000,100 Z",
  "opacity-fan": "M0,100 L500,0 L1000,100 L500,45 Z",
  curve: "M0,100 Q500,-40 1000,100 Z",
  "curve-asymmetrical": "M0,100 Q700,-30 1000,60 L1000,100 Z",
  waves: "M0,100 L0,50 Q125,0 250,50 Q375,100 500,50 Q625,0 750,50 Q875,100 1000,50 L1000,100 Z",
  "wave-brush": "M0,100 L0,60 Q140,20 280,55 Q430,95 570,50 Q720,5 860,45 Q930,65 1000,50 L1000,100 Z",
  "waves-pattern": "M0,100 L0,70 Q100,40 200,70 Q300,100 400,70 Q500,40 600,70 Q700,100 800,70 Q900,40 1000,70 L1000,100 Z",
  book: "M0,100 L0,20 Q250,80 500,20 Q750,80 1000,20 L1000,100 Z",
  split: "M0,100 L0,0 L450,0 L500,60 L550,0 L1000,0 L1000,100 Z",
  arrow: "M0,100 L0,0 L420,0 L500,70 L580,0 L1000,0 L1000,100 Z",
};

/**
 * The shapes that are DRAWN AT A LOWER OPACITY, because their names say so.
 *
 * `opacity-tilt` and `opacity-fan` are the reference's own faded pair; drawing
 * them solid would be a control whose name promises the one thing it does not
 * do.
 */
const FADED: ReadonlySet<ShapeName> = new Set<ShapeName>(["opacity-tilt", "opacity-fan"]);

/**
 * One shape divider as markup, or "" when the author has not picked a shape.
 *
 * `edge` is which end of the box it sits on. Everything is inline: the canvas,
 * the customer's copy and a saved page are one document, and a divider that
 * needed a stylesheet would be missing from whichever of the three drew
 * without one.
 */
export function shapeDividerHtml(
  spec: ShapeDividerSpec | undefined,
  edge: "top" | "bottom",
): string {
  if (!spec?.shape) return "";
  const path = SHAPE_PATHS[spec.shape];
  if (!path) return "";
  const height = round(spec.height ?? 60);
  const width = round(spec.width ?? 100);
  const colour = spec.color || "currentColor";
  // INVERT turns the shape upside down inside its own box — the reference's
  // own meaning: the cut goes the other way. FLIP mirrors it left to right.
  // Two transforms, two controls, and they compose.
  const flips = [
    spec.invert ? "scaleY(-1)" : "",
    spec.flip ? "scaleX(-1)" : "",
  ].filter(Boolean).join(" ");
  const box: string[] = [
    "position:absolute", "left:0", "width:100%", "overflow:hidden",
    "line-height:0", "pointer-events:none",
    edge === "top" ? "top:0" : "bottom:0",
    `z-index:${spec.aboveContent ? 2 : 0}`,
  ];
  // A BOTTOM divider is the top one turned over, which is why one set of paths
  // serves both ends rather than eighteen more.
  const turn = edge === "bottom" ? "scaleY(-1)" : "";
  const svgStyle = [
    `height:${height}px`, `width:${width}%`, "display:block",
    width !== 100 ? "margin:0 auto" : "",
    [turn, flips].filter(Boolean).length ? `transform:${[turn, flips].filter(Boolean).join(" ")}` : "",
    FADED.has(spec.shape) ? "opacity:.55" : "",
  ].filter(Boolean).join(";");
  return `<div class="bx-shape bx-shape-${edge}" aria-hidden="true" style="${box.join(";")}">`
    + `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 100" preserveAspectRatio="none" style="${svgStyle}">`
    + `<path d="${path}" fill="${colour}"/></svg></div>`;
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
          ...containerBoxDeclarations(use),
        ]
        : widgetBoxDeclarations(use);
      /* HIDE ON DESKTOP — the reference's third switch (B-168, F0).
         `hidden` on the base layer used to mean "hidden everywhere", because
         the desktop rule has no query and so reaches a phone too. The three
         switches are INDEPENDENT in the reference, so a box hidden only on a
         computer has to be PUT BACK on the two smaller screens — and put back
         as what it actually is, which for a box is its own display. */
      if (device !== "desktop" && resolveStyle(w.style, "desktop").hidden && !own.hidden) {
        const shown = w.container
          ? (containerLayoutDeclarations(layer).find((d) => d.startsWith("display:")) ?? "display:block")
          : "display:block";
        box.push(shown);
      }
      if (box.length) rules.push({ selector: w.selector, decls: box });
      /* The overlay is a `::before` on the box itself, so it is a rule of its
         own rather than a declaration — and only on a box, because a widget
         has no Background Overlay section in the reference either. */
      if (w.container) {
        const overlay = overlayDeclarations(use.overlay);
        if (overlay.length) rules.push({ selector: `${w.selector}::before`, decls: overlay });
      }
      if (w.typographic) {
        const type = typographyDeclarations(use.typography);
        // The wrapper AND its immediate children: the wrapper so plain text
        // follows, the children so `.bx-h1`'s own font-size is beaten.
        if (type.length) rules.push({ selector: `${w.selector},${w.selector}>*`, decls: type });
      }
    }

    /* STICKY — Advanced ▸ Motion Effects, and it is per SCREEN, not per layer.
       The author says "stick this to the top" once and then which screens it
       applies to; `stickyOn` absent means all three, which is the reference's
       own default. Written inside the device loop because that is where the
       queries already are, and nowhere else, so there is one sticky. */
    for (const w of input.widgets) {
      const decls = stickyDeclarations(w.style, device);
      if (decls.length) rules.push({ selector: w.selector, decls });
    }
    if (input.sectionStyle) {
      const decls = stickyDeclarations(input.sectionStyle, device);
      if (decls.length) rules.push({ selector: input.sectionSelector, decls });
    }

    if (!rules.length) continue;
    const important = device !== "desktop";
    const body = rules.map((r) => ruleText(r, important)).join("");
    blocks.push(device === "desktop" ? body : `${deviceContainerQuery(device)}{${body}}`);
  }

  /* CUSTOM CSS — last, so the author's own rules beat everything above them,
     which is what "custom" has to mean or the control does nothing. Outside
     the device loop because a stylesheet is not per device: the author writes
     their own queries if they want them. */
  for (const w of input.widgets) {
    const own = customCssFor(w.style, w.selector);
    if (own) blocks.push(own);
  }
  const sectionOwn = customCssFor(input.sectionStyle, input.sectionSelector);
  if (sectionOwn) blocks.push(sectionOwn);

  return blocks.join("");
}

/**
 * ADVANCED ▸ MOTION EFFECTS ▸ STICKY, for one screen.
 *
 * Empty unless the author asked for it AND this screen is one they asked for.
 */
export function stickyDeclarations(style: ElementStyle | undefined | null, device: Device): string[] {
  if (!style?.sticky) return [];
  const on = style.stickyOn ?? ["desktop", "tablet", "phone"];
  if (!on.includes(device)) return [];
  return [
    "position:sticky",
    `${style.sticky}:${round(style.stickyOffset ?? 0)}px`,
    // Above what scrolls past it, unless the author said otherwise.
    ...(resolveStyle(style, device).zIndex === undefined ? ["z-index:10"] : []),
  ];
}

/**
 * THE AUTHOR'S OWN CSS, scoped to their own element.
 *
 * The reference's convention is that the word `selector` inside the box means
 * "this element", so that is honoured; CSS with no `selector` in it is wrapped
 * in one, which is what an author who typed three declarations meant.
 *
 * `</style` CANNOT SURVIVE. This text is put inside a `<style>` block on a
 * page a stranger opens: a closing tag in it would end the block early and
 * everything after it would be markup the author wrote, which is the whole of
 * the injection. Neutered rather than refused, because silently dropping an
 * author's CSS teaches them nothing.
 */
export function customCssFor(
  style: ElementStyle | undefined | null,
  selector: string,
): string {
  const raw = String(style?.customCss ?? "").trim();
  if (!raw) return "";
  const safe = raw.replace(/<\/\s*style/gi, "<\\/style");
  return /(^|[^a-zA-Z0-9_-])selector([^a-zA-Z0-9_-]|$)/.test(safe)
    ? safe.replace(/(^|[^a-zA-Z0-9_-])selector([^a-zA-Z0-9_-]|$)/g, `$1${selector}$2`)
    : `${selector}{${safe}}`;
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
  /* B-168, F0 — the rest of the reference editor's container panel. */
  baseDirection, containerBoxDeclarations, backgroundDeclarations, overlayDeclarations,
  shapeDividerHtml, stickyDeclarations, customCssFor,
};

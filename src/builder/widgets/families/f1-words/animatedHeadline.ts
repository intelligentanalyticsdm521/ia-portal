/**
 * f1-words/animatedHeadline.ts — Elementor Pro's **Animated Headline**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `animated-headline`: title
 * "Animated Headline", group `pro-elements`, icon `eicon-animated-headline`.
 * Content tab, ONE section called "Headline":
 *
 *   headline_style   select    "Animation Style"  `highlight` | `rotate`
 *   animation_type   select    "Animation Type"   `typing`  (rotate only)
 *   marker           select    "Animation Shape"  `circle`  (highlight only)
 *   before_text      text      "Before Text"      `This page is`
 *   highlighted_text text      "Highlighted Text" `Amazing` (highlight only)
 *   rotating_text    textarea  "Rotating Text"    `Better\nBigger\nFaster`
 *   after_text       text      "After Text"
 *   loop             switcher  "Infinite Loop"    on
 *   link             url       "Link"
 *   tag              select    "HTML Tag"         `h3`
 *
 * ── THE JAVASCRIPT, AND THE FALLBACK ──────────────────────────────────────
 * The animation is the widget: Elementor types, clips, flips or swirls the
 * middle word in the browser. What matters for a page whose JavaScript never
 * arrives — and for the editor canvas, the proposal preview and a printed
 * copy — is that the SENTENCE still reads. So this renderer draws the whole
 * headline in its final resting state: before text, then the highlighted word
 * with its shape drawn as static SVG (or the FIRST rotating phrase), then the
 * after text. Nobody sees a half-empty line, ever.
 *
 * ── WHERE IT IS OFFERED ───────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_pro` and
 * `landing.elementor_pro`. Not email, not proposals, not My Brand.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom } from "../../../pictures";
import type { WidgetOption } from "../../../registry";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

export const HEADLINE_STYLES: WidgetOption[] = [
  { value: "highlight", label: "Highlight" },
  { value: "rotate", label: "Rotate" },
];

export const HEADLINE_ANIMATIONS: WidgetOption[] = [
  { value: "typing", label: "Typing" },
  { value: "clip", label: "Clip" },
  { value: "flip", label: "Flip" },
  { value: "swirl", label: "Swirl" },
  { value: "blinds", label: "Blinds" },
  { value: "drop-in", label: "Drop In" },
  { value: "wave", label: "Wave" },
  { value: "slide", label: "Slide" },
  { value: "slide-down", label: "Slide Down" },
];

export const HEADLINE_MARKERS: WidgetOption[] = [
  { value: "circle", label: "Circle" },
  { value: "curly", label: "Curly" },
  { value: "underline", label: "Underline" },
  { value: "double", label: "Double" },
  { value: "double_underline", label: "Double Underline" },
  { value: "underline_zigzag", label: "Underline Zigzag" },
  { value: "diagonal", label: "Diagonal" },
  { value: "strikethrough", label: "Strikethrough" },
  { value: "x", label: "X" },
];

export const HEADLINE_TAGS: WidgetOption[] = [
  { value: "h1", label: "H1" }, { value: "h2", label: "H2" }, { value: "h3", label: "H3" },
  { value: "h4", label: "H4" }, { value: "h5", label: "H5" }, { value: "h6", label: "H6" },
  { value: "div", label: "div" }, { value: "span", label: "span" }, { value: "p", label: "p" },
];

const TAGS = new Set(HEADLINE_TAGS.map((o) => o.value));

/** Elementor's nine shapes, each a path drawn over a 0–100 × 0–20 strip. */
export const MARKER_PATHS: Record<string, string> = {
  circle: "M6,10 C6,2 94,2 94,10 C94,18 6,18 6,10",
  curly: "M2,15 C25,8 40,18 60,12 C75,8 88,14 98,10",
  underline: "M2,16 L98,16",
  double: "M2,13 L98,13 M2,18 L98,18",
  double_underline: "M2,13 L98,13 M2,18 L98,18",
  underline_zigzag: "M2,16 L14,12 L26,16 L38,12 L50,16 L62,12 L74,16 L86,12 L98,16",
  diagonal: "M4,18 L96,3",
  strikethrough: "M2,10 L98,10",
  x: "M4,3 L96,18 M96,3 L4,18",
};

export function markerPath(marker: unknown): string {
  return MARKER_PATHS[str(marker)] || MARKER_PATHS.underline;
}

/** The rotating phrases, one per line, in the order they were typed. */
export function rotatingPhrases(v: unknown): string[] {
  return str(v).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * THE WORD THE PAGE SHOWS WHEN NOTHING IS ANIMATING.
 *
 * Highlight style: the highlighted word. Rotate style: the FIRST phrase, which
 * is the one Elementor itself paints before its script starts.
 */
export function restingWord(props: Record<string, unknown> | undefined | null): string {
  const p: any = props || {};
  if (str(p.headline_style) === "rotate") return rotatingPhrases(p.rotating_text)[0] || "";
  return str(p.highlighted_text);
}

export function renderAnimatedHeadline(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const before = str(p.before_text);
  const after = str(p.after_text);
  const middle = restingWord(p);
  if (!before.trim() && !after.trim() && !middle.trim() && ctx.mode !== "edit") return "";
  const tag = TAGS.has(str(p.tag)) ? str(p.tag) : "h3";
  const highlight = str(p.headline_style) !== "rotate";
  const ink = ctx.accent;

  const middleHtml = middle.trim()
    ? (highlight
      ? `<span class="bx-ah-mark" style="position:relative;display:inline-block;white-space:nowrap">`
        + `<span data-edit="highlighted_text">${esc(middle)}</span>`
        + `<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"`
        + ` style="position:absolute;left:0;right:0;bottom:-0.22em;width:100%;height:0.6em;overflow:visible">`
        + `<path d="${markerPath(p.marker)}" fill="none" stroke="${esc(ink)}" stroke-width="2"`
        + ` stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></span>`
      : `<span class="bx-ah-rotate" style="color:${esc(ink)}">${esc(middle)}</span>`)
    : (ctx.mode === "edit"
      ? `<span class="bx-slot" data-edit="${highlight ? "highlighted_text" : "rotating_text"}" data-placeholder="${highlight ? "the word to mark" : "one phrase per line"}"></span>`
      : "");

  const line = [
    before.trim() ? `<span data-edit="before_text">${esc(before)}</span>` : "",
    middleHtml,
    after.trim() ? `<span data-edit="after_text">${esc(after)}</span>` : "",
  ].filter(Boolean).join(" ");

  const inner = `<${tag} class="bx-animated-headline" style="margin:0;font-family:${esc(ctx.headingFont)};line-height:1.35">${line}</${tag}>`;
  const link = str(p.link).trim();
  return link && ctx.mode !== "edit"
    ? `<a href="${esc(link)}" style="text-decoration:none;color:inherit">${inner}</a>`
    : inner;
}

export const ANIMATED_HEADLINE_DEF: FamilyWidgetDef = {
  kind: "animated_headline",
  label: "Animated Headline",
  description: "A headline where one word is marked or cycles through a few words you choose.",
  icon: "Sparkles",
  picture: pictureFrom(bar(6, 14, 18) + bar(28, 14, 20)
    + `<path d="M28 24 C36 20 44 26 48 22" stroke="#94A3B8"/>` + bar(52, 14, 8)),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    headline_style: "highlight",
    animation_type: "typing",
    marker: "circle",
    before_text: "This page is",
    highlighted_text: "Amazing",
    rotating_text: "Better\nBigger\nFaster",
    after_text: "",
    loop: true,
    link: "",
    tag: "h3",
  },
  controls: [
    { key: "headline_style", label: "Animation Style", type: "select", tab: "content", section: "Headline", options: HEADLINE_STYLES },
    {
      key: "animation_type", label: "Animation Type", type: "select", tab: "content", section: "Headline",
      options: HEADLINE_ANIMATIONS, help: "Used when the style is Rotate.",
    },
    {
      key: "marker", label: "Animation Shape", type: "select", tab: "content", section: "Headline",
      options: HEADLINE_MARKERS, help: "Used when the style is Highlight.",
    },
    { key: "before_text", label: "Before Text", type: "text", tab: "content", section: "Headline" },
    { key: "highlighted_text", label: "Highlighted Text", type: "text", tab: "content", section: "Headline" },
    {
      key: "rotating_text", label: "Rotating Text", type: "textarea", tab: "content", section: "Headline",
      help: "One phrase per line. The first one is what a visitor sees first.",
    },
    { key: "after_text", label: "After Text", type: "text", tab: "content", section: "Headline" },
    { key: "loop", label: "Infinite Loop", type: "toggle", tab: "content", section: "Headline" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Headline" },
    { key: "tag", label: "HTML Tag", type: "select", tab: "content", section: "Headline", options: HEADLINE_TAGS },
  ],
};

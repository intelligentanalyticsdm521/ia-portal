/**
 * f1-words/textPath.ts — Elementor's **Text Path**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` → `text-path`: title "Text
 * Path", group `general` (FREE — the catalogue's `pro` flag is false), icon
 * `eicon-wordart`. Content tab, ONE section called "Text Path":
 *
 *   text                 text     "Text"            `Add Your Curvy Text Here`
 *   path                 select   "Path Type"       `wave`
 *   custom_path          media    "SVG"             only when path = custom
 *   link                 url      "Link"
 *   align                choose   "Alignment"       responsive
 *   text_path_direction  select   "Text Direction"
 *   show_path            switcher "Show Path"       off
 *
 * Style tab, Elementor's two sections: "Text Path" (Size, Starting Point,
 * Color) and "Path" (Color, Stroke Color, Stroke Width).
 *
 * ── THE JAVASCRIPT, AND THE FALLBACK ──────────────────────────────────────
 * Elementor builds the curve in the browser. We emit the whole thing as static
 * SVG — a `<path>` with an id and a `<textPath>` pointing at it — so the words
 * follow the curve with no script at all, in the editor, in the preview and on
 * a published page whose JavaScript failed to load. The id is the widget's own
 * id, so two Text Paths on one page never bend each other's words.
 *
 * ── WHERE IT IS OFFERED ───────────────────────────────────────────────────
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free` and
 * `landing.elementor_free`. NOT My Brand — the plan's §A says the pixel canvas
 * wants it most, and the offer file does not give it to My Brand, and the offer
 * file wins.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import type { WidgetOption } from "../../../registry";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));
const on = (v: unknown): boolean => v === true || v === "yes";

export const TEXT_PATH_DEFAULT_TEXT = "Add Your Curvy Text Here";

export const TEXT_PATH_TYPES: WidgetOption[] = [
  { value: "wave", label: "Wave" },
  { value: "arc", label: "Arc" },
  { value: "circle", label: "Circle" },
  { value: "line", label: "Line" },
  { value: "oval", label: "Oval" },
  { value: "spiral", label: "Spiral" },
  { value: "custom", label: "Custom" },
];

export const TEXT_PATH_DIRECTIONS: WidgetOption[] = [
  { value: "", label: "Default" },
  { value: "ltr", label: "Left to Right" },
  { value: "rtl", label: "Right to Left" },
];

export const TEXT_PATH_ALIGNMENTS: WidgetOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

/**
 * The six shapes, as SVG `d` strings in one 300 × 150 box.
 *
 * One box for all six, so the widget is the same size whichever shape is
 * picked and switching shape does not move everything under it on the page.
 * `custom` has no `d`: the author's own SVG file is the path, and until they
 * pick one the widget says so rather than drawing a seventh shape nobody chose.
 */
export const TEXT_PATH_SHAPES: Record<string, string> = {
  wave: "M10,100 C60,30 100,170 150,100 C200,30 240,170 290,100",
  arc: "M15,130 A135,135 0 0,1 285,130",
  circle: "M150,20 a60,60 0 1,1 -0.1,0",
  line: "M10,75 L290,75",
  oval: "M150,25 a110,50 0 1,1 -0.1,0",
  spiral: "M150,75 m0,-8 a8,8 0 1,1 -8,8 a20,20 0 1,1 20,-20 a34,34 0 1,1 -34,34 a48,48 0 1,1 48,-48",
};

export function textPathD(path: unknown): string {
  return TEXT_PATH_SHAPES[str(path)] || TEXT_PATH_SHAPES.wave;
}

export function renderTextPath(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const words = str(p.text) || (ctx.mode === "edit" ? TEXT_PATH_DEFAULT_TEXT : "");
  if (!words.trim()) return "";
  const shape = str(p.path) || "wave";
  if (shape === "custom" && !str(p.custom_path).trim()) {
    return ctx.mode === "edit"
      ? `<div class="bx-imgdrop">Pick the SVG file your words should follow.</div>`
      : "";
  }
  const id = `bxpath-${esc(String(w.id || "1")).replace(/[^A-Za-z0-9_-]/g, "")}`;
  const d = textPathD(shape);
  const size = Number(p.size) > 0 ? Number(p.size) : 500;
  const start = Math.max(0, Math.min(100, Number(p.start_point) || 0));
  const ink = str(p.text_color_normal) || ctx.ink;
  const stroke = str(p.stroke_color_normal) || "#E8178A";
  const strokeWidth = Number(p.stroke_width_normal) > 0 ? Number(p.stroke_width_normal) : 1;
  const fill = str(p.path_fill_normal) || "none";
  const align = str(p.align) || "left";
  const dir = str(p.text_path_direction);
  const showPath = on(p.show_path);
  const inner =
    `<svg viewBox="0 0 300 150" width="${size}" style="max-width:100%;height:auto;overflow:visible" role="img"`
    + ` aria-label="${esc(words)}">`
    + `<path id="${id}" d="${d}" fill="${esc(fill)}"`
    + ` stroke="${showPath ? esc(stroke) : "none"}" stroke-width="${showPath ? strokeWidth : 0}"/>`
    + `<text fill="${esc(ink)}" font-family="${esc(ctx.headingFont)}" font-size="18"${dir ? ` direction="${esc(dir)}"` : ""}>`
    + `<textPath href="#${id}" startOffset="${start}%">${esc(words)}</textPath>`
    + `</text></svg>`;
  const link = str(p.link).trim();
  const body = link && ctx.mode !== "edit"
    ? `<a href="${esc(link)}" style="text-decoration:none">${inner}</a>`
    : inner;
  return `<div class="bx-text-path" style="text-align:${esc(align)}"`
    + `${ctx.mode === "edit" ? ` data-edit="text" data-placeholder="${esc(TEXT_PATH_DEFAULT_TEXT)}"` : ""}>`
    + `${body}</div>`;
}

export const TEXT_PATH_DEF: FamilyWidgetDef = {
  kind: "text_path",
  label: "Text Path",
  description: "A line of words that follows a curve — a wave, an arc, a circle or your own shape.",
  icon: "Spline",
  picture: pictureFrom(
    `<path d="M6 26 C16 10 26 34 34 22 C42 10 52 30 58 18" stroke="#94A3B8"/>`
    + `<path d="M6 34h52" stroke="#E2E8F0"/>`),
  category: "General",
  builders: ["website", "landing"],
  tier: "free",
  defaults: {
    text: TEXT_PATH_DEFAULT_TEXT,
    path: "wave",
    custom_path: "",
    link: "",
    align: "left",
    text_path_direction: "",
    show_path: false,
  },
  controls: [
    { key: "text", label: "Text", type: "text", tab: "content", section: "Text Path" },
    { key: "path", label: "Path Type", type: "select", tab: "content", section: "Text Path", options: TEXT_PATH_TYPES },
    {
      key: "custom_path", label: "SVG", type: "image", tab: "content", section: "Text Path",
      help: "Only used when Path Type is Custom.",
    },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Text Path" },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Text Path", options: TEXT_PATH_ALIGNMENTS, responsive: true },
    { key: "text_path_direction", label: "Text Direction", type: "select", tab: "content", section: "Text Path", options: TEXT_PATH_DIRECTIONS },
    { key: "show_path", label: "Show Path", type: "toggle", tab: "content", section: "Text Path" },

    /* Style — Elementor's own two sections and its own keys. */
    { key: "size", label: "Size", type: "number", tab: "style", section: "Text Path", responsive: true },
    { key: "start_point", label: "Starting Point (%)", type: "number", tab: "style", section: "Text Path", responsive: true },
    { key: "text_color_normal", label: "Color", type: "colour", tab: "style", section: "Text Path" },
    { key: "path_fill_normal", label: "Color", type: "colour", tab: "style", section: "Path" },
    { key: "stroke_color_normal", label: "Stroke Color", type: "colour", tab: "style", section: "Path" },
    { key: "stroke_width_normal", label: "Stroke Width", type: "number", tab: "style", section: "Path" },
  ],
};

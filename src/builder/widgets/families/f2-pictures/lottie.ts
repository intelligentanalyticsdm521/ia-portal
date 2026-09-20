/**
 * families/f2-pictures/lottie.ts — Elementor PRO's **Lottie**.
 *
 * A JSON animation that plays on scroll, on click or on hover. Offer file:
 * `website.elementor_pro` and `landing.elementor_pro`. (The plan's row 19 also
 * pencilled in My Brand; the offer file's `mybrand` list is ten widgets and
 * Lottie is not one of them, and THE OFFER FILE WINS.)
 *
 * Sections, labels, options and defaults from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `lottie`.
 *
 * ── NO JAVASCRIPT, NO BLANK BAND ──────────────────────────────────────────
 * A Lottie is a JSON file played by a script. Our renderer never runs one: it
 * draws the still frame of the widget — a framed panel with the caption under
 * it, and the whole thing wrapped in the author's link when they set one. That
 * is the editor's picture of the page AND the fallback a visitor with no
 * JavaScript sees, so the page keeps its shape and its words either way.
 */
import { esc } from "../../../esc";
import { bar, box, pictureFrom } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef } from "../types";
import { emptyDrop, mediaUrl, str } from "./media";

/** Where the animation comes from. Elementor's own two. */
const SOURCES = [
  { value: "media_file", label: "Media File" },
  { value: "external_url", label: "External URL" },
];

/** What starts it playing. Elementor's own five. */
const TRIGGERS = [
  { value: "arriving_to_viewport", label: "Viewport" },
  { value: "on_click", label: "On Click" },
  { value: "on_hover", label: "On Hover" },
  { value: "bind_to_scroll", label: "Bind to Scroll" },
  { value: "none", label: "None" },
];

/** The address of the JSON, whichever source the author chose. */
export function lottieSource(p: any): string {
  return str(p.source) === "external_url"
    ? mediaUrl(p.source_external_url)
    : mediaUrl(p.source_json);
}

/** The caption under it, per Elementor's Caption select. */
function captionOf(p: any): string {
  return str(p.caption_source) === "custom" ? str(p.caption) : "";
}

export function renderLottie(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = lottieSource(p);
  if (!src) {
    return emptyDrop(ctx.mode, "Choose a Lottie JSON file, or paste its address, in the panel on the right.");
  }
  const align = ["left", "center", "right"].includes(str(p.align)) ? str(p.align) : "center";
  const width = Number(p.width) > 0 ? `${Math.min(100, Number(p.width))}%` : "100%";
  const caption = captionOf(p);
  const still = `<div class="bx-lottie-frame" style="width:${width};max-width:100%;aspect-ratio:1/1;border:1px dashed #CBD5E1;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748B;font-size:12px">Animation</div>`;
  const link = mediaUrl(p.custom_link);
  const body = str(p.link_to) === "custom" && link
    ? `<a href="${esc(link)}" style="display:inline-block;max-width:100%">${still}</a>`
    : still;
  return `<div class="bx-lottie" style="text-align:${align}">
    ${body}
    ${caption ? `<div class="bx-lottie-caption" style="margin-top:6px;font-size:12px;color:${esc(str(p.text_color) || "#64748B")}">${esc(caption)}</div>` : ""}
  </div>`;
}

export const LOTTIE_DEF: FamilyWidgetDef = {
  kind: "lottie",
  label: "Lottie",
  description: {
    website: "A small animation that plays as the visitor scrolls to it.",
    landing: "A small animation that plays as the visitor scrolls to it.",
  },
  icon: "Sparkles",
  picture: pictureFrom(box(14, 6, 36, 24) + `<path d="M22 24c4-14 12-14 16 0" stroke="#94A3B8"/>`
    + `<circle cx="22" cy="24" r="2.5" fill="#94A3B8" stroke="none"/>` + bar(20, 34, 24, 2)),
  category: "General",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    source: "media_file",
    source_json: "",
    source_external_url: "",
    align: "center",
    caption_source: "none",
    caption: "",
    link_to: "none",
    custom_link: "",
    trigger: "arriving_to_viewport",
    loop: "",
    number_of_times: "",
    reverse_animation: "",
    renderer: "svg",
    lazyload: "",
  },
  controls: [
    /* Content → Lottie. */
    { key: "source", label: "Source", type: "select", tab: "content", section: "Lottie", options: SOURCES },
    { key: "source_json", label: "Upload JSON File", type: "image", tab: "content", section: "Lottie",
      help: "A .json animation file." },
    { key: "source_external_url", label: "External URL", type: "link", tab: "content", section: "Lottie" },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Lottie", responsive: true, options: [
      { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }] },
    { key: "caption_source", label: "Caption", type: "select", tab: "content", section: "Lottie", options: [
      { value: "none", label: "None" }, { value: "custom", label: "Custom Caption" }] },
    { key: "caption", label: "Custom Caption", type: "text", tab: "content", section: "Lottie" },
    { key: "link_to", label: "Link", type: "select", tab: "content", section: "Lottie", options: [
      { value: "none", label: "None" }, { value: "custom", label: "Custom URL" }] },
    { key: "custom_link", label: "Link", type: "link", tab: "content", section: "Lottie" },
    /* Content → Settings. */
    { key: "trigger", label: "Trigger", type: "select", tab: "content", section: "Settings", options: TRIGGERS },
    { key: "loop", label: "Loop", type: "toggle", tab: "content", section: "Settings" },
    { key: "number_of_times", label: "Times", type: "number", tab: "content", section: "Settings" },
    { key: "reverse_animation", label: "Reverse", type: "toggle", tab: "content", section: "Settings" },
    { key: "renderer", label: "Renderer", type: "select", tab: "content", section: "Settings", options: [
      { value: "svg", label: "SVG" }, { value: "canvas", label: "Canvas" }] },
    { key: "lazyload", label: "Lazy Load", type: "toggle", tab: "content", section: "Settings" },
    /* Style → Lottie, and Style → Caption. Elementor's own section names. */
    { key: "width", label: "Width", type: "number", tab: "style", section: "Lottie", responsive: true },
    { key: "opacity", label: "Opacity", type: "number", tab: "style", section: "Lottie" },
    { key: "caption_align", label: "Alignment", type: "select", tab: "style", section: "Caption", options: [
      { value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }] },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Caption" },
  ],
};

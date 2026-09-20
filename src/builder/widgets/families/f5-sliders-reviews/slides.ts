/**
 * families/f5-sliders-reviews/slides.ts — Elementor `slides` (Pro, "Slides").
 *
 * The full-width hero slideshow: a picture per slide with a heading, a line of
 * words and a button on top of it. Elementor's panel, control for control, from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`:
 *
 *   Slides          Slides Name · the repeater · Height (400px) ·
 *                   Title HTML Tag · Description HTML Tag
 *   Slider Options  Navigation · Autoplay · Pause on Hover ·
 *                   Pause on Interaction · Autoplay Speed · Infinite Loop ·
 *                   Transition · Transition Speed (ms)
 *   Style           Slides · Title · Description · Button · Navigation
 *
 * Not seen live — the free Playground editor carries no Pro widget.
 *
 * ── NO SCRIPT, AND THEREFORE NO BLANK HERO ────────────────────────────────
 * A hero slideshow is the widget where a missing script is most expensive: it
 * is the top of the page. So the slides are a scroll-snap strip one slide wide
 * (see carousel.ts) — slide one is simply the first thing in the flow, and the
 * rest are a swipe away with nothing loaded. On a published WordPress page the
 * engine's own script takes over and the author gets the real fades.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom, solid } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import { emptyStrip, slideRows, str, strip, within } from "./carousel";

const NAVIGATION = [
  { value: "both", label: "Arrows and Dots" },
  { value: "arrows", label: "Arrows" },
  { value: "dots", label: "Dots" },
  { value: "none", label: "None" },
];

const TRANSITION = [
  { value: "slide", label: "Slide" },
  { value: "fade", label: "Fade" },
];

const TAGS = [
  { value: "div", label: "div" },
  { value: "h1", label: "H1" }, { value: "h2", label: "H2" }, { value: "h3", label: "H3" },
  { value: "h4", label: "H4" }, { value: "h5", label: "H5" }, { value: "h6", label: "H6" },
  { value: "p", label: "p" }, { value: "span", label: "span" },
];

const POSITIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

export function renderSlides(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const rows = slideRows(p);
  if (!rows.length) return emptyStrip(ctx, "Add a slide in the panel on the right.");
  const height = within(p.slides_height, 80, 1200, 400);
  const align = str(p.slides_text_align) || "center";
  const cells = rows.map((r, i) => {
    const bgImage = str((r as any).background_image);
    const bgColour = str((r as any).background_color) || "#0F172A";
    const overlay = str((r as any).background_overlay_color);
    const buttonText = str((r as any).button_text);
    const link = str((r as any).link);
    const layers = [
      bgImage ? `background-image:url('${esc(bgImage)}');background-size:cover;background-position:center` : "",
      `background-color:${esc(bgColour)}`,
    ].filter(Boolean).join(";");
    const justify = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    return `<div class="bx-slides-slide" style="position:relative;min-height:${height}px;${layers};border-radius:8px;overflow:hidden;display:flex;flex-direction:column;justify-content:center;align-items:${justify};padding:24px;text-align:${esc(align)};color:#FFFFFF">
      ${overlay ? `<span aria-hidden="true" style="position:absolute;inset:0;background:${esc(overlay)};opacity:0.5"></span>` : ""}
      <div style="position:relative;max-width:640px">
        ${editRun(`slides.${i}.heading`, (r as any).heading, "bx-slides-h", "A headline", ctx, "div")}
        ${editRun(`slides.${i}.description`, (r as any).description, "bx-slides-d", "A line about it", ctx, "div")}
        ${buttonText || ctx.mode === "edit"
      ? `<a class="bx-button" style="background:${esc(ctx.accent)};display:inline-block;margin-top:12px" href="${esc(link || "#")}">${
        editRun(`slides.${i}.button_text`, buttonText, "bx-slides-b", "What the button says", ctx, "span")}</a>`
      : ""}
      </div>
    </div>`;
  });
  return `<div class="bx-slides">${strip(cells, { perView: 1, gap: 0, cls: "bx-strip" })}</div>`;
}

export const SLIDES_DEF: FamilyWidgetDef = {
  kind: "slides",
  label: "Slides",
  description: {
    website: "A big picture at the top of the page that changes, with words and a button on each one.",
    landing: "A big picture at the top of the page that changes, with words and a button on each one.",
  },
  icon: "GalleryHorizontalEnd",
  picture: pictureFrom(solid(6, 7, 52, 26) + bar(14, 14, 24, 4) + bar(14, 22, 16, 3)
    + `<path d="M10 20h-2M56 20h-2" />`),
  /* THE GROUP IS **Pro**, not General. D-168 item 6 (b168/override) gave
     Elementor's 37 pro-elements widgets a group of their own, read off
     `elementor-panel.json`, because they sat in General behind a padlock
     and that is a difference a person sees the second our panel is beside
     the real editor. `panelAt` also refuses to place a tile whose group
     disagrees with Elementor's, so General here meant "no place at all". */
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    slides_name: "Slides",
    slides: [
      { heading: "", description: "", button_text: "", link: "", background_color: "#0F172A", background_image: "", background_overlay_color: "" },
      { heading: "", description: "", button_text: "", link: "", background_color: "#1E293B", background_image: "", background_overlay_color: "" },
    ],
    slides_height: 400, slides_title_tag: "div", slides_description_tag: "div",
    navigation: "both", autoplay: "yes", pause_on_hover: "yes", pause_on_interaction: "yes",
    autoplay_speed: 5000, infinite: "yes", transition: "slide", transition_speed: 500,
    slides_text_align: "center", heading_color: "", description_color: "",
  },
  controls: [
    { key: "slides_name", label: "Slides Name", type: "text", tab: "content", section: "Slides" },
    { key: "slides", label: "Slides", type: "list", tab: "content", section: "Slides" },
    { key: "slides_height", label: "Height", type: "number", tab: "content", section: "Slides", responsive: true },
    { key: "slides_title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Slides", options: TAGS },
    { key: "slides_description_tag", label: "Description HTML Tag", type: "select", tab: "content", section: "Slides", options: TAGS },
    { key: "navigation", label: "Navigation", type: "select", tab: "content", section: "Slider Options", options: NAVIGATION },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Slider Options" },
    { key: "pause_on_hover", label: "Pause on Hover", type: "toggle", tab: "content", section: "Slider Options" },
    { key: "pause_on_interaction", label: "Pause on Interaction", type: "toggle", tab: "content", section: "Slider Options" },
    { key: "autoplay_speed", label: "Autoplay Speed", type: "number", tab: "content", section: "Slider Options" },
    { key: "infinite", label: "Infinite Loop", type: "toggle", tab: "content", section: "Slider Options" },
    { key: "transition", label: "Transition", type: "select", tab: "content", section: "Slider Options", options: TRANSITION },
    { key: "transition_speed", label: "Transition Speed (ms)", type: "number", tab: "content", section: "Slider Options" },
    { key: "slides_text_align", label: "Text Align", type: "select", tab: "style", section: "Slides", options: POSITIONS },
    { key: "heading_color", label: "Text Color", type: "colour", tab: "style", section: "Title" },
    { key: "description_color", label: "Text Color", type: "colour", tab: "style", section: "Description" },
  ],
};

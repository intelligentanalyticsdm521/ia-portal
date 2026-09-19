/**
 * families/f5-sliders-reviews/testimonialCarousel.ts — Elementor
 * `testimonial-carousel` (Pro, "Testimonial Carousel").
 *
 * Reviews with a photo, a name and a role, side by side and scrollable. The
 * panel is Elementor's: **Slides** (Slides Name, the repeater, Skin, Layout,
 * Alignment, Slides Per View, Slides to Scroll) and **Additional Options**
 * (Arrows, Pagination, Autoplay, Infinite Loop, Pause on Hover), with a Style
 * tab of Slides / Content / Image / Navigation.
 *
 * Read off `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, control by control.
 * Not seen live — the free Playground editor carries no Pro widget.
 *
 * The repeater row is Elementor's own four — `content`, `image`, `name`,
 * `title` — which is Reviews' row without the rating and the source icon, so
 * the two share one reader (`slideRows`) and one strip.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { bar, pictureFrom, solid } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyWidgetDef } from "../types";
import { emptyStrip, slideRows, str, strip, within } from "./carousel";

/** Elementor's own two skins. */
const SKINS = [
  { value: "default", label: "Default" },
  { value: "bubble", label: "Bubble" },
];

/** …and its own four layouts, by its own words. */
const LAYOUTS = [
  { value: "image_inline", label: "Image Inline" },
  { value: "image_stacked", label: "Image Stacked" },
  { value: "image_above", label: "Image Above" },
  { value: "image_left", label: "Image Left" },
  { value: "image_right", label: "Image Right" },
];

const ALIGNMENTS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
];

const PER_VIEW = [
  { value: "", label: "Default" },
  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

const PAGINATION = [
  { value: "", label: "None" },
  { value: "bullets", label: "Dots" },
  { value: "fraction", label: "Fraction" },
  { value: "progressbar", label: "Progress" },
];

export function renderTestimonialCarousel(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const rows = slideRows(p);
  if (!rows.length) return emptyStrip(ctx, "Add what a customer said in the panel on the right.");
  const per = within(p.slides_per_view, 1, 10, 3);
  const gap = within(p.space_between, 0, 200, 20);
  const align = str(p.alignment) || "center";
  const layout = str(p.layout) || "image_inline";
  const above = layout === "image_above" || layout === "image_stacked";
  const bubble = str(p.skin) === "bubble";
  const cells = rows.map((r, i) => {
    const image = str(r.image);
    const pic = image
      ? `<img src="${esc(image)}" alt="" style="width:48px;height:48px;border-radius:999px;object-fit:cover;flex:0 0 auto"/>`
      : "";
    const who = `<div style="min-width:0">
        ${editRun(`slides.${i}.name`, r.name, "bx-review-n", "Who said it", ctx, "div")}
        ${editRun(`slides.${i}.title`, r.title, "bx-review-t", "Their job or company", ctx, "div")}
      </div>`;
    return `<figure class="bx-tcarousel-slide" style="margin:0;text-align:${esc(align)}">
      <div class="bx-tcarousel-words" style="${bubble ? "border:1px solid #E2E8F0;border-radius:10px;padding:14px;" : ""}">
        ${editRun(`slides.${i}.content`, r.content, "bx-review-b", "What they said", ctx, "blockquote")}
      </div>
      <figcaption style="display:flex;gap:10px;margin-top:10px;flex-direction:${above ? "column" : "row"};align-items:${align === "center" ? "center" : "flex-start"};justify-content:${align === "center" ? "center" : "flex-start"}">
        ${pic}${who}
      </figcaption>
    </figure>`;
  });
  return `<div class="bx-tcarousel">${strip(cells, { perView: per, gap, cls: "bx-strip" })}</div>`;
}

export const TESTIMONIAL_CAROUSEL_DEF: FamilyWidgetDef = {
  kind: "testimonial_carousel",
  label: "Testimonial Carousel",
  description: {
    website: "Several customer quotes side by side, that a visitor can swipe through.",
    landing: "Several customer quotes side by side, that a visitor can swipe through.",
  },
  icon: "MessagesSquare",
  picture: pictureFrom(`<rect x="4" y="9" width="24" height="22" rx="3" fill="none"/>`
    + `<rect x="34" y="9" width="24" height="22" rx="3" fill="none"/>`
    + solid(9, 14, 8, 8) + bar(9, 25, 14, 3) + solid(39, 14, 8, 8) + bar(39, 25, 14, 3)),
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
      { content: "", image: "", name: "", title: "" },
      { content: "", image: "", name: "", title: "" },
      { content: "", image: "", name: "", title: "" },
    ],
    skin: "default", layout: "image_inline", alignment: "center",
    slides_per_view: "", slides_to_scroll: "",
    show_arrows: "yes", pagination: "bullets", autoplay: "yes", autoplay_speed: 5000,
    loop: "yes", pause_on_hover: "yes",
    space_between: 20, slide_background_color: "", content_color: "", name_color: "", image_size: 48,
  },
  controls: [
    { key: "slides_name", label: "Slides Name", type: "text", tab: "content", section: "Slides" },
    { key: "slides", label: "Slides", type: "list", tab: "content", section: "Slides" },
    { key: "skin", label: "Skin", type: "select", tab: "content", section: "Slides", options: SKINS },
    { key: "layout", label: "Layout", type: "select", tab: "content", section: "Slides", options: LAYOUTS },
    { key: "alignment", label: "Alignment", type: "select", tab: "content", section: "Slides", responsive: true, options: ALIGNMENTS },
    { key: "slides_per_view", label: "Slides Per View", type: "select", tab: "content", section: "Slides", responsive: true, options: PER_VIEW },
    { key: "slides_to_scroll", label: "Slides to Scroll", type: "select", tab: "content", section: "Slides", responsive: true, options: PER_VIEW },
    { key: "show_arrows", label: "Arrows", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pagination", label: "Pagination", type: "select", tab: "content", section: "Additional Options", options: PAGINATION },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "autoplay_speed", label: "Autoplay Speed", type: "number", tab: "content", section: "Additional Options" },
    { key: "loop", label: "Infinite Loop", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pause_on_hover", label: "Pause on Hover", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "space_between", label: "Space Between", type: "number", tab: "style", section: "Slides", responsive: true },
    { key: "slide_background_color", label: "Background Color", type: "colour", tab: "style", section: "Slides" },
    { key: "content_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "name_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "image_size", label: "Size", type: "number", tab: "style", section: "Image", responsive: true },
  ],
};

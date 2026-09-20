/**
 * families/f5-sliders-reviews/mediaCarousel.ts — Elementor `media-carousel`
 * (Pro, "Media Carousel").
 *
 * A carousel of pictures, or of videos shown as a picture you press. Elementor's
 * panel, from `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`:
 *
 *   Slides              Skin · Slides Name · the repeater · Effect · Height ·
 *                       Slides Per View · Slides to Scroll
 *   Additional Options  Arrows · Pagination · Transition Duration · Autoplay ·
 *                       Autoplay Speed · Infinite Loop · Pause on Hover ·
 *                       Image Resolution · Lazy Load
 *   Style               Slides · Navigation · Overlay · Lightbox
 *
 * Not seen live — the free Playground editor carries no Pro widget.
 *
 * A VIDEO SLIDE IS A PICTURE WITH A PLAY MARK ON IT, here and in every surface
 * that is not a browser with the engine's script running. That is not a
 * simplification: an `<iframe>` per slide in a carousel loads every video on
 * the page whether anyone watches it or not, and the engine's own default skin
 * does the same thing — a poster and a play icon, with the player opening on
 * the press.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, solid } from "../../../pictures";
import type { FamilyWidgetDef } from "../types";
import { emptyStrip, slidePicture, slideRows, str, strip, within } from "./carousel";

const SKINS = [
  { value: "carousel", label: "Carousel" },
  { value: "coverflow", label: "Coverflow" },
  { value: "slideshow", label: "Slideshow" },
];

/* Elementor's own three. "Coverflow" is a SKIN here, not an effect — the
   machine file's `effect` offers slide, fade and cube and nothing else. */
const EFFECTS = [
  { value: "slide", label: "Slide" },
  { value: "fade", label: "Fade" },
  { value: "cube", label: "Cube" },
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

/* No "None": the machine file's `caption` offers title, caption and
   description, and an empty value would be dropped on publish. */
const CAPTION = [
  { value: "title", label: "Title" },
  { value: "caption", label: "Caption" },
  { value: "description", label: "Description" },
];

export function renderMediaCarousel(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const rows = slideRows(p);
  if (!rows.length) return emptyStrip(ctx, "Add a picture or a video in the panel on the right.");
  const per = within(p.slides_per_view, 1, 10, 3);
  const gap = within(p.space_between, 0, 200, 10);
  const cells = rows.map((r) => {
    const isVideo = str(r.type) === "video" || (!str(r.image) && !!str(r.video));
    const pic = slidePicture(r.image, r.alt, ctx);
    if (!isVideo) return pic;
    const href = str(r.video);
    /* The play mark is a button, not decoration: it is what a person presses,
       and a screen reader has to be able to say so. */
    return `<a class="bx-media-video" href="${esc(href || "#")}" style="position:relative;display:block" aria-label="Play the video">
      ${pic}
      <span aria-hidden="true" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:999px;background:rgba(15,23,42,.72);color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px">&#9654;</span>
    </a>`;
  });
  return `<div class="bx-mediacarousel">${strip(cells, { perView: per, gap, cls: "bx-strip" })}</div>`;
}

export const MEDIA_CAROUSEL_DEF: FamilyWidgetDef = {
  kind: "media_carousel",
  label: "Media Carousel",
  description: {
    website: "Pictures or videos of your work, side by side, that a visitor can swipe through.",
    landing: "Pictures or videos of your work, side by side, that a visitor can swipe through.",
  },
  icon: "GalleryHorizontal",
  picture: pictureFrom(solid(4, 10, 16, 20) + solid(24, 6, 16, 28) + solid(44, 10, 16, 20)),
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
    skin: "carousel", slides_name: "Slides",
    slides: [
      { type: "image", image: "", alt: "", video: "" },
      { type: "image", image: "", alt: "", video: "" },
      { type: "image", image: "", alt: "", video: "" },
    ],
    effect: "slide", slides_per_view: "", slides_to_scroll: "",
    show_arrows: "yes", pagination: "bullets", speed: 500, autoplay: "yes",
    autoplay_speed: 5000, loop: "yes", pause_on_hover: "yes",
    caption: "title", lazyload: "", space_between: 10, slide_border_radius: 8,
  },
  controls: [
    { key: "skin", label: "Skin", type: "select", tab: "content", section: "Slides", options: SKINS },
    { key: "slides_name", label: "Slides Name", type: "text", tab: "content", section: "Slides" },
    { key: "slides", label: "Slides", type: "list", tab: "content", section: "Slides" },
    { key: "effect", label: "Effect", type: "select", tab: "content", section: "Slides", options: EFFECTS },
    { key: "slides_per_view", label: "Slides Per View", type: "select", tab: "content", section: "Slides", responsive: true, options: PER_VIEW },
    { key: "slides_to_scroll", label: "Slides to Scroll", type: "select", tab: "content", section: "Slides", responsive: true, options: PER_VIEW },
    { key: "show_arrows", label: "Arrows", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pagination", label: "Pagination", type: "select", tab: "content", section: "Additional Options", options: PAGINATION },
    { key: "speed", label: "Transition Duration", type: "number", tab: "content", section: "Additional Options" },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "autoplay_speed", label: "Autoplay Speed", type: "number", tab: "content", section: "Additional Options" },
    { key: "loop", label: "Infinite Loop", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pause_on_hover", label: "Pause on Hover", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "caption", label: "Caption", type: "select", tab: "content", section: "Additional Options", options: CAPTION },
    { key: "lazyload", label: "Lazy Load", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "space_between", label: "Space Between", type: "number", tab: "style", section: "Slides", responsive: true },
    { key: "slide_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Slides" },
  ],
};

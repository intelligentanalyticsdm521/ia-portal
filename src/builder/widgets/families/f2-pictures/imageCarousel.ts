/**
 * families/f2-pictures/imageCarousel.ts — Elementor's **Image Carousel**
 * (`image-carousel`, group General).
 *
 * Pictures side by side that the visitor slides through. Offer file
 * `BUILDER_OFFERS_2026-09-19.json`: website and landing. NOT the newsletter (a
 * mail client cannot run one — it is in the offer file's own
 * `not_offered_because_email_cannot_run_them`) and not a proposal, which is
 * paper.
 *
 * This REPLACES the legacy `image_carousel`, which had four controls of
 * Elementor's sixty-one and no Style tab. Every property it stored — `carousel`,
 * `slides_to_show`, `autoplay`, `navigation` — is a real Elementor key and is
 * read unchanged, and `images` is read beside `carousel` because that is what
 * arion's publisher has always accepted.
 *
 * ── HOW A CONTROL ABOUT TIME STILL CHANGES THE CANVAS ─────────────────────
 * The brief is absolute: *"a control that changes nothing on the canvas is a
 * defect, not a feature"*. Eight of this widget's controls are about MOVEMENT —
 * Autoplay, Autoplay Speed, Pause on Hover, Pause on Interaction, Infinite
 * Loop, Animation Speed, Lazyload, and the Effect when it is `slide`. A still
 * canvas cannot show a picture sliding, and Elementor's own editor does not
 * either. What Elementor DOES is print the settings on the wrapper as JSON for
 * its frontend script to read. So do we: `data-settings` on the carousel
 * element, which means the author's change is in the output and a test can see
 * it, rather than a switch that does nothing anywhere. Everything else changes
 * what is DRAWN — how many pictures, in what order, how far apart, with what
 * arrows and dots, and with what caption under them.
 *
 * Sections, labels, options, defaults and `responsive` flags from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget `image-carousel`.
 */
import { esc } from "../../../esc";
import { pictureFrom, solid } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef, LandingRenderContext } from "../types";
import { emptyDrop, isOn, mediaUrl, rows, str } from "./media";
import { altOf } from "./image";
import {
  ALIGNMENTS_4, BORDER_TYPES, LIGHTBOX, RESOLUTIONS,
  captionCss, clamped, dataSettings, decl, num, pictureEdge, resolutionCap, textAlign,
} from "./styling";

/** Elementor stores Slides to Show as the STRING "1".."10". A count, either way. */
const COUNTS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/** Elementor's own Navigation choices. */
const NAVIGATION = [
  { value: "both", label: "Arrows and Dots" },
  { value: "arrows", label: "Arrows" },
  { value: "dots", label: "Dots" },
  { value: "none", label: "None" },
];

/** Elementor's own Caption select: which field of the picture is printed. */
const CAPTION_TYPE = [
  { value: "", label: "None" },
  { value: "title", label: "Title" },
  { value: "caption", label: "Caption" },
  { value: "description", label: "Description" },
];

/** One row of the gallery control, whatever shape it is stored in. */
export interface Slide { url: string; alt: string; title: string; caption: string; description: string }

export function slides(v: unknown): Slide[] {
  return rows(v).map((it) => {
    const url = mediaUrl(it);
    const o: any = it && typeof it === "object" ? it : {};
    return { url, alt: str(o.alt), title: str(o.title), caption: str(o.caption), description: str(o.description) };
  }).filter((s) => s.url);
}

/** What a reader with pictures off is told one slide is. ONE ladder, the
    family's: the author's own words, then a caption, then the file name. */
export function slideAlt(s: Slide): string {
  return altOf({ alt: s.alt, caption: s.caption || s.title, image: s.url });
}

/** The pictures, from either spelling a stored carousel can hold. */
export function carouselSlides(p: any): Slide[] {
  const list = slides(p.carousel);
  return list.length ? list : slides(p.images);
}

/** What goes under one picture, per Elementor's `caption_type`. */
export function slideCaption(slide: Slide, type: unknown): string {
  const key = str(type).trim();
  if (key === "title") return slide.title;
  if (key === "caption") return slide.caption;
  if (key === "description") return slide.description;
  return "";
}

export function renderImageCarousel(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const all = carouselSlides(p);
  if (!all.length) return emptyDrop(ctx.mode, "Choose the pictures for this carousel in the panel on the right.");

  /* Direction is REAL on a still canvas: right-to-left starts from the other
     end, which is what the visitor sees on the first frame too. */
  const ordered = str(p.direction) === "rtl" ? [...all].reverse() : all;
  /* Effect `fade` shows ONE picture at a time however many slides are set —
     that is what a fade carousel is, and it is what Elementor draws. */
  const fade = str(p.effect) === "fade";
  const show = fade ? 1 : (clamped(p.slides_to_show, 1, 10) ?? 3);
  const shown = ordered.slice(0, show);

  const gapSet = str(p.image_spacing) === "custom";
  const gap = gapSet ? (num(p.image_spacing_custom) ?? 20) : 20;
  const stretch = str(p.image_stretch) === "yes";
  const vAlign = str(p.gallery_vertical_align) || "";

  const capCss = captionCss({
    align: p.caption_align, colour: p.caption_text_color,
    size: p.caption_typography_font_size, space: p.caption_space,
  });

  const cells = shown.map((s) => {
    const cap = slideCaption(s, p.caption_type);
    const imgCss = `display:block;width:100%;`
      + (stretch ? "height:100%;object-fit:cover;" : "height:auto;")
      + resolutionCap(p.thumbnail_size)
      + pictureEdge(p);
    const picture = `<img src="${esc(s.url)}" alt="${esc(slideAlt(s))}" loading="lazy" style="${imgCss}"/>`;
    const lightbox = str(p.open_lightbox);
    const href = str(p.link_to) === "file" ? s.url : str(p.link_to) === "custom" ? mediaUrl(p.link) : "";
    const attr = lightbox && lightbox !== "default" ? ` data-elementor-open-lightbox="${esc(lightbox)}"` : "";
    const linked = href ? `<a href="${esc(href)}"${attr}>${picture}</a>` : picture;
    return `<div class="bx-carousel-cell" style="flex:1 1 0;min-width:0">${linked}${
      cap ? `<div class="bx-carousel-cap" style="${capCss}">${esc(cap)}</div>` : ""}</div>`;
  }).join("");

  const nav = str(p.navigation) || "both";
  const arrowSize = num(p.arrows_size) ?? 18;
  const arrowColour = str(p.arrows_color) || "#475569";
  const outside = str(p.arrows_position) === "outside";
  const arrow = (glyph: string) => `<span class="bx-carousel-arrow" aria-hidden="true" style="font-size:${arrowSize}px;color:${esc(arrowColour)};${outside ? "" : "position:absolute;top:50%;transform:translateY(-50%);"}">${glyph}</span>`;
  const arrows = nav === "both" || nav === "arrows";

  const dotSize = num(p.dots_size) ?? 8;
  const dotGap = num(p.dots_gap) ?? 6;
  const dots = nav === "both" || nav === "dots"
    ? `<div class="bx-carousel-dots" style="display:flex;justify-content:center;gap:${dotGap}px;${
      str(p.dots_position) === "inside" ? "margin-top:-18px;position:relative;" : "margin-top:10px;"}">${
      ordered.map((_, i) => `<span style="display:inline-block;width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${
        esc(i === 0 ? (str(p.dots_color) || "#2563EB") : (str(p.dots_inactive_color) || "#CBD5E1"))}"></span>`).join("")}</div>`
    : "";

  /* Elementor's own settings envelope, for the controls that are about time. */
  const settings = dataSettings({
    slides_to_show: String(show),
    slides_to_scroll: str(p.slides_to_scroll),
    autoplay: isOn(p.autoplay ?? "yes") ? "yes" : "",
    autoplay_speed: num(p.autoplay_speed),
    pause_on_hover: isOn(p.pause_on_hover ?? "yes") ? "yes" : "",
    pause_on_interaction: isOn(p.pause_on_interaction ?? "yes") ? "yes" : "",
    infinite: isOn(p.infinite ?? "yes") ? "yes" : "",
    speed: num(p.speed),
    effect: str(p.effect),
    direction: str(p.direction),
    lazyload: isOn(p.lazyload) ? "yes" : "",
    navigation: nav,
  });

  const track = `<div class="bx-carousel-track" style="display:flex;gap:${gap}px;overflow:hidden;align-items:${
    vAlign === "center" ? "center" : vAlign === "flex-end" ? "flex-end" : "flex-start"}">${cells}</div>`;

  return `<div class="bx-carousel"${settings} style="position:relative;text-align:${textAlign(p.caption_align, "center")}">${
    arrows ? arrow("‹") : ""}${track}${arrows ? arrow("›") : ""}${dots}</div>`;
}

export function landingImageCarousel(w: Widget, ctx: LandingRenderContext): string {
  const inner = renderImageCarousel(w, ctx as unknown as RenderContext);
  if (!inner) return "";
  return inner.replace('class="bx-carousel"', 'class="bx-carousel lp-carousel"');
}

export const IMAGE_CAROUSEL_DEF: FamilyWidgetDef = {
  kind: "image_carousel",
  label: "Image Carousel",
  description: "Pictures side by side that the visitor can slide through.",
  icon: "GalleryHorizontal",
  picture: pictureFrom(solid(14, 8, 36, 24) + `<path d="M8 20h4M52 20h4" stroke="#94A3B8"/>`),
  category: "General",
  builders: ["website", "landing"],
  tier: "free",
  defaults: {
    carousel: [],
    thumbnail_size: "large",
    slides_to_show: "3",
    slides_to_scroll: "1",
    image_stretch: "no",
    navigation: "both",
    link_to: "none",
    open_lightbox: "default",
    caption_type: "",
    autoplay: "yes",
    pause_on_hover: "yes",
    pause_on_interaction: "yes",
    autoplay_speed: 5000,
    infinite: "yes",
    effect: "slide",
    speed: 500,
    direction: "ltr",
  },
  controls: [
    /* ── Content ▸ Image Carousel ────────────────────────────────────── */
    { key: "carousel", label: "Add Images", type: "list", tab: "content", section: "Image Carousel" },
    { key: "thumbnail_size", label: "Image Resolution", type: "select", tab: "content", section: "Image Carousel", options: RESOLUTIONS },
    { key: "slides_to_show", label: "Slides to Show", type: "select", tab: "content", section: "Image Carousel", options: COUNTS, responsive: true },
    { key: "slides_to_scroll", label: "Slides to Scroll", type: "select", tab: "content", section: "Image Carousel", options: COUNTS, responsive: true },
    { key: "image_stretch", label: "Image Stretch", type: "select", tab: "content", section: "Image Carousel", options: [
      { value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
    { key: "navigation", label: "Navigation", type: "select", tab: "content", section: "Image Carousel", options: NAVIGATION },
    { key: "link_to", label: "Link", type: "select", tab: "content", section: "Image Carousel", options: [
      { value: "none", label: "None" }, { value: "file", label: "Media File" }, { value: "custom", label: "Custom URL" }] },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Image Carousel" },
    { key: "open_lightbox", label: "Lightbox", type: "select", tab: "content", section: "Image Carousel", options: LIGHTBOX },
    { key: "caption_type", label: "Caption", type: "select", tab: "content", section: "Image Carousel", options: CAPTION_TYPE },
    /* ── Content ▸ Additional Options ────────────────────────────────── */
    { key: "lazyload", label: "Lazyload", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "autoplay", label: "Autoplay", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pause_on_hover", label: "Pause on Hover", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "pause_on_interaction", label: "Pause on Interaction", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "autoplay_speed", label: "Autoplay Speed", type: "number", tab: "content", section: "Additional Options" },
    { key: "infinite", label: "Infinite Loop", type: "toggle", tab: "content", section: "Additional Options" },
    { key: "effect", label: "Effect", type: "select", tab: "content", section: "Additional Options", options: [
      { value: "slide", label: "Slide" }, { value: "fade", label: "Fade" }] },
    { key: "speed", label: "Animation Speed", type: "number", tab: "content", section: "Additional Options" },
    { key: "direction", label: "Direction", type: "select", tab: "content", section: "Additional Options", options: [
      { value: "ltr", label: "Left" }, { value: "rtl", label: "Right" }] },
    /* ── Style ▸ Navigation ──────────────────────────────────────────── */
    { key: "arrows_position", label: "Arrows Position", type: "select", tab: "style", section: "Navigation", options: [
      { value: "inside", label: "Inside" }, { value: "outside", label: "Outside" }] },
    { key: "arrows_size", label: "Arrows Size", type: "number", tab: "style", section: "Navigation", responsive: true },
    { key: "arrows_color", label: "Arrows Color", type: "colour", tab: "style", section: "Navigation" },
    { key: "dots_position", label: "Pagination Position", type: "select", tab: "style", section: "Navigation", options: [
      { value: "outside", label: "Outside" }, { value: "inside", label: "Inside" }] },
    { key: "dots_gap", label: "Space Between Dots", type: "number", tab: "style", section: "Navigation", responsive: true },
    { key: "dots_size", label: "Dots Size", type: "number", tab: "style", section: "Navigation", responsive: true },
    { key: "dots_inactive_color", label: "Dots Color", type: "colour", tab: "style", section: "Navigation" },
    { key: "dots_color", label: "Dots Active Color", type: "colour", tab: "style", section: "Navigation" },
    /* ── Style ▸ Image ───────────────────────────────────────────────── */
    { key: "gallery_vertical_align", label: "Vertical Align", type: "select", tab: "style", section: "Image", responsive: true, options: [
      { value: "flex-start", label: "Top" }, { value: "center", label: "Middle" }, { value: "flex-end", label: "Bottom" }] },
    { key: "image_spacing", label: "Spacing", type: "select", tab: "style", section: "Image", options: [
      { value: "", label: "Default" }, { value: "custom", label: "Custom" }] },
    { key: "image_spacing_custom", label: "Image Spacing", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_border_border", label: "Border Type", type: "select", tab: "style", section: "Image", options: BORDER_TYPES },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Image" },
    { key: "image_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Image", responsive: true },
    /* ── Style ▸ Caption ─────────────────────────────────────────────── */
    { key: "caption_align", label: "Alignment", type: "select", tab: "style", section: "Caption", options: ALIGNMENTS_4, responsive: true },
    { key: "caption_text_color", label: "Text Color", type: "colour", tab: "style", section: "Caption" },
    { key: "caption_typography_font_size", label: "Size", type: "number", tab: "style", section: "Caption", responsive: true },
    { key: "caption_space", label: "Spacing", type: "number", tab: "style", section: "Caption", responsive: true },
  ],
};

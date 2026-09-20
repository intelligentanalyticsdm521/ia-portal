/**
 * families/f2-pictures/basicGallery.ts — Elementor's **Basic Gallery**
 * (`image-gallery`, group General).
 *
 * A grid of photographs of the business's work. Offer file
 * `BUILDER_OFFERS_2026-09-19.json`: `website.elementor_free`,
 * `landing.elementor_free` **and `proposal.elementor`** — the proposal offer was
 * in the file from the start and the widget was never given to that builder,
 * which the first wave of this family wrote down as a gap. It is closed here:
 * a landscaper's proposal is half photographs of finished work.
 *
 * Elementor has TWO galleries. This is the FREE one, `image-gallery`, titled
 * **Basic Gallery**. Elementor Pro's `gallery`, titled **Gallery**, is a
 * different widget and is `pro_gallery` in this same folder.
 *
 * This REPLACES the legacy `basic_gallery` (two controls of Elementor's
 * twenty-eight, no Style tab). Every spelling a stored gallery can hold is read
 * — `wp_gallery`, `images` and `items`.
 *
 * ── A DEFECT THIS CLOSES ON THE WAY PAST ──────────────────────────────────
 * `LANDING_KIND_ALIASES` resolved `basic_gallery` to `gallery`, the hidden
 * legacy Photo gallery, whose hosted-page renderer reads `p.items` — and this
 * widget has stored its pictures under `wp_gallery` since D-165. So a Basic
 * Gallery on a hosted landing page drew an empty band however many photographs
 * were chosen. The alias is gone and the reason is written where it was.
 *
 * Sections, labels, options, defaults and `responsive` flags from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget `image-gallery`.
 */
import { esc } from "../../../esc";
import { pictureFrom, solid } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef, LandingRenderContext } from "../types";
import { emptyDrop, str } from "./media";
import { slideAlt, slides, type Slide } from "./imageCarousel";
import {
  ALIGNMENTS_4, BORDER_TYPES, FONT_WEIGHTS, LIGHTBOX, RESOLUTIONS,
  captionCss, clamped, dataSettings, num, pictureEdge, resolutionCap, textAlign,
} from "./styling";

/** Elementor stores Columns as the string "1".."10". */
const COLUMNS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

/** The photographs, from every spelling a stored gallery can hold. */
export function galleryPictures(p: any): Slide[] {
  for (const key of ["wp_gallery", "images", "items"]) {
    const list = slides((p as any)[key]);
    if (list.length) return list;
  }
  return [];
}

/** Is a caption printed under each photograph? Elementor's `none` means no. */
export function showsCaption(p: any): boolean {
  return str(p.gallery_display_caption).trim() !== "none";
}

export function renderBasicGallery(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const pics = galleryPictures(p);
  if (!pics.length) return emptyDrop(ctx.mode, "Choose the pictures for this gallery in the panel on the right.");

  const cols = clamped(p.gallery_columns, 1, 10) ?? 4;
  const gapSet = str(p.image_spacing) === "custom";
  const gap = gapSet ? (num(p.image_spacing_custom) ?? 15) : 15;
  const edge = pictureEdge(p);
  const cap = showsCaption(p);
  const capCss = captionCss({
    align: p.align, colour: p.text_color,
    size: p.typography_font_size, weight: p.typography_font_weight, space: p.caption_space,
  });
  const lightbox = str(p.open_lightbox);
  const attr = lightbox && lightbox !== "default" ? ` data-elementor-open-lightbox="${esc(lightbox)}"` : "";

  const cells = pics.map((s) => {
    const picture = `<img src="${esc(s.url)}" alt="${esc(slideAlt(s))}" loading="lazy" style="display:block;width:100%;object-fit:cover;aspect-ratio:1/1;${resolutionCap(p.thumbnail_size)}${edge}"/>`;
    const how = str(p.gallery_link);
    const href = how === "none" ? "" : s.url;
    const linked = href ? `<a href="${esc(href)}"${attr}>${picture}</a>` : picture;
    const words = cap && (s.caption || s.title)
      ? `<div class="bx-gallery-cap" style="${capCss}">${esc(s.caption || s.title)}</div>` : "";
    return `<div class="bx-gallery-cell">${linked}${words}</div>`;
  }).join("");

  /* `gallery_rand` shuffles on the PUBLISHED page. It is deliberately not
     shuffled here: a canvas that reorders itself on every keystroke is a canvas
     an author cannot work in, and Elementor's own editor draws the given order
     too. It rides in the settings envelope so the control is in the output. */
  const settings = dataSettings({ gallery_rand: str(p.gallery_rand), gallery_link: str(p.gallery_link) });

  return `<div class="bx-gallery"${settings} style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${gap}px;text-align:${textAlign(p.align, "center")}">${cells}</div>`;
}

export function landingBasicGallery(w: Widget, ctx: LandingRenderContext): string {
  const inner = renderBasicGallery(w, ctx as unknown as RenderContext);
  if (!inner) return "";
  return inner.replace('class="bx-gallery"', 'class="bx-gallery lp-gal"');
}

/**
 * THE PRINTED HALF'S ROWS.
 *
 * A proposal is paper: no lightbox, no link, no grid the PDF painter can do.
 * `lib/pdfFamilies/f2-pictures.js` in oliver-api turns these into the painter's
 * own `image` items; this function is what the Portal's own test asserts the
 * same photographs come out of, so the two halves cannot drift.
 */
export function galleryForPrint(p: any): { src: string; alt: string; caption: string }[] {
  return galleryPictures(p).map((s) => ({
    src: s.url,
    alt: slideAlt(s),
    caption: showsCaption(p) ? (s.caption || s.title || "") : "",
  }));
}

export const BASIC_GALLERY_DEF: FamilyWidgetDef = {
  kind: "basic_gallery",
  label: "Basic Gallery",
  description: {
    website: "A grid of photographs of your work.",
    landing: "A grid of photographs of your work.",
    proposal: "A grid of photographs of your work, printed with the proposal.",
  },
  icon: "Images",
  picture: pictureFrom(solid(8, 8, 14, 12) + solid(25, 8, 14, 12) + solid(42, 8, 14, 12)
    + solid(8, 23, 14, 10) + solid(25, 23, 14, 10) + solid(42, 23, 14, 10)),
  category: "General",
  builders: ["website", "landing", "proposal"],
  tier: "free",
  defaults: {
    wp_gallery: [],
    thumbnail_size: "medium",
    gallery_columns: "4",
    gallery_display_caption: "",
    gallery_link: "file",
    open_lightbox: "default",
    gallery_rand: "",
  },
  controls: [
    /* ── Content ▸ Basic Gallery ─────────────────────────────────────── */
    { key: "wp_gallery", label: "Add Images", type: "list", tab: "content", section: "Basic Gallery" },
    { key: "thumbnail_size", label: "Image Resolution", type: "select", tab: "content", section: "Basic Gallery", options: RESOLUTIONS },
    { key: "gallery_columns", label: "Columns", type: "select", tab: "content", section: "Basic Gallery", options: COLUMNS },
    { key: "gallery_display_caption", label: "Caption", type: "select", tab: "content", section: "Basic Gallery", options: [
      { value: "", label: "Show" }, { value: "none", label: "None" }] },
    { key: "gallery_link", label: "Link", type: "select", tab: "content", section: "Basic Gallery", options: [
      { value: "file", label: "Media File" }, { value: "attachment", label: "Attachment Page" }, { value: "none", label: "None" }] },
    { key: "open_lightbox", label: "Lightbox", type: "select", tab: "content", section: "Basic Gallery", options: LIGHTBOX },
    { key: "gallery_rand", label: "Order By", type: "select", tab: "content", section: "Basic Gallery", options: [
      { value: "", label: "Default" }, { value: "rand", label: "Random" }] },
    /* ── Style ▸ Images ──────────────────────────────────────────────── */
    { key: "image_spacing", label: "Gap", type: "select", tab: "style", section: "Images", options: [
      { value: "", label: "Default" }, { value: "custom", label: "Custom" }] },
    { key: "image_spacing_custom", label: "Custom Gap", type: "number", tab: "style", section: "Images" },
    { key: "image_border_border", label: "Border Type", type: "select", tab: "style", section: "Images", options: BORDER_TYPES },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Images", responsive: true },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Images" },
    { key: "image_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Images", responsive: true },
    /* ── Style ▸ Caption ─────────────────────────────────────────────── */
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Caption", options: ALIGNMENTS_4, responsive: true },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Caption" },
    { key: "typography_font_size", label: "Size", type: "number", tab: "style", section: "Caption", responsive: true },
    { key: "typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Caption", options: FONT_WEIGHTS },
    { key: "caption_space", label: "Spacing", type: "number", tab: "style", section: "Caption", responsive: true },
  ],
};

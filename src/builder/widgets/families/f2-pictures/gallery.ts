/**
 * families/f2-pictures/gallery.ts — Elementor PRO's **Gallery**.
 *
 * Elementor has TWO galleries and they are different widgets:
 *   · free  `image-gallery`, titled **Basic Gallery** — square thumbnails in a
 *     grid. Ours is the D-165 atom `basic_gallery` and is not touched here.
 *   · Pro   `gallery`, titled **Gallery** — the same grid with a layout choice,
 *     an aspect ratio, an overlay, and (with several galleries) a filter bar.
 *
 * This is the Pro one. Offer file `BUILDER_OFFERS_2026-09-19.json`:
 * `website.elementor_pro` and `landing.elementor_pro`, and nowhere else — a
 * mailbox cannot lay out a masonry grid and a printed page has no lightbox.
 *
 * ── WHY THE KIND IS `pro_gallery` AND NOT `gallery` ───────────────────────
 * `gallery` is ALREADY TAKEN on our side, by the hidden legacy "Photo gallery"
 * declared in `registry.ts`, and two widgets sharing a kind fails
 * `test/builder-registry.test.mjs` ("kinds are unique"). `pro_gallery` is also
 * the name arion's `elementorWidgets.js` has used for this widget since D-156,
 * so this agrees with the publisher rather than inventing a third spelling. The
 * OFFER is matched on Elementor's own TITLE — "Gallery" — which is what the
 * offer test reads.
 *
 * Titles, groups, panel sections, control labels, options and defaults are from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, widget `gallery`. Elementor Pro
 * is not installable in the WordPress Playground, so the machine file is the
 * source here and the live editor could not be used — said plainly in the
 * handoff rather than guessed at.
 */
import { esc } from "../../../esc";
import { bar, pictureFrom, solid } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef } from "../types";
import { count, emptyDrop, img, isOn, mediaUrl, pictureList, rows, str } from "./media";

/** Elementor's own three layouts, by its own values. */
const LAYOUTS = [
  { value: "grid", label: "Grid" },
  { value: "justified", label: "Justified" },
  { value: "masonry", label: "Masonry" },
];

/** Elementor's own six aspect ratios, by its own values. */
const ASPECT_RATIOS = ["1:1", "3:2", "4:3", "9:16", "16:9", "21:9"].map((v) => ({ value: v, label: v }));

/** What the overlay writes over a picture. Elementor's own five. */
const OVERLAY_FIELDS = [
  { value: "", label: "None" },
  { value: "title", label: "Title" },
  { value: "caption", label: "Caption" },
  { value: "alt", label: "Alt" },
  { value: "description", label: "Description" },
];

/** `3:2` → the CSS `aspect-ratio` that draws it. */
function ratio(v: unknown): string {
  const m = str(v).match(/^(\d+):(\d+)$/);
  return m ? `${m[1]}/${m[2]}` : "3/2";
}

/** The words the overlay shows for one picture, per the author's choice. */
function overlayText(row: any, field: unknown): string {
  const key = str(field);
  if (!key || !row || typeof row !== "object") return "";
  return str(row[key]);
}

export function renderProGallery(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const items = rows(p.gallery);
  if (!pictureList(items).length) {
    return emptyDrop(ctx.mode, "Choose the pictures for this gallery in the panel on the right.");
  }
  const cols = count(p.columns, 4, 1, 8);
  const gap = count(p.gap, 10, 0, 60);
  const radius = count(p.image_border_radius, 0, 0, 60);
  const width = count(p.image_border_width, 0, 0, 20);
  const edge = width ? `border:${width}px solid ${esc(str(p.image_border_color) || "#E2E8F0")};` : "";
  const ar = ratio(p.aspect_ratio);
  const tint = str(p.overlay_background_color) || "rgba(15,23,42,.55)";

  const cells = items.map((row) => {
    const src = mediaUrl(row);
    if (!src) return "";
    const title = overlayText(row, p.overlay_title);
    const note = overlayText(row, p.overlay_description);
    /* The overlay is drawn FLAT, not on hover: the canvas is a picture of the
       page and an author cannot hover every cell to check their own words. */
    const words = (isOn(p.overlay_background) && (title || note))
      ? `<div class="bx-gal-overlay" style="position:absolute;inset:auto 0 0 0;background:${esc(tint)};color:#FFFFFF;padding:6px 8px;font-size:12px">
          ${title ? `<div style="font-weight:700">${esc(title)}</div>` : ""}
          ${note ? `<div>${esc(note)}</div>` : ""}
        </div>`
      : "";
    return `<div class="bx-gal-cell" style="position:relative;overflow:hidden;border-radius:${radius}px;${edge}">
      ${img(src, str((row && row.alt) || ""), `width:100%;height:100%;display:block;object-fit:cover;aspect-ratio:${ar}`)}
      ${words}
    </div>`;
  }).join("");

  return `<div class="bx-gallery bx-gallery-pro" style="display:grid;grid-template-columns:repeat(${cols},minmax(0,1fr));gap:${gap}px">${cells}</div>`;
}

export const PRO_GALLERY_DEF: FamilyWidgetDef = {
  kind: "pro_gallery",
  /* ELEMENTOR'S OWN TITLE. The offer file lists the slug `gallery`; the offer
     test matches a def by its kind OR its label, and this is the label. */
  label: "Gallery",
  description: {
    website: "Your photographs in a grid, with the words you choose written over them.",
    landing: "Your photographs in a grid, with the words you choose written over them.",
  },
  icon: "LayoutGrid",
  picture: pictureFrom(solid(6, 6, 16, 16) + solid(24, 6, 16, 10) + solid(42, 6, 16, 16)
    + solid(6, 24, 16, 10) + solid(24, 18, 16, 16) + solid(42, 24, 16, 10) + bar(6, 36, 20, 2)),
  /* Elementor draws its Pro widgets in their own PRO group, and D-168 item 6
     gave our panel the same six groups. A Pro widget sitting in General is a
     difference a person sees the moment our panel is beside the real one. */
  category: "Pro",
  builders: ["website", "landing"],
  tier: "pro",
  defaults: {
    gallery: [],
    gallery_type: "single",
    gallery_layout: "grid",
    columns: 4,
    gap: 10,
    aspect_ratio: "3:2",
    open_lightbox: "default",
    lazyload: "yes",
    overlay_background: "yes",
    overlay_title: "",
    overlay_description: "",
  },
  controls: [
    /* Content → Settings, Elementor's own section name. */
    { key: "gallery", label: "Add Images", type: "list", tab: "content", section: "Settings" },
    { key: "gallery_layout", label: "Layout", type: "select", tab: "content", section: "Settings", options: LAYOUTS },
    { key: "columns", label: "Columns", type: "number", tab: "content", section: "Settings", responsive: true },
    { key: "gap", label: "Spacing", type: "number", tab: "content", section: "Settings", responsive: true },
    { key: "aspect_ratio", label: "Aspect Ratio", type: "select", tab: "content", section: "Settings", options: ASPECT_RATIOS },
    { key: "open_lightbox", label: "Lightbox", type: "select", tab: "content", section: "Settings", options: [
      { value: "default", label: "Default" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
    /* Content → Overlay. */
    { key: "overlay_background", label: "Background", type: "toggle", tab: "content", section: "Overlay" },
    { key: "overlay_title", label: "Title", type: "select", tab: "content", section: "Overlay", options: OVERLAY_FIELDS },
    { key: "overlay_description", label: "Description", type: "select", tab: "content", section: "Overlay", options: OVERLAY_FIELDS },
    /* Style → Image, and Style → Overlay. Elementor's own section names. */
    { key: "image_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Image" },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Image" },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Image" },
    { key: "overlay_background_color", label: "Color", type: "colour", tab: "style", section: "Overlay" },
  ],
};

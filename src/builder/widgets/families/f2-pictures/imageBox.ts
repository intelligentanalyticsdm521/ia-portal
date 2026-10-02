/**
 * families/f2-pictures/imageBox.ts — Elementor's **Image Box** (`image-box`,
 * group General).
 *
 * A picture with a title and a line under it. Offer file
 * `BUILDER_OFFERS_2026-09-19.json`: website, landing, newsletter and proposal —
 * not My Brand, whose canvas places absolute objects and has nothing to do with
 * a flow of picture-then-words.
 *
 * ── WHAT IT OWED ELEMENTOR, AND WHAT THIS PAYS ────────────────────────────
 * The D-165 definition had Elementor's Content tab right and then three
 * invented Style keys — `position`, `text_align`, `image_size` under a section
 * called "Image Box". Elementor's Style tab is three sections, **Box**, **Image**
 * and **Content**, and `position` and `text_align` really do live on Box, so two
 * of the three were in the right place under the wrong heading. This carries
 * all three sections.
 *
 * This REPLACES the legacy `image_box` (same kind, `mergeWidgetDefs` drops the
 * old one), and every property the old one stored is still read: `image`,
 * `image_alt`, `title_text`, `description_text`, `link`, `position`,
 * `text_align`, `image_size` — plus `src` and `title`, which is what the
 * mailbox renderer has been reading all along.
 *
 * ── ONE CONTROL ELEMENTOR DOES NOT HAVE ───────────────────────────────────
 * `image_alt`, for the reason written at the top of `image.ts`: WordPress keeps
 * alt text on the media record and we have no media library. It is the key the
 * D-165 definition already used, it is named in this family's test as an
 * exception, and arion does not publish it (its own comment says why).
 *
 * ── ONE PLACE OUR PANEL IS NOT WORD-FOR-WORD ELEMENTOR, AND WHY ───────────
 * Elementor's Style ▸ Content section draws a small heading "Title", then a
 * control labelled **Color**, then a heading "Description", then another
 * control labelled **Color**. Our panel has no heading control, so two fields
 * called "Color" would sit under one another with nothing to tell them apart.
 * The heading is folded into the label — "Title Color" and "Description Color"
 * — and the KEYS stay Elementor's own (`title_color`, `description_color`), so
 * what is published is unchanged. Nothing is invented; a heading is inlined.
 *
 * Sections, labels, options, defaults and `responsive` flags from
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget `image-box`.
 */
import { esc } from "../../../esc";
import { bar, pictureFrom, solid } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef, EmailRenderContext, LandingRenderContext } from "../types";
import { mediaUrl, str } from "./media";
import {
  ALIGNMENTS_4, BORDER_TYPES, FONT_WEIGHTS, OBJECT_FITS, RESOLUTIONS,
  clamped, decl, num, pictureEdge, resolutionCap, textAlign,
} from "./styling";

/** Elementor's own Title HTML Tag list. */
const TITLE_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"]
  .map((v) => ({ value: v, label: v.toUpperCase() }));

/** Elementor's own Image Position: the picture above, or to one side. */
const POSITIONS = [
  { value: "left", label: "Left" },
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
];

/** Elementor's own Vertical Alignment, for a picture beside the words. */
const V_ALIGN = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

/** The picture, in every spelling a stored Image Box can hold. */
export function boxPicture(p: any): string {
  return mediaUrl(p.image) || mediaUrl(p.src) || mediaUrl(p.url);
}

/** The title, in both spellings. `title` is what the mailbox has read. */
export function boxTitle(p: any): string {
  return str(p.title_text) || str(p.title);
}

/** The line under it, in both spellings. */
export function boxWords(p: any): string {
  return str(p.description_text) || str(p.description);
}

/** What a reader with pictures off is told this is. */
export function boxAlt(p: any): string {
  return str(p.image_alt).trim() || str(p.alt).trim() || boxTitle(p).trim() || "Picture";
}

/** A safe HTML tag for the title, out of Elementor's own nine. */
function titleTag(v: unknown): string {
  const t = str(v).trim().toLowerCase();
  return /^(h[1-6]|div|span|p)$/.test(t) ? t : "h3";
}

/** CSS `align-items` for Elementor's top / middle / bottom. */
function crossAxis(v: unknown): string {
  const a = str(v).trim().toLowerCase();
  if (a === "middle") return "center";
  if (a === "bottom") return "flex-end";
  return "flex-start";
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function renderImageBox(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = boxPicture(p);
  const title = boxTitle(p);
  const words = boxWords(p);
  /* NOTHING AT ALL prints nothing on the page — and in the EDITOR it still
     draws the picture drop and both editable lines, because an empty Image Box
     an author cannot click is an Image Box they cannot start. That is what the
     D-165 widget did and `builder-widget-set`'s "reachable even when it is
     empty" is the test that keeps it true. */
  if (!src && !title.trim() && !words.trim() && ctx.mode !== "edit") return "";

  const position = str(p.position || "top").toLowerCase();
  const side = position === "left" || position === "right";
  const align = textAlign(p.text_align, side ? "left" : "center");
  const gap = num(p.image_space);
  const below = num(p.title_bottom_space);

  /* Style ▸ Image. `image_size` is Elementor's WIDTH slider on this widget, in
     per cent — it is not the Image Resolution select, which is `thumbnail_size`
     here. Reading the two the other way round is exactly the mix-up this file
     exists to end. */
  const wide = clamped(p.image_size, 1, 100);
  const tall = num(p.image_height);
  const imgCss = `display:block;max-width:100%;`
    + decl("height", tall == null ? "" : `${tall}px`)
    + decl("object-fit", str(p.image_object_fit))
    + decl("opacity", clamped(p.image_opacity, 0, 1) == null ? "" : String(clamped(p.image_opacity, 0, 1)))
    + resolutionCap(p.thumbnail_size)
    + pictureEdge(p)
    + (side ? "width:100%;" : wide == null ? "" : `width:${wide}%;margin:0 auto;`);

  const pic = src
    ? `<img src="${esc(src)}" alt="${esc(boxAlt(p))}" loading="lazy" style="${imgCss}"/>`
    : (ctx.mode === "edit" ? `<div class="bx-imgdrop">Choose a picture in the panel on the right.</div>` : "");

  const tag = titleTag(p.title_size);
  const titleCss = decl("color", str(p.title_color))
    + decl("font-size", num(p.title_typography_font_size) == null ? "" : `${num(p.title_typography_font_size)}px`)
    + decl("font-weight", str(p.title_typography_font_weight))
    + decl("margin", `0 0 ${below == null ? 6 : below}px 0`);
  const wordsCss = decl("color", str(p.description_color))
    + decl("font-size", num(p.description_typography_font_size) == null ? "" : `${num(p.description_typography_font_size)}px`)
    + "margin:0;";

  const head = title || ctx.mode === "edit"
    ? `<${tag} class="bx-h bx-h3" data-edit="title_text" style="${titleCss}">${esc(title)}</${tag}>` : "";
  const body = words || ctx.mode === "edit"
    ? `<p class="bx-p" data-edit="description_text" style="${wordsCss}">${esc(words)}</p>` : "";

  const href = mediaUrl(p.link);
  const inner = `${head}${body}`;
  const lead = href && src ? `<a href="${esc(href)}" style="display:block">${pic}</a>` : pic;

  const picWidth = side ? `flex:0 0 ${wide == null ? 30 : wide}%;max-width:${wide == null ? 30 : wide}%;` : "";
  const flow = side
    ? `display:flex;flex-direction:${position === "right" ? "row-reverse" : "row"};gap:${gap == null ? 15 : gap}px;align-items:${crossAxis(p.content_vertical_alignment)};`
    : `display:block;`;
  const spacer = side ? "" : `margin-bottom:${gap == null ? 15 : gap}px;`;

  return `<div class="bx-imagebox" style="${flow}text-align:${align}">
    ${lead ? `<div class="bx-imagebox-pic" style="${picWidth}${spacer}min-width:0">${lead}</div>` : ""}
    <div class="bx-imagebox-body" style="flex:1 1 auto;min-width:0">${inner}</div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MAILBOX — tables, inline styles, no classes, no flex, no grid
   ══════════════════════════════════════════════════════════════════════════ */

const EMAIL_WIDTH = 552;
const SIDE_PICTURE = 180;

export function emailImageBox(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  const src = boxPicture(p);
  const title = boxTitle(p);
  const words = boxWords(p);
  if (!src && !title.trim() && !words.trim() && ctx.mode !== "edit") return "";

  const position = str(p.position || "top").toLowerCase();
  const side = position === "left" || position === "right";
  const align = textAlign(p.text_align, side ? "left" : "center");
  const pct = clamped(p.image_size, 1, 100);
  const wide = side
    ? Math.round(EMAIL_WIDTH * ((pct ?? 30) / 100))
    : Math.round(EMAIL_WIDTH * ((pct ?? 100) / 100));
  const gap = num(p.image_space);
  const below = num(p.title_bottom_space);

  const pic = src
    ? `<img src="${esc(src)}" alt="${esc(boxAlt(p))}" width="${wide}" style="display:block;width:100%;max-width:${wide}px;height:auto;border:0;${pictureEdge(p)}"/>`
    : (ctx.mode === "edit"
      ? `<div style="border:1px dashed #CBD5E1;padding:16px;text-align:center;color:#94A3B8;font-size:12px;">Choose a picture in the panel on the right.</div>`
      : "");
  const href = mediaUrl(p.link);
  const lead = href && src ? `<a href="${esc(href)}" style="text-decoration:none;">${pic}</a>` : pic;

  const size = num(p.title_typography_font_size);
  const dsize = num(p.description_typography_font_size);
  const head = title || ctx.mode === "edit"
    ? `<div style="font-size:${size == null ? 18 : size}px;${decl("font-weight", str(p.title_typography_font_weight) || "700")}${decl("color", str(p.title_color) || "#0F172A")}margin:0 0 ${below == null ? 6 : below}px 0;">${esc(title)}</div>` : "";
  const body = words || ctx.mode === "edit"
    ? `<div style="font-size:${dsize == null ? 14 : dsize}px;${decl("color", str(p.description_color) || "#475569")}margin:0;">${esc(words)}</div>` : "";
  const cell = `<td valign="${str(p.content_vertical_alignment) === "middle" ? "middle" : str(p.content_vertical_alignment) === "bottom" ? "bottom" : "top"}" style="text-align:${align};">${head}${body}</td>`;

  const table = (inner: string) =>
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px 0;">${inner}</table>`;

  if (!side) {
    return table(`<tr><td align="${align}" style="padding:0 0 ${gap == null ? 10 : gap}px 0;">${lead}</td></tr><tr>${cell}</tr>`);
  }
  const picCell = `<td valign="top" width="${Math.min(SIDE_PICTURE * 2, wide)}" style="width:${Math.min(SIDE_PICTURE * 2, wide)}px;padding:0 ${gap == null ? 12 : gap}px 0 0;">${lead}</td>`;
  return table(`<tr>${position === "right" ? `${cell}${picCell}` : `${picCell}${cell}`}</tr>`);
}

/** The plain-text twin. */
export function emailImageBoxText(p: any): string | null {
  const bits = [boxTitle(p).trim(), boxWords(p).trim()].filter(Boolean);
  if (boxPicture(p)) bits.unshift(`[${boxAlt(p)}]`);
  return bits.length ? bits.join(" — ") : null;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE HOSTED LANDING PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function landingImageBox(w: Widget, ctx: LandingRenderContext): string {
  const inner = renderImageBox(w, ctx as unknown as RenderContext);
  if (!inner) return "";
  const position = str((w.props as any)?.position || "top").toLowerCase();
  return inner.replace('class="bx-imagebox"', `class="bx-imagebox lp-bx lp-bx-${esc(position)}"`);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DEFINITION
   ══════════════════════════════════════════════════════════════════════════ */

export const IMAGE_BOX_DEF: FamilyWidgetDef = {
  kind: "image_box",
  label: "Image Box",
  description: "A picture with a title and a line under it.",
  icon: "GalleryVerticalEnd",
  picture: pictureFrom(solid(22, 4, 20, 14) + bar(18, 23, 28, 5) + bar(14, 32, 36)),
  category: "General",
  builders: ["website", "landing", "newsletter", "proposal"],
  tier: "free",
  defaults: {
    image: "",
    image_alt: "",
    thumbnail_size: "full",
    title_text: "",
    description_text: "",
    link: "",
    title_size: "h3",
    position: "top",
    content_vertical_alignment: "top",
    text_align: "center",
    image_space: 15,
    image_size: 30,
  },
  controls: [
    /* ── Content ▸ Image Box ─────────────────────────────────────────── */
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Image Box" },
    { key: "image_alt", label: "Describe it", type: "text", tab: "content", section: "Image Box",
      help: "Read aloud by screen readers and shown if the picture fails to load." },
    { key: "thumbnail_size", label: "Image Resolution", type: "select", tab: "content", section: "Image Box", options: RESOLUTIONS },
    { key: "title_text", label: "Title", type: "text", tab: "content", section: "Image Box" },
    { key: "description_text", label: "Description", type: "textarea", tab: "content", section: "Image Box" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Image Box" },
    { key: "title_size", label: "Title HTML Tag", type: "select", tab: "content", section: "Image Box", options: TITLE_TAGS },
    /* ── Style ▸ Box ─────────────────────────────────────────────────── */
    { key: "position", label: "Image Position", type: "select", tab: "style", section: "Box", options: POSITIONS, responsive: true },
    { key: "content_vertical_alignment", label: "Vertical Alignment", type: "select", tab: "style", section: "Box", options: V_ALIGN, responsive: true },
    { key: "text_align", label: "Alignment", type: "select", tab: "style", section: "Box", options: ALIGNMENTS_4, responsive: true },
    { key: "image_space", label: "Image Spacing", type: "number", tab: "style", section: "Box", responsive: true },
    { key: "title_bottom_space", label: "Content Spacing", type: "number", tab: "style", section: "Box", responsive: true },
    /* ── Style ▸ Image ───────────────────────────────────────────────── */
    { key: "image_size", label: "Width", type: "number", tab: "style", section: "Image", responsive: true,
      help: "A share of the box's width, from 1 to 100." },
    { key: "image_height", label: "Height", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_object_fit", label: "Object Fit", type: "select", tab: "style", section: "Image", options: OBJECT_FITS, responsive: true },
    { key: "image_opacity", label: "Opacity", type: "number", tab: "style", section: "Image" },
    { key: "image_border_border", label: "Border Type", type: "select", tab: "style", section: "Image", options: BORDER_TYPES },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Image" },
    { key: "image_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Image", responsive: true },
    /* ── Style ▸ Content. Elementor draws a "Title" heading and then Color,
         a "Description" heading and then Color; we have no heading control, so
         the heading is folded into the label and the KEY is untouched. ──── */
    { key: "title_color", label: "Title Color", type: "colour", tab: "style", section: "Content" },
    { key: "title_typography_font_size", label: "Title Size", type: "number", tab: "style", section: "Content", responsive: true },
    { key: "title_typography_font_weight", label: "Title Weight", type: "select", tab: "style", section: "Content", options: FONT_WEIGHTS },
    { key: "description_color", label: "Description Color", type: "colour", tab: "style", section: "Content" },
    { key: "description_typography_font_size", label: "Description Size", type: "number", tab: "style", section: "Content", responsive: true },
  ],
};

/**
 * families/f2-pictures/image.ts — Elementor's **Image** (slug `image`, Basic).
 *
 * Offered by all five builders: `BUILDER_OFFERS_2026-09-19.json` lists `image`
 * under website, landing, newsletter, proposal and mybrand. It is the widget an
 * author reaches for first, and until this file it had THREE controls out of
 * Elementor's fifty-three and no Style tab at all.
 *
 * ── THIS REPLACES THE LEGACY DEFINITION, IT DOES NOT SIT BESIDE IT ────────
 * The kind is `image`, the SAME kind the `registry.ts` literal declares.
 * `mergeWidgetDefs` (D-168 "OVERRIDE") drops the legacy one from the list the
 * panel, the renderers, the upgrade and every stored document read, and keeps
 * this one in the old one's PLACE on the panel. Nothing here opens
 * `registry.ts`; the lander deletes the shadowed entry that `shadowedLegacyKinds()`
 * prints, and deleting it changes nothing at run time.
 *
 * ── EVERY PROPERTY THE OLD ONE STORED IS STILL READ ───────────────────────
 * A proposal saved in July holds `{"kind":"image","props":{"src":"…","alt":"…",
 * "caption":"…"}}`. Elementor's own key for the picture is `image`, so that is
 * what the panel writes now — and `pictureOf()` below reads `image`, `src` and
 * `url`, which are the three spellings on disk (the Portal's own `src`,
 * Elementor's `{url,id}` media object, and the `url` arion's publisher has
 * always read). A document opened from any of the three draws.
 *
 * ── ONE CONTROL ELEMENTOR DOES NOT HAVE, AND EXACTLY WHY ──────────────────
 * `alt` — "Describe it". Elementor has no alt-text control because WordPress
 * keeps a picture's alt on the MEDIA RECORD and the widget reads it from there.
 * We have no media library: an address is pasted in. Without this control a
 * picture in a newsletter has no alt text at all, which is what
 * `adapters/email`'s own pre-send check warns about and what a screen reader
 * needs. It is declared here, named in this family's test as the ONE exception
 * so the list cannot grow quietly, and it is NOT published to WordPress —
 * arion's emitter leaves it out for the same reason Elementor has no control.
 *
 * Titles, groups, panel sections, control labels, options, defaults and every
 * `responsive` flag are from `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`,
 * widget `image`, read in the live Elementor editor as well (see the handoff).
 */
import { esc } from "../../../esc";
import { box, pictureFrom } from "../../../pictures";
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import type { FamilyWidgetDef, EmailRenderContext, LandingRenderContext } from "../types";
import { emptyDrop, mediaUrl, str } from "./media";
import {
  ALIGNMENTS, ALIGNMENTS_4, BORDER_TYPES, FONT_WEIGHTS, LIGHTBOX, OBJECT_FITS, RESOLUTIONS,
  captionCss, clamped, decl, num, pictureEdge, resolutionCap, textAlign, widthCss,
} from "./styling";

/** THE picture, whichever of the three spellings a document holds. */
export function pictureOf(p: any): string {
  return mediaUrl(p.image) || mediaUrl(p.src) || mediaUrl(p.url);
}

/**
 * WHAT A READER WITH PICTURES OFF IS TOLD THIS IS.
 *
 * The author's own words first, then the caption, then the file name made
 * readable — never an empty `alt`, which is the one thing a screen reader
 * cannot do anything with. Same ladder `adapters/email`'s `altTextFor` has
 * always used, so the canvas and the mailbox describe a picture the same way.
 */
export function altOf(p: any): string {
  const explicit = str(p.alt).trim();
  if (explicit) return explicit;
  const cap = captionOf(p).trim();
  if (cap) return cap;
  const name = pictureOf(p).split("?")[0].split("/").pop() || "";
  return name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "Picture";
}

/**
 * THE CAPTION, per Elementor's `caption_source`.
 *
 * `none` prints nothing, `custom` prints what the author typed. Elementor has a
 * third, `attachment`, which reads the caption off the WordPress media record —
 * we have no media record, so that option is not offered rather than offered
 * and silently empty. Said plainly in the handoff.
 */
export function captionOf(p: any): string {
  const source = str(p.caption_source || (p.caption ? "custom" : "none"));
  return source === "none" ? "" : str(p.caption);
}

/** Where the picture links to, per Elementor's `link_to`. */
export function linkOf(p: any): string {
  const how = str(p.link_to);
  if (how === "file") return pictureOf(p);
  if (how === "custom") return mediaUrl(p.link);
  return "";
}

/* ══════════════════════════════════════════════════════════════════════════
   THE PAGE
   ══════════════════════════════════════════════════════════════════════════ */

export function renderImage(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const src = pictureOf(p);
  if (!src) return emptyDrop(ctx.mode, "Choose a picture in the panel on the right.");

  const height = num(p.height);
  const opacity = clamped(p.opacity, 0, 1);
  /* `width:N%` and a `max-width` from the resolution, never a hard pixel
     max-width: an inline max-width beats the stylesheet, and a 900px picture in
     a 390px document used to push the whole page sideways. */
  const imgCss = `display:block;`
    + widthCss(p.width)
    + decl("height", height == null ? "" : `${height}px`)
    + decl("object-fit", str(p["object-fit"]))
    + decl("opacity", opacity == null ? "" : String(opacity))
    + resolutionCap(p.image_size)
    + `max-width:100%;`
    + pictureEdge(p);

  const picture = `<img src="${esc(src)}" alt="${esc(altOf(p))}" loading="lazy" style="${imgCss}"/>`;
  const href = linkOf(p);
  const lightbox = str(p.open_lightbox);
  /* Elementor's own attribute, printed by Elementor's own frontend. It is what
     turns the link into a lightbox on the live page, and it is how this control
     is visible in our output instead of being a switch that does nothing. */
  const lightboxAttr = lightbox && lightbox !== "default"
    ? ` data-elementor-open-lightbox="${esc(lightbox)}"` : "";
  const linked = href ? `<a href="${esc(href)}"${lightboxAttr}>${picture}</a>` : picture;

  const caption = captionOf(p);
  const capCss = captionCss({
    align: p.caption_align, colour: p.text_color, background: p.caption_background_color,
    size: p.caption_typography_font_size, weight: p.caption_typography_font_weight,
    space: p.caption_space,
  });
  const cap = caption || ctx.mode === "edit"
    ? `<figcaption data-edit="caption" style="${capCss}">${esc(caption)}</figcaption>` : "";

  return `<figure class="bx-figure" style="margin:0;text-align:${textAlign(p.align, "center")}">${linked}${cap}</figure>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE MAILBOX — tables, inline styles, no classes, no flex, no grid
   ══════════════════════════════════════════════════════════════════════════ */

/** The widest a picture may be inside a newsletter's own padding. */
const EMAIL_PICTURE = 552;

export function emailImage(w: Widget, ctx: EmailRenderContext): string {
  const p: any = w.props || {};
  const src = pictureOf(p);
  if (!src) {
    return ctx.mode === "edit"
      ? `<div style="border:1px dashed #CBD5E1;border-radius:6px;padding:20px;text-align:center;color:#94A3B8;font-size:12px;">Choose a picture in the panel on the right.</div>`
      : "";
  }
  const align = textAlign(p.align, "center");
  /* A percentage width is a percentage of the newsletter's own column, worked
     out here into the pixel width a mail client needs on the `width` attribute
     — Outlook ignores a CSS width on an image and honours the attribute. */
  const pct = clamped(p.width, 1, 100);
  const cap = RESOLUTION_CAP_EMAIL(p.image_size);
  const wide = Math.min(cap, Math.round(EMAIL_PICTURE * ((pct ?? 100) / 100)));
  const edge = pictureEdge(p);
  const img = `<img src="${esc(src)}" alt="${esc(altOf(p))}" width="${wide}" style="display:block;width:100%;max-width:${wide}px;height:auto;border:0;outline:none;text-decoration:none;${edge}${align === "center" ? "margin:0 auto;" : ""}"/>`;
  const href = linkOf(p);
  const wrapped = href ? `<a href="${esc(href)}" style="text-decoration:none;">${img}</a>` : img;
  const caption = captionOf(p);
  const capCss = captionCss({
    align: p.caption_align ?? p.align, colour: p.text_color, background: p.caption_background_color,
    size: p.caption_typography_font_size, weight: p.caption_typography_font_weight,
    space: p.caption_space,
  }, align);
  const cap2 = caption || ctx.mode === "edit"
    ? `<div style="${capCss}"${ctx.mode === "edit" ? ` data-edit="caption"` : ""}>${esc(caption)}</div>` : "";
  return `<div style="text-align:${align};margin:0 0 16px 0;">${wrapped}${cap2}</div>`;
}

/** The pixel cap an Image Resolution asks for, inside the email's column. */
function RESOLUTION_CAP_EMAIL(v: unknown): number {
  const m = resolutionCap(v).match(/max-width:(\d+)px/);
  return m ? Math.min(EMAIL_PICTURE, Number(m[1])) : EMAIL_PICTURE;
}

/** The plain-text twin: a picture is its description, in brackets. */
export function emailImageText(p: any): string | null {
  if (!pictureOf(p)) return null;
  const cap = captionOf(p).trim();
  return cap ? `[${altOf(p)}] ${cap}` : `[${altOf(p)}]`;
}

/* ══════════════════════════════════════════════════════════════════════════
   THE HOSTED LANDING PAGE — real HTML with a stylesheet
   ══════════════════════════════════════════════════════════════════════════ */

export function landingImage(w: Widget, ctx: LandingRenderContext): string {
  /* A hosted landing page is real HTML, so the page renderer's own CSS is
     honest here. One renderer, one look — and the class stays `lp-fig` so the
     landing stylesheet keeps hold of it. */
  const inner = renderImage(w, ctx as unknown as RenderContext);
  if (!inner) return "";
  return inner.replace('class="bx-figure"', 'class="bx-figure lp-fig"');
}

/* ══════════════════════════════════════════════════════════════════════════
   THE DEFINITION
   ══════════════════════════════════════════════════════════════════════════ */

export const IMAGE_DEF: FamilyWidgetDef = {
  kind: "image",
  label: "Image",
  description: {
    website: "One photo or graphic on the page, with an optional caption.",
    landing: "One photo or graphic on the page, with an optional caption.",
    email: "One photo or graphic in the email, with an optional caption.",
    proposal: "One photo or graphic, with an optional caption.",
    brand: "A photo or graphic placed on the design — drag its corners to size it.",
  },
  icon: "Image",
  picture: pictureFrom(box(8, 8, 48, 24)
    + `<circle cx="20" cy="17" r="3" fill="#CBD5E1" stroke="none"/><path d="M12 30l12-10 10 8 8-6 10 8" stroke="#94A3B8"/>`),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  tier: "free",
  defaults: {
    image: "",
    alt: "",
    image_size: "large",
    caption_source: "none",
    caption: "",
    link_to: "none",
    link: "",
    open_lightbox: "default",
    align: "center",
  },
  controls: [
    /* ── Content ▸ Image ─────────────────────────────────────────────── */
    { key: "image", label: "Choose Image", type: "image", tab: "content", section: "Image" },
    { key: "alt", label: "Describe it", type: "text", tab: "content", section: "Image",
      help: "Read aloud by screen readers and shown if the picture fails to load." },
    { key: "image_size", label: "Image Resolution", type: "select", tab: "content", section: "Image", options: RESOLUTIONS },
    { key: "caption_source", label: "Caption", type: "select", tab: "content", section: "Image", options: [
      { value: "none", label: "None" }, { value: "custom", label: "Custom Caption" }] },
    { key: "caption", label: "Custom Caption", type: "text", tab: "content", section: "Image" },
    { key: "link_to", label: "Link", type: "select", tab: "content", section: "Image", options: [
      { value: "none", label: "None" }, { value: "file", label: "Media File" }, { value: "custom", label: "Custom URL" }] },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Image" },
    { key: "open_lightbox", label: "Lightbox", type: "select", tab: "content", section: "Image", options: LIGHTBOX },
    /* ── Style ▸ Image ───────────────────────────────────────────────── */
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Image", options: ALIGNMENTS, responsive: true },
    { key: "width", label: "Width", type: "number", tab: "style", section: "Image", responsive: true,
      help: "A share of the space it sits in, from 1 to 100." },
    { key: "height", label: "Height", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "object-fit", label: "Object Fit", type: "select", tab: "style", section: "Image", options: OBJECT_FITS, responsive: true },
    { key: "opacity", label: "Opacity", type: "number", tab: "style", section: "Image" },
    { key: "image_border_border", label: "Border Type", type: "select", tab: "style", section: "Image", options: BORDER_TYPES },
    { key: "image_border_width", label: "Border Width", type: "number", tab: "style", section: "Image", responsive: true },
    { key: "image_border_color", label: "Border Color", type: "colour", tab: "style", section: "Image" },
    { key: "image_border_radius", label: "Border Radius", type: "number", tab: "style", section: "Image", responsive: true },
    /* ── Style ▸ Caption ─────────────────────────────────────────────── */
    { key: "caption_align", label: "Alignment", type: "select", tab: "style", section: "Caption", options: ALIGNMENTS_4, responsive: true },
    { key: "text_color", label: "Text Color", type: "colour", tab: "style", section: "Caption" },
    { key: "caption_background_color", label: "Background Color", type: "colour", tab: "style", section: "Caption" },
    { key: "caption_typography_font_size", label: "Size", type: "number", tab: "style", section: "Caption", responsive: true },
    { key: "caption_typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Caption", options: FONT_WEIGHTS },
    { key: "caption_space", label: "Spacing", type: "number", tab: "style", section: "Caption", responsive: true },
  ],
};

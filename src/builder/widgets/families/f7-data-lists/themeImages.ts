/**
 * families/f7-data-lists/themeImages.ts — the two widgets that are one picture
 * pulled off the site: **Site Logo** and **Featured Image**.
 *
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json` registers both with the same
 * panel — a content section called "Site Logo" / "Image" holding `image`,
 * `image_size`, `caption_source`, `link_to`, `link` and `open_lightbox`, and
 * two style sections called "Image" and "Caption". Featured Image adds one
 * control, `caption` (its Caption source may be "Custom"), and Site Logo's
 * `link_to` has one extra option, "Site URL", which is its own default. Two
 * files would be two copies of one panel.
 *
 * ── SITE LOGO KNOWS ITS OWN ANSWER ────────────────────────────────────────
 * The business's logo is already in the render context, so the canvas shows the
 * real one rather than a grey box. Featured Image belongs to whichever story is
 * being read, which the builder cannot know, so it draws the frame and says so
 * in one sentence while editing.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, solid } from "../../../pictures";
import { editRun } from "../../text";
import type { FamilyRenderer, FamilyWidgetDef } from "../types";
import { IMAGE_RESOLUTION_OPTIONS, fromTheSite, str } from "./shared";

const LIGHTBOX_OPTIONS = [
  { value: "default", label: "Default" }, { value: "yes", label: "Yes" }, { value: "no", label: "No" },
];

/** The frame both widgets draw: a picture, or the empty slot for one.
 *  `captionHtml` is already markup, because one caller types into it. */
function picture(src: string, captionHtml: string, link: string, alt: string): string {
  const img = src
    ? `<img src="${esc(src)}" alt="${esc(alt)}" style="max-width:100%;height:auto;border-radius:6px;display:block"/>`
    : `<div class="bx-imgdrop" style="height:110px;border-radius:6px;background:#E2E8F0"></div>`;
  const inner = link ? `<a href="${esc(link)}" style="display:inline-block">${img}</a>` : img;
  return `<figure class="bx-f7-figure" style="margin:0">${inner}${
    captionHtml ? `<div class="bx-f7-caption" style="font-size:11px;color:#5A7A8A;margin-top:5px">${captionHtml}</div>` : ""}</figure>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Site Logo — Elementor `theme-site-logo`
   ══════════════════════════════════════════════════════════════════════════ */

export const THEME_SITE_LOGO_DEF: FamilyWidgetDef = {
  kind: "theme_site_logo",
  label: "Site Logo",
  description: "Your logo, taken from the site itself, so changing it once changes every page.",
  icon: "Image",
  picture: pictureFrom(solid(14, 10, 36, 20)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: {
    image: "", image_size: "full", caption_source: "none",
    link_to: "site_url", link: "", open_lightbox: "default", align: "",
  },
  controls: [
    {
      key: "image", label: "Site Logo", type: "image", tab: "content", section: "Site Logo",
      help: "Leave it empty to use the logo from your brand kit.",
    },
    { key: "image_size", label: "Image Resolution", type: "select", tab: "content", section: "Site Logo", options: IMAGE_RESOLUTION_OPTIONS },
    { key: "caption_source", label: "Caption", type: "select", tab: "content", section: "Site Logo", options: [
      { value: "none", label: "None" }, { value: "attachment", label: "Attachment Caption" }] },
    { key: "link_to", label: "Link", type: "select", tab: "content", section: "Site Logo", options: [
      { value: "none", label: "None" }, { value: "file", label: "Media File" },
      { value: "custom", label: "Custom URL" }, { value: "site_url", label: "Site URL" }] },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Site Logo" },
    { key: "open_lightbox", label: "Lightbox", type: "select", tab: "content", section: "Site Logo", options: LIGHTBOX_OPTIONS },
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Image", responsive: true, options: [
      { value: "", label: "Default" }, { value: "left", label: "Left" },
      { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
  ],
};

export const renderThemeSiteLogo: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const src = str(p.image) || str(ctx.business?.logoUrl);
  const linkTo = str(p.link_to) || "site_url";
  const href = linkTo === "custom" ? str(p.link) : linkTo === "site_url" ? "/" : "";
  const align = str(p.align);
  return `<div class="bx-f7-logo" style="text-align:${align || "left"}">`
    + picture(src, "", href, `${str(ctx.business?.name) || "The business"} logo`)
    + fromTheSite(ctx.mode, src
      ? "This is the logo from your brand kit. Change it there and every page follows."
      : "Add a logo to your brand kit and it appears here on every page.")
    + `</div>`;
};

/* ══════════════════════════════════════════════════════════════════════════
   Featured Image — Elementor `theme-post-featured-image`
   ══════════════════════════════════════════════════════════════════════════ */

export const THEME_POST_FEATURED_IMAGE_DEF: FamilyWidgetDef = {
  kind: "theme_post_featured_image",
  label: "Featured Image",
  description: "The main picture of whichever story is being read.",
  icon: "ImagePlus",
  picture: pictureFrom(solid(8, 8, 48, 24)),
  category: "Site",
  builders: ["website"],
  tier: "pro",
  defaults: {
    image: "", image_size: "large", caption_source: "none", caption: "",
    link_to: "none", link: "", open_lightbox: "default", align: "",
  },
  controls: [
    {
      key: "image", label: "Choose Image", type: "image", tab: "content", section: "Image",
      help: "Only used when a story has no picture of its own.",
    },
    { key: "image_size", label: "Image Resolution", type: "select", tab: "content", section: "Image", options: IMAGE_RESOLUTION_OPTIONS },
    { key: "caption_source", label: "Caption", type: "select", tab: "content", section: "Image", options: [
      { value: "none", label: "None" }, { value: "attachment", label: "Attachment Caption" },
      { value: "custom", label: "Custom Caption" }] },
    { key: "caption", label: "Custom Caption", type: "text", tab: "content", section: "Image" },
    { key: "link_to", label: "Link", type: "select", tab: "content", section: "Image", options: [
      { value: "none", label: "None" }, { value: "file", label: "Media File" },
      { value: "custom", label: "Custom URL" }] },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Image" },
    { key: "open_lightbox", label: "Lightbox", type: "select", tab: "content", section: "Image", options: LIGHTBOX_OPTIONS },
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Image", responsive: true, options: [
      { value: "", label: "Default" }, { value: "left", label: "Left" },
      { value: "center", label: "Centre" }, { value: "right", label: "Right" }] },
  ],
};

export const renderThemePostFeaturedImage: FamilyRenderer = (w: Widget, ctx: RenderContext) => {
  const p: any = w.props || {};
  const wantsCaption = str(p.caption_source) === "custom";
  const caption = !wantsCaption ? "" : ctx.mode === "edit"
    ? editRun("caption", p.caption, "bx-p", "A line under the picture", ctx, "span")
    : esc(str(p.caption));
  const href = str(p.link_to) === "custom" ? str(p.link) : "";
  return `<div class="bx-f7-featured" style="text-align:${str(p.align) || "left"}">`
    + picture(str(p.image), caption, href, "The story's main picture")
    + fromTheSite(ctx.mode, "Each story shows its own main picture here.")
    + `</div>`;
};

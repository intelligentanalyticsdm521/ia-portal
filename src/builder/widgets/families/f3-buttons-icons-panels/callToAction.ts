/**
 * Call to Action — Elementor `call-to-action`, group Pro.
 *
 * Elementor's own title, its three Content sections (Image · Content · Ribbon)
 * and its Style sections (Box · Graphic Element · Content · Button · Ribbon),
 * with Elementor's own control labels — "Skin", "Position", "Choose Image",
 * "Graphic Element", "Icon", "Title", "Title HTML Tag", "Description",
 * "Description HTML Tag", "Button Text", "Link", "Apply Link On", and the
 * Ribbon's "Title" and "Position". All read off
 * `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, the registry scraped from a
 * real Elementor Pro editor. NOT seen live — the Playground sandbox is free
 * Elementor only.
 *
 * ── WHY THIS ONE MATTERS MOST IN THE FAMILY ───────────────────────────────
 * D-168, in Brandon's words: *"cards — that's the standard Elementor cards
 * widget"*. Elementor has no widget called Cards; the widget that draws a
 * picture panel with a title, a line, a button and a ribbon is this one, and
 * the offer file gives it to four of the five builders. The 2026-09-19 plan
 * notes our `site_cta` SECTION does this job on a website today; a section is a
 * band of the page and this is a widget you put in a container, so they are not
 * the same mechanism and this does not replace it.
 *
 * ── OFFERED ON: website, landing, proposal ────────────────────────────────
 * The offer file also lists `call-to-action` under `newsletter.elementor`, and
 * it is NOT on that panel here. The reason is not a decision about the widget:
 * the newsletter surface is drawn by `adapters/email/emailRender.ts`, a
 * hand-written table renderer with a pinned `EMAIL_RENDERED_KINDS` list, and
 * that file belongs to no family. The same subtraction the D-165 handoff logged
 * for Reviews and Book Now. Written up in D168_HANDOFF_2026-09-19.md so the
 * lander can close it in one place rather than five.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar, box, solid } from "../../../pictures";
import { editRun, proseRun } from "../../text";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { TAG_OPTIONS, buttonHtml, safeTag, str, textAlign } from "./shared";

/** Elementor's `layout`: where the picture sits relative to the words. */
function pictureFirst(layout: string): boolean {
  return layout !== "right" && layout !== "below";
}

/** Side by side, or stacked. `left`/`right` are a row; `above`/`below` a column. */
function isRow(layout: string): boolean {
  return layout === "left" || layout === "right";
}

export function renderCallToAction(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const title = str(p.title);
  const description = str(p.description);
  const buttonText = str(p.button);
  const empty = !title.trim() && !description.trim() && !buttonText.trim() && !str(p.bg_image).trim();
  if (empty && ctx.mode !== "edit") return "";

  const layout = str(p.layout) || "above";
  const align = textAlign(p.alignment, "center");
  const skin = str(p.skin) || "classic";

  /* THE PICTURE. Elementor's `cover` skin lays the words OVER it; `classic`
     puts them beside or under it. Both are one <img> and one block of words,
     which is why this is a layout question and not two renderers. */
  const src = str(p.bg_image);
  const picture = src
    ? `<img class="bx-f3-cta-pic" src="${esc(src)}" alt="" style="display:block;width:100%;height:100%;object-fit:cover;border-radius:6px"/>`
    : ctx.mode === "edit"
      ? `<div class="bx-f3-cta-drop" style="border:1px dashed #CBD5E1;border-radius:6px;padding:24px;text-align:center;color:#94A3B8;font-size:12px">Choose a picture in the panel on the right.</div>`
      : "";

  /* THE GRAPHIC ELEMENT — Elementor's `none | image | icon`, above the title. */
  const graphic = (() => {
    const kind = str(p.graphic_element) || "none";
    if (kind === "icon") {
      const size = Math.max(12, Math.min(96, Number(p.icon_size) || 32));
      const colour = str(p.icon_primary_color) || ctx.accent;
      return `<div class="bx-f3-cta-graphic" style="font-size:${size}px;line-height:1;color:${esc(colour)};margin-bottom:8px">${glyphFor(p.selected_icon)}</div>`;
    }
    if (kind === "image" && str(p.graphic_image)) {
      const width = Math.max(16, Math.min(100, Number(p.graphic_image_width) || 30));
      return `<div class="bx-f3-cta-graphic" style="margin-bottom:8px"><img src="${esc(str(p.graphic_image))}" alt="" style="display:block;width:${width}%;max-width:100%;height:auto"/></div>`;
    }
    return "";
  })();

  const titleTag = safeTag(p.title_tag, "h2");
  const bodyTag = safeTag(p.description_tag, "div");
  const titleColour = str(p.title_color) || ctx.ink;
  const bodyColour = str(p.description_color) || "#5A7A8A";

  const button = buttonHtml({
    text: buttonText,
    /* Elementor's `link_click`: `box` puts the link on the whole panel and
       `button` on the button. The panel-wide link is drawn by the wrapper
       below, so the button carries no href of its own in that case — two
       anchors, one inside the other, is markup no browser agrees on. */
    href: str(p.link_click) === "box" ? "" : str(p.link),
    background: str(p.button_background_color) || ctx.accent,
    colour: str(p.button_text_color) || "#FFFFFF",
    mode: ctx.mode,
    editPath: "button",
    placeholder: "Button text",
  });

  /* THE AUTHOR'S COLOURS, on a wrapper rather than patched into the run.
     `editRun` owns what a clickable run of text looks like — its class, its
     `data-edit` path, its placeholder — and a renderer that reached in and
     rewrote that string would be a second opinion about the one editing
     mechanism. So the colour goes on the element AROUND it, which is the same
     answer every other widget in the builder already gives. `bodyTag` is
     carried for the emitter (Elementor's Description HTML Tag) and is a
     `data-` attribute here, because `proseRun` draws paragraphs and a
     description that is secretly an <h4> reads as a second heading. */
  const wordsTagged = `<div class="bx-f3-cta-words" style="text-align:${align};padding:16px;background:${esc(str(p.content_bg_color) || "transparent")}">
    ${graphic}
    <div class="bx-f3-cta-title-wrap" style="color:${esc(titleColour)}">${editRun("title", title, "bx-h bx-f3-cta-title", "What you want them to do", ctx, titleTag)}</div>
    <div class="bx-f3-cta-body-wrap" style="color:${esc(bodyColour)}" data-description-tag="${esc(bodyTag)}">${proseRun("description", description, "bx-p bx-f3-cta-body", "A line about it", ctx)}</div>
    ${button ? `<div class="bx-f3-cta-action" style="margin-top:12px">${button}</div>` : ""}
  </div>`;

  const minHeight = Number(p["min-height"]) || 0;
  const frame = `border-radius:8px;overflow:hidden;${minHeight ? `min-height:${Math.max(40, Math.min(1200, minHeight))}px;` : ""}`;

  const inner = skin === "cover" && src
    ? `<div class="bx-f3-cta-cover" style="position:relative;${frame}">
        ${picture}
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">${wordsTagged}</div>
      </div>`
    : isRow(layout)
      ? `<div class="bx-f3-cta-row" style="display:flex;gap:16px;align-items:center;${frame}">
          ${pictureFirst(layout) ? `<div style="flex:0 0 40%;min-width:0">${picture}</div><div style="flex:1 1 auto;min-width:0">${wordsTagged}</div>`
            : `<div style="flex:1 1 auto;min-width:0">${wordsTagged}</div><div style="flex:0 0 40%;min-width:0">${picture}</div>`}
        </div>`
      : `<div class="bx-f3-cta-stack" style="${frame}">
          ${pictureFirst(layout) ? `${picture}${wordsTagged}` : `${wordsTagged}${picture}`}
        </div>`;

  /* THE RIBBON — Elementor's corner flash. Drawn only when it has words. */
  const ribbonTitle = str(p.ribbon_title);
  const ribbonSide = str(p.ribbon_horizontal_position) === "right" ? "right" : "left";
  const ribbon = ribbonTitle.trim()
    ? `<div class="bx-f3-cta-ribbon" style="position:absolute;top:10px;${ribbonSide}:10px;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:700;background:${esc(str(p.ribbon_bg_color) || ctx.accent)};color:${esc(str(p.ribbon_text_color) || "#FFFFFF")}">${esc(ribbonTitle)}</div>`
    : "";

  const body = `<div class="bx-f3-cta" style="position:relative">${inner}${ribbon}</div>`;
  const boxLink = str(p.link_click) === "box" ? str(p.link) : "";
  return boxLink
    ? `<a class="bx-f3-cta-boxlink" href="${esc(boxLink)}" style="display:block;text-decoration:none;color:inherit">${body}</a>`
    : body;
}

export const CALL_TO_ACTION_DEF: FamilyWidgetDef = {
  kind: "call_to_action",
  label: "Call to Action",
  description: {
    website: "A picture panel with a title, a line and a button — the thing you want them to do.",
    landing: "A picture panel with a title, a line and a button — the thing you want them to do.",
    proposal: "A panel with a title, a line and a button — the thing you want them to do next.",
  },
  icon: "MousePointerClick",
  picture: pictureFrom(
    box(6, 6, 52, 28) + solid(6, 6, 52, 11)
    + bar(14, 20, 36, 4) + `<rect x="14" y="27" width="20" height="6" rx="3" fill="#94A3B8" stroke="none"/>`),
  /* ELEMENTOR PRO'S OWN GROUP (D-168 item 6, fixed in wave 2). This widget is
     `pro-elements` in BUILDER_WIDGET_CATALOG_2026-09-17.pro.json. Wave one put
     it in General, because at the time General was where every Pro widget sat;
     the override seam gave Elementor Pro's six groups their real names and the
     panel test caught it. */
  category: "Pro",
  builders: ["website", "landing", "proposal"],
  tier: "pro",
  defaults: {
    skin: "classic",
    layout: "above",
    bg_image: "",
    bg_image_size: "large",
    graphic_element: "none",
    graphic_image: "",
    graphic_image_size: "thumbnail",
    selected_icon: { ...DEFAULT_ICON },
    title: "",
    title_tag: "h2",
    description: "",
    description_tag: "div",
    button: "",
    link: "",
    link_click: "button",
    ribbon_title: "",
    ribbon_horizontal_position: "",
    alignment: "center",
    "min-height": 0,
    icon_primary_color: "",
    icon_size: 32,
    graphic_image_width: 30,
    content_bg_color: "",
    title_color: "",
    description_color: "",
    button_text_color: "",
    button_background_color: "",
    ribbon_bg_color: "",
    ribbon_text_color: "",
  },
  controls: [
    /* ── Content tab: Image · Content · Ribbon, Elementor's own three ────── */
    { key: "skin", label: "Skin", type: "select", tab: "content", section: "Image", options: [
      { value: "classic", label: "Classic" }, { value: "cover", label: "Cover" }] },
    { key: "layout", label: "Position", type: "select", tab: "content", section: "Image", responsive: true, options: [
      { value: "left", label: "Left" }, { value: "above", label: "Above" },
      { value: "right", label: "Right" }, { value: "below", label: "Below" }] },
    { key: "bg_image", label: "Choose Image", type: "image", tab: "content", section: "Image" },
    { key: "bg_image_size", label: "Image Resolution", type: "select", tab: "content", section: "Image", options: [
      { value: "thumbnail", label: "Thumbnail" }, { value: "medium", label: "Medium" },
      { value: "large", label: "Large" }, { value: "full", label: "Full" }] },

    { key: "graphic_element", label: "Graphic Element", type: "select", tab: "content", section: "Content", options: [
      { value: "none", label: "None" }, { value: "image", label: "Image" }, { value: "icon", label: "Icon" }] },
    { key: "graphic_image", label: "Choose Image", type: "image", tab: "content", section: "Content" },
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Content", options: ICON_OPTIONS },
    { key: "title", label: "Title", type: "text", tab: "content", section: "Content" },
    { key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Content", options: TAG_OPTIONS.filter((o) => o.value !== "p") },
    { key: "description", label: "Description", type: "textarea", tab: "content", section: "Content" },
    { key: "description_tag", label: "Description HTML Tag", type: "select", tab: "content", section: "Content", options: TAG_OPTIONS.filter((o) => o.value !== "p") },
    { key: "button", label: "Button Text", type: "text", tab: "content", section: "Content" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Content" },
    { key: "link_click", label: "Apply Link On", type: "select", tab: "content", section: "Content", options: [
      { value: "box", label: "Whole Box" }, { value: "button", label: "Button Only" }] },

    { key: "ribbon_title", label: "Title", type: "text", tab: "content", section: "Ribbon" },
    { key: "ribbon_horizontal_position", label: "Position", type: "select", tab: "content", section: "Ribbon", options: [
      { value: "left", label: "Left" }, { value: "right", label: "Right" }] },

    /* ── Style tab: Elementor's five sections, its core control from each ── */
    { key: "alignment", label: "Alignment", type: "select", tab: "style", section: "Box", responsive: true, options: [
      { value: "start", label: "Left" }, { value: "center", label: "Centre" }, { value: "end", label: "Right" }] },
    { key: "min-height", label: "Height", type: "number", tab: "style", section: "Box", responsive: true },
    { key: "icon_primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Graphic Element" },
    { key: "icon_size", label: "Icon Size", type: "number", tab: "style", section: "Graphic Element" },
    { key: "graphic_image_width", label: "Width", type: "number", tab: "style", section: "Graphic Element" },
    { key: "content_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Content" },
    { key: "title_color", label: "Title Color", type: "colour", tab: "style", section: "Content" },
    { key: "description_color", label: "Description Color", type: "colour", tab: "style", section: "Content" },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Button" },
    { key: "button_background_color", label: "Background Color", type: "colour", tab: "style", section: "Button" },
    { key: "ribbon_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Ribbon" },
    { key: "ribbon_text_color", label: "Text Color", type: "colour", tab: "style", section: "Ribbon" },
  ],
};

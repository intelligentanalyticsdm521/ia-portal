/**
 * Icon Box — Elementor `icon-box`, group General.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `widgets/icons.ts`'s `ICON_BOX_DEF`: eight controls, `title_text` labelled
 * "Title & Description" (one label for two fields), no View, no Shape, no
 * Title HTML Tag, no colours for the words, no spacing of any kind, and a
 * renderer that ignored `link` entirely — the control was on the panel and the
 * box was never clickable.
 *
 * SAME KIND (`icon_box`). Every prop the old definition wrote is still read,
 * including its own `position` spelling (`top | left | right`) beside
 * Elementor's (`block-start | block-end | inline-start | inline-end`).
 *
 * ── ELEMENTOR'S OWN PANEL ─────────────────────────────────────────────────
 * Content ▸ Icon Box: Icon · View · Shape · Title · Description · Link ·
 * Title HTML Tag.
 * Style ▸ Box: Icon Position (responsive) · Vertical Alignment (responsive) ·
 * Alignment (responsive) · Icon Spacing (responsive) · Content Spacing
 * (responsive).
 * Style ▸ Icon: Primary Color · Secondary Color · Size (responsive) · Padding
 * (responsive) · Rotate (responsive) · Border Width.
 * Style ▸ Content: Title Color · Description Color.
 *
 * Left out and named in the handoff: the four Hover colours and their
 * Transition Durations, Hover Animation, the Text Stroke group and the two
 * Text Shadow groups — nine controls, all of them a popover in Elementor.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar } from "../../../pictures";
import { editRun, proseRun } from "../../text";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { TAG_OPTIONS, safeTag, str, textAlign } from "./shared";
import {
  RESPONSIVE, SHAPE_OPTIONS, VIEW_OPTIONS, colour, markSkin, num,
} from "./deep";

/**
 * ELEMENTOR'S `position`, IN BOTH SPELLINGS, as a flex direction.
 *
 * Elementor 3.x stores `block-start | block-end | inline-start | inline-end`;
 * our own definition stored `top | left | right` since D-165 and documents hold
 * it. One reader, so a box saved yesterday and a box published to WordPress
 * lay out the same way.
 */
function flexDirection(v: unknown): string {
  switch (str(v)) {
    case "inline-start": case "left": return "row";
    case "inline-end": case "right": return "row-reverse";
    case "block-end": case "bottom": return "column-reverse";
    default: return "column";
  }
}

/** Elementor's Vertical Alignment — how the words sit beside a side icon. */
function crossAlign(v: unknown, fallback: string): string {
  switch (str(v)) {
    case "middle": return "center";
    case "bottom": return "flex-end";
    case "top": return "flex-start";
    default: return fallback;
  }
}

export function renderIconBox(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const direction = flexDirection(p.position);
  const side = direction === "row" || direction === "row-reverse";
  const align = textAlign(p.text_align, side ? "left" : "center");

  const size = num(p.icon_size, 32, 6, 400);
  const primary = colour(p.primary_color, ctx.accent);
  const secondary = colour(p.secondary_color, "#FFFFFF");
  const skin = markSkin({
    view: p.view, shape: p.shape, size, primary, secondary,
    padding: p.icon_padding, borderWidth: p.border_width, rotate: p.rotate,
  });
  const mark = `<span class="bx-icon" style="${skin}">${glyphFor(p.selected_icon)}</span>`;

  const gap = num(p.icon_space, 12, 0, 200);
  const contentGap = num(p.title_bottom_space, 4, 0, 200);
  const titleTag = safeTag(p.title_size, "h3");
  const titleColour = colour(p.title_color, ctx.ink);
  const bodyColour = colour(p.description_color, "#5A7A8A");

  const body = `<div class="bx-iconbox-body" style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:${contentGap}px">
      <div class="bx-iconbox-title" style="color:${esc(titleColour)}">${editRun("title_text", p.title_text, "bx-h bx-h3", "A short title", ctx, titleTag)}</div>
      <div class="bx-iconbox-desc" style="color:${esc(bodyColour)}">${proseRun("description_text", p.description_text, "bx-p", "A line about it", ctx)}</div>
    </div>`;

  const inner = `<div class="bx-iconbox" style="display:flex;flex-direction:${direction};gap:${gap}px;align-items:${
    side ? crossAlign(p.content_vertical_alignment, "flex-start")
      : align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start"
  };text-align:${align}">
    <div class="bx-iconbox-mark">${mark}</div>
    ${body}
  </div>`;

  /* THE LINK. The old renderer had the control and never drew it, so a box an
     author had pointed at a page went nowhere. Elementor wraps the WHOLE box. */
  const link = str(p.link).trim();
  return link
    ? `<a class="bx-iconbox-link" href="${esc(link)}" style="display:block;text-decoration:none;color:inherit">${inner}</a>`
    : inner;
}

export const ICON_BOX_DEF: FamilyWidgetDef = {
  kind: "icon_box",
  label: "Icon Box",
  description: {
    proposal: "A symbol with a title and a line under it — the three-across row.",
    website: "A symbol with a title and a line under it — the three-across row every page has.",
    landing: "A symbol with a title and a line under it — the three-across row every page has.",
    email: "A symbol with a title and a line under it — three across reads well in a mailbox.",
    brand: "A symbol with a title and a line under it, placed on the design.",
  },
  icon: "SquareDashedBottomCode",
  picture: pictureFrom(`<circle cx="32" cy="12" r="6" fill="#94A3B8" stroke="none"/>` + bar(18, 23, 28, 5) + bar(14, 32, 36)),
  category: "General",
  /* NOT `mybrand`. The studio is an absolute-pixel canvas that places LAYERS,
     and the offer file's `mybrand` list is ten Elementor widgets; Icon Box is
     not one of them. A tile whose press puts nothing on the canvas is worse
     than a tile that is not there. */
  builders: ["website", "landing", "newsletter", "proposal"],
  defaults: {
    selected_icon: { ...DEFAULT_ICON }, view: "default", shape: "circle",
    title_text: "", description_text: "", link: "", title_size: "h3",
    position: "block-start", content_vertical_alignment: "top", text_align: "center",
    icon_space: 12, title_bottom_space: 4,
    primary_color: "", secondary_color: "", icon_size: 32, icon_padding: 0,
    rotate: 0, border_width: 2, title_color: "", description_color: "",
  },
  controls: [
    /* ── Content ▸ Icon Box ───────────────────────────────────────────── */
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Icon Box", options: ICON_OPTIONS },
    { key: "view", label: "View", type: "select", tab: "content", section: "Icon Box", options: VIEW_OPTIONS },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Icon Box", options: SHAPE_OPTIONS },
    { key: "title_text", label: "Title", type: "text", tab: "content", section: "Icon Box" },
    { key: "description_text", label: "Description", type: "textarea", tab: "content", section: "Icon Box" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Icon Box" },
    { key: "title_size", label: "Title HTML Tag", type: "select", tab: "content", section: "Icon Box", options: TAG_OPTIONS },

    /* ── Style ▸ Box ──────────────────────────────────────────────────── */
    { key: "position", label: "Icon Position", type: "select", tab: "style", section: "Box", responsive: RESPONSIVE, options: [
      { value: "inline-start", label: "Start" }, { value: "inline-end", label: "End" },
      { value: "block-start", label: "Top" }, { value: "block-end", label: "Bottom" }] },
    { key: "content_vertical_alignment", label: "Vertical Alignment", type: "select", tab: "style", section: "Box", responsive: RESPONSIVE, options: [
      { value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }] },
    { key: "text_align", label: "Alignment", type: "select", tab: "style", section: "Box", responsive: RESPONSIVE, options: [
      { value: "start", label: "Start" }, { value: "center", label: "Center" },
      { value: "end", label: "End" }, { value: "justify", label: "Justified" }] },
    { key: "icon_space", label: "Icon Spacing", type: "number", tab: "style", section: "Box", responsive: RESPONSIVE },
    { key: "title_bottom_space", label: "Content Spacing", type: "number", tab: "style", section: "Box", responsive: RESPONSIVE },

    /* ── Style ▸ Icon ─────────────────────────────────────────────────── */
    { key: "primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "icon_padding", label: "Padding", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "rotate", label: "Rotate", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "border_width", label: "Border Width", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },

    /* ── Style ▸ Content ──────────────────────────────────────────────── */
    { key: "title_color", label: "Title Color", type: "colour", tab: "style", section: "Content" },
    { key: "description_color", label: "Description Color", type: "colour", tab: "style", section: "Content" },
  ],
};

export default ICON_BOX_DEF;

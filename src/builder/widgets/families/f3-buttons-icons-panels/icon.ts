/**
 * Icon — Elementor `icon`, group Basic.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `widgets/icons.ts`'s `ICON_DEF`: seven controls, `shape` offering two of
 * Elementor's three, no secondary colour, no padding, no rotation, no border,
 * and its Alignment select labelled with British "Centre" while every other
 * value in the file is Elementor's own American spelling.
 *
 * SAME KIND (`icon`), so a stored document keeps drawing — and every prop the
 * old definition wrote is still read: `selected_icon`, `view`, `shape`, `link`,
 * `primary_color`, `size`, and `align` in the old `left | center | right`
 * spelling as well as Elementor's `start | center | end`.
 *
 * ── ELEMENTOR'S OWN PANEL ─────────────────────────────────────────────────
 * Content ▸ Icon: Icon · View · Shape · Link.
 * Style ▸ Icon: Alignment (responsive) · Primary Color · Secondary Color ·
 * Size (responsive) · Padding · Rotate (responsive) · Border Width ·
 * Border Radius (responsive).
 *
 * Left out and named in the handoff: Hover's Primary Color, Secondary Color
 * and Hover Animation, and `fit_to_size` — three of them are a hover state the
 * canvas cannot show without a second rule per widget, and Fit to Size only
 * does anything for an SVG icon library we do not carry.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom } from "../../../pictures";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { str, flexJustify } from "./shared";
import {
  RESPONSIVE, SHAPE_OPTIONS, START_CENTER_END, VIEW_OPTIONS, colour, markSkin, num,
} from "./deep";

export function renderIcon(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const size = num(p.size, 28, 6, 400);
  const primary = colour(p.primary_color, ctx.accent);
  /* Elementor's Secondary Color is the glyph's own colour once the shape is
     FILLED — the `stacked` view. Unset means white, which is what the old
     renderer hard-coded and never let an author change. */
  const secondary = colour(p.secondary_color, "#FFFFFF");

  const skin = markSkin({
    view: p.view, shape: p.shape, size, primary, secondary,
    padding: p.icon_padding, borderWidth: p.border_width, rotate: p.rotate,
  });
  const radius = num(p.border_radius, -1, 0, 400);
  const extra = radius >= 0 ? `border-radius:${radius}px;` : "";

  const mark = `<span class="bx-icon" style="${skin}${extra}">${glyphFor(p.selected_icon)}</span>`;
  const link = str(p.link).trim();
  const inner = link ? `<a href="${esc(link)}" style="text-decoration:none">${mark}</a>` : mark;

  /* Elementor's Alignment is a flex justification of one mark in its own box.
     `flexJustify` already answers both dialects — `start | center | end` from
     the Style tab and `left | center | right` from documents written before. */
  return `<div class="bx-iconwrap" style="display:flex;justify-content:${flexJustify(p.align, "flex-start")}">${inner}</div>`;
}

export const ICON_DEF: FamilyWidgetDef = {
  kind: "icon",
  label: "Icon",
  description: "One symbol — a tick, a star, a phone — in the colour you choose.",
  icon: "Star",
  picture: pictureFrom(`<path d="M32 10l5 11 12 1-9 8 3 12-11-7-11 7 3-12-9-8 12-1z" fill="#94A3B8" stroke="none"/>`),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  defaults: {
    selected_icon: { ...DEFAULT_ICON }, view: "default", shape: "circle", link: "",
    align: "start", primary_color: "", secondary_color: "", size: 28,
    icon_padding: 0, rotate: 0, border_width: 2, border_radius: -1,
  },
  controls: [
    /* ── Content ▸ Icon ───────────────────────────────────────────────── */
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Icon", options: ICON_OPTIONS },
    { key: "view", label: "View", type: "select", tab: "content", section: "Icon", options: VIEW_OPTIONS },
    { key: "shape", label: "Shape", type: "select", tab: "content", section: "Icon", options: SHAPE_OPTIONS },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Icon" },

    /* ── Style ▸ Icon ─────────────────────────────────────────────────── */
    { key: "align", label: "Alignment", type: "select", tab: "style", section: "Icon", responsive: RESPONSIVE, options: START_CENTER_END },
    { key: "primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "secondary_color", label: "Secondary Color", type: "colour", tab: "style", section: "Icon",
      help: "The symbol's own colour once the shape behind it is filled." },
    { key: "size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "icon_padding", label: "Padding", type: "number", tab: "style", section: "Icon" },
    { key: "rotate", label: "Rotate", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE,
      help: "Degrees. 90 turns it a quarter turn clockwise." },
    { key: "border_width", label: "Border Width", type: "number", tab: "style", section: "Icon" },
    { key: "border_radius", label: "Border Radius", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE,
      help: "Overrides the Shape. Leave it below zero to let the Shape decide." },
  ],
};

export default ICON_DEF;

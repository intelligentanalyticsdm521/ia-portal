/**
 * Divider — Elementor `divider`, group Basic.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `registry.ts`'s `divider`: ONE control (Style: Line | Dotted | Space only)
 * and a renderer that was, in full, `<hr class="bx-divider"/>`. The control set
 * nothing — all three choices drew the same rule — and there was no colour, no
 * weight, no width and no alignment. An author who wanted a thin grey line
 * across half the page could not have one.
 *
 * SAME KIND (`divider`). The three legacy values are still read: `line` is
 * Elementor's `solid`, `dotted` is `dotted`, and `space_only` draws the gap
 * with no rule at all, which is the only one of the three that ever behaved
 * differently and it did not.
 *
 * ── ELEMENTOR'S OWN PANEL ─────────────────────────────────────────────────
 * Content ▸ Divider: Style · Width (responsive) · Alignment (responsive) ·
 * Add Element · Text · HTML Tag · Icon.
 * Style ▸ Divider: Color · Weight · Gap (responsive).
 * Style ▸ Text: Color · Size (responsive) · Weight · Position · Spacing.
 * Style ▸ Icon: View · Size (responsive) · Primary Color · Spacing.
 *
 * ── THE STYLE OPTION LIST, AND HOW IT WAS GOT ─────────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json` records this control as a
 * `select` with a default of `solid` and NO options — Elementor builds that
 * list at run time from its pattern library, so the scrape could not carry it.
 * The four line styles below are the ones Elementor's own `divider` renders as
 * a CSS border (`solid`, `double`, `dotted`, `dashed`); its twenty-odd SVG
 * PATTERNS (Curly, Zigzag, Wavy, Slashes, Squares …) are not offered, because
 * each is a generated SVG data-URI and offering their names while drawing a
 * plain rule would be a select that lies. Written in the handoff under this
 * widget, with what it would take.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar } from "../../../pictures";
import { fillText } from "../../text";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { TAG_OPTIONS, safeTag, str, flexJustify } from "./shared";
import {
  FONT_WEIGHT_OPTIONS, LEFT_CENTER_RIGHT, RESPONSIVE, VIEW_OPTIONS,
  borderStyle, colour, markSkin, num,
} from "./deep";

export function renderDivider(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;

  /* THE LEGACY VALUES, STILL READ. `line` was our own word for Elementor's
     `solid`; `space_only` meant "leave the gap and draw nothing". */
  const stored = str(p.style) || "solid";
  const spaceOnly = stored === "space_only";
  const lineStyle = borderStyle(stored === "line" ? "solid" : stored, "solid");

  const lineColour = colour(p.color, "#000");
  const weight = num(p.weight, 1, 0, 40);
  const width = num(p.width, 100, 1, 100);
  const gap = num(p.gap, 15, 0, 200);

  const rule = spaceOnly || weight === 0
    ? `<span class="bx-divider-line" style="display:block;flex:1 1 auto;height:0"></span>`
    : `<span class="bx-divider-line" style="display:block;flex:1 1 auto;border-top:${weight}px ${lineStyle} ${esc(lineColour)}"></span>`;

  /* ELEMENTOR'S "Add Element": nothing, a run of words, or one symbol, sitting
     in a break in the middle of the rule. This is the whole reason Elementor's
     Divider is a widget and not an `<hr>`, and our old one had none of it. */
  const look = str(p.look) || "line";
  let middle = "";
  if (look === "line_text") {
    const words = str(p.text);
    const tag = safeTag(p.html_tag, "span");
    const style = `color:${esc(colour(p.text_color, ctx.ink))};`
      + (Number(p.text_typography_font_size) > 0 ? `font-size:${num(p.text_typography_font_size, 14, 6, 200)}px;` : "")
      + (/^[1-9]00$/.test(str(p.text_typography_font_weight)) ? `font-weight:${str(p.text_typography_font_weight)};` : "")
      + `padding:0 ${num(p.text_spacing, 10, 0, 200)}px;white-space:nowrap`;
    middle = `<${tag} class="bx-divider-text${words.trim() ? "" : " bx-slot"}" data-edit="text" data-placeholder="A few words" style="${style}">${fillText(words, ctx)}</${tag}>`;
  } else if (look === "line_icon") {
    const size = num(p.icon_size, 20, 6, 200);
    const skin = markSkin({
      view: p.icon_view, shape: "circle", size,
      primary: colour(p.primary_color, ctx.accent), secondary: "#FFFFFF",
    });
    middle = `<span class="bx-divider-icon" style="${skin}margin:0 ${num(p.icon_spacing, 10, 0, 200)}px">${glyphFor(p.icon ?? DEFAULT_ICON)}</span>`;
  }

  /* Where the words or the symbol sit ALONG the rule — Elementor calls both of
     them "Position" and stores them in two different keys. */
  const middlePosition = str(look === "line_icon" ? p.icon_align : p.text_align) || "center";
  const body = middle
    ? middlePosition === "left" ? `${middle}${rule}`
      : middlePosition === "right" ? `${rule}${middle}`
        : `${rule}${middle}${rule}`
    : rule;

  return `<div class="bx-divider bx-f3-divider" style="display:flex;justify-content:${flexJustify(p.align, "center")};padding:${gap}px 0">
    <span style="display:flex;align-items:center;width:${width}%">${body}</span>
  </div>`;
}

export const DIVIDER_DEF: FamilyWidgetDef = {
  kind: "divider",
  label: "Divider",
  description: {
    proposal: "A line across the section, to separate one idea from the next.",
    website: "A line across the section, to separate one idea from the next.",
    email: "A line across the email, to separate one idea from the next.",
    landing: "A line across the section, to separate one idea from the next.",
    brand: "A straight rule you place on the design, at any length and weight.",
  },
  icon: "Minus",
  picture: pictureFrom(bar(8, 19, 48, 2)),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  defaults: {
    style: "solid", width: 100, align: "center", look: "line",
    text: "Divider", html_tag: "span", icon: { ...DEFAULT_ICON },
    color: "#000", weight: 1, gap: 15,
    text_color: "", text_typography_font_size: 0, text_typography_font_weight: "",
    text_align: "center", text_spacing: 10,
    icon_view: "default", icon_size: 20, primary_color: "", icon_align: "center", icon_spacing: 10,
  },
  controls: [
    /* ── Content ▸ Divider ────────────────────────────────────────────── */
    { key: "style", label: "Style", type: "select", tab: "content", section: "Divider", options: [
      { value: "solid", label: "Solid" }, { value: "double", label: "Double" },
      { value: "dotted", label: "Dotted" }, { value: "dashed", label: "Dashed" }] },
    { key: "width", label: "Width", type: "number", tab: "content", section: "Divider", responsive: RESPONSIVE,
      help: "Per cent of the space it sits in." },
    { key: "align", label: "Alignment", type: "select", tab: "content", section: "Divider", responsive: RESPONSIVE, options: LEFT_CENTER_RIGHT },
    { key: "look", label: "Add Element", type: "select", tab: "content", section: "Divider", options: [
      { value: "line", label: "None" }, { value: "line_text", label: "Text" },
      { value: "line_icon", label: "Icon" }] },
    { key: "text", label: "Text", type: "text", tab: "content", section: "Divider" },
    { key: "html_tag", label: "HTML Tag", type: "select", tab: "content", section: "Divider", options: TAG_OPTIONS },
    { key: "icon", label: "Icon", type: "select", tab: "content", section: "Divider", options: ICON_OPTIONS },

    /* ── Style ▸ Divider ──────────────────────────────────────────────── */
    { key: "color", label: "Color", type: "colour", tab: "style", section: "Divider" },
    { key: "weight", label: "Weight", type: "number", tab: "style", section: "Divider" },
    { key: "gap", label: "Gap", type: "number", tab: "style", section: "Divider", responsive: RESPONSIVE },

    /* ── Style ▸ Text ─────────────────────────────────────────────────── */
    { key: "text_color", label: "Color", type: "colour", tab: "style", section: "Text" },
    { key: "text_typography_font_size", label: "Size", type: "number", tab: "style", section: "Text", responsive: RESPONSIVE },
    { key: "text_typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Text", options: FONT_WEIGHT_OPTIONS },
    { key: "text_align", label: "Position", type: "select", tab: "style", section: "Text", options: LEFT_CENTER_RIGHT },
    { key: "text_spacing", label: "Spacing", type: "number", tab: "style", section: "Text", responsive: RESPONSIVE },

    /* ── Style ▸ Icon ─────────────────────────────────────────────────── */
    { key: "icon_view", label: "View", type: "select", tab: "style", section: "Icon", options: VIEW_OPTIONS },
    { key: "icon_size", label: "Size", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
    { key: "primary_color", label: "Primary Color", type: "colour", tab: "style", section: "Icon" },
    { key: "icon_align", label: "Position", type: "select", tab: "style", section: "Icon", options: LEFT_CENTER_RIGHT },
    { key: "icon_spacing", label: "Spacing", type: "number", tab: "style", section: "Icon", responsive: RESPONSIVE },
  ],
};

export default DIVIDER_DEF;

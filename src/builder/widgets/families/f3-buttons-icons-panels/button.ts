/**
 * Button — Elementor `button`, group Basic.
 *
 * ── WHAT IT REPLACES ──────────────────────────────────────────────────────
 * `registry.ts`'s `button`: four controls (Button text, Where it goes, Style,
 * Colour), no tabs, no sections, and a renderer that was ONE LINE —
 *
 *     `<a class="bx-button" style="background:${ctx.accent}" href="…">…</a>`
 *
 * — so the Colour control set nothing, the Style control set nothing, and every
 * button on every page was the brand accent whatever the author chose. That is
 * the first tile an author presses.
 *
 * It is the SAME KIND (`button`). `mergeWidgetDefs` drops the legacy one and a
 * proposal saved in July still opens, because the kind never changed. Every
 * prop the old definition stored is still read: `label` behind Elementor's
 * `text`, `url` behind `link`, `colour` behind `button_background_color`, and
 * `style` (Solid | Outline | Plain link) is still honoured as a skin even
 * though it is no longer offered — Elementor has no such control, and D-168
 * says the panel is Elementor's.
 *
 * ── ELEMENTOR'S OWN PANEL (BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json) ─
 * Content, section "Button": Type · Text · Link · Size · Icon · Icon Position ·
 * Icon Spacing · Button ID.
 * Style, section "Button": Position (responsive) · Typography's Size, Weight
 * and Transform · Text Color · Background Color · Border Type · Border Width ·
 * Border Color · Border Radius · Padding · Hover Text Color · Hover Background
 * Color.
 *
 * Twelve of Elementor's thirty-eight are left out and named in the handoff —
 * the whole Box Shadow / Text Shadow group, the gradient half of Background
 * Type, Hover Border Color, Transition Duration, and the six Typography
 * controls no author opens (Family, Style, Decoration, Line Height, Letter
 * Spacing, Word Spacing). Each one is a popover of its own in Elementor.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import type { RenderContext } from "../../../render";
import { pictureFrom, bar } from "../../../pictures";
import { fillText } from "../../text";
import { DEFAULT_ICON, ICON_OPTIONS, glyphFor } from "../../glyph";
import type { FamilyWidgetDef } from "../types";
import { str, textAlign, flexJustify } from "./shared";
import {
  BORDER_TYPE_OPTIONS, FONT_WEIGHT_OPTIONS, RESPONSIVE, TEXT_TRANSFORM_OPTIONS,
  borderStyle, colour, firstStr, num, typeCss,
} from "./deep";

/** Elementor's five sizes, and the padding + type size each one really means. */
const SIZES: Record<string, { pad: string; size: number }> = {
  xs: { pad: "6px 12px", size: 12 },
  sm: { pad: "9px 18px", size: 14 },
  md: { pad: "12px 24px", size: 15 },
  lg: { pad: "15px 30px", size: 17 },
  xl: { pad: "20px 40px", size: 19 },
};

/**
 * ELEMENTOR'S `button_type` — the five tints of its Type select.
 *
 * "Default" is the brand accent, which is what every button on the platform
 * was before today. The other four are Elementor's own semantic colours and
 * they are what makes the Type control DO something; a select that changed
 * nothing is the defect this pass exists to remove.
 */
const TYPES: Record<string, string> = {
  info: "#5BC0DE",
  success: "#5CB85C",
  warning: "#F0AD4E",
  danger: "#D9534F",
};

export function renderButton(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;

  /* BOTH SPELLINGS, ALWAYS. `text`/`link` are Elementor's; `label`/`url` are
     what every document stored before today, and a page that lost its button's
     words on the day we deepened the widget would be the worst kind of win. */
  const words = firstStr(p.text, p.label);
  const href = firstStr(p.link, p.url);

  const size = SIZES[str(p.size)] || SIZES.sm;
  const legacySkin = str(p.style);            // "solid" | "outline" | "plain_link"
  const typeTint = TYPES[str(p.button_type)] || "";
  const fill = colour(p.background_color, colour(p.colour, typeTint || ctx.accent));
  const ink = colour(p.button_text_color, legacySkin === "solid" || !legacySkin ? "#FFFFFF" : fill);

  /* The legacy `style` control is not offered any more, but it is still READ:
     `outline` is a bordered pill with no fill and `plain_link` is words only.
     Elementor reaches both through Border Type and Background Color, which is
     what the panel now offers; this is only so a stored document looks the
     same as it did yesterday. */
  const plain = legacySkin === "plain_link";
  const outline = legacySkin === "outline";

  const stroke = borderStyle(p.border_border, outline ? "solid" : "none");
  const strokeWidth = num(p.border_width, outline ? 2 : 1, 0, 40);
  const strokeColour = colour(p.border_color, fill);
  const radius = num(p.border_radius, 6, 0, 200);
  /* Elementor's Padding is a four-sided dimensions control; the engine's panel
     has no such control, so this is ONE number and it is the inset on every
     side. Named in the handoff as one of the twelve left out, rather than
     offered as a box an author cannot fill in. */
  const padY = num(p.text_padding, 0, 0, 200);
  const padding = padY ? `${padY}px ${Math.round(padY * 2)}px` : size.pad;

  const skin = [
    "display:inline-flex;align-items:center;gap:" + num(p.icon_indent, 8, 0, 80) + "px;text-decoration:none",
    "font-family:inherit",
    typeCss(num(p.typography_font_size, size.size, 6, 200), p.typography_font_weight, p.typography_text_transform)
      || `font-size:${size.size}px;font-weight:600;`,
    `line-height:1.2`,
    plain ? "padding:0" : `padding:${esc(padding)}`,
    plain || outline ? "background:transparent" : `background:${esc(fill)}`,
    `color:${esc(ink)}`,
    plain ? "" : `border-radius:${radius}px`,
    stroke === "none" ? "" : `border:${strokeWidth}px ${stroke} ${esc(strokeColour)}`,
  ].filter(Boolean).join(";");

  /* THE ICON, AND WHICH SIDE OF THE WORDS IT SITS ON. Elementor's `icon_align`
     stores the CSS it means: `row` is Start, `row-reverse` is End. */
  const iconValue = (p as { selected_icon?: unknown }).selected_icon;
  const hasIcon = !!str((iconValue as { value?: unknown })?.value ?? iconValue).trim();
  const mark = hasIcon ? `<span class="bx-btn-i" aria-hidden="true">${glyphFor(iconValue)}</span>` : "";
  const direction = str(p.icon_align) === "row-reverse" ? "row-reverse" : "row";

  /* THE WORDS ARE TYPED ON THE PAGE, like every other run of text in the
     builder. `data-edit="text"` is the Elementor key, so what the author types
     lands where the emitter reads it. */
  const body = `<span class="bx-btn-t${words.trim() ? "" : " bx-slot"}" data-edit="text" data-placeholder="Button text">${fillText(words, ctx)}</span>`;

  if (!words.trim() && !hasIcon && ctx.mode !== "edit") return "";

  /* THE HOVER COLOURS, AND WHY THEY ARE A <style> AND NOT AN ATTRIBUTE.
     `:hover` cannot be written inline, and a control the renderer ignores is
     the exact defect this pass exists to remove — the old Colour control set
     nothing and every button came out brand-accent. The rule is scoped to this
     ONE widget by its own id, so it cannot reach another button on the page. */
  const hoverInk = colour(p.hover_color, "");
  const hoverFill = colour(p.button_background_hover_color, "");
  const scope = `bxb-${String(w.id || "w").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const hoverCss = hoverInk || hoverFill
    ? `<style>.${scope}:hover{${hoverInk ? `color:${esc(hoverInk)};` : ""}${hoverFill ? `background:${esc(hoverFill)};` : ""}}</style>`
    : "";

  const inner = `<span class="bx-btn-in" style="display:inline-flex;align-items:center;gap:inherit;flex-direction:${direction}">${mark}${body}</span>`;
  const cls = `bx-button bx-f3-button ${scope}`;
  const pill = href
    ? `<a class="${cls}" href="${esc(href)}" style="${skin}">${inner}</a>`
    : `<span class="${cls}" style="${skin}">${inner}</span>`;

  /* Elementor's Position is the alignment of the button INSIDE its container,
     and `justify` is its "Stretch". */
  const position = str(p.align);
  const stretch = position === "justify";
  return `${hoverCss}<div class="bx-f3-buttonwrap" style="display:flex;justify-content:${stretch ? "stretch" : flexJustify(position, "flex-start")};text-align:${textAlign(position, "left")}">${
    stretch ? pill.replace('style="', 'style="width:100%;justify-content:center;') : pill}</div>`;
}

export const BUTTON_DEF: FamilyWidgetDef = {
  kind: "button",
  label: "Button",
  description: {
    proposal: "The thing you want them to press — Accept, Book a call, Ask a question.",
    website: "The thing you want a visitor to click — Book a call, Get a quote.",
    email: "The thing you want the reader to click — Book a call, See the offer.",
    landing: "The thing you want a visitor to click — Get a quote, Claim the offer.",
    brand: "A rounded block with a few words on it, for a call to action.",
  },
  icon: "MousePointerClick",
  picture: pictureFrom(`<rect x="16" y="14" width="32" height="13" rx="6" fill="#94A3B8" stroke="none"/>` + bar(23, 19, 18, 3)),
  category: "Basic",
  builders: ["website", "landing", "newsletter", "proposal", "mybrand"],
  defaults: {
    button_type: "", text: "", link: "", size: "sm",
    selected_icon: { value: "", library: "" }, icon_align: "row", icon_indent: 8,
    align: "", typography_font_size: 0, typography_font_weight: "",
    typography_text_transform: "", button_text_color: "", background_color: "",
    border_border: "", border_width: 1, border_color: "", border_radius: 6,
    text_padding: 0, hover_color: "", button_background_hover_color: "",
  },
  controls: [
    /* ── Content ▸ Button ─────────────────────────────────────────────── */
    { key: "button_type", label: "Type", type: "select", tab: "content", section: "Button", options: [
      { value: "", label: "Default" }, { value: "info", label: "Info" },
      { value: "success", label: "Success" }, { value: "warning", label: "Warning" },
      { value: "danger", label: "Danger" }] },
    /* THE WORDS, IN THE PANEL AS WELL AS ON THE PAGE (2026-09-20, audit round
       4 row 130). The reference draws a Text field here — second, after Type —
       and ours had none at all: the words were typed on the page only, so a
       Button dropped onto an empty sheet showed a panel that said nothing
       about the one thing a Button is for. `panel: true` is the same flag the
       Heading's Title uses and it writes the SAME stored key `data-edit="text"`
       writes, so the two doors are one value.

       SECOND, NOT FIRST. The brief said "the first Content control"; driving
       the reference on 2026-09-20 says Type comes first and Text second, and
       with `size` deleted above this list is now Elementor's Content tab
       exactly, minus Button ID. Recorded in the handoff. */
    { key: "text", label: "Text", type: "text", tab: "content", section: "Button", panel: true },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Button" },
    /* "Size" IS DELETED (2026-09-20, audit round 4 row 134). Driven on
       2026-09-20: `button.size` carries `condition: { "size[value]!": "sm" }`
       and its own default IS `sm`, so the condition never fires and the
       control is NEVER on the reference's panel. The renderer still READS
       `p.size`, so a button saved as Large is still Large; nothing new can
       set one, and `SIZES` above is what reads it. */
    { key: "selected_icon", label: "Icon", type: "select", tab: "content", section: "Button", options: ICON_OPTIONS },
    /* ONLY ONCE THERE ARE WORDS **AND** AN ICON (2026-09-20, row 135). The
       reference's own condition, driven: `{ "text!": "", "selected_icon[value]!":
       "" }` on both. Which side of the words an icon sits on, and how far from
       them, are questions that cannot be answered until both exist. */
    { key: "icon_align", label: "Icon Position", type: "select", tab: "content", section: "Button",
      condition: { "text!": "", "selected_icon!": "" }, options: [
      { value: "row", label: "Start" }, { value: "row-reverse", label: "End" }] },
    { key: "icon_indent", label: "Icon Spacing", type: "number", tab: "content", section: "Button",
      condition: { "text!": "", "selected_icon!": "" }, units: ["px"], max: 80 },
    /* Elementor's eighth Content control is "Button ID". It is NOT offered:
       the engine's panel draws seven control types and `text` is not one of
       them — a text control is typed ON THE PAGE, and a CSS id has nothing on
       the page to type into. A tile with a control an author cannot reach is
       worse than a tile without it. Named in the handoff. */

    /* ── Style ▸ Button ───────────────────────────────────────────────── */
    { key: "align", label: "Position", type: "select", tab: "style", section: "Button", responsive: RESPONSIVE, options: [
      { value: "", label: "Default" }, { value: "left", label: "Left" },
      { value: "center", label: "Center" }, { value: "right", label: "Right" },
      { value: "justify", label: "Stretch" }] },
    { key: "typography_font_size", label: "Size", type: "number", tab: "style", section: "Button", responsive: RESPONSIVE, units: ["px"], max: 200 },
    { key: "typography_font_weight", label: "Weight", type: "select", tab: "style", section: "Button", options: FONT_WEIGHT_OPTIONS },
    { key: "typography_text_transform", label: "Transform", type: "select", tab: "style", section: "Button", options: TEXT_TRANSFORM_OPTIONS },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Button" },
    { key: "background_color", label: "Background Color", type: "colour", tab: "style", section: "Button" },
    { key: "border_border", label: "Border Type", type: "select", tab: "style", section: "Button", options: BORDER_TYPE_OPTIONS },
    { key: "border_width", label: "Border Width", type: "number", tab: "style", section: "Button", responsive: RESPONSIVE, units: ["px"], max: 40 },
    { key: "border_color", label: "Border Color", type: "colour", tab: "style", section: "Button" },
    { key: "border_radius", label: "Border Radius", type: "number", tab: "style", section: "Button", responsive: RESPONSIVE, units: ["px"], max: 200 },
    { key: "text_padding", label: "Padding", type: "number", tab: "style", section: "Button", responsive: RESPONSIVE, units: ["px"], max: 100,
      help: "Space inside the button, top and bottom. The sides get twice it." },

    /* ── Style ▸ Hover ────────────────────────────────────────────────── */
    { key: "hover_color", label: "Text Color", type: "colour", tab: "style", section: "Hover" },
    { key: "button_background_hover_color", label: "Background Color", type: "colour", tab: "style", section: "Hover" },
  ],
};

export default BUTTON_DEF;

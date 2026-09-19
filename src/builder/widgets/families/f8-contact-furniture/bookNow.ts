/**
 * f8-contact-furniture/bookNow.ts — **Book Now**, the database twin of Button.
 *
 * ── WHAT IT IS, in the offer file's own words ─────────────────────────────
 * `"book_now": "twin of Button: links to the booking page"`. So it is
 * Elementor's Button — the same panel, the same keys, the same look — with the
 * link already pointing at the business's own booking page instead of being
 * typed. Nothing else about it is different, and nothing else about it should
 * be.
 *
 * Offered on `website.ia`, `landing.ia` and `newsletter.ia`.
 *
 * ── WHAT IT WAS UNTIL TODAY ───────────────────────────────────────────────
 * Three controls in `widgets/iaBlocks.ts` — Button text, Where it goes,
 * Alignment — and no Style tab. Elementor's Button has a Content section of
 * eight and a Style section a person really uses. This file is the SAME `kind`,
 * so a page saved before today opens and draws: `label` and `url` are still
 * read beside Elementor's `text` and `link`, and `align` beside Elementor's own
 * `align`. `mergeWidgetDefs` (b168/override) drops the old declaration.
 *
 * ── WHERE THE KEYS COME FROM ──────────────────────────────────────────────
 * `BUILDER_WIDGET_CATALOG_2026-09-17.elementor.json`, widget `button`, and the
 * LIVE editor driven on 2026-09-19
 * (`elementor-reference/widgets/_g8_control_facts.json`): sections
 * `section_button` (Content, labelled "Button") and `section_style` (Style,
 * labelled "Button"); `text` defaults to "Click here", `size` to `sm`,
 * `icon_align` to `row`, and `align` is RESPONSIVE and lives on the STYLE tab,
 * labelled **Position** — not on Content, which is where our old three-control
 * version put it.
 *
 * ── WHAT IS DELIBERATELY NOT A CONTROL ────────────────────────────────────
 * · `selected_icon` is Elementor's `icons` control — an icon LIBRARY picker.
 *   The panel has no such shape, and a text box holding an icon name would
 *   publish a broken glyph. `icon_align` and `icon_indent` ARE here because a
 *   page that already carries an icon still positions it.
 * · The whole BACKGROUND GROUP — classic or gradient, two colours, an angle, a
 *   slideshow, Ken Burns, and a second copy of all of it for hover. `Color` and
 *   `Hover Color` are the plain colours a person actually sets; the rest is 90
 *   keys of a control shape the panel does not draw.
 * · `typography_*` beyond size, `text_shadow_*`, `box_shadow_*` and
 *   `hover_animation`: group controls with no panel shape. Font size is here.
 */
import type { Widget } from "../../../model";
import type { RenderContext } from "../../../render";
import { esc } from "../../../esc";
import { bar, pictureFrom } from "../../../pictures";
import { editRun } from "../../text";
import type { EmailRenderContext, FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** Elementor's own Type list for a button. */
export const BUTTON_TYPES = [
  { value: "", label: "Default" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" },
];

/** Elementor's own Size list, values exactly as the catalogue carries them. */
export const BUTTON_SIZES = [
  { value: "xs", label: "Extra Small" },
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
  { value: "xl", label: "Extra Large" },
];

/** Elementor's Position `choose`, on the STYLE tab and responsive. */
export const BUTTON_ALIGNS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Stretch" },
];

/** Its Icon Position: `row` is before the words, `row-reverse` after them. */
export const ICON_POSITIONS = [
  { value: "row", label: "Start" },
  { value: "row-reverse", label: "End" },
];

/** Elementor's Border Type list, its own seven values. */
export const BORDER_TYPES = [
  { value: "", label: "Default" },
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "double", label: "Double" },
  { value: "dotted", label: "Dotted" },
  { value: "dashed", label: "Dashed" },
  { value: "groove", label: "Groove" },
];

/** Elementor's own padding per size, so changing Size changes the page. */
const SIZE_PAD: Record<string, string> = {
  xs: "8px 14px", sm: "10px 18px", md: "12px 22px", lg: "14px 28px", xl: "18px 36px",
};
const SIZE_FONT: Record<string, number> = { xs: 11, sm: 13, md: 14, lg: 16, xl: 18 };

/** Elementor's own four semantic colours for Type. */
const TYPE_COLOUR: Record<string, string> = {
  info: "#5BC0DE", success: "#5CB85C", warning: "#F0AD4E", danger: "#D9534F",
};

function num(v: unknown, dflt: number): number {
  const n = Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? n : dflt;
}

/**
 * THE WORDS ON THE BUTTON, whichever key they were stored under.
 *
 * `text` is Elementor's; `label` is what every page saved before today holds.
 * One reader, so no stored page loses its button.
 */
export function bookNowText(p: Record<string, unknown>): string {
  const t = str(p.text).trim() || str(p.label).trim();
  return t || "Book now";
}

/** …and the link. `link` is Elementor's, `url` is the stored one. */
export function bookNowHref(p: Record<string, unknown>): string {
  const l = p.link;
  const fromLink = l && typeof l === "object" ? str((l as any).url) : str(l);
  return fromLink.trim() || str(p.url).trim();
}

/** Where the row sits. Elementor's `justify` means stretch the button. */
function justify(align: string): string {
  if (align === "center") return "center";
  if (align === "right") return "flex-end";
  return "flex-start";
}

/**
 * WHAT THE CANVAS DRAWS: the real button, at the real size, in the real
 * colours, with the real border and radius, in the real position — and a scoped
 * hover rule, so the hover colours are not two controls that do nothing.
 */
export function renderBookNow(w: Widget, ctx: RenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const size = str(p.size) || "sm";
  const align = str(p.align) || str(p.content_align) || "left";
  const type = str(p.button_type);
  const bg = str(p.background_color) || TYPE_COLOUR[type] || ctx.accent;
  const ink = str(p.button_text_color) || "#ffffff";
  const hoverInk = str(p.hover_color) || ink;
  const hoverBg = str(p.button_background_hover_color) || bg;
  const hoverBorder = str(p.button_hover_border_color);
  const borderType = str(p.border_border);
  const borderColour = str(p.border_color) || bg;
  const borderWidth = num(p.border_width, 0);
  const radius = num(p.border_radius, 6);
  const pad = str(p.text_padding).trim() || SIZE_PAD[size] || SIZE_PAD.sm;
  const font = num(p.typography_font_size, SIZE_FONT[size] ?? 13);
  const gap = num(p.icon_indent, 6);
  const direction = str(p.icon_align) === "row-reverse" ? "row-reverse" : "row";
  const cssId = str(p.button_css_id);

  const cls = `bx-booknow-${String(w.id || "x").replace(/[^A-Za-z0-9_-]/g, "")}`;
  const border = borderType && borderType !== "none"
    ? `border:${borderWidth || 1}px ${esc(borderType)} ${esc(borderColour)};`
    : "border:0;";

  const label = ctx.mode === "edit"
    ? editRun("text", bookNowText(p), "bx-booknow-t", "Book now", ctx, "span")
    : esc(bookNowText(p));

  return `<div class="bx-booknow" style="display:flex;justify-content:${justify(align)}">
    <a class="bx-button ${cls}"${cssId ? ` id="${esc(cssId)}"` : ""}
      href="${esc(bookNowHref(p) || "#")}"
      style="display:inline-flex;flex-direction:${direction};align-items:center;gap:${gap}px;
        background:${esc(bg)};color:${esc(ink)};padding:${esc(pad)};border-radius:${radius}px;
        font-size:${font}px;${border}${align === "justify" ? "width:100%;justify-content:center;" : ""}"
      >${label}</a>
    <style>.${cls}:hover{background:${esc(hoverBg)};color:${esc(hoverInk)}${
      hoverBorder ? `;border-color:${esc(hoverBorder)}` : ""}}</style>
  </div>`;
}

/**
 * THE MAILBOX HALF — the newsletter offers this widget and an inbox is not a
 * page. Tables, inline styles, no classes, no flex: `adapters/email/emailRender
 * .ts` refuses anything else and that check is not weakened for families.
 * The colours, the size, the radius and the position are the author's, so the
 * panel means the same thing on both surfaces.
 */
export function emailBookNow(w: Widget, ctx: EmailRenderContext): string {
  const p = (w.props || {}) as Record<string, unknown>;
  const size = str(p.size) || "sm";
  const align = str(p.align) || str(p.content_align) || "left";
  const bg = str(p.background_color) || TYPE_COLOUR[str(p.button_type)] || str(ctx.accent || "") || "#0C4A60";
  const ink = str(p.button_text_color) || "#ffffff";
  const radius = num(p.border_radius, 6);
  const pad = str(p.text_padding).trim() || SIZE_PAD[size] || SIZE_PAD.sm;
  const font = num(p.typography_font_size, SIZE_FONT[size] ?? 13);
  const at = align === "center" ? "center" : align === "right" ? "right" : "left";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + `<tr><td align="${at}" style="padding:4px 0">`
    + `<a href="${esc(bookNowHref(p) || "#")}" style="display:inline-block;background:${esc(bg)};`
    + `color:${esc(ink)};padding:${esc(pad)};border-radius:${radius}px;font-size:${font}px;`
    + `text-decoration:none">${esc(bookNowText(p))}</a>`
    + `</td></tr></table>`;
}

export const BOOK_NOW_DEF: FamilyWidgetDef = {
  kind: "book_now",
  label: "Book Now",
  description: {
    /* NOT the word "page": `builder-registry.test.mjs` bans it on the email
       pane, because an email has no pages and a sentence that says it has is
       the panel telling a reader something untrue. */
    email: "A button that takes the reader straight to your booking form.",
    website: "A button that takes a visitor straight to your booking page.",
    landing: "A button that takes a visitor straight to your booking page.",
  },
  icon: "CalendarCheck",
  picture: pictureFrom(`<rect x="16" y="13" width="32" height="14" rx="7" fill="#94A3B8" stroke="none"/>`
    + bar(23, 18, 18, 4)),
  category: "Intelligent Analytics",
  /* Offer file: `website.ia`, `landing.ia`, `newsletter.ia`. The newsletter is
     new today — the widget was website and landing only, and the offer file has
     listed it for the newsletter since 12:58 on 2026-09-19. */
  builders: ["website", "landing", "newsletter"],
  tier: "ia:oliver",
  defaults: {
    text: "Book now",
    link: "",
    size: "sm",
    button_type: "",
    button_css_id: "",
    icon_align: "row",
    icon_indent: 6,
    align: "left",
    typography_font_size: 13,
    button_text_color: "",
    background_color: "",
    hover_color: "",
    button_background_hover_color: "",
    button_hover_border_color: "",
    border_border: "",
    border_color: "",
    border_width: 0,
    border_radius: 6,
    text_padding: "",
  },
  controls: [
    /* ── Content · "Button" (section_button) ──────────────────────────── */
    { key: "button_type", label: "Type", type: "select", tab: "content", section: "Button",
      options: BUTTON_TYPES },
    { key: "text", label: "Text", type: "text", tab: "content", section: "Button" },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Button",
      help: "Leave it empty and it goes to your booking page." },
    { key: "size", label: "Size", type: "select", tab: "content", section: "Button",
      options: BUTTON_SIZES },
    { key: "icon_align", label: "Icon Position", type: "select", tab: "content", section: "Button",
      options: ICON_POSITIONS },
    { key: "icon_indent", label: "Icon Spacing", type: "number", tab: "content", section: "Button" },
    { key: "button_css_id", label: "Button ID", type: "text", tab: "content", section: "Button" },

    /* ── Style · "Button" (section_style) ─────────────────────────────── */
    /* Elementor puts Position on the Style tab, not Content, and marks it
       responsive. Copied from the machine file and from the live read. */
    { key: "align", label: "Position", type: "select", tab: "style", section: "Button",
      responsive: true, options: BUTTON_ALIGNS },
    { key: "typography_font_size", label: "Size", type: "number", tab: "style", section: "Button",
      responsive: true },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Button" },
    { key: "background_color", label: "Color", type: "colour", tab: "style", section: "Button" },
    { key: "hover_color", label: "Text Color (hover)", type: "colour", tab: "style", section: "Button" },
    { key: "button_background_hover_color", label: "Color (hover)", type: "colour", tab: "style",
      section: "Button" },
    { key: "button_hover_border_color", label: "Border Color (hover)", type: "colour", tab: "style",
      section: "Button" },
    { key: "border_border", label: "Border Type", type: "select", tab: "style", section: "Button",
      options: BORDER_TYPES },
    { key: "border_color", label: "Border Color", type: "colour", tab: "style", section: "Button" },
    { key: "border_width", label: "Border Width", type: "number", tab: "style", section: "Button",
      responsive: true },
    { key: "border_radius", label: "Border Radius", type: "number", tab: "style", section: "Button",
      responsive: true },
    { key: "text_padding", label: "Padding", type: "text", tab: "style", section: "Button",
      responsive: true, help: "CSS padding, e.g. 12px 22px" },
  ],
};

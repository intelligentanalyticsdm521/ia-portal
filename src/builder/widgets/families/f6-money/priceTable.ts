/**
 * families/f6-money/priceTable.ts — ELEMENTOR'S **Price Table** (`price-table`).
 *
 * D-168, and the offer file (`BUILDER_OFFERS_2026-09-19.json`) which lists
 * `price-table` under website ▸ elementor_pro, landing ▸ elementor_pro,
 * newsletter ▸ elementor and proposal ▸ elementor. Four builders, and no
 * My Brand: the Template Studio places absolute-pixel layers and a price table
 * is a flow.
 *
 * ── EVERY NAME HERE IS ELEMENTOR'S OWN ────────────────────────────────────
 * Read out of `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`, never invented:
 *
 *   title      "Price Table"            icon  eicon-price-table
 *   Content    Header · Pricing · Features · Footer · Ribbon
 *   Style      Header · Pricing · Features · Footer · Ribbon
 *   keys       heading, sub_heading, heading_tag, currency_symbol,
 *              currency_symbol_custom, price, currency_format, sale,
 *              original_price, period, features_list[{item_text}],
 *              button_text, link, footer_additional_info, show_ribbon,
 *              ribbon_title, ribbon_horizontal_position
 *
 * The control LABELS are Elementor's too — "Title", "Description", "Currency
 * Symbol", "Additional Info". Where a label alone does not say what the field
 * is for, the plain sentence goes in `help`, which is ours and adds no second
 * vocabulary.
 *
 * ── THE ONE PLACE THIS DOES NOT COPY ELEMENTOR: THE STARTING WORDS ────────
 * Elementor ships `heading: "Enter your title"`, `price: "39.99"`,
 * `footer_additional_info: "This is text element"` and a ribbon reading
 * "Popular", switched ON. Those are fine in a page builder you preview before
 * publishing; they are not fine here, because the same document is printed
 * into a PDF a customer signs, and "This is text element" on a signed
 * agreement is a defect nobody would ever type on purpose.
 *
 * So the STRUCTURAL defaults are Elementor's exactly (`heading_tag: "h3"`,
 * `currency_symbol: "dollar"`, `ribbon_horizontal_position: "right"`) and the
 * WORDS start empty, with Elementor's own default string used as the grey
 * placeholder on the canvas (`run.ts`, D-01): the author sees Elementor's
 * wording, and nothing false can print.
 *
 * ── WHY IT IS NOT `card` ──────────────────────────────────────────────────
 * `widgets/card.ts` is the SAME widget under our own name, built before D-168
 * said a widget carries Elementor's name. It is `hidden: true` on every panel
 * now and it already stores the price table's own keys, so when the lander
 * deletes it the upgrade is a kind rename and nothing else. See the handoff.
 */
import type { Widget } from "../../../model";
import { esc, type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
/* ONE currency table on the platform, and it is `widgets/card.ts`'s — the
   widget that has drawn a price with a symbol in front of it since D-156.
   A second list in this folder would be a second answer to "what goes before
   the number", and the first one to fall behind. */
import { CURRENCY_SYMBOLS, currencyGlyph, priceWithoutSymbol } from "../../card";
import { run, say } from "./run";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** One row of Elementor's `features_list` repeater. */
export interface PriceTableFeature {
  item_text?: string;
}

/** The repeater, always an array, whatever a stored document holds. */
export function featureRows(props: Record<string, unknown> | null | undefined): PriceTableFeature[] {
  const raw = (props as any)?.features_list;
  return Array.isArray(raw) ? raw : [];
}

/**
 * The price, split the way Elementor's own widget splits it.
 *
 * `currency_format: ","` is Elementor's "1,234.56" option and the empty string
 * is "1.234,56"; the only thing the split has to get right for a renderer is
 * which run is the fractional part, because Elementor draws it smaller and
 * raised. A price with no separator at all ("from 525") has no fractional part
 * and is drawn whole, which is the honest answer rather than a guess.
 */
export function splitPrice(price: unknown, format: unknown): { whole: string; fraction: string } {
  const text = str(price).trim();
  const sep = str(format) === "," ? "." : ",";
  const at = text.lastIndexOf(sep);
  if (at < 0 || at === text.length - 1) return { whole: text, fraction: "" };
  const fraction = text.slice(at + 1);
  if (!/^\d{1,2}$/.test(fraction)) return { whole: text, fraction: "" };
  return { whole: text.slice(0, at), fraction };
}

/* ══════════════════════════════════════════════════════════════════════════
   The renderer — Elementor's default Price Table, drawn plainly
   ══════════════════════════════════════════════════════════════════════════ */

export function renderPriceTable(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const editing = ctx.mode === "edit";

  const glyph = currencyGlyph(p);
  const { whole, fraction } = splitPrice(priceWithoutSymbol(str(p.price), glyph), p.currency_format);
  const sale = p.sale === true || p.sale === "yes";
  const original = str(p.original_price).trim();
  const period = str(p.period).trim();
  const align = alignOf(p.features_list_alignment);
  /** Elementor's `currency_format: ","` means "1,234.56", so the pennies mark is a dot. */
  const fractionMark = str(p.currency_format) === "," ? "." : ",";
  const rows: string[] = [];

  /* THE RIBBON IS A ROW, NOT A CORNER FLAG.
     Elementor rotates a banner over the card's corner with `transform`, which
     Outlook draws through Word and loses. One full-width row says the same
     thing in every client and on paper. */
  if (p.show_ribbon === true || p.show_ribbon === "yes") {
    rows.push(`<tr><td align="center" style="background:${esc(str(p.ribbon_bg_color) || ctx.accent || "#0C4A60")};`
      + `color:${esc(str(p.ribbon_text_color) || "#FFFFFF")};font-size:11px;font-weight:700;letter-spacing:.06em;`
      + `text-transform:uppercase;padding:5px 12px;">`
      + run("ribbon_title", p.ribbon_title, "Popular", "margin:0;", ctx, "span") + `</td></tr>`);
  }

  const headTag = /^h[2-6]$/.test(str(p.heading_tag)) ? str(p.heading_tag) : "div";
  const head = run("heading", p.heading, "Enter your title",
    `margin:0;font-size:18px;font-weight:700;color:${esc(str(p.heading_color) || ctx.ink || "#111827")};`, ctx, headTag)
    + run("sub_heading", p.sub_heading, "Enter your description",
      "margin:4px 0 0 0;font-size:13px;color:#6B7280;", ctx);
  if (head) {
    rows.push(`<tr><td align="center" style="background:${esc(str(p.header_bg_color) || "#F8FAFC")};padding:16px 18px;">${head}</td></tr>`);
  }

  const priceRun = run("price", whole, "39.99",
    `display:inline;margin:0;font-size:28px;font-weight:700;color:${esc(str(p.price_color) || ctx.ink || "#111827")};`, ctx, "span");
  const periodRun = run("period", period, "Monthly", "display:inline;font-size:13px;color:#64748B;", ctx, "span");
  if (priceRun || periodRun) {
    rows.push(`<tr><td align="center" style="background:${esc(str(p.pricing_element_bg_color) || "#FFFFFF")};padding:18px;">`
      + (glyph ? `<span style="font-size:18px;">${esc(glyph)}</span>` : "")
      + priceRun
      /* THE SEPARATOR STAYS WITH THE PENNIES. Elementor raises a bare "00";
         `textFromMarkup` then reads the price as "$1,25000" in the plain-text
         part of an email, which is a different number. Keeping the mark in the
         smaller run costs nothing on screen and is honest in words. */
      + (fraction ? `<span style="font-size:16px;">${esc(fractionMark)}${esc(fraction)}</span>` : "")
      + (periodRun ? `&nbsp;${periodRun}` : "")
      + (sale && original ? say(`${glyph}${original}`, "font-size:13px;color:#94A3B8;text-decoration:line-through;", ctx) : "")
      + `</td></tr>`);
  }

  /* ONE ROW MORE WHILE EDITING, so a list can be added to.
     `setPropPath` (model.ts) creates the index the moment the author types in
     it, which is how every repeating run on this platform grows. A read-only
     copy shows exactly what was typed and no empty bullet. */
  const feats = featureRows(p);
  const shown = editing ? [...feats, { item_text: "" }] : feats;
  const items = shown
    .map((row, i) => run(`features_list.${i}.item_text`, str(row?.item_text), "List Item",
      "margin:0;padding:3px 0;font-size:13px;line-height:1.6;", ctx, "div"))
    .filter(Boolean)
    .join("");
  if (items) {
    rows.push(`<tr><td align="${esc(align)}" style="background:${esc(str(p.features_list_bg_color) || "#FFFFFF")};`
      + `color:${esc(str(p.features_list_color) || "#334155")};padding:0 18px 8px 18px;text-align:${esc(align)};">${items}</td></tr>`);
  }

  const buttonText = str(p.button_text);
  const button = buttonText.trim() || editing
    ? run("button_text", buttonText, "Click Here",
      `display:inline-block;padding:9px 18px;border-radius:6px;background:${
        esc(str(p.button_background_color) || ctx.accent || "#0C4A60")};color:${
        esc(str(p.button_text_color) || "#FFFFFF")};font-weight:600;`, ctx, "span")
    : "";
  const note = run("footer_additional_info", p.footer_additional_info, "Additional Info",
    "margin:8px 0 0 0;font-size:11px;color:#6B7280;", ctx);
  if (button || note) {
    /* The button gets its own block, so the words after it start a new line in
       the plain-text part rather than running into it ("Choose this planPrices
       hold for 30 days." — seen in the golden fixture before this). */
    rows.push(`<tr><td align="center" style="background:${esc(str(p.footer_bg_color) || "#FFFFFF")};padding:14px 18px;">`
      + (button ? `<div>${button}</div>` : "") + note + `</td></tr>`);
  }

  if (!rows.length) return "";
  /* TABLES AND INLINE STYLES, on every surface.
     Three of this family's four widgets are offered in the newsletter and the
     email adapter's guard refuses flex, grid, stylesheets and classes. One
     renderer that is safe everywhere beats two that can drift. */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" `
    + `style="border-collapse:collapse;border:1px solid #E2E8F0;border-radius:8px;">${rows.join("")}</table>`;
}

/** Elementor's `features_list_alignment` is start / center / end. */
function alignOf(v: unknown): string {
  const s = str(v);
  if (s === "center") return "center";
  if (s === "end") return "right";
  return "left";
}

/* ══════════════════════════════════════════════════════════════════════════
   The definition
   ══════════════════════════════════════════════════════════════════════════ */

export const PRICE_TABLE_DEF: FamilyWidgetDef = {
  kind: "price_table",
  /** ELEMENTOR'S OWN TITLE. The offer test matches the panel on this. */
  label: "Price Table",
  description: {
    proposal: "One option priced up — what it is, what it costs, what is included.",
    website: "One plan as a card: a title, a price, what is included and a button.",
    landing: "One plan as a card: a title, a price, what is included and a button.",
    email: "One plan as a card, drawn as a table so every mailbox shows it.",
  },
  icon: "CreditCard",
  picture: pictureFrom(
    box(16, 4, 32, 32) + bar(22, 9, 20, 4) + bar(24, 16, 16, 6) + bar(22, 25, 20) + bar(22, 30, 14),
  ),
  category: "General",
  builders: ["website", "landing", "newsletter", "proposal"],
  /* Elementor's own: `price-table` is in the `pro-elements` category, which is
     how the editor draws the PRO badge. WHETHER this business's site carries a
     Pro widget is the server's answer and stays there — `builder/tier.ts`. */
  tier: "pro",
  defaults: {
    /* WORDS EMPTY, STRUCTURE ELEMENTOR'S. See the header. */
    heading: "", sub_heading: "", heading_tag: "h3",
    currency_symbol: "dollar", currency_symbol_custom: "", price: "", currency_format: "",
    sale: "", original_price: "", period: "",
    features_list: [],
    button_text: "", link: "", footer_additional_info: "",
    show_ribbon: "", ribbon_title: "", ribbon_horizontal_position: "right",
  },
  controls: [
    /* ── Content ▸ Header ─────────────────────────────────────────────── */
    { key: "heading", label: "Title", type: "text", tab: "content", section: "Header" },
    { key: "sub_heading", label: "Description", type: "text", tab: "content", section: "Header" },
    {
      key: "heading_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "Header",
      options: [
        { value: "h2", label: "H2" }, { value: "h3", label: "H3" }, { value: "h4", label: "H4" },
        { value: "h5", label: "H5" }, { value: "h6", label: "H6" },
      ],
      help: "How large the title is, and how it reads to a screen reader.",
    },
    /* ── Content ▸ Pricing ────────────────────────────────────────────── */
    {
      key: "currency_symbol", label: "Currency Symbol", type: "select", tab: "content", section: "Pricing",
      options: CURRENCY_SYMBOLS.map((c) => ({ value: c.key, label: c.label })),
      help: "Drawn just before the price. Leave the first one if you type the symbol yourself.",
    },
    { key: "currency_symbol_custom", label: "Custom Symbol", type: "text", tab: "content", section: "Pricing", help: "Only used when Currency Symbol is “Something else”." },
    { key: "price", label: "Price", type: "text", tab: "content", section: "Pricing", help: "Type it as the customer should read it — 525, or “from 525”." },
    {
      key: "currency_format", label: "Currency Format", type: "select", tab: "content", section: "Pricing",
      options: [{ value: "", label: "1.234,56" }, { value: ",", label: "1,234.56" }],
      help: "Which mark separates the pennies, so the smaller run is the right one.",
    },
    { key: "sale", label: "Sale", type: "toggle", tab: "content", section: "Pricing", help: "Strike the old price out beside the new one." },
    { key: "original_price", label: "Original Price", type: "number", tab: "content", section: "Pricing", help: "Only shown while Sale is on." },
    { key: "period", label: "Period", type: "text", tab: "content", section: "Pricing", help: "Monthly, per visit, per push — whatever it is billed on." },
    /* ── Content ▸ Features ───────────────────────────────────────────── */
    { key: "features_list", label: "Features", type: "list", tab: "content", section: "Features", help: "Typed on the page. The empty line at the bottom adds another." },
    /* ── Content ▸ Footer ─────────────────────────────────────────────── */
    { key: "button_text", label: "Button Text", type: "text", tab: "content", section: "Footer", help: "Leave it empty for no button." },
    { key: "link", label: "Link", type: "link", tab: "content", section: "Footer" },
    { key: "footer_additional_info", label: "Additional Info", type: "textarea", tab: "content", section: "Footer" },
    /* ── Content ▸ Ribbon ─────────────────────────────────────────────── */
    { key: "show_ribbon", label: "Show", type: "toggle", tab: "content", section: "Ribbon", help: "A banner across the top corner." },
    { key: "ribbon_title", label: "Title", type: "text", tab: "content", section: "Ribbon" },
    {
      key: "ribbon_horizontal_position", label: "Position", type: "select", tab: "content", section: "Ribbon",
      options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }],
    },
    /* ── Style, Elementor's five sections and its own labels ──────────── */
    { key: "header_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Header" },
    { key: "heading_color", label: "Color", type: "colour", tab: "style", section: "Header" },
    { key: "heading_typography_font_size", label: "Size", type: "number", tab: "style", section: "Header", responsive: true },
    { key: "pricing_element_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Pricing" },
    { key: "price_color", label: "Color", type: "colour", tab: "style", section: "Pricing" },
    { key: "price_typography_font_size", label: "Size", type: "number", tab: "style", section: "Pricing", responsive: true },
    { key: "features_list_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Features" },
    { key: "features_list_color", label: "Color", type: "colour", tab: "style", section: "Features" },
    {
      key: "features_list_alignment", label: "Alignment", type: "select", tab: "style", section: "Features",
      options: [{ value: "start", label: "Left" }, { value: "center", label: "Centre" }, { value: "end", label: "Right" }],
    },
    { key: "footer_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Footer" },
    { key: "button_background_color", label: "Color", type: "colour", tab: "style", section: "Footer" },
    { key: "button_text_color", label: "Text Color", type: "colour", tab: "style", section: "Footer" },
    { key: "ribbon_bg_color", label: "Background Color", type: "colour", tab: "style", section: "Ribbon" },
    { key: "ribbon_text_color", label: "Text Color", type: "colour", tab: "style", section: "Ribbon" },
  ],
};

/**
 * families/f6-money/priceList.ts — ELEMENTOR'S **Price List** (`price-list`).
 *
 * D-168 and the offer file: `price-list` is offered on website, landing,
 * newsletter and proposal. It is the menu shape — a row per thing, its name on
 * the left, a leader dot run, its price on the right, a line of description
 * under it and an optional picture beside it.
 *
 * ── EVERY NAME HERE IS ELEMENTOR'S OWN ────────────────────────────────────
 * From `BUILDER_WIDGET_CATALOG_2026-09-17.pro.json`:
 *
 *   title      "Price List"              icon  eicon-price-list
 *   Content    List  →  price_list (repeater "List Items"), title_tag,
 *                       description_tag, image_size_size
 *   repeater   title · price · item_description · image · link
 *   Style      List · Content · Image
 *
 * ── IT IS NOT THE QUOTE'S LINE ITEMS, AND MUST NOT BECOME THEM ────────────
 * Product Line Items is the IA twin of this widget and belongs to the DEMO
 * agent's `families/ia` folder: it reads the OLIVER catalogue and it feeds
 * Totals. This one is the plain Elementor widget — the author types the rows —
 * and it deliberately does NOT sum, because a list of prices that quietly adds
 * itself up is the "comparison cards never sum" defect under a new name.
 */
import type { Widget } from "../../../model";
import { esc } from "../../../esc";
import { type RenderContext } from "../../../render";
import { bar, box, pictureFrom } from "../../../pictures";
import { run } from "./run";
import type { FamilyWidgetDef } from "../types";

const str = (v: unknown): string => (v == null ? "" : String(v));

/** One row of Elementor's `price_list` repeater. */
export interface PriceListRow {
  title?: string;
  price?: string;
  item_description?: string;
  image?: unknown;
  link?: unknown;
}

/** The repeater, always an array, whatever a stored document holds. */
export function priceRows(props: Record<string, unknown> | null | undefined): PriceListRow[] {
  const raw = (props as any)?.price_list;
  return Array.isArray(raw) ? raw : [];
}

/**
 * A repeater `image` is Elementor's media object `{ url, id, size }`; a
 * document written by our own picker holds a plain string. One reader, so a
 * row drawn on the canvas and a row published to the site show the same
 * picture.
 */
export function rowImage(row: PriceListRow | null | undefined): string {
  const v: any = row?.image;
  if (typeof v === "string") return v.trim();
  return str(v?.url).trim();
}

/** The same for `link`, which Elementor stores as `{ url, is_external, … }`. */
export function rowLink(row: PriceListRow | null | undefined): string {
  const v: any = row?.link;
  if (typeof v === "string") return v.trim();
  return str(v?.url).trim();
}

/** Elementor's Title / Description HTML Tag lists, and what we will draw. */
const TAGS = ["h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "p"];
const tagOf = (v: unknown, dflt: string): string => (TAGS.includes(str(v)) ? str(v) : dflt);

/* ══════════════════════════════════════════════════════════════════════════
   The renderer
   ══════════════════════════════════════════════════════════════════════════ */

export function renderPriceList(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const editing = ctx.mode === "edit";
  const titleTag = tagOf(p.title_tag, "span");
  const descTag = tagOf(p.description_tag, "p");
  const rule = str(p.separator_style) && str(p.separator_style) !== "none"
    ? `border-bottom:1px ${esc(str(p.separator_style))} ${esc(str(p.separator_color) || "#E5E7EB")};`
    : "border-bottom:1px solid #E5E7EB;";
  const gap = Math.max(0, Number(str(p.row_gap)) || 6);

  /* ONE EMPTY ROW MORE WHILE EDITING, so the list can be added to by typing
     into it — `setPropPath` makes the index. Nothing extra is ever drawn for
     the customer. */
  const rows = priceRows(p);
  const shown = editing ? [...rows, {}] : rows;

  const body = shown.map((row, i) => {
    const title = str(row?.title);
    const price = str(row?.price);
    const desc = str(row?.item_description);
    if (!editing && !title.trim() && !price.trim() && !desc.trim()) return "";
    const img = rowImage(row);
    /* A PICTURE ALWAYS SAYS WHAT IT IS. The row's own title is the description
       a reader with images off gets; a picture with no alt is one of the email
       guard's five rules and it is right on a web page too. */
    const picture = img
      ? `<td valign="top" width="72" style="padding:${gap}px 12px ${gap}px 0;">`
        + `<img src="${esc(img)}" alt="${esc(title || "Item picture")}" width="64" `
        + `style="width:64px;border-radius:6px;display:block;" /></td>`
      : "";
    const head = `<tr>`
      + `<td valign="top" style="padding:${gap}px 0 0 0;">`
      + run(`price_list.${i}.title`, title, "Title",
        `margin:0;font-weight:600;color:${esc(str(p.heading_color) || ctx.ink || "#111827")};`, ctx, titleTag)
      + `</td>`
      + `<td valign="top" align="right" style="padding:${gap}px 0 0 0;white-space:nowrap;">`
      + run(`price_list.${i}.price`, price, "Price",
        `margin:0;font-weight:600;color:${esc(str(p.price_color) || ctx.ink || "#111827")};`, ctx, "span")
      + `</td></tr>`;
    const body2 = run(`price_list.${i}.item_description`, desc, "Description",
      `margin:2px 0 0 0;color:${esc(str(p.description_color) || "#475569")};font-size:13px;line-height:1.55;`, ctx, descTag);
    const inner = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" `
      + `style="border-collapse:collapse;">${head}`
      + (body2 ? `<tr><td colspan="2" style="padding:0 0 ${gap}px 0;">${body2}</td></tr>` : "")
      + `</table>`;
    return `<tr>${picture}<td valign="top" style="${rule}padding:0;">${inner}</td></tr>`;
  }).join("");

  if (!body) return "";
  /* TABLES AND INLINE STYLES — see priceTable.ts. Offered in the newsletter,
     so one renderer that is safe in a mailbox is the whole family's rule. */
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" `
    + `style="border-collapse:collapse;">${body}</table>`;
}

/* ══════════════════════════════════════════════════════════════════════════
   The definition
   ══════════════════════════════════════════════════════════════════════════ */

export const PRICE_LIST_DEF: FamilyWidgetDef = {
  kind: "price_list",
  /** ELEMENTOR'S OWN TITLE. */
  label: "Price List",
  description: {
    proposal: "A row per item, with its price on the right — a menu, not a total.",
    website: "A row per item, with its price on the right. Like a menu.",
    landing: "A row per item, with its price on the right. Like a menu.",
    email: "A row per item with its price on the right, drawn as a table for mailboxes.",
  },
  icon: "ReceiptText",
  picture: pictureFrom(
    box(6, 6, 52, 28) + bar(11, 12, 22) + bar(45, 12, 8) + bar(11, 20, 26) + bar(45, 20, 8)
    + bar(11, 27, 18) + bar(45, 27, 8),
  ),
  category: "General",
  builders: ["website", "landing", "newsletter", "proposal"],
  tier: "pro",
  defaults: {
    price_list: [],
    title_tag: "span",
    description_tag: "p",
    image_size_size: "thumbnail",
  },
  controls: [
    /* ── Content ▸ List ───────────────────────────────────────────────── */
    { key: "price_list", label: "List Items", type: "list", tab: "content", section: "List", help: "Typed on the page. The empty row at the bottom adds another." },
    {
      key: "title_tag", label: "Title HTML Tag", type: "select", tab: "content", section: "List",
      options: TAGS.map((t) => ({ value: t, label: t.toUpperCase() })),
      help: "How the name of each item reads to a screen reader.",
    },
    {
      key: "description_tag", label: "Description HTML Tag", type: "select", tab: "content", section: "List",
      options: TAGS.map((t) => ({ value: t, label: t.toUpperCase() })),
    },
    {
      key: "image_size_size", label: "Image Resolution", type: "select", tab: "content", section: "List",
      options: [
        { value: "thumbnail", label: "Thumbnail" }, { value: "medium", label: "Medium" },
        { value: "medium_large", label: "Medium Large" }, { value: "large", label: "Large" },
        { value: "full", label: "Full" },
      ],
      help: "Which size of the picture the published page asks for.",
    },
    /* ── Style, Elementor's three sections and its own labels ─────────── */
    { key: "row_gap", label: "Space Between", type: "number", tab: "style", section: "List", responsive: true },
    {
      key: "vertical_align", label: "Vertical Align", type: "select", tab: "style", section: "List", responsive: true,
      options: [{ value: "top", label: "Top" }, { value: "center", label: "Middle" }, { value: "bottom", label: "Bottom" }],
    },
    { key: "heading_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "price_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "description_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    {
      key: "separator_style", label: "Style", type: "select", tab: "style", section: "Content",
      options: [
        { value: "none", label: "None" }, { value: "solid", label: "Solid" },
        { value: "dotted", label: "Dotted" }, { value: "dashed", label: "Dashed" },
        { value: "double", label: "Double" },
      ],
    },
    { key: "separator_color", label: "Color", type: "colour", tab: "style", section: "Content" },
    { key: "image_spacing", label: "Image Spacing", type: "number", tab: "style", section: "Image", responsive: true },
  ],
};

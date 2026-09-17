/**
 * builder/totals.ts — what the document costs. One answer, computed once.
 *
 * ── THE TWO RULES ─────────────────────────────────────────────────────────
 *
 * 1. CARDS NEVER SUM.
 *    A card shows an OPTION and the customer buys one. Summing them changes
 *    what the customer is agreeing to pay without anybody typing a number.
 *    `PRICED_KINDS` is the allow-list; `card`, `catalog_card`, the old
 *    `comparison_cards` and `pricing_table` are not in it, and
 *    `test/builder-totals.test.mjs` mutates the list to prove the guard is
 *    load-bearing. "Use this plan" on a card is what turns an offer into a
 *    `price_line`, which is money.
 *
 * 2. ONE TOTAL, PER-SITE SUBTOTALS.
 *    A multi-site proposal gives each property block its own subtotal and the
 *    document one total. A site's lines are counted in its subtotal and in the
 *    total EXACTLY ONCE — `lineTotals()` walks each widget once, so there is no
 *    second pass to forget.
 *
 * Pure, and the same arithmetic the API's lib/documentModel.js does, pinned by
 * the shared fixture test/fixtures/document-render-cases.json in both repos.
 */
import type { BuilderDocument, Widget } from "./model";
import { walkWidgets } from "./model";

/**
 * The widget kinds whose money is real.
 *
 * A pricing TABLE is a rate card — "$185 per push", "quoted per event" — and a
 * rate card has no total; the Rolling In It agreement is nine pages of rate
 * card and zero dollars owed on signing. Only these two kinds are money.
 */
export const PRICED_KINDS = ["price_line", "priced_line", "property_block"] as const;

export interface LineTotal {
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  recommended: boolean;
  /** Which property block this line belongs to, when it is inside one. */
  locationId?: string;
  offering_id?: string;
  price_id?: string;
  cadence?: string | null;
}

export interface SiteTotal {
  locationId: string;
  name: string;
  subtotal: number;
  lines: LineTotal[];
}

export interface DocumentTotals {
  lines: LineTotal[];
  /** One entry per property block, in document order. */
  sites: SiteTotal[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Every priced line in the document, in reading order.
 *
 * `before` stops at a widget id and does not include it — that is how a
 * `totals` widget adds up "the priced lines above me" (D-157: *"a total
 * section … add totals"*). A document with one total at the bottom is
 * unchanged by it, which is every document we have shipped.
 */
export function lineTotals(doc: BuilderDocument, before?: string): LineTotal[] {
  const out: LineTotal[] = [];
  for (const { widget, section } of walkWidgets(doc)) {
    if (before && widget.id === before) break;
    // An internal-only section is a note to the crew, not part of the price.
    if (section.visibility !== "customer") continue;
    out.push(...widgetLines(widget));
  }
  return out;
}

function widgetLines(widget: Widget): LineTotal[] {
  if (widget.kind === "price_line" || widget.kind === "priced_line") {
    const p: any = widget.props;
    const quantity = num(p.quantity, 1);
    const unit = num(p.unit_price, 0);
    const base = String(p.name || p.description || "").trim();
    if (!base) return [];
    return [{
      description: p.cadence && !base.includes(p.cadence) ? `${base} (${p.cadence})` : base,
      quantity, unit_price: unit, line_total: round2(quantity * unit),
      recommended: !!p.recommended,
      ...(p.offering_id ? { offering_id: String(p.offering_id) } : {}),
      ...(p.price_id ? { price_id: String(p.price_id) } : {}),
      cadence: p.cadence ?? null,
    }];
  }
  if (widget.kind === "property_block") {
    const p: any = widget.props;
    const locationId = p.locationId ? String(p.locationId) : undefined;
    return (Array.isArray(p.items) ? p.items : [])
      .filter((it: any) => String(it?.description || "").trim())
      .map((it: any) => {
        const quantity = num(it.quantity, 1);
        const unit = num(it.unit_price, 0);
        return {
          description: String(it.description).trim(),
          quantity, unit_price: unit, line_total: round2(quantity * unit),
          recommended: !!it.recommended,
          ...(locationId ? { locationId } : {}),
          cadence: it.cadence ?? null,
        } as LineTotal;
      });
  }
  // Everything else — including comparison_cards and pricing_table — is prose
  // or a rate card. See rule 1.
  return [];
}

/** Per-property subtotals, in the order the property blocks appear. */
export function siteTotals(doc: BuilderDocument, before?: string): SiteTotal[] {
  const sites: SiteTotal[] = [];
  for (const { widget, section } of walkWidgets(doc)) {
    if (before && widget.id === before) break;
    if (section.visibility !== "customer") continue;
    if (widget.kind !== "property_block") continue;
    const p: any = widget.props;
    const lines = widgetLines(widget);
    sites.push({
      locationId: String(p.locationId || ""),
      name: String(p.heading || p.locationName || "This property"),
      subtotal: round2(lines.reduce((s, l) => s + l.line_total, 0)),
      lines,
    });
  }
  return sites;
}

/**
 * The document's money.
 *
 * `taxRate` is a fraction (0.07), matching oliver.proposal's own contract, and
 * `discount` is an amount in dollars.
 */
export function documentTotals(
  doc: BuilderDocument,
  { taxRate = 0, discount = 0 }: { taxRate?: number; discount?: number } = {},
): DocumentTotals {
  const lines = lineTotals(doc);
  const sites = siteTotals(doc);
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const tax = round2(subtotal * num(taxRate, 0));
  const disc = round2(num(discount, 0));
  return { lines, sites, subtotal, tax, discount: disc, total: Math.max(0, round2(subtotal + tax - disc)) };
}

/* ══════════════════════════════════════════════════════════════════════════
   THE TOTALS WIDGET'S OWN SETTINGS (D-157)
   ══════════════════════════════════════════════════════════════════════════

   Brandon: *"a total section … add totals … subtotal, tax rate,
   discounts/coupons"*.

   THE SETTINGS LIVE ON THE WIDGET, not on the proposal row and not in a
   lookup the renderer does. Three surfaces draw this document — the canvas,
   the customer's page and the PDF — and only one of them is holding the
   business's tax table or the coupon table. A rate that had to be fetched
   would be right on the canvas and blank on the page the customer signs, which
   is the exact class of defect §11.10 §2 recorded ("showed on the canvas and
   printed __________"). So when the author ticks "Add tax", the builder writes
   the business's own rate onto the widget, and when they enter a coupon code
   the builder writes what that coupon is worth onto the widget. The document
   carries its own arithmetic and every surface agrees.

   THE ORDER IS THE PLATFORM'S EXISTING ORDER: tax on the subtotal, then the
   discount comes off. It is what oliver-api's `computeTotals` has always done
   and what every stored proposal was totalled with; a "better" order here
   would quietly restate money on documents that are already signed. */

export interface TotalsCoupon {
  code: string;
  /** Per cent off the subtotal. Use one of percentOff / amountOff. */
  percentOff?: number | null;
  /** A flat amount off, in whole currency units. */
  amountOff?: number | null;
}

export interface TotalsSettings {
  /**
   * WHERE THE RATE CAME FROM (catalogue F.1.3 `tax_mode`).
   *
   * `business` — the business's own default; the builder refreshes the number
   *              from it every time the document is opened, so a rate that
   *              changes reaches the drafts that have not gone out yet.
   * `document` — this document's own rate, typed here, and it does not move.
   * `none`     — no tax on this document.
   *
   * The NUMBER is written onto the widget whichever mode it is, because the
   * customer's page and the PDF are drawn by a server holding no tax table.
   * The mode says whether to keep it up to date; it never replaces it.
   */
  taxMode: "business" | "document" | "none";
  /** Per cent. null = this document does not show tax at all. */
  taxRatePercent: number | null;
  /** What the rate is called where it came from — "Ohio state + Franklin". */
  taxLabel: string;
  /** A straight per-cent discount the author typed. */
  discountPercent: number;
  coupon: TotalsCoupon | null;
}

export interface WidgetTotals extends DocumentTotals {
  settings: TotalsSettings;
  /** The discount the per-cent box produced, separately from the coupon's. */
  discountFromPercent: number;
  discountFromCoupon: number;
}

/** The settings on a `totals` widget, read tolerantly. */
export function totalsSettings(props: Record<string, unknown> | undefined | null): TotalsSettings {
  const p: any = props || {};
  const rate = p.taxRatePercent;
  const rawCoupon = p.coupon;
  const coupon: TotalsCoupon | null = rawCoupon && typeof rawCoupon === "object" && String(rawCoupon.code || "").trim()
    ? {
      code: String(rawCoupon.code).trim(),
      percentOff: Number.isFinite(Number(rawCoupon.percentOff)) ? Number(rawCoupon.percentOff) : null,
      amountOff: Number.isFinite(Number(rawCoupon.amountOff)) ? Number(rawCoupon.amountOff) : null,
    }
    : null;
  const taxRatePercent = rate == null || rate === "" || !Number.isFinite(Number(rate)) ? null : Number(rate);
  const declared = p.taxMode;
  return {
    // A document written before the mode existed says what it does: it has a
    // rate, so the rate is this document's own.
    taxMode: declared === "business" || declared === "document" || declared === "none"
      ? declared
      : (taxRatePercent == null ? "none" : "document"),
    taxRatePercent,
    taxLabel: String(p.taxLabel ?? "").trim(),
    discountPercent: num(p.discountPercent, 0),
    coupon,
  };
}

/**
 * What THIS totals widget says.
 *
 * Counts the priced lines ABOVE it, applies its own tax rate, its own per-cent
 * discount and its own coupon. Pure; the same function runs in the Portal, on
 * the customer's page and — mirrored line for line — in oliver-api.
 */
export function widgetTotals(
  doc: BuilderDocument,
  widgetId: string,
  props?: Record<string, unknown>,
  /**
   * What the PROPOSAL ROW says, for a document written before the widget
   * carried its own settings. Used only where the widget declares nothing, so
   * an agreement saved last week still prints the tax it was totalled with,
   * and the first thing the author types in the Totals panel wins from then
   * on. This is the whole of the back-compatibility story and it is four
   * lines, because the settings are a document fact everywhere else.
   */
  fallback?: { taxRatePercent?: number | null; discountAmount?: number | null },
): WidgetTotals {
  const own = totalsSettings(props);
  const declaresNothing = own.taxRatePercent == null && !own.discountPercent && !own.coupon;
  const settings: TotalsSettings = declaresNothing && fallback
    ? {
      ...own,
      taxRatePercent: Number(fallback.taxRatePercent) ? Number(fallback.taxRatePercent) : own.taxRatePercent,
    }
    : own;
  const legacyDiscount = declaresNothing && fallback ? round2(num(fallback.discountAmount, 0)) : 0;
  const lines = lineTotals(doc, widgetId);
  const sites = siteTotals(doc, widgetId);
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const tax = round2(subtotal * ((settings.taxRatePercent ?? 0) / 100));
  const discountFromPercent = round2(subtotal * (num(settings.discountPercent, 0) / 100));
  const c = settings.coupon;
  const discountFromCoupon = round2(
    c ? (c.percentOff ? subtotal * (num(c.percentOff, 0) / 100) : num(c.amountOff, 0)) : 0,
  );
  const discount = round2(discountFromPercent + discountFromCoupon + legacyDiscount);
  return {
    lines, sites, subtotal, tax, discount,
    total: Math.max(0, round2(subtotal + tax - discount)),
    settings, discountFromPercent, discountFromCoupon: round2(discountFromCoupon + legacyDiscount),
  };
}

/**
 * The LAST totals widget in the document — the one that governs the row.
 *
 * A document can carry several (a running total per property, then one at the
 * end). The proposal ROW holds one tax rate and one discount amount, and they
 * are the document's, so they come from the last one. Null when there is none,
 * which is when the row keeps whatever it already had.
 */
export function lastTotalsWidget(doc: BuilderDocument): Widget | null {
  let found: Widget | null = null;
  for (const { widget, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    if (widget.kind === "totals") found = widget;
  }
  return found;
}

/**
 * What the proposal ROW should store, read off the document.
 *
 * ONE MECHANISM: the author sets tax and discount on the Totals widget, and
 * the columns `oliver.proposal.tax_rate` / `discount_amount` follow from it.
 * The alternative — a second pair of boxes somewhere in the chrome — is two
 * places one number lives, which is how the canvas and the invoice come to
 * disagree. Returns null when no totals widget declares anything, so a
 * document written before this keeps the values already on its row.
 */
export function documentMoneySettings(doc: BuilderDocument): { taxRate: number; discount: number } | null {
  const w = lastTotalsWidget(doc);
  if (!w) return null;
  const s = totalsSettings(w.props);
  if (s.taxRatePercent == null && !s.discountPercent && !s.coupon) return null;
  const t = widgetTotals(doc, w.id, w.props);
  return { taxRate: (s.taxRatePercent ?? 0) / 100, discount: t.discount };
}

/** `$1,234.00` — the one money format the document uses. */
export function money(n: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

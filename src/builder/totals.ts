/**
 * builder/totals.ts — what the document costs. One answer, computed once.
 *
 * ── THE TWO RULES ─────────────────────────────────────────────────────────
 *
 * 1. COMPARISON CARDS NEVER SUM.
 *    A tier comparison shows several options and the customer buys ONE.
 *    Summing them changes what the customer is agreeing to pay without anybody
 *    typing a number. `PRICED_KINDS` is the allow-list, `comparison_cards` is
 *    not in it, and `test/builder-totals.test.mjs` mutates the list to prove
 *    the guard is load-bearing.
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
export const PRICED_KINDS = ["priced_line", "property_block"] as const;

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

/** Every priced line in the document, in reading order. */
export function lineTotals(doc: BuilderDocument): LineTotal[] {
  const out: LineTotal[] = [];
  for (const { widget, section } of walkWidgets(doc)) {
    // An internal-only section is a note to the crew, not part of the price.
    if (section.visibility !== "customer") continue;
    out.push(...widgetLines(widget));
  }
  return out;
}

function widgetLines(widget: Widget): LineTotal[] {
  if (widget.kind === "priced_line") {
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
export function siteTotals(doc: BuilderDocument): SiteTotal[] {
  const sites: SiteTotal[] = [];
  for (const { widget, section } of walkWidgets(doc)) {
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

/** `$1,234.00` — the one money format the document uses. */
export function money(n: number, currency = "USD"): string {
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

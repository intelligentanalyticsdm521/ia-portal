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
import type { BuilderDocument, Container, Node, Widget } from "./model";
import { walkNodes, walkWidgets } from "./model";
import { isContainer } from "./treeOps";
import { selectionOf } from "./widgets/binding";

/**
 * The widget kinds whose money is real.
 *
 * A pricing TABLE is a rate card — "$185 per push", "quoted per event" — and a
 * rate card has no total; the Rolling In It agreement is nine pages of rate
 * card and zero dollars owed on signing. Only these two kinds are money.
 */
/* `property_block` was on this list and is GONE (D-156): a property is a BOX
   holding priced lines, so its money is on the lines themselves and which
   property they belong to is read off the box their address block sits in. */
export const PRICED_KINDS = ["price_line", "priced_line"] as const;

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

/** A number, or null when nothing was said. `0` is a real answer. */
function num2(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  const { of } = sitesInTree(doc);
  const out: LineTotal[] = [];
  for (const { widget, section } of walkWidgets(doc)) {
    if (before && widget.id === before) break;
    // An internal-only section is a note to the crew, not part of the price.
    if (section.visibility !== "customer") continue;
    // A line inside a property box carries that property's id, exactly as a
    // line inside the old composite did.
    const site = of.get(widget.id);
    for (const line of widgetLines(widget)) {
      out.push(site?.locationId && !line.locationId ? { ...line, locationId: site.locationId } : line);
    }
  }
  return out;
}

function widgetLines(widget: Widget): LineTotal[] {
  if (widget.kind === "price_line" || widget.kind === "priced_line") {
    const p: any = widget.props;
    const sel = selectionOf(p);
    const quantity = num(p.quantity, 1);
    const unit = num(p.unit_price, 0);
    const base = String(p.name || p.description || "").trim();
    if (!base) return [];
    return [{
      description: p.cadence && !base.includes(p.cadence) ? `${base} (${p.cadence})` : base,
      quantity, unit_price: unit, line_total: round2(quantity * unit),
      recommended: !!p.recommended,
      /* WHICH CATALOGUE ROW — through the ONE reader (`widgets/binding.ts`).
         These two used to be read straight off `p.offering_id` / `p.price_id`,
         which was one of the four places a selection was kept; the Binding
         section is one key now (`_ia_selection`) and `selectionOf` reads it
         plus every older spelling. The wire's `service_offering_id` and
         `service_price_id` come off THIS, so reading it any other way here is
         how an accepted proposal stops converting to a quote. */
      ...(sel.offeringId ? { offering_id: sel.offeringId } : {}),
      ...(sel.priceId ? { price_id: sel.priceId } : {}),
      cadence: p.cadence ?? null,
    }];
  }
  /* The `property_block` branch LIVED HERE and is DELETED (D-156). Its items
     are `price_line` widgets now — real money, each its own widget — and which
     property they belong to is read off the box their address block sits in.
     See `sitesInTree`. */
  // Everything else — including a card and a pricing table — is prose or a
  // rate card. See rule 1.
  return [];
}

/**
 * A BOX THAT HOLDS AN ADDRESS IS A PROPERTY (integration, D-156).
 *
 * Rule 2 used to have exactly one shape to look for — the `property_block`
 * composite, which held the address and the lines together. D-156 takes that
 * lump apart, so the question "which property is this line for?" has to be
 * asked of the TREE: the nearest enclosing box that has an `address_block`
 * among its children is the property, and every priced line inside it belongs
 * to it. That is the same fact the composite carried, read off the shape the
 * author can now see and rearrange.
 *
 * A document with no boxes and no address blocks produces an empty map, and
 * then there are no per-property subtotals — which is exactly what a
 * single-site proposal has always had.
 *
 * Returned: widget id → the property it sits in, plus the properties in the
 * order they appear.
 */
interface SiteBox { boxId: string; locationId: string; name: string; order: number }

function sitesInTree(doc: BuilderDocument): { of: Map<string, SiteBox>; boxes: SiteBox[] } {
  const boxes: SiteBox[] = [];
  const of = new Map<string, SiteBox>();
  walkNodes(doc, (hit) => {
    if (!isContainer(hit.node)) return;
    const box = hit.node as Container;
    /* WHICH KIND MARKS A PROPERTY BOX — BOTH SPELLINGS (D-165).
       `address_block` is deleted from the panel and `upgrade.ts` turns every
       stored one into `service_location` (or `customer`, by its binding), but
       the email and landing renderers still hold the old kind and a document
       can reach the totals without passing through `deserialise`. Reading both
       is the same "one renderer, two spellings" `price_line` / `priced_line`
       already uses, and it is what stops a per-property subtotal silently
       becoming zero on the day the rename lands.

       `customer` is NOT a property box: it is who the document is FOR, and
       claiming the lines under it would put a site's money on the payer. */
       Mirrored in oliver-api's lib/documentModel.js `sitesInTree`. */
    const address = box.children.find(
      (k) => k.kind === "service_location" || k.kind === "address_block");
    if (!address) return;
    const ap: any = address.props || {};
    const headingChild: Node | undefined = box.children.find((k) => k.kind === "heading");
    const name = String(
      (headingChild?.props as any)?.text || ap.heading || ap.name || "This property",
    ).trim() || "This property";
    const site: SiteBox = {
      boxId: box.id,
      locationId: String(ap.locationId || ""),
      name,
      order: boxes.length,
    };
    boxes.push(site);
    // Claim every descendant. The OUTERMOST box wins, because `walkNodes` is
    // reading order and an inner box would otherwise re-label lines the author
    // put under one address.
    const claim = (kids: Node[]) => {
      for (const k of kids) {
        if (!of.has(k.id)) of.set(k.id, site);
        if (isContainer(k)) claim((k as Container).children);
      }
    };
    claim(box.children);
  });
  return { of, boxes };
}

/** Per-property subtotals, in the order the properties appear. */
export function siteTotals(doc: BuilderDocument, before?: string): SiteTotal[] {
  const { of, boxes } = sitesInTree(doc);
  const lines = new Map<string, LineTotal[]>();
  for (const { widget, section } of walkWidgets(doc)) {
    if (before && widget.id === before) break;
    if (section.visibility !== "customer") continue;
    const site = of.get(widget.id);
    if (!site) continue;
    const own = widgetLines(widget);
    if (!own.length) continue;
    const bucket = lines.get(site.boxId);
    if (bucket) bucket.push(...own);
    else lines.set(site.boxId, [...own]);
  }
  // A property with no priced lines in it is a description, not a subtotal.
  const fromTree = boxes
    .filter((b) => (lines.get(b.boxId) || []).length)
    .map((b) => {
      const own = lines.get(b.boxId)!;
      return {
        locationId: b.locationId,
        name: b.name,
        subtotal: round2(own.reduce((s, l) => s + l.line_total, 0)),
        lines: own,
      };
    });
  return fromTree;
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
  /**
   * WHAT THE AUTHOR TYPED on this document, kept whatever the mode is.
   *
   * Switching to "No tax" must not throw the number away: the author who
   * switches back expects it, and a control that silently forgets is a
   * control you cannot undo. Mirrors oliver's `totalsSettings` (stream O).
   */
  taxRateDocument: number | null;
  /**
   * TRUE when this document says "use the business default" and no rate ever
   * resolved — i.e. `tax_mode: "business"` with no `tax_rate_resolved`.
   *
   * It is the one case the sentence beside the widget is for. This used to be
   * the audit's point 5: the mode was a stored word that resolved to nothing,
   * so a proposal saying "taxed at the business default" was taxed at zero
   * and nothing anywhere said so. The server writes `tax_rate_resolved` ONCE
   * on send (oliver `routes/proposals.js`); until then the canvas can show the
   * live figure, and when there is none it shows the sentence.
   */
  taxUnresolved: boolean;
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
  /**
   * The property this total belongs to, when it sits INSIDE one (D-156).
   *
   * The old `property_block` printed one line — "Subtotal for this property" —
   * and that is what a total inside a property box still is. Null for a total
   * that is not in one, which is every document-level total and therefore
   * every document written before boxes existed.
   */
  scopedTo: { locationId: string; name: string } | null;
}

/** The settings on a `totals` widget, read tolerantly. */
export function totalsSettings(props: Record<string, unknown> | undefined | null): TotalsSettings {
  const p: any = props || {};
  /* THE CANONICAL NAMES ARE `tax_mode` / `tax_rate` / `tax_rate_resolved`
     (shared vocabulary (c), agreed with stream O 2026-09-17, and the names
     oliver's mirror reads). `taxMode` / `taxRatePercent` are what this widget
     wrote for a day and are still READ; nothing writes them.

     `tax_rate_resolved` is the SERVER's, written once on send, and the widget
     must never write it — a figure a customer has seen cannot move. */
  const document = num2(p.tax_rate ?? p.taxRatePercent);
  const resolved = num2(p.tax_rate_resolved);
  const declared = p.tax_mode ?? p.taxMode;
  const mode: TotalsSettings["taxMode"] =
    declared === "business" || declared === "document" || declared === "none"
      ? declared
      // A document written before the mode existed says what it does: it has a
      // rate, so the rate is this document's own.
      : (document == null ? "none" : "document");
  // In BUSINESS mode the number is the server's resolved one, or the live
  // figure the adapter poured into `tax_rate` from `GET /settings`. In
  // DOCUMENT mode it is what the author typed. In NONE there is no tax row.
  const rate = mode === "none" ? null : (mode === "business" ? (resolved ?? document) : document);
  const rawCoupon = p.coupon;
  const coupon: TotalsCoupon | null = rawCoupon && typeof rawCoupon === "object" && String(rawCoupon.code || "").trim()
    ? {
      code: String(rawCoupon.code).trim(),
      percentOff: Number.isFinite(Number(rawCoupon.percentOff)) ? Number(rawCoupon.percentOff) : null,
      amountOff: Number.isFinite(Number(rawCoupon.amountOff)) ? Number(rawCoupon.amountOff) : null,
    }
    : null;
  return {
    taxMode: mode,
    taxRatePercent: rate,
    taxRateDocument: document,
    // `null` and `0` ARE DIFFERENT ANSWERS and must not be collapsed: 0 is
    // "this business charges no sales tax", null is "nobody has said".
    taxUnresolved: mode === "business" && rate == null,
    taxLabel: String(p.tax_label ?? p.taxLabel ?? "").trim(),
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
  // A TOTAL INSIDE A PROPERTY BOX IS THAT PROPERTY'S SUBTOTAL (D-156).
  //
  // The composite it replaces printed exactly one line. Tax, discounts and
  // coupons are the DOCUMENT's, not a property's, so a scoped total carries
  // none of them and cannot be made to: two properties each applying the
  // document's tax would tax the job twice on the page it is signed from.
  const box = siteBoxOf(doc, widgetId);
  if (box) {
    const own = (box.lines || []).reduce((s, l) => s + l.line_total, 0);
    const subtotalOnly = round2(own);
    return {
      lines: box.lines, sites: [], subtotal: subtotalOnly, tax: 0, discount: 0,
      total: subtotalOnly,
      settings: {
        taxMode: "none", taxRatePercent: null, taxRateDocument: null,
        taxUnresolved: false, taxLabel: "", discountPercent: 0, coupon: null,
      },
      discountFromPercent: 0, discountFromCoupon: 0,
      scopedTo: { locationId: box.locationId, name: box.name },
    };
  }
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
    scopedTo: null,
  };
}

/**
 * The property box this widget sits in, with that property's own priced lines.
 *
 * Null when it is not in one. Used by a `totals` widget to answer "am I this
 * property's subtotal or the document's total?" — the same question the old
 * composite answered by holding the lines itself.
 */
export function siteBoxOf(
  doc: BuilderDocument,
  widgetId: string,
): { locationId: string; name: string; lines: LineTotal[] } | null {
  const { of } = sitesInTree(doc);
  const site = of.get(widgetId);
  if (!site) return null;
  const lines: LineTotal[] = [];
  for (const { widget, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    if (of.get(widget.id)?.boxId !== site.boxId) continue;
    lines.push(...widgetLines(widget));
  }
  return { locationId: site.locationId, name: site.name, lines };
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

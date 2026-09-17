/**
 * builder/widgets/totals.ts — THE TOTAL SECTION.
 *
 * D-157, Brandon: *"a total section … add totals … subtotal, tax rate,
 * discounts/coupons"*.
 *
 * The arithmetic is in `../totals.ts` — ONE place money is added up, shared
 * with the server. This module is what that arithmetic LOOKS like: the rows,
 * in the order anybody reading an invoice expects them, with the discount
 * naming itself ("Discount 10%", "Discount — SPRING25") rather than appearing
 * as a number with no reason beside it.
 *
 * WHY THE WIDGET ADDS UP WHAT IS ABOVE IT: a document can have a total per
 * property and then a total for the lot. Each `totals` widget counts the
 * priced lines before it, so putting a second one in is all it takes, and a
 * document with one at the bottom — every document we ship — is unchanged.
 */
import type { Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { money, widgetTotals } from "../totals";
import { editRun } from "./text";

/** One line of the block. */
function row(label: string, amount: string, cls = "", accent = ""): string {
  const style = cls === "bx-total-grand" ? ` style="border-top-color:${esc(accent)}"` : "";
  return `<div class="bx-total-row${cls ? ` ${cls}` : ""}"${style}><span>${esc(label)}</span><span>${esc(amount)}</span></div>`;
}

export function renderTotals(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  // The proposal ROW's tax and discount, for a document written before the
  // widget carried its own. `ctx.totals` was computed with them, so they are
  // read back off it rather than passed down a second channel.
  const fallback = {
    taxRatePercent: ctx.totals.subtotal ? (ctx.totals.tax / ctx.totals.subtotal) * 100 : 0,
    discountAmount: ctx.totals.discount,
  };
  // With no document in the context — a preview that hands totals in ready
  // made — fall back to the whole-document figures the caller computed.
  const t = ctx.doc
    ? widgetTotals(ctx.doc, w.id, p, fallback)
    : {
      ...ctx.totals,
      settings: {
        taxRatePercent: ctx.totals.tax ? fallback.taxRatePercent : null,
        taxLabel: "", discountPercent: 0, coupon: null,
      },
      discountFromPercent: 0,
      discountFromCoupon: ctx.totals.discount,
    };
  const s = t.settings;

  const siteRows = t.sites.map((site) => row(site.name, money(site.subtotal, ctx.currency))).join("");
  const taxLabel = s.taxRatePercent != null
    ? `Tax${s.taxRatePercent ? ` ${trimPct(s.taxRatePercent)}%` : ""}${s.taxLabel ? ` · ${s.taxLabel}` : ""}`
    : "";
  const pctRow = t.discountFromPercent
    ? row(`Discount ${trimPct(s.discountPercent)}%`, `−${money(t.discountFromPercent, ctx.currency)}`)
    : "";
  const couponRow = t.discountFromCoupon
    ? row(`Discount — ${s.coupon?.code || "coupon"}`, `−${money(t.discountFromCoupon, ctx.currency)}`)
    : "";

  return `<div class="bx-totals">
    ${editRun("heading", p.heading, "bx-h bx-h2", "Your total", ctx)}
    ${siteRows}
    ${row("Subtotal", money(t.subtotal, ctx.currency))}
    ${s.taxRatePercent != null ? row(taxLabel, money(t.tax, ctx.currency)) : ""}
    ${pctRow}
    ${couponRow}
    ${row("Total", money(t.total, ctx.currency), "bx-total-grand", ctx.accent)}
  </div>`;
}

/** 7.25 → "7.25", 7 → "7". A rate with ".00" on it reads like a mistake. */
function trimPct(n: number): string {
  const v = Math.round(Number(n || 0) * 1000) / 1000;
  return String(v);
}

export const TOTALS_DEF: WidgetDef = {
  kind: "totals",
  label: "Totals",
  description: "Adds up the priced lines above it — subtotal, tax, any discount, and the total.",
  task: "Products & services",
  icon: "Calculator",
  picture: pictureFrom(bar(8, 10, 26) + bar(44, 10, 12) + bar(8, 18, 20) + bar(44, 18, 12)
    + `<path d="M8 26h48" stroke="#94A3B8"/>` + bar(8, 30, 16) + bar(42, 30, 14, 5)),
  category: "Money",
  adapters: ["proposal"],
  defaults: { heading: "Your total", taxRatePercent: null, taxLabel: "", discountPercent: 0, coupon: null },
  // The tax rate, the per-cent discount and the coupon box are the adapter's
  // controls: only the adapter can read the business's own rate and look a
  // coupon code up. See ProposalBuilder's TotalsPanel.
  controls: [
    { key: "heading", label: "Heading", type: "text" },
  ],
};

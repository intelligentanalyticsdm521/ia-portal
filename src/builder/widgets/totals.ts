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
import { esc } from "../esc";
import type { RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { money, widgetTotals } from "../totals";
import { editRun } from "./text";
import { BINDING_CONTROLS, bindingDefaults } from "./binding";

/**
 * THE ONE SENTENCE for "this business has no tax rate", byte for byte.
 *
 * Exported from oliver `lib/taxRate.js` as `NO_BUSINESS_RATE_SENTENCE` and
 * agreed with stream O on 2026-09-17. It is typed out here rather than
 * imported because the Portal does not import from the API — but it is ONE
 * set of words, asserted against the same string in the conformance test, so a
 * client reading the canvas and a client reading a refusal read the same thing.
 */
export const NO_BUSINESS_RATE_SENTENCE =
  "No tax rate set for this business - set one under Settings > Billing";

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
        taxMode: (ctx.totals.tax ? "document" : "none") as "document" | "none",
        taxRatePercent: ctx.totals.tax ? fallback.taxRatePercent : null,
        taxRateDocument: ctx.totals.tax ? fallback.taxRatePercent : null,
        // A preview that hands its totals in ready-made has nothing to resolve
        // and nothing to warn about: the caller already did the arithmetic.
        taxUnresolved: false,
        taxLabel: "", discountPercent: 0, coupon: null,
      },
      discountFromPercent: 0,
      discountFromCoupon: ctx.totals.discount,
    };
  // INSIDE A PROPERTY BOX this is that property's subtotal and nothing else —
  // one line, the same one line the composite it replaced printed. The tax and
  // the discount belong to the DOCUMENT; printing them under each property
  // would charge the tax as many times as there are addresses.
  if ((t as any).scopedTo) {
    return `<div class="bx-site-sub">`
      + `<span${ctx.mode === "edit" ? ` data-edit="heading"` : ""}>${esc(p.heading || "Subtotal for this property")}</span>`
      + `<span class="bx-strong">${esc(money(t.subtotal, ctx.currency))}</span>`
      + `</div>`;
  }
  const s = t.settings;

  const siteRows = t.sites.map((site) => row(site.name, money(site.subtotal, ctx.currency))).join("");
  const taxLabel = s.taxRatePercent != null
    ? `Tax${s.taxRatePercent ? ` ${trimPct(s.taxRatePercent)}%` : ""}${s.taxLabel ? ` · ${s.taxLabel}` : ""}`
    : "";
  /* "NO TAX RATE SET FOR THIS BUSINESS" — the audit's point 5, said out loud.
     `tax_mode: "business"` was a stored word that resolved to nothing: a
     proposal reading "taxed at the business default" was taxed at zero and
     nothing anywhere said so. Now the widget says it, and says it only to the
     AUTHOR — a sentence on a page somebody signs has to be one they wrote, and
     the PDF and the customer's page deliberately print no tax row at all
     rather than $0.00 (oliver `lib/documentModel.js`, stream O). The words are
     `NO_BUSINESS_RATE_SENTENCE` from oliver `lib/taxRate.js`, byte for byte. */
  const unresolved = s.taxUnresolved && ctx.mode === "edit"
    ? `<div class="bx-total-warn" data-tax-unresolved="1">${esc(NO_BUSINESS_RATE_SENTENCE)}</div>`
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
    ${unresolved}
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
  icon: "Calculator",
  picture: pictureFrom(bar(8, 10, 26) + bar(44, 10, 12) + bar(8, 18, 20) + bar(44, 18, 12)
    + `<path d="M8 26h48" stroke="#94A3B8"/>` + bar(8, 30, 16) + bar(42, 30, 14, 5)),
  category: "Intelligent Analytics",
  // WHERE IT MAY BE USED (catalogue F.1): a proposal, an email and a landing
  // page — the three that carry priced lines for it to add up. NOT `website`:
  // a public page has nothing to total, and the website publish path has no
  // emitter for the kind, so a placed one could never be published.
  /* PROPOSALS ONLY (§11.13.3): Totals is in the proposal's IA column and in
     nobody else's. A newsletter does not add anything up. */
  adapters: ["proposal"],
  // Quotes, proposals and invoices are the OLIVER Invoicing tier's whole job
  // (G.4). WHETHER this business has it is still the server's answer.
  tier: "ia:oliver",
  defaults: {
    // THE CANONICAL TAX NAMES (shared vocabulary (c)). `tax_rate_resolved` is
    // the SERVER's and is never a default: the widget must not write it, or a
    // figure a customer has already seen could move.
    heading: "Your total", tax_mode: "none", tax_rate: null, tax_label: "",
    discountPercent: 0, coupon: null,
    ...bindingDefaults("document"),
  },
  // The tax rate, the per-cent discount and the coupon box are the adapter's
  // controls: only the adapter can read the business's own rate and look a
  // coupon code up. See ProposalBuilder's TotalsPanel. The Binding section is
  // the shared one — this widget's source is the DOCUMENT's own priced lines
  // (F.1.3, "it reads the document, not a table"), and saying so where every
  // other bound widget says it is the whole point of F.2.
  controls: [
    { key: "heading", label: "Heading", type: "text", section: "Totals" },
    /* THE THREE TAX STATES (catalogue F.1.3 `tax_mode`), as a control at last.
       It was a stored word with nothing to set it and nothing to resolve it. */
    {
      key: "tax_mode", label: "Tax", type: "select", section: "Tax",
      options: [
        { value: "business", label: "Your business's own rate" },
        { value: "document", label: "This document only" },
        { value: "none", label: "No tax" },
      ],
      help: "“Your business's own rate” follows Settings > Billing; “This document only” is the number you type below.",
    },
    {
      key: "tax_rate", label: "Rate for this document", type: "number", section: "Tax",
      help: "A per cent — 8.25 means 8.25%. Only used while Tax is “This document only”.",
    },
    { key: "tax_label", label: "What the rate is called", type: "text", section: "Tax", help: "Printed beside it — “Ohio state + Franklin”." },
    ...BINDING_CONTROLS,
  ],
};

/**
 * builder/widgets/priceLine.ts — ONE LINE OF MONEY.
 *
 * D-156: `priced_line` folded into `price_line`. Same job, one name, and the
 * line can now come straight out of the catalogue or be typed — which is what
 * "Product Catalog Line Items" means (D-157).
 *
 * ── THIS IS WHERE THE MONEY IS ────────────────────────────────────────────
 * `totals.ts` PRICED_KINDS lists `price_line` (and `priced_line`, until every
 * stored document has been through the upgrade). A card is an OFFER and never
 * sums; a price line is a charge and always does. That line between the two is
 * the whole reason both widgets exist.
 */
import type { Widget } from "../model";
import { esc } from "../esc";
import type { RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { money } from "../totals";
import { editRun, fillText, proseRun } from "./text";
import { hasTag, tagBorder, tagHtml } from "./tag";
import { BINDING_CONTROLS, bindingDefaults, selectionOf } from "./binding";

export interface PriceLineFields {
  name: string;
  description: string;
  bullets: string[];
  quantity: number;
  unitPrice: number;
  cadence: string | null;
  /** What ONE of them is, in the catalogue's own words: "Per 1,000 sq ft". */
  unitLabel: string;
  /** A note for the AUTHOR only. Never drawn on a page anybody is sent. */
  help: string;
  offeringId: string;
  priceId: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The line's values, reading `priced_line`'s names as well as its own. */
export function priceLineFields(props: Record<string, unknown> | undefined | null): PriceLineFields {
  const p: any = props || {};
  const bullets = Array.isArray(p.bullets) ? p.bullets : Array.isArray(p.features) ? p.features : [];
  // WHICH CATALOGUE ROW — the shared Binding section's reader, not this
  // widget's own. `_ia_selection` first, then the loose spellings.
  const sel = selectionOf(p);
  return {
    name: str(p.name),
    description: str(p.description),
    bullets: bullets.map(str),
    quantity: num(p.quantity, 1),
    unitPrice: num(p.unit_price ?? p.unitPrice, 0),
    cadence: p.cadence == null || p.cadence === "" ? null : str(p.cadence),
    unitLabel: str(p.unit_label).trim(),
    help: str(p.help).trim(),
    offeringId: sel.offeringId,
    priceId: sel.priceId,
  };
}

/**
 * QUANTITY CARRIES TWO MEANINGS, AND THIS IS THE LINE THAT SAYS WHICH (D-164).
 *
 * "How many" is sometimes a count of visits and sometimes a MEASUREMENT — 12
 * thousand square feet of paved area, 2 thousand square feet of walk. When the
 * catalogue price is "Per 1,000 sq ft" and the author leaves 165 on the line
 * from an earlier pick, the amount silently becomes 165 whole lots. So the
 * line under the amount always prints the two facts together: how many, and
 * what ONE of them is.
 *
 *   12 × $18.00 · Per 1,000 sq ft     (a measurement)
 *   Per push                           (quantity 1, the unit still named)
 *   14 × $625.00                       (no unit label — a plain count)
 *
 * ONE function, called by the canvas, and mirrored in oliver-api
 * `lib/documentModel.js` (`priceLineUnitNote`) so the customer's page and the
 * PDF print the same words. `money` is handed in because the three surfaces
 * format currency in three different places.
 */
export function priceLineUnitNote(
  f: Pick<PriceLineFields, "quantity" | "unitPrice" | "unitLabel">,
  formatMoney: (n: number) => string,
): string {
  const parts: string[] = [];
  if (f.quantity !== 1) parts.push(`${f.quantity} × ${formatMoney(f.unitPrice)}`);
  if (f.unitLabel) parts.push(f.unitLabel);
  return parts.join(" · ");
}

/**
 * THE PROPS A CATALOGUE PICK WRITES ONTO A PRICED LINE — one writer (D-164).
 *
 * `quantity: 1` is the load-bearing part. A pick used to leave whatever number
 * was already in the "How many" box, so choosing a per-1,000-sq-ft price on a
 * line that said 165 printed 165 whole-lot charges and nothing on the screen
 * said so. A fresh price means a fresh quantity; typing one afterwards is the
 * author's knowing act, and the unit label beside the rate is what tells them
 * what they are counting.
 */
export function priceLinePropsFromCatalogue(parts: {
  name?: string; description?: string; features?: string[];
  unit_price?: number; offering_id?: string; price_id?: string | null;
  cadence?: string | null; label?: string;
}): Record<string, unknown> {
  return {
    name: str(parts.name),
    description: str(parts.description),
    bullets: Array.isArray(parts.features) ? parts.features : [],
    features: Array.isArray(parts.features) ? parts.features : [],
    unit_price: num(parts.unit_price, 0),
    offering_id: str(parts.offering_id),
    price_id: parts.price_id ?? null,
    cadence: parts.cadence ?? null,
    unit_label: str(parts.label).trim(),
    quantity: 1,
  };
}

export function renderPriceLine(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const f = priceLineFields(p);
  const border = tagBorder(p, ctx.accent);
  // How many, and what ONE of them is — see `priceLineUnitNote`. The same
  // words are printed by the customer's page and the PDF.
  const note = priceLineUnitNote(f, (n) => money(n, ctx.currency));
  const qtyLine = note
    ? `<div class="bx-card-note" style="margin:0 0 4px">${esc(note)}</div>`
    : "";
  return `<div class="bx-priced${hasTag(p) ? " bx-priced-rec" : ""}"${border ? ` style="border-color:${esc(border)}"` : ""}>
    ${tagHtml(p, ctx.accent)}
    <div class="bx-priced-head">
      ${editRun("name", f.name, "bx-priced-name", "What are you charging for?", ctx)}
      <div class="bx-priced-amt">${esc(money(f.quantity * f.unitPrice, ctx.currency))}${f.cadence ? ` <span class="bx-per">${esc(f.cadence)}</span>` : ""}</div>
    </div>
    ${qtyLine}
    ${proseRun("description", f.description, "bx-prose-wrap", "", ctx)}
    ${f.bullets.length ? `<ul class="bx-list">${f.bullets.map((b, i) => `<li data-edit="bullets.${i}">${fillText(b, ctx)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

export const PRICE_LINE_DEF: WidgetDef = {
  kind: "price_line",
  label: "Product Line Item",
  description: "One thing you are charging for, with how many and the price each. This one adds to the total.",
  icon: "Tag",
  picture: pictureFrom(bar(8, 12, 30) + bar(44, 12, 12) + bar(8, 24, 24) + bar(44, 24, 12)),
  category: "Intelligent Analytics",
  /* NOT A TILE. **Product Line Items** is the tile; this is the atom it drops,
     one per pick. Offering the atom beside the tile would be a second door to
     one job, and the second one skips the catalogue picker — which is how a
     line lands on a proposal bound to nothing. */
  hidden: true,
  adapters: ["proposal"],
  // It can be filled from the OLIVER catalogue. A typed line needs nothing,
  // and WHETHER this business has OLIVER is still the server's answer.
  tier: "ia:oliver",
  defaults: {
    name: "", description: "", bullets: [], quantity: 1, unit_price: 0, cadence: null,
    // What ONE of them is, in the catalogue's own words. Written by the picker
    // (`priceLinePropsFromCatalogue`), printed beside the rate by all three
    // painters, and typeable by hand for a line nobody loaded from a catalogue.
    unit_label: "",
    // A note for the AUTHOR, shown under "Price each" in the panel and drawn
    // on NO page. A shipped template uses it to say what a blank price means.
    help: "",
    show_ribbon: "", ribbon_title: "", ribbon_color: "", ribbon_preset: "",
    ...bindingDefaults("oliver:catalogue"),
  },
  controls: [
    { key: "name", label: "What it is", type: "text", tab: "content", section: "Line item" },
    { key: "description", label: "Why it is worth having", type: "textarea", tab: "content", section: "Line item" },
    { key: "bullets", label: "What is included", type: "list", tab: "content", section: "Line item" },
    { key: "quantity", label: "How many", type: "number", tab: "content", section: "Line item" },
    { key: "unit_price", label: "Price each", type: "money", tab: "content", section: "Line item" },
    {
      key: "unit_label", label: "What one of them is", type: "text",
      tab: "content", section: "Line item",
      help: "The unit the price is charged on — e.g. Per 1,000 sq ft, or Per push",
    },
    // THE SAME Binding section a product card has (F.2). A client who learnt
    // it on one finds it on the other, which is the whole point of the section.
    ...BINDING_CONTROLS,
  ],
};

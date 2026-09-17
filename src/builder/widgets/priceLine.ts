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
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, pictureFrom } from "../pictures";
import { money } from "../totals";
import { editRun, fillText, proseRun } from "./text";
import { hasTag, tagBorder, tagHtml } from "./tag";

export interface PriceLineFields {
  name: string;
  description: string;
  bullets: string[];
  quantity: number;
  unitPrice: number;
  cadence: string | null;
  offeringId: string;
  priceId: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

/** The line's values, reading `priced_line`'s names as well as its own. */
export function priceLineFields(props: Record<string, unknown> | undefined | null): PriceLineFields {
  const p: any = props || {};
  const bullets = Array.isArray(p.bullets) ? p.bullets : Array.isArray(p.features) ? p.features : [];
  return {
    name: str(p.name),
    description: str(p.description),
    bullets: bullets.map(str),
    quantity: num(p.quantity, 1),
    unitPrice: num(p.unit_price ?? p.unitPrice, 0),
    cadence: p.cadence == null || p.cadence === "" ? null : str(p.cadence),
    offeringId: str(p.offering_id ?? p.offeringId),
    priceId: str(p.price_id ?? p.priceId),
  };
}

export function renderPriceLine(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const f = priceLineFields(p);
  const border = tagBorder(p, ctx.accent);
  const qtyLine = f.quantity !== 1
    ? `<div class="bx-card-note" style="margin:0 0 4px">${esc(String(f.quantity))} × ${esc(money(f.unitPrice, ctx.currency))}</div>`
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
  label: "Priced line",
  description: "One thing you are charging for, with how many and the price each. This one adds to the total.",
  task: "Products & services",
  icon: "Tag",
  picture: pictureFrom(bar(8, 12, 30) + bar(44, 12, 12) + bar(8, 24, 24) + bar(44, 24, 12)),
  category: "Money",
  adapters: ["proposal"],
  defaults: {
    name: "", description: "", bullets: [], quantity: 1, unit_price: 0, cadence: null, tag: null,
  },
  controls: [
    { key: "name", label: "What it is", type: "text" },
    { key: "description", label: "Why it is worth having", type: "textarea" },
    { key: "bullets", label: "What is included", type: "list" },
    { key: "quantity", label: "How many", type: "number" },
    { key: "unit_price", label: "Price each", type: "money" },
  ],
};

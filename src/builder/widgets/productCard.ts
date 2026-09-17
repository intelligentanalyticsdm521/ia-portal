/**
 * builder/widgets/productCard.ts — A CARD BOUND TO YOUR CATALOGUE.
 *
 * D-156 / D-157, Brandon: *"or product cards where they can directly load
 * products/services from their actual Product Catalog"*, and *"we have all
 * their business data … one widget for product catalog"*.
 *
 * ── WHY THE KIND IS `catalog_card` AND NOT `product_card` ─────────────────
 * `product_card` is already a kind: the email builder's "Products & prices",
 * a composite that holds a LIST of products for a newsletter. Renaming it
 * would touch the email renderer, the email templates and eight tests owned by
 * another stream in the same pass, for a string nobody sees. So the atomic,
 * catalogue-bound card is `catalog_card`, and the handoff asks the email stream
 * to fold its composite into a row of these when the tree lands — at which
 * point there is one card in the platform and this comment goes with it.
 *
 * ── WHAT "LIVE" MEANS ─────────────────────────────────────────────────────
 * The card stores the BINDING — `offeringId`, `priceId` — and a snapshot of
 * what the catalogue said when it was loaded. `resolveCatalogCard` prefers the
 * catalogue the builder has in its hand right now, falls back to the snapshot,
 * and lets an override win over both:
 *
 *   override (the author typed over it)  >  live catalogue  >  snapshot
 *
 * The snapshot is what makes the customer's copy and the PDF correct: those
 * are rendered by a server that has no catalogue in the request, and a card
 * that printed blank there because the price only existed in the editor would
 * be worse than no card at all. The snapshot is refreshed every time the
 * builder opens with the catalogue loaded, so "live" is true where anybody can
 * act on it and honest everywhere else.
 */
import type { Widget } from "../model";
import { esc, type RenderContext } from "../render";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom } from "../pictures";
import {
  basisOf, cadenceOf, fmtMoney,
  type CatalogOffering, type CatalogPrice,
} from "../../components/oliver/ProposalCatalogPicker";
import { renderCardBody } from "./card";
import { featureItem, featureTexts } from "./features";
import {
  BINDING_CONTROLS, bindingDefaults, bindingSettings, isPinned, onEmptyOf,
  refreshModeOf, selectionOf, type RefreshMode,
} from "./binding";

export interface CatalogBinding {
  offeringId: string;
  /** The tier within the offering. Null when the offering has no prices. */
  priceId: string | null;
}

/**
 * THE SHARED BINDING SECTION IS NOT HERE ANY MORE — it is
 * `widgets/binding.ts`, on every bound widget (catalogue F.2, conformance
 * 2026-09-17).
 *
 * It lived here, on the one widget that had a binding, and the other three
 * bound widgets each kept their own ad-hoc one. A client who learnt the
 * section on a product card did not find it on a priced line, a service
 * address or the totals — which is the one thing F.2 exists to prevent. The
 * five controls, the three refresh modes, the three on-empty values, the
 * overrides and the freeze-on-send are all in that module now, and this file
 * re-exports the two readers so its own callers are unchanged.
 */
export { type RefreshMode, type OnEmpty, refreshModeOf, onEmptyOf } from "./binding";

export interface CatalogSnapshot {
  title: string;
  price: string;
  per: string;
  description: string;
  bullets: string[];
  /** Dollars, for "Use this plan". */
  amount: number;
  cadence: string | null;
  basis: string;
}

const str = (v: unknown): string => (v == null ? "" : String(v));

/**
 * The binding on this widget, or null when nothing is chosen yet.
 *
 * Through `selectionOf` — the ONE reader of `_ia_selection` and of the four
 * loose spellings that preceded it — so a card, a priced line and the totals
 * all answer "which row is this" the same way.
 */
export function bindingOf(props: Record<string, unknown> | undefined | null): CatalogBinding | null {
  const sel = selectionOf(props);
  if (!sel.offeringId) return null;
  return { offeringId: sel.offeringId, priceId: sel.priceId || null };
}

/** What the catalogue says about one offering + tier, right now. */
export function snapshotFrom(o: CatalogOffering, price: CatalogPrice | null): CatalogSnapshot {
  const label = str(price?.label).trim();
  const amount = Number(price?.unit_amount);
  let bullets: string[] = [];
  try {
    const parsed = JSON.parse(str(o.features_json) || "[]");
    if (Array.isArray(parsed)) {
      bullets = parsed.map((f: any) => (typeof f === "string" ? f : str(f?.label))).filter(Boolean);
    }
  } catch { /* a malformed features_json is no inclusions, never an exception */ }
  return {
    title: label ? `${o.name} — ${label}` : o.name,
    price: fmtMoney(Number.isFinite(amount) ? amount : 0),
    per: cadenceOf(price) || "",
    description: str(o.description).trim(),
    bullets,
    amount: Number.isFinite(amount) ? amount : 0,
    cadence: cadenceOf(price),
    basis: basisOf(price),
  };
}

/** Find the bound offering and tier in a catalogue the caller already has. */
export function findInCatalogue(
  binding: CatalogBinding | null,
  offerings: CatalogOffering[] | undefined | null,
): { offering: CatalogOffering; price: CatalogPrice | null } | null {
  if (!binding) return null;
  const offering = (offerings || []).find((o) => String(o.offering_id) === binding.offeringId);
  if (!offering) return null;
  const prices = offering.prices || [];
  const price = binding.priceId
    ? prices.find((pr) => String(pr.price_id) === binding.priceId) || null
    : (prices.find((pr) => pr.is_default) || prices[0] || null);
  return { offering, price };
}

export interface ResolvedCatalogCard extends CatalogSnapshot {
  /** Where each visible value came from — the inspector says so in words. */
  source: "live" | "stored" | "none";
  /** What the author asked for, which is not always what was available. */
  refresh: RefreshMode;
  /** Field names the author has typed over. */
  overridden: string[];
}

/**
 * The card's values: override, then the live catalogue, then the snapshot.
 *
 * Pure, so the canvas, the customer's page, the PDF and the tests all answer
 * the same way from the same inputs.
 */
export function resolveCatalogCard(
  props: Record<string, unknown> | undefined | null,
  offerings?: CatalogOffering[] | null,
): ResolvedCatalogCard {
  const p: any = props || {};
  const binding = bindingOf(p);
  const b = bindingSettings(p);
  // A PINNED card ignores the catalogue in the room: a price a customer was
  // quoted must not move under them (F.2). Both pinned modes do it — the one
  // fixed at publish and the one fixed at send — because the difference
  // between them is WHEN the snapshot was written, never whether to read it.
  const live = isPinned(p) ? null : findInCatalogue(binding, offerings);
  const stored: Partial<CatalogSnapshot> = (b.snapshot || {}) as Partial<CatalogSnapshot>;
  const base: CatalogSnapshot = live
    ? snapshotFrom(live.offering, live.price)
    : {
      title: str(stored.title), price: str(stored.price), per: str(stored.per),
      description: str(stored.description),
      bullets: Array.isArray(stored.bullets) ? stored.bullets.map(str) : [],
      amount: Number(stored.amount) || 0,
      cadence: stored.cadence ?? null,
      basis: str(stored.basis),
    };

  /* THE OVERRIDES ARE KEYED BY THE CARD'S OWN FIELD NAMES (conformance).
     `overrides.heading` / `.description` / `.features_list` — the same words
     the card stores and the canvas types into, so the run that writes
     `overrides.heading` is read back by the same name and `overriddenFields`
     can say WHICH field is typed rather than a name from a third vocabulary.
     The snapshot's older spellings are read as aliases. */
  const over: any = b.overrides;
  const overridden: string[] = [];
  const pick = (key: "heading" | "description", legacy: string, value: string): string => {
    const o = str(over[key] ?? over[legacy]);
    if (o.trim()) { overridden.push(key); return o; }
    return value;
  };
  const listOverride = [over.features_list, over.bullets]
    .find((v) => Array.isArray(v)) as unknown[] | undefined;
  // Either shape: the canvas writes the repeater, `bullets` was flat.
  const bulletsOverride = listOverride ? featureTexts(listOverride) : null;
  if (bulletsOverride) overridden.push("features_list");

  return {
    ...base,
    title: pick("heading", "title", base.title),
    description: pick("description", "description", base.description),
    bullets: bulletsOverride ?? base.bullets,
    source: live ? "live" : (binding ? "stored" : "none"),
    refresh: refreshModeOf(p),
    overridden,
  };
}

/**
 * The card, drawn.
 *
 * It is `renderCardBody` — the SAME card — with the catalogue's values poured
 * into it and one line under the price saying what the price is for. A
 * separate renderer would be a second card that looked almost the same.
 */
export function renderCatalogCard(w: Widget, ctx: RenderContext): string {
  const p: any = w.props || {};
  const r = resolveCatalogCard(p, ctx.catalogue);
  if (r.source === "none") {
    /* `on_empty` (F.2), all three values. Nothing bound, or bound to a row
       that is gone:
         hide          — nothing, on a customer's page and on the canvas alike
         placeholder   — the dashed box saying what to do
         last_snapshot — whatever the widget last had, so a page a visitor is
                         reading does not lose a price because a catalogue row
                         was renamed this morning
       The AUTHOR always gets the placeholder, whatever they chose: a widget
       that draws nothing on the canvas cannot be clicked to fix. */
    const empty = onEmptyOf(p);
    if (empty === "last_snapshot" && ctx.mode !== "edit") {
      const snap = bindingSettings(p).snapshot;
      if (snap && String((snap as any).title ?? "").trim()) {
        return renderCardBody(
          { ...w, props: { ...p, ...snapshotToCardProps(snap as Partial<CatalogSnapshot>) } },
          ctx,
          { readOnlyPrice: true },
        );
      }
    }
    if (ctx.mode === "edit") {
      return `<div class="bx-card" style="border-style:dashed">
           <div class="bx-card-name">Product card</div>
           <div class="bx-card-pitch">Pick one of your products or services on the left and its price, what it includes and how it is billed fill in here.</div>
         </div>`;
    }
    // A CUSTOMER'S placeholder carries no words. It holds the space so the row
    // beside it does not close up, and says nothing — a sentence on a page
    // somebody signs has to be one the author wrote.
    return empty === "placeholder"
      ? `<div class="bx-card bx-card-empty" data-empty="placeholder"></div>`
      : "";
  }
  const basis = r.basis && r.basis !== r.per ? r.basis : "";
  const extra = basis
    ? `<div class="bx-card-note" style="margin:0 0 6px">${esc(basis)}</div>`
    : "";
  // The catalogue owns the words unless the author typed over them, so the
  // title and the description are editable runs writing into `overrides.*`
  // and the price is READ-ONLY: a price you can type over on the card is a
  // price that no longer matches what you sell.
  const shown: Widget = {
    ...w,
    props: { ...p, ...snapshotToCardProps(r) },
  };
  // `into: "overrides"` — the words the author types over a bound card go into
  // `overrides.*`, which is what makes "typed, not live" and "Put it back"
  // true (F.2). The price is READ-ONLY: a price you can type over on the card
  // is a price that no longer matches what you sell.
  return renderCardBody(shown, ctx, { extra, readOnlyPrice: true, into: "overrides" });
}

/**
 * A catalogue snapshot, in the CARD's own field names.
 *
 * One place that knows `title → heading`, `per → period` and `bullets →
 * features_list`, so the live card, the pinned card and the last-snapshot card
 * are all the same card drawn by `renderCardBody`. A second copy of this map
 * is a second chance for a price to land in a field nothing draws.
 */
export function snapshotToCardProps(s: Partial<CatalogSnapshot>): Record<string, unknown> {
  return {
    heading: str(s.title),
    price: str(s.price),
    period: str(s.per),
    description: str(s.description),
    // The price table's REPEATER shape — `{ item_text }` per line — which is
    // what a card stores and what both LUMEN renderers stamp into `data-edit`.
    features_list: (Array.isArray(s.bullets) ? s.bullets : []).map((b) => featureItem(str(b))),
  };
}

export const CATALOG_CARD_DEF: WidgetDef = {
  kind: "catalog_card",
  label: "Product card",
  description: "A card that loads one of your products or services — its price, what it includes and how it is billed.",
  task: "Products & services",
  icon: "PackageCheck",
  picture: pictureFrom(box(18, 4, 28, 32) + bar(23, 10, 18, 5) + bar(23, 19, 12)
    + `<path d="M23 28l3 3 6-6" stroke="#64748B"/>`),
  category: "Money",
  // WHERE IT MAY BE USED (catalogue F.1). D-156 slice one shipped these as
  // PROPOSAL-only; the panes that can actually DRAW them now offer them too.
  // The engine's own `renderAtom` draws this in every builder, and the website
  // publish path knows the kind by name, so nothing here is offered to a
  // surface that would drop it.
  adapters: ["proposal", "website", "email", "landing"],
  // It reads the OLIVER catalogue, so a business without OLIVER has nothing
  // for it to read. WHETHER this business has it is still the server's answer.
  tier: "ia:oliver",
  defaults: {
    ...bindingDefaults("oliver:catalogue"),
    footer_additional_info: "", button_text: "", link: "",
    show_ribbon: "", ribbon_title: "", ribbon_color: "", ribbon_preset: "",
  },
  // "Which product" is the adapter's control — only the adapter knows this
  // business's catalogue — exactly as D-33 settled for "Which location". The
  // Binding section is the SHARED one, spread in rather than retyped.
  controls: [
    { key: "footer_additional_info", label: "Small print under the card", type: "text", section: "Footer" },
    { key: "button_text", label: "Button wording", type: "text", section: "Footer", help: "Leave empty for no button." },
    { key: "link", label: "Button address", type: "link", section: "Footer" },
    ...BINDING_CONTROLS,
  ],
};

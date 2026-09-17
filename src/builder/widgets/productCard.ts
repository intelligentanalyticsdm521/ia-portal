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

export interface CatalogBinding {
  offeringId: string;
  /** The tier within the offering. Null when the offering has no prices. */
  priceId: string | null;
}

/**
 * THE SHARED BINDING SECTION (catalogue F.2), on the one widget with a binding.
 *
 * The catalogue's names for the five things every IA data widget carries, and
 * what this widget calls them today:
 *
 *   `_ia_source`     → the kind itself: `catalog_card` is bound to the
 *                      catalogue and to nothing else. When a second source
 *                      appears this becomes a prop; one widget, one source, is
 *                      not worth a field yet.
 *   `_ia_selection`  → `offeringId` + `priceId`
 *   `refresh`        → `refresh`, below
 *   `on_empty`       → `onEmpty`, below
 *   `overrides`      → `overrides`, already here
 *
 * Renaming the two selection keys is a one-line change in `bindingOf` and one
 * in the adapter's picker; the handoff says so. What is NOT cosmetic is
 * `refresh`, and that is why it is built rather than mapped.
 */
export type RefreshMode = "live" | "snapshot";
export type OnEmpty = "hide" | "placeholder";

/**
 * How this card treats the catalogue.
 *
 * `live` re-reads on every render wherever a catalogue is in the room — the
 * canvas, and a website page. `snapshot` pins the figures the card was loaded
 * with, and is what a document a customer has been SENT must do: *"a price a
 * customer was quoted must not move under them"* (F.2). Absent means live,
 * which is what every card written before this did.
 */
export function refreshModeOf(props: Record<string, unknown> | undefined | null): RefreshMode {
  return (props as any)?.refresh === "snapshot" ? "snapshot" : "live";
}

/** Nothing to show: leave a gap for the author, or nothing at all. */
export function onEmptyOf(props: Record<string, unknown> | undefined | null): OnEmpty {
  return (props as any)?.onEmpty === "placeholder" ? "placeholder" : "hide";
}

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

/** The binding on this widget, or null when nothing is chosen yet. */
export function bindingOf(props: Record<string, unknown> | undefined | null): CatalogBinding | null {
  const p: any = props || {};
  const offeringId = str(p.offeringId || p.offering_id).trim();
  if (!offeringId) return null;
  const priceId = str(p.priceId || p.price_id).trim();
  return { offeringId, priceId: priceId || null };
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
  // `snapshot` means the figures are pinned: a price a customer was quoted
  // must not move under them (F.2). The catalogue in the room is ignored.
  const live = refreshModeOf(p) === "snapshot" ? null : findInCatalogue(binding, offerings);
  const stored: Partial<CatalogSnapshot> = (p.snapshot && typeof p.snapshot === "object") ? p.snapshot : {};
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

  const over: any = (p.overrides && typeof p.overrides === "object") ? p.overrides : {};
  const overridden: string[] = [];
  const pick = (key: "title" | "description", value: string): string => {
    const o = str(over[key]);
    if (o.trim()) { overridden.push(key); return o; }
    return value;
  };
  const bulletsOverride = Array.isArray(over.bullets) ? over.bullets.map(str) : null;
  if (bulletsOverride) overridden.push("bullets");

  return {
    ...base,
    title: pick("title", base.title),
    description: pick("description", base.description),
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
    // `on_empty` (F.2): nothing bound yet. A customer's page shows nothing
    // either way; the author is told what to do unless they asked otherwise.
    if (onEmptyOf(p) === "hide" && ctx.mode !== "edit") return "";
    return ctx.mode === "edit"
      ? `<div class="bx-card" style="border-style:dashed">
           <div class="bx-card-name">Product card</div>
           <div class="bx-card-pitch">Pick one of your products or services on the left and its price, what it includes and how it is billed fill in here.</div>
         </div>`
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
    props: {
      ...p,
      title: r.title, price: r.price, per: r.per, description: r.description, bullets: r.bullets,
    },
  };
  return renderCardBody(shown, ctx, { extra, readOnlyPrice: true });
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
  // D-156 slice one is the PROPOSAL. These replace proposal composites, and
  // the email, website and landing panes have locked widget sets of their own
  // (§7, §4 step 3) that a widget cannot join without that adapter's renderer
  // drawing it. D-157 widens them; the handoff carries the ask.
  adapters: ["proposal"],
  defaults: {
    offeringId: "", priceId: "", snapshot: null, overrides: {}, tag: null,
    refresh: "live", onEmpty: "hide",
    note: "", ctaLabel: "", ctaUrl: "",
  },
  // "Which product" is the adapter's control — only the adapter knows this
  // business's catalogue — exactly as D-33 settled for "Which location".
  controls: [
    { key: "note", label: "Small print under the card", type: "text" },
    { key: "ctaLabel", label: "Button wording", type: "text", help: "Leave empty for no button." },
    { key: "ctaUrl", label: "Button address", type: "link" },
  ],
};

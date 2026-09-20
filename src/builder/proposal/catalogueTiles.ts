/**
 * builder/proposal/catalogueTiles.ts — THE TWO TILES THAT LOAD PRODUCTS.
 *
 * Brandon, 2026-09-19: *"Then cards or line items that you can load the
 * products from."* Scope 11.13.2 item 4, and the SHARED VOCABULARY:
 *
 *   "`product_cards` and `product_line_items` are PANEL TILES that open the
 *    ONE catalogue picker (multi-select: whole catalogue / one category /
 *    picked items) and drop one atomic `catalog_card` / `price_line` per pick
 *    into a row Container / a stack."
 *
 * ── A TILE IS NOT A WIDGET ────────────────────────────────────────────────
 * These two kinds are never on a page and never stored. Pressing the tile
 * opens the picker and what LANDS is `catalog_card` or `price_line` — the
 * atomic widgets D-156 already ships, with the Binding section F.2 already on
 * them. That is why there is no renderer here and no `case` anywhere for
 * either kind: a stored document that somehow carried one would draw nothing,
 * so nothing may store one, and the adapter's `onInsertWidget` returns `false`
 * for both, which is the engine's own "I handled it".
 *
 * ── WHY NOT ONE WIDGET WITH A "CARD OR LINE?" SELECT ──────────────────────
 * Because a card and a line are different things on the paper — a card sells
 * and a line prices — and an author picks the tile that looks like what they
 * want. Elementor's panel is pictures of outcomes, not a configuration
 * question, and this is the same shape: two tiles, two pictures, one picker.
 *
 * Pure. The building is here so it can be tested without a click.
 */
import { makeContainer, makeWidget, type Node, type Widget } from "../model";
import type { WidgetDef } from "../registry";
import { bar, box, pictureFrom } from "../pictures";
import { selectionProps } from "../widgets/binding";
import { snapshotFrom } from "../widgets/productCard";
import { priceLinePropsFromCatalogue } from "../widgets/priceLine";
import { buildPick, type CatalogOffering, type CatalogPrice } from "../../components/oliver/ProposalCatalogPicker";

/** The two tile kinds. Neither is ever stored on a document. */
export const CATALOGUE_TILE_KINDS = ["product_cards", "product_line_items"] as const;
export type CatalogueTileKind = (typeof CATALOGUE_TILE_KINDS)[number];

export function isCatalogueTile(kind: unknown): kind is CatalogueTileKind {
  return (CATALOGUE_TILE_KINDS as readonly string[]).includes(String(kind ?? ""));
}

/* ══════════════════════════════════════════════════════════════════════════
   What one pick becomes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * ONE CARD, bound and snapshotted, exactly as the card panel's own "bind"
 * writes it.
 *
 * The Binding section is written through `selectionProps` — the ONE writer —
 * so the card knows which catalogue row it is and the four loose spellings are
 * cleared. `_ia_snapshot` rides along so the customer's page and the PDF, which
 * have no catalogue to read, still have the figures.
 */
export function cardFromPick(o: CatalogOffering, price: CatalogPrice | null): Widget {
  const parts = buildPick(o, price).parts;
  return makeWidget("catalog_card", {
    heading: parts.name,
    description: parts.description,
    features_list: parts.features.map((item_text) => ({ item_text })),
    price: String(parts.unit_price || 0),
    period: parts.cadence || "",
    ...selectionProps("oliver:catalogue", {
      offeringId: String(o.offering_id), priceId: String(price?.price_id || ""),
    }),
    _ia_snapshot: snapshotFrom(o, price),
    refresh: "live",
    on_empty: "hide",
    overrides: {},
  });
}

/** ONE PRICED LINE, in the shape `priceLinePropsFromCatalogue` already owns. */
export function lineFromPick(o: CatalogOffering, price: CatalogPrice | null): Widget {
  const parts = buildPick(o, price).parts;
  return makeWidget("price_line", {
    ...priceLinePropsFromCatalogue(parts),
    ...selectionProps("oliver:catalogue", {
      offeringId: String(o.offering_id), priceId: String(price?.price_id || ""),
    }),
    refresh: "live",
    on_empty: "hide",
    overrides: {},
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   What a whole pick LIST becomes
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The nodes one tile drops for a list of picks.
 *
 * · **Product Cards** → one `catalog_card` per pick, inside ONE row Container.
 *   A row, because cards sit side by side — that is what a card IS — and
 *   because the container is the thing the author then sets the gap and the
 *   wrap on, in the Style tab, like any other container (11.12).
 *   ONE card is still a row of one: a second card added later goes in beside
 *   it, and an author who has to convert a bare card into a row before they
 *   can add a second one has hit the thing containers exist to prevent.
 *
 * · **Product Line Items** → one `price_line` per pick, flat, in reading
 *   order. A stack, because lines are read down a page and a total goes under
 *   them; wrapping them in a container would put a box between the lines and
 *   the Totals widget for no gain.
 *
 * An empty pick list returns an empty array: nothing is added and there is
 * nothing to undo. The picker's Add button is already disabled in that state,
 * so this is the second guard rather than the only one.
 */
export function nodesForPicks(
  kind: CatalogueTileKind,
  picks: ReadonlyArray<{ offering: CatalogOffering; price: CatalogPrice | null }>,
): Node[] {
  if (!picks.length) return [];
  if (kind === "product_line_items") return picks.map((p) => lineFromPick(p.offering, p.price));
  const cards = picks.map((p) => cardFromPick(p.offering, p.price));
  return [makeContainer({ direction: "row", gap: 16, wrap: true }, cards)];
}

/* ══════════════════════════════════════════════════════════════════════════
   The two definitions
   ══════════════════════════════════════════════════════════════════════════ */

export const PRODUCT_CARDS_DEF: WidgetDef = {
  kind: "product_cards",
  label: "Product Cards",
  description: "Pick what you sell and drop it on the page as cards, at your catalogue prices.",  icon: "LayoutGrid",
  picture: pictureFrom(box(3, 6, 12, 22) + box(18, 6, 12, 22) + bar(5, 26, 8) + bar(20, 26, 8)),
  category: "Intelligent Analytics",
  /* PROPOSAL ONLY. The tile drops `catalog_card` / `price_line`, and the
     email and website panes render neither today. 11.13.3 asks for Product
     Cards on both; the ask is in D165_HANDOFF_2026-09-19.md, behind the
     emitters those two output paths need. */
  adapters: ["proposal"],
  defaults: {},
  controls: [],
};

export const PRODUCT_LINE_ITEMS_DEF: WidgetDef = {
  kind: "product_line_items",
  label: "Product Line Items",
  description: "Pick what you sell and drop it on the page as priced lines that add up.",  icon: "ListOrdered",
  picture: pictureFrom(bar(3, 8, 20) + bar(24, 8, 6) + bar(3, 16, 24) + bar(24, 16, 6) + bar(3, 24, 16) + bar(24, 24, 6)),
  category: "Intelligent Analytics",
  adapters: ["proposal"],
  defaults: {},
  controls: [],
};

/* ══════════════════════════════════════════════════════════════════════════
   TERMS — the third tile, the same shape
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * 11.13.3: **Terms** (saved clauses; **plain text once placed**).
 *
 * The same pattern as the two above and for the same reason: pick from
 * something the business already wrote down, and what lands is STANDARD parts.
 * A clause becomes a Heading (its title) and a Text Editor (its body) — so
 * from the moment it is on the page it is ordinary text the author edits,
 * restyles and moves like any other text. There is no live link back to the
 * clause library, deliberately: a term somebody signed must not change because
 * the library did.
 *
 * The OLD `clauses` widget — a heading plus a repeater of numbered items, with
 * its own renderer — is what this replaces. It stays drawable for stored
 * documents (nothing here deletes a renderer another stream owns) and the ask
 * to take it out of the pane is in the handoff.
 */
export const TERMS_TILE_KIND = "terms";

export interface ClauseLike { clause_key?: string; title?: string | null; body?: string | null }

/** One clause → a Heading and a Text Editor. Blank parts are left out. */
export function nodesForClause(c: ClauseLike): Node[] {
  const title = String(c?.title ?? "").trim();
  const body = String(c?.body ?? "").trim();
  const out: Node[] = [];
  if (title) out.push(makeWidget("heading", { text: title, level: 3 }));
  if (body) out.push(makeWidget("paragraph", { text: body }));
  return out;
}

/** Several clauses, in the order they were picked. */
export function nodesForClauses(list: ReadonlyArray<ClauseLike>): Node[] {
  return list.flatMap(nodesForClause);
}

/* `TERMS_DEF` LIVED HERE and is DELETED (D-168, b168/demo).
   The approved offer file (`BUILDER_OFFERS_2026-09-19.json`) lists the
   proposal's IA widgets as Custom Field, Product Cards, Product Line Items,
   Table, Totals, Signature and Page Break — and says in as many words that
   "a widget not listed for a builder is NOT offered there". Terms is not on
   it, so the TILE is gone. The clause PICKER is not: it belongs to the **Terms
   and conditions** section template now, which is where D-167 put "anything
   that used to be a special widget". `nodesForClauses` above is unchanged and
   is what that template calls, so a saved clause still lands as plain Heading +
   Text Editor with no live link back to the library — a term somebody signed
   must not change because the library did. */


/** Every tile the proposal pane offers that opens a picker instead of
 *  inserting itself. One list, so `onInsertWidget` has one thing to ask. */
export const CATALOGUE_TILE_DEFS: WidgetDef[] = [PRODUCT_CARDS_DEF, PRODUCT_LINE_ITEMS_DEF];

/** Is this kind a tile — i.e. does pressing it open a picker? */
export function isPickerTile(kind: unknown): boolean {
  return isCatalogueTile(kind);
}

export default {
  CATALOGUE_TILE_KINDS, CATALOGUE_TILE_DEFS, TERMS_TILE_KIND, isCatalogueTile, isPickerTile,
  cardFromPick, lineFromPick, nodesForPicks, nodesForClause, nodesForClauses,
};

/**
 * builder/upgrade.ts — YESTERDAY'S COMPOSITES BECOME TODAY'S TREES.
 *
 * BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12 (D-156). Five widgets on the line
 * are LUMPS: a comparison-cards widget holds a heading, an intro, three cards
 * and a note, and none of those five things can be selected, moved, styled or
 * deleted on its own. Brandon: *"I'd think each of those would be its own
 * widget."* They are now, and every proposal, template and revision already
 * written has to arrive at the new model without anybody retyping it.
 *
 * ── ONE FUNCTION, ON THE WAY IN ───────────────────────────────────────────
 * `upgradeDocument` runs inside `deserialise`, which is the ONE door a stored
 * document comes through — the builder, the customer's copy, the revision page
 * and the PDF path all read a document that way. An upgrade the editor did and
 * the PDF did not would be two documents wearing one id.
 *
 * ── THE PROMISE THAT MAKES IT SAFE ────────────────────────────────────────
 * A document with no composites in it comes back as THE SAME OBJECT. Not an
 * equal one — the same one, by identity — so `serialise(deserialise(wire))`
 * is byte-for-byte `wire` for every proposal that does not need this, which is
 * most of them, and the golden fixtures never move. There is a test on exactly
 * that, and a mutation that makes the walk rebuild unconditionally turns it
 * red.
 *
 * ── AND IT IS IDEMPOTENT ──────────────────────────────────────────────────
 * Upgrading an upgraded document changes nothing, because after the first pass
 * there is no composite left to match. That is what lets it sit on the read
 * path without anybody having to remember whether a given document has been
 * through it.
 */
import type { BuilderDocument, Node, Section, Widget } from "./model";
import { isContainer, makeContainer, makeWidget } from "./treeOps";
import type { ElementStyle } from "./style";
import { LEGACY_RIBBON_KEYS, ribbonProps, tagOf } from "./widgets/ribbon";
import { featureItem, featureTexts } from "./widgets/features";
import {
  BOUND_KINDS, bindingDefaults, isBound, selectionOf, selectionProps,
} from "./widgets/binding";

/* ══════════════════════════════════════════════════════════════════════════
   What is being replaced
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The five kinds this pass takes apart. Nothing else is touched.
 *
 * `pricing_table` and `totals` are NOT here and that is deliberate: Elementor's
 * Price List and Price Table are widgets too, a rate card is one thing with
 * rows rather than a box of little ones, and `totals` sums the document. §11.12
 * says so in as many words.
 */
export const COMPOSITE_KINDS = ["comparison_cards", "property_block", "key_facts", "priced_line"] as const;

export function isComposite(n: Node): boolean {
  return !isContainer(n) && (COMPOSITE_KINDS as readonly string[]).includes(n.kind);
}

/** A row laid out side by side — what a set of cards or facts sits in. */
const ROW: ElementStyle = { direction: "row", gap: 16 };

/* ══════════════════════════════════════════════════════════════════════════
   The four rewrites
   ══════════════════════════════════════════════════════════════════════════ */

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function arr(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

/**
 * ONE OLD CARD → one `card`, or one `catalog_card` when it names a catalogue item.
 *
 * The field names change because the new widget's do (§11.12's table):
 * `name → title`, `list_price → was`, `pitch → description`, `features →
 * bullets`, `badge → tag`. Nothing is dropped — a card that carried a note
 * still has one, and a card that was Recommended still is.
 *
 * WHICH OF THE TWO is decided from the DOCUMENT and nothing else: if the old
 * card carries a catalogue reference it becomes a `catalog_card` bound to it,
 * and otherwise it is a typed `card`. §11.12 also wants "a card whose values
 * match a catalogue tier" recognised, and that needs the catalogue, which this
 * module cannot see and must not fetch — it is written down in the handoff for
 * the stream that owns the catalogue.
 *
 * INTEGRATION NOTE (2026-09-17). Two things were re-pointed here to the widget
 * that actually exists, rather than to the one this pass was written against:
 *
 *   · the kind is `catalog_card`, not `product_card` — `product_card` is the
 *     email builder's composite and is on disk in stored email documents that
 *     nothing upgrades, so the NEW widget is the one that takes a new name;
 *   · the binding is `offeringId` / `priceId` — the catalogue's own two keys,
 *     which is what `resolveCatalogCard` reads — and the words the old card
 *     already carried are written down as the SNAPSHOT. Without that, a card
 *     upgraded on a server with no catalogue in the request (the PDF worker,
 *     the customer's page) would resolve to nothing and print blank. The
 *     snapshot is what a catalogue card falls back to, so the upgraded card
 *     prints what the composite printed on the very first render, and picks up
 *     the live price the next time the builder opens with the catalogue loaded.
 */
function cardFrom(c: any): Widget {
  const offeringId = str(c?.item_id || c?.service_id || c?.catalogue_id || c?.productId || c?.offering_id || c?.offeringId);
  const title = str(c?.name ?? c?.title ?? c?.heading);
  const price = str(c?.price);
  const per = str(c?.per ?? c?.period);
  const description = str(c?.pitch ?? c?.description);
  const bullets = arr(c?.features ?? c?.bullets ?? c?.features_list).map(str);
  const ribbon = c?.badge ? ribbonProps({ text: str(c.badge) })
    : (c?.recommended ? ribbonProps({ text: "Recommended", preset: "recommended" }) : {});
  if (offeringId) {
    const props: Record<string, unknown> = {
      ...bindingDefaults("oliver:catalogue"),
      ...selectionProps("oliver:catalogue", {
        offeringId, priceId: str(c?.tier || c?.price_id || c?.priceId),
      }),
      // What the composite was showing, kept verbatim so the card is never
      // blank on a surface that has no catalogue.
      _ia_snapshot: { title, price, per, description, bullets, amount: 0, cadence: null, basis: "" },
      footer_additional_info: str(c?.note),
      ...ribbon,
    };
    if (c?.cta) props.button_text = str(c.cta);
    return makeWidget("catalog_card", props);
  }
  const props: Record<string, unknown> = {
    // THE CARD'S OWN NAMES, which are the price table's (conformance).
    heading: title, price, period: per,
    original_price: str(c?.list_price ?? c?.was ?? c?.original_price),
    sale: str(c?.list_price ?? c?.was ?? c?.original_price) ? "yes" : "",
    description,
    features_list: bullets.map(featureItem),
    footer_additional_info: str(c?.note),
    ...ribbon,
  };
  if (c?.cta) props.button_text = str(c.cta);
  return makeWidget("card", props);
}

/* ══════════════════════════════════════════════════════════════════════════
   THE RENAMES — old spellings become the card's and the Binding section's
   ══════════════════════════════════════════════════════════════════════════

   Catalogue point (g): a document saved with `title / per / was / bullets /
   note / recommended / offeringId / priceId / onEmpty` opens as one saved with
   `heading / period / original_price / features_list /
   footer_additional_info / show_ribbon / _ia_selection / on_empty`. Same
   promise as the composites: a document that never used the old names comes
   back as THE SAME OBJECT, by identity, so every golden already on the line is
   byte for byte what it was.

   Nothing is DROPPED, and nothing is renamed twice: a card that already has
   `heading` keeps it, and the old key is removed in the same write so the
   tolerant readers stop having two things to choose between. */

/** Old key → the card's own name. In declaration order, applied in order. */
const CARD_RENAMES: ReadonlyArray<[string, string]> = [
  ["title", "heading"],
  ["name", "heading"],
  ["per", "period"],
  ["was", "original_price"],
  ["list_price", "original_price"],
  ["pitch", "description"],
  ["bullets", "features_list"],
  ["features", "features_list"],
  ["note", "footer_additional_info"],
  ["ctaLabel", "button_text"],
  ["ctaUrl", "link"],
];

/** Old key → the Binding section's name. */
const BINDING_RENAMES: ReadonlyArray<[string, string]> = [
  ["onEmpty", "on_empty"],
  ["snapshot", "_ia_snapshot"],
];

/**
 * Old key → the tax vocabulary the three repos speak (shared vocabulary (c)).
 *
 * `tax_rate_resolved` is NOT here: it is the server's, written once on send,
 * and a document that never had one must not be given one on open.
 */
const TOTALS_RENAMES: ReadonlyArray<[string, string]> = [
  ["taxMode", "tax_mode"],
  ["taxRatePercent", "tax_rate"],
  ["taxLabel", "tax_label"],
];

/** Which kinds are cards, i.e. carry the card's own field names. */
const CARD_KINDS = new Set(["card", "catalog_card"]);

/**
 * WHICH KINDS CAN WEAR A RIBBON.
 *
 * A priced line wears one too - the inspector offers it the same six presets
 * ("Ribbon on this card"), the canvas draws it, and oliver reads it through
 * the same `cardTag`. So its OLD spelling has to be converted by the same
 * pass: found by driving it, 2026-09-17, on a document converted from a
 * comparison-cards composite, where the cards came back on `show_ribbon` and
 * the priced line kept `recommended: true`. Two spellings for one fact, which
 * is what point (g) exists to end.
 *
 * The card FIELD renames stay card-only: a priced line's `name` is its own
 * field and is not the card's `heading`.
 */
const RIBBON_KINDS = new Set(["card", "catalog_card", "price_line", "priced_line"]);

/**
 * One widget's props, renamed. Returns the SAME object when nothing moved.
 *
 * The identity return is the whole of the byte-identical promise: an untouched
 * widget is the same widget, so an untouched column is the same column and an
 * untouched document is the same document.
 */
export function renameProps(w: Widget): Widget {
  const p: any = w.props || {};
  let next: Record<string, unknown> | null = null;
  const mine = (): Record<string, unknown> => (next = next || { ...p });
  const write = (k: string, v: unknown) => { mine()[k] = v; };
  const drop = (k: string) => { delete mine()[k]; };

  if (CARD_KINDS.has(w.kind)) {
    for (const [from, to] of CARD_RENAMES) {
      if (!(from in p)) continue;
      const cur = next ? (next as any)[to] : p[to];
      const empty = cur === undefined || cur === null || cur === ""
        || (Array.isArray(cur) && cur.length === 0);
      if (empty && p[from] !== undefined && p[from] !== null && p[from] !== "") {
        /* `features_list` is the price table's REPEATER — one `{ item_text }`
           per line — and `bullets` / `features` were flat strings. The rename
           has to change the SHAPE as well as the key, or the canvas writes
           `features_list.0.item_text` into an array of strings and the line
           the author typed goes into nothing. */
        write(to, to === "features_list" ? featureTexts(p[from]).map(featureItem) : p[from]);
      }
      drop(from);
    }
    // A card already ON `features_list` but still holding flat strings — what
    // this pass wrote for the hours before the shape was agreed with stream O.
    if (Array.isArray(p.features_list) && p.features_list.some((f: unknown) => typeof f === "string")) {
      write("features_list", featureTexts(p.features_list).map(featureItem));
    }
  }

  // THE RIBBON, on every kind that can wear one. `tagOf` is the one reader of
  // all five spellings; whatever it answers is written back in the card's own
  // names, and the older keys go.
  if (RIBBON_KINDS.has(w.kind) && ("tag" in p || "badge" in p || "recommended" in p)) {
    const tag = tagOf(p);
    for (const [k, v] of Object.entries(ribbonProps(tag ? { text: tag.text, colour: tag.colour, preset: tag.preset } : null))) {
      write(k, v);
    }
    // And the older keys come OFF, rather than being left beside the new ones
    // holding a falsy value: a key nothing reads is a key somebody will one
    // day write, and `tagOf` would then have two answers to choose from.
    for (const k of LEGACY_RIBBON_KEYS) drop(k);
  }

  if (w.kind === "totals") {
    for (const [from, to] of TOTALS_RENAMES) {
      if (!(from in p)) continue;
      const cur = next ? (next as any)[to] : p[to];
      if (cur === undefined || cur === null || cur === "") write(to, p[from]);
      drop(from);
    }
    /* A document that carried a rate and no mode MEANT "this document only" —
       `totalsSettings` has always read it that way. Writing the mode down is
       what stops it drifting the day the default changes. */
    if (!("tax_mode" in p) && !("taxMode" in p)) {
      const rate = next ? (next as any).tax_rate : undefined;
      if (rate !== undefined && rate !== null && rate !== "") write("tax_mode", "document");
    }
  }

  if (isBound(w.kind)) {
    for (const [from, to] of BINDING_RENAMES) {
      if (!(from in p)) continue;
      const cur = next ? (next as any)[to] : p[to];
      if (cur === undefined || cur === null) write(to, p[from]);
      drop(from);
    }
    // THE SELECTION. `_ia_selection` is the one home; the four loose spellings
    // are read by `selectionOf` and written back through `selectionProps`, so
    // the rename and the reader cannot disagree about what a binding is.
    const loose = ["offeringId", "priceId", "offering_id", "price_id"].filter((k) => k in p);
    if (loose.length && w.kind !== "address_block") {
      const sel = selectionOf(p);
      if (sel.offeringId) {
        for (const [k, v] of Object.entries(selectionProps(BOUND_KINDS[w.kind], sel))) write(k, v);
      }
      for (const k of loose) drop(k);
    }
    // `refresh: "snapshot"` was the one pinned mode before there were two.
    if (p.refresh === "snapshot") write("refresh", "snapshot_send");
    /* `_ia_source` is NOT stamped on here. It is what the widget's own
       defaults carry and what `BOUND_KINDS` answers when it is absent, so
       stamping it would touch every document that has a priced line in it —
       and "a document that never used the old names comes back byte-identical"
       is the promise this whole pass rests on. */
  }

  return next ? { ...w, props: next } : w;
}

/**
 * `comparison_cards` → the Choose-your-plan tree.
 *
 *   container(column) {
 *     heading           the words that were the widget's `heading`
 *     paragraph         the words that were its `intro`
 *     container(row) { card | product_card … }
 *   }
 *
 * The heading and the paragraph are only made WHEN THERE WERE WORDS. An author
 * who never typed an intro must not open tomorrow's copy and find an empty
 * paragraph they now have to delete.
 */
function fromComparisonCards(w: Widget): Node {
  const p: any = w.props || {};
  const kids: Node[] = [];
  if (str(p.heading)) kids.push(makeWidget("heading", { text: str(p.heading), level: 2 }));
  if (str(p.intro)) kids.push(makeWidget("paragraph", { text: str(p.intro) }));
  const cards = arr(p.cards).map(cardFrom);
  kids.push(makeContainer(ROW, cards));
  const box = makeContainer(undefined, kids);
  // The id is KEPT. A revision diff matches sections and widgets by id, and a
  // document whose ids all changed on open would badge every section as new
  // the first time anybody looked at it.
  box.id = w.id;
  if (w.style) box.style = JSON.parse(JSON.stringify(w.style));
  return box;
}

/**
 * `property_block` → the Property tree.
 *
 *   container(column) { heading, address_block, pricing_table, totals }
 *
 * The location id travels to the `address_block`, which is what is bound to a
 * location now; the line items become the pricing table's rows, and the block's
 * own subtotal becomes a `totals` scoped to this box. The old widget kept all
 * four inside itself and none of them could be moved.
 */
function fromPropertyBlock(w: Widget): Node {
  const p: any = w.props || {};
  const kids: Node[] = [];
  if (str(p.heading)) kids.push(makeWidget("heading", { text: str(p.heading), level: 3 }));
  kids.push(makeWidget("address_block", {
    locationId: str(p.locationId),
    name: str(p.locationName),
  }));
  // THE ITEMS BECOME PRICED LINES, NOT A RATE CARD (integration, 2026-09-17).
  //
  // This was `pricing_table` and it would have been a money defect: a rate
  // card is PROSE — `PRICED_KINDS` does not list it, deliberately (totals.ts
  // rule 1) — so every property's items would have quietly stopped reaching
  // the total the first time a stored proposal was opened. A `price_line` per
  // item is both the money-preserving shape and the one D-156 asks for: each
  // line is its own widget you can select, reprice, move or delete.
  for (const it of arr(p.items)) {
    if (!str(it?.description).trim()) continue;
    kids.push(makeWidget("price_line", {
      name: str(it?.description).trim(),
      quantity: Number(it?.quantity ?? 1) || 1,
      unit_price: Number(it?.unit_price ?? 0) || 0,
      cadence: it?.cadence ?? null,
      recommended: !!it?.recommended,
      bullets: [],
      description: "",
    }));
  }
  // The property's NAME is the heading widget at the top of the box; this is
  // the line under the prices, and it says what the composite's said.
  kids.push(makeWidget("totals", { heading: "Subtotal for this property" }));
  const box = makeContainer(undefined, kids);
  box.id = w.id;
  if (w.style) box.style = JSON.parse(JSON.stringify(w.style));
  return box;
}

/**
 * `key_facts` → a row of `key_fact`.
 *
 * Four facts across the top of an agreement, each one now a thing you can
 * click, restyle, drag somewhere else or delete on its own.
 */
function fromKeyFacts(w: Widget): Node {
  const p: any = w.props || {};
  const facts = arr(p.rows).map((r: any) =>
    makeWidget("key_fact", { label: str(r?.label ?? r?.name), value: str(r?.value) }));
  const box = makeContainer(ROW, facts);
  box.id = w.id;
  if (w.style) box.style = JSON.parse(JSON.stringify(w.style));
  return box;
}

/**
 * `priced_line` → `price_line`.
 *
 * A rename and nothing else: the two were always the same thing, and §11.12
 * folds one into the other rather than leaving two kinds that mean one thing.
 * The id, the props, the lock and the styling are carried verbatim, so the
 * total it feeds does not move.
 */
function fromPricedLine(w: Widget): Node {
  return { ...w, kind: "price_line" };
}

function upgradeNode(n: Node): Node {
  if (isContainer(n)) {
    const kids = n.children.map(upgradeNode);
    return kids.every((k, i) => k === n.children[i]) ? n : { ...n, children: kids };
  }
  switch (n.kind) {
    case "comparison_cards": return fromComparisonCards(n);
    case "property_block": return fromPropertyBlock(n);
    case "key_facts": return fromKeyFacts(n);
    case "priced_line": return renameProps(fromPricedLine(n) as Widget);
    // THE RENAMES run on every widget that is not a composite, because a card
    // written yesterday is not a composite and still spells its fields the old
    // way. `renameProps` returns the same object when there is nothing to move.
    default: return renameProps(n);
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   The pass
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Turn every composite in the document into its tree.
 *
 * Returns THE SAME DOCUMENT, by identity, when there was nothing to do — see
 * the header. The identity checks below are the whole of that promise, and they
 * are the thing a mutation test breaks on purpose.
 */
export function upgradeDocument(doc: BuilderDocument): BuilderDocument {
  let touched = false;
  const sections: Section[] = doc.sections.map((s) => {
    let sectionTouched = false;
    const columns = s.columns.map((c) => {
      const kids = c.widgets.map(upgradeNode);
      if (kids.every((k, i) => k === c.widgets[i])) return c;
      sectionTouched = true;
      return { ...c, widgets: kids as Widget[] };
    });
    if (!sectionTouched) return s;
    touched = true;
    return { ...s, columns };
  });
  return touched ? { ...doc, sections } : doc;
}

/** Does this document still hold anything the pass would rewrite? */
export function needsUpgrade(doc: BuilderDocument): boolean {
  let found = false;
  const look = (nodes: Node[]) => {
    for (const n of nodes) {
      if (isContainer(n)) look(n.children);
      // A COMPOSITE, or a widget still spelling its fields the old way. Both
      // are "this document would change if it were opened", which is the one
      // question this function is asked.
      else if (isComposite(n) || renameProps(n) !== n) found = true;
    }
  };
  for (const s of doc.sections) for (const c of s.columns) look(c.widgets);
  return found;
}

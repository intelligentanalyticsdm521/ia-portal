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
/* D-168 (b168/demo) — the three block widgets are DELETED and every stored one
   becomes a Container of Custom Fields. The building is in the proposal folder
   beside the record book it reads; this file decides WHEN. */
import {
  fieldsContainer, recordBlockToContainer,
} from "./proposal/upgradeRecordBlocks";
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

/**
 * D-165 — THE KINDS THAT HAVE NO ELEMENTOR NAME AND ARE NOT ON THE IA LIST.
 *
 * §11.13.3, in as many words: *"Deleted from the proposal builder (replace
 * means delete; stored documents upgrade on open to standard parts): personal
 * detail, key fact, the details section, document header, footer note, property
 * plan, the old pricing table, call-out."* Plus `address_block`, which was
 * quietly BOTH the customer's address and the site's.
 *
 * Every one of them is gone from the registry and gone from the renderer, and
 * every one has a conversion below. The promise is the same as the composites':
 * a document that never held one comes back as THE SAME OBJECT, by identity, so
 * every golden on the line is byte for byte what it was.
 *
 * MONEY IS PRESERVED. Only `price_line` was ever money — `pricing_table` never
 * was (totals.ts rule 1: a rate card does not add up until it snows) and
 * neither was anything else here. `documentTotals` before and after this pass is
 * the same number, and there is a test that runs it both ways.
 */
export const DELETED_KINDS = [
  "doc_header", "footer_note", "merge_field", "personal_detail", "property_plan",
  "pricing_table", "callout", "key_value_table", "key_fact", "address_block",
  "map", "columns",
  /* D-168 - Customer, Service Location and Business Info. Built on the morning
     of 2026-09-19 and deleted the same afternoon (D-167): a block of facts is a
     special-purpose widget, and one fact is a Custom Field. Every stored one
     unpacks into a Container of Custom Fields, so nothing it showed is lost and
     the author can pull the result apart. */
  "customer", "service_location", "business_info",
] as const;

export function isDeletedKind(n: Node): boolean {
  return !isContainer(n) && (DELETED_KINDS as readonly string[]).includes(n.kind);
}

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
  kids.push(makeWidget("service_location", {
    ...bindingDefaults("lumen:locations"),
    ...selectionProps("lumen:locations", { locationId: str(p.locationId) }),
    heading: "", layout: "stacked", locationId: str(p.locationId),
    // The property's own name is what the author typed, so it is an override.
    overrides: str(p.locationName) ? { name: str(p.locationName) } : {},
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
  /* D-165 — a key fact IS A LINE OF TEXT. `key_fact` was the atomic half of
     this composite for one day, and it has no Elementor name and is not on the
     IA list, so it went the same way: "key_fact -> Text Editor (label bold +
     value) inside the same Container". Converting straight to the end state
     matters, because `upgradeNode` visits a node once — a two-hop conversion
     would leave a `key_fact` on the page that nothing draws. */
  const lines = arr(p.rows).map((r: any) => labelledLine(str(r?.label ?? r?.name), str(r?.value)));
  return asBox(w, ROW, lines);
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

/* ══════════════════════════════════════════════════════════════════════════
   D-165's conversions — one per deleted kind, each to STANDARD parts
   ══════════════════════════════════════════════════════════════════════════ */

/** The box a converted widget becomes, keeping the old widget's id and style. */
function asBox(w: Widget, style: ElementStyle | undefined, kids: Node[]): Node {
  const b = makeContainer(style, kids);
  // The id is KEPT. A revision diff matches by id, and a document whose ids all
  // changed on open would badge every section as new the first time it opened.
  b.id = w.id;
  if (w.style) b.style = JSON.parse(JSON.stringify(w.style));
  return b;
}

/** One widget, keeping the old one's id — for a one-for-one conversion. */
function asWidget(w: Widget, kind: string, props: Record<string, unknown>): Widget {
  return { ...w, kind, props };
}

/**
 * `icon_list: [{ text: "Mowing" }]` → `items: ["Mowing"]`.
 *
 * THE SAME OBJECT BACK when there is nothing to do, which is the promise the
 * whole module rests on: a document that never held the other spelling must
 * serialise byte for byte as it arrived.
 *
 * A row's `selected_icon` and `link` are NOT carried across, and that is a
 * decision rather than an oversight: nothing on this platform can set either —
 * there is no icon picker inside a panel row and no link field — so no stored
 * document has them, and inventing a place to keep a value nobody can write is
 * the second spelling all over again. If an Elementor import ever brings them,
 * that import is the thing that has to decide where they live.
 */
function fromIconListRepeater(w: Widget): Widget {
  const p = (w.props || {}) as Record<string, unknown>;
  const rows = Array.isArray(p.icon_list) ? p.icon_list : null;
  if (!rows) return w;
  const existing = Array.isArray(p.items) ? (p.items as unknown[]) : [];
  const fromRows = rows.map((r) => (r && typeof r === "object"
    ? str((r as Record<string, unknown>).text) : str(r)));
  const next: Record<string, unknown> = { ...p };
  delete next.icon_list;
  // The repeater wins when it has rows: it is the newer of the two, and a
  // document holding both was written by an editor that had already moved on.
  if (fromRows.length) next.items = fromRows;
  else if (!existing.length) next.items = existing;
  return { ...w, props: next };
}

/** A label and its value as one run of text. */
function labelledText(w: Widget, label: string, value: string): Widget {
  const l = str(label).trim();
  const v = str(value);
  return asWidget(w, "paragraph", { text: l ? `**${l}** ${v}`.trim() : v });
}

/** The same, for a row of a table that has no widget of its own to inherit. */
function labelledLine(label: string, value: string): Widget {
  const l = str(label).trim();
  const v = str(value);
  return makeWidget("paragraph", { text: l ? `**${l}** ${v}`.trim() : v });
}

/**
 * `doc_header` → `container(row){ image(logo), container{ heading, text } }`.
 *
 * §11.13.3: *"document header (-> a Container with Image + Heading, shipped as
 * a saved header template)"*. The band's own logo travels to the Image; the
 * title and the line under it are a Heading and a Text Editor, because that is
 * what they already were on the page.
 */
function fromDocHeader(w: Widget): Node {
  const p: any = w.props || {};
  const row: Node[] = [];
  const logo = str(p.logoUrl);
  if (logo && logo !== "none") row.push(makeWidget("image", { src: logo, alt: "", caption: "" }));
  const words: Node[] = [makeWidget("heading", { text: str(p.title), level: 1 })];
  if (str(p.subtitle)) words.push(makeWidget("paragraph", { text: str(p.subtitle) }));
  if (str(p.bandRight)) words.push(makeWidget("paragraph", { text: str(p.bandRight) }));
  row.push(makeContainer(undefined, words));
  return asBox(w, ROW, row);
}

/**
 * `property_plan` → `container{ heading, service_location, text rows }`.
 *
 * The location binding travels to the Service Location widget; every row of the
 * plan becomes a line of text, because that is all a row ever was.
 */
function fromPropertyPlan(w: Widget): Node {
  const p: any = w.props || {};
  /* ONE HOP, NOT TWO (D-168). This used to make a `service_location` widget,
     which is itself a deleted kind now, and a conversion onto a deleted kind
     only works if the second pass also runs - the pass that ran second is the
     one nobody remembered to call. So it goes straight to the Custom Fields. */
  return fieldsContainer("service_location", {
    id: w.id,
    heading: str(p.heading),
    locationId: str(p.locationId),
    after: arr(p.rows).map((r: any) => labelledLine(str(r?.label), str(r?.value))),
  });
}

/**
 * `pricing_table` → a heading, a line of prose and one `price_line` per row.
 *
 * §11.13.3: *"the old pricing table (-> Product Line Items)"*. A rate card's
 * rows carried a RATE as words ("$185 per push"), never a number, so each line
 * is created with `unit_price: 0` and the rate kept in its unit label: the table
 * fed no total and the lines must not start feeding one. That is the money rule,
 * and it is what the before/after `documentTotals` test pins.
 */
function fromPricingTable(w: Widget): Node {
  const p: any = w.props || {};
  const kids: Node[] = [];
  if (str(p.heading)) kids.push(makeWidget("heading", { text: str(p.heading), level: 2 }));
  if (str(p.intro)) kids.push(makeWidget("paragraph", { text: str(p.intro) }));
  for (const r of arr(p.rows)) {
    const name = str(r?.name ?? r?.service).trim();
    if (!name) continue;
    kids.push(makeWidget("price_line", {
      name,
      quantity: 1,
      unit_price: 0,
      unit_label: [str(r?.rate), str(r?.basis)].filter(Boolean).join(" · "),
      cadence: null,
      description: "",
      bullets: [],
    }));
  }
  return asBox(w, undefined, kids);
}

/** `callout` → one `alert` per panel. Elementor has a name for a tinted box. */
function fromCallout(w: Widget): Node {
  const p: any = w.props || {};
  const kids: Node[] = [];
  if (str(p.heading)) kids.push(makeWidget("heading", { text: str(p.heading), level: 2 }));
  const panels = arr(p.panels);
  for (const pn of panels) {
    kids.push(makeWidget("alert", {
      // `warn` was the one non-default tone the old widget had.
      alert_type: str(pn?.tone) === "warn" ? "warning" : "info",
      alert_title: str(pn?.title),
      alert_description: str(pn?.body),
    }));
  }
  return asBox(w, panels.length > 1 ? ROW : undefined, kids);
}

/** `key_value_table` → one line of text per row, in the same box. */
function fromKeyValueTable(w: Widget): Node {
  const p: any = w.props || {};
  return asBox(w, undefined, arr(p.rows).map((r: any) => labelledLine(str(r?.label ?? r?.name), str(r?.value))));
}

/**
 * `address_block` → `customer` or `service_location`, BY ITS BINDING.
 *
 * A block bound to one of the customer's locations IS that location. One that
 * was typed is the customer's own address, because that is the only address a
 * proposal has before anybody makes a site record. The id is kept either way,
 * so the revision diff does not badge it.
 */
/**
 * WHICH OF THE TWO an unbound block becomes, read off its own heading.
 *
 * A bound one is a site, because only a site is bound to a location. An unbound
 * one is whatever its heading says it is — "Billing address" and "Prepared for"
 * are the customer; anything else is where the work happens, which is what the
 * widget was used for on every template we ship.
 */
export function addressBlockBecomes(props: Record<string, unknown> | undefined | null): "customer" | "service_location" {
  if (selectionOf(props).locationId) return "service_location";
  const h = str((props as any)?.heading).toLowerCase();
  return /\b(bill|billing|invoice|prepared for|customer|client)\b/.test(h) ? "customer" : "service_location";
}

/**
 * `address_block` → **Customer** or **Service Location**, by its binding.
 *
 * THE TYPED WORDS BECOME `overrides`, and that is the whole of this function's
 * care (integration, 2026-09-19). The two record widgets store only what the
 * author RETYPED — everything else is read live from the record through
 * `ctx.extra` — so writing the old widget's `name` / `address` / `contact` as
 * flat props would have put them somewhere the renderer never looks, and a
 * stored agreement would have opened with the address silently replaced by
 * whatever the customer record says today. A BOUND block converts with no
 * overrides at all: the record was already its source.
 */
function fromAddressBlock(w: Widget): Node {
  const p: any = w.props || {};
  const sel = selectionOf(p);
  const kind = addressBlockBecomes(p);
  const overrides: Record<string, string> = {};
  if (!sel.locationId) {
    if (str(p.name)) overrides.name = str(p.name);
    if (str(p.address)) overrides[kind === "customer" ? "billing_address" : "address"] = str(p.address);
    if (str(p.notes)) overrides.access_notes = str(p.notes);
    if (str(p.contact)) overrides[kind === "customer" ? "contact" : "site_contact"] = str(p.contact);
  }
  /* ONE HOP (D-168) - straight to a Container of Custom Fields, for the
     reason `fromPropertyPlan` gives above. The typed words keep travelling as
     overrides on the field they belong to, which is the whole care this
     function ever had: a stored agreement must not open with the address
     silently replaced by whatever the record says today. */
  return fieldsContainer(kind, {
    id: w.id,
    heading: str(p.heading),
    locationId: sel.locationId,
    overrides,
  });
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
    /* D-165 — the kinds with no Elementor name that are not on the IA list.
       Every one becomes standard parts; nothing is dropped. */
    case "doc_header": return fromDocHeader(n);
    case "property_plan": return fromPropertyPlan(n);
    case "pricing_table": return fromPricingTable(n);
    case "callout": return fromCallout(n);
    case "key_value_table": return fromKeyValueTable(n);
    case "address_block": return fromAddressBlock(n);
    /* D-168 - the three block widgets. One Container of Custom Fields per
       block, one Custom Field per field it showed, the typed words carried
       across as that field's own override. Mirrored by oliver-api
       `lib/deletedKinds.js` on the server's own door. */
    case "customer":
    case "service_location":
    case "business_info":
      return recordBlockToContainer(n);
    // One for one: the words survive, the widget does not.
    case "footer_note": return asWidget(n, "paragraph", { text: str((n.props as any)?.text) });
    case "key_fact":
    /* `personal_detail` is the LABEL `merge_field` wore in the pane, and a
       stored document written by hand or by an older branch can carry it as a
       kind. Converted for the same reason both spellings of `price_line` are
       read: a document must not depend on which word was in fashion. */
    case "personal_detail":
      return labelledText(n, str((n.props as any)?.label), str((n.props as any)?.value));
    case "merge_field": return asWidget(n, "paragraph", { text: `{{${str((n.props as any)?.token)}}}` });
    /* D-168 item 4 — TWO kinds wore the label "Social Icons" and one survives.
       `social_links` is the id the shipped templates place, both goldens hold
       and LUMEN renders, so it is the id that stays; a page saved while
       `social_icons` was a separate widget comes in as one of those and keeps
       its accounts, whichever key they were stored under. One tile, one kind,
       and no stored document loses a row. */
    case "social_icons": {
      const p: any = n.props || {};
      const rows = Array.isArray(p.social_icon_list) ? p.social_icon_list
        : (Array.isArray(p.links) ? p.links : []);
      return asWidget(n, "social_links", { ...p, social_icon_list: rows });
    }
    case "map": return asWidget(n, "google_maps", { address: str((n.props as any)?.address), zoom: 10, height: 300 });
    /* R2-11 — THE ICON LIST HAS ONE LIST.
       It read two: Elementor's `icon_list` repeater first, and the plain
       `items` array behind it. That is why its control could not be a repeater
       — pressing Add Item on the first spelling emptied the list the author
       could see (`families/f3-…/iconList.ts rows()` has the whole reasoning,
       including why `items` is the key that survives). Anything stored in the
       other spelling is converted here, on the one door every reader comes
       through, so a document written either way opens with its points intact.
       Idempotent: a widget already holding only `items` has no `icon_list` to
       match, and comes back as the same object. */
    case "list": return fromIconListRepeater(n);
    /* `columns` was never a thing on the page — it SET a section's column count
       and the toolbar owned it from then on, and §11.13.1 takes it off the
       panel. One that reached a document is a box. */
    case "columns": return asBox(n, ROW, []);
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
      else if (isComposite(n) || isDeletedKind(n) || renameProps(n) !== n) found = true;
    }
  };
  for (const s of doc.sections) for (const c of s.columns) look(c.widgets);
  return found;
}

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
 * ONE OLD CARD → one `card`, or one `product_card` when it names a catalogue item.
 *
 * The field names change because the new widget's do (§11.12's table):
 * `name → title`, `list_price → was`, `pitch → description`, `features →
 * bullets`, `badge → tag`. Nothing is dropped — a card that carried a note
 * still has one, and a card that was Recommended still is.
 *
 * WHICH OF THE TWO is decided from the DOCUMENT and nothing else: if the old
 * card carries a catalogue reference it becomes a `product_card` bound to it,
 * and otherwise it is a typed `card`. §11.12 also wants "a card whose values
 * match a catalogue tier" recognised, and that needs the catalogue, which this
 * module cannot see and must not fetch — it is written down in the handoff for
 * the stream that owns the catalogue.
 */
function cardFrom(c: any): Widget {
  const itemId = str(c?.item_id || c?.service_id || c?.catalogue_id || c?.productId);
  const props: Record<string, unknown> = {
    title: str(c?.name ?? c?.title),
    price: str(c?.price),
    per: str(c?.per),
    was: str(c?.list_price ?? c?.was),
    description: str(c?.pitch ?? c?.description),
    bullets: arr(c?.features ?? c?.bullets).map(str),
    note: str(c?.note),
    recommended: !!c?.recommended,
  };
  if (c?.badge) props.tag = str(c.badge);
  if (c?.cta) props.cta = str(c.cta);
  if (itemId) {
    props.itemId = itemId;
    if (c?.tier) props.tier = str(c.tier);
    return makeWidget("product_card", props);
  }
  return makeWidget("card", props);
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
  kids.push(makeWidget("address_block", { locationId: str(p.locationId) }));
  kids.push(makeWidget("pricing_table", { rows: arr(p.items) }));
  kids.push(makeWidget("totals", { heading: "Subtotal for this property", scope: "box" }));
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
    case "priced_line": return fromPricedLine(n);
    default: return n;
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
      else if (isComposite(n)) found = true;
    }
  };
  for (const s of doc.sections) for (const c of s.columns) look(c.widgets);
  return found;
}

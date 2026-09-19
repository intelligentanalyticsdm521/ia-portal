/**
 * builder/proposal/upgradeProposal.ts — THE DELETED KINDS, UPGRADED ON OPEN.
 *
 * Scope 11.13.3: *"Deleted from the proposal builder (replace means delete;
 * stored documents upgrade on open to standard parts)."*
 *
 * A kind that is deleted is deleted from the PANE. A document somebody signed
 * last week still carries it, so every read path turns it into the standard
 * parts that say the same thing. There is no hidden branch of the pane keeping
 * the old widget alive and no "legacy" group — that is what "replace means
 * delete" means, and it is why this runs on open rather than on save: a
 * document is converted the first time anybody looks at it, and a document
 * nobody opens is still readable.
 *
 * ── THE CONVERSIONS, AND WHAT EACH ONE BECOMES ────────────────────────────
 *
 * | was              | becomes                                              |
 * |------------------|------------------------------------------------------|
 * | `address_block`  | **Service Location** — or **Customer**, when the     |
 * |                  | block was bound to nothing and is plainly the        |
 * |                  | billing party (`heading` says so). One widget per     |
 * |                  | record, which is 11.13.2's whole shape.              |
 * | `key_fact`       | **Text Editor** — "Label: value" on one run.         |
 * | `personal_detail`| the same. Both were a label and a value in a box.     |
 * | `footer_note`    | **Text Editor.**                                     |
 * | `doc_header`     | **Container (row)** holding an **Image** (the logo)  |
 * |                  | and a **Heading**.                                    |
 * | `property_plan`  | **Service Location** + a **Text Editor** per row.    |
 *
 * ── WHAT IS NOT HERE YET, AND WHY ─────────────────────────────────────────
 * `callout -> alert` and `pricing_table -> price_line rows` are in the shared
 * vocabulary and are NOT in this table. `alert` is stream 2's new standard
 * kind and had not landed when this was written; converting onto a kind that
 * nothing draws would turn a call-out on a signed agreement into an empty div,
 * which is worse than leaving it drawing correctly for one more pass. The ask
 * is in `D165_HANDOFF_2026-09-19.md` under stream 3, and the two lines go in
 * the table the moment `alert` is in the registry. The guard is the PRESENCE
 * of the target kind, asserted in the test — not an assumption that it exists.
 *
 * Returns THE SAME DOCUMENT by identity when there is nothing to convert, so a
 * draft that is merely opened is byte-identical on save and the goldens do not
 * move.
 *
 * Pure. Mirrored on the server by `oliver-api lib/documentModel.js`
 * `upgradeDeletedKinds`, so the canvas, the customer's page and the PDF cannot
 * disagree about what a stored document means.
 */
import {
  CONTAINER_KIND, isContainer, makeContainer, makeWidget,
  type BuilderDocument, type Node, type Widget,
} from "../model";
import { selectionOf } from "../widgets/binding";

const str = (v: unknown): string => (v == null ? "" : String(v)).trim();

/** Every kind this module converts. A test asserts none of them is offered. */
export const DELETED_PROPOSAL_KINDS = [
  "address_block", "key_fact", "personal_detail", "footer_note", "doc_header", "property_plan",
] as const;

/** The label-and-value pair, as one run of text a Text Editor holds. */
function labelledText(label: string, value: string): string {
  const l = str(label);
  const v = str(value);
  // PLAIN WORDS, NOT MARKDOWN. The scope line says "label bold + value", and
  // the text pipeline has no bold: `paras` escapes its input and the PDF
  // painter prints a paragraph in one font. Emitting `**Label:**` would put
  // literal asterisks on a document somebody signs. So it is "Label: value",
  // and the ask for a rich Text Editor is in the handoff.
  if (l && v) return `${l}: ${v}`;
  return l || v;
}

/**
 * IS THIS ADDRESS BLOCK THE CUSTOMER OR THE SITE?
 *
 * A bound block names a LOCATION — `locationId` is a location's id and nothing
 * else — so a bound block is always the Service Location. An unbound one was
 * typed, and the only thing that says which party it is about is the heading
 * the author gave it. "Bill to", "Invoice to", "Prepared for" are the three a
 * proposal actually carries; anything else is the site, because that is what
 * the widget was FOR and guessing the other way would move a service address
 * onto the customer block where nobody would look for it.
 */
export function addressBlockBecomes(props: Record<string, unknown> | undefined | null): "customer" | "service_location" {
  if (selectionOf(props).locationId) return "service_location";
  const h = str((props as any)?.heading).toLowerCase();
  return /\b(bill|billing|invoice|prepared for|customer|client)\b/.test(h) ? "customer" : "service_location";
}

/** One old widget → the standard parts that say the same thing. */
export function upgradeWidget(w: Widget): Node[] {
  const p: any = w.props || {};
  switch (w.kind) {
    case "address_block": {
      const kind = addressBlockBecomes(p);
      const overrides: Record<string, string> = {};
      // A TYPED value is an override on the new block: it is words the author
      // wrote, and the new widget's rule is that words the author wrote win
      // over the record and say so. A BOUND block carried no typed words — the
      // record was already the source — so it converts with none.
      if (!selectionOf(p).locationId) {
        if (str(p.name)) overrides.name = str(p.name);
        if (str(p.address)) overrides.address = str(p.address);
        if (str(p.notes)) overrides.access_notes = str(p.notes);
        if (str(p.contact)) overrides[kind === "customer" ? "contact" : "site_contact"] = str(p.contact);
      }
      return [makeWidget(kind, {
        heading: str(p.heading),
        layout: "stacked",
        locationId: selectionOf(p).locationId,
        _ia_source: "lumen:locations",
        refresh: p.refresh ?? "live",
        on_empty: p.on_empty ?? p.onEmpty ?? "hide",
        overrides,
      })];
    }

    case "key_fact":
    case "personal_detail":
      return [makeWidget("paragraph", { text: labelledText(p.label, p.value) })];

    case "footer_note":
      return [makeWidget("paragraph", { text: str(p.text) })];

    case "doc_header": {
      const kids: Node[] = [];
      const logo = str(p.logoUrl);
      // "none" is the author saying "no logo, the business NAME instead"
      // (D-39). It is a decision, not an absence, so it does not become an
      // empty Image widget nobody can see.
      if (logo && logo !== "none") kids.push(makeWidget("image", { src: logo, alt: "", width: 180 }));
      kids.push(makeWidget("heading", { text: str(p.title) || str(p.heading), level: 1 }));
      return [makeContainer({ direction: "row", alignItems: "center", gap: 16 }, kids)];
    }

    case "property_plan": {
      const out: Node[] = [makeWidget("service_location", {
        heading: str(p.heading),
        layout: "stacked",
        locationId: selectionOf(p).locationId || str(p.locationId).toLowerCase(),
        _ia_source: "lumen:locations",
        refresh: "live",
        on_empty: "hide",
        overrides: {},
      })];
      for (const r of (Array.isArray(p.rows) ? p.rows : [])) {
        const text = labelledText((r as any)?.label, (r as any)?.value);
        if (text) out.push(makeWidget("paragraph", { text }));
      }
      return out;
    }

    default:
      return [w];
  }
}

/** True when this node, or anything under it, is a kind we convert. */
function needsUpgrade(n: Node): boolean {
  if (isContainer(n)) return n.children.some(needsUpgrade);
  return (DELETED_PROPOSAL_KINDS as readonly string[]).includes(n.kind);
}

function upgradeList(list: Node[]): Node[] {
  const out: Node[] = [];
  for (const n of list) {
    if (isContainer(n)) {
      const kids = upgradeList(n.children);
      out.push(kids.every((k, i) => k === n.children[i]) ? n : { ...n, children: kids });
      continue;
    }
    // A doc_header becomes a CONTAINER, and a container inside a container is
    // fine — that is Elementor's own shape (11.12) and `MAX_DEPTH` is the only
    // limit. Nothing here flattens, because flattening would lose the row.
    out.push(...upgradeWidget(n));
  }
  return out;
}

/**
 * The document with every deleted kind turned into standard parts.
 *
 * SAME DOCUMENT BY IDENTITY when there is nothing to convert. That identity is
 * the promise this module makes to the save path, and it is what the mutation
 * test breaks on purpose.
 */
export function upgradeProposalDocument(doc: BuilderDocument): BuilderDocument {
  if (!doc || !Array.isArray(doc.sections)) return doc;
  let touched = false;
  const sections = doc.sections.map((s) => {
    let sectionTouched = false;
    const columns = (s.columns || []).map((c) => {
      if (!(c.widgets || []).some(needsUpgrade)) return c;
      sectionTouched = true;
      return { ...c, widgets: upgradeList(c.widgets) as Widget[] };
    });
    if (!sectionTouched) return s;
    touched = true;
    return { ...s, columns };
  });
  return touched ? { ...doc, sections } : doc;
}

export { CONTAINER_KIND };
export default { DELETED_PROPOSAL_KINDS, addressBlockBecomes, upgradeWidget, upgradeProposalDocument };

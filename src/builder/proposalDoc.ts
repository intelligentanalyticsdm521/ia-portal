/**
 * builder/proposalDoc.ts — the PROPOSAL adapter's pure half.
 *
 * Two jobs, both of them arithmetic rather than interface, so both are tests
 * rather than click-throughs:
 *
 *   1. UPGRADE. A proposal saved by the old block editor (migration 166's
 *      {"v":1,"blocks":[…]}) opens in the builder as a real document. Nothing
 *      is discarded: every one of the seven implemented block kinds has a
 *      widget, and an unknown kind becomes a paragraph carrying its heading so
 *      an author can see it rather than losing it.
 *   2. WIRE. oliver.proposal keeps line_items_json + totals + scope_html
 *      exactly as before, so the accepted-proposal → quote conversion, the
 *      sent email and every pre-builder reader are untouched. They are
 *      DERIVED from the document here, in one place — the defect the inventory
 *      found was that this projection lived in a 1,785-line page component and
 *      the server therefore could not render a proposal at all.
 */
import {
  deserialise, emptyDocument, makeSection, makeWidget, walkWidgets,
  type BuilderDocument, type Section, type Widget,
} from "./model";
import { documentTotals, type LineTotal } from "./totals";
import { upgradeDocument } from "./upgrade";
import { renderDocument, makeContext, type RenderContext } from "./render";
import type { FillMode } from "./merge";
import {
  addressFields, freezeOnSend, priceLineFields, resolveCatalogCard,
} from "./widgets";

/* ── 1. Upgrade ──────────────────────────────────────────────────────────── */

function one(widgets: ReturnType<typeof makeWidget>[], extra: Partial<Section> = {}): Section {
  const s = makeSection({ layout: 1, ...extra });
  s.columns[0].widgets = widgets;
  return s;
}

/**
 * v1 blocks → a v2 document.
 *
 * @param blocks the parsed blocks_json value, or its `blocks` array.
 */
export function upgradeV1(blocksJson: unknown): BuilderDocument {
  let value: any = blocksJson;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch { return emptyDocument(); } }
  const blocks: any[] = Array.isArray(value) ? value : Array.isArray(value?.blocks) ? value.blocks : [];
  const doc = emptyDocument();

  for (const b of blocks) {
    if (!b || typeof b.kind !== "string") continue;
    switch (b.kind) {
      case "text":
        doc.sections.push(one([
          ...(b.heading ? [makeWidget("heading", { text: b.heading, level: 2 })] : []),
          makeWidget("paragraph", { text: b.body || "" }),
        ], { label: b.heading || undefined }));
        break;
      case "service":
        doc.sections.push(one([makeWidget("priced_line", {
          name: b.name || "", description: b.description || "",
          features: Array.isArray(b.features) ? b.features : [],
          quantity: Number(b.quantity) || 1, unit_price: Number(b.unit_price) || 0,
          recommended: !!b.recommended, offering_id: b.offering_id, price_id: b.price_id,
          cadence: b.cadence ?? null,
        })]));
        break;
      case "line":
        doc.sections.push(one([makeWidget("priced_line", {
          name: b.description || "", description: "", features: [],
          quantity: Number(b.quantity) || 1, unit_price: Number(b.unit_price) || 0,
          recommended: !!b.recommended,
        })]));
        break;
      case "cards":
        doc.sections.push(one([makeWidget("comparison_cards", {
          heading: b.heading || "", intro: b.intro || "",
          cards: (Array.isArray(b.items) ? b.items : []).map((c: any) => ({
            name: c?.name || "", pitch: c?.pitch || "", price: c?.price || "",
            list_price: c?.list_price || "", per: c?.per || "", note: c?.note || "",
            features: Array.isArray(c?.features) ? c.features : [],
            recommended: !!c?.recommended, badge: c?.badge || "",
          })),
        })], { label: b.heading || undefined }));
        break;
      case "callout":
        doc.sections.push(one([makeWidget("callout", {
          heading: b.heading || "",
          panels: (Array.isArray(b.panels) ? b.panels : []).map((p: any) => ({
            title: p?.title || "", tone: p?.tone === "warn" ? "warn" : "accent",
            body: (Array.isArray(p?.items) ? p.items : []).filter(Boolean).join("\n"),
          })),
        })], { label: b.heading || undefined }));
        break;
      case "buckets":
        // "Totals at a glance" was a hand-typed grouping. The builder computes
        // the real one, so the groups come across as a details list and the
        // arithmetic moves to the totals widget the author drops in.
        doc.sections.push(one([
          ...(b.heading ? [makeWidget("heading", { text: b.heading, level: 2 })] : []),
          makeWidget("key_value_table", {
            rows: (Array.isArray(b.groups) ? b.groups : []).flatMap((g: any) => [
              { label: g?.title || "", value: g?.total || "" },
              ...(Array.isArray(g?.rows) ? g.rows : []).map((r: any) => ({ label: r?.label || "", value: r?.amount || "" })),
            ]),
          }),
        ], { label: b.heading || undefined }));
        break;
      case "signature":
        doc.sections.push(one([makeWidget("signature", {
          heading: b.heading || "Acceptance", body: "",
          customerLabel: (Array.isArray(b.parties) && b.parties[0]?.name) || "Customer signature",
          businessLabel: (Array.isArray(b.parties) && b.parties[1]?.name) || "",
          consent: "", required: true,
        })], { label: b.heading || "Acceptance" }));
        break;
      default:
        doc.sections.push(one([makeWidget("paragraph", {
          text: [b.heading, b.body, b.intro].filter(Boolean).join("\n\n") || `(${b.kind})`,
        })]));
    }
  }
  // THE SAME UPGRADE AS EVERY OTHER DOOR (D-156). `deserialise` runs it for a
  // stored document; this is the other way a proposal reaches the builder, and
  // a v1 proposal that opened as composites while a v2 one opened as a tree
  // would be two models on one screen. The pass is idempotent and returns the
  // same object when there is nothing to do.
  return upgradeDocument(doc);
}

/**
 * Open a proposal row in the builder.
 *
 * `document_json` wins when it is there; a pre-builder proposal comes in
 * through upgradeV1; a proposal with neither opens on the chosen template,
 * which the caller supplies — never on a blank page (§7).
 */
export function openProposalDocument(
  row: { document_json?: unknown; blocks?: unknown },
): BuilderDocument | null {
  if (row?.document_json) {
    const doc = deserialise(row.document_json);
    if (doc.sections.length) return doc;
  }
  if (row?.blocks) {
    const doc = upgradeV1(row.blocks);
    if (doc.sections.length) return doc;
  }
  return null;
}

/**
 * Every location the DOCUMENT itself refers to.
 *
 * A property block that prices a site, or a service plan that describes one,
 * means the document covers that site — whether or not the author also ticked
 * its chip in the header. This matters beyond the page: accepting a proposal
 * opens a job PER LOCATION from `oliver.proposal_location`, and the customer's
 * page can only print an address for a location the proposal says it covers.
 * A site that is priced but not listed gets no job and no address.
 */
export function locationsUsedBy(doc: BuilderDocument): string[] {
  const out: string[] = [];
  // THE WHOLE TREE (D-156). A property is a box holding an `address_block`
  // now, and the address block is at DEPTH — a flat pass over the top of each
  // column would have returned nothing for an upgraded proposal, which means
  // no job opened and no address on the customer's copy. `walkWidgets` is the
  // one walk and it reaches every level.
  for (const { widget, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    if (widget.kind !== "property_block" && widget.kind !== "property_plan"
      && widget.kind !== "address_block") continue;
    const id = String((widget.props as any)?.locationId || "").trim().toLowerCase();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/* ── 2. Wire shape ───────────────────────────────────────────────────────── */

export interface ProposalWire {
  blocks: { v: 1; blocks: unknown[] };
  document: BuilderDocument;
  scope_html: string;
  line_items: Array<{
    description: string; quantity: number; unit_price: number; line_total: number;
    recommended: boolean; service_offering_id?: string; service_price_id?: string;
    service_location_id?: string;
  }>;
  subtotal: number;
  total: number;
}

/**
 * Everything oliver.proposal needs, derived from the document ONCE.
 *
 * `scope_html` stays a narrative because that is what the sent email and every
 * pre-builder reader expects; it is rendered by the SAME renderer as the
 * customer page, so it cannot describe a different document.
 */
export function toWire(
  doc: BuilderDocument,
  ctx: Partial<RenderContext> & {
    taxRate?: number; discount?: number;
    /**
     * WHICH COPY THIS IS — `merge.fill`'s own three modes (F.2).
     *
     * `send` freezes every bound widget: `_ia_snapshot` is written and
     * `refresh` becomes `snapshot_send`, so *"a price a customer was quoted
     * must not move under them"* is a value ON the document rather than a
     * consequence of the PDF worker happening to have no catalogue. Absent is
     * `view`, which is every draft save, and returns the document unchanged by
     * identity.
     *
     * The RENDER mode stays `view`: a proposal is finished when it is written,
     * so its merge tags are filled here and not left for a server to resolve
     * per recipient (which is what `send` means for an email BODY).
     */
    fill?: FillMode;
  } = {},
): ProposalWire {
  // THE ONE FREEZE, at the one seam. `documentTotals` and the renderer below
  // both read the FROZEN document, so the line items, the narrative and the
  // stored model are three views of the same copy rather than of two.
  const sent = freezeOnSend(doc, ctx.fill ?? "view", (w) => proposalSnapshot(w, ctx));
  const totals = documentTotals(sent, { taxRate: ctx.taxRate, discount: ctx.discount });
  const rc = makeContext(sent, { ...ctx, mode: "view", totals });
  return {
    // v1 blocks are still written so an older reader (and the 166 lineage) sees
    // something honest. One text block per section, in order.
    blocks: { v: 1, blocks: legacyBlocks(sent) },
    document: sent,
    scope_html: renderDocument(sent, rc),
    line_items: totals.lines.map((l: LineTotal) => ({
      description: l.description,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
      recommended: l.recommended,
      ...(l.offering_id ? { service_offering_id: l.offering_id } : {}),
      ...(l.price_id ? { service_price_id: l.price_id } : {}),
      ...(l.locationId ? { service_location_id: l.locationId } : {}),
    })),
    subtotal: totals.subtotal,
    total: totals.total,
  };
}

/**
 * WHAT A BOUND WIDGET'S FROZEN VALUES ARE, in a proposal.
 *
 * The catalogue and the locations are HANDED IN, as they are to every renderer
 * on this platform — `ctx.catalogue`, `ctx.locations` — so this is pure and the
 * test can freeze a document without a fetch. A widget the caller has no data
 * for returns null and is left alone: freezing a card to nothing would replace
 * a live price with a blank one on the copy the customer signs.
 */
function proposalSnapshot(
  w: Widget,
  ctx: Partial<RenderContext>,
): Record<string, unknown> | null {
  if (w.kind === "catalog_card") {
    const r = resolveCatalogCard(w.props, ctx.catalogue);
    return r.source === "live"
      ? {
        title: r.title, price: r.price, per: r.per, description: r.description,
        bullets: r.bullets, amount: r.amount, cadence: r.cadence, basis: r.basis,
      }
      : null;
  }
  if (w.kind === "price_line" || w.kind === "priced_line") {
    const f = priceLineFields(w.props);
    if (!f.offeringId) return null;
    return {
      name: f.name, description: f.description, bullets: f.bullets,
      quantity: f.quantity, unit_price: f.unitPrice, cadence: f.cadence,
    };
  }
  if (w.kind === "address_block") {
    const f = addressFields(w.props, ctx.locations);
    return f.bound
      ? { name: f.name, address: f.address, contact: f.contact, notes: f.notes }
      : null;
  }
  // `totals` reads the DOCUMENT, not a table (F.1.3), and the document IS the
  // copy being sent — there is nothing outside it that could move.
  return null;
}

/** The v1 projection, for readers that predate the document model. */
function legacyBlocks(doc: BuilderDocument): unknown[] {
  const out: unknown[] = [];
  // THE WHOLE TREE, and BOTH spellings of a priced line (D-156). An old reader
  // is the one reader that cannot be upgraded, so the projection it reads has
  // to follow the model wherever the model goes — including into a box, and
  // including past the rename of `priced_line` to `price_line`.
  for (const { widget: w, section } of walkWidgets(doc)) {
    if (section.visibility !== "customer") continue;
    const p: any = w.props || {};
    if (w.kind === "price_line" || w.kind === "priced_line") {
      out.push({
        kind: "service", name: p.name || "", description: p.description || "",
        features: Array.isArray(p.features) ? p.features : Array.isArray(p.bullets) ? p.bullets : [],
        quantity: Number(p.quantity) || 1, unit_price: Number(p.unit_price) || 0,
        recommended: !!p.recommended, offering_id: p.offering_id, price_id: p.price_id, cadence: p.cadence ?? null,
      });
    } else if (w.kind === "comparison_cards") {
      out.push({ kind: "cards", heading: p.heading || "", intro: p.intro || "", items: Array.isArray(p.cards) ? p.cards : [] });
    } else if (w.kind === "signature") {
      out.push({ kind: "signature", heading: p.heading || "Acceptance", parties: [{ name: p.customerLabel || "" }, { name: p.businessLabel || "" }] });
    }
  }
  // The narrative of everything else, once, so nothing vanishes for an old
  // reader — rendered from the same document.
  const prose = doc.sections
    .filter((s) => s.visibility === "customer")
    .map((s) => s.label)
    .filter(Boolean)
    .join(" · ");
  if (prose) out.unshift({ kind: "text", heading: "", body: prose });
  return out;
}

// test/builder-atomic-widgets.test.mjs — D-156 / D-157, stream B.
//
// Brandon's sentence, which is what these tests are for:
//
//   "Header, drag that into this box and it's now its own section inside the
//    box, then a text field under it with Pick One, then cards … custom cards
//    where they just type the card headers, add a price, and description
//    inside the cards, or product cards where they can directly load
//    products/services from their actual Product Catalog."
//
// Every widget named there is one widget, declared in one file beside the
// function that draws it. What is asserted here is that each of them EXISTS in
// the one vocabulary, DRAWS what it was given, and that the money rules did not
// move: a card is an offer and never sums, a priced line is a charge and always
// does, and a total counts the lines above it with this document's own tax
// rate, discount and coupon on it.
//
// THE MUTATIONS, all five run and restored 2026-09-17:
//   1. `PRICED_KINDS` gains "catalog_card"          → cards sum, red
//   2. `renderCatalogCard` ignores `ctx.catalogue`  → the price is not live, red
//   3. `widgetTotals` ignores the tax rate          → the total is untaxed, red
//   4. `lineTotals` ignores `before`                → a total counts what is
//                                                     below it as well, red
//   5. `card` removed from the renderer map         → offered but not drawn, red
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { deserialise, emptyDocument, makeSection, makeWidget, serialise } from "../src/builder/model.ts";
import { WIDGETS_BY_KIND, widgetsFor } from "../src/builder/registry.ts";
import { groupByTask } from "../src/builder/widgetTasks.ts";
import { atomKindsAgree, ATOM_KINDS, resolveCatalogCard, tagOf } from "../src/builder/widgets/index.ts";
import { makeContext, renderDocument, renderWidget, RENDERED_KINDS } from "../src/builder/render.ts";
import { isTypographic } from "../src/builder/style.ts";
import {
  PRICED_KINDS, documentMoneySettings, documentTotals, lastTotalsWidget,
  lineTotals, totalsSettings, widgetTotals,
} from "../src/builder/totals.ts";
import {
  PREMADE_SECTIONS, atAGlanceSections, chooseYourPlanSections, premadeByKey, propertySections,
} from "../src/builder/templates.ts";

/* ── fixtures ──────────────────────────────────────────────────────────── */

const SNOW = {
  offering_id: "off-snow",
  name: "Snow clearing",
  description: "We plough, salt and log every visit.",
  features_json: JSON.stringify(["24/7 call-out", "Photos of every visit", "Salt included"]),
  prices: [
    { price_id: "p-2-3", unit_amount: 525, label: "2-3 inch push", pricing_model: "recurring", recurring_interval: "month" },
    { price_id: "p-4-6", unit_amount: 1200, label: "4-6 inch push", pricing_model: "recurring", recurring_interval: "month" },
  ],
};

/** A document of the given widgets, all in one column. */
function doc(widgets, sectionExtra = {}) {
  const d = emptyDocument();
  const s = makeSection({ ...sectionExtra });
  s.columns[0].widgets = widgets;
  d.sections = [s];
  return d;
}

const view = (d, extra = {}) => renderDocument(d, makeContext(d, { mode: "view", ...extra }));
const edit = (d, extra = {}) => renderDocument(d, makeContext(d, { mode: "edit", ...extra }));

/* ══════════════════════════════════════════════════════════════════════════
   1. The vocabulary
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-156 · every part of Brandon's sentence is its own widget", () => {
  /* D-165 CHANGED WHICH OF THESE IS A TILE, and the reasons are two.
     `catalog_card` and `price_line` are the ATOMS that the **Product Cards**
     and **Product Line Items** tiles drop, one per catalogue pick — offering
     the atom beside its picker is a second door to one job, and the second one
     skips the picker. `address_block` and `key_fact` are DELETED: an address on
     a proposal is the CUSTOMER's or the SERVICE LOCATION's, and a key fact is a
     line of text (§11.13.3). They still have to be one widget each, still
     selectable and still drawn — that is what this block asks. */
  for (const kind of ["card", "catalog_card", "price_line", "totals", "customer", "service_location"]) {
    const OFFERED = ["card", "totals", "customer", "service_location"];
    test(`${kind} is one widget the proposal builder offers`, () => {
      const def = WIDGETS_BY_KIND[kind];
      assert.ok(def, `${kind} is not in the registry`);
      assert.ok(def.adapters.includes("proposal"));
      assert.equal(!def.hidden, OFFERED.includes(kind),
        `${kind}: a tile the panel should ${OFFERED.includes(kind) ? "show" : "not show"}`);
      // A widget with a count control is a widget with hidden sub-parts, which
      // is the thing D-156 (4) deleted.
      assert.ok(!def.count, `${kind} still asks "how many?"`);
      assert.ok(def.picture.startsWith("data:image/svg+xml,"), `${kind} has no picture`);
      assert.ok(String(def.description).length > 10, `${kind} has no sentence under its name`);
    });
  }

  test("MUTATION 5 — a widget offered but not drawn is caught", () => {
    // The engine's parity test says offered ⊆ rendered. Take `card` out of
    // widgets/index.ts RENDERERS and builder-engine goes red; the three lists
    // agreeing is what stops that happening quietly.
    const { onlyNamed, onlyRendered, onlyDefined } = atomKindsAgree();
    assert.deepEqual(onlyNamed, [], "named but not both rendered and defined");
    assert.deepEqual(onlyRendered, [], "drawn but not named");
    assert.deepEqual(onlyDefined, [], "defined but not named");
    for (const k of ATOM_KINDS) assert.ok(RENDERED_KINDS.includes(k), `${k} is offered and not drawn`);
  });

  test("the composites are DELETED — not hidden, deleted", () => {
    // They were `hidden: true` — in the vocabulary, never offered — while the
    // upgrade on the way in was not switched on yet. It is on now, in BOTH
    // repos: `deserialise` here and `deserialise` in oliver-api are the only
    // two doors a stored document comes through, and each runs the pass. So no
    // document can carry one of these four kinds by the time anything draws
    // it, and the definitions are gone rather than hidden. "Replace means
    // delete" — a widget that is still there, just hidden, is the thing that
    // comes back.
    for (const kind of ["comparison_cards", "property_block", "key_facts", "priced_line"]) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined, `${kind} is still in the registry`);
      assert.ok(!widgetsFor("proposal").some((w) => w.kind === kind));
    }
    // …and what replaced each one IS there.
    for (const kind of ["card", "catalog_card", "price_line", "totals"]) {
      assert.ok(WIDGETS_BY_KIND[kind], `${kind} should have replaced a composite and is missing`);
    }
    /* D-165 went one further. `address_block` and `key_fact` were the other two
       halves of those composites for a day; neither has an Elementor name and
       neither is on the IA list, so both are deleted too — the address became
       **Customer** or **Service Location** by its binding, and a key fact
       became a line of text. Gone, not hidden, same rule. */
    for (const kind of ["address_block", "key_fact"]) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined, `${kind} is still in the registry`);
    }
    for (const kind of ["customer", "service_location"]) {
      assert.ok(WIDGETS_BY_KIND[kind], `${kind} should have replaced the address block and is missing`);
    }
  });

  test("each one gets its own Typography group, not just Content", () => {
    // §11.12: "each widget: its own Content/Typography/Spacing/Advanced".
    // Spacing and Advanced are given to every widget by the Inspector; the
    // Typography group is the one that has to be asked for, by kind.
    for (const k of ["card", "catalog_card", "price_line", "totals"]) {
      assert.ok(isTypographic(k), k);
    }
    /* `service_location`, `customer`, `business_info` and D-165's eighteen new
       standard widgets are NOT in `TYPOGRAPHIC_KINDS` yet. That Set lives in
       `src/builder/style.ts`, which belongs to the stream that owns the
       Inspector; the exact list to add is item S2→S1-1 in
       `overnight-report/D165_HANDOFF_2026-09-19.md`. Asserted as a GAP rather
       than left silent, so the day it lands this line is what tells whoever
       fixed it to come back here. */
    for (const k of ["service_location", "customer", "alert", "icon_box"]) {
      assert.equal(isTypographic(k), false, `${k} has its Typography group — update the handoff and this test`);
    }
  });

  test("they land in the group somebody would look in", () => {
    /* D-165: the panel's groups are Elementor's four, and everything that comes
       out of a client's own records — their catalogue, their customer, their
       sites — is in **Intelligent Analytics**, which is where a plugin's own
       widgets sit in a real Elementor. */
    const ia = groupByTask("proposal")
      .find((g) => g.task === "Intelligent Analytics").widgets.map((w) => w.kind);
    for (const k of ["product_cards", "product_line_items", "totals", "card", "customer", "service_location"]) {
      assert.ok(ia.includes(k), `${k} is not under Intelligent Analytics`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The card, typed
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-156 · a card is typed, and every part of it is reachable", () => {
  /* THE CARD'S OWN NAMES, which are the price table's (conformance
     2026-09-17): `heading / price / period / original_price / sale /
     features_list / footer_additional_info`. */
  const card = () => makeWidget("card", {
    heading: "Seasonal", price: "$525", period: "/mo", original_price: "$600", sale: "yes",
    description: "Everything for the season.", features_list: ["24/7 call-out", "Salt included"],
    footer_additional_info: "Prices hold to 31 March.",
  });

  test("it draws what was typed into it", () => {
    const html = view(doc([card()]));
    for (const words of ["Seasonal", "$525", "/mo", "$600", "Everything for the season.", "24/7 call-out", "Prices hold"]) {
      assert.ok(html.includes(words), `the card lost “${words}”`);
    }
  });

  test("every run is editable, and an empty one can still be clicked", () => {
    // `sale` is ON so the original-price run is drawn; behind a saving switch
    // the author turned off, a leftover number is a draft, not a price.
    const html = edit(doc([makeWidget("card", { sale: "yes" })]));
    /* `features_list.0.item_text` is ONE LEVEL DEEPER than the old
       `bullets.0`: the price table keeps its feature list in a repeater whose
       per-item field is `item_text`, and that is what all three repos store. */
    for (const path of ["heading", "price", "period", "original_price", "description",
      "features_list.0.item_text", "footer_additional_info"]) {
      assert.ok(html.includes(`data-edit="${path}"`), `${path} cannot be typed into`);
    }
    // D-01: the price is the field that measured 0×0 on the old block.
    assert.ok(html.includes('data-placeholder="$0.00"'), "an empty price has no target to click");
    assert.ok(html.includes("bx-now-slot"), "an empty price has no minimum width");
  });

  test("a card from the OLD block still draws — the upgrade may land later", () => {
    // stream A's upgrade-on-open renames these; until then a tolerant reader
    // means a half-migrated document is never a blank card.
    const legacy = makeWidget("card", {
      name: "Per-push", pitch: "Pay as it snows.", list_price: "$700", features: ["Photos"],
    });
    const html = view(doc([legacy]));
    assert.ok(html.includes("Per-push"));
    assert.ok(html.includes("Pay as it snows."));
    assert.ok(html.includes("$700"));
    assert.ok(html.includes("Photos"));
  });

  test("a card is selectable and removable on its own — it is one widget", () => {
    const a = makeWidget("card", { heading: "One" });
    const b = makeWidget("card", { heading: "Two" });
    const d = doc([a, b]);
    const html = edit(d);
    assert.ok(html.includes(`data-widget="${a.id}"`), "the first card is not its own element");
    assert.ok(html.includes(`data-widget="${b.id}"`), "the second card is not its own element");
    assert.notEqual(a.id, b.id);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The tag (D-157)
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-157 · add a tag to this card", () => {
  test("Best Price, in orange, on a card", () => {
    const w = makeWidget("card", {
      heading: "Per-push", show_ribbon: "yes", ribbon_title: "Best Price", ribbon_color: "#C2410C",
    });
    const html = view(doc([w]));
    assert.ok(html.includes("Best Price"), "the tag is not on the card");
    assert.ok(html.includes("#C2410C"), "the tag lost its colour");
    // MUTATION: return `{ text }` without the colour from tagOf and this goes red.
    assert.deepEqual(tagOf(w.props), { text: "Best Price", colour: "#C2410C", preset: "best_price" });
  });

  test("no colour means the business's own", () => {
    const w = makeWidget("card", { heading: "Seasonal", show_ribbon: "yes", ribbon_title: "Most Popular" });
    const html = renderWidget(w, makeContext(doc([w]), { mode: "view", accent: "#0C4A60" }));
    assert.ok(html.includes("Most Popular"));
    assert.ok(html.includes("#0C4A60"), "a tag with no colour must wear the brand's");
  });

  test("`recommended: true` from before D-157 is still a ribbon", () => {
    const w = makeWidget("card", { heading: "Seasonal", recommended: true });
    assert.deepEqual(tagOf(w.props), { text: "Recommended", preset: "recommended" });
    assert.ok(view(doc([w])).includes("Recommended"));
  });

  test("a tag on a priced line works the same way — one mechanism", () => {
    const w = makeWidget("price_line", {
      name: "Seasonal", unit_price: 525, show_ribbon: "yes", ribbon_title: "Recommended",
    });
    assert.ok(view(doc([w])).includes("Recommended"));
  });

  test("no tag is no ribbon, and no empty element either", () => {
    const w = makeWidget("card", { heading: "Plain" });
    assert.equal(tagOf(w.props), null);
    assert.ok(!view(doc([w])).includes("bx-card-badge"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. The product card — bound to the catalogue
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-156 · a product card loads from Products & Services", () => {
  const bound = () => makeWidget("catalog_card", {
    _ia_source: "oliver:catalogue",
    _ia_selection: { offering_id: "off-snow", price_id: "p-4-6" },
    _ia_snapshot: {
      title: "Snow clearing — 4-6 inch push", price: "$1,200.00", per: "billed monthly",
      description: "old words", bullets: ["old bullet"], amount: 1200, cadence: "billed monthly", basis: "per push",
    },
  });

  test("MUTATION 2 — the price is LIVE when the catalogue is in the room", () => {
    // The stored snapshot says $1,200.00. Move the catalogue price to $1,450
    // and the card must follow it without anybody reopening anything.
    const moved = { ...SNOW, prices: [SNOW.prices[0], { ...SNOW.prices[1], unit_amount: 1450 }] };
    const r = resolveCatalogCard(bound().props, [moved]);
    assert.equal(r.source, "live");
    assert.equal(r.price, "$1,450.00", "the card is showing a stale price");
    assert.equal(r.amount, 1450);
    // MUTATION: make renderCatalogCard call resolveCatalogCard(p) with no
    // catalogue and this line goes red — the card prints $1,200.00.
    const html = view(doc([bound()]), { catalogue: [moved] });
    assert.ok(html.includes("$1,450.00"), "the drawn card is not the live price");
  });

  test("with no catalogue in the request it shows what it was loaded with", () => {
    // The customer's page and the PDF are drawn by a server holding no
    // catalogue. A blank card there is worse than no card at all.
    const r = resolveCatalogCard(bound().props, null);
    assert.equal(r.source, "stored");
    assert.equal(r.price, "$1,200.00");
    assert.ok(view(doc([bound()])).includes("$1,200.00"));
  });

  test("the catalogue brings the name, what is included and how it is billed", () => {
    const r = resolveCatalogCard({ _ia_selection: { offering_id: "off-snow", price_id: "p-2-3" } }, [SNOW]);
    assert.equal(r.title, "Snow clearing — 2-3 inch push");
    assert.deepEqual(r.bullets, ["24/7 call-out", "Photos of every visit", "Salt included"]);
    assert.equal(r.description, "We plough, salt and log every visit.");
    assert.equal(r.basis, "per push", "the basis is the one the price's own label says (D-09)");
  });

  test("an override wins over the catalogue, and can be thrown away", () => {
    // The overrides are keyed by the CARD's own field names (conformance
    // 2026-09-17) — `heading`, not `title` — so the canvas run that writes
    // `overrides.heading` is read back by the same name. The snapshot's older
    // spelling is still read.
    const props = { ...bound().props, overrides: { heading: "Our winter plan" } };
    const r = resolveCatalogCard(props, [SNOW]);
    assert.equal(r.title, "Our winter plan");
    assert.deepEqual(r.overridden, ["heading"]);
    assert.equal(resolveCatalogCard({ ...bound().props, overrides: { title: "Older" } }, [SNOW]).title, "Older");
    // and the price is NOT overridable: a price you can type over on the card
    // is a price that no longer matches what you sell.
    assert.equal(r.price, "$1,200.00");
    assert.equal(resolveCatalogCard({ ...props, overrides: {} }, [SNOW]).title, "Snow clearing — 4-6 inch push");
  });

  test("the Binding section's `refresh`: a sent price must not move (F.2)", () => {
    // Catalogue F.2. "Keep this price" pins the figures the card was loaded
    // with, whatever the catalogue in the room says.
    const moved = { ...SNOW, prices: [SNOW.prices[0], { ...SNOW.prices[1], unit_amount: 1450 }] };
    const pinned = { ...bound().props, refresh: "snapshot_send" };
    const r = resolveCatalogCard(pinned, [moved]);
    assert.equal(r.refresh, "snapshot_send");
    assert.equal(r.source, "stored");
    assert.equal(r.price, "$1,200.00", "a pinned card followed the catalogue");
    // and the default, for every card written before the field existed, is live
    assert.equal(resolveCatalogCard(bound().props, [moved]).refresh, "live");
  });

  test("nothing chosen yet says so to the author and nothing to the customer", () => {
    const w = makeWidget("catalog_card", {});
    assert.ok(edit(doc([w])).includes("Pick one of your products"));
    assert.ok(!view(doc([w])).includes("Pick one of your products"));
  });

  test("MUTATION 1 — a card NEVER sums", () => {
    // Two product cards at $525 and $1,200 and a total: the total is $0.00.
    // Add "catalog_card" to PRICED_KINDS and this goes red.
    const t = makeWidget("totals", {});
    const d = doc([bound(), makeWidget("card", { title: "Typed", price: "$999" }), t]);
    assert.equal(widgetTotals(d, t.id, t.props).subtotal, 0, "a card reached the total");
    assert.ok(!PRICED_KINDS.includes("card"));
    assert.ok(!PRICED_KINDS.includes("catalog_card"));
  });

  test("“Use this plan” is what turns an offer into money", () => {
    // The button lives in the adapter; what it produces is a price_line, and
    // THAT is on the priced list.
    const line = makeWidget("price_line", { name: "Snow clearing", unit_price: 1200, quantity: 1 });
    const t = makeWidget("totals", {});
    const d = doc([bound(), line, t]);
    assert.equal(widgetTotals(d, t.id, t.props).subtotal, 1200);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The totals widget (D-157)
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-157 · subtotal, tax rate, discount, coupon", () => {
  const lines = () => [
    makeWidget("price_line", { name: "Seasonal", unit_price: 1000, quantity: 1 }),
    makeWidget("price_line", { name: "Salting", unit_price: 200, quantity: 2 }),
  ];

  test("the subtotal is the priced lines", () => {
    const t = makeWidget("totals", {});
    const d = doc([...lines(), t]);
    assert.equal(widgetTotals(d, t.id, t.props).subtotal, 1400);
  });

  test("MUTATION 3 — the business tax rate reaches the total", () => {
    const t = makeWidget("totals", { taxRatePercent: 7.25, taxLabel: "Ohio · Franklin" });
    const d = doc([...lines(), t]);
    const r = widgetTotals(d, t.id, t.props);
    assert.equal(r.tax, 101.5, "the tax rate was ignored");
    assert.equal(r.total, 1501.5);
    const html = view(d);
    assert.ok(html.includes("Tax 7.25% · Ohio · Franklin"), "the page does not say what the tax is");
    assert.ok(html.includes("$101.50"));
  });

  test("a per-cent discount, named on the page", () => {
    const t = makeWidget("totals", { discountPercent: 10 });
    const d = doc([...lines(), t]);
    const r = widgetTotals(d, t.id, t.props);
    assert.equal(r.discount, 140);
    assert.equal(r.total, 1260);
    assert.ok(view(d).includes("Discount 10%"), "the discount has no reason beside it");
  });

  test("a coupon, per cent or flat, and it is the code that is shown", () => {
    const pct = makeWidget("totals", { coupon: { code: "SPRING25", percentOff: 25 } });
    const flat = makeWidget("totals", { coupon: { code: "FIFTY", amountOff: 50 } });
    const d1 = doc([...lines(), pct]);
    const d2 = doc([...lines(), flat]);
    assert.equal(widgetTotals(d1, pct.id, pct.props).discount, 350);
    assert.equal(widgetTotals(d2, flat.id, flat.props).discount, 50);
    assert.ok(view(d1).includes("Discount — SPRING25"));
  });

  test("tax and a discount together, in the platform's own order", () => {
    // Tax on the subtotal, then the discount comes off — what oliver-api's
    // computeTotals has always done, and what every stored proposal was
    // totalled with. A "better" order restates money on signed documents.
    const t = makeWidget("totals", { taxRatePercent: 10, discountPercent: 10 });
    const d = doc([...lines(), t]);
    const r = widgetTotals(d, t.id, t.props);
    assert.equal(r.subtotal, 1400);
    assert.equal(r.tax, 140);
    assert.equal(r.discount, 140);
    assert.equal(r.total, 1400);
  });

  test("MUTATION 4 — it counts the lines ABOVE it, not the whole document", () => {
    const first = makeWidget("totals", { heading: "This property" });
    const below = makeWidget("price_line", { name: "Another site", unit_price: 800, quantity: 1 });
    const last = makeWidget("totals", { heading: "Your total" });
    const d = doc([...lines(), first, below, last]);
    // MUTATION: drop the `before` argument in lineTotals and the first total
    // becomes 2200 — it would be counting a site nobody has read yet.
    assert.equal(widgetTotals(d, first.id, first.props).subtotal, 1400);
    assert.equal(widgetTotals(d, last.id, last.props).subtotal, 2200);
    assert.equal(lineTotals(d, first.id).length, 2);
    assert.equal(lineTotals(d).length, 3);
  });

  test("a document written before D-157 keeps the numbers it was totalled with", () => {
    // Nothing on the widget; the proposal row said 7% and $25 off, and
    // `ctx.totals` was computed with them.
    const t = makeWidget("totals", { heading: "Your total" });
    const d = doc([...lines(), t]);
    const legacy = documentTotals(d, { taxRate: 0.07, discount: 25 });
    const html = renderDocument(d, makeContext(d, { mode: "view", totals: legacy }));
    assert.ok(html.includes("$98.00"), "the tax the document was saved with is gone");
    assert.ok(html.includes("$1,473.00"), "the total changed under a signed document");
  });

  test("the proposal ROW follows the widget — one mechanism, not two", () => {
    const t = makeWidget("totals", { taxRatePercent: 7.25, discountPercent: 10 });
    const d = doc([...lines(), t]);
    assert.equal(lastTotalsWidget(d).id, t.id);
    const m = documentMoneySettings(d);
    assert.equal(m.taxRate, 0.0725);
    assert.equal(m.discount, 140);
    // and a document whose totals widget says nothing leaves the row alone
    assert.equal(documentMoneySettings(doc([...lines(), makeWidget("totals", {})])), null);
  });

  test("the settings survive a save and a reopen", () => {
    const t = makeWidget("totals", { taxRatePercent: 7.25, taxLabel: "Ohio", discountPercent: 5, coupon: { code: "X", percentOff: 10 } });
    const back = deserialise(JSON.parse(serialise(doc([...lines(), t]))));
    const w = lastTotalsWidget(back);
    assert.deepEqual(totalsSettings(w.props), {
      // A document written before the mode existed says what it does: it has
      // a rate, so the rate is this document's own (catalogue F.1.3).
      taxMode: "document",
      taxRatePercent: 7.25, taxLabel: "Ohio", discountPercent: 5,
      // `taxRateDocument` is what the author TYPED, kept whatever the mode is,
      // so switching to "No tax" and back does not throw the number away
      // (conformance 2026-09-17, mirrored in oliver's `totalsSettings`).
      taxRateDocument: 7.25,
      taxUnresolved: false,
      coupon: { code: "X", percentOff: 10, amountOff: null },
    });
  });

  test("the three tax states, and the one that follows the business", () => {
    // catalogue F.1.3 `tax_mode`. The NUMBER is always on the widget, because
    // the customer's page and the PDF have no tax table; the MODE says whether
    // the builder keeps it up to date.
    assert.equal(totalsSettings({}).taxMode, "none");
    assert.equal(totalsSettings({ taxRatePercent: 7.25 }).taxMode, "document");
    assert.equal(totalsSettings({ taxMode: "business", taxRatePercent: 7.25 }).taxMode, "business");
    // whichever mode it is, the arithmetic reads the number and nothing else
    const t = makeWidget("totals", { taxMode: "business", taxRatePercent: 10 });
    const d = doc([makeWidget("price_line", { name: "X", unit_price: 100, quantity: 1 }), t]);
    assert.equal(widgetTotals(d, t.id, t.props).tax, 10);

    /* THE CANONICAL NAMES, and the case the sentence is for (conformance
       2026-09-17). `tax_mode` / `tax_rate` / `tax_rate_resolved` are what the
       three repos speak; the two above are read and never written. */
    assert.equal(totalsSettings({ tax_mode: "document", tax_rate: 8.25 }).taxRatePercent, 8.25);
    assert.equal(totalsSettings({ tax_mode: "none", tax_rate: 8.25 }).taxRatePercent, null,
      "No tax still taxed the document");
    assert.equal(totalsSettings({ tax_mode: "none", tax_rate: 8.25 }).taxRateDocument, 8.25,
      "switching to No tax threw away the number the author typed");
    // BUSINESS mode: the SERVER's resolved figure wins, and when nothing
    // resolved the widget says so rather than taxing at zero in silence.
    assert.equal(totalsSettings({ tax_mode: "business", tax_rate_resolved: 6.5 }).taxRatePercent, 6.5);
    assert.equal(totalsSettings({ tax_mode: "business", tax_rate_resolved: 6.5 }).taxUnresolved, false);
    assert.equal(totalsSettings({ tax_mode: "business" }).taxUnresolved, true,
      "a document taxed at the business default with no rate resolved said nothing");
    // `0` and `null` ARE DIFFERENT ANSWERS: 0 is "charges no sales tax".
    assert.equal(totalsSettings({ tax_mode: "business", tax_rate_resolved: 0 }).taxUnresolved, false);
    assert.equal(totalsSettings({ tax_mode: "business", tax_rate_resolved: 0 }).taxRatePercent, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. The address and the key fact
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-156 · the service address, and one short answer", () => {
  test("bound to a location, it prints the customer's own record", () => {
    // D-165 — the kind is `service_location` and the props did not move.
    const w = makeWidget("service_location", { locationId: "loc-1" });
    const d = doc([w]);
    const html = renderDocument(d, makeContext(d, {
      mode: "view",
      locations: { "loc-1": { name: "Riverside Plaza", address_line1: "44 Mill Road", city: "Columbus", state: "OH", postal_code: "43215" } },
    }));
    assert.ok(html.includes("Riverside Plaza"));
    assert.ok(html.includes("44 Mill Road, Columbus, OH, 43215"));
  });

  test("typed, when the location does not exist yet", () => {
    const w = makeWidget("service_location", { address: "44 Mill Road, Columbus", contact: "Ask for Dave" });
    const html = view(doc([w]));
    assert.ok(html.includes("44 Mill Road, Columbus"));
    assert.ok(html.includes("Ask for Dave"));
  });

  test("a short answer takes a merge tag, and an unfilled one is a chip for the author", () => {
    /* D-165 — `key_fact` is DELETED and a key fact is a line of text with its
       label in bold (§11.13.3), so the merge tag now lives in a Text Editor.
       The behaviour it was protecting is unchanged and is what this asks. */
    const w = makeWidget("paragraph", { text: "**Customer** {{customer.name}}" });
    const d = doc([w]);
    assert.ok(renderDocument(d, makeContext(d, { mode: "view", merge: { "customer.name": "Rolling In It" } }))
      .includes("Rolling In It"));
    assert.ok(edit(d).includes("bx-tok"), "an unfilled tag is not marked for the author");
  });

  test("an empty widget leaves nothing behind on the customer's page", () => {
    assert.ok(!view(doc([makeWidget("paragraph", { text: "" })])).includes("bx-p"));
    assert.ok(!view(doc([makeWidget("service_location", {})])).includes("bx-address"));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. The ready-made sections — container trees, not composites
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-156 · “Choose your plan” is a ready-made SECTION", () => {
  // ONE SECTION, with a BOX in it. This was two sections and a `buildAll`,
  // because a section had one set of columns and nothing could hold a row.
  // Containers landed in the same release, so the pattern is Brandon's
  // sentence exactly: a header, a line of copy under it, then a row of cards
  // INSIDE the same section — and placing it is one step and one undo.
  test("it is a heading and a line of copy, then a row of product cards", () => {
    const [s] = chooseYourPlanSections();
    const kids = s.columns[0].widgets;
    assert.deepEqual(kids.map((w) => w.kind), ["heading", "paragraph", "container"]);
    assert.equal(kids[1].props.text.startsWith("Pick one"), true,
      "Brandon asked for a text field under the header that says Pick One");
    assert.equal(kids[2].style.direction, "row", "the cards are not in a row");
    assert.deepEqual(kids[2].children.map((w) => w.kind),
      ["catalog_card", "catalog_card", "catalog_card"]);
  });

  test("every card in it is its own widget, with its own id", () => {
    const [s] = chooseYourPlanSections();
    const ids = s.columns[0].widgets[2].children.map((w) => w.id);
    assert.equal(new Set(ids).size, 3);
  });

  test("the property pattern is four widgets, not one block", () => {
    const [s] = propertySections();
    /* D-165 — the address is **Service Location** and the rate card is priced
       lines, so what is on the page and what is in the total are one list. */
    assert.deepEqual(s.columns[0].widgets.map((w) => w.kind),
      ["heading", "service_location", "price_line", "totals"]);
  });

  test("at a glance is four short answers, one widget each", () => {
    const [s] = atAGlanceSections();
    const box = s.columns[0].widgets[0];
    assert.equal(box.kind, "container");
    // D-165 — a key fact is a line of text with its label in bold.
    assert.deepEqual(box.children.map((w) => w.kind),
      ["paragraph", "paragraph", "paragraph", "paragraph"]);
    assert.match(box.children[0].props.text, /^\*\*Customer\*\* /);
  });

  test("the gallery offers all three, and says what each is for", () => {
    for (const key of ["choose_your_plan", "this_property", "at_a_glance_facts"]) {
      const p = premadeByKey(key);
      assert.ok(p, `${key} is not in the gallery`);
      assert.ok(p.description.length > 20, `${key} has no sentence`);
      // ONE section, always: `buildAll` is deleted with the two-section shape.
      assert.equal(p.buildAll, undefined, `${key} still has a second way in`);
      assert.ok(p.build().columns.length >= 1);
    }
    assert.ok(PREMADE_SECTIONS.some((p) => p.key === "choose_your_plan"));
  });

  test("placed, it renders — the whole pattern, in order", () => {
    const d = emptyDocument();
    d.sections = chooseYourPlanSections();
    const html = view(d, { catalogue: [SNOW] });
    assert.ok(html.includes("Choose your plan"));
    assert.ok(html.includes("Pick one."));
  });
});

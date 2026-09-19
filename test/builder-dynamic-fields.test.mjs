// test/builder-dynamic-fields.test.mjs — D-165 stream 3, scope 11.13.2.
//
// Brandon, 2026-09-19, on the fifth telling:
//
//   "You have all this random details on the side. I never asked for any of
//    that. The fields should be dynamic. Load a customer and it auto loads
//    customer information. Then cards or line items that you can load the
//    products from."
//
// So what is asserted here is exactly that sentence, and the deletion under it:
//
//   1. the Details group is GONE — not hidden. No export of it survives, and
//      nothing in the proposal adapter renders a list of boxes.
//   2. Customer / Service Location / Business Info FILL FROM THE RECORD, and
//      refill when the record changes.
//   3. a field the author retypes stops tracking, SAYS so, and can be put back.
//   4. `settings.merge` is still the ONE store, written from the page.
//   5. Send's blank rule is unchanged and still walks the tree at any depth.
//   6. the two product tiles drop ATOMIC widgets — cards in a row Container,
//      lines in a stack — and the scopes mean what they say.
//   7. the deleted kinds upgrade on open, and an untouched document comes back
//      BY IDENTITY.
//
// ── THE SIX MUTATIONS, each run by EXECUTING the real function, seen red,
//    then restored (2026-09-19) ──────────────────────────────────────────────
//   M1 `resolveRecord` ignores `overrides`        → a retyped name reverts, red
//   M2 `resolveRecord` ignores the record          → "pick a customer and it
//                                                     fills" is false, red
//   M3 `setMergeValue` stores "" instead of
//      deleting the key                            → a cleared blank counts as
//                                                     filled, Send lets it go, red
//   M4 `tokensUsedBy` reads the top of each
//      column only (the pre-D-164 walk)            → a token inside a box is
//                                                     invisible to Send, red
//   M5 `nodesForPicks` returns bare cards with
//      no Container                                → cards stack instead of
//                                                     sitting in a row, red
//   M6 `upgradeProposalDocument` returns a new
//      object even when nothing changed            → every opened draft saves
//                                                     dirty, red
import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { emptyDocument, makeSection, makeWidget, makeContainer } from "../src/builder/model.ts";
import { WIDGETS_BY_KIND, widgetsFor } from "../src/builder/registry.ts";
import * as documentDetails from "../src/builder/proposal/documentDetails.ts";
import {
  RECORD_FIELDS, RECORD_KINDS, RECORD_WIDGET_DEFS, isRecordKind, layoutOf, overriddenOn,
  overrideProps, putFieldBackProps, renderRecordBlock, resolveRecord, shownFields, showKey,
} from "../src/builder/proposal/recordWidgets.ts";
import {
  CATALOGUE_TILE_DEFS, TERMS_TILE_KIND, cardFromPick, isCatalogueTile, isPickerTile,
  lineFromPick, nodesForClauses, nodesForPicks,
} from "../src/builder/proposal/catalogueTiles.ts";
/* THE ONE UPGRADE (integration, 2026-09-19). `proposal/upgradeProposal.ts` is
   deleted: `src/builder/upgrade.ts` converts eleven kinds INSIDE `deserialise`,
   which is the one door a stored document comes through, and the second table
   disagreed with it about what an address block leaves behind. These claims are
   unchanged and are now made against the table that runs. */
import {
  DELETED_KINDS, addressBlockBecomes, upgradeDocument,
} from "../src/builder/upgrade.ts";
import { choicesForScope, choicesOf, categoriesOf } from "../src/components/oliver/ProposalCatalogPicker.tsx";
import { makeContext } from "../src/builder/render.ts";
import { TYPED_NOT_LIVE, PUT_IT_BACK } from "../src/builder/widgets/binding.ts";

const {
  bindPlansToLocation, blankTokens, blanksRefusal, mergeValues, plainLabel, setMergeValue,
  tokensUsedBy, widgetForToken,
} = documentDetails;

/** A document holding these widgets in one section's first column. */
function docWith(...widgets) {
  const s = makeSection({ label: "S" });
  s.columns[0].widgets = widgets;
  return { ...emptyDocument(), sections: [s] };
}

const HARBOURVIEW = {
  customer: {
    name: "Harborview Property Group",
    company: "Harborview Property Group",
    contact: "Dana Whitfield",
    email: "dana@harborview.example",
    phone: "(555) 0142",
    billing_address: "18 Quay Street, Northbrook, IL, 60062",
  },
  service_location: {
    name: "Harborview North Lot",
    address: "18 Quay Street, Northbrook, IL, 60062",
    access_notes: "Gate code 4412, park by the loading bay",
  },
  business_info: {
    logo: "data:image/png;base64,AAA",
    name: "Summit Lawn & Landscape",
    phone: "(555) 0900",
    email: "hello@summit.example",
    licence: "IL-LC-88214",
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   1. The Details group is DELETED, not hidden
   ══════════════════════════════════════════════════════════════════════════ */

describe("the Details group is gone (11.13)", () => {
  test("nothing exports a Details row, a reconciler or the counter's model", () => {
    for (const name of [
      "readDetails", "writeDetails", "reconcileDetails", "detailsMerge",
      "detailsStartOpen", "readLegacyDetails", "LEGACY_DETAILS_KEY",
    ]) {
      assert.equal(
        documentDetails[name], undefined,
        `${name} is still exported — the Details group was deleted, not hidden`,
      );
    }
  });

  test("the one store and the one blank rule survive, and are ASSERTED PRESENT", () => {
    // Absence-based checking cuts both ways: what stays has to be named too,
    // or the next pass deletes it by accident.
    for (const name of ["mergeValues", "setMergeValue", "blankTokens", "widgetForToken", "plainLabel"]) {
      assert.equal(typeof documentDetails[name], "function", `${name} must still exist`);
    }
  });

  test("the refusal points at the PAGE, not at boxes on the left", () => {
    const words = blanksRefusal(["contract.start_date"], {});
    assert.match(words, /Service term starts/);
    assert.match(words, /on the page/);
    assert.doesNotMatch(words, /Details boxes/i);
  });

  test("a raw token never reaches a screen", () => {
    assert.equal(plainLabel("snow_trigger"), "Trigger depth");
    assert.equal(plainLabel("gate_access_window"), "Gate access window");
    assert.equal(plainLabel("contract.end_date"), "Service term ends");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 + 3. The three widgets fill themselves, and an edit stops tracking
   ══════════════════════════════════════════════════════════════════════════ */

describe("dynamic fields — the record fills the page", () => {
  test("all three are in the ONE vocabulary and offered to a proposal", () => {
    const offered = widgetsFor("proposal").map((w) => w.kind);
    for (const kind of RECORD_KINDS) {
      assert.ok(WIDGETS_BY_KIND[kind], `${kind} is not in the registry`);
      assert.ok(offered.includes(kind), `${kind} is not offered in the proposal pane`);
    }
    assert.deepEqual(RECORD_WIDGET_DEFS.map((d) => d.label), ["Customer", "Service Location", "Business Info"]);
  });

  test("11.13.2's own field list, and nothing invented beside it", () => {
    assert.deepEqual(RECORD_FIELDS.customer.map((f) => f.key),
      ["name", "company", "contact", "email", "phone", "billing_address"]);
    assert.deepEqual(RECORD_FIELDS.service_location.map((f) => f.key),
      ["name", "address", "site_contact", "access_notes"]);
    assert.deepEqual(RECORD_FIELDS.business_info.map((f) => f.key),
      ["logo", "name", "phone", "email", "licence"]);
  });

  test("PICK A CUSTOMER AND IT FILLS — every field, from the record", () => {
    const w = makeWidget("customer", WIDGETS_BY_KIND.customer.defaults);
    const fields = resolveRecord("customer", w.props, HARBOURVIEW.customer);
    // ASSERT PRESENCE: the words are on the block, not merely "no error".
    assert.equal(fields.find((f) => f.key === "name").value, "Harborview Property Group");
    assert.equal(fields.find((f) => f.key === "email").value, "dana@harborview.example");
    assert.ok(fields.every((f) => !f.overridden), "nothing is overridden on a fresh block");
  });

  test("CHANGE THE CUSTOMER AND IT REFILLS — nothing is stored on the widget", () => {
    const w = makeWidget("customer", WIDGETS_BY_KIND.customer.defaults);
    const first = resolveRecord("customer", w.props, HARBOURVIEW.customer);
    const second = resolveRecord("customer", w.props, { name: "Northgate Facilities", email: "ops@northgate.example" });
    assert.equal(first.find((f) => f.key === "name").value, "Harborview Property Group");
    assert.equal(second.find((f) => f.key === "name").value, "Northgate Facilities");
    // The widget's own props never mention either name. That is WHY it refills.
    assert.equal(JSON.stringify(w.props).includes("Harborview"), false);
  });

  test("AN EDITED FIELD STOPS TRACKING, SAYS SO, AND COMES BACK", () => {
    const w = makeWidget("customer", WIDGETS_BY_KIND.customer.defaults);
    const typed = { ...w.props, ...overrideProps(w.props, "name", "Harborview PG (north)") };
    const fields = resolveRecord("customer", typed, HARBOURVIEW.customer);
    const name = fields.find((f) => f.key === "name");
    assert.equal(name.value, "Harborview PG (north)");
    assert.equal(name.overridden, true);
    assert.equal(name.live, "Harborview Property Group", "the record is still underneath");
    assert.deepEqual(overriddenOn("customer", typed), ["name"]);

    // The page SAYS it stopped tracking, in F.2's own sentence.
    const html = renderRecordBlock({ ...w, props: typed }, makeContext(emptyDocument(), { mode: "edit" }),
      { customer: HARBOURVIEW.customer });
    assert.match(html, /data-overridden="1"/);
    assert.ok(html.includes(TYPED_NOT_LIVE), "the page must say Typed, not live");
    assert.ok(PUT_IT_BACK.length > 0);

    const back = { ...typed, ...putFieldBackProps(typed, "name") };
    assert.equal(resolveRecord("customer", back, HARBOURVIEW.customer).find((f) => f.key === "name").value,
      "Harborview Property Group");
    assert.deepEqual(overriddenOn("customer", back), []);
  });

  test("an override of \"\" is a real answer and is kept", () => {
    const w = makeWidget("customer", WIDGETS_BY_KIND.customer.defaults);
    const blanked = { ...w.props, ...overrideProps(w.props, "phone", "") };
    const phone = resolveRecord("customer", blanked, HARBOURVIEW.customer).find((f) => f.key === "phone");
    assert.equal(phone.value, "");
    assert.equal(phone.overridden, true, "clearing a field is a decision, not an absence");
  });

  test("the field choice and the layout are Content-tab controls", () => {
    const def = WIDGETS_BY_KIND.service_location;
    const sections = def.controls.filter((c) => c.section === "Fields").map((c) => c.key);
    assert.deepEqual(sections,
      ["show_name", "show_address", "show_site_contact", "show_access_notes", "layout"]);
    // Absent means ON — a block dropped on the page shows what the record has.
    assert.equal(shownFields("service_location", {}).length, 4);
    assert.equal(shownFields("service_location", { [showKey("address")]: false }).length, 3);
    assert.equal(layoutOf({}), "stacked");
    assert.equal(layoutOf({ layout: "two_columns" }), "two_columns");
    assert.equal(layoutOf({ layout: "nonsense" }), "stacked");
  });

  test("the value is edited ON THE PAGE, through the engine's own marker", () => {
    const w = makeWidget("service_location", WIDGETS_BY_KIND.service_location.defaults);
    const html = renderRecordBlock(w, makeContext(emptyDocument(), { mode: "edit" }),
      { service_location: HARBOURVIEW.service_location });
    assert.match(html, /data-edit="overrides\.name"/);
    assert.match(html, /data-edit="overrides\.address"/);
    assert.ok(html.includes("Harborview North Lot"));
  });

  test("an empty block on a CUSTOMER's copy prints nothing unless asked", () => {
    const w = makeWidget("customer", { ...WIDGETS_BY_KIND.customer.defaults, on_empty: "hide" });
    assert.equal(renderRecordBlock(w, makeContext(emptyDocument(), { mode: "view" }), {}), "");
    const gap = makeWidget("customer", { ...WIDGETS_BY_KIND.customer.defaults, on_empty: "placeholder" });
    assert.match(renderRecordBlock(gap, makeContext(emptyDocument(), { mode: "view" }), {}), /bx-record-empty/);
  });

  test("A SERVICE LOCATION THE AUTHOR POINTED SOMEWHERE READS THAT SITE", () => {
    /* FOUND BY DRIVING IT, 2026-09-19. The canvas read the record book and
       the server read the widget's own `locationId` (documentModel.js
       `flatRecord`), so a block bound to one site showed one name in the
       editor and printed the other on the PDF. The PDF was right: the author
       pointed that block somewhere, and changing the customer does not
       un-point it. One reading now, and this is what pins it. */
    const w = makeWidget("service_location", {
      ...WIDGETS_BY_KIND.service_location.defaults, locationId: "abc",
    });
    const ctx = makeContext(emptyDocument(), {
      mode: "edit",
      locations: { abc: { name: "South Lot", address_line1: "9 Dock Road", city: "Northbrook", state: "IL" } },
    });
    const html = renderRecordBlock(w, ctx, { service_location: HARBOURVIEW.service_location });
    assert.ok(html.includes("South Lot"), "the block ignored the site it was pointed at");
    assert.ok(!html.includes("Harborview North Lot"), "the block read the top bar over the author");
    assert.ok(html.includes("9 Dock Road"));

    // Pointed nowhere, it is the document's own site, as it always was.
    const loose = makeWidget("service_location", WIDGETS_BY_KIND.service_location.defaults);
    assert.ok(renderRecordBlock(loose, ctx, { service_location: HARBOURVIEW.service_location })
      .includes("Harborview North Lot"));
  });

  test("ONE CUSTOMER'S ADDRESS NEVER LANDS ON ANOTHER CUSTOMER'S PAPER", () => {
    /* FOUND BY DRIVING IT, 2026-09-19. A Service Location bound to
       Harborview's yard, on a document whose customer was then changed to
       Hope Ministries, printed Harborview's address on Hope Ministries'
       agreement. The canvas could not show it (it holds only the picked
       customer's locations) while the PDF could, so it stayed invisible. */
    const bound = makeWidget("service_location", { locationId: "harborview-yard" });
    const mine = makeWidget("service_location", { locationId: "hope-north" });
    const loose = makeWidget("service_location", { locationId: "" });
    const doc = docWith(bound, mine, loose);
    const out = bindPlansToLocation(doc, "hope-main", ["hope-main", "hope-north"]);
    const at = (i) => out.sections[0].columns[0].widgets[i].props.locationId;
    assert.equal(at(0), "hope-main", "a site from another customer was left on the page");
    assert.equal(at(1), "hope-north", "a site the author picked was moved out from under them");
    assert.equal(at(2), "hope-main", "an unbound block was not given the document's own site");
  });

  test("NOT KNOWING the locations yet never re-points anything", () => {
    // Absence-based guards fail open. "We have not loaded them" must not read
    // as "this customer has none", which would move every bound block on open.
    const bound = makeWidget("service_location", { locationId: "harborview-yard" });
    const doc = docWith(bound);
    assert.equal(bindPlansToLocation(doc, "hope-main", []), doc, "it re-pointed on an empty list");
    assert.equal(bindPlansToLocation(doc, "hope-main"), doc, "it re-pointed with no list at all");
  });

  test("isRecordKind is the one door and does not answer yes to anything else", () => {
    assert.equal(isRecordKind("customer"), true);
    assert.equal(isRecordKind("address_block"), false);
    assert.equal(isRecordKind("paragraph"), false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4 + 5. The ONE store, and the ONE blank rule
   ══════════════════════════════════════════════════════════════════════════ */

describe("settings.merge — one store, written from the page", () => {
  test("a value set from the page is read back, and clearing it REMOVES the key", () => {
    const d0 = docWith(makeWidget("paragraph", { text: "We plow at {{snow_trigger}}." }));
    const d1 = setMergeValue(d0, "snow_trigger", "2 inches");
    assert.deepEqual(mergeValues(d1), { snow_trigger: "2 inches" });
    const d2 = setMergeValue(d1, "snow_trigger", "");
    assert.deepEqual(mergeValues(d2), {});
    assert.equal("merge" in (d2.settings || {}), false, "an empty store leaves no key behind");
  });

  test("setting the same value twice returns the SAME document by identity", () => {
    const d1 = setMergeValue(docWith(makeWidget("paragraph", { text: "x" })), "a", "1");
    assert.equal(setMergeValue(d1, "a", "1"), d1);
  });

  test("a blank is refused, named in plain words, and points at the widget", () => {
    const inner = makeWidget("paragraph", { text: "Trigger: {{snow_trigger}}" });
    const doc = docWith(makeContainer({ direction: "row" }, [inner]));
    // THE TREE, not the top of the column (D-164). A tag inside a box counts.
    assert.deepEqual(tokensUsedBy(doc), ["snow_trigger"]);
    assert.deepEqual(blankTokens(doc, {}), ["snow_trigger"]);
    assert.deepEqual(blankTokens(doc, { snow_trigger: "2 inches" }), []);
    const at = widgetForToken(doc, "snow_trigger");
    assert.equal(at.widgetId, inner.id, "the jump must land on the widget that uses it");
  });

  test("a token on an INTERNAL section is never asked for", () => {
    const s = makeSection({ label: "Crew" });
    s.visibility = "internal";
    s.columns[0].widgets = [makeWidget("paragraph", { text: "{{crew_note}}" })];
    assert.deepEqual(blankTokens({ ...emptyDocument(), sections: [s] }, {}), []);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. The tiles that load products
   ══════════════════════════════════════════════════════════════════════════ */

const CATALOGUE = [
  {
    offering_id: "o1", name: "Per-push Plowing", category_name: "Snow",
    description: "One push per storm event.", features_json: '["Plow","Stack"]',
    prices: [
      { price_id: "p1", unit_amount: 525, label: "2-3 inch push" },
      { price_id: "p2", unit_amount: 700, label: "4-6 inch push" },
    ],
  },
  {
    offering_id: "o2", name: "Salting", category_name: "Snow",
    prices: [{ price_id: "p3", unit_amount: 180, label: "Per application" }],
  },
  { offering_id: "o3", name: "Spring Cleanup", category_name: "Grounds", prices: [] },
];

describe("Product Cards and Product Line Items — the tiles", () => {
  test("both tiles are offered, and neither is a widget anything stores", () => {
    const offered = widgetsFor("proposal").map((w) => w.kind);
    for (const d of CATALOGUE_TILE_DEFS) assert.ok(offered.includes(d.kind), `${d.kind} not offered`);
    assert.equal(isCatalogueTile("product_cards"), true);
    assert.equal(isCatalogueTile("catalog_card"), false, "what LANDS is an atomic widget");
    assert.equal(isPickerTile(TERMS_TILE_KIND), true);
  });

  test("the three scopes mean what they say", () => {
    assert.equal(choicesOf(CATALOGUE).length, 4, "two tiers, one price, one priceless offering");
    assert.deepEqual(categoriesOf(CATALOGUE), ["Snow", "Grounds"]);
    assert.equal(choicesForScope(CATALOGUE, "all", "", []).length, 4);
    assert.equal(choicesForScope(CATALOGUE, "category", "Snow", []).length, 3);
    assert.equal(choicesForScope(CATALOGUE, "category", "Grounds", []).length, 1);
    // An unknown or unchosen category is NOTHING, never everything.
    assert.equal(choicesForScope(CATALOGUE, "category", "", []).length, 0);
    assert.equal(choicesForScope(CATALOGUE, "category", "Nope", []).length, 0);
    assert.equal(choicesForScope(CATALOGUE, "picked", "", ["o1::p2", "o2::p3"]).length, 2);
  });

  test("cards land in a ROW CONTAINER, lines land in a STACK", () => {
    const picks = [
      { offering: CATALOGUE[0], price: CATALOGUE[0].prices[0] },
      { offering: CATALOGUE[1], price: CATALOGUE[1].prices[0] },
    ];
    const cards = nodesForPicks("product_cards", picks);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].kind, "container");
    assert.equal(cards[0].style.direction, "row");
    assert.deepEqual(cards[0].children.map((c) => c.kind), ["catalog_card", "catalog_card"]);

    const lines = nodesForPicks("product_line_items", picks);
    assert.deepEqual(lines.map((l) => l.kind), ["price_line", "price_line"]);
    assert.equal(nodesForPicks("product_cards", []).length, 0);
  });

  test("a dropped card carries the live price, the binding and the snapshot", () => {
    const card = cardFromPick(CATALOGUE[0], CATALOGUE[0].prices[1]);
    assert.equal(card.props.price, "700");
    assert.deepEqual(card.props._ia_selection, { offering_id: "o1", price_id: "p2" });
    assert.equal(card.props._ia_source, "oliver:catalogue");
    assert.ok(card.props._ia_snapshot, "the customer's page has no catalogue to read");
    const line = lineFromPick(CATALOGUE[1], CATALOGUE[1].prices[0]);
    assert.equal(line.props.unit_price, 180);
    assert.equal(line.props.quantity, 1);
    assert.equal(line.props.unit_label, "Per application");
  });

  test("Terms land as PLAIN TEXT — a heading and a Text Editor per clause", () => {
    const nodes = nodesForClauses([
      { clause_key: "a", title: "Payment", body: "Invoices are due in 30 days." },
      { clause_key: "b", title: "Access", body: "" },
    ]);
    assert.deepEqual(nodes.map((n) => n.kind), ["heading", "paragraph", "heading"]);
    assert.equal(nodes[1].props.text, "Invoices are due in 30 days.");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. Upgrade on open
   ══════════════════════════════════════════════════════════════════════════ */

/** One widget through the ONE upgrade, and what it came back as. */
const upgradeOne = (w) => {
  const doc = docWith(w);
  return upgradeDocument(doc).sections[0].columns[0].widgets;
};

describe("the deleted kinds upgrade on open", () => {
  test("EVERY deleted kind converts — the half stream 3 owns", () => {
    /* WHAT THIS ASSERTS AND WHAT IT DOES NOT.
       "Replace means delete" has two halves: a stored one CONVERTS, and the
       pane stops OFFERING it. The conversion is asserted below, kind by kind.
       The other half is asserted at integration in
       `test/builder-widget-set.test.mjs` — "none of them is in the registry or
       the renderer" — and it holds: none of these has a registry row. */
    for (const k of DELETED_KINDS) {
      const out = upgradeOne(makeWidget(k, { label: "L", value: "V", text: "T", title: "T" }));
      assert.ok(out.length >= 1, `${k} converts to nothing at all`);
      assert.equal(out[0].kind === k, false, `${k} came back as itself — it did not convert`);
    }
  });

  test("an address block becomes the site, or the customer when it says so", () => {
    assert.equal(addressBlockBecomes({ locationId: "abc" }), "service_location");
    assert.equal(addressBlockBecomes({ heading: "Bill to" }), "customer");
    assert.equal(addressBlockBecomes({ heading: "Where we work" }), "service_location");
  });

  test("a typed address block keeps its words, as overrides on the new block", () => {
    const [w] = upgradeOne(makeWidget("address_block", {
      heading: "Bill to", name: "Harborview PG", address: "18 Quay Street", contact: "Dana",
    }));
    assert.equal(w.kind, "customer");
    assert.equal(w.props.overrides.name, "Harborview PG");
    assert.equal(w.props.overrides.contact, "Dana");
  });

  test("a key fact, a footer note, a header and a plan all become standard parts", () => {
    // "**Label** value" — `render.boldRuns` is the one piece of mark-up a Text
    // Editor understands, which is what makes §11.13.3's "label bold + value"
    // true on all four surfaces rather than printing its asterisks.
    assert.equal(upgradeOne(makeWidget("key_fact", { label: "Trigger", value: "2 in" }))[0].props.text,
      "**Trigger** 2 in");
    assert.equal(upgradeOne(makeWidget("footer_note", { text: "Small print" }))[0].kind, "paragraph");
    const [header] = upgradeOne(makeWidget("doc_header", { logoUrl: "data:x", title: "Agreement" }));
    assert.equal(header.kind, "container");
    // A row holding the logo and a column of words — the words are a box of
    // their own so a subtitle sits UNDER the title rather than beside the
    // logo. §11.13.3's "Container(row){Image, Heading}", with the heading in
    // the words box.
    assert.deepEqual(header.children.map((c) => c.kind), ["image", "container"]);
    assert.deepEqual(header.children[1].children.map((c) => c.kind), ["heading"]);
    const [planBox] = upgradeOne(makeWidget("property_plan", {
      heading: "North lot", locationId: "ABC", rows: [{ label: "Gate", value: "4412" }],
    }));
    assert.equal(planBox.kind, "container", "a plan becomes a BOX holding its parts");
    assert.deepEqual(planBox.children.map((n) => n.kind), ["heading", "service_location", "paragraph"]);
  });

  test("a document with nothing to convert comes back BY IDENTITY", () => {
    const doc = docWith(makeWidget("heading", { text: "Hello" }));
    assert.equal(upgradeDocument(doc), doc);
  });

  test("a deleted kind inside a BOX is converted too", () => {
    const doc = docWith(makeContainer({ direction: "row" }, [makeWidget("key_fact", { label: "A", value: "B" })]));
    const out = upgradeDocument(doc);
    assert.notEqual(out, doc);
    assert.equal(out.sections[0].columns[0].widgets[0].children[0].kind, "paragraph");
  });
});

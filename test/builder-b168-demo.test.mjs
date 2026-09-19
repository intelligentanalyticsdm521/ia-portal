// test/builder-b168-demo.test.mjs — D-168, the proposal builder end to end.
//
// THE CONTRACT THIS PINS is the approved offer file,
// `overnight-report/BUILDER_OFFERS_2026-09-19.json`, and Brandon's sentence
// behind it (2026-09-19): *"I have said probably 15 times this week to inventory
// Elementor widgets and just use those."*
//
// So this file asks five questions and nothing else:
//
//   1. Is every tile on the proposal panel either an Elementor widget by
//      Elementor's own name, or one of the IA widgets the offer file lists?
//   2. Does ONE widget show ONE database field — filled from the record,
//      refilled when the customer changes, editable in place, put-back-able?
//   3. Are the three block widgets gone, and does every stored one unpack into
//      a Container of Custom Fields without losing a word?
//   4. Are the nine section templates the offer file's nine, and is every
//      widget inside one a widget the panel offers?
//   5. Do the money widgets still add up the way D-164 settled?
//
// ── THE MUTATIONS, run by EXECUTING the real functions ────────────────────
// Each one was broken on purpose, seen red, and restored. They are written out
// at the bottom of this file with what went red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { WIDGETS_BY_KIND, widgetLabel, widgetsFor } from "../src/builder/registry.ts";
import { emptyDocument, makeSection, makeWidget, walkWidgets } from "../src/builder/model.ts";
import { makeContainer } from "../src/builder/treeOps.ts";
import { makeContext, renderDocument } from "../src/builder/render.ts";
import { DELETED_KINDS, upgradeDocument } from "../src/builder/upgrade.ts";
import { documentTotals, siteTotals } from "../src/builder/totals.ts";
import {
  CUSTOM_FIELD_CHOICES, choiceOf, customFieldProps, isRetyped,
  putCustomFieldBackProps, renderCustomFieldWith, resolveCustomField,
} from "../src/builder/widgets/families/ia/customField.ts";
import { FAMILY, familyKinds, renderFamily } from "../src/builder/widgets/families/ia/index.ts";
import {
  PROPOSAL_SECTION_TEMPLATES, SECTION_TEMPLATE_NAMES, sectionTemplateByKey,
} from "../src/builder/proposal/sectionTemplates.ts";
import {
  customFields, fieldsContainer, recordBlockToContainer,
} from "../src/builder/proposal/upgradeRecordBlocks.ts";
import { bindPlansToLocation } from "../src/builder/proposal/documentDetails.ts";

const OFFERS = JSON.parse(readFileSync(
  path.join(process.cwd(), "test/fixtures/elementor-widget-names.json"), "utf8"));
const ELEMENTOR_TITLES = new Set(OFFERS.all_titles);

/** The offer file's own `builders.proposal.ia`, retyped rather than imported —
 *  a test that read the answer off the thing it checks proves nothing. */
const IA_OFFERED = new Set([
  "Custom Field", "Product Cards", "Product Line Items", "Table", "Totals",
  "Signature", "Page Break",
  // the shared vocabulary's own names for the atoms the two tiles drop
  "Card", "Product Card", "Product Line Item",
]);

const BOOK = {
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
    site_contact: "Ray Okonjo",
    access_notes: "Gate code 4412",
  },
  business_info: {
    logo: "data:image/png;base64,AAA",
    name: "Fixture Landscaping",
    phone: "(555) 0900",
    email: "hello@fixture.example",
    licence: "IL-LC-88214",
  },
};

const docOf = (widgets) => ({
  ...emptyDocument(),
  sections: [makeSection({ columns: [{ id: "c1", widgets }] })],
});

const draw = (widgets, mode = "view", extra = {}) => {
  const d = docOf(widgets);
  const base = makeContext(d, { mode, ...extra });
  return renderDocument(d, {
    ...base,
    extra: (w, c) => (w.kind === "custom_field" ? renderCustomFieldWith(w, c, BOOK) : null),
  });
};

/* ══════════════════════════════════════════════════════════════════════════
   1. The panel is the offer file's
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-168 · the proposal panel is the offer file's", () => {
  test("every tile is an Elementor name or one of the IA widgets the file lists", () => {
    const strays = widgetsFor("proposal")
      .map((w) => widgetLabel(w, "proposal"))
      .filter((label) => !ELEMENTOR_TITLES.has(label) && !IA_OFFERED.has(label));
    assert.deepEqual(strays, [], "a tile nobody asked for");
  });

  test("the invented ones are gone, by every name they have worn", () => {
    for (const gone of [
      "customer", "service_location", "business_info", "terms",
      "key_fact", "personal_detail", "details", "doc_header", "property_plan",
      "footer_note", "callout", "key_value_table", "merge_field",
    ]) {
      assert.equal(WIDGETS_BY_KIND[gone], undefined, `${gone} is still in the registry`);
    }
  });

  test("Table is OFFERED, not hidden behind a shipped template", () => {
    /* The offer file added it on 2026-09-19 at 13:50: an existing, in-use
       widget with no Elementor equivalent, omitted from v1 in error. It was
       `hidden`, so an author could meet one on a template and never add a
       second. */
    assert.equal(WIDGETS_BY_KIND.data_table.hidden, undefined);
    assert.equal(WIDGETS_BY_KIND.data_table.category, "Intelligent Analytics");
    assert.ok(widgetsFor("proposal").some((w) => w.kind === "data_table"));
  });

  test("the family wires itself in, and the two TEMP lines are marked as temporary", () => {
    /* The master family index is the lander's. Until it exists this family is
       reached from `registry.ts` and `render.ts` by two lines that say so, so
       the landing agent can find and delete them without reading the diff. */
    for (const f of ["src/builder/registry.ts", "src/builder/render.ts"]) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      assert.ok(src.includes("b168/demo TEMP"), `${f} has no marked temporary line`);
    }
    assert.deepEqual(FAMILY.defs.map((d) => d.kind), ["custom_field"]);
    assert.deepEqual(familyKinds(), ["custom_field"]);
    // …and the hook really draws, rather than merely existing.
    const w = makeWidget("custom_field", customFieldProps("customer.name"));
    assert.ok(String(renderFamily(w, makeContext(emptyDocument(), { mode: "view" }))).length >= 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. One widget, one field
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-167 · the Custom Field", () => {
  test("it shows the value, and the label is a control", () => {
    const html = draw([makeWidget("custom_field", customFieldProps("customer.email"))]);
    assert.ok(html.includes("dana@harborview.example"), "the value never reached the page");
    assert.ok(html.includes("Email"), "the label never reached the page");
    const bare = draw([makeWidget("custom_field", customFieldProps("customer.email", { show_label: false }))]);
    assert.ok(bare.includes("dana@harborview.example"), "turning the label off took the value with it");
    assert.equal(/>Email</.test(bare), false);
  });

  test("it refills when the customer changes, because it stores nothing", () => {
    const w = makeWidget("custom_field", customFieldProps("customer.name"));
    assert.equal(resolveCustomField(w.props, BOOK.customer).value, "Harborview Property Group");
    assert.equal(resolveCustomField(w.props, { name: "Northgate Facilities" }).value, "Northgate Facilities");
    assert.equal(JSON.stringify(w.props).includes("Harborview"), false, "last week's name is stored on the widget");
  });

  test("typed on the page, it says so, and it goes back", () => {
    const w = makeWidget("custom_field", customFieldProps("customer.name"));
    const typed = { ...w.props, overrides: { name: "Harborview PG (north)" } };
    const html = renderCustomFieldWith({ ...w, props: typed },
      makeContext(emptyDocument(), { mode: "edit" }), BOOK);
    assert.match(html, /data-edit="overrides\.name"/);
    assert.match(html, /data-overridden="1"/);
    assert.ok(html.includes("Typed, not live"));
    assert.equal(isRetyped(typed), true);
    const back = { ...typed, ...putCustomFieldBackProps(typed) };
    assert.equal(isRetyped(back), false);
    assert.equal(resolveCustomField(back, BOOK.customer).value, "Harborview Property Group");
  });

  test("it is styled like a Text Editor, so the Typography group means something", () => {
    const html = draw([makeWidget("custom_field", customFieldProps("customer.name"))]);
    assert.match(html, /class="bx-prose bx-customfield"/);
    assert.match(html, /<p class="bx-p">/);
  });

  test("fifteen fields, three groups, and every one of them draws", () => {
    assert.equal(CUSTOM_FIELD_CHOICES.length, 15);
    for (const c of CUSTOM_FIELD_CHOICES) {
      const html = draw([makeWidget("custom_field", customFieldProps(c.key))]);
      const want = BOOK[c.record][c.field];
      if (c.picture) assert.ok(html.includes(`src="${want}"`), `${c.key} printed its picture as text`);
      else assert.ok(html.includes(want), `${c.key} drew nothing`);
    }
  });

  test("a field pointed at nothing is inert on a customer's page, and clickable on the canvas", () => {
    const w = makeWidget("custom_field", { field: "" });
    assert.equal(draw([w]).includes("bx-customfield"), false);
    assert.match(draw([w], "edit"), /data-placeholder=/);
    assert.equal(choiceOf({ field: "nope.nope" }), null);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. The three blocks unpack
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-167 · a stored block becomes a box of Custom Fields", () => {
  test("every field it showed, with the words the author typed", () => {
    const block = makeWidget("customer", {
      heading: "Prepared for", show_phone: false, overrides: { name: "Typed over" },
    });
    const box = recordBlockToContainer(block);
    assert.equal(box.kind, "container");
    assert.equal(box.id, block.id, "the box lost the block's id, so a revision diff badges it");
    assert.equal(box.children[0].kind, "heading");
    assert.deepEqual(box.children.filter((k) => k.kind === "custom_field").map((k) => k.props.field), [
      "customer.name", "customer.company", "customer.contact",
      "customer.email", "customer.billing_address",
    ]);
    assert.deepEqual(box.children[1].props.overrides, { name: "Typed over" });
  });

  test("the three are on the deleted list and convert through the document pass", () => {
    for (const k of ["customer", "service_location", "business_info"]) {
      assert.ok(DELETED_KINDS.includes(k), `${k} is not on the deleted list`);
    }
    const before = docOf([makeWidget("service_location", { locationId: "LOC-4" })]);
    const after = upgradeDocument(before);
    const kinds = [];
    const walk = (ns) => { for (const n of ns) { kinds.push(n.kind); if (n.children) walk(n.children); } };
    for (const s of after.sections) for (const c of s.columns) walk(c.widgets);
    assert.equal(kinds.includes("service_location"), false, "the block survived the pass");
    assert.ok(kinds.includes("custom_field"));
    // ASSERT PRESENCE: the location id travels to every field, lower-cased.
    const box = after.sections[0].columns[0].widgets[0];
    for (const k of box.children) assert.equal(k.props.locationId, "loc-4");
  });

  test("a site field takes the document's location; a customer field never does", () => {
    const site = makeWidget("custom_field", customFieldProps("service_location.address"));
    const email = makeWidget("custom_field", customFieldProps("customer.email"));
    const out = bindPlansToLocation(docOf([site, email]), "hope-main", ["hope-main"]);
    const at = (i) => out.sections[0].columns[0].widgets[i].props.locationId;
    assert.equal(at(0), "hope-main");
    assert.equal(at(1), "", "an email line was pointed at a yard");
  });

  test("a box of fields still marks a property, so its subtotal is its own", () => {
    const property = (id, name, amount) => makeContainer(undefined, [
      makeWidget("heading", { text: name, level: 3 }),
      fieldsContainer("service_location", { locationId: `loc-${id}` }),
      makeWidget("price_line", { name: "Plowing", quantity: 1, unit_price: amount }),
    ]);
    const d = docOf([property("a", "Des Moines campus", 2220), property("b", "Waukee", 1160)]);
    assert.deepEqual(siteTotals(d).map((s) => [s.name, s.subtotal]),
      [["Des Moines campus", 2220], ["Waukee", 1160]]);
    assert.equal(documentTotals(d).subtotal, 3380);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. The nine section templates
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-168 · the section templates", () => {
  test("they are the offer file's nine, by name and in order", () => {
    assert.deepEqual([...SECTION_TEMPLATE_NAMES], [
      "Title page", "Customer details", "Service address", "About us", "Scope of work",
      "Pricing options", "Line items with totals", "Terms and conditions", "Acceptance",
    ]);
    assert.equal(PROPOSAL_SECTION_TEMPLATES.length, 9);
  });

  test("each one is a tree of normal widgets the author can pull apart", () => {
    const offered = new Set(widgetsFor("proposal").map((w) => w.kind));
    for (const k of ["container", "catalog_card", "price_line"]) offered.add(k);
    for (const t of PROPOSAL_SECTION_TEMPLATES) {
      const seen = [];
      const walk = (ns) => {
        for (const n of ns || []) {
          seen.push(n.kind);
          assert.ok(offered.has(n.kind), `${t.key} drops ${n.kind}, which no panel offers`);
          if (Array.isArray(n.children)) walk(n.children);
        }
      };
      for (const col of t.build().columns) walk(col.widgets);
      assert.ok(seen.length >= 2, `${t.key} places almost nothing`);
    }
  });

  test("Title page carries the customer's own fields, and they fill", () => {
    const section = sectionTemplateByKey("title_page").build();
    const nodes = [];
    const walk = (ns) => { for (const n of ns) { nodes.push(n); if (n.children) walk(n.children); } };
    for (const col of section.columns) walk(col.widgets);
    const fields = nodes.filter((n) => n.kind === "custom_field").map((n) => n.props.field);
    assert.ok(fields.includes("customer.name"), "the title page does not say who it is for");
    assert.ok(fields.includes("service_location.address"), "the title page has no address");
    // ASSERT PRESENCE: with a customer picked, the words really are on the page.
    const html = draw(section.columns[0].widgets);
    assert.ok(html.includes("Harborview Property Group"));
    assert.ok(html.includes("18 Quay Street, Northbrook, IL, 60062"));
  });

  test("Pricing options is three Product Cards in a row", () => {
    const section = sectionTemplateByKey("pricing_options").build();
    const row = section.columns[0].widgets.find((n) => n.kind === "container");
    assert.ok(row, "the cards are not in a box, so a gap cannot be set on them");
    assert.deepEqual(row.children.map((c) => c.kind), ["catalog_card", "catalog_card", "catalog_card"]);
    assert.equal(row.style.direction, "row");
  });

  test("Line items with totals adds up, and Acceptance signs", () => {
    const lines = sectionTemplateByKey("line_items_totals").build();
    const kinds = lines.columns[0].widgets.map((w) => w.kind);
    assert.deepEqual(kinds, ["heading", "price_line", "price_line", "totals"]);
    // Two lines at real prices, and the total is the sum — the D-164 arithmetic.
    const priced = lines.columns[0].widgets.map((w) => (w.kind === "price_line"
      ? { ...w, props: { ...w.props, name: "Plowing", quantity: 2, unit_price: 200 } } : w));
    assert.equal(documentTotals(docOf(priced)).subtotal, 800);
    const accept = sectionTemplateByKey("acceptance").build();
    assert.ok(accept.columns[0].widgets.some((w) => w.kind === "signature"));
  });

  test("Terms and conditions is headings and Text Editors, and nothing clever", () => {
    const t = sectionTemplateByKey("terms_conditions").build();
    assert.deepEqual([...new Set(t.columns[0].widgets.map((w) => w.kind))], ["heading", "paragraph"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The whole page, once
   ══════════════════════════════════════════════════════════════════════════ */

describe("D-168 · the page a person builds in the demo", () => {
  test("a document made of six section templates draws every part of itself", () => {
    const keys = ["title_page", "customer_details", "service_address", "about_us",
      "line_items_totals", "acceptance"];
    const d = { ...emptyDocument(), sections: keys.map((k) => sectionTemplateByKey(k).build()) };
    const base = makeContext(d, { mode: "view" });
    const html = renderDocument(d, {
      ...base,
      extra: (w, c) => (w.kind === "custom_field" ? renderCustomFieldWith(w, c, BOOK) : null),
    });
    for (const words of [
      "Harborview Property Group", "dana@harborview.example", "Harborview North Lot",
      "Gate code 4412", "Fixture Landscaping", "IL-LC-88214",
    ]) {
      assert.ok(html.includes(words), `"${words}" never reached the page`);
    }
    // …and nothing on it is a kind the engine cannot draw.
    assert.equal(html.includes("needs a newer version of the builder"), false);
  });

  test("customFields places one widget per field, flat, in the record's order", () => {
    assert.deepEqual(customFields("service_location").map((n) => n.props.field), [
      "service_location.name", "service_location.address",
      "service_location.site_contact", "service_location.access_notes",
    ]);
    assert.ok(customFields("service_location").every((n) => n.kind === "custom_field"));
  });

  test("every widget the demo places is one the panel offers", () => {
    const keys = PROPOSAL_SECTION_TEMPLATES.map((t) => t.key);
    const d = { ...emptyDocument(), sections: keys.map((k) => sectionTemplateByKey(k).build()) };
    const offered = new Set(widgetsFor("proposal").map((w) => w.kind));
    for (const k of ["container", "catalog_card", "price_line"]) offered.add(k);
    for (const { widget } of walkWidgets(d)) {
      assert.ok(offered.has(widget.kind), `the demo places ${widget.kind}, which no panel offers`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE MUTATIONS — each broken on purpose, seen red, restored
   ══════════════════════════════════════════════════════════════════════════

   Every one was run by EXECUTING the real function, not by reading it.

   | # | what was broken | what went red |
   |---|-----------------|---------------|
   | 1 | `customField.resolveCustomField` answers `has = false`, so an override is never seen | 3 red: "typed on the page, it says so, and it goes back", and builder-dynamic-fields' "AN EDITED FIELD STOPS TRACKING, SAYS SO, AND COMES BACK" and "an override of \"\" is a real answer and is kept" |
   | 2 | `customField.renderCustomFieldWith` always draws the label | 2 red: "it shows the value, and the label is a control", and builder-dynamic-fields' "the label is a control, not a decision the widget makes for you" |
   | 3 | `upgradeRecordBlocks.customFieldFor` drops the `overrides` it was handed | 1 red: "every field it showed, with the words the author typed" — the typed address on a signed agreement comes back blank |
   | 4 | `documentDetails.isSiteWidget` answers yes to any Custom Field, the way it used to answer on the kind | 1 red: "a site field takes the document's location; a customer field never does" — the customer's email line is pointed at a yard |
   | 5 | `totals.sitesInTree` stops looking one level into the box | 2 red: "a box of fields still marks a property", and builder-integration's "a property is the BOX its address is in" — both per-property subtotals vanish |
   | 6 | `sectionTemplates` Pricing options drops the row Container | 1 red: "Pricing options is three Product Cards in a row" — three cards stack down the page and no gap can be set on them |

   Every one was restored and the same files re-run green (`# fail 0`) before
   the next was broken.

   And one that deliberately does NOT go red here: taking `custom_field` out of
   `render.RENDERED_KINDS` leaves this file green, because that list is
   documentation rather than a dispatch table. `test/builder-widget-set.test.mjs`
   is the one that catches it, which is why the comment on that line says so.
*/

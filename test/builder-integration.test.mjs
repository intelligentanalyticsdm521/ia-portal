// test/builder-integration.test.mjs — THE HANDOFFS, RESOLVED.
//
// BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12 (D-156, D-157), and
// overnight-report/D156_HANDOFF_2026-09-17.md.
//
// Four streams built D-156 in parallel and each left the other three a request
// it could not do inside its own files. This file is the record that each one
// was ANSWERED — and it asserts the answer, not the absence of a complaint.
//
//   A-B-1   the upgrade on open is SWITCHED ON, and everything it had to go in
//           with went in with it
//   A-B-2   the upgraded card's field names are the widget's own field names
//   A-B-4   the ready-made patterns are container TREES, in one section
//   A-C-2   the renderers and the two server mirrors walk the tree
//   B→A-1   the composite definitions are DELETED, not hidden
//   B→C-1   `product_card` and `catalog_card` are two kinds, not one branch
//   C-1     one container reader, reading the engine's own `style`
//   C req 1 a priced line inside a box is counted, on BOTH sides
//   R-D1    the pane and the picker grey a widget this plan cannot have
//   R-D2    the gallery greys a section this plan cannot have
//
// MUTATIONS, each broken on purpose, seen red, and restored:
//   · model.ts `deserialise` — drop the `upgradeDocument(...)` call
//        → "a stored comparison_cards opens as a tree" RED
//   · upgrade.ts `cardFrom` — write `product_card` instead of `catalog_card`
//        → "an upgraded catalogue card is the kind the registry has" RED
//   · upgrade.ts `fromPropertyBlock` — emit `pricing_table` instead of
//     `price_line`
//        → "a property's money survives the upgrade" RED ($0 instead of $2,220)
//   · totals.ts `sitesInTree` — return an empty map
//        → "a property is the box its address is in" RED
//   · WidgetPane — `draggable={!!onDragWidget}` again
//        → "a locked widget cannot be dragged either" RED
//   · SectionGallery — drop `disabled={!!s.locked}`
//        → "a locked ready-made section cannot be placed" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  deserialise, serialise, emptyDocument, makeSection, makeWidget, walkWidgets,
} from "../src/builder/model.ts";
import { upgradeDocument, needsUpgrade, COMPOSITE_KINDS } from "../src/builder/upgrade.ts";
import { WIDGETS_BY_KIND } from "../src/builder/registry.ts";
import { documentTotals, siteTotals, widgetTotals, PRICED_KINDS } from "../src/builder/totals.ts";
import { chooseYourPlanSections, propertySections, atAGlanceSections, premadeByKey } from "../src/builder/templates.ts";
import { makeContext, renderSection, containerLayout, RENDERED_KINDS, DOCUMENT_CSS } from "../src/builder/render.ts";

const src = (rel) => readFileSync(new URL(`../src/builder/${rel}`, import.meta.url), "utf8");

/** A file with its comment LINES taken out — a comment may name a key,
    code may not. */
function stripComments(text) {
  const out = [];
  let inBlock = false;
  for (const line of String(text).split(String.fromCharCode(10))) {
    let rest = line;
    if (inBlock) {
      const end = rest.indexOf("*" + "/");
      if (end < 0) continue;
      rest = rest.slice(end + 2);
      inBlock = false;
    }
    const open = rest.indexOf("/" + "*");
    if (open >= 0) {
      const close = rest.indexOf("*" + "/", open + 2);
      if (close < 0) { inBlock = true; rest = rest.slice(0, open); }
      else rest = rest.slice(0, open) + rest.slice(close + 2);
    }
    const lineComment = rest.indexOf("/" + "/");
    if (lineComment >= 0) rest = rest.slice(0, lineComment);
    out.push(rest);
  }
  return out.join(" ");
}


const stored = (widgets) => ({
  v: 2,
  sections: [{ id: "s", layout: 1, visibility: "customer", columns: [{ id: "c", widgets }] }],
});

/* ══════════════════════════════════════════════════════════════════════════
   A-B-1 — the upgrade is ON, and it went in with everything it needed
   ══════════════════════════════════════════════════════════════════════════ */

describe("the upgrade on open is switched on (A-B-1)", () => {
  test("deserialise runs it — the ONE door a stored document comes through", () => {
    assert.match(src("model.ts"), /return upgradeDocument\(\{ v: 2, settings, sections \}\);/);
  });

  test("a stored comparison_cards opens as a tree, not a lump", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "comparison_cards",
      props: {
        heading: "Choose your plan", intro: "Pick one.",
        cards: [
          { name: "Standard", price: "$249", pitch: "The usual", features: ["a", "b"] },
          { name: "Pro", price: "$399", item_id: "svc-7", badge: "Best Price", recommended: true },
        ],
      },
    }]));
    const box = d.sections[0].columns[0].widgets[0];
    assert.equal(box.kind, "container");
    assert.equal(box.id, "w1", "the box lost the composite's id, so a revision diff would badge it new");
    assert.deepEqual(box.children.map((n) => n.kind), ["heading", "paragraph", "container"]);
    const row = box.children[2];
    assert.equal(row.style.direction, "row");
    assert.deepEqual(row.children.map((n) => n.kind), ["card", "catalog_card"]);
  });

  test("the v1 blocks door runs the SAME pass — one model on the screen", () => {
    assert.match(src("proposalDoc.ts"), /return upgradeDocument\(doc\);/);
  });

  test("the template library runs it too, because a template never passes deserialise", () => {
    assert.match(src("templates.ts"), /upgradeDocument\(\{ \.\.\.emptyDocument\(\), sections: \[p\.build\(\)\] \}\)/);
    assert.match(src("templates.ts"), /build: \(\) => upgradeDocument\(t\.build\(\)\)/);
  });

  test("a document with no composites is THE SAME OBJECT, so no golden moves", () => {
    const wire = stored([{ id: "w1", kind: "paragraph", props: { text: "Plain." } }]);
    const d = deserialise(wire);
    assert.equal(upgradeDocument(d), d, "the pass rebuilt a document it had nothing to do to");
    // …and the round trip is stable: what comes out goes back in unchanged.
    assert.equal(serialise(deserialise(serialise(d))), serialise(d));
  });

  test("and it is idempotent, so nothing has to remember", () => {
    const once = deserialise(stored([{ id: "w1", kind: "key_facts", props: { rows: [{ label: "Term", value: "1 winter" }] } }]));
    assert.equal(needsUpgrade(once), false);
    assert.equal(upgradeDocument(once), once);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A-B-2 / B→A-1 — the names, and the deletion
   ══════════════════════════════════════════════════════════════════════════ */

describe("the upgraded widgets are the widgets the registry has (A-B-2)", () => {
  test("every kind the upgrade can produce is a kind the engine draws", () => {
    /* D-165 — `address_block` and `key_fact` are deleted; the upgrade produces
       `service_location` (or `customer`) and a Text Editor instead. */
    for (const kind of ["heading", "paragraph", "card", "catalog_card", "price_line", "service_location", "totals"]) {
      assert.ok(RENDERED_KINDS.includes(kind), `the upgrade produces ${kind} and nothing draws it`);
    }
  });

  test("an upgraded typed card's fields are the card widget's own", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "comparison_cards",
      props: { cards: [{ name: "Standard", list_price: "$299", pitch: "The usual", features: ["a"], badge: "Best Price" }] },
    }]));
    const card = d.sections[0].columns[0].widgets[0].children[0].children[0];
    // EVERY key the upgrade writes is a key the card declares a control for.
    // No exceptions any more: the ribbon used to be written as `tag` /
    // `recommended`, which nothing in the panel could set, and it is the price
    // table's own four keys now (conformance 2026-09-17).
    const controls = WIDGETS_BY_KIND.card.controls.map((c) => c.key);
    for (const key of Object.keys(card.props)) {
      assert.ok(controls.includes(key), `the upgrade writes \`${key}\`, which a card has no control for`);
    }
    assert.equal(card.props.heading, "Standard");
    assert.equal(card.props.original_price, "$299");
    assert.equal(card.props.description, "The usual");
    assert.deepEqual(card.props.features_list, [{ item_text: "a" }]);
    assert.equal(card.props.show_ribbon, "yes");
    assert.equal(card.props.ribbon_title, "Best Price");
  });

  test("an upgraded catalogue card is bound by the catalogue's own two keys", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "comparison_cards",
      props: { cards: [{ name: "Pro", price: "$399", item_id: "svc-7", tier: "p-2", pitch: "Everything" }] },
    }]));
    const card = d.sections[0].columns[0].widgets[0].children[0].children[0];
    assert.equal(card.kind, "catalog_card");
    // THE BINDING SECTION's own two keys (catalogue F.2): one source, one
    // selection, in one place, on every bound widget.
    assert.equal(card.props._ia_source, "oliver:catalogue");
    assert.deepEqual(card.props._ia_selection, { offering_id: "svc-7", price_id: "p-2" });
    // …and it carries what the composite was showing, so it is never blank on
    // a surface that has no catalogue (the PDF worker, the customer's page).
    assert.equal(card.props._ia_snapshot.title, "Pro");
    assert.equal(card.props._ia_snapshot.price, "$399");
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.ok(html.includes("Pro") && html.includes("$399"), "an upgraded catalogue card printed blank");
  });

  test("the composite definitions are DELETED, not hidden (B→A-1)", () => {
    for (const kind of COMPOSITE_KINDS) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined, `${kind} is still in the registry`);
    }
    // …and so are their renderers, because nothing can hold one.
    assert.ok(!src("render.ts").includes('case "comparison_cards"'));
    assert.ok(!src("render.ts").includes('case "property_block"'));
    assert.ok(!src("render.ts").includes('case "key_facts"'));
  });

  test("the count control is gone from every widget that had one", () => {
    for (const def of Object.values(WIDGETS_BY_KIND)) {
      if (!def.count) continue;
      assert.ok(!/how many (cards|facts|options|plans)/i.test(String(def.count.label)),
        `${def.kind} still asks "${def.count.label}" — the answer to that is a widget`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A-B-4 — the ready-made patterns, as trees
   ══════════════════════════════════════════════════════════════════════════ */

describe("a ready-made pattern is ONE section with a box in it (A-B-4)", () => {
  test("Choose your plan is Brandon's sentence, in one section", () => {
    const all = chooseYourPlanSections();
    assert.equal(all.length, 1, "it is one section now, so placing it is one undo");
    const kids = all[0].columns[0].widgets;
    assert.deepEqual(kids.map((w) => w.kind), ["heading", "paragraph", "container"]);
    assert.deepEqual(kids[2].children.map((w) => w.kind), ["catalog_card", "catalog_card", "catalog_card"]);
  });

  test("Agreement at a glance is four key facts in a row", () => {
    const box = atAGlanceSections()[0].columns[0].widgets[0];
    assert.equal(box.kind, "container");
    assert.equal(box.children.length, 4);
  });

  test("This property is the four widgets a property block held", () => {
    assert.deepEqual(propertySections()[0].columns[0].widgets.map((w) => w.kind),
      ["heading", "service_location", "price_line", "totals"]);
  });

  test("no pattern needs a second way to be placed", () => {
    for (const key of ["choose_your_plan", "this_property", "at_a_glance_facts"]) {
      assert.equal(premadeByKey(key).buildAll, undefined, `${key} still has a buildAll`);
    }
    assert.ok(!readFileSync(new URL("../src/builder/proposal/ProposalBuilder.tsx", import.meta.url), "utf8")
      .includes("premade.buildAll"), "the adapter still intercepts a placement");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   C-1 — ONE container reader, and what it reads
   ══════════════════════════════════════════════════════════════════════════ */

describe("a box keeps its layout in its STYLE (C-1)", () => {
  test("the renderers read the engine's own words, per device", () => {
    const box = {
      id: "b1", kind: "container", props: {}, children: [],
      style: { direction: "row", gap: 24, justify: "between", phone: { direction: "column" } },
    };
    assert.equal(containerLayout(box).direction, "row");
    assert.equal(containerLayout(box).justify, "space-between");
    assert.equal(containerLayout(box, "phone").direction, "column");
  });

  test("nothing in the renderers reads Elementor's spelling — that is the adapter's", () => {
    for (const rel of ["render.ts", "adapters/email/emailRender.ts", "adapters/landing/landingRender.ts"]) {
      // Comments are allowed to NAME the key; code is not allowed to read it.
      const code = stripComments(src(rel));
      assert.ok(!code.includes("flex_direction"),
        `${rel} reads Elementor's own key, so there are two answers about a box`);
      assert.ok(!code.includes("container_type"), `${rel} reads container_type`);
    }
  });

  test("a box's arranging is written ONCE, into the section's own stylesheet", () => {
    const d = emptyDocument();
    const box = {
      id: "b1", kind: "container", props: {},
      style: { direction: "row", gap: 24 },
      children: [makeWidget("paragraph", { text: "in a row" })],
    };
    d.sections = [makeSection({ id: "s1", layout: 1, columns: [{ id: "c1", widgets: [box] }] })];
    const html = renderSection(d.sections[0], makeContext(d, {}));
    assert.match(html, /\.bx-sy-b1\{display:flex;flex-direction:row;gap:24px\}/);
    assert.ok(!/data-box="b1"[^>]*style=/.test(html), "the box wrote its layout inline as well");
    // …and the ONE thing the markup does say about the layout is which way it
    // runs, as a class, because that is what the phone rule keys on.
    assert.match(html, /class="bx-w bx-box bx-box-row/,
      "the box does not say which way it runs, so the phone rule cannot stack it");
    assert.match(DOCUMENT_CSS, /\.bx-box-row \{ flex-direction: column !important; \}/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Stream C request 1 — the money gap, closed on this side
   ══════════════════════════════════════════════════════════════════════════ */

describe("a priced line inside a box is counted (stream C request 1)", () => {
  test("at one level, and at three", () => {
    const box = (id, kids) => ({ id, kind: "container", props: {}, children: kids });
    const line = (id, amount) => makeWidget("price_line", { name: "In a box", quantity: 1, unit_price: amount });
    const inside = deserialise(stored([box("b1", [line("w1", 2400)])]));
    const deep = deserialise(stored([box("b1", [box("b2", [box("b3", [line("w1", 2400)])])])]));
    assert.equal(documentTotals(inside).subtotal, 2400);
    assert.equal(documentTotals(deep).subtotal, 2400, "a priced line three boxes down costs nothing");
  });

  test("a property is the BOX its address is in, and its subtotal is its own", () => {
    const property = (id, name, amount) => ({
      id, kind: "container", props: {},
      children: [
        makeWidget("heading", { text: name, level: 3 }),
        makeWidget("service_location", { locationId: `loc-${id}` }),
        makeWidget("price_line", { name: "Plowing", quantity: 1, unit_price: amount }),
        { ...makeWidget("totals", { heading: "Subtotal for this property" }), id: `t-${id}` },
      ],
    });
    const d = deserialise(stored([
      property("b1", "Des Moines campus", 2220),
      property("b2", "Waukee", 1160),
      { ...makeWidget("totals", { heading: "Your total" }), id: "t-all" },
    ]));
    assert.deepEqual(siteTotals(d).map((s) => [s.name, s.subtotal]),
      [["Des Moines campus", 2220], ["Waukee", 1160]]);
    assert.equal(documentTotals(d).subtotal, 3380);
    // A total INSIDE a property box is that property's subtotal — one line.
    assert.equal(widgetTotals(d, "t-b1", {}).subtotal, 2220);
    assert.equal(widgetTotals(d, "t-b1", {}).scopedTo.name, "Des Moines campus");
    // …and the one at the bottom is the document's.
    assert.equal(widgetTotals(d, "t-all", {}).subtotal, 3380);
    assert.equal(widgetTotals(d, "t-all", {}).scopedTo, null);
  });

  test("a property's money SURVIVES the upgrade — the items are priced lines", () => {
    const d = deserialise(stored([{
      id: "w1", kind: "property_block",
      props: {
        locationId: "loc-1", heading: "Des Moines campus",
        items: [
          { description: "Per-push Plowing", quantity: 12, unit_price: 185 },
          { description: "Sidewalk Shoveling", quantity: 12, unit_price: 95 },
        ],
      },
    }]));
    assert.deepEqual(d.sections[0].columns[0].widgets[0].children.map((n) => n.kind),
      ["heading", "service_location", "price_line", "price_line", "totals"]);
    assert.equal(documentTotals(d).subtotal, 3360, "a property's items stopped being money");
    assert.deepEqual(siteTotals(d).map((s) => [s.name, s.subtotal]), [["Des Moines campus", 3360]]);
  });

  test("a card is still never money, whichever card it is", () => {
    assert.deepEqual([...PRICED_KINDS], ["price_line", "priced_line"]);
    const d = deserialise(stored([
      { id: "w1", kind: "card", props: { title: "A", price: "$525" } },
      { id: "w2", kind: "catalog_card", props: { offeringId: "o1", snapshot: { title: "B", price: "$999", amount: 999 } } },
    ]));
    assert.equal(documentTotals(d).subtotal, 0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   B→C-1 — the collision, resolved by naming
   ══════════════════════════════════════════════════════════════════════════ */

describe("product_card and catalog_card are TWO kinds (B→C-1)", () => {
  test("the newsletter's composite keeps its name, because it is on disk", () => {
    assert.ok(WIDGETS_BY_KIND.product_card, "the email builder's product card is gone");
    assert.ok(WIDGETS_BY_KIND.product_card.adapters.includes("email"));
    assert.ok(WIDGETS_BY_KIND.catalog_card, "the catalogue-bound card is gone");
    // The POINT of this test is that the two kinds coexist, each with its own
    // name and its own case in the renderer. A SEND's products are the
    // newsletter's `product_card` — a LIST of things to show off, with its own
    // picker; `catalog_card` is ONE catalogue line and belongs where something
    // can choose that line, which today is the proposal.
    assert.deepEqual([...WIDGETS_BY_KIND.catalog_card.adapters], ["proposal"]);
    assert.notEqual(WIDGETS_BY_KIND.product_card.kind, WIDGETS_BY_KIND.catalog_card.kind);
  });

  test("no renderer branches on which fields happen to be present", () => {
    const email = src("adapters/email/emailRender.ts");
    assert.match(email, /case "product_card": return emProducts\(p, c\);/);
    assert.match(email, /case "catalog_card": return emCard\(emCatalogCard\(p, c\), c, emWidth\(c\)\);/);
    assert.ok(!email.includes("Array.isArray(p.items) || !(p.itemId"),
      "the email renderer still guesses which product card it has");
  });

  test("ONE resolver answers what a catalogue card says, on every surface", () => {
    for (const rel of ["adapters/email/emailRender.ts", "adapters/landing/landingRender.ts"]) {
      assert.match(src(rel), /resolveCatalogCard/, `${rel} resolves a catalogue card its own way`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   R-D1 / R-D2 — the plan says so BEFORE the press
   ══════════════════════════════════════════════════════════════════════════ */

describe("a locked widget or section says so before the press (R-D1, R-D2)", () => {
  const pane = readFileSync(new URL("../src/builder/WidgetPane.tsx", import.meta.url), "utf8");
  const picker = readFileSync(new URL("../src/builder/WidgetPicker.tsx", import.meta.url), "utf8");
  const gallery = readFileSync(new URL("../src/builder/SectionGallery.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../src/builder/BuilderShell.tsx", import.meta.url), "utf8");
  const site = readFileSync(new URL("../src/builder/adapters/website/WebsiteBuilder.tsx", import.meta.url), "utf8");

  test("the pane greys it, says why, and refuses the click", () => {
    assert.match(pane, /const lock = lockedKinds\?\.\[w\.kind\] \?\? null;/);
    assert.match(pane, /onClick=\{\(\) => \{ if \(!lock\) pick\(w\); \}\}/);
    assert.match(pane, /data-widget-locked/);
  });

  test("a locked widget cannot be dragged either", () => {
    assert.match(pane, /draggable=\{!!onDragWidget && !lock\}/);
    assert.match(pane, /if \(lock\) \{ e\.preventDefault\(\); return; \}/);
  });

  test("the picker greys it too, on both of its doors", () => {
    assert.match(picker, /data-picker-locked/);
    assert.match(picker, /onClick=\{\(\) => \{ if \(!lock\) choose\(w\); \}\}/);
    assert.equal((shell.match(/lockedKinds=\{p\.lockedKinds\}/g) || []).length, 2,
      "the slash-command picker or the + picker was left out");
  });

  test("a locked ready-made section cannot be placed", () => {
    assert.match(gallery, /disabled=\{!!s\.locked\}/);
    assert.match(gallery, /data-premade-locked/);
    assert.match(gallery, /if \(!s\.locked\) \{ p\.onPlaceSection\(s\); p\.onClose\(\); \}/);
  });

  test("WHAT is locked is the server's answer — the engine holds no tier table", () => {
    assert.match(site, /lockedKinds=\{lockedKinds\}/);
    // The whole DEF, not just its kind: a widget with no website section
    // behind it has no server row, and its own `tier` says which of the three
    // gates applies (catalogue G.4, conformance 2026-09-17).
    assert.match(site, /pickerLock\(plan, arionKindOf, w\)/);
    for (const text of [pane, picker, gallery, shell]) {
      assert.ok(!/arion_tier|\bLite\b|\bStandard\b/.test(text),
        "an engine file names a plan, so there are two places the tier is decided");
    }
  });
});

// test/builder-tree.test.mjs — the content model becomes Elementor's
// (BUILDER_PLATFORM_SCOPE_2026-09-15 §11.12, decisions D-156 and D-157).
//
// STREAM C: the renderers and their mirrors. What this pins, in Brandon's own
// words — the sentence the verifier will click:
//
//   "Header, drag that into this box and it's now its own section inside the
//    box, then a text field under it with Pick One, then cards … custom cards
//    where they just type the card headers, add a price, and description
//    inside the cards, or product cards where they can directly load
//    products/services from their actual OLIVER Product Catalog."
//
// So: a container is a WIDGET whose children are widgets; it nests to any
// depth; the atomic widgets draw on every surface; and a document that has
// none of it is BYTE-IDENTICAL to the one this build read (which the fifty-six
// golden cases in test/fixtures/*.json already hold, on both surfaces and in
// both repos).
//
// MUTATION CHECKS, written down so the next person can re-run them. Each was
// broken on purpose, seen red, and restored:
//   · render.ts `container` — draw the box and not its children
//        → "a box draws its children, at any depth" RED, and six goldens RED
//   · render.ts `sectionStyleTag` — collect the columns' widgets instead of
//     walkTree
//        → "a widget three boxes down keeps its styling" RED
//   · render.ts `card` — drop the tag's own colour from the pill
//        → "a tag is the author's words in the author's colour" RED, golden RED
//   · LUMEN builderEmailRender `emBox` — a row as one div with display:flex
//        → "a row of boxes is tables, never flexbox" RED, email golden RED
//   · oliver proposalPdf `paintAll` — one frame instead of the stack
//        → "a box three deep flattens ... and paints every level" RED (oliver)
//   · oliver documentModel `flattenWidgets` — stop emitting `box_cell`
//        → "a row of cards is a ROW" RED (oliver)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { deserialise, emptyDocument, makeSection, makeWidget, resetIds } from "../src/builder/model.ts";
import {
  CONTAINER_KIND, MAX_CONTAINER_DEPTH, RENDERED_KINDS, childrenOf, containerLayout,
  containerLayoutCss, isContainer, makeContext, renderDocument, renderSection, renderWidget,
  walkDocumentTree, walkTree, DOCUMENT_CSS,
} from "../src/builder/render.ts";
import {
  LANDING_RENDERED_KINDS, makeLandingContext, renderLandingSection, LANDING_CSS,
} from "../src/builder/adapters/landing/landingRender.ts";
import {
  EMAIL_RENDERED_KINDS, assertEmailSafe, makeEmailContext, renderEmailSection,
} from "../src/builder/adapters/email/emailRender.ts";

/* ── Documents, built the way an author would ────────────────────────────── */

const box = (id, props, kids) => ({ id, kind: CONTAINER_KIND, props: { ...props, children: kids } });
const w = (id, kind, props = {}) => ({ id, kind, props });
/* The layout keys are ELEMENTOR'S, per BUILDER_WIDGET_CATALOG_2026-09-17: the
   website adapter publishes this tree, and a shorter spelling here would be a
   translation table there. */
const gaps = (n) => ({ row: n, column: n, isLinked: true, unit: "px" });
const row = (n = 16) => ({ flex_direction: "row", flex_gap: gaps(n) });
const column = (n = 16) => ({ flex_direction: "column", flex_gap: gaps(n) });

function doc(widgets, sectionExtra = {}) {
  resetIds();
  const d = emptyDocument({ style: "plain", accent: "#0C4A60" });
  d.sections = [makeSection({
    id: "s1", layout: 1, ...sectionExtra,
    columns: [{ id: "c1", widgets }],
  })];
  return d;
}

const html = (d, mode = "view") => renderSection(d.sections[0], makeContext(d, { mode }));

const CATALOGUE = {
  "svc-plow": {
    id: "svc-plow", name: "Snow & ice", description: "Every 2 inch trigger.",
    price: "$185.00", cadence: "per push", inclusions: ["Plowing", "Walks cleared"],
    tiers: [{ id: "t-plus", name: "Seasonal", price: "$2,400.00", cadence: "per season", inclusions: ["Everything", "24h callout"] }],
  },
};

const LOCATIONS = {
  "loc-1": {
    location_id: "loc-1", name: "Marshalltown depot",
    address_line1: "1200 Prairie Ave", city: "Marshalltown", state: "IA", postal_code: "50158",
    site_contact: "Dana Reyes, 555-0142", access_notes: "Gate code at the north entrance.",
  },
};

/* ══════════════════════════════════════════════════════════════════════════
   1. The model: a container is a widget, and it holds widgets
   ══════════════════════════════════════════════════════════════════════════ */

describe("a container is a widget that holds widgets", () => {
  test("only a container has children, and junk in them is dropped", () => {
    const good = box("b", {}, [w("w1", "paragraph", { text: "a" })]);
    assert.ok(isContainer(good));
    assert.equal(childrenOf(good).length, 1);
    assert.ok(!isContainer(w("w1", "paragraph")));
    assert.deepEqual(childrenOf(w("w1", "paragraph")), []);
    // A hand-edited row must not become an exception on a customer's page.
    const messy = { id: "b", kind: CONTAINER_KIND, props: { children: [null, 7, "x", { no: "kind" }, w("w1", "paragraph")] } };
    assert.equal(childrenOf(messy).length, 1);
    assert.deepEqual(childrenOf({ id: "b", kind: CONTAINER_KIND, props: { children: "nope" } }), []);
  });

  test("the layout keys are ELEMENTOR'S, spelled as the machine file spells them", () => {
    // BUILDER_WIDGET_CATALOG_2026-09-17, extracted from a running Elementor
    // 4.2.4. D-157's reason: "our website builder needs to then convert to
    // elementor", so a key called `direction` here would be a translation
    // table there — and a translation table is a second place to be wrong.
    const l = containerLayout(box("b", {
      flex_direction: "row-reverse", flex_justify_content: "space-between",
      flex_align_items: "stretch", flex_wrap: "wrap", flex_gap: gaps(24),
      html_tag: "section",
    }, []));
    assert.equal(l.type, "flex");
    assert.equal(l.direction, "row-reverse");
    assert.equal(l.justify, "space-between");
    assert.equal(l.align, "stretch");
    assert.equal(l.wrap, "wrap");
    assert.deepEqual(l.gap, { row: 24, column: 24 });
    assert.equal(l.tag, "section");
    // Elementor's OPTION VALUES are CSS values, which is why there is no
    // mapping table in render.ts: they go straight out.
    assert.equal(
      containerLayoutCss(l),
      "display:flex;flex-direction:row-reverse;flex-wrap:wrap;justify-content:space-between;align-items:stretch;gap:24px",
    );
  });

  test("a fresh box is a column that does not wrap, which is Elementor's own default", () => {
    const l = containerLayout(box("b", {}, []));
    assert.equal(l.direction, "column");
    assert.equal(l.wrap, "nowrap");
    assert.equal(l.tag, "div");
    assert.deepEqual(l.gap, { row: 16, column: 16 });
    // A row does not need `wrap` to survive a phone: the stylesheet stacks it.
    assert.equal(containerLayout(box("b", row(), [])).wrap, "nowrap");
  });

  test("junk in a layout key never reaches the page", () => {
    const l = containerLayout(box("b", {
      container_type: "grid", grid_columns_grid: { unit: "fr", size: 99 },
      grid_justify_items: "drop", grid_align_items: "sideways",
      grid_gaps: { row: 8, column: 8, unit: "em" }, html_tag: "script",
    }, []));
    assert.equal(l.columns, 6, "a grid of 99 tracks is not a layout");
    assert.equal(l.justify, undefined);
    assert.equal(l.align, undefined);
    assert.equal(l.tag, "div", "a tag from a document is markup, so only Elementor's list is allowed");
    // A unit no surface can carry is not half-drawn on one: an `em` gap in a
    // mailbox means nothing, so it falls back rather than guessing.
    assert.deepEqual(l.gap, { row: 16, column: 16 });
    const css = containerLayoutCss(l);
    assert.match(css, /display:grid;grid-template-columns:repeat\(6,minmax\(0,1fr\)\);gap:16px/);
    assert.ok(!css.includes("justify-items"), "a justify nobody typed reached the page");
  });

  test("an unlinked gaps control gives a row gap and a column gap, in that order", () => {
    const l = containerLayout(box("b", { flex_gap: { row: 8, column: 32, isLinked: false, unit: "px" } }, []));
    assert.deepEqual(l.gap, { row: 8, column: 32 });
    assert.ok(containerLayoutCss(l).endsWith("gap:8px 32px"), containerLayoutCss(l));
  });

  test("walkTree reads the whole tree, in reading order, and stops at the guard", () => {
    const d = doc([box("b1", {}, [w("w1", "heading"), box("b2", {}, [w("w2", "paragraph")])]), w("w3", "divider")]);
    assert.deepEqual(walkDocumentTree(d).map((x) => x.id), ["b1", "w1", "b2", "w2", "w3"]);
    assert.deepEqual(walkTree(d.sections[0].columns[0].widgets).map((x) => x.depth), [0, 1, 1, 2, 0]);
    // A document that points at itself must stop, not take the tab with it.
    let node = w("leaf", "paragraph", { text: "bottom" });
    for (let i = 0; i < 40; i += 1) node = box(`b${i}`, {}, [node]);
    assert.ok(walkTree([node]).length <= MAX_CONTAINER_DEPTH + 2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   1b. …and the words it is read in are Elementor's, pinned to the machine file
   ══════════════════════════════════════════════════════════════════════════ */

describe("the container's vocabulary is Elementor's own", () => {
  const CONTROLS = JSON.parse(readFileSync(
    path.join(process.cwd(), "test", "fixtures", "elementor-container-controls.json"), "utf8"));

  test("every layout key the renderer reads is a real Elementor container control", () => {
    // BUILDER_WIDGET_CATALOG_2026-09-17, machine-extracted from a running
    // Elementor. A key we invented would publish as nothing, or as something
    // the website adapter had to translate — which is the second place for the
    // answer to be wrong that D-157 exists to prevent.
    const read = [
      "container_type", "flex_direction", "flex_justify_content", "flex_align_items",
      "flex_gap", "flex_wrap", "grid_columns_grid", "grid_gaps", "grid_justify_items",
      "grid_align_items", "html_tag", "background_color",
    ];
    for (const key of read) {
      assert.ok(CONTROLS.controls[key], `\`${key}\` is not a control Elementor's container has`);
    }
  });

  test("every option value the renderer accepts is one Elementor offers", () => {
    const accepted = {
      container_type: ["flex", "grid"],
      flex_direction: ["row", "column", "row-reverse", "column-reverse"],
      flex_justify_content: ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"],
      flex_align_items: ["flex-start", "center", "flex-end", "stretch"],
      flex_wrap: ["wrap", "nowrap"],
      grid_justify_items: ["start", "center", "end", "stretch"],
      grid_align_items: ["start", "center", "end", "stretch"],
      html_tag: ["div", "header", "footer", "main", "article", "section", "aside"],
    };
    for (const [key, values] of Object.entries(accepted)) {
      const offered = CONTROLS.controls[key].options;
      assert.ok(Array.isArray(offered), `${key} has no options in the machine file`);
      for (const v of values) {
        assert.ok(offered.includes(v), `${key} does not offer "${v}"`);
      }
    }
  });

  test("the two keys we deliberately do NOT read as layout are still Elementor's", () => {
    // `min_height` is §11.8's `style.minHeight`, per device, and `content_width`
    // is the section's own `width`. Both exist in Elementor; both already have
    // exactly one home here, and a second control setting the same property is
    // the defect this scope exists to delete. Pinned so the choice is a
    // decision on the record rather than an omission.
    assert.ok(CONTROLS.controls.min_height);
    assert.ok(CONTROLS.controls.content_width);
    const l = containerLayout(box("b", { min_height: { size: 300, unit: "px" }, content_width: "full" }, []));
    assert.ok(!("minHeight" in l), "min_height grew a second home");
    assert.ok(!containerLayoutCss(l).includes("min-height"), "the box emitted a min-height nobody asked it for");
    assert.ok(!containerLayoutCss(l).includes("width"), "the box emitted a width nobody asked it for");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The renderer walks the tree — MUTATION: draw the box, not its children
   ══════════════════════════════════════════════════════════════════════════ */

describe("a box draws its children, at any depth", () => {
  test("three levels of box all reach the page, in order", () => {
    const d = doc([box("b1", { ...column(20), html_tag: "section" }, [
      w("w1", "heading", { text: "What we will do", level: "Page title" }),
      box("b2", row(24), [
        box("b3", column(), [w("w2", "paragraph", { text: "On site" })]),
        box("b4", column(), [w("w3", "paragraph", { text: "Off site" })]),
      ]),
    ])]);
    const out = html(d);
    for (const words of ["What we will do", "On site", "Off site"]) {
      assert.ok(out.includes(words), `"${words}" never reached the page`);
    }
    // Nested, not flattened: b3 is inside b2, which is inside b1.
    assert.ok(out.indexOf('data-box="b1"') < out.indexOf('data-box="b2"'));
    assert.ok(out.indexOf('data-box="b2"') < out.indexOf('data-box="b3"'));
    assert.match(out, /data-box="b2"[^>]*style="display:flex;flex-direction:row;flex-wrap:nowrap;gap:24px"/);
    assert.match(out, /data-box="b1"[^>]*style="display:flex;flex-direction:column;flex-wrap:nowrap;gap:20px"/);
    // `html_tag` is Elementor's, and it reaches the page as the element itself.
    assert.match(out, /<section class="bx-box bx-box-column" data-box="b1"/);
    assert.ok(out.includes("</section>"), "the box did not close the tag it opened");
  });

  test("the depth guard says so on the canvas and draws nothing for the customer", () => {
    let node = w("leaf", "paragraph", { text: "bottom" });
    for (let i = 0; i < 20; i += 1) node = box(`b${i}`, {}, [node]);
    const d = doc([node]);
    assert.ok(!html(d).includes("bottom"), "a 20-deep document drew its bottom anyway");
    assert.match(html(d, "edit"), /nested too deeply/);
    // And it is not an exception, on either surface.
    assert.doesNotThrow(() => renderDocument(d, makeContext(d, {})));
  });

  test("an empty box says what to do with it, and only to the author", () => {
    const d = doc([box("b1", row(), [])]);
    assert.match(html(d, "edit"), /Drag anything in here/);
    assert.ok(!html(d).includes("Drag anything"), "a customer was told to drag something");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. A widget three boxes down is still a widget
   ══════════════════════════════════════════════════════════════════════════ */

describe("a widget three boxes down keeps its styling", () => {
  test("the section's stylesheet reaches a widget nested inside two boxes", () => {
    const deep = { ...w("w9", "heading", { text: "Deep" }), style: { typography: { size: 31 } } };
    const d = doc([box("b1", {}, [box("b2", {}, [deep])])]);
    const out = html(d);
    assert.match(out, /\.bx-sy-w9[^{]*\{[^}]*font-size:31px/, "the nested widget's own rule is missing");
    assert.ok(out.includes("bx-sy-w9"), "the nested widget never got its class");
  });

  test("a STYLED BOX is styled like a section — edge, corners, shadow, least height", () => {
    const styled = {
      ...box("b1", row(), [w("w1", "paragraph", { text: "x" })]),
      style: {
        padding: { top: 24, right: 20, bottom: 24, left: 20 },
        border: { width: 1, style: "solid", color: "#E2E8F0" },
        radius: 14, shadow: "soft", minHeight: 200,
        phone: { padding: { top: 8, right: 8, bottom: 8, left: 8 } },
      },
    };
    const out = html(doc([styled]));
    assert.match(out, /\.bx-sy-b1\{[^}]*padding:24px 20px 24px 20px/);
    assert.match(out, /\.bx-sy-b1\{[^}]*border:1px solid #E2E8F0/);
    assert.match(out, /\.bx-sy-b1\{[^}]*border-radius:14px/);
    assert.match(out, /\.bx-sy-b1\{[^}]*box-shadow:/);
    assert.match(out, /\.bx-sy-b1\{[^}]*min-height:200px/);
    assert.match(out, /@container \(max-width: 390px\)\{\.bx-sy-b1\{padding:8px 8px 8px 8px !important\}\}/);
    // And the GAP is not in the sheet: the box carries it inline, and two
    // places writing one property is how a control stops working.
    assert.ok(!/\.bx-sy-b1\{[^}]*gap:/.test(out), "the gap was written twice");
  });

  test("a document with no boxes and no styling gets no stylesheet at all", () => {
    const out = html(doc([w("w1", "paragraph", { text: "Plain." })]));
    assert.ok(!out.includes("<style>"), "an untouched document grew a stylesheet");
    assert.ok(!out.includes("bx-box"), "an untouched document grew a box");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. The atomic widgets
   ══════════════════════════════════════════════════════════════════════════ */

describe("the atomic widgets that replace the composites", () => {
  test("a card is a title, a price, a description and its own bullets", () => {
    const out = html(doc([w("w1", "card", {
      title: "Seasonal", price: "$2,400.00", per: "per season", was: "$2,800.00",
      description: "One figure for the whole winter.", bullets: ["Plowing", "Salt"], note: "Four instalments.",
    })]));
    for (const words of ["Seasonal", "$2,400.00", "per season", "$2,800.00", "One figure", "Plowing", "Salt", "Four instalments."]) {
      assert.ok(out.includes(words), `"${words}" is not on the card`);
    }
  });

  test("a tag is the author's words in the author's colour — MUTATION", () => {
    const out = html(doc([w("w1", "card", { title: "Seasonal", tag: "Best price", tagColour: "#B45309" })]));
    assert.match(out, /<div class="bx-card-badge" style="background:#B45309">Best price<\/div>/);
    // The card's own edge follows the tag, so the pill and the border are one
    // decision rather than two controls that can disagree.
    assert.match(out, /class="bx-card bx-card-rec" style="border-color:#B45309"/);
  });

  test("a card published as Elementor's price-table opens back out as a card", () => {
    // Stream D's website adapter PUBLISHES `price-table`'s own control names
    // (D156_HANDOFF_2026-09-17, stream D conformance point 3). A page opened
    // back out of a live site therefore arrives spelled that way, and a
    // renderer that only knew our names would show a blank card on a page the
    // client can see working in front of them.
    const out = html(doc([w("w1", "card", {
      heading: "Seasonal", price: "$2,400.00", period: "per season",
      original_price: "$2,800.00", sub_heading: "One figure for the whole winter.",
      features_list: ["Plowing", "Salt applied"], footer_additional_info: "Four instalments.",
      button_text: "Choose seasonal", link: { url: "https://example.test/pick" },
      show_ribbon: "yes", ribbon_title: "Most popular", ribbon_color: "#B45309",
    })]));
    for (const words of ["Seasonal", "$2,400.00", "per season", "$2,800.00", "One figure",
      "Plowing", "Salt applied", "Four instalments.", "Choose seasonal", "Most popular"]) {
      assert.ok(out.includes(words), `"${words}" was lost on the way back from the website`);
    }
    assert.match(out, /style="background:#B45309">Most popular</);
    assert.ok(out.includes('href="https://example.test/pick"'), "the card's button lost its link");
  });

  test("a ribbon that is switched OFF is not a tag", () => {
    // `show_ribbon` is Elementor's switch. A title left behind a switched-off
    // ribbon is a draft, not a decision, and printing it would put a word on a
    // contract that the author had turned off.
    const out = html(doc([w("w1", "card", { heading: "A", ribbon_title: "Most popular" })]));
    assert.ok(!out.includes("Most popular"), "a switched-off ribbon reached the page");
    assert.ok(!out.includes("bx-card-badge"), "a switched-off ribbon drew a pill");
  });

  test("Recommended and a typed tag are ONE mechanism, not two pills", () => {
    const rec = html(doc([w("w1", "card", { title: "A", recommended: true })]));
    assert.match(rec, /class="bx-card-badge" style="background:#0C4A60">Recommended</);
    assert.equal((rec.match(/bx-card-badge/g) || []).length, 1, "a card grew two pills");
    const plain = html(doc([w("w1", "card", { title: "A" })]));
    assert.ok(!plain.includes("bx-card-badge"), "a card nobody tagged got a pill");
  });

  test("a product card shows the catalogue's live figures, and the author's override wins", () => {
    const d = doc([
      w("w1", "product_card", { itemId: "svc-plow" }),
      w("w2", "product_card", { itemId: "svc-plow", tierId: "t-plus" }),
      w("w3", "product_card", { itemId: "svc-plow", title: "Our winter deal", price: "$1,999.00" }),
    ]);
    const out = renderSection(d.sections[0], makeContext(d, { catalogue: CATALOGUE }));
    assert.ok(out.includes("Snow &amp; ice") && out.includes("$185.00") && out.includes("per push"), "the catalogue line is not on the card");
    assert.ok(out.includes("Seasonal") && out.includes("$2,400.00") && out.includes("24h callout"), "the tier's own figures are missing");
    assert.ok(out.includes("Our winter deal") && out.includes("$1,999.00"), "the author's override lost to the catalogue");
  });

  test("a product card with no catalogue draws what is stored rather than nothing", () => {
    // A PDF worker and an offline render have no catalogue, and a blank card on
    // a contract is worse than last week's price.
    const d = doc([w("w1", "product_card", { itemId: "svc-plow", title: "Snow & ice", price: "$185.00" })]);
    const out = renderSection(d.sections[0], makeContext(d, {}));
    assert.ok(out.includes("Snow &amp; ice") && out.includes("$185.00"));
  });

  test("price_line and priced_line are ONE renderer, two spellings", () => {
    const a = html(doc([w("w1", "price_line", { name: "Per push", quantity: 2, unit_price: 185 })]));
    const b = html(doc([w("w1", "priced_line", { name: "Per push", quantity: 2, unit_price: 185 })]));
    assert.equal(
      a.replace(/bx-w-price_line/g, "K").replace(/bx-w-priced_line/g, "K"),
      b.replace(/bx-w-price_line/g, "K").replace(/bx-w-priced_line/g, "K"),
      "the rename changed what a priced line looks like",
    );
    assert.ok(a.includes("$370.00"), "two at $185 is $370");
  });

  test("an address block bound to a location prints it, and does not invite retyping", () => {
    const d = doc([w("w1", "address_block", { locationId: "loc-1" })]);
    const out = renderSection(d.sections[0], makeContext(d, { locations: LOCATIONS, mode: "edit" }));
    for (const words of ["Marshalltown depot", "1200 Prairie Ave", "Dana Reyes", "Gate code at the north entrance."]) {
      assert.ok(out.includes(words), `"${words}" is not in the address block`);
    }
    // A BOUND value is not editable in place: typing over the address here
    // would put one answer on this document and another in the record.
    assert.ok(!/data-edit="address"/.test(out), "a bound address was offered for retyping");
    assert.ok(!/data-edit="name"/.test(out), "a bound property name was offered for retyping");
  });

  test("an address block with no location takes what is typed", () => {
    const out = html(doc([w("w1", "address_block", { name: "The other yard", address: "88 Second St", contact: "Sam Okafor" })]), "edit");
    assert.ok(out.includes("The other yard") && out.includes("88 Second St") && out.includes("Sam Okafor"));
    assert.match(out, /data-edit="address"/);
  });

  test("a key fact is ONE fact, so four of them are four widgets", () => {
    const d = doc([box("b1", row(12), [
      w("w1", "key_fact", { label: "Starts", value: "1 November" }),
      w("w2", "key_fact", { label: "Runs for", value: "One winter" }),
    ])]);
    const out = html(d, "edit");
    assert.equal((out.match(/data-kind="key_fact"/g) || []).length, 2, "four facts must be four widgets");
    assert.ok(out.includes("Starts") && out.includes("One winter"));
    // Each is individually addressable, which is what "every element is
    // deletable" rests on.
    assert.ok(out.includes('data-widget="w1"') && out.includes('data-widget="w2"'));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Every surface draws them
   ══════════════════════════════════════════════════════════════════════════ */

describe("the new kinds draw on every surface", () => {
  const TREE = [box("b1", row(16), [
    w("w1", "card", { title: "Essentials", price: "$185.00", tag: "Best price", tagColour: "#B45309" }),
    w("w2", "key_fact", { label: "Starts", value: "1 November" }),
    w("w3", "address_block", { locationId: "loc-1" }),
  ])];

  test("the document renderer offers every one of them", () => {
    for (const kind of ["container", "card", "product_card", "price_line", "address_block", "key_fact"]) {
      assert.ok(RENDERED_KINDS.includes(kind), `the engine does not draw ${kind}`);
    }
  });

  test("a page draws the box and the cards", () => {
    const d = doc(TREE);
    const out = renderLandingSection(d.sections[0], makeLandingContext(d, { locations: LOCATIONS }));
    assert.match(out, /class="lp-box lp-box-row"[^>]*style="display:flex;flex-direction:row;flex-wrap:nowrap;gap:16px"/);
    assert.ok(out.includes("Essentials") && out.includes("Best price") && out.includes("Marshalltown depot"));
    for (const kind of ["container", "card", "product_card", "price_line", "address_block", "key_fact", "totals"]) {
      assert.ok(LANDING_RENDERED_KINDS.includes(kind), `a page does not draw ${kind}`);
    }
  });

  test("a row of boxes is TABLES, never flexbox — MUTATION", () => {
    const d = doc(TREE);
    const out = renderEmailSection(d.sections[0], makeEmailContext(d, { locations: LOCATIONS }));
    // The one mechanism §13.1 already had: inline-block columns with their own
    // max-width, an mso ghost table, and no query of any kind.
    assert.ok(out.includes("<!--[if mso]>"), "the row has no ghost table for Outlook");
    assert.match(out, /display:inline-block;width:100%;max-width:\d+px/);
    assert.doesNotThrow(() => assertEmailSafe(out), "the box put something in the mailbox no client can draw");
    assert.ok(out.includes("Essentials") && out.includes("BEST PRICE") === false, "the tag's words are not upper-cased by the renderer");
    assert.ok(out.includes("Best price"), "the tag is not in the mailbox");
    for (const kind of ["container", "card", "price_line", "address_block", "key_fact", "totals"]) {
      assert.ok(EMAIL_RENDERED_KINDS.includes(kind), `a mailbox does not draw ${kind}`);
    }
  });

  test("the WEBSITE surface draws a box, because it is the engine's renderer", async () => {
    // siteRender.ts plugs into `RenderContext.extra` — it adds the eleven
    // whole-page sections and draws nothing else — so the tree it gets is the
    // engine's tree and it needed no change at all. This is the test that says
    // so, rather than a comment claiming it.
    const { renderSiteWidget } = await import("../src/builder/adapters/website/siteRender.ts");
    const d = doc([box("b1", row(16), [
      w("w1", "card", { title: "Essentials", price: "$185.00" }),
      w("w2", "site_cta", { headline: "Get a quote" }),
    ])]);
    const out = renderSection(d.sections[0], makeContext(d, { extra: renderSiteWidget }));
    assert.ok(out.includes('data-box="b1"'), "the website surface lost the box");
    assert.ok(out.includes("Essentials"), "a card in a box is not on the website");
    assert.ok(out.includes("Get a quote"), "the adapter's own widget is not inside the box");
  });

  test("a box inside a column of a two-column section gets what is LEFT of the 552", () => {
    // A max-width in px is the only width a mailbox honours, so a box has to
    // know what room it is in before it can share it out.
    resetIds();
    const d = emptyDocument({ style: "newsletter" });
    d.sections = [makeSection({
      id: "s1", layout: 2,
      columns: [
        { id: "c1", widgets: [box("b1", row(16), [w("w1", "card", { title: "A" }), w("w2", "card", { title: "B" })])] },
        { id: "c2", widgets: [w("w3", "paragraph", { text: "beside" })] },
      ],
    })];
    const out = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    // 552 content, two equal section columns = 276 each; two cards inside = 138.
    assert.ok(out.includes("max-width:276px"), "the section's own column is not 276");
    assert.ok(out.includes("max-width:138px"), "the box inside it did not share out what was left");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. The phone
   ══════════════════════════════════════════════════════════════════════════ */

describe("a row of boxes stacks on a phone, like every other row", () => {
  test("both stylesheets beat the inline direction at the stacking width", () => {
    assert.match(DOCUMENT_CSS, /\.bx-box-row \{ flex-direction: column !important; \}/);
    assert.match(DOCUMENT_CSS, /\.bx-box-grid \{ grid-template-columns: 1fr !important; \}/);
    assert.ok(LANDING_CSS.includes(".lp-box-row{flex-direction:column !important}"));
    assert.ok(LANDING_CSS.includes(".lp-box-grid{grid-template-columns:1fr !important}"));
  });

  test("the email needs no rule at all, because it wraps", () => {
    // The fluid-hybrid row stacks by running out of room. There is no
    // breakpoint to get wrong, which is why there is no second mechanism.
    const d = doc([box("b1", row(), [w("w1", "card", { title: "A" }), w("w2", "card", { title: "B" })])]);
    const out = renderEmailSection(d.sections[0], makeEmailContext(d, {}));
    assert.ok(!out.includes("@media"), "the email grew a query");
    assert.ok(!out.includes("@container"), "the email grew a container query");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. Nothing already signed changes
   ══════════════════════════════════════════════════════════════════════════ */

describe("a document without boxes is the document it always was", () => {
  test("deserialise does not invent a container anywhere", () => {
    const stored = {
      v: 2,
      sections: [{
        id: "s", layout: 1, visibility: "customer",
        columns: [{ id: "c", widgets: [{ id: "w", kind: "paragraph", props: { text: "Plain." } }] }],
      }],
    };
    const d = deserialise(stored);
    const widget = d.sections[0].columns[0].widgets[0];
    assert.ok(!("children" in widget.props), "a plain widget grew children");
    assert.equal(walkDocumentTree(d).length, 1);
  });

  test("renderWidget is unchanged for every kind that is not a box", () => {
    const d = emptyDocument();
    const ctx = makeContext(d, {});
    for (const kind of ["heading", "paragraph", "divider", "spacer", "list"]) {
      const one = renderWidget(makeWidget(kind, { text: "x", items: ["y"] }), ctx);
      const two = renderWidget(makeWidget(kind, { text: "x", items: ["y"] }), ctx, 0);
      assert.equal(one.replace(/w\d+/g, "W"), two.replace(/w\d+/g, "W"), `${kind} changed`);
      assert.ok(!one.includes("bx-box"), `${kind} grew a box`);
    }
  });
});

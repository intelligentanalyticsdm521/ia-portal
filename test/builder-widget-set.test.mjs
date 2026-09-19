// test/builder-widget-set.test.mjs — D-165, scope §11.13.3.
//
// THE CONTRACT THIS PINS, in Brandon's own words (2026-09-19): "Widgets on the
// side - all the widgets should be on the left side. This is the 5th time that
// I have explained this. You have all this random details on the side. I never
// asked for any of that." And, after the lists: "these widgets and everything
// look right, so if you now understand, build this."
//
// So this file asks four questions and nothing else:
//
//   1. Is every tile's NAME Elementor's own, or on the IA list? Nothing else
//      may be on the panel — that is the whole of what "do not invent" means
//      here, and it is the test that would have caught the Details block.
//   2. Does each builder offer EXACTLY §11.13.3's list, in the panel's order?
//      By name, in order, per adapter. Not "contains" — equals.
//   3. Are the deleted kinds gone from the definitions AND from the renderer,
//      and does every stored one convert on open without losing a word or a
//      penny?
//   4. Does every shipped template and ready-made section come out of `build()`
//      holding only kinds the panel or the renderer knows?
//
// ── THE MUTATIONS, run by EXECUTING the real functions ────────────────────
// Each one was broken on purpose, seen red, and restored. They are written out
// at the bottom of this file with what went red.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILY_OF_KIND } from "../src/builder/widgets/families/index.ts";
import path from "node:path";

import {
  WIDGETS, WIDGETS_BY_KIND, WIDGET_CATEGORIES, PANEL_ORDER, LAYOUT_PRESETS,
  GRID_PRESET_KIND, controlTab, presetFor, unorderedKinds, widgetsFor, widgetLabel,
} from "../src/builder/registry.ts";
import { panelGroups, PANEL_GROUPS, unmappedKinds } from "../src/builder/widgetGroups.ts";
import { ATOM_KINDS, atomKindsAgree } from "../src/builder/widgets/index.ts";
import {
  isCatalogueTile, isPickerTile, nodesForPicks,
} from "../src/builder/proposal/catalogueTiles.ts";
import { RENDERED_KINDS, makeContext, renderDocument } from "../src/builder/render.ts";
import { DELETED_KINDS, upgradeDocument, needsUpgrade } from "../src/builder/upgrade.ts";
import { COMPOSITE_KINDS } from "../src/builder/upgrade.ts";
import { emptyDocument, makeSection, makeWidget } from "../src/builder/model.ts";
import { makeContainer } from "../src/builder/treeOps.ts";
import { documentTotals } from "../src/builder/totals.ts";
import { PREMADE_SECTIONS, SHIPPED_TEMPLATES, documentHeaderSections } from "../src/builder/templates.ts";
import { snowAgreementDocument } from "../src/builder/snowAgreement.ts";
import { isRecordKind, renderRecordBlock } from "../src/builder/proposal/recordWidgets.ts";

const NAMES = JSON.parse(readFileSync(
  path.join(process.cwd(), "test/fixtures/elementor-widget-names.json"), "utf8"));

/** Every widget title a real Elementor has, free and Pro. Machine-cut. */
const ELEMENTOR_TITLES = new Set(NAMES.all_titles);

/**
 * THE IA LIST — §11.13.3's fourth column, plus the three names the shared
 * vocabulary gives our own money atoms.
 *
 * Written out here rather than derived from the registry, because a test that
 * read the answer off the thing it is checking would pass whatever the registry
 * said. This is the scope document, retyped.
 */
const IA_NAMES = new Set([
  // proposals
  "Product Cards", "Product Line Items", "Totals", "Customer", "Service Location",
  "Business Info", "Terms", "Signature", "Page Break",
  // the shared vocabulary's own three
  "Card", "Product Card", "Product Line Item",
  // email
  "IA Posts", "Reviews", "Book Now", "Unsubscribe Footer",
  // website and landing
  "IA Mega Menu", "IA Mobile Menu", "IA OLIVER Invoice", "IA Social Links",
  "IA Form", "Newsletter Signup", "Hours and Location",
]);

/** The four builders §11.13.3 names. The studio is not one of them. */
const CONTRACT_ADAPTERS = ["proposal", "email", "website", "landing"];

const labels = (adapter) => widgetsFor(adapter).map((w) => widgetLabel(w, adapter));

/* ══════════════════════════════════════════════════════════════════════════
   1. The panel's groups and names
   ══════════════════════════════════════════════════════════════════════════ */

describe("the left panel is Elementor's", () => {
  test("the groups are Layout / Basic / General / Intelligent Analytics, in that order", () => {
    assert.deepEqual([...WIDGET_CATEGORIES],
      ["Layout", "Basic", "General", "Intelligent Analytics"]);
    // ONE grouping, in ONE module. `widgetGroups` reads the registry's own
    // `category` and keeps no second list; `widgetTasks.ts`, which held the
    // other half of it, is deleted (integration, 2026-09-19).
    assert.deepEqual([...PANEL_GROUPS], [...WIDGET_CATEGORIES]);
    assert.deepEqual(unmappedKinds(), []);
  });

  test("Layout holds exactly Container and Grid, as Elementor's does", () => {
    const layout = WIDGETS.filter((w) => w.category === "Layout" && !w.hidden).map((w) => w.label);
    assert.deepEqual(layout, NAMES.groups.layout.map((g) => g.title));
  });

  test("no tile has a name that is neither Elementor's nor on the IA list", () => {
    const strays = [];
    for (const adapter of CONTRACT_ADAPTERS) {
      for (const w of widgetsFor(adapter)) {
        const label = widgetLabel(w, adapter);
        if (!ELEMENTOR_TITLES.has(label) && !IA_NAMES.has(label)) strays.push(`${adapter}: ${label}`);
      }
    }
    assert.deepEqual(strays, [], "a tile nobody asked for");
  });

  test("the Details group is gone, by every name it ever had", () => {
    for (const gone of ["details", "personal_detail", "merge_field", "key_fact", "key_value_table"]) {
      assert.equal(WIDGETS_BY_KIND[gone], undefined, gone);
    }
    const files = ["src/builder/registry.ts", "src/builder/widgetGroups.ts", "src/builder/render.ts"];
    for (const f of files) {
      const src = readFileSync(path.join(process.cwd(), f), "utf8");
      assert.equal(/DetailsGroup|PACK_LABELS/.test(src), false, `${f} still names the Details group`);
    }
  });

  /**
   * PANEL_ORDER AND THE FAMILIES — what is still owed, named rather than hidden.
   *
   * `PANEL_ORDER` is in `registry.ts`. §C.1 of the family split says in as many
   * words that no family agent opens that file, so a family's widgets cannot
   * put themselves in it. The registry does not drop them — `widgetsFor` sorts
   * an unlisted kind after every listed one — so they appear, at the end of
   * their group, which is why the three lists below end with them.
   *
   * This test still FAILS on an unordered widget that is NOT a family widget,
   * which is the case it was written for. The family ones are printed, and the
   * LANDER closes the list by adding them to `PANEL_ORDER` in Elementor's own
   * positions and deleting this allowance.
   */
  test("every offered widget has a place in PANEL_ORDER", () => {
    const familyKinds = new Set(Object.keys(FAMILY_OF_KIND));
    const unordered = unorderedKinds();
    const strays = unordered.filter((k) => !familyKinds.has(k));
    assert.deepEqual(strays, [],
      `offered, unordered, and not a family's to fix: ${strays.join(", ")}`);
    const owed = unordered.filter((k) => familyKinds.has(k));
    console.log(`  TODO PANEL_ORDER owes the families: ${owed.length ? owed.join(", ") : "nothing"}`);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. The per-adapter lists — by name, IN ORDER
   ══════════════════════════════════════════════════════════════════════════ */

/*
 * WHO DECIDES WHAT IS ON A PANEL — CHANGED 2026-09-19 (B-168, D-168).
 *
 * `test/builder-offers.test.mjs` does, against the offer file Brandon approved
 * at 12:58 CDT. Where §11.13.3 and the offer file disagree, the offer file
 * wins, and that is why these lists no longer read as they did this morning:
 *
 *   · Star Rating is "Rating", which is Elementor's own title for it;
 *   · Card, Customer, Service Location, Business Info, Terms, Toggle,
 *     Newsletter Signup, Hours and Location, Brand colour block, Background
 *     and Social handle are NOT in the offer and are no longer tiles. Each is
 *     `hidden: true` — still in the vocabulary, so a document already carrying
 *     one still draws, but nothing a client can add. The three record widgets
 *     are replaced by the ONE Custom Field widget (D-167), which the families
 *     build;
 *   · IA OLIVER Invoice is website only, and Icon List is not a My Brand tile.
 *
 * What these tests still earn their keep for is ORDER: the offer test asks what
 * may be on the panel, this one asks what order it is in, and Elementor's
 * registration order inside a group is a real part of the parity score.
 */
describe("each builder's panel, in order (membership: builder-offers.test.mjs)", () => {
  test("proposals and quotes", () => {
    assert.deepEqual(labels("proposal"), [
      "Container", "Grid",
      "Heading", "Image", "Text Editor", "Button", "Divider", "Spacer", "Icon",
      "Image Box", "Icon Box", "Rating", "Icon List", "Testimonial", "Social Icons", "Alert",
      "Product Cards", "Product Line Items", "Totals", "Signature", "Page Break",
      /* B-168 f6-money — LAST, and not because it belongs there.
         `PANEL_ORDER` lives in `registry.ts`, which no family agent may open
         (§C.1: "no family agent ever opens registry.ts, render.ts or another
         family's folder"). A kind that is not in that list still appears — the
         registry puts it after the ordered ones rather than dropping it —
         so every family's widgets land at the end of their group until the
         LANDER puts them in `PANEL_ORDER` where Elementor puts them: Price
         Table and Price List after Testimonial in General, the two payment
         buttons after them. Written down here and in the handoff. */
      "Price Table", "Price List",
    ]);
  });

  /**
   * THE EMAIL ROW, AND WHY IT IS STILL SHORT OF TWO THINGS.
   *
   * §11.13.3 gives email *"the set above minus what email programs cannot
   * show"*. `adapters/email/emailRender.ts` builds a mailbox out of TABLES and
   * its own guards refuse flex, grid and CSS classes — a fallback to the
   * engine's renderer was tried and those guards caught it by name. So a
   * widget reaches this panel when this file has a TABLE renderer for it, and
   * Icon, Icon Box, Image Box, Star Rating and Alert now do (integration,
   * 2026-09-19). **Reviews** and **Book Now** still do not, and are the two
   * subtractions left — item S2 in the handoff.
   *
   * The IA column uses the ids the mailbox already draws: **Product Cards** is
   * `product_card`, **IA Posts** is `article_card`, **Unsubscribe Footer** is
   * `email_footer`. That is the shared vocabulary's first rule, not a shortcut:
   * an id that exists keeps its id and takes the new label.
   */
  test("email and newsletters", () => {
    assert.deepEqual(labels("email"), [
      "Container", "Grid",
      "Heading", "Image", "Text Editor", "Button", "Divider", "Spacer", "Icon",
      "Image Box", "Icon Box", "Rating", "Icon List", "Testimonial", "Social Icons", "Alert",
      "Product Cards", "IA Posts", "Unsubscribe Footer",
      /* B-168 f6-money — LAST, and not because it belongs there.
         `PANEL_ORDER` lives in `registry.ts`, which no family agent may open
         (§C.1: "no family agent ever opens registry.ts, render.ts or another
         family's folder"). A kind that is not in that list still appears — the
         registry puts it after the ordered ones rather than dropping it —
         so every family's widgets land at the end of their group until the
         LANDER puts them in `PANEL_ORDER` where Elementor puts them: Price
         Table and Price List after Testimonial in General, the two payment
         buttons after them. Written down here and in the handoff. */
      "Price Table", "Price List",
    ]);
  });

  /**
   * PRODUCT CARDS IS NOT ON THIS LIST, and that is the one place the panel is
   * short of §11.13.3 (integration, 2026-09-19).
   *
   * The tile IS the catalogue picker — it has no stored form of its own, and
   * pressing it opens the multi-select and drops atoms. That picker is wired
   * into the proposal builder and nowhere else, so on a website page the tile
   * would be a button that opens nothing and leaves a node the emitter has to
   * publish empty. Two streams reached this independently and for the same
   * reason; the ask is R-3.5 in D165_HANDOFF_2026-09-19.md. arion's emitter
   * for it is already written, so this is the picker and not the plumbing.
   */
  test("website pages", () => {
    assert.deepEqual(labels("website"), [
      "Container", "Grid",
      "Heading", "Image", "Text Editor", "Video", "Button", "Divider", "Spacer", "Google Maps", "Icon",
      "Image Box", "Icon Box", "Rating", "Image Carousel", "Basic Gallery", "Icon List",
      "Counter", "Progress Bar", "Testimonial", "Tabs", "Accordion",
      "Social Icons", "Alert", "Shortcode", "HTML", "Menu Anchor",
      "IA Posts", "Reviews", "Book Now",
      "IA Form",
      "IA Mega Menu", "IA Mobile Menu", "IA OLIVER Invoice", "IA Social Links",
      /* B-168 f6-money — LAST, and not because it belongs there.
         `PANEL_ORDER` lives in `registry.ts`, which no family agent may open
         (§C.1: "no family agent ever opens registry.ts, render.ts or another
         family's folder"). A kind that is not in that list still appears — the
         registry puts it after the ordered ones rather than dropping it —
         so every family's widgets land at the end of their group until the
         LANDER puts them in `PANEL_ORDER` where Elementor puts them: Price
         Table and Price List after Testimonial in General, the two payment
         buttons after them. Written down here and in the handoff. */
      "Price Table", "Price List", "PayPal Button", "Stripe Button",
    ]);
  });

  test("Product Cards is offered where its picker is, and nowhere else", () => {
    assert.ok(labels("proposal").includes("Product Cards"));
    for (const a of ["website", "landing"]) {
      assert.equal(labels(a).includes("Product Cards"), false,
        `${a} offers a tile whose picker is not wired into it`);
    }
    // The email's "Product Cards" is a DIFFERENT kind — `product_card`, the
    // composite the mailbox already draws — so it is on that panel by name.
    assert.ok(labels("email").includes("Product Cards"));
  });

  test("landing pages are the website's list without the site pieces", () => {
    const site = labels("website");
    const landing = labels("landing");
    /* D-168 widened this by one: the offer file lists IA OLIVER Invoice under
       `website.ia` only. A hosted landing page has no signed-in customer to
       show an invoice to, which is the same reason the menus are not there. */
    const siteOnly = ["IA Mega Menu", "IA Mobile Menu", "IA OLIVER Invoice"];
    assert.deepEqual(landing, site.filter((l) => !siteOnly.includes(l)));
  });

  test("a proposal is offered nothing that cannot print", () => {
    for (const cannot of ["Video", "Tabs", "Accordion", "Toggle", "Image Carousel", "Google Maps", "HTML", "Shortcode"]) {
      assert.equal(labels("proposal").includes(cannot), false, cannot);
    }
  });

  test("the groups a builder draws are in Elementor's order and never empty", () => {
    for (const adapter of CONTRACT_ADAPTERS) {
      const groups = panelGroups(adapter).map((g) => g.group);
      assert.deepEqual(groups, WIDGET_CATEGORIES.filter((c) => groups.includes(c)), adapter);
      for (const g of panelGroups(adapter)) assert.ok(g.widgets.length > 0, `${adapter} ${g.group}`);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Controls carry their tab and their section
   ══════════════════════════════════════════════════════════════════════════ */

describe("a control says which tab and which section it is drawn in", () => {
  test("every control is on one of Elementor's three tabs", () => {
    for (const w of WIDGETS) {
      for (const c of w.controls) {
        assert.ok(["content", "style", "advanced"].includes(controlTab(c)), `${w.kind}.${c.key}`);
      }
    }
  });

  test("every control of a D-165 widget names its panel section", () => {
    const added = new Set(ATOM_KINDS);
    for (const w of WIDGETS) {
      if (!added.has(w.kind)) continue;
      for (const c of w.controls) {
        assert.ok(c.section && c.section.trim(), `${w.kind}.${c.key} has no section`);
      }
    }
  });

  test("the widgets that draw themselves are named, rendered and defined as one set", () => {
    const { onlyNamed, onlyRendered, onlyDefined } = atomKindsAgree();
    assert.deepEqual({ onlyNamed, onlyRendered, onlyDefined }, { onlyNamed: [], onlyRendered: [], onlyDefined: [] });
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Grid is a preset, not a second node type
   ══════════════════════════════════════════════════════════════════════════ */

describe("Grid is a Container", () => {
  test("the Grid tile inserts a container laid out as a grid", () => {
    const preset = presetFor(GRID_PRESET_KIND);
    assert.equal(preset.kind, "container");
    assert.equal(preset.style.direction, "grid");
    assert.equal(presetFor("container").kind, "container");
    assert.deepEqual(presetFor("heading"), null);
  });

  test("nothing is ever stored with kind `grid`", () => {
    const kinds = new Set();
    const walk = (nodes) => {
      for (const n of nodes) { kinds.add(n.kind); if (n.children) walk(n.children); }
    };
    for (const t of SHIPPED_TEMPLATES) for (const s of t.build().sections) for (const c of s.columns) walk(c.widgets);
    for (const p of PREMADE_SECTIONS) for (const c of p.build().columns) walk(c.widgets);
    assert.equal(kinds.has(GRID_PRESET_KIND), false);
    assert.equal(Object.keys(LAYOUT_PRESETS).length, 2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. The panel tiles that open the catalogue picker
   ══════════════════════════════════════════════════════════════════════════ */

describe("Product Cards and Product Line Items are pickers", () => {
  /* ONE EXPANSION, and it is `proposal/catalogueTiles.nodesForPicks`
     (integration, 2026-09-19). This file used to drive `expandPanelTile` in
     `widgets/iaBlocks.ts`, a second copy of the same job that the screen never
     called: the proposal builder opens the catalogue picker and calls the
     function below. The unwired one is deleted, and these are the same claims
     made against the one that runs. */
  const picks = [
    { offering: { offering_id: "off-1", name: "Snow removal" }, price: { price_id: "p-1", unit_amount: 625 } },
    { offering: { offering_id: "off-2", name: "Grounds care" }, price: null },
  ];

  test("Product Cards drops one catalogue card per pick, in a row", () => {
    const [box] = nodesForPicks("product_cards", picks);
    assert.equal(box.kind, "container");
    assert.equal(box.style.direction, "row");
    assert.deepEqual(box.children.map((c) => c.kind), ["catalog_card", "catalog_card"]);
    // `_ia_selection` is the Binding section's own home and spells the
    // catalogue's two keys as the catalogue does (widgets/binding.ts).
    assert.equal(box.children[0].props._ia_selection.offering_id, "off-1");
    assert.equal(box.children[0].props._ia_selection.price_id, "p-1");
  });

  test("Product Line Items drops a stack of priced lines", () => {
    const out = nodesForPicks("product_line_items", picks);
    assert.deepEqual(out.map((n) => n.kind), ["price_line", "price_line"]);
    assert.equal(out[0].props.quantity, 1);
  });

  test("cancelling the picker adds nothing", () => {
    assert.deepEqual(nodesForPicks("product_cards", []), []);
    assert.deepEqual(nodesForPicks("product_line_items", []), []);
  });

  test("the atoms are not tiles — the picker is the only door", () => {
    assert.ok(isCatalogueTile("product_cards") && isCatalogueTile("product_line_items"));
    assert.equal(isCatalogueTile("catalog_card"), false);
    // Terms is the third tile: a picker, not a widget with a stored form.
    assert.ok(isPickerTile("terms"));
    assert.equal(WIDGETS_BY_KIND.catalog_card.hidden, true);
    assert.equal(WIDGETS_BY_KIND.price_line.hidden, true);
  });

  test("there is only ONE expansion on the platform", () => {
    // The mutation that matters: put the second copy back and this goes red.
    const src = readFileSync(path.join(process.cwd(), "src/builder/widgets/iaBlocks.ts"), "utf8");
    assert.equal(/export function expandPanelTile/.test(src), false,
      "iaBlocks.ts declares a second expansion again");
    assert.equal(/PRODUCT_CARDS_DEF|PRODUCT_LINE_ITEMS_DEF/.test(src), false,
      "iaBlocks.ts declares the tiles again");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. Replace means delete — and stored documents keep every word and penny
   ══════════════════════════════════════════════════════════════════════════ */

const ctx = (doc) => makeContext(doc, {
  mode: "view",
  merge: { "customer.name": "Fixture Grounds Co", "customer.email": "hello@example.test" },
  business: { name: "Fixture Landscaping" },
});

const docOf = (widgets) => ({
  ...emptyDocument(),
  sections: [makeSection({ columns: [{ id: "c1", widgets }], layout: 1 })],
});

describe("the deleted kinds are gone and convert on open", () => {
  test("none of them is in the registry or the renderer", () => {
    for (const kind of DELETED_KINDS) {
      assert.equal(WIDGETS_BY_KIND[kind], undefined, `${kind} is still a definition`);
      assert.equal(RENDERED_KINDS.includes(kind), false, `${kind} is still drawn`);
    }
  });

  test("a document holding one of each comes back holding only standard parts", () => {
    const before = docOf([
      makeWidget("doc_header", { style: "dark_band", title: "Winter 2026", subtitle: "For you", logoUrl: "data:image/png;base64,AA" }),
      makeWidget("key_value_table", { rows: [{ label: "Term", value: "Nov–Apr" }] }),
      makeWidget("key_fact", { label: "Trigger", value: "2 inches" }),
      makeWidget("merge_field", { token: "customer.name" }),
      makeWidget("footer_note", { text: "Small print." }),
      makeWidget("callout", { heading: "Note", panels: [{ title: "Important", tone: "warn", body: "Read this." }] }),
      makeWidget("pricing_table", { heading: "Rates", rows: [{ name: "Plowing", basis: "Per push", rate: "$185" }] }),
      makeWidget("property_plan", { locationId: "LOC-1", heading: "The site", rows: [{ label: "Where we salt", value: "Both doors" }] }),
      makeWidget("address_block", { locationId: "loc-9", heading: "Service address" }),
      makeWidget("address_block", { heading: "Bill to", name: "Fixture Grounds Co", address: "1 Fixture Way" }),
      makeWidget("map", { address: "Columbus, OH" }),
    ]);
    assert.equal(needsUpgrade(before), true);

    const after = upgradeDocument(before);
    const kinds = [];
    const walk = (nodes) => { for (const n of nodes) { kinds.push(n.kind); if (n.children) walk(n.children); } };
    for (const s of after.sections) for (const c of s.columns) walk(c.widgets);

    for (const kind of DELETED_KINDS) assert.equal(kinds.includes(kind), false, `${kind} survived`);
    for (const kind of COMPOSITE_KINDS) assert.equal(kinds.includes(kind), false, `${kind} survived`);
    // ASSERT PRESENCE: the parts it became are actually there.
    for (const wanted of ["image", "heading", "paragraph", "alert", "price_line", "service_location", "customer", "google_maps"]) {
      assert.ok(kinds.includes(wanted), `nothing became ${wanted}`);
    }
    assert.equal(needsUpgrade(after), false, "the pass is not idempotent");
  });

  test("the words survive — every sentence is still on the page", () => {
    const before = docOf([
      makeWidget("doc_header", { title: "Winter 2026", subtitle: "Prepared for you" }),
      makeWidget("footer_note", { text: "Anything not written here is not included." }),
      makeWidget("callout", { panels: [{ title: "Important", tone: "warn", body: "We will not promise a time we cannot keep." }] }),
      makeWidget("key_fact", { label: "Trigger depth", value: "2 inches" }),
    ]);
    const html = renderDocument(upgradeDocument(before), ctx(before));
    for (const words of [
      "Winter 2026", "Prepared for you",
      "Anything not written here is not included.",
      "Important", "We will not promise a time we cannot keep.",
      "Trigger depth", "2 inches",
    ]) {
      assert.ok(html.includes(words), `lost: ${words}`);
    }
  });

  test("MONEY IS PRESERVED — the total is the same before and after", () => {
    const before = docOf([
      makeWidget("price_line", { name: "Plowing", quantity: 3, unit_price: 625, cadence: "per push" }),
      // A rate card never fed the total (totals.ts rule 1) and the priced lines
      // it becomes must not start feeding one.
      makeWidget("pricing_table", { heading: "Rates", rows: [{ name: "Salting", basis: "Per application", rate: "$185" }] }),
      makeWidget("key_fact", { label: "Minimum", value: "$250" }),
      makeWidget("totals", { heading: "Your total" }),
    ]);
    const a = documentTotals(before);
    const b = documentTotals(upgradeDocument(before));
    /* THE FIGURES, not the shape. The rate card becomes priced lines, so the
       document gains two lines — that is the point of the conversion. Every one
       of them is priced at ZERO, because a rate card's cell held WORDS
       ("$185 per push") and inventing a number from them would put a charge on
       a signed agreement that nobody typed. */
    assert.equal(b.subtotal, a.subtotal);
    assert.equal(b.tax, a.tax);
    assert.equal(b.discount, a.discount);
    assert.equal(b.total, a.total);
    assert.equal(a.subtotal, 1875);
    assert.ok(b.lines.length > a.lines.length, "the rate card did not become lines");
    for (const l of b.lines.slice(a.lines.length)) assert.equal(l.line_total, 0);
  });

  test("a document that never held one comes back as THE SAME OBJECT", () => {
    const doc = docOf([
      makeWidget("heading", { text: "Scope of work", level: 2 }),
      makeContainer({ direction: "row", gap: 16 }, [makeWidget("paragraph", { text: "Hello." })]),
    ]);
    assert.equal(needsUpgrade(doc), false);
    assert.equal(upgradeDocument(doc), doc);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. The library — every template and section is built from the new set
   ══════════════════════════════════════════════════════════════════════════ */

const KNOWN = new Set([...RENDERED_KINDS, "container"]);

function kindsIn(doc) {
  const out = [];
  const walk = (nodes) => { for (const n of nodes) { out.push(n.kind); if (n.children) walk(n.children); } };
  for (const s of doc.sections) for (const c of s.columns) walk(c.widgets);
  return out;
}

describe("the shipped library holds nothing this build cannot draw", () => {
  for (const t of SHIPPED_TEMPLATES) {
    test(`template “${t.name}” is built from the new set`, () => {
      const kinds = kindsIn(t.build());
      const strays = [...new Set(kinds)].filter((k) => !KNOWN.has(k));
      assert.deepEqual(strays, []);
    });
  }

  for (const p of PREMADE_SECTIONS) {
    test(`ready-made section “${p.name}” is built from the new set`, () => {
      const kinds = kindsIn({ ...emptyDocument(), sections: [p.build()] });
      const strays = [...new Set(kinds)].filter((k) => !KNOWN.has(k));
      assert.deepEqual(strays, []);
    });
  }

  test("the Document header section is a row of an Image and a Heading", () => {
    const [section] = documentHeaderSections();
    const [row] = section.columns[0].widgets;
    assert.equal(row.kind, "container");
    assert.equal(row.style.direction, "row");
    assert.deepEqual(row.children.map((c) => c.kind), ["image", "container"]);
    assert.deepEqual(row.children[1].children.map((c) => c.kind), ["heading", "paragraph"]);
    assert.ok(PREMADE_SECTIONS.some((p) => p.key === "document_header"));
  });
});

describe("the Commercial snow & ice agreement, rebuilt (D-164 unchanged)", () => {
  const doc = upgradeDocument(snowAgreementDocument());

  test("its ten numbered sections are still its ten numbered sections", () => {
    const numbered = doc.sections.filter((s) => s.numbered).map((s) => s.label);
    assert.deepEqual(numbered, [
      "Agreement at a glance", "Scope of services", "Ice, deicing and optional services",
      "Severe weather and special conditions", "Property responsibilities", "Pricing schedule",
      "Billing and payment", "General terms", "Acceptance", "Property service plan",
    ]);
  });

  test("it is built from the new set, and the old kinds are nowhere in it", () => {
    const kinds = new Set(kindsIn(doc));
    for (const gone of DELETED_KINDS) assert.equal(kinds.has(gone), false, gone);
    for (const wanted of ["image", "heading", "paragraph", "data_table", "alert", "price_line", "service_location", "signature"]) {
      assert.ok(kinds.has(wanted), `the agreement lost its ${wanted}`);
    }
  });

  test("the per-event rule and the clauses still say what they said", () => {
    const html = renderDocument(doc, ctx(doc));
    for (const words of [
      "Commercial Snow &amp; Ice Management Agreement",
      "a long storm is more than one visit",
      "We will not promise you a time we cannot keep.",
      "See the pricing schedule",
      "Quoted separately",
      "Property service plan",
    ]) {
      assert.ok(html.includes(words), `lost: ${words}`);
    }
  });

  test("its money is untouched by the rebuild", () => {
    const before = documentTotals(snowAgreementDocument());
    assert.deepEqual(documentTotals(doc), before);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   8. Every new widget actually draws
   ══════════════════════════════════════════════════════════════════════════ */

describe("every widget the panel offers draws something", () => {
  const SAMPLE = {
    icon: { selected_icon: { value: "fas fa-check", library: "fa-solid" }, view: "stacked" },
    icon_box: { title_text: "Salt included", description_text: "Every visit." },
    image_box: { image: "data:image/png;base64,AA", title_text: "Our work", description_text: "A photo." },
    testimonial: { quote: "They turned up at 4am.", attribution: "A customer", rating: 5 },
    star_rating: { rating: 4, title: "Our rating" },
    alert: { alert_type: "warning", alert_title: "Important", alert_description: "Read this." },
    social_icons: { social_icon_list: [{ social: "facebook", link: "https://example.test/fb" }] },
    video: { url: "https://www.youtube.com/watch?v=abc123" },
    google_maps: { address: "Columbus, OH" },
    counter: { ending_number: 1200, suffix: "+", title: "Jobs done" },
    progress_bar: { title: "Season booked", percent: 72 },
    tabs: { tabs: [{ tab_title: "Winter", tab_content: "Snow." }] },
    accordion: { tabs: [{ tab_title: "When do you come out?", tab_content: "At two inches." }] },
    toggle: { tabs: [{ tab_title: "Do you salt?", tab_content: "Yes." }] },
    image_carousel: { carousel: [{ url: "data:image/png;base64,AA" }] },
    basic_gallery: { wp_gallery: [{ url: "data:image/png;base64,AA" }] },
    shortcode: { shortcode: "[contact-form]" },
    menu_anchor: { anchor: "prices" },
    html: { html: "<p>Hello.</p>" },
    ia_posts: { items: [{ title: "First snow", excerpt: "It came early." }] },
    reviews: { items: [{ quote: "Great.", author: "A customer", rating: 5 }] },
    book_now: { label: "Book now", url: "https://example.test/book" },
    ia_form: { fields: [{ label: "Name" }], submit_label: "Send" },
    newsletter_signup: { heading: "Join the list", button_label: "Sign up" },
    hours_location: { heading: "Find us", hours: [{ day: "Monday", open: "8–5" }] },
  };

  for (const [kind, props] of Object.entries(SAMPLE)) {
    test(`${kind} puts something on the page`, () => {
      const doc = docOf([makeWidget(kind, props)]);
      const html = renderDocument(doc, ctx(doc));
      assert.ok(html.includes(`bx-w-${kind}`), `${kind} drew no wrapper`);
      // A Menu Anchor is deliberately invisible on the page: its whole output
      // is the `id` a menu link jumps to. So an id counts as drawing something.
      assert.ok(html.replace(/<[^>]*>/g, "").trim().length > 0 || /src=|href=|id="/.test(html), `${kind} drew nothing`);
    });
  }

  test("a widget in edit mode is reachable even when it is empty", () => {
    for (const kind of ["icon_box", "image_box", "alert"]) {
      const doc = docOf([makeWidget(kind, {})]);
      const html = renderDocument(doc, makeContext(doc, { mode: "edit", business: { name: "Fixture" } }));
      assert.ok(/data-edit=|data-placeholder=/.test(html), `${kind} has nothing to click`);
    }
  });

  /**
   * THE THREE RECORD WIDGETS DRAW THROUGH THE ADAPTER, so they are pinned
   * where their renderer really is (integration, 2026-09-19).
   *
   * `render.ts` asks `ctx.extra` before its own switch, and the proposal
   * adapter is the one that has the customer, the site and the business in its
   * hand — so Customer, Service Location and Business Info are drawn by
   * `proposal/recordWidgets.renderRecordBlock` with a RECORD BOOK, not by the
   * engine's map. Rendering them with no book and asserting a wrapper would be
   * asserting the wrong thing about the wrong renderer.
   */
  for (const [kind, book] of [
    ["customer", { customer: { name: "Fixture Grounds Co", email: "hello@example.test" } }],
    ["service_location", { service_location: { name: "North lot", address: "1 Fixture Way" } }],
    ["business_info", { business_info: { name: "Fixture Landscaping", phone: "555-0100" } }],
  ]) {
    test(`${kind} puts something on the page, through the adapter's record book`, () => {
      const doc = docOf([makeWidget(kind, {})]);
      const base = ctx(doc);
      const html = renderDocument(doc, {
        ...base,
        extra: (w, c) => (isRecordKind(w.kind) ? renderRecordBlock(w, c, book) : null),
      });
      assert.ok(html.includes(`bx-w-${kind}`), `${kind} drew no wrapper`);
      assert.ok(html.replace(/<[^>]*>/g, "").trim().length > 0, `${kind} drew nothing`);
    });
  }

  test("the three are reachable in edit mode even with an empty record", () => {
    for (const kind of ["customer", "service_location", "business_info"]) {
      const doc = docOf([makeWidget(kind, {})]);
      const base = makeContext(doc, { mode: "edit", business: { name: "Fixture" } });
      const html = renderDocument(doc, {
        ...base,
        extra: (w, c) => (isRecordKind(w.kind) ? renderRecordBlock(w, c, {}) : null),
      });
      assert.ok(/data-edit=|data-placeholder=/.test(html), `${kind} has nothing to click`);
    }
  });

  test("the plugin's four say what they are on the canvas and nothing on the page", () => {
    for (const kind of ["ia_mega_menu", "ia_mobile_menu", "ia_oliver_invoice", "ia_social_links"]) {
      const doc = docOf([makeWidget(kind, {})]);
      assert.ok(renderDocument(doc, makeContext(doc, { mode: "edit" })).includes("bx-plugin"), kind);
      assert.equal(renderDocument(doc, ctx(doc)).includes("bx-plugin"), false, kind);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE MUTATIONS — each broken on purpose, seen red, restored
   ══════════════════════════════════════════════════════════════════════════

   | # | what was broken                                            | what went red |
   |---|------------------------------------------------------------|---------------|
   | 1 | `registry.ts` `widgetsFor` stops sorting by `PANEL_ORDER`  | all four per-adapter list tests — the order is the contract |
   | 2 | `iaBlocks.ts` `expandPanelTile` drops the row Container    | "Product Cards drops one catalogue card per pick, in a row" |
   | 3 | `upgrade.ts` `fromPricingTable` gives each line the row's   | "MONEY IS PRESERVED" — the subtotal goes 1875 → 2060 |
   |   | rate as `unit_price`                                       | |
   | 4 | `upgrade.ts` `fromKeyFacts` emits `key_fact` again          | "a document holding one of each…" and every snow-agreement test |
   | 5 | `widgets/index.ts` drops `alert` from the renderer map      | "alert puts something on the page" + the words test |
   | 6 | `boxes.ts` `renderTestimonial` reads only Elementor's       | "testimonial puts something on the page" — every stored review blanks |
   |   | `testimonial_content`                                      | |
*/

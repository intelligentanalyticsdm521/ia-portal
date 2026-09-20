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
import { FAMILY_OF_KIND } from "../src/builder/widgets/families/index.ts";
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
/* D-168 item 7 — THE ORDER IS READ, not typed. See the helper's own header. */
import {
  GROUPS as PANEL_GROUPS_EXPECTED, groupFaults, panelOrderFaults,
} from "./helpers/panelOrder.mjs";
import { CUSTOM_FIELD_CHOICES, customFieldProps, renderCustomFieldWith }
  from "../src/builder/widgets/families/ia/customField.ts";
import { PROPOSAL_SECTION_TEMPLATES, SECTION_TEMPLATE_NAMES }
  from "../src/builder/proposal/sectionTemplates.ts";

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
  /* proposals — the offer file's own `builders.proposal.ia`, retyped.
     Customer, Service Location, Business Info and Terms are NOT on it: the
     three blocks are one **Custom Field** (D-167) and the Terms tile is the
     Terms and conditions section template (D-168). */
  "Custom Field", "Product Cards", "Product Line Items", "Table", "Totals",
  "Signature", "Page Break",
  // the shared vocabulary's own three
  "Card", "Product Card", "Product Line Item",
  // email
  "IA Posts", "Reviews", "Book Now", "Unsubscribe Footer",
  // website and landing
  "IA Mega Menu", "IA Mobile Menu", "IA OLIVER Invoice", "IA Social Links",
  "IA Form", "Newsletter Signup", "Hours and Location",
  /* B-168 F5 - the database twin of Elementor's Reviews. `ia_reviews` is in
     the offer file's IA column for website, landing and newsletter. */
  "IA Reviews",
]);

/** The four builders §11.13.3 names. The studio is not one of them. */
const CONTRACT_ADAPTERS = ["proposal", "email", "website", "landing"];

const labels = (adapter) => widgetsFor(adapter).map((w) => widgetLabel(w, adapter));

/* ══════════════════════════════════════════════════════════════════════════
   1. The panel's groups and names
   ══════════════════════════════════════════════════════════════════════════ */

describe("the left panel is Elementor's", () => {
  test("the groups are Elementor Pro's, in that order, with ours last", () => {
    /* CHANGED 2026-09-19 (D-168 item 6). Four groups became six: Elementor's
       37 Pro widgets have a **Pro** group of their own and its 13 theme pieces
       a **Site** group, both read off `elementor-panel.json`, machine-cut from
       a real install with Pro. They were in General behind a padlock, which is
       a difference a person sees the moment our panel is beside the real
       editor. A group with nothing offered for a builder is still not drawn —
       see "the groups a builder draws are in Elementor's order and never
       empty" below. */
    assert.deepEqual([...WIDGET_CATEGORIES], [...PANEL_GROUPS_EXPECTED]);
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

  test("every offered widget has a place in PANEL_ORDER", () => {
    assert.deepEqual(unorderedKinds(), []);
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
  /*
   * WHO DECIDES WHAT ORDER — CHANGED 2026-09-19 (D-168 item 7).
   *
   * These tests held a hand-typed list of every tile on a panel, in order. Ten
   * family agents landed widgets into those panels the same afternoon and every
   * list was stale within the hour; f1-words (handoff §6.3) asked for one pass
   * by one agent rather than ten half-passes, and this is it — but not by
   * re-typing the kinds, which would be stale again by the next family.
   *
   * The order is READ, from `test/fixtures/elementor-panel.json` (machine-cut
   * from the two 2026-09-17 scrapes of a real Elementor install with Pro) and,
   * for the Intelligent Analytics group, from the definition's own `order`.
   * Elementor decides where Elementor's widgets go; we decide where ours do.
   * See `test/helpers/panelOrder.mjs`.
   *
   * MEMBERSHIP is `builder-offers.test.mjs`'s question, against the offer file
   * Brandon approved at 12:58 on 2026-09-19. This one is ORDER, and only order.
   */
  for (const adapter of CONTRACT_ADAPTERS) {
    test(`${adapter}: every tile is in the group Elementor puts it in`, () => {
      assert.deepEqual(groupFaults(widgetsFor(adapter), (w) => widgetLabel(w, adapter)), []);
    });

    test(`${adapter}: the tiles are in Elementor's own order`, () => {
      assert.deepEqual(panelOrderFaults(widgetsFor(adapter), (w) => widgetLabel(w, adapter)), []);
    });
  }

  test("the box comes first on every panel, as Elementor's does", () => {
    for (const adapter of CONTRACT_ADAPTERS) {
      assert.equal(labels(adapter)[0], "Container", adapter);
    }
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
    /* WIDENED BY f7-data-lists (2026-09-19), and by the offer file, not by us:
       `website.elementor_pro` carries nineteen list-and-site widgets and
       `landing.elementor_pro` carries five of them. A landing page has no blog,
       no archive and no site furniture, so Search, Sitemap, the four theme-*
       headings, the two theme-* pictures, Post Info, Post Navigation, Post
       Comments, Author Box and Archive Posts are website-only — the same reason
       the menus already were. */
    const siteOnly = [
      "IA Mega Menu", "IA Mobile Menu", "IA OLIVER Invoice",
      "Archive Posts", "Search", "Sitemap", "Post Info", "Post Navigation",
      "Post Comments", "Author Box", "Site Logo", "Site Title", "Page Title",
      "Post Title", "Post Excerpt", "Featured Image", "Archive Title",
    ];
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
    /* THREE presets now: Container, Grid and Inner Section (B-168, family F0).
       Every one of them inserts a `container` and none of them is ever STORED,
       which is the thing this test is really about — so it is asserted for all
       three rather than counted and left. */
    assert.deepEqual(Object.keys(LAYOUT_PRESETS).sort(), ["container", "grid", "inner-section"]);
    for (const [key, preset] of Object.entries(LAYOUT_PRESETS)) {
      assert.equal(preset.kind, "container", `the ${key} tile inserts something that is not a box`);
      assert.equal(kinds.has(key) && key !== "container", false, `a shipped template stored a \`${key}\``);
    }
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
    /* THE TERMS TILE IS DELETED (D-168): the offer file does not list it, and
       the clause picker belongs to the Terms and conditions section template. */
    assert.equal(isPickerTile("terms"), false);
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
    /* D-167 — an address block and a plan become a Container of **Custom
       Fields**, not a block widget. The fields themselves are asserted by the
       dynamic-fields suite; here the question is only that nothing vanished. */
    for (const wanted of ["image", "heading", "paragraph", "alert", "price_line", "custom_field", "google_maps"]) {
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
    for (const wanted of ["image", "heading", "paragraph", "data_table", "alert", "price_line", "custom_field", "signature"]) {
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
    social_links: { social_icon_list: [{ social: "facebook", link: "https://example.test/fb" }] },
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
  const BOOK = {
    customer: { name: "Fixture Grounds Co", email: "hello@example.test" },
    service_location: { name: "North lot", address: "1 Fixture Way" },
    business_info: { name: "Fixture Landscaping", phone: "555-0100" },
  };

  for (const field of ["customer.name", "service_location.address", "business_info.phone"]) {
    test(`a Custom Field on ${field} puts its value on the page`, () => {
      const doc = docOf([makeWidget("custom_field", customFieldProps(field))]);
      const base = ctx(doc);
      const html = renderDocument(doc, {
        ...base,
        extra: (w, c) => (w.kind === "custom_field" ? renderCustomFieldWith(w, c, BOOK) : null),
      });
      assert.ok(html.includes("bx-w-custom_field"), `${field} drew no wrapper`);
      const [record, key] = field.split(".");
      assert.ok(html.includes(BOOK[record][key]), `${field} drew nothing the record says`);
    });
  }

  test("EVERY field on the list draws, and is clickable with an empty record", () => {
    // ASSERT PRESENCE on all fifteen, not on a sample: a field that silently
    // draws nothing is a line an author puts on a contract and never sees.
    for (const c of CUSTOM_FIELD_CHOICES) {
      const doc = docOf([makeWidget("custom_field", customFieldProps(c.key))]);
      const base = makeContext(doc, { mode: "edit", business: { name: "Fixture" } });
      const html = renderDocument(doc, {
        ...base,
        extra: (w, cc) => (w.kind === "custom_field" ? renderCustomFieldWith(w, cc, {}) : null),
      });
      assert.ok(/data-edit=|data-placeholder=/.test(html), `${c.key} has nothing to click`);
      if (!c.picture) assert.ok(html.includes(c.label), `${c.key} does not say what it is`);
    }
  });

  test("THE NINE SECTION TEMPLATES ARE THE OFFER FILE'S NINE, by name and in order", () => {
    assert.deepEqual([...SECTION_TEMPLATE_NAMES], [
      "Title page", "Customer details", "Service address", "About us", "Scope of work",
      "Pricing options", "Line items with totals", "Terms and conditions", "Acceptance",
    ]);
  });

  test("…and every widget inside one is a widget the proposal panel offers", () => {
    /* A template that dropped something an author cannot then add a second of
       is a back door into the panel — which is exactly how the invented
       widgets kept coming back. */
    const offered = new Set(widgetsFor("proposal").map((w) => w.kind));
    // The two atoms the catalogue tiles drop are not tiles themselves.
    offered.add("catalog_card");
    offered.add("price_line");
    offered.add("container");
    const seen = new Set();
    const walk = (nodes) => {
      for (const n of nodes || []) {
        seen.add(n.kind);
        assert.ok(offered.has(n.kind), `a section template drops ${n.kind}, which no panel offers`);
        if (Array.isArray(n.children)) walk(n.children);
      }
    };
    for (const t of PROPOSAL_SECTION_TEMPLATES) {
      for (const col of t.build().columns) walk(col.widgets);
    }
    // ASSERT PRESENCE: the nine really do place the parts they promise.
    for (const k of ["container", "heading", "paragraph", "image", "list",
      "custom_field", "catalog_card", "price_line", "totals", "signature", "divider"]) {
      assert.ok(seen.has(k), `no section template ever places a ${k}`);
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

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
import path from "node:path";

import {
  WIDGETS, WIDGETS_BY_KIND, WIDGET_CATEGORIES, PANEL_ORDER, LAYOUT_PRESETS,
  GRID_PRESET_KIND, controlTab, presetFor, unorderedKinds, widgetsFor, widgetLabel,
} from "../src/builder/registry.ts";
import { groupByTask, TASK_GROUPS, unmappedCategories } from "../src/builder/widgetTasks.ts";
import { ATOM_KINDS, atomKindsAgree, expandPanelTile, isPanelTile } from "../src/builder/widgets/index.ts";
import { RENDERED_KINDS, makeContext, renderDocument } from "../src/builder/render.ts";
import { DELETED_KINDS, upgradeDocument, needsUpgrade } from "../src/builder/upgrade.ts";
import { COMPOSITE_KINDS } from "../src/builder/upgrade.ts";
import { emptyDocument, makeSection, makeWidget } from "../src/builder/model.ts";
import { makeContainer } from "../src/builder/treeOps.ts";
import { documentTotals } from "../src/builder/totals.ts";
import { PREMADE_SECTIONS, SHIPPED_TEMPLATES, documentHeaderSections } from "../src/builder/templates.ts";
import { snowAgreementDocument } from "../src/builder/snowAgreement.ts";

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
    // ONE grouping. `widgetTasks` reads the registry's categories and does not
    // keep a second list of its own.
    assert.deepEqual([...TASK_GROUPS], [...WIDGET_CATEGORIES]);
    assert.deepEqual(unmappedCategories(), []);
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
    const files = ["src/builder/registry.ts", "src/builder/widgetTasks.ts", "src/builder/render.ts"];
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

describe("each builder offers exactly §11.13.3's list", () => {
  test("proposals and quotes", () => {
    assert.deepEqual(labels("proposal"), [
      "Container", "Grid",
      "Heading", "Image", "Text Editor", "Button", "Divider", "Spacer", "Icon",
      "Image Box", "Icon Box", "Star Rating", "Icon List", "Testimonial", "Social Icons", "Alert",
      "Product Cards", "Product Line Items", "Totals", "Card",
      "Customer", "Service Location", "Business Info", "Terms", "Signature", "Page Break",
    ]);
  });

  /**
   * THE EMAIL ROW IS SHORT, AND EVERY SUBTRACTION IS NAMED.
   *
   * §11.13.3 gives email *"the set above minus what email programs cannot
   * show"*. `adapters/email/emailRender.ts` builds a mailbox out of TABLES and
   * its own guards refuse flex, grid and CSS classes — the fallback to the
   * engine's renderer was tried and those guards caught it by name. So the
   * panel offers what the mailbox draws, and the seven held back — Icon, Icon
   * Box, Image Box, Star Rating, Alert, Reviews, Book Now — each need a table
   * renderer, which is item S2 in the handoff.
   *
   * The IA column uses the ids the mailbox already draws: **Product Cards** is
   * `product_card`, **IA Posts** is `article_card`, **Unsubscribe Footer** is
   * `email_footer`. That is the shared vocabulary's first rule, not a shortcut:
   * an id that exists keeps its id and takes the new label.
   */
  test("email and newsletters", () => {
    assert.deepEqual(labels("email"), [
      "Container", "Grid",
      "Heading", "Image", "Text Editor", "Button", "Divider", "Spacer",
      "Icon List", "Testimonial", "Social Icons",
      "Product Cards", "IA Posts", "Unsubscribe Footer",
    ]);
  });

  test("website pages", () => {
    assert.deepEqual(labels("website"), [
      "Container", "Grid",
      "Heading", "Image", "Text Editor", "Video", "Button", "Divider", "Spacer", "Google Maps", "Icon",
      "Image Box", "Icon Box", "Star Rating", "Image Carousel", "Basic Gallery", "Icon List",
      "Counter", "Progress Bar", "Testimonial", "Tabs", "Accordion", "Toggle",
      "Social Icons", "Alert", "Shortcode", "HTML", "Menu Anchor",
      "Product Cards", "IA Posts", "Reviews", "Book Now",
      "IA Form", "Newsletter Signup", "Hours and Location",
      "IA Mega Menu", "IA Mobile Menu", "IA OLIVER Invoice", "IA Social Links",
    ]);
  });

  test("landing pages are the website's list without the menus", () => {
    const site = labels("website");
    const landing = labels("landing");
    const menus = ["IA Mega Menu", "IA Mobile Menu"];
    assert.deepEqual(landing, site.filter((l) => !menus.includes(l)));
  });

  test("a proposal is offered nothing that cannot print", () => {
    for (const cannot of ["Video", "Tabs", "Accordion", "Toggle", "Image Carousel", "Google Maps", "HTML", "Shortcode"]) {
      assert.equal(labels("proposal").includes(cannot), false, cannot);
    }
  });

  test("the groups a builder draws are in Elementor's order and never empty", () => {
    for (const adapter of CONTRACT_ADAPTERS) {
      const groups = groupByTask(adapter).map((g) => g.task);
      assert.deepEqual(groups, WIDGET_CATEGORIES.filter((c) => groups.includes(c)), adapter);
      for (const g of groupByTask(adapter)) assert.ok(g.widgets.length > 0, `${adapter} ${g.task}`);
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
  const picks = [
    { offeringId: "off-1", priceId: "p-1", snapshot: { title: "Snow removal", amount: 625 } },
    { offeringId: "off-2" },
  ];

  test("Product Cards drops one catalogue card per pick, in a row", () => {
    const [box] = expandPanelTile("product_cards", picks);
    assert.equal(box.kind, "container");
    assert.equal(box.style.direction, "row");
    assert.deepEqual(box.children.map((c) => c.kind), ["catalog_card", "catalog_card"]);
    // `_ia_selection` is the Binding section's own home and spells the
    // catalogue's two keys as the catalogue does (widgets/binding.ts).
    assert.equal(box.children[0].props._ia_selection.offering_id, "off-1");
    assert.equal(box.children[0].props._ia_selection.price_id, "p-1");
    assert.deepEqual(box.children[0].props._ia_snapshot, picks[0].snapshot);
  });

  test("Product Line Items drops a stack of priced lines", () => {
    const out = expandPanelTile("product_line_items", picks);
    assert.deepEqual(out.map((n) => n.kind), ["price_line", "price_line"]);
    assert.equal(out[0].props.quantity, 1);
  });

  test("cancelling the picker adds nothing", () => {
    assert.deepEqual(expandPanelTile("product_cards", []), []);
    assert.deepEqual(expandPanelTile("product_line_items", [{ offeringId: "" }]), []);
  });

  test("the atoms are not tiles — the picker is the only door", () => {
    assert.ok(isPanelTile("product_cards") && isPanelTile("product_line_items"));
    assert.equal(isPanelTile("catalog_card"), false);
    assert.equal(WIDGETS_BY_KIND.catalog_card.hidden, true);
    assert.equal(WIDGETS_BY_KIND.price_line.hidden, true);
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
    customer: {},
    service_location: { name: "North lot", address: "1 Fixture Way" },
    business_info: { name: "Fixture Landscaping", phone: "555-0100" },
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
    for (const kind of ["icon_box", "image_box", "alert", "customer", "service_location", "business_info"]) {
      const doc = docOf([makeWidget(kind, {})]);
      const html = renderDocument(doc, makeContext(doc, { mode: "edit", business: { name: "Fixture" } }));
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

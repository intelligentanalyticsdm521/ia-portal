// test/families-f7-data-lists.test.mjs — the f7-data-lists family keeps its
// contract, and every widget in it is Elementor's own.
//
// B-168 section C.1. This file is the family's OWN test. What was here from the
// seams commit is the contract EVERY family keeps; what is added below is one
// case per widget, as section C.3 item 7 asks:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild;
//   · every LABEL is Elementor's own title for that widget, letter for letter,
//     out of the 2026-09-17 machine file;
//   · every CONTROL KEY is a key that widget really has, so a field the author
//     fills in cannot be one the page engine drops on publish;
//   · every renderer draws something, in both modes, with no props at all.
//
// The same question asked of the EMITTER — every key it publishes is real —
// is asked in arion, in `test/website-builder-f7-data-lists.test.js`, against a
// byte copy of this repo's `WIDGET_SETTINGS_KEYS.json`. It is asked THERE and
// not here on purpose: a Portal test that reached across into the arion
// checkout would turn this suite red whenever the two repos were not sitting
// side by side, which is a failure about the disk and not about the code.
//
// ── THE IMPORT ORDER IS LOAD-BEARING. DO NOT REORDER THE TOP TWO LINES. ────
// `render.ts` imports `widgets/families/index.ts`, and that index builds
// `FAMILY_OF_KIND` while it is evaluating. A family whose widgets import `esc`
// from `render.ts` therefore closes a cycle: family index → widget → render →
// family index, and if the FAMILY is the entry point the index reads its own
// import before it exists ("Cannot access 'F7_DATA_LISTS' before
// initialization"). Importing the ENGINE first is what the running app does —
// `registry.ts` is always the entry — so the test does the same, and the cycle
// resolves through hoisted function declarations exactly as `render.ts`'s own
// header says it is designed to. Proven by reversing these two lines on
// 2026-09-19: red with the TDZ error, green again when put back.
import "../src/builder/registry.ts";

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FAMILY } from "../src/builder/widgets/families/f7-data-lists/index.ts";
import { makeLandingContext, renderLandingSection } from "../src/builder/adapters/landing/landingRender.ts";
import { emptyDocument, makeSection, makeWidget } from "../src/builder/model.ts";
import { assertFamilyContract, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

/** A render context with nothing helpful in it — the worst case a widget sees. */
function ctx(mode) {
  return {
    mode, merge: {}, accent: "#0E7490", ink: "#0B1C24",
    headingFont: "system-ui", bodyFont: "system-ui", currency: "USD",
    business: { name: "", tagline: "", logoUrl: null, contactLine: "" },
    totals: { subtotal: 0, discount: 0, tax: 0, total: 0 }, numbers: {},
  };
}

/** Elementor's own slug for each kind we declare. One table, read by the tests
 *  below and by nothing else — the arion emitter carries the same answer in its
 *  `widgetType`, and one of the cases proves the two agree. */
const SLUG_OF = {
  posts: "posts",
  portfolio: "portfolio",
  loop_grid: "loop-grid",
  archive_posts: "archive-posts",
  taxonomy_filter: "taxonomy-filter",
  search: "search",
  sitemap: "sitemap",
  template: "template",
  post_info: "post-info",
  post_navigation: "post-navigation",
  post_comments: "post-comments",
  author_box: "author-box",
  theme_site_logo: "theme-site-logo",
  theme_site_title: "theme-site-title",
  theme_page_title: "theme-page-title",
  theme_post_title: "theme-post-title",
  theme_post_excerpt: "theme-post-excerpt",
  theme_post_featured_image: "theme-post-featured-image",
  theme_archive_title: "theme-archive-title",
};

test("f7-data-lists: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f7-data-lists: every widget it declares keeps the contract", () => {
  assertFamilyContract("f7-data-lists", FAMILY);
});

test("f7-data-lists: the nineteen widgets the family owns are all here", () => {
  // PRESENCE, not absence: the thing that goes wrong is a widget quietly not
  // being built, and a test that only checks what IS there never notices.
  assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), Object.keys(SLUG_OF).sort());
});

describe("every tile is Elementor's own widget, by Elementor's own name", () => {
  for (const d of FAMILY.defs) {
    test(`${d.kind} is ${SLUG_OF[d.kind]}`, () => {
      const w = SETTINGS_KEYS.widgets[SLUG_OF[d.kind]];
      assert.ok(w, `${SLUG_OF[d.kind]} is not in the 2026-09-17 Elementor catalogue`);
      assert.equal(d.label, w.title,
        `the tile must say what Elementor says. D-168: Elementor's own name, never ours.`);
      assert.equal(d.tier, "pro",
        `every widget in this family is a Pro one; the offer file's pro_rule puts a padlock on it below ARION Standard`);
      assert.equal(d.requires, undefined, "ships with no gate — Brandon sets the tiers in October");
    });
  }
});

describe("a renderer draws something with nothing to draw", () => {
  for (const d of FAMILY.defs) {
    for (const mode of ["edit", "view"]) {
      test(`${d.kind} (${mode})`, () => {
        const html = FAMILY.renderers[d.kind]({ id: "w1", kind: d.kind, props: {} }, ctx(mode));
        assert.equal(typeof html, "string");
        if (mode === "edit") {
          assert.ok(html.length > 0, "an empty widget must still show the author something");
        }
      });
    }
  }
  test("and with its own defaults, which is what a fresh drop gives it", () => {
    // EDIT mode, because that is the moment a fresh drop happens and the moment
    // an author would call a blank a bug. In VIEW mode a widget with nothing
    // chosen yet — Template, before its saved piece is named — is right to draw
    // nothing rather than a placeholder on a live page.
    for (const d of FAMILY.defs) {
      const html = FAMILY.renderers[d.kind]({ id: "w1", kind: d.kind, props: { ...d.defaults } }, ctx("edit"));
      assert.ok(typeof html === "string" && html.length > 0, `${d.kind} draws nothing when freshly dropped`);
    }
  });
});

describe("every control the panel draws is a key the page engine really has", () => {
  test("every control a def declares is a key that widget really has", () => {
    // The other direction, and the one that bites: a control whose key the page
    // engine does not know is a field the author fills in and nothing happens.
    const bad = [];
    for (const d of FAMILY.defs) {
      const w = SETTINGS_KEYS.widgets[SLUG_OF[d.kind]];
      assert.ok(w.keys.length, `${d.kind}: the catalogue reports no controls, so nothing can be checked`);
      const legal = new Set(w.keys);
      for (const c of d.controls) {
        if (!legal.has(c.key)) bad.push(`${d.kind}.${c.key}`);
      }
    }
    assert.deepEqual(bad, [], "these controls are not on the Elementor widget they claim to be");
  });

  test("a control the machine file calls responsive is declared responsive, and no other", () => {
    // Copied, never guessed — B-168 §C.1. `deviceKey()` writes the `_tablet` /
    // `_mobile` spelling in one place, and it only writes it for these.
    const wrong = [];
    for (const d of FAMILY.defs) {
      const w = SETTINGS_KEYS.widgets[SLUG_OF[d.kind]];
      if (!w.keys.length) continue;
      const legal = new Set(w.keys);
      for (const c of d.controls) {
        const isResponsive = legal.has(`${c.key}_tablet`) || legal.has(`${c.key}_mobile`);
        if (!!c.responsive !== isResponsive) {
          wrong.push(`${d.kind}.${c.key}: declared ${c.responsive ? "" : "not "}responsive, catalogue says ${isResponsive ? "" : "not "}responsive`);
        }
      }
    }
    assert.deepEqual(wrong, []);
  });
});

describe("the two the offer keeps off the panel", () => {
  test("nothing in this family is offered to the newsletter or a proposal", () => {
    // The offer file gives the newsletter `ia_posts` (already on that panel as
    // the kind `article_card`) and gives a proposal none of these at all. So
    // there is no email half and no PDF half, and that is the offer, not a gap.
    for (const d of FAMILY.defs) {
      assert.equal(d.builders.includes("newsletter"), false, d.kind);
      assert.equal(d.builders.includes("proposal"), false, d.kind);
      assert.equal(d.builders.includes("mybrand"), false, d.kind);
    }
  });

  test("only the five the offer lists reach a landing page", () => {
    assert.deepEqual(
      FAMILY.defs.filter((d) => d.builders.includes("landing")).map((d) => d.kind).sort(),
      ["loop_grid", "portfolio", "posts", "taxonomy_filter", "template"]);
  });
});

describe("the widgets that need a script still work without one", () => {
  // BUILDER_FULL_WIDGET_PLAN §C.3: "A widget needing JavaScript on the
  // published page gets a no-JS fallback." Three of ours do, and the fallback
  // is the markup itself, not a second copy of it.
  test("Search is an ordinary form, and Live Results is off to start with", () => {
    assert.equal(SEARCH_DEFAULT("live_results"), "");
    const html = FAMILY.renderers.search({ id: "w", kind: "search", props: {} }, ctx("view"));
    assert.match(html, /<form[^>]+method="get"/, "a form the browser can submit on its own");
    assert.match(html, /<button[^>]+type="submit"/);
  });

  test("Taxonomy Filter's chips are real links", () => {
    const html = FAMILY.renderers.taxonomy_filter({ id: "w", kind: "taxonomy_filter", props: {} }, ctx("view"));
    assert.match(html, /<a href=/, "with no script each chip still opens that category");
  });

  test("Portfolio's filter bar is real links", () => {
    const html = FAMILY.renderers.portfolio(
      { id: "w", kind: "portfolio", props: { show_filter_bar: "yes" } }, ctx("view"));
    assert.match(html, /bx-f7-filterbar/);
    assert.match(html, /<a href=/);
  });
});

function SEARCH_DEFAULT(key) {
  return FAMILY.defs.find((d) => d.kind === "search").defaults[key];
}

describe("the five a landing page is offered really draw on one", () => {
  // THE SEAM, ASSERTED AT THE REAL BOUNDARY. `adapters/landing/landingRender.ts`
  // has its own switch and falls through to the engine; B-168's seams commit
  // wired `renderFamily` into `render.ts` and LUMEN but not into this adapter,
  // so a family widget on a hosted page drew "needs a newer version of the
  // builder". The line is there now, and this is the presence test for it —
  // `feedback_no_stub_guard_on_seam_defaults`: one test per default, at the
  // boundary, not a comment saying it should work.
  //
  // Mutation (run, 2026-09-19): the `renderFamily` call was taken back out of
  // that file's `default` branch and all five cases went red with the "needs a
  // newer version" sentence. Put back → green.
  for (const kind of ["posts", "portfolio", "loop_grid", "taxonomy_filter", "template"]) {
    test(kind, () => {
      const def = FAMILY.defs.find((d) => d.kind === kind);
      const doc = emptyDocument("landing");
      const section = makeSection();
      section.columns[0].widgets = [makeWidget(kind, { ...def.defaults, template_id: 7 })];
      doc.sections = [section];
      const html = renderLandingSection(
        section, makeLandingContext(doc, { mode: "view", business: { name: "Fixture" } }));
      assert.doesNotMatch(html, /needs a newer version of the builder/,
        `${kind} is offered on a landing page and the page cannot draw it`);
      assert.match(html, /bx-f7-/, `${kind} drew nothing this family recognises`);
    });
  }
});

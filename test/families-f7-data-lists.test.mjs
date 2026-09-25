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
  /* THE FAMILY'S IA TWIN, under both stored ids. `ia_posts` is a REGISTERED
     Elementor widget - the IA plugin's own, in Elementor's own
     `intelligent-analytics` category, 207 controls - so it is in the machine
     file exactly like the other nineteen and every question below is asked of
     it in exactly the same way. `article_card` is the newsletter's stored id
     for that same widget (B-168 wave 2). */
  ia_posts: "ia_posts",
  article_card: "ia_posts",
};

/** The two stored ids the IA twin has. Everything else here is Elementor's. */
const IA_TWIN = new Set(["ia_posts", "article_card"]);

/**
 * THE TWO KEYS THE PLUGIN DOES NOT HAVE, and why they are allowed.
 *
 * `items` and `layout` are what the two definitions this family replaced
 * STORED, in newsletters that are on disk today. The plugin's widget fetches
 * posts from the site and has no key for either: `items` is the list an author
 * types or pulls in for an email, and `layout` is picture-beside-or-above,
 * which the plugin answers with a skin and a mailbox cannot. Naming them here,
 * as an exact set, keeps the question sharp - any OTHER key not on the widget
 * still fails.
 */
const STORED_IA_KEYS = new Set(["items", "layout"]);

test("f7-data-lists: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f7-data-lists: every widget it declares keeps the contract", () => {
  assertFamilyContract("f7-data-lists", FAMILY);
});

test("f7-data-lists: the twenty-one widgets the family owns are all here", () => {
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
      if (IA_TWIN.has(d.kind)) {
        /* NOT `pro`. The offer file lists IA Posts under each builder's `ia`
           block, not under `elementor_pro`, and the pro_rule is about
           Elementor Pro. A padlock here would hide our OWN widget behind
           somebody else's licence. Ownership and plan are answered by
           `builder/tier.ts`, in October, from data (families/types.ts). */
        assert.equal(d.tier, undefined, `${d.kind}: an IA twin is not an Elementor Pro widget`);
      } else {
        assert.equal(d.tier, "pro",
          `every ELEMENTOR widget in this family is a Pro one; the offer file's pro_rule puts a padlock on it below ARION Standard`);
      }
      assert.equal(d.requires, undefined, "ships with no gate — Brandon sets the tiers in October");
    });
  }
});

/** The mailbox's context, for the ONE widget of this family drawn in an inbox.
 *  Structural, exactly as `families/types.ts` declares it: a family folder must
 *  not import an adapter, so neither may a family's test pretend to. */
function mailCtx(mode) {
  return { mode, merge: {}, accent: "#0E7490", ink: "#0B1C24", paper: "#FFFFFF",
    headingFont: "system-ui", bodyFont: "system-ui" };
}

/** Whichever door this widget is really drawn through, and its context. */
function drawOf(kind) {
  if (FAMILY.emailRenderers && FAMILY.emailRenderers[kind]) {
    return [FAMILY.emailRenderers[kind], mailCtx];
  }
  return [FAMILY.renderers[kind], ctx];
}

describe("a renderer draws something with nothing to draw", () => {
  for (const d of FAMILY.defs) {
    for (const mode of ["edit", "view"]) {
      test(`${d.kind} (${mode})`, () => {
        const [draw, context] = drawOf(d.kind);
        const html = draw({ id: "w1", kind: d.kind, props: {} }, context(mode));
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
      const [draw, context] = drawOf(d.kind);
      const html = draw({ id: "w1", kind: d.kind, props: { ...d.defaults } }, context("edit"));
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
        if (IA_TWIN.has(d.kind) && STORED_IA_KEYS.has(c.key)) continue;
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
        /* THE NEWSLETTER'S HALF IS DELIBERATELY NOT RESPONSIVE, and this is the
           one place that is said in a test rather than in a comment. Six of the
           plugin's keys ARE responsive and the website twin declares all six.
           A mailbox has one width: half of them strip <style>, so a media query
           cannot be relied on, and `fluidRow` already stacks on a phone with no
           query at all. A `_tablet` field in an email panel would be a box the
           author fills in that no inbox ever reads. */
        if (d.kind === "article_card") {
          assert.equal(!!c.responsive, false,
            `${d.kind}.${c.key}: a mailbox has one width — see iaPosts.ts`);
          continue;
        }
        if (IA_TWIN.has(d.kind) && STORED_IA_KEYS.has(c.key)) continue;
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
  test("no ELEMENTOR widget of this family reaches the newsletter, and none reaches a proposal", () => {
    // The offer file gives the newsletter exactly ONE thing out of this family
    // — `ia_posts`, the IA twin, which the mailbox stores as `article_card` —
    // and gives a proposal nothing at all. So there is no PDF half, and the
    // email half is the twin's and only the twin's.
    for (const d of FAMILY.defs) {
      if (!IA_TWIN.has(d.kind)) assert.equal(d.builders.includes("newsletter"), false, d.kind);
      assert.equal(d.builders.includes("proposal"), false, d.kind);
      assert.equal(d.builders.includes("mybrand"), false, d.kind);
    }
  });

  test("only the five the offer lists reach a landing page", () => {
    assert.deepEqual(
      FAMILY.defs.filter((d) => d.builders.includes("landing")).map((d) => d.kind).sort(),
      ["ia_posts", "loop_grid", "portfolio", "posts", "taxonomy_filter", "template"]);
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

/* ══════════════════════════════════════════════════════════════════════════
   IA POSTS — EVERY CONTROL, EXECUTED (B-168 wave 2)
   ══════════════════════════════════════════════════════════════════════════

   The rule this file exists to keep is not "the key is real" — that is asked
   above — it is *the renderer honours it*. A control whose key the engine knows
   and whose value the renderer ignores is worse than a missing control: the
   author moves it, the canvas agrees to nothing, and nothing anywhere says so.
   It is `reference_catch_swallow_report_success` with a label on it.

   So: for EVERY control on both defs, render once with the widget's own
   defaults and once with that one control moved, and assert the HTML is
   different. The moved value is written out per key rather than generated,
   because a test whose inputs you cannot read is a test you cannot trust — and
   because three of them (excerpt_length, title_tag, columns) need a value that
   really is outside the default's effect, which a generated one is not. */
import { ARTICLE_CARD_DEF, IA_POSTS_DEF } from "../src/builder/widgets/families/f7-data-lists/iaPosts.ts";

/** One value per control that is really different from the default. */
const MOVED = {
  post_skin: "magazine",
  image_mode: "none",
  post_theme: "dark",
  post_preset: "bold",
  columns: "2",
  card_gap: 48,
  posts_per_page: 2,
  post_type: "portfolio",
  orderby: "title",
  order: "ASC",
  show_category: "",
  show_title: "",
  title_tag: "h2",
  show_excerpt: "",
  excerpt_length: 3,
  show_author: "",
  show_date: "",
  show_read_time: "",
  show_tags: "",
  show_read_more: "",
  read_more_text: "Read the whole thing",
  image_position: "top left",
  pagination_type: "load_more",
  archive_link: "https://example.test/news",
  archive_label: "Everything we have written",
  card_border_radius: 22,
  card_padding: 33,
  title_typography_font_size: 44,
  title_typography_font_weight: "300",
  excerpt_typography_font_size: 19,
  meta_typography_font_size: 9,
  /* `layout` is the newsletter's own stored key: the picture beside the words
     or above them. `items` is the content itself and is asked separately. */
  layout: "above",
};

/** Where the newsletter's own starting value makes the shared move a no-op.
 *  Two posts are placed, so "show me two" is not a change; one is. */
const MOVED_EMAIL = { ...MOVED, posts_per_page: 1 };

/** Two posts with every field a stored newsletter can hold. No real business. */
const TWO_POSTS = [
  { title: "Season starts", excerpt: "One two three four five six seven eight nine ten eleven twelve.", url: "https://example.test/1", image: "https://cdn.example.test/1.jpg", alt: "A yard", author: "The office", date: "1 March", category: "News" },
  { title: "And the next", excerpt: "Twelve eleven ten nine eight seven six five four three two one.", url: "https://example.test/2", image: "https://cdn.example.test/2.jpg", alt: "A truck", author: "The office", date: "2 March", category: "Tips" },
];

describe("IA Posts: every control the panel offers changes what is drawn", () => {
  const cases = [
    {
      def: IA_POSTS_DEF,
      base: { ...IA_POSTS_DEF.defaults, archive_link: "https://example.test/a" },
      draw: (props) => FAMILY.renderers.ia_posts({ id: "w1", kind: "ia_posts", props }, ctx("edit")),
    },
    {
      def: ARTICLE_CARD_DEF,
      base: { ...ARTICLE_CARD_DEF.defaults, items: TWO_POSTS, archive_link: "https://example.test/a" },
      moved: MOVED_EMAIL,
      draw: (props) => FAMILY.emailRenderers.article_card({ id: "w1", kind: "article_card", props }, mailCtx("edit")),
    },
  ];

  for (const c of cases) {
    for (const control of c.def.controls) {
      if (control.key === "items") continue;
      test(`${c.def.kind}.${control.key}`, () => {
        const moved = c.moved || MOVED;
        assert.ok(control.key in moved, `no moved value written for ${control.key}`);
        const before = c.draw(c.base);
        const after = c.draw({ ...c.base, [control.key]: moved[control.key] });
        assert.notEqual(after, before,
          `${c.def.kind}.${control.key} was moved and the drawing did not change. `
          + `A control that changes nothing is a defect, not a feature.`);
      });
    }
  }

  test("image_position moves the crop on a REAL picture, not only on the colour block", () => {
    /* The colour-block header and the featured-image header are two branches
       and the control has to reach both. The per-control case above is
       satisfied by the colour block alone — a mutation that stopped the <img>
       honouring it stayed GREEN, which is how this case came to be written. */
    const props = (pos) => ({
      ...IA_POSTS_DEF.defaults, image_mode: "featured_image", image_position: pos,
      items: [{ title: "One", excerpt: "Two", image: "https://cdn.example.test/1.jpg", alt: "A yard" }],
    });
    const centre = FAMILY.renderers.ia_posts({ id: "w", kind: "ia_posts", props: props("center center") }, ctx("view"));
    const corner = FAMILY.renderers.ia_posts({ id: "w", kind: "ia_posts", props: props("top left") }, ctx("view"));
    assert.match(centre, /<img[^>]+object-position:center center/);
    assert.match(corner, /<img[^>]+object-position:top left/);
  });

  test("the posts themselves are what the widget draws", () => {
    const html = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { ...ARTICLE_CARD_DEF.defaults, items: TWO_POSTS } },
      mailCtx("view"));
    assert.match(html, /Season starts/);
    assert.match(html, /And the next/);
  });
});

describe("IA Posts: the props the two old definitions stored still read", () => {
  // The whole reason a family reuses the stored kind instead of inventing
  // `ia_posts_v2`. A newsletter saved in July holds `items` and `layout` and
  // nothing else; a page arion published holds `count`.
  test("a stored newsletter draws its articles, beside their pictures", () => {
    const html = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { items: TWO_POSTS } }, mailCtx("view"));
    assert.match(html, /Season starts/);
    assert.match(html, /max-width:180px/, "the picture column a stored newsletter has always had");
    assert.doesNotMatch(html, /display:(flex|grid)/, "a mailbox is tables");
  });

  test("`layout: above` still puts the picture over the words", () => {
    const beside = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { items: TWO_POSTS, layout: "beside" } }, mailCtx("view"));
    const above = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { items: TWO_POSTS, layout: "above" } }, mailCtx("view"));
    assert.match(beside, /max-width:180px/);
    assert.doesNotMatch(above, /max-width:180px/);
    // …and the registry's own old spelling, the whole sentence, reads the same.
    const sentence = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { items: TWO_POSTS, layout: "Picture above the words" } },
      mailCtx("view"));
    assert.equal(sentence, above);
  });

  test("a stored newsletter is NOT re-flowed into columns", () => {
    // The plugin's own default for `columns` is "3", which is right for a
    // website grid and wrong for every newsletter already on disk. The mailbox
    // starts at one. Found by running the thirty goldens, not by reading.
    const one = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { items: TWO_POSTS } }, mailCtx("view"));
    const two = FAMILY.emailRenderers.article_card(
      { id: "w", kind: "article_card", props: { items: TWO_POSTS, columns: "2" } }, mailCtx("view"));
    assert.notEqual(one, two, "two-across is a choice the author makes");
    assert.doesNotMatch(one, /max-width:264px/, "…and never a default");
  });

  test("arion's own legacy prop `count` is still how many show", () => {
    const html = FAMILY.renderers.ia_posts(
      { id: "w", kind: "ia_posts", props: { count: 2 } }, ctx("edit"));
    assert.equal((html.match(/<article/g) || []).length, 2);
  });
});

describe("IA Posts: the per-device values really reach the page", () => {
  // Six of the plugin's keys are responsive, so the panel stores `_tablet` and
  // `_mobile` twins (`deviceKey()` writes that spelling once). A renderer that
  // read only the desktop key would offer the author two fields that did
  // nothing at all — which is the defect this whole block exists to stop.
  test("a tablet and a phone value become Elementor's own two breakpoints", () => {
    const html = FAMILY.renderers.ia_posts({
      id: "wid7", kind: "ia_posts",
      props: { ...IA_POSTS_DEF.defaults, card_gap_tablet: 12, title_typography_font_size_mobile: 15 },
    }, ctx("view"));
    assert.match(html, /@media\(max-width:1024px\)\{#wid7 \.ia-posts\{gap:12px\}\}/);
    assert.match(html, /@media\(max-width:767px\)\{#wid7 \.ia-posts \.ia-card-title\{font-size:15px\}\}/);
  });

  test("…and a widget nobody set a device value on carries no media query", () => {
    const html = FAMILY.renderers.ia_posts(
      { id: "wid7", kind: "ia_posts", props: { ...IA_POSTS_DEF.defaults } }, ctx("view"));
    assert.doesNotMatch(html, /@media/);
  });
});

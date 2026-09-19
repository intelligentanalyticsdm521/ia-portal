// test/families-f5-sliders-reviews.test.mjs — the f5-sliders-reviews family
// keeps its contract, and each of its six widgets does what it says.
//
// B-168 §C.1. The contract every family keeps:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// ── WHY THIS FILE IMPORTS families/index.ts AND NOT THE FOLDER ────────────
// The seam's template imported `families/f5-sliders-reviews/index.ts` directly.
// That entry point throws, and it throws for every family that draws anything:
// a widget file imports `esc` from `render.ts`, `render.ts` imports
// `families/index.ts`, and `families/index.ts` builds its `FAMILIES` array out
// of a family module that is still half-evaluated — `Cannot access
// 'F5_SLIDERS_REVIEWS' before initialization`. Entering through
// `families/index.ts`, which is how registry.ts and render.ts really load it,
// has no such order problem, and it is the more honest test besides: it asks
// the question the app asks. The one-line seam fix is in the handoff.
//
// ── THE MUTATIONS, run by EXECUTING the real functions ────────────────────
// Each was broken on purpose, seen red, and restored; what went red is written
// beside the test it belongs to.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { FAMILIES, renderFamily } from "../src/builder/widgets/families/index.ts";
import { makeContext } from "../src/builder/render.ts";
import { emptyDocument, makeWidget } from "../src/builder/model.ts";
import { assertFamilyContract, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

const FAMILY = FAMILIES.find(([name]) => name === "f5-sliders-reviews")[1];
const defOf = (kind) => FAMILY.defs.find((d) => d.kind === kind);

/** The six this family ships, and the two it deliberately does not. */
const SHIPPED = ["testimonial", "reviews", "testimonial_carousel", "slides", "media_carousel", "ia_reviews"];
const HELD_BACK = ["carousel", "nested_carousel", "loop_carousel"];

/** Elementor's own slug for each of ours, for the settings-key check. */
const SLUG_OF = {
  testimonial: "testimonial",
  reviews: "reviews",
  ia_reviews: "reviews",
  testimonial_carousel: "testimonial-carousel",
  slides: "slides",
  media_carousel: "media-carousel",
};

const ctx = (mode = "edit") => makeContext(emptyDocument(), { mode, accent: "#0C4A60", business: { name: "Northfield" } });
const draw = (kind, props, mode) => renderFamily(makeWidget(kind, props), ctx(mode));

test("f5-sliders-reviews: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f5-sliders-reviews: every widget it declares keeps the contract", () => {
  assertFamilyContract("f5-sliders-reviews", FAMILY);
});

describe("the family ships the six it says it ships, and nothing else", () => {
  test("six widgets, by kind", () => {
    assert.deepEqual(FAMILY.defs.map((d) => d.kind).sort(), [...SHIPPED].sort());
  });

  test("the two that need another family's work are NOT offered", () => {
    // Carousel's slides are real containers and Loop Carousel's are a saved
    // loop template; neither can be published through the arion seam, so the
    // tile would be a blank band on a live site. They are in the handoff.
    for (const k of HELD_BACK) assert.equal(defOf(k), undefined, `${k} was built anyway`);
  });

  test("every label is Elementor's own title for the widget", () => {
    // MUTATION: change REVIEWS_DEF.label to "Customer Reviews" → this names it.
    for (const d of FAMILY.defs) {
      if (d.kind === "ia_reviews") { assert.equal(d.label, "IA Reviews"); continue; }
      assert.equal(d.label, SETTINGS_KEYS.widgets[SLUG_OF[d.kind]].title, d.kind);
    }
  });

  test("a Pro widget says so, and the one free widget says free", () => {
    assert.equal(defOf("testimonial").tier, "free");
    for (const k of ["reviews", "testimonial_carousel", "slides", "media_carousel"]) {
      assert.equal(defOf(k).tier, "pro", k);
      assert.equal(SETTINGS_KEYS.widgets[SLUG_OF[k]].pro, true, `${k} is not Pro in the catalogue`);
    }
    // IA Reviews is ours, so Elementor's Pro flag says nothing about it.
    assert.equal(defOf("ia_reviews").tier, undefined);
  });

  test("nothing carries a gate — the tiers are October's, and they are DATA", () => {
    for (const d of FAMILY.defs) assert.equal(d.requires, undefined, d.kind);
  });
});

describe("every control is one Elementor really has", () => {
  /* A control key that is not on the widget is a setting the page engine drops
     on publish: the author changes it, the toast is green, the live page does
     not move. The five legacy keys are named, because `testimonial` is a kind
     that already existed and the shared vocabulary keeps an existing kind's
     stored props — the arion emitter is what maps them to Elementor's. */
  const LEGACY_TESTIMONIAL = new Set(["quote", "attribution", "job", "image", "align"]);
  /** …and what each of them IS, on Elementor's side, for the responsive check. */
  const ELEMENTOR_KEY = {
    quote: "testimonial_content", attribution: "testimonial_name", job: "testimonial_job",
    image: "testimonial_image", align: "testimonial_alignment",
  };

  for (const kind of SHIPPED) {
    test(`${kind}: its control keys are the widget's own`, () => {
      const legal = new Set(SETTINGS_KEYS.widgets[SLUG_OF[kind]].keys);
      const bad = defOf(kind).controls
        .map((c) => c.key)
        .filter((k) => !legal.has(k))
        .filter((k) => !(kind === "testimonial" && LEGACY_TESTIMONIAL.has(k)));
      assert.deepEqual(bad, [], `${kind}: not controls of Elementor's ${SLUG_OF[kind]}`);
    });

    test(`${kind}: a control marked per-device is one the machine file marks responsive`, () => {
      // MUTATION: mark `slides_title_tag` responsive → this names it. Done
      // 2026-09-19: red on "slides: not responsive in Elementor", then removed.
      const responsive = new Set(SETTINGS_KEYS.widgets[SLUG_OF[kind]].responsive || []);
      const wrong = defOf(kind).controls
        .filter((c) => c.responsive && !responsive.has(ELEMENTOR_KEY[c.key] ?? c.key))
        .map((c) => c.key);
      assert.deepEqual(wrong, [], `${kind}: not responsive in Elementor`);
    });

    test(`${kind}: every control is on one of Elementor's three tabs, in a named section`, () => {
      for (const c of defOf(kind).controls) {
        assert.ok(["content", "style", "advanced"].includes(c.tab ?? "content"), `${kind}.${c.key}`);
        assert.ok(c.section, `${kind}.${c.key} is in no panel section`);
      }
    });
  }
});

describe("each widget draws the thing it promises", () => {
  test("a testimonial is the quote, the name and the job", () => {
    const html = draw("testimonial", { quote: "They were out before we opened.", attribution: "Hope Ministries", job: "Property manager" }, "view");
    assert.match(html, /They were out before we opened\./);
    assert.match(html, /Hope Ministries/);
    assert.match(html, /Property manager/);
  });

  test("a testimonial keeps drawing a document written in Elementor's own spellings", () => {
    // A review that came back out of a published page carries
    // `testimonial_content` / `testimonial_name`, not our stored names.
    const html = draw("testimonial", { testimonial_content: "Back from the page.", testimonial_name: "Cedar Ridge HOA" }, "view");
    assert.match(html, /Back from the page\./);
    assert.match(html, /Cedar Ridge HOA/);
  });

  test("Elementor's Testimonial has no Stars control, and ours has none either", () => {
    // D-168: stars are the `rating` widget, which is F4's. The RENDERER still
    // honours a rating a stored document already carries, so nobody's signed
    // proposal loses its stars; nothing can add one.
    assert.equal(defOf("testimonial").controls.find((c) => c.key === "rating"), undefined);
    assert.match(draw("testimonial", { quote: "Five of them.", rating: 5 }, "view"), /★{5}/);
  });

  test("Reviews draws every review, with the stars out of five", () => {
    const html = draw("reviews", {
      slides: [
        { content: "Never had to call twice.", name: "Hope Ministries", rating: 5 },
        { content: "Drive was clear by six.", name: "Cedar Ridge HOA", rating: 4 },
      ],
    }, "view");
    assert.match(html, /Never had to call twice\./);
    assert.match(html, /Drive was clear by six\./);
    assert.match(html, /4 out of 5/);
  });

  test("Reviews still draws a page written before this family, which spelled it `items`", () => {
    // MUTATION: drop `items` from `slideRows`'s key list → this goes red, which
    // is the point: a stored page must not lose its reviews to a rename.
    const html = draw("reviews", { items: [{ quote: "From the old shape.", author: "Hope Ministries", rating: 5 }] }, "view");
    assert.match(html, /From the old shape\./);
    assert.match(html, /Hope Ministries/);
  });

  test("IA Reviews says where its reviews come from when there are none yet", () => {
    assert.match(draw("ia_reviews", {}, "edit"), /Your reviews appear here once they are brought in\./);
    assert.equal(draw("ia_reviews", {}, "view"), "");
  });

  test("a slider is a scroll box that snaps, so it needs no script to show slide two", () => {
    /* The no-JS fallback, asserted rather than described: on a published page
       the engine's own script runs; everywhere else every slide is reachable
       by scrolling, with nothing loaded. */
    for (const kind of ["reviews", "testimonial_carousel", "slides", "media_carousel"]) {
      const html = draw(kind, { slides: [{ content: "one", heading: "one", image: "https://x.test/a.jpg" }, { content: "two", heading: "two", image: "https://x.test/b.jpg" }] }, "view");
      assert.match(html, /overflow-x:auto/, kind);
      assert.match(html, /scroll-snap-type:x mandatory/, kind);
      assert.equal(/<script/i.test(html), false, `${kind} put a script on the page`);
      assert.equal((html.match(/scroll-snap-align:start/g) || []).length, 2, `${kind} drew the wrong number of slides`);
    }
  });

  test("a video slide is a picture with a play mark a screen reader can name", () => {
    const html = draw("media_carousel", {
      slides: [{ type: "video", image: "https://x.test/poster.jpg", alt: "The crew", video: "https://x.test/clip" }],
    }, "view");
    assert.match(html, /aria-label="Play the video"/);
    assert.match(html, /href="https:\/\/x\.test\/clip"/);
    assert.equal(/<iframe/i.test(html), false, "a carousel of iframes loads every video on the page");
  });

  test("a slide with nothing in it is nothing to a reader, and a place to click to an author", () => {
    for (const kind of ["reviews", "testimonial_carousel", "slides", "media_carousel"]) {
      assert.equal(draw(kind, { slides: [] }, "view"), "", kind);
      assert.match(draw(kind, { slides: [] }, "edit"), /panel on the right|brought in/, kind);
    }
  });

  test("nothing a widget draws leaks an object or an undefined", () => {
    for (const kind of SHIPPED) {
      const html = draw(kind, defOf(kind).defaults, "edit");
      assert.doesNotMatch(html, /undefined|\[object Object\]/, kind);
    }
  });
});

describe("the offer file is what says where a widget is offered", () => {
  const OFFERS = JSON.parse(readFileSync(
    path.join(process.cwd(), "test/fixtures/BUILDER_OFFERS_2026-09-19.json"), "utf8"));

  test("each widget's builders are exactly the ones the offer file lists it under", () => {
    // MUTATION: add "proposal" to SLIDES_DEF.builders → this names it, and so
    // does test/builder-offers.test.mjs.
    const want = {
      testimonial: ["website", "landing", "newsletter", "proposal"],
      reviews: ["website", "landing", "proposal"],
      testimonial_carousel: ["website", "landing"],
      slides: ["website", "landing"],
      media_carousel: ["website", "landing"],
      ia_reviews: ["website", "landing", "newsletter"],
    };
    for (const [kind, builders] of Object.entries(want)) {
      assert.deepEqual([...defOf(kind).builders].sort(), [...builders].sort(), kind);
    }
  });

  test("Testimonial is short of My Brand, which the offer does list", () => {
    /* Said out loud rather than quietly skipped. The offer file gives
       Testimonial to My Brand; the Template Studio places ONE LAYER PER KIND at
       an absolute x and y (`adapters/mybrand/insert.ts`), and a quote with a
       photo and two lines under it is a flow with nothing to place. Claiming
       the panel without that work would be a tile whose button does nothing.
       It is item F5-1 in D168_HANDOFF_2026-09-19.md. */
    assert.ok(OFFERS.builders.mybrand.elementor.includes("testimonial"));
    assert.equal(defOf("testimonial").builders.includes("mybrand"), false);
  });
});

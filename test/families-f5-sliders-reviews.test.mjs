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

/* ── IMPORT ORDER IS LOAD-BEARING, and this is the whole of the S5 fix ─────
   `render.ts` comes FIRST on purpose. D-168 item 5a put `...FAMILY_RENDERED_KINDS`
   in `render.ts`'s module body, and `widgets/text.ts` — which this family's
   widgets use for `editRun` / `proseRun` — imports `render.ts`. Enter through
   `families/index.ts` and the cycle is families → f5 → text → render, so
   render's body runs while `FAMILY_RENDERED_KINDS` is still in its temporal
   dead zone: "Cannot access 'FAMILY_RENDERED_KINDS' before initialization".
   Enter through `render.ts`, which is how the app really loads — `registry.ts`
   and every adapter reach it first — and the families index finishes before
   render's body runs. Found by RUNNING this file after b168/override merged,
   not by reading it. Swapping these two lines back reproduces it. */
import { makeContext } from "../src/builder/render.ts";
import { FAMILIES, renderFamily } from "../src/builder/widgets/families/index.ts";
import { emptyDocument, makeWidget } from "../src/builder/model.ts";
import { assertFamilyContract, SETTINGS_KEYS } from "./helpers/familyContract.mjs";
/* The deep pass (2026-09-19) asks two things of the PANEL as well as of the
   renderer: that a control is a type the Inspector draws, and that a
   responsive one is stored under the spelling the panel really uses. Both
   are EXECUTED, from the panel's own module, rather than restated here. */
import { PANEL_CONTROL_TYPES, deviceKey } from "../src/builder/definitionControls.tsx";
import { deviceContainerQuery } from "../src/builder/responsive.ts";
/** A regular-expression-safe copy of a string — for the container queries. */
const esc4 = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

/* ══════════════════════════════════════════════════════════════════════════
   THE DEEP PANEL — Elementor's own Testimonial, control by control
   ══════════════════════════════════════════════════════════════════════════

   The wave-2 job, in the brief's own words: *"the renderer honours EVERY
   control you add — a control that changes nothing on the canvas is a defect,
   not a feature."* So this suite does not read the definition and tick it off
   against a list. It EXECUTES the renderer with one control set at a time and
   looks for the change on the canvas, and it executes the panel's own
   `deviceKey` for the responsive ones rather than assuming the spelling.

   THE SOURCE IS THE MACHINE FILE, read at run time — `SETTINGS_KEYS` is
   machine-cut from the two 2026-09-17 catalogues of a real Elementor install,
   so "is this Elementor's key" is answered by Elementor and not by us.
*/
describe("Testimonial carries Elementor's own panel", () => {
  const DEF = defOf("testimonial");
  const keyOf = (c) => c.key;
  const KEYS = DEF.controls.map(keyOf);
  /** Every settings key Elementor's own `testimonial` widget has. */
  const ELEMENTOR_KEYS = SETTINGS_KEYS.widgets.testimonial.keys;

  test("every control is one Elementor has, or one of the five legacy names", () => {
    /* MUTATION: rename `image_border_color` to `image_edge_colour` → red, by
       name. A key Elementor does not have is DROPPED SILENTLY on publish: the
       author changes a setting, the toast is green and the live page does not
       move. */
    const ours = new Set(["quote", "attribution", "job", "image", "align"]);
    const strays = KEYS.filter((k) => !ELEMENTOR_KEYS.includes(k) && !ours.has(k));
    assert.deepEqual(strays, [], "a control Elementor's Testimonial does not have");
  });

  test("the panel is Elementor's five sections, on Elementor's two tabs", () => {
    const sections = [];
    for (const c of DEF.controls) {
      const at = `${c.tab || "content"}/${c.section}`;
      if (sections[sections.length - 1] !== at) sections.push(at);
    }
    assert.deepEqual(sections, [
      "content/Testimonial", "style/Content", "style/Image", "style/Name", "style/Title",
    ]);
  });

  test("THIRTY-NINE controls, where there were eleven", () => {
    /* Not a vanity number: it is the count the handoff reports and the number
       that goes red if somebody quietly drops a section. Elementor's own panel
       has fifty-three once the section headers and the device twins are folded
       out of the ninety rows in the machine file. */
    assert.equal(DEF.controls.length, 39);
  });

  test("the fourteen that are NOT here are the fourteen we said, and no others", () => {
    /* Each of these is refused for a reason written in the file's own header:
       a popover the engine has no control type for, a composite text shadow,
       a font list only the brand kit can answer, and a WordPress image size
       there is no media library behind. Naming them here means dropping a
       control by accident cannot hide inside "we left some out". */
    const LEFT_OUT = [
      "content_typography_typography", "name_typography_typography", "job_typography_typography",
      "content_shadow_text_shadow_type", "name_shadow_text_shadow_type", "job_shadow_text_shadow_type",
      "content_shadow_text_shadow", "name_shadow_text_shadow", "job_shadow_text_shadow",
      "content_typography_font_family", "name_typography_font_family", "job_typography_font_family",
      "testimonial_image_size", "testimonial_image_custom_dimension",
    ];
    for (const k of LEFT_OUT) {
      assert.ok(ELEMENTOR_KEYS.includes(k), `${k} is not even Elementor's — fix the list`);
      assert.equal(KEYS.includes(k), false, `${k} is on the panel and the header says it is not`);
    }
    /* THE ARITHMETIC, so the two halves cannot drift: what we carry plus what we
       refused is Elementor's whole panel, minus the five names of our own. */
    const ours = new Set(["quote", "attribution", "job", "image", "align"]);
    const carried = KEYS.filter((k) => !ours.has(k));
    const twins = ELEMENTOR_KEYS.filter((k) => /_(tablet|mobile)$/.test(k));
    /* `section_*` rows are the PANEL SECTIONS themselves, not settings — the
       catalogue lists them because Elementor registers a section like a
       control. Our five section names are asserted separately, above. */
    const distinct = ELEMENTOR_KEYS
      .filter((k) => !twins.includes(k) && !k.startsWith("section_"));
    /* Our five stand in for five of Elementor's, which are therefore neither
       carried under their own name nor refused. */
    const standIns = ["testimonial_content", "testimonial_name", "testimonial_job",
      "testimonial_image", "testimonial_alignment"];
    assert.deepEqual(
      distinct.filter((k) => !carried.includes(k) && !LEFT_OUT.includes(k) && !standIns.includes(k)),
      [], "a control of Elementor's that is neither carried nor refused out loud");
  });

  test("every control is a TYPE the panel can actually draw, or words on the page", () => {
    /* A control the Inspector draws nothing for is a setting nobody can reach,
       which is the same defect as one the renderer ignores, at the other end.
       `PANEL_CONTROL_TYPES` is the panel's own list, executed. */
    const TYPED_ON_THE_PAGE = new Set(["quote", "attribution", "job"]);
    for (const c of DEF.controls) {
      if (TYPED_ON_THE_PAGE.has(c.key)) continue;
      assert.ok(PANEL_CONTROL_TYPES.has(c.type), `${c.key} is a ${c.type}, which the panel draws nothing for`);
    }
  });

  test("responsive is copied from the machine file, never guessed", () => {
    /* A control marked responsive here must have `_tablet` and `_mobile` twins
       in Elementor, and a control that has them must be marked. Both halves,
       because getting it wrong either way is a device value that goes nowhere.
       `deviceKey` is EXECUTED, so the spelling is the panel's own. */
    for (const c of DEF.controls) {
      const hasTwins = ELEMENTOR_KEYS.includes(`${c.key}_tablet`)
        || (c.key === "align" && ELEMENTOR_KEYS.includes("testimonial_alignment_tablet"));
      if (c.responsive) {
        assert.ok(hasTwins, `${c.key} is marked responsive and Elementor has no device twin for it`);
        assert.equal(deviceKey(c, "tablet"), `${c.key}_tablet`);
        assert.equal(deviceKey(c, "phone"), `${c.key}_mobile`);
      } else {
        assert.equal(deviceKey(c, "phone"), c.key, `${c.key} is not responsive and must not vary`);
      }
    }
  });

  /* ── THE RENDERER HONOURS EVERY ONE OF THEM ──────────────────────────── */

  /** Draw a testimonial with these props, in view mode. */
  const tm = (props) => draw("testimonial", {
    quote: "They were out before we opened.", attribution: "Hope Ministries", ...props,
  }, "view");

  test("EXECUTED: every Style control changes the canvas", () => {
    /* One at a time, each looked for in the output. This is the guard the brief
       asks for by name. MUTATION: delete one branch of `partTypeDeclarations`
       and the pair naming that control goes red.

       [key, value, what has to appear] */
    const CASES = [
      ["content_content_color", "#123456", /\.bx-quote-b\{[^}]*color:#123456/],
      ["content_typography_font_size", 22, /\.bx-quote-b\{[^}]*font-size:22px/],
      ["content_typography_line_height", 1.4, /\.bx-quote-b\{[^}]*line-height:1\.4/],
      ["content_typography_letter_spacing", 2, /\.bx-quote-b\{[^}]*letter-spacing:2px/],
      ["content_typography_word_spacing", 3, /\.bx-quote-b\{[^}]*word-spacing:3px/],
      ["content_typography_font_weight", "700", /\.bx-quote-b\{[^}]*font-weight:700/],
      ["content_typography_text_transform", "uppercase", /\.bx-quote-b\{[^}]*text-transform:uppercase/],
      ["content_typography_font_style", "italic", /\.bx-quote-b\{[^}]*font-style:italic/],
      ["content_typography_text_decoration", "underline", /\.bx-quote-b\{[^}]*text-decoration:underline/],
      ["name_text_color", "#654321", /\.bx-attrib-n\{[^}]*color:#654321/],
      ["name_typography_font_size", 18, /\.bx-attrib-n\{[^}]*font-size:18px/],
      ["name_typography_font_weight", "600", /\.bx-attrib-n\{[^}]*font-weight:600/],
      ["name_typography_text_transform", "capitalize", /\.bx-attrib-n\{[^}]*text-transform:capitalize/],
      ["name_typography_line_height", 1.1, /\.bx-attrib-n\{[^}]*line-height:1\.1/],
      ["name_typography_letter_spacing", 1, /\.bx-attrib-n\{[^}]*letter-spacing:1px/],
      ["name_typography_word_spacing", 2, /\.bx-attrib-n\{[^}]*word-spacing:2px/],
      ["name_typography_font_style", "oblique", /\.bx-attrib-n\{[^}]*font-style:oblique/],
      ["name_typography_text_decoration", "none", /\.bx-attrib-n\{[^}]*text-decoration:none/],
      ["job_text_color", "#0A0B0C", /\.bx-attrib-j\{[^}]*color:#0A0B0C/],
      ["job_typography_font_size", 11, /\.bx-attrib-j\{[^}]*font-size:11px/],
      ["job_typography_font_weight", "300", /\.bx-attrib-j\{[^}]*font-weight:300/],
      ["job_typography_font_style", "italic", /\.bx-attrib-j\{[^}]*font-style:italic/],
      ["job_typography_text_transform", "lowercase", /\.bx-attrib-j\{[^}]*text-transform:lowercase/],
      ["job_typography_text_decoration", "line-through", /\.bx-attrib-j\{[^}]*text-decoration:line-through/],
      ["job_typography_line_height", 2, /\.bx-attrib-j\{[^}]*line-height:2/],
      ["job_typography_letter_spacing", 3, /\.bx-attrib-j\{[^}]*letter-spacing:3px/],
      ["job_typography_word_spacing", 4, /\.bx-attrib-j\{[^}]*word-spacing:4px/],
      ["image_size", 64, /\.bx-attrib-img\{[^}]*width:64px;height:64px/],
      ["image_border_border", "dashed", /\.bx-attrib-img\{[^}]*border-style:dashed/],
      ["image_border_width", 3, /\.bx-attrib-img\{[^}]*border-width:3px/],
      ["image_border_color", "#FF00AA", /\.bx-attrib-img\{[^}]*border-color:#FF00AA/],
      ["image_border_radius", 6, /\.bx-attrib-img\{[^}]*border-radius:6px/],
    ];
    for (const [key, value, wanted] of CASES) {
      const html = tm({ job: "Property manager", image: "https://x.test/f.jpg", [key]: value });
      assert.match(html, wanted, `${key} changed nothing on the canvas`);
    }
    /* Every Style control is in that list — so a control added later without a
       case here fails rather than passing unnoticed. */
    const covered = new Set(CASES.map(([k]) => k));
    const styleKeys = DEF.controls.filter((c) => c.tab === "style").map(keyOf);
    assert.deepEqual(styleKeys.filter((k) => !covered.has(k)), []);
  });

  test("EXECUTED: every Content control changes the canvas", () => {
    assert.match(tm({}), /They were out before we opened\./);
    assert.match(tm({}), /Hope Ministries/);
    assert.match(tm({ job: "Property manager" }), /Property manager/);
    assert.match(tm({ image: "https://x.test/f.jpg" }), /<img class="bx-attrib-img" src="https:\/\/x\.test\/f\.jpg"/);
    assert.match(tm({ link: "https://example.test/r" }), /href="https:\/\/example\.test\/r"/);
    assert.match(tm({ align: "end" }), /text-align:end/);
    // Image Position is Elementor's `aside` (a row) or `top` (a column).
    assert.match(tm({ image: "https://x.test/f.jpg", testimonial_image_position: "top" }), /flex-direction:column/);
    assert.match(tm({ image: "https://x.test/f.jpg", testimonial_image_position: "aside" }), /flex-direction:row/);
  });

  test("EXECUTED: a device value is drawn under that device's own query", () => {
    /* The responsive half. `deviceContainerQuery` is the platform's own §11.8
       mechanism, so a phone override here comes in at the same width the
       preview toggle shows — not at a fourth number typed into this folder.
       MUTATION: emit the tablet rule without its query → the two `@container`
       assertions go red. */
    const html = tm({
      content_typography_font_size: 20,
      content_typography_font_size_tablet: 18,
      content_typography_font_size_mobile: 15,
      image: "https://x.test/f.jpg", image_size: 64, image_size_mobile: 40,
    });
    assert.match(html, /\.bx-quote-b\{[^}]*font-size:20px/);
    assert.match(html, new RegExp(`${esc4(deviceContainerQuery("tablet"))}\\{[^@]*font-size:18px`));
    assert.match(html, new RegExp(`${esc4(deviceContainerQuery("phone"))}\\{[^@]*font-size:15px`));
    assert.match(html, new RegExp(`${esc4(deviceContainerQuery("phone"))}\\{[^@]*width:40px`));
  });

  test("EXECUTED: a widget nobody styled emits no stylesheet at all", () => {
    /* The bytes of an untouched document do not move, which is what lets the
       shared goldens stay as they were. MUTATION: emit the class and an empty
       block unconditionally → red. */
    const html = tm({});
    assert.equal(/<style>/.test(html), false, "a document nobody styled grew a stylesheet");
  });

  test("EXECUTED: one testimonial's styling cannot reach the next", () => {
    const a = draw("testimonial", { quote: "A", content_typography_font_size: 30 }, "view");
    const cls = /class="bx-quote (bx-pt-[A-Za-z0-9_-]+)"/.exec(a);
    assert.ok(cls, "the scoped class is not on the element");
    assert.match(a, new RegExp(`\\.${cls[1]} \\.bx-quote-b\\{`), "the rule is not scoped to it");
  });

  test("EXECUTED: a stored value the control does not offer is dropped, not printed", () => {
    /* A page that published `font-weight:; ` or `border-style:javascript:` is a
       broken stylesheet on a customer's site. Both halves: a word off the list
       is refused, and a value carrying a brace cannot close the block early. */
    const bad = tm({
      image: "https://x.test/f.jpg",
      content_typography_font_weight: "heavy",
      image_border_border: "sparkly",
      name_text_color: "red;}</style><script>alert(1)</script>",
    });
    assert.equal(/font-weight:heavy/.test(bad), false);
    assert.equal(/border-style:sparkly/.test(bad), false);
    assert.equal(/<script/.test(bad), false, "a stored value closed the stylesheet");
    assert.equal(/<\/style>[^<]*<script/.test(bad), false);
  });

  test("EXECUTED: the picture is a circle until somebody says otherwise", () => {
    const round = tm({ image: "https://x.test/f.jpg" });
    assert.match(round, /border-radius:999px/);
    assert.match(tm({ image: "https://x.test/f.jpg", image_border_radius: 0 }), /\.bx-attrib-img\{[^}]*border-radius:0px/);
  });

  test("EXECUTED: a link is an anchor a reader can follow, and never round the editor", () => {
    /* A contentEditable run inside an <a> swallows the first click, so the name
       is only wrapped when nobody is editing. The PICTURE is wrapped either
       way, because nobody types into a picture. */
    const viewing = tm({ image: "https://x.test/f.jpg", link: { url: "https://example.test/r", is_external: "on", nofollow: "on" } });
    assert.match(viewing, /rel="noopener nofollow"/);
    assert.match(viewing, /target="_blank"/);
    const editing = draw("testimonial", {
      quote: "Q", attribution: "N", image: "https://x.test/f.jpg", link: "https://example.test/r",
    }, "edit");
    assert.match(editing, /<a class="bx-quote-link"[^>]*><img/, "the picture lost its link while editing");
    assert.equal(/<a class="bx-quote-link"[^>]*><span class="bx-attrib-n"/.test(editing), false,
      "the editable name is inside an anchor, so the first click will not land");
  });

  test("EXECUTED: every prop the legacy definition stored still reads", () => {
    /* The override contract's whole point: the kind id did not change, so a
       document saved before this pass opens and draws. `content_content_color`
       is on the list because the first pass stored it and the pattern would
       have renamed it to `content_text_color`. */
    const stored = {
      quote: "From July.", attribution: "Hope Ministries", job: "Property manager",
      image: "https://x.test/f.jpg", link: "https://example.test/r",
      align: "left", testimonial_image_position: "top", rating: 4,
      content_content_color: "#111111", name_text_color: "#222222", job_text_color: "#333333",
    };
    const html = draw("testimonial", stored, "view");
    assert.match(html, /From July\./);
    assert.match(html, /Property manager/);
    assert.match(html, /text-align:start/, "a stored `left` became something else");
    assert.match(html, /★{4}/, "a rating a stored document carries stopped drawing");
    assert.match(html, /\.bx-quote-b\{[^}]*color:#111111/);
    assert.match(html, /\.bx-attrib-n\{[^}]*color:#222222/);
    assert.match(html, /\.bx-attrib-j\{[^}]*color:#333333/);
  });

  test("the defaults name every key a control can write", () => {
    /* A control with no default is a field that opens showing someone else's
       value, because the panel reads the prop and the prop is not there. */
    const defaults = Object.keys(DEF.defaults);
    const missing = DEF.controls.map(keyOf).filter((k) => !defaults.includes(k));
    assert.deepEqual(missing, []);
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

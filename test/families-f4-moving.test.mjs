// test/families-f4-moving.test.mjs — the f4-moving family keeps its contract.
//
// B-168 section C.1. This file is the family's OWN test and belongs to the
// agent building the family: add a case per widget as you add it. What is here
// from the first commit is the contract EVERY family keeps, which is the thing
// that has to be true before a single widget is written:
//
//   · every def has a renderer and every renderer has a def;
//   · every def names builders, out of the offer file's five;
//   · every def is IN THE OFFER for every builder it claims (D-168);
//   · nothing ships with a `requires` gate — Brandon decides the tiers in
//     October and that must then be a change to DATA, not a rebuild.
//
// Mutation check (run it, do not trust it): add a def with a kind that is not
// in BUILDER_OFFERS_2026-09-19.json and this file goes red naming the folder;
// put it back and it goes green. Proven on 2026-09-19 with a fake
// `{ kind: "sparkle_box", ... }` in this family.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILY, PROGRESS_TRACKER_DEF, renderProgressTracker, showsPercentage } from "../src/builder/widgets/families/f4-moving/index.ts";
import { RENDERED_KINDS } from "../src/builder/render.ts";
import { assertFamilyContract, assertSettingsKeys, SETTINGS_KEYS } from "./helpers/familyContract.mjs";

test("f4-moving: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f4-moving: every widget it declares keeps the contract", () => {
  assertFamilyContract("f4-moving", FAMILY);
});

/* ══════════════════════════════════════════════════════════════════════════
   Progress Tracker — Elementor `progress-tracker`
   ══════════════════════════════════════════════════════════════════════════ */

test("Progress Tracker carries Elementor's own title, group and controls", () => {
  const live = SETTINGS_KEYS.widgets["progress-tracker"];
  assert.ok(live, "the machine file has no progress-tracker to check against");
  assert.equal(PROGRESS_TRACKER_DEF.label, live.title,
    "the tile must say what Elementor's tile says");
  assert.deepEqual(PROGRESS_TRACKER_DEF.builders, ["website", "landing"],
    "the offer file puts it on those two panels and no others");
  assert.equal(PROGRESS_TRACKER_DEF.tier, "pro", "Elementor registers it as a Pro widget");
  assert.equal(PROGRESS_TRACKER_DEF.requires, undefined,
    "nothing ships with a gate — that is DATA in October, not a rebuild");
  // Elementor's own panel sections, by their own names.
  const sections = [...new Set(PROGRESS_TRACKER_DEF.controls.map((c) => c.section))];
  assert.deepEqual(sections, ["Progress Tracker", "Tracker", "Content"]);
  // …and the keys are the widget's own, so nothing is dropped on publish.
  assertSettingsKeys("progress-tracker",
    Object.fromEntries(PROGRESS_TRACKER_DEF.controls.map((c) => [c.key, ""])),
    "f4-moving/progress_tracker controls: ");
  assertSettingsKeys("progress-tracker", PROGRESS_TRACKER_DEF.defaults,
    "f4-moving/progress_tracker defaults: ");
});

test("the engine claims it, so nothing reports it as offered-and-undrawn", () => {
  // MUTATION: take `...FAMILY_RENDERED_KINDS` out of RENDERED_KINDS in
  // render.ts and this goes red — proven on 2026-09-19, then restored.
  assert.ok(RENDERED_KINDS.includes("progress_tracker"));
});

test("the canvas draws a STILL bar, and says why", () => {
  const w = { id: "w1", kind: "progress_tracker", props: { ...PROGRESS_TRACKER_DEF.defaults } };
  const edit = renderProgressTracker(w, { mode: "edit", accent: "#0C4A60" });
  assert.match(edit, /bx-tracker-horizontal/);
  assert.match(edit, /width:0%/, "the editor must not animate; the author edits a still page");
  assert.match(edit, /fills as the reader scrolls/, "the author is not told what it does");
  const view = renderProgressTracker(w, { mode: "view", accent: "#0C4A60" });
  assert.ok(!view.includes("fills as the reader scrolls"), "the visitor is told how the page works");
  // ASSERT PRESENCE: the bar itself is there in both, not only the note.
  assert.match(view, /bx-tracker-fill/);
});

test("circular is a ring, horizontal is a bar — one setting, two shapes", () => {
  const ring = renderProgressTracker(
    { id: "w", kind: "progress_tracker", props: { type: "circular" } },
    { mode: "view", accent: "#0C4A60" });
  assert.match(ring, /border-radius:50%/);
  assert.ok(!ring.includes("bx-tracker-horizontal"));
});

test("the percentage is shown only when the switcher is on", () => {
  const off = renderProgressTracker(
    { id: "w", kind: "progress_tracker", props: {} }, { mode: "view", accent: "#000" });
  assert.ok(!off.includes("bx-track-pct"));
  assert.equal(showsPercentage({}), false);
  // Elementor stores a switcher as the string "yes", and a toggle control in
  // our panel stores `true`. Both mean on, and the renderer reads both.
  for (const on of [{ percentage: "yes" }, { percentage: true }]) {
    assert.equal(showsPercentage(on), true, JSON.stringify(on));
    assert.match(
      renderProgressTracker({ id: "w", kind: "progress_tracker", props: on }, { mode: "view", accent: "#000" }),
      /bx-track-pct/);
  }
});

test("a HOSTED PAGE draws it too, through the landing adapter", async () => {
  // MUTATION: take the `renderFamily` call out of landingRender.ts's `default`
  // branch and this goes red with the "needs a newer version" line — proven on
  // 2026-09-19, then restored. The engine's own list is not enough: the landing
  // adapter has its own switch and had to be asked to ask the families.
  const { emptyDocument, makeSection, makeWidget } = await import("../src/builder/model.ts");
  const { makeLandingContext, renderLandingSection, LANDING_RENDERED_KINDS } =
    await import("../src/builder/adapters/landing/landingRender.ts");
  assert.ok(LANDING_RENDERED_KINDS.includes("progress_tracker"));
  const doc = emptyDocument({ style: "landing", accent: "#0C4A60" });
  doc.sections = [makeSection({
    id: "s1", label: "Case", padding: 16, layout: 1,
    columns: [{ id: "c1", widgets: [{ ...makeWidget("progress_tracker", { type: "horizontal" }), id: "w1" }] }],
  })];
  const out = renderLandingSection(doc.sections[0], makeLandingContext(doc, { mode: "view" }));
  assert.match(out, /bx-tracker-fill/, "the hosted page drew nothing for it");
  assert.ok(!out.includes("needs a newer version"), "the adapter did not recognise it");
});

test("what an author types cannot become markup", () => {
  const out = renderProgressTracker(
    { id: "w", kind: "progress_tracker", props: { horizontal_color_color: '"><script>x()</script>' } },
    { mode: "view", accent: "#000" });
  assert.ok(!out.includes("<script>"), "a colour field reached the page as markup");
});

/* ══════════════════════════════════════════════════════════════════════════
   WAVE 2 (b168/f4-moving-deep, 2026-09-19) — THE FIVE EVERYDAY WIDGETS

   Counter, Progress Bar, Rating, Tabs and Accordion were two-to-six controls
   each and no Style tab at all. They are the five an author reaches for first.
   Every test below EXECUTES the real renderer or reads the real definition —
   none of them reads source and agrees with it.

   THE RULE THIS FILE ENFORCES, and it is the one that makes the panel honest:
   **a control that changes nothing on the canvas is a defect, not a feature.**
   `everyControlChangesTheCanvas` drives every single control of every widget,
   twice, and fails by NAME on one that makes no difference.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  ACCORDION_DEF, COUNTER_DEF, PROGRESS_BAR_DEF, RATING_DEF, TABS_DEF,
  counterNumber, emailRating, openPanels, progressPercent, ratingMarks, ratingOf,
  renderAccordion, renderCounter, renderProgressBar, renderRating, renderTabs,
} from "../src/builder/widgets/families/f4-moving/index.ts";
import { WIDGETS_BY_KIND, widgetsFor } from "../src/builder/registry.ts";

/** The five, with the renderer each one is drawn by. */
const FIVE = [
  { def: COUNTER_DEF, render: renderCounter, slug: "counter" },
  { def: PROGRESS_BAR_DEF, render: renderProgressBar, slug: "progress" },
  { def: RATING_DEF, render: renderRating, slug: "rating" },
  { def: TABS_DEF, render: renderTabs, slug: "nested-tabs" },
  { def: ACCORDION_DEF, render: renderAccordion, slug: "nested-accordion" },
];

/** Props rich enough that every widget draws something to change. */
const SEED = {
  counter: { ending_number: 1250, title: "Jobs done" },
  progress_bar: { title: "Site prep", percent: 72, inner_text: "on track" },
  star_rating: { rating_value: 4, rating_scale: 5, title: "Reviews" },
  tabs: { tabs: [{ tab_title: "What we do", tab_content: "We clear it before six." },
    { tab_title: "What it costs", tab_content: "Per push." }] },
  accordion: { tabs: [{ tab_title: "Do you salt?", tab_content: "Yes." },
    { tab_title: "When?", tab_content: "Before six." }] },
};

/** Two values per control type, both different from the widget's default. */
function twoValues(control) {
  switch (control.type) {
    case "colour": return ["#112233", "#AABBCC"];
    /* 3 and 12, not 7 and 42: a Rating on a scale of five clamps BOTH of
       those to five, so the control looked dead when it was the driver that
       was wrong. Found by running this, 2026-09-19. */
    case "number": return [3, 12];
    case "toggle": return [true, false];
    case "select": {
      const opts = (control.options || []).map((o) => (typeof o === "string" ? o : o.value));
      const real = opts.filter((v) => v !== "" && v != null);
      return real.length >= 2 ? [real[0], real[1]] : null;
    }
    case "text": return ["First words", "Second words"];
    default: return null;
  }
}

const CTX = { mode: "edit", accent: "#0C4A60" };

/**
 * WHAT HAS TO BE TRUE FOR A CONTROL TO APPLY AT ALL.
 *
 * Elementor shows some controls only in a state where they mean something —
 * Tabs draws "Justify" for the vertical axis and "Width" for the column of
 * titles ONLY when the titles sit beside the panel rather than above it. A
 * control like that is not dead; it is conditional, and driving it in the
 * wrong state proves nothing either way. So the condition is written down,
 * the driver puts the widget in it, and the control still has to make a
 * difference — which is the same bar, asked at the right moment.
 */
const CONDITIONS = {
  tabs_justify_vertical: { tabs_direction: "inline-start" },
  tabs_width: { tabs_direction: "inline-start" },
};

/**
 * …and the two controls whose state is the CONTEXT rather than a sibling prop.
 *
 * Accordion's Default State is what a VISITOR gets. While an author is editing,
 * every panel is open — always, deliberately — because a panel they cannot see
 * is a panel they cannot edit in place. So it is driven in view mode, where it
 * is the setting that decides, and the test below proves both halves.
 */
const CONTROL_CTX = {
  default_state: { mode: "view", accent: "#0C4A60" },
};

/**
 * EVERY CONTROL, DRIVEN. Returns the names of the ones that changed nothing.
 *
 * A `list` control is the widget's own rows and is driven by SEED above; a
 * control whose two values cannot be told apart is reported, not skipped.
 */
function controlsThatChangeNothing({ def, render }) {
  const dead = [];
  for (const c of def.controls) {
    if (c.type === "list") continue;
    const pair = twoValues(c);
    if (!pair) { dead.push(`${c.key} (no two values to try)`); continue; }
    const base = { ...def.defaults, ...SEED[def.kind], ...(CONDITIONS[c.key] || {}) };
    const ctx = CONTROL_CTX[c.key] || CTX;
    const a = render({ id: "w", kind: def.kind, props: { ...base, [c.key]: pair[0] } }, ctx);
    const b = render({ id: "w", kind: def.kind, props: { ...base, [c.key]: pair[1] } }, ctx);
    if (a === b) dead.push(c.key);
  }
  return dead;
}

test("wave 2: every control on every one of the five changes the canvas", () => {
  /* MUTATION: delete one `decl("color", …)` out of renderCounter and this goes
     red naming `number_color` — run 2026-09-19, then restored. */
  for (const w of FIVE) {
    assert.deepEqual(controlsThatChangeNothing(w), [],
      `${w.def.kind}: these controls are on the panel and change nothing on the canvas, `
      + "which is a defect and not a feature");
  }
});

test("wave 2: a CONDITIONAL control is conditional, and is dead outside its state", () => {
  /* The exemption above must not become a way of ducking the bar. Tabs Width
     applies when the titles sit BESIDE the panel and does nothing when they
     sit above it — which is Elementor's own behaviour, and is asserted here so
     that "it is conditional" is a claim with a test behind it. */
  const of = (props) => renderTabs({ id: "w", kind: "tabs", props: { ...SEED.tabs, ...props } }, CTX);
  assert.notEqual(of({ tabs_direction: "inline-start", tabs_width: 20 }),
    of({ tabs_direction: "inline-start", tabs_width: 60 }),
    "Tabs Width does nothing even when the titles are beside the panel");
  assert.equal(of({ tabs_direction: "block-start", tabs_width: 20 }),
    of({ tabs_direction: "block-start", tabs_width: 60 }),
    "Tabs Width changes a layout it has nothing to do with");
});

test("wave 2: every key on every panel is a key that Elementor widget really has", () => {
  for (const { def, slug } of FIVE) {
    const live = SETTINGS_KEYS.widgets[slug];
    assert.ok(live, `the machine file has no ${slug} to check against`);
    assert.equal(def.label, live.title,
      `the tile must say what Elementor's tile says (${slug})`);
    /* ONE DELIBERATE EXCEPTION, and it is named rather than filtered away.
       Elementor's nested Accordion calls its repeater `items`; ours has always
       stored `tabs`, and so does every document in the database and every
       shipped template. Renaming the key would blank a stored page for a match
       nobody can see, so the key stays ours and arion's emitter writes
       Elementor's spelling on the way out — proved by
       `website-families-f4-moving.test.js`, which reads `items` back off the
       published node. Everything else must be the widget's own key. */
    const ours = def.kind === "accordion" ? ["tabs"] : [];
    const keys = Object.fromEntries(def.controls
      .filter((c) => !ours.includes(c.key)).map((c) => [c.key, ""]));
    assertSettingsKeys(slug, keys, `f4-moving/${def.kind} controls: `);
    const defaults = Object.fromEntries(Object.entries(def.defaults)
      .filter(([k]) => !ours.includes(k)));
    assertSettingsKeys(slug, defaults, `f4-moving/${def.kind} defaults: `);
    for (const key of ours) {
      assert.ok(def.controls.some((c) => c.key === key),
        `${def.kind}: "${key}" is exempted and is not even a control`);
    }
  }
});

test("wave 2: a family definition REPLACED the legacy one, and there is only one", () => {
  /* b168/override's `mergeWidgetDefs`. MUTATION: make it prefer the legacy def
     and this goes red on the control count — run 2026-09-19, then restored. */
  for (const { def } of FIVE) {
    const live = WIDGETS_BY_KIND[def.kind];
    assert.ok(live, `${def.kind} left the registry`);
    assert.equal(live.controls.length, def.controls.length,
      `${def.kind}: the panel is still drawing the thin legacy definition`);
    assert.equal(live.label, def.label);
    assert.ok(live.controls.some((c) => c.tab === "style"),
      `${def.kind}: no Style tab, so the legacy definition won`);
  }
});

test("wave 2: the widgets are on the panels the OFFER FILE gives them, and no others", () => {
  const on = (adapter) => new Set(widgetsFor(adapter).map((w) => w.kind));
  // counter and progress_bar gained the PROPOSAL panel, which the offer file
  // has given them since 12:58 on 2026-09-19 and the legacy defs never had.
  for (const kind of ["counter", "progress_bar"]) {
    for (const a of ["website", "landing", "proposal"]) {
      assert.ok(on(a).has(kind), `${kind} is not offered on ${a}`);
    }
    assert.equal(on("email").has(kind), false,
      `${kind} is on the newsletter panel, and the offer file refuses it by name`);
  }
  // Rating reaches the mailbox; Tabs and Accordion never can.
  assert.ok(on("email").has("star_rating"));
  for (const kind of ["tabs", "accordion"]) {
    for (const a of ["email", "proposal"]) {
      assert.equal(on(a).has(kind), false, `${kind} is offered on ${a}; paper and mailboxes cannot open one`);
    }
  }
});

/* ── Counter ─────────────────────────────────────────────────────────────── */

test("Counter: the separator is Elementor's, and absent means ON", () => {
  assert.equal(counterNumber({ ending_number: 1250 }), "1,250");
  assert.equal(counterNumber({ ending_number: 1250, thousand_separator: false }), "1250");
  // Elementor stores a switcher as the string "yes"; our toggle stores true.
  assert.equal(counterNumber({ ending_number: 1250, thousand_separator: "yes" }), "1,250");
  // …and its own Separator choices really change the character.
  assert.equal(counterNumber({ ending_number: 1250, thousand_separator_char: "." }), "1.250");
  assert.equal(counterNumber({ ending_number: 1250, thousand_separator_char: " " }), "1 250");
});

test("Counter: the canvas is STILL, and says what will happen instead of faking it", () => {
  const props = { ...COUNTER_DEF.defaults, ending_number: 1250, starting_number: 100, duration: 3000 };
  const edit = renderCounter({ id: "w", kind: "counter", props }, { mode: "edit", accent: "#0C4A60" });
  assert.match(edit, /1,250/, "the canvas shows the number it ends on, as Elementor's does at rest");
  assert.match(edit, /Counts up from 100 over 3 seconds/,
    "Starting Number and Animation Duration are on the panel and say nothing");
  const view = renderCounter({ id: "w", kind: "counter", props }, { mode: "view", accent: "#0C4A60" });
  assert.ok(!view.includes("Counts up from"), "the visitor is told how the page works");
  assert.match(view, /1,250/);
});

test("Counter: Title Position really moves the title, above or below", () => {
  const props = { ending_number: 9, title: "Jobs done" };
  const after = renderCounter({ id: "w", kind: "counter", props: { ...props, title_position: "after" } },
    { mode: "view", accent: "#000" });
  const before = renderCounter({ id: "w", kind: "counter", props: { ...props, title_position: "before" } },
    { mode: "view", accent: "#000" });
  assert.ok(after.indexOf("Jobs done") > after.indexOf("bx-counter-n"));
  assert.ok(before.indexOf("Jobs done") < before.indexOf("bx-counter-n"));
});

test("Counter: what an author types cannot become markup", () => {
  const out = renderCounter({
    id: "w", kind: "counter",
    props: { ending_number: 1, prefix: '"><script>x()</script>', title: "<b>hi</b>", number_color: '"><i>' },
  }, { mode: "view", accent: "#000" });
  assert.ok(!out.includes("<script>"), "a prefix reached the page as markup");
  assert.ok(!out.includes("<b>hi</b>"), "a title reached the page as markup");
  assert.ok(!out.includes("<i>"), "a colour field reached the page as markup");
});

/* ── Progress Bar ────────────────────────────────────────────────────────── */

test("Progress Bar: a percentage is clamped, and Elementor's slider shape is read", () => {
  assert.equal(progressPercent({ percent: 72 }), 72);
  assert.equal(progressPercent({ percent: 900 }), 100);
  assert.equal(progressPercent({ percent: "nonsense" }), 0);
  // A page read back off a live site stores the slider object.
  assert.equal(progressPercent({ percent: { unit: "%", size: 40, sizes: [] } }), 40);
});

test("Progress Bar: the words AND the number go inside the bar, not one or the other", () => {
  /* The widget this replaces showed the percentage OR the inner text. Elementor
     shows both, and an author who typed "on track" watched it vanish the moment
     Display Percentage was on. */
  const out = renderProgressBar({
    id: "w", kind: "progress_bar",
    props: { title: "Site prep", percent: 72, inner_text: "on track", display_percentage: true },
  }, { mode: "view", accent: "#0C4A60" });
  assert.match(out, /on track/);
  assert.match(out, /72%/);
  const off = renderProgressBar({
    id: "w", kind: "progress_bar",
    props: { percent: 72, inner_text: "on track", display_percentage: false },
  }, { mode: "view", accent: "#0C4A60" });
  assert.match(off, /on track/);
  /* `width:72%` is the BAR's own length and is there either way — what must
     disappear is the number the reader sees, which is the run inside the fill
     after the words. Asserting on "72%" alone passed against the width. */
  const inside = off.slice(off.indexOf("bx-progress-fill"));
  assert.ok(!/>[^<]*72%/.test(inside), "the number is still printed in the bar");
});

test("Progress Bar: Display Title off really removes the title", () => {
  const props = { title: "Site prep", percent: 10 };
  assert.match(renderProgressBar({ id: "w", kind: "progress_bar", props }, { mode: "view", accent: "#000" }),
    /Site prep/);
  assert.ok(!renderProgressBar(
    { id: "w", kind: "progress_bar", props: { ...props, title_display: false } },
    { mode: "view", accent: "#000" }).includes("Site prep"));
});

test("Progress Bar: Elementor's four Types paint their own colours, and Color still wins", () => {
  const of = (props) => renderProgressBar({ id: "w", kind: "progress_bar", props },
    { mode: "view", accent: "#0C4A60" });
  assert.match(of({ percent: 50, progress_type: "success" }), /#5CB85C/);
  assert.match(of({ percent: 50, progress_type: "danger" }), /#D9534F/);
  // An explicit colour is the more specific answer and beats the type.
  assert.match(of({ percent: 50, progress_type: "danger", bar_color: "#112233" }), /#112233/);
  // No type, no colour: the business's own accent.
  assert.match(of({ percent: 50 }), /#0C4A60/);
});

/* ── Rating ──────────────────────────────────────────────────────────────── */

test("Rating: every spelling the platform has stored is read", () => {
  // Elementor's modern keys, our own panel's older ones, and the mailbox's.
  assert.deepEqual(ratingOf({ rating_value: 4, rating_scale: 5 }), { value: 4, scale: 5 });
  assert.deepEqual(ratingOf({ rating: 4, rating_scale: 5 }), { value: 4, scale: 5 });
  assert.deepEqual(ratingOf({ rating: 7, scale: 10 }), { value: 7, scale: 10 });
  // The slider object a page read back off a live site carries.
  assert.deepEqual(ratingOf({ rating_value: 3, rating_scale: { unit: "px", size: 10 } }),
    { value: 3, scale: 10 });
  // Out of range is clamped rather than drawn.
  assert.deepEqual(ratingOf({ rating_value: 99, rating_scale: 5 }), { value: 5, scale: 5 });
});

test("Rating: the marks are the icon the author picked, filled to the value", () => {
  assert.equal(ratingMarks({ rating_value: 4, rating_scale: 5 }), "★★★★☆");
  assert.equal(ratingMarks({ rating_value: 4.5, rating_scale: 5 }), "★★★★⯪");
  assert.equal(ratingMarks({ rating_value: 2, rating_scale: 3, rating_icon: "eicon-heart" }), "♥♥♡");
  // The mailbox gets entities, and the SAME number of them filled.
  assert.equal(ratingMarks({ rating_value: 4, rating_scale: 5 }, true).split(";").length - 1, 5);
});

test("Rating: ELEMENTOR HAS NO TITLE CONTROL, and this says so out loud", () => {
  /* NOT a passing test dressed up as one. The legacy definition had a Title
     control; Elementor's Rating does not, and D-168 says a tile is Elementor's
     tile. So the CONTROL is gone — and a stored title is still DRAWN, so
     nobody's page loses its words. A Heading above a Rating is a SECTION
     TEMPLATE, which is D-168's own model, and whoever builds it turns the
     first assertion here around. */
  assert.equal(RATING_DEF.controls.some((c) => c.key === "title"), false,
    "the panel grew a Title control back — Elementor's Rating has none");
  assert.equal(SETTINGS_KEYS.widgets.rating.keys.includes("title"), false,
    "Elementor's Rating gained a title; the control can come back");
  const out = renderRating({
    id: "w", kind: "star_rating", props: { rating_value: 4, rating_scale: 5, title: "What people say" },
  }, { mode: "view", accent: "#000" });
  assert.match(out, /What people say/, "a stored title was lost, which is not the deal");
});

test("Rating: Unmarked Color paints the empty marks and nothing else", () => {
  const out = renderRating({
    id: "w", kind: "star_rating",
    props: { rating_value: 2, rating_scale: 4, icon_color: "#F59E0B", icon_unmarked_color: "#E2E8F0" },
  }, { mode: "view", accent: "#000" });
  assert.equal((out.match(/#F59E0B/g) || []).length, 2, "the filled marks are not the author's colour");
  assert.equal((out.match(/#E2E8F0/g) || []).length, 2, "the empty marks are not the unmarked colour");
});

test("Rating: the MAILBOX half is tables only, and reads the same props", () => {
  const html = emailRating({
    id: "w", kind: "star_rating",
    props: { rating_value: 7, rating_scale: 10, icon_color: "#F59E0B", icon_alignment: "center" },
  }, { accent: "#0C4A60", bodyFont: "" });
  assert.match(html, /^<table/, "a mailbox needs a table");
  assert.ok(!/display:\s*(flex|grid)/.test(html), "flexbox in an email");
  assert.ok(!html.includes("class="), "a class in an email");
  assert.equal((html.match(/&#\d+;/g) || []).length, 10, "the author asked for ten marks");
  assert.match(html, /align="center"/);
  assert.match(html, /color:#F59E0B/);
});

/* ── Tabs ────────────────────────────────────────────────────────────────── */

const TABS_PROPS = {
  tabs: [
    { tab_title: "What we do", tab_content: "We clear it before six." },
    { tab_title: "What it costs", tab_content: "Per push, billed monthly." },
  ],
};

test("Tabs: every panel's words are on the canvas, so every panel can be edited", () => {
  /* Elementor's editor shows one tab at a time and lets the author click
     between them. Ours has no tab script on the canvas, and a panel an author
     cannot see is a panel they cannot edit in place. */
  const out = renderTabs({ id: "w", kind: "tabs", props: TABS_PROPS }, CTX);
  assert.match(out, /We clear it before six/);
  assert.match(out, /Per push, billed monthly/);
  // …and each title and each body is addressable by the in-place editor.
  assert.match(out, /data-edit="tabs\.0\.tab_title"/);
  assert.match(out, /data-edit="tabs\.1\.tab_content"/);
});

test("Tabs: Direction really turns the widget round", () => {
  const of = (tabs_direction) => renderTabs(
    { id: "w", kind: "tabs", props: { ...TABS_PROPS, tabs_direction } }, CTX);
  assert.match(of("block-start"), /flex-direction:column/);
  assert.match(of("block-end"), /flex-direction:column-reverse/);
  assert.match(of("inline-end"), /flex-direction:row-reverse/);
  assert.match(of("inline-start"), /flex-direction:row/);
});

test("Tabs: the first tab is the open one, and it wears the Active colour", () => {
  const out = renderTabs({
    id: "w", kind: "tabs",
    props: { ...TABS_PROPS, title_text_color: "#334155", title_text_color_active: "#0C4A60" },
  }, { mode: "view", accent: "#000" });
  const first = out.indexOf("What we do");
  const second = out.indexOf("What it costs");
  assert.ok(out.slice(0, first).includes("#0C4A60"), "the open tab is not the active colour");
  assert.ok(out.slice(first, second).includes("#334155"), "a closed tab is not the normal colour");
});

test("Tabs: an empty one asks for a tab rather than drawing an empty strip", () => {
  assert.match(renderTabs({ id: "w", kind: "tabs", props: { tabs: [] } }, CTX), /Add your first tab/);
  assert.equal(renderTabs({ id: "w", kind: "tabs", props: { tabs: [] } },
    { mode: "view", accent: "#000" }), "");
});

/* ── Accordion ───────────────────────────────────────────────────────────── */

const ACC_PROPS = {
  tabs: [
    { tab_title: "Do you salt?", tab_content: "Yes, and it is in the price." },
    { tab_title: "When do you come?", tab_content: "Before six." },
  ],
};

test("Accordion: EDITING opens every panel; a VISITOR gets Elementor's Default State", () => {
  // In edit mode all of them, always — a panel an author cannot see is a panel
  // they cannot edit in place, and that is not Default State being ignored.
  assert.equal(openPanels({ default_state: "all_collapsed" }, "edit")(1), true);
  // A visitor gets what the author chose.
  assert.equal(openPanels({}, "view")(0), true);
  assert.equal(openPanels({}, "view")(1), false);
  assert.equal(openPanels({ default_state: "all_collapsed" }, "view")(0), false);

  const edit = renderAccordion({ id: "w", kind: "accordion", props: ACC_PROPS }, CTX);
  assert.match(edit, /in the price/);
  assert.match(edit, /Before six/);
  const view = renderAccordion({
    id: "w", kind: "accordion", props: { ...ACC_PROPS, default_state: "all_collapsed" },
  }, { mode: "view", accent: "#000" });
  assert.match(view, /Do you salt\?/, "the questions must still be on the page");
  assert.ok(!view.includes("in the price"), "every answer was open on a collapsed accordion");
});

test("Accordion: the + moves to the far side when Elementor's Position says End", () => {
  const start = renderAccordion({ id: "w", kind: "accordion", props: ACC_PROPS },
    { mode: "view", accent: "#000" });
  const end = renderAccordion({
    id: "w", kind: "accordion", props: { ...ACC_PROPS, accordion_item_title_icon_position: "end" },
  }, { mode: "view", accent: "#000" });
  const q = "Do you salt?";
  assert.ok(start.indexOf("aria-hidden") < start.indexOf(q), "the mark should come first");
  assert.ok(end.indexOf(q) < end.indexOf("aria-hidden"), "the mark should come last");
});

test("Accordion: FAQ Schema marks the block up, and only when it is on", () => {
  assert.match(renderAccordion({
    id: "w", kind: "accordion", props: { ...ACC_PROPS, faq_schema: true },
  }, { mode: "view", accent: "#000" }), /schema\.org\/FAQPage/);
  assert.ok(!renderAccordion({ id: "w", kind: "accordion", props: ACC_PROPS },
    { mode: "view", accent: "#000" }).includes("schema.org"));
});

test("Accordion: Title HTML Tag really changes the element, both spellings", () => {
  const h4 = renderAccordion({ id: "w", kind: "accordion", props: { ...ACC_PROPS, title_tag: "h4" } },
    { mode: "view", accent: "#000" });
  assert.match(h4, /<h4 class="bx-acc-h"/);
  // `title_html_tag` is what the legacy definition stored, and it still counts.
  const stored = renderAccordion(
    { id: "w", kind: "accordion", props: { ...ACC_PROPS, title_html_tag: "h5" } },
    { mode: "view", accent: "#000" });
  assert.match(stored, /<h5 class="bx-acc-h"/);
});

test("Accordion and Tabs: a document stored under EITHER spelling still draws", () => {
  /* Elementor's nested Accordion calls the list `items` and the title
     `item_title`. Ours has always stored `tabs` / `tab_title` and still does —
     the translation happens in arion's emitter, on the way out. Both are read
     here so a page that came back off a live site is not blank. */
  const asItems = { items: [{ item_title: "Do you salt?", item_content: "Yes." }] };
  assert.match(renderAccordion({ id: "w", kind: "accordion", props: asItems },
    { mode: "view", accent: "#000" }), /Do you salt\?/);
  assert.match(renderTabs({ id: "w", kind: "tabs", props: asItems }, CTX), /Do you salt\?/);
});

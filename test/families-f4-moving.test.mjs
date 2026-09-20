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

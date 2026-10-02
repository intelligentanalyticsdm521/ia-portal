// The lead search job page tells the truth about where the run is.
//
// Brandon, 2 Oct 2026, watching job 13: "it quickly got through queued through
// scoring and now it's on enriching contacts for like 5+ minutes … I think this
// may actually just be skipping the previous steps … maybe add some little text
// for the steps so that people know it's still working. Like 'making sure
// everything is bonita', 'adding expansive researched links', 'buttoning
// everything up so it's glorious'."
//
// What has to stay true:
//   • every stop on the bar is a progress_step the orchestrator writes
//     (LUMEN searchOrchestrator.js updateProgress: starting / loading_filters /
//     checking_cache / discovering / placing / reading_websites / checking_fit /
//     enriching / scoring / persisting / completed) — no stop lights up for a
//     step that never ran (reading_websites and checking_fit: the lead search
//     rewrite, 2 Oct 2026 — the homepage read and the website check, both
//     before any email is looked up)
//   • the long steps carry a line that changes, and the saved count
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · PHASE_ORDER — put "expanding_keywords" back      → "no stop for a step that never runs" RED
//   · STEP_TO_PHASE — map "scoring" to "enriching"      → "scoring is its own stop" RED
//   · WAITING_LINES — drop Brandon's three lines        → "Brandon's lines are on the page" RED
//   · savedSoFarLine — return a line at 0 saved         → "no count before the first save" RED
import { test } from "node:test";
import assert from "node:assert/strict";

import { PHASE_ORDER, PHASE_LABELS, STEP_TO_PHASE, WAITING_LINES, savedSoFarLine } from "../src/lib/leadgenJobSteps.ts";

const REAL_STEPS = ["starting", "loading_filters", "checking_cache", "discovering", "placing", "reading_websites", "checking_fit", "enriching", "scoring", "persisting", "completed"];

test("no stop for a step that never runs", () => {
  assert.deepEqual(PHASE_ORDER, ["queued", "discovery", "placing", "reading", "checking", "enriching", "scoring", "complete"]);
  for (const p of PHASE_ORDER) assert.ok(PHASE_LABELS[p]?.label, `${p} has a label`);
  assert.ok(!PHASE_ORDER.includes("expanding_keywords"));
  assert.ok(!PHASE_ORDER.includes("finalizing"));
});

test("every real step maps to a stop on the bar, and scoring is its own stop", () => {
  for (const step of REAL_STEPS) assert.ok(PHASE_ORDER.includes(STEP_TO_PHASE[step]), `${step} → ${STEP_TO_PHASE[step]}`);
  assert.equal(STEP_TO_PHASE.scoring, "scoring");
  assert.equal(STEP_TO_PHASE.persisting, "scoring");
  assert.equal(STEP_TO_PHASE.placing, "placing");
  // 2 Oct 2026 — the lead search rewrite: the homepage read and the website
  // check are their own stops, both before any email is looked up.
  assert.equal(STEP_TO_PHASE.reading_websites, "reading");
  assert.equal(STEP_TO_PHASE.checking_fit, "checking");
  assert.ok(PHASE_ORDER.indexOf("reading") < PHASE_ORDER.indexOf("checking"));
  assert.ok(PHASE_ORDER.indexOf("checking") < PHASE_ORDER.indexOf("enriching"), "the fit check comes before any credit");
});

test("the labels say what the run does, in plain words", () => {
  assert.equal(PHASE_LABELS.discovery.label, "Finding businesses");
  assert.equal(PHASE_LABELS.placing.label, "Checking each one");
  assert.equal(PHASE_LABELS.enriching.label, "Finding emails");
  assert.equal(PHASE_LABELS.scoring.label, "Scoring and saving");
  assert.equal(PHASE_LABELS.reading.label, "Reading websites");
  assert.equal(PHASE_LABELS.checking.label, "Right kind of business");
  assert.match(PHASE_LABELS.placing.help, /before anything is spent/);
  assert.match(PHASE_LABELS.reading.help, /outside your area/);
  assert.match(PHASE_LABELS.checking.help, /kind of business you searched for/);
  assert.match(PHASE_LABELS.enriching.help, /never more than the leads still needed/);
  for (const p of PHASE_ORDER) assert.doesNotMatch(PHASE_LABELS[p].label + " " + PHASE_LABELS[p].help, /\b(AI|Claude|model|relevance)\b/i, `${p} says it in plain words`);
});

test("Brandon's lines are on the page, and every running phase has more than one", () => {
  const all = Object.values(WAITING_LINES).flat();
  assert.ok(all.includes("Making sure everything is bonita"));
  assert.ok(all.includes("Adding expansive researched links"));
  assert.ok(all.includes("Buttoning everything up so it's glorious"));
  for (const p of ["queued", "discovery", "placing", "reading", "checking", "enriching", "scoring"]) assert.ok(WAITING_LINES[p].length >= 3, p);
});

test("the saved count reads '37 of 100 saved so far' and says nothing before the first save", () => {
  assert.equal(savedSoFarLine(37, 100), "37 of 100 saved so far");
  assert.equal(savedSoFarLine(0, 100), null);
  assert.equal(savedSoFarLine(5, 0), null);
  assert.equal(savedSoFarLine(undefined, undefined), null);
});

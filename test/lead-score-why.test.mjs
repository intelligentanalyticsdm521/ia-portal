// The lead's Overview says why it scored what it scored, in one line.
//
// Brandon, 2 Oct 2026: "I'd want to understand why leads are hot/warm/cold."
// The run writes its reasons on the row (score_reasons_json); this line shows
// them without a second click.
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · scoreWhyLine — return "" for an empty array     → "nothing when there is nothing to say" RED
//   · scoreWhyLine — skip the capital                 → "the first phrase is capitalised" RED
//   · localityLine — "unknown" → null                 → "an unplaced business says so" RED
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreWhyLine, localityLine } from "../src/lib/leadScoreWhy.ts";

test("the stored reasons become one line, the first phrase capitalised", () => {
  assert.equal(scoreWhyLine('["local business","phone found","generic info@ email","email verified"]'), "Local business · phone found · generic info@ email · email verified");
  assert.equal(scoreWhyLine(["no phone", "free webmail address"]), "No phone · free webmail address");
});

test("nothing when there is nothing to say", () => {
  assert.equal(scoreWhyLine(null), null);
  assert.equal(scoreWhyLine(undefined), null);
  assert.equal(scoreWhyLine("[]"), null);
  assert.equal(scoreWhyLine("not json"), null);
  assert.equal(scoreWhyLine('["", "  "]'), null);
});

test("an unplaced business says so; a placed one says it is in your area", () => {
  assert.equal(localityLine("local"), "In your area");
  assert.equal(localityLine("unknown"), "Could not confirm the area");
  assert.equal(localityLine(null), null);
  assert.equal(localityLine("elsewhere"), null);
});

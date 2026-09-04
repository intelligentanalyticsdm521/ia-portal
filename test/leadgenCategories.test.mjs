// Pins the preview half of A13 — more than one Business Category in one search.
//
// The invariant: the preview must obey the SAME rule the server obeys, first
// claim wins. If they disagree, the customer switches a keyword off and it gets
// searched anyway (or sees a keyword attributed to a category that did not
// bring it), which is exactly the kind of small lie that turns into a support
// ticket about a bill.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  withTypedTopics, mergeExpansions, categoryPayloadFrom,
} from "../src/lib/leadgenCategories";

const kw = (term, category = null, weight = 0.8) => ({ term, weight, source: "same_category", category });

test("typed topics go first, and are never duplicated by the expansion", () => {
  const out = withTypedTopics([kw("plumber", "Plumbing")], ["snow removal", "PLUMBER", "  "], "Plumbing");
  assert.deepEqual(out.map((k) => k.term), ["snow removal", "plumber"]);
  assert.equal(out[0].source, "typed");
  assert.equal(out[0].weight, 1);
  assert.equal(out[0].category, "Plumbing");
});

test("a typed topic outside every category carries no category — we do not guess one", () => {
  const [first] = withTypedTopics([], ["gutter guards"], null);
  assert.equal(first.category, null);
});

test("merging categories is FIRST CLAIM WINS, exactly like the server's dedup", () => {
  const merged = mergeExpansions([
    [kw("excavation", "Excavating"), kw("grading", "Excavating")],
    [kw("Excavation", "Landscaping"), kw("hauling", "Landscaping")],
  ]);
  assert.deepEqual(merged.map((k) => k.term), ["excavation", "grading", "hauling"]);
  assert.equal(merged[0].category, "Excavating", "the category that brought it owns it");
});

test("merging keeps every category's own keywords — nothing is silently dropped", () => {
  const merged = mergeExpansions([
    [kw("plumber", "Plumbing"), kw("drain cleaning", "Plumbing")],
    [kw("roofer", "Roofing")],
    [kw("snow plowing", "snow removal")],
  ]);
  assert.equal(merged.length, 4);
  assert.deepEqual([...new Set(merged.map((k) => k.category))], ["Plumbing", "Roofing", "snow removal"]);
});

test("the payload gives each category the terms it actually contributed", () => {
  const cats = [
    { id: 7, name: "Plumbing contractors" },
    { id: 0, name: "snow removal", custom: true },
  ];
  const active = [
    kw("plumber", "Plumbing contractors"),
    kw("drain cleaning", "Plumbing contractors"),
    kw("snow plowing", "snow removal"),
    kw("gutter guards", null),
  ];
  const payload = categoryPayloadFrom(cats, active);
  assert.deepEqual(payload, [
    { id: 7, name: "Plumbing contractors", custom: false, terms: ["plumber", "drain cleaning"] },
    { id: null, name: "snow removal", custom: true, terms: ["snow plowing"] },
  ]);
  // The unattributed topic belongs to no category — it still rides in
  // expanded_terms, and the server searches it at the back.
  assert.ok(!JSON.stringify(payload).includes("gutter guards"));
});

test("a keyword the customer switched OFF is not searched under any category", () => {
  const cats = [{ id: 7, name: "Plumbing contractors" }];
  const all = [kw("plumber", "Plumbing contractors"), kw("septic pumping", "Plumbing contractors")];
  const active = all.filter((k) => k.term !== "septic pumping");   // the customer clicked it off
  assert.deepEqual(categoryPayloadFrom(cats, active)[0].terms, ["plumber"]);
});

test("a custom category has a null id, so the server queues it for the category review", () => {
  const [row] = categoryPayloadFrom([{ id: 0, name: "snow removal", custom: true }], [kw("snow removal", "snow removal")]);
  assert.equal(row.id, null);
  assert.equal(row.custom, true);
});

test("a category that contributed nothing yet still travels, with an empty list", () => {
  const payload = categoryPayloadFrom([{ id: 9, name: "Roofing contractors" }], []);
  assert.deepEqual(payload, [{ id: 9, name: "Roofing contractors", custom: false, terms: [] }]);
});

// test/families-f6-money.test.mjs — the f6-money family keeps its contract.
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
import { FAMILY } from "../src/builder/widgets/families/f6-money/index.ts";
import { assertFamilyContract } from "./helpers/familyContract.mjs";

test("f6-money: the family exports the one shape families/index.ts collects", () => {
  assert.ok(Array.isArray(FAMILY.defs), "defs is an array");
  assert.equal(typeof FAMILY.renderers, "object", "renderers is a map");
});

test("f6-money: every widget it declares keeps the contract", () => {
  assertFamilyContract("f6-money", FAMILY);
});

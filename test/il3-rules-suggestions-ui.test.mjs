// IL-3 UI — the owner's rules on the page, the held-lead chip, the suggestions
// card, and the founder's two new blocks.
//
// Source-pinning, like il-learning-ui.test.mjs: these are wiring and wording
// facts a typecheck cannot see.
//
// What has to stay true:
//   • L4 — a suggestion is a sentence and a LINK. There is no button anywhere
//     in the Portal that applies one, and the client has no path that could.
//   • the owner surfaces call /business-rules and /il-suggestions, NOT /il/*
//     (founder-only) and NOT /il/rules (the F-CS.1 platform ruleset).
//   • SparkLeadModal gains exactly ONE mount — three builders share that file.
//   • no vendor and no external model is named anywhere the owner can see
//     (`reference_intelligence_layer_terminology`).
//   • the word "tenant" never reaches a person (`feedback_no_tenant_in_ui`).
//   • a held inquiry is described as waiting, never as removed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

const api = read("lib/ilOwnerApi.ts");
const rulesCard = read("components/spark/RulesAppliedCard.tsx");
const chip = read("components/spark/LeadRuleChip.tsx");
const suggestionsCard = read("components/spark/SuggestionsCard.tsx");
const leadModal = read("components/spark/SparkLeadModal.tsx");
const yourBusiness = read("pages/settings/YourBusinessPage.tsx");
const overview = read("pages/spark/SparkOverviewPage.tsx");
const founderPage = read("pages/admin/IlLearningPage.tsx");
const founderApi = read("lib/ilApi.ts");

/** The copy a person can actually read: comments stripped, so a header that
 *  says "nothing is deleted" is not mistaken for a screen that says it. */
function copyOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const OWNER_FACING = [rulesCard, chip, suggestionsCard];
const OWNER_COPY = OWNER_FACING.map(copyOnly);

test("the owner client calls the two tenant prefixes and nothing founder-only", () => {
  for (const p of [
    "/api/v1/business-rules",
    "/api/v1/business-rules/compile",
    "/api/v1/business-rules/held",
    "/api/v1/il-suggestions",
  ]) {
    assert.ok(api.includes(p), `${p} is missing from the client`);
  }
  // /il/admin is the founder's; /il/rules and /il/suggestions belong to the
  // F-CS.1 platform ruleset (migration 039). Neither may be called from here.
  assert.doesNotMatch(api, /\/api\/v1\/il\/admin/);
  assert.doesNotMatch(api, /"\/api\/v1\/il\/rules|"\/api\/v1\/il\/suggestions/);
});

test("L4 — nothing in the Portal can apply a suggestion", () => {
  // Two verbs, and there is no third.
  assert.match(api, /suggestionDone:/);
  assert.match(api, /suggestionDismiss:/);
  for (const [name, src] of [["api", api], ["card", suggestionsCard]]) {
    assert.doesNotMatch(src, /suggestions\/\$\{[^}]+\}\/(accept|apply|run|execute|send)/, name);
    assert.doesNotMatch(src, /action_json|steps_json|automation_id/, name);
  }
  // The action is a Link to a path the suggestion carries — never a fetch.
  assert.match(suggestionsCard, /<Link\s+to=\{s\.action_url\}/);
});

test("the suggestion type has an action_url and no payload field", () => {
  const block = api.slice(api.indexOf("export interface IlSuggestion"), api.indexOf("export interface IlLeadRules"));
  assert.match(block, /action_url: string;/);
  for (const forbidden of ["payload", "action_json", "steps", "automation", "body_html"]) {
    assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(block), `IlSuggestion carries ${forbidden}`);
  }
});

test("the Your business page shows the readback under question 8", () => {
  assert.match(yourBusiness, /import \{ RulesAppliedCard \}/);
  const q8 = yourBusiness.indexOf("What rules should we always follow?");
  const card = yourBusiness.indexOf("<RulesAppliedCard />");
  const q9 = yourBusiness.indexOf("How do you talk to customers?");
  assert.ok(q8 > 0 && card > q8 && card < q9, "the block is not inside question 8");
  // and there is an anchor a suggestion can deep-link to
  assert.match(yourBusiness, /id="rules"/);
  // (the deep link that lands here is produced by LUMEN's suggestion
  //  generator, and is pinned in that repo's suite, not this one.)
});

test("the readback names the count, the held leads and the end date", () => {
  assert.match(rulesCard, /How your rules are being applied/);
  assert.match(rulesCard, /leads_touched/);
  assert.match(rulesCard, /held_now/);
  assert.match(rulesCard, /expires_at/);
  assert.match(rulesCard, /waiting on you/);
  // Lite says the true thing, in plain words, and is not dressed as an error.
  assert.match(rulesCard, /tier_locked/);
  assert.match(rulesCard, /Your rules are saved/);
});

test("SparkLeadModal gains exactly one mount, and keeps IL-2's", () => {
  const mounts = leadModal.match(/<LeadRuleChip\b/g) || [];
  assert.equal(mounts.length, 1, `SparkLeadModal mounts LeadRuleChip ${mounts.length} times`);
  assert.match(leadModal, /import \{ LeadRuleChip \}/);
  // IL-2's buttons are untouched
  assert.match(leadModal, /<LeadCorrectionButtons leadId=\{lead\.id\}/);
  // both sit behind the same tier view gate
  assert.match(leadModal, /\{showIntel && \(\s*<LeadRuleChip/);
});

test("a held inquiry is described as waiting, never as removed", () => {
  assert.match(chip, /Held by your rule/);
  assert.match(chip, /Take it anyway/);
  assert.match(chip, /Not this one/);
  assert.match(chip, /waiting for you/);
  for (const src of OWNER_COPY) {
    assert.doesNotMatch(src, /\b(deleted|removed from your inbox|discarded|thrown away)\b/i);
  }
});

test("the chip renders nothing when the rules had nothing to say", () => {
  assert.match(chip, /if \(!data\) return null;/);
  assert.match(chip, /if \(!data\.held && moves\.length === 0 && data\.suggestions\.length === 0\) return null;/);
});

test("the suggestions card is on the SPARK overview and hides when empty", () => {
  assert.match(overview, /import \{ SuggestionsCard \}/);
  assert.match(overview, /<SuggestionsCard \/>/);
  assert.match(suggestionsCard, /if \(!rows \|\| rows\.length === 0\) return null;/);
});

test("the founder page gained a rules block and an audit block", () => {
  assert.match(founderPage, /Rules, in each owner/);
  assert.match(founderPage, /Audit — did we look at everybody\?/);
  assert.match(founderPage, /Last audit:/);
  assert.match(founderPage, /getIlRules|ruleAdmin/);
  assert.match(founderPage, /runIlAudit/);
  // the coverage rule is stated on the page, because it is the claim being made
  assert.match(founderPage, /smallest first/);
  assert.match(founderPage, /never skipped in favour of the biggest/);
  // the founder client keeps its own prefix
  assert.match(founderApi, /\/api\/v1\/il\/admin\/rules/);
  assert.match(founderApi, /\/api\/v1\/il\/admin\/audit/);
});

test("no vendor, no model name and no 'tenant' reaches a person", () => {
  for (const src of OWNER_COPY) {
    for (const banned of [/\bclaude\b/i, /\banthropic\b/i, /\bopenai\b/i, /\bgpt\b/i, /\bhaiku\b/i, /\bsonnet\b/i, /\bLLM\b/]) {
      assert.doesNotMatch(src, banned, `${banned} appears in an owner-facing component`);
    }
    // "tenant" only ever appears in a code identifier, never in copy.
    for (const m of src.match(/>[^<>{}]*\btenants?\b[^<>{}]*</gi) || []) {
      assert.fail(`the word tenant is visible to a person: ${m.trim().slice(0, 80)}`);
    }
  }
});

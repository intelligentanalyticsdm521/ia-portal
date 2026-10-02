// The lead search's truthful words (2 Oct 2026 review of the lead search rewrite).
//
//   · The job page's "Run stopped early" banner says what really happened for
//     every stop reason LUMEN writes (lib/leadgenStopReason.ts). Before, every
//     reason but two read "internal budget cap … 10× the requested target" —
//     false for a verifier outage or a save that failed.
//   · The lead's "About this business" sentence is written from the business's
//     own website (untrusted), so it is labelled "From their website:".
//   · An unsure website check reads "could not be confirmed as a fit".
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · stopReasonWords — drop the save_failed entry     → "every stop reason" RED
//   · SparkLeadModal — remove the label                → "From their website" RED
//   · fitSkipPhrases — "could not be confirmed"        → "as a fit" RED
//   · stopReasonWords — drop email_lookup_unavailable  → "every stop reason" RED (second review, 2 Oct 2026)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stopReasonWords } from "../src/lib/leadgenStopReason.ts";
import { fitSkipPhrases } from "../src/lib/leadRunFit.ts";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Every budget_stop_reason LUMEN's searchOrchestrator / enrichBatch can write.
const LUMEN_REASONS = ["hunter_cap", "hunter_balance", "hunter_rate_limited", "hunter_verifier_balance", "verifier_unavailable", "save_failed",
  "email_lookup_unavailable", "verifier_cannot_confirm", "verification_unavailable", "website_check_misconfigured",
  "cse_cap", "brave_cap", "you_cap", "mojeek_cap", "exa_cap"];

test("every stop reason says what really happened, in plain words", () => {
  for (const r of LUMEN_REASONS) {
    const w = stopReasonWords(r);
    assert.ok(w.title && w.body, r);
    assert.doesNotMatch(`${w.title} ${w.body}`, /hunter|google|brave|tenant|api|internal|_/i, `${r}: no vendor names, codes or jargon`);
  }
  // Not every stop is a cap: an outage or a failed save never claims a "safety limit".
  for (const r of ["hunter_balance", "hunter_rate_limited", "hunter_verifier_balance", "verifier_unavailable", "save_failed",
    "email_lookup_unavailable", "verifier_cannot_confirm", "verification_unavailable", "website_check_misconfigured"]) {
    assert.doesNotMatch(stopReasonWords(r).body, /safety limit|5 times|10 web searches/, r);
    assert.match(stopReasonWords(r).body, /Nothing more was spent once that happened\./, r);
  }
  assert.match(stopReasonWords("save_failed").title, /could not be saved/);
  // The 2 Oct 2026 second review: each new stop has its own sentence, never the fallback "safety limit".
  assert.match(stopReasonWords("email_lookup_unavailable").title, /email lookup was not answering/);
  assert.match(stopReasonWords("verifier_cannot_confirm").body, /could not tell/);
  // A dead website check (key or model problem) says it is OUR problem and that nothing was spent on the run.
  assert.match(stopReasonWords("website_check_misconfigured").title, /on our side/);
  assert.match(stopReasonWords("website_check_misconfigured").body, /not yours/);
  assert.match(stopReasonWords("verification_unavailable").body, /last checks we run on each lead/);
  for (const r of ["email_lookup_unavailable", "verifier_cannot_confirm", "verification_unavailable"]) assert.notEqual(stopReasonWords(r).title, "a safety limit", r);
  assert.match(stopReasonWords("verifier_unavailable").body, /confirms each email stopped answering/);
  assert.match(stopReasonWords("hunter_cap").body, /5 times the leads you asked for/);
  assert.match(stopReasonWords("brave_cap").body, /10 web searches/);
  assert.equal(stopReasonWords("cse_cap").title, stopReasonWords("you_cap").title, "every web-search cap reads the same");
  assert.equal(stopReasonWords(null).title, "a safety limit");
});

test("the job page reads its stop words from the one helper", () => {
  const src = readFileSync(path.join(ROOT, "src/pages/spark/SparkLeadGenJobPage.tsx"), "utf8");
  assert.match(src, /stopReasonWords\(status\.budget_stop_reason\)\.title/);
  assert.match(src, /stopReasonWords\(status\.budget_stop_reason\)\.body/);
  assert.doesNotMatch(src, /internal budget cap/, "the old catch-all is gone");
});

test("From their website: the lead's About sentence is labelled as the website's own words", () => {
  const src = readFileSync(path.join(ROOT, "src/components/spark/SparkLeadModal.tsx"), "utf8");
  const block = src.slice(src.indexOf('data-testid="lead-relevance"'), src.indexOf('data-testid="lead-relevance-not-checked"'));
  assert.ok(block.length > 0, "found the About block");
  assert.match(block, /From their website:<\/span> \{relevance\.reason\}/);
});

test("an unsure website check could not be confirmed AS A FIT — never read as an email check", () => {
  assert.deepEqual(fitSkipPhrases({ skipped: { relevance_unsure: 2 } }), ["2 could not be confirmed as a fit"]);
});

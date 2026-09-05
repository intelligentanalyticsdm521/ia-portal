// Pre-walk fixes 1b — the Portal half of the client-visible defects the pass-1
// tester logged. Source-pinning, like il8-findings-ui.test.mjs: these are
// wiring and wording facts a typecheck cannot see.
//
// What has to stay true:
//   • the Lead Inbox's chips and its "Last re-scored …" sentence come from the
//     SERVER's numbers, never from the fifty rows that happen to be on screen
//     (walk rows R7 and R12);
//   • Platform Admin → Agents never renders a bare GUID as a business's whole
//     name (walk row AG13);
//   • Platform Admin → Phone lines renders a REFUSAL as a refusal — no zeros,
//     no "no business has a live number yet";
//   • "What worked" draws every section of the report, and says why one is
//     empty rather than leaving it out.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");

/** The copy a person can actually read: comments stripped, so a header that
 *  names the old defect is not mistaken for the screen still having it. */
function copyOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const inbox = read("pages/spark/SparkLeadInboxPage.tsx");
const inboxCopy = copyOnly(inbox);
const agents = copyOnly(read("pages/admin/AgentsAcrossBusinessesPage.tsx"));
const phoneLines = read("pages/admin/PhoneLinesPage.tsx");
const phoneCopy = copyOnly(phoneLines);
const whatWorked = read("pages/spark/SparkWhatWorkedPage.tsx");
const whatWorkedCopy = copyOnly(whatWorked);
const findingsApi = read("lib/ilFindingsApi.ts");

/* ── 1. the Lead Inbox counts the inbox ─────────────────────────────────── */

test("the band chips read the server's totals, not the loaded rows", () => {
  assert.match(inboxCopy, /const counts = meta\?\.band_counts/,
    "counts must come from meta; deriving them from `leads` is the defect");
  assert.doesNotMatch(inboxCopy, /all: leads\.length/,
    "counting the page and calling it the inbox is what said Hot (0) beside 51 hot leads");
});

test("the 'Last re-scored' sentence reads the whole inbox", () => {
  assert.match(inboxCopy, /meta\?\.last_rescored_at/);
  assert.doesNotMatch(inboxCopy, /for \(const l of leads\)[\s\S]{0,120}rescored_at/,
    "the newest re-score among the LOADED rows is why the sentence was missing on page 1 of 197");
});

test("a chip whose number the server could not read carries no number at all", () => {
  // null is the absence of a claim; 0 is a claim, and the wrong one.
  assert.match(inboxCopy, /counts \? ` \(\$\{counts\[t\]\}\)` : ""/);
});

test("the Source chip filters the inbox, on the server", () => {
  assert.match(inboxCopy, /qs\.set\("source"/, "the chip must reach the query, not just the page");
  assert.match(inboxCopy, /meta\?\.source_counts/, "and its counts must come back from the inbox");
  assert.doesNotMatch(inboxCopy, /sourceFacetKey\(l\) !== sourceFilter/,
    "filtering the fifty rows on screen shows a count that does not match the list");
});

test("the raw source keys are folded to labels HERE, and only here", () => {
  // Seven engine keys read "SPARK Lead Gen" and the client is deliberately not
  // shown which engine found them. That map is a Portal thing; the server is
  // sent raw keys so it never needs a second copy of it.
  assert.match(inboxCopy, /sourceFacetLabel\(rawKey\)/);
  assert.match(inboxCopy, /sourceKeysByLabel\[sourceFilter\]/);
});

/* ── 2. Agents across businesses ────────────────────────────────────────── */

test("a business we cannot name is named 'Unknown business', never a bare id", () => {
  assert.match(agents, /Unknown business/);
  assert.doesNotMatch(agents, /\{b\.business_name \|\| b\.tenant_id\}/,
    "a bare GUID as the whole label reads as corruption, not as 'we could not name this one'");
});

test("the id is still on the row, whether or not the name resolved", () => {
  assert.match(agents, /<span className="ml-2 font-normal text-slate-400">\{b\.tenant_id\}<\/span>/);
});

/* ── 3. Phone lines: a refusal is not a reading ─────────────────────────── */

test("a 403 from the phone-lines API is rendered as a refusal", () => {
  assert.match(phoneLines, /e\.status === 403 \|\| e\.status === 401/,
    "401/403 mean 'you cannot see this'; anything else is a fault and keeps the red strip");
  assert.match(phoneCopy, /You cannot see this\./);
});

test("a refusal shows no zeros and no 'nobody has a number yet'", () => {
  // Both of those are claims about the world. A refusal is the absence of one.
  for (const guarded of [
    "{!refused && meta?.pool &&",
    "{!refused && meta?.shared_line &&",
    "{!refused && !loading && (",
    "{!refused && <div className=\"grid gap-3 sm:grid-cols-4\">",
  ]) {
    assert.ok(phoneLines.includes(guarded), `not gated on the refusal: ${guarded}`);
  }
  assert.match(phoneLines, /setLines\(\[\]\);\s*\n\s*setMeta\(null\);/,
    "a failed read must leave nothing behind for a later render to count");
});

/* ── 4. "What worked" draws every section ───────────────────────────────── */

test("the report has a place for every section, measured or not", () => {
  assert.match(findingsApi, /coverage\?: IlFindingCoverage\[\]/);
  assert.match(whatWorked, /const coverage = report\?\.coverage;/);
  assert.match(whatWorkedCopy, /g\.waitingFor \|\| "Nothing to measure here this month\."/);
});

test("a section this plan does not include says 'Comes with Pro', not 'no data'", () => {
  assert.match(whatWorkedCopy, /g\.gated === "pro"/);
  assert.match(whatWorkedCopy, /Comes with Pro\./);
});

test("a month with no paragraph says why, rather than dropping it in silence", () => {
  assert.match(whatWorked, /function narrativeAbsenceLine/);
  assert.match(whatWorked, /report\.narrative_available && !report\.narrative && report\.run/);
  // The reader is told the check exists — that is the reason the paragraph is
  // trustworthy when it IS there.
  assert.match(whatWorkedCopy, /did not pass our own check/);
});

test("the absence line never shows the engine's own status word", () => {
  const copy = whatWorkedCopy;
  for (const jargon of ["rejected_unverified_number", "budget_spent", "not_configured", "no_findings"]) {
    // The status STRINGS may appear as switch labels; what must never appear is
    // one of them inside text the owner reads.
    const inText = new RegExp(`>[^<]*${jargon}[^<]*<`);
    assert.doesNotMatch(copy, inText, `${jargon} reached the screen`);
  }
});

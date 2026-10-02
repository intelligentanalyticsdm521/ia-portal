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
//   · scoreWhyLine — ignore `omit`                    → "the score line leaves out what the About block says" RED
//   · parseRelevance — keep services on not_checked   → "a lead the check could not review" RED
//   · fitSkipPhrases — drop the unsure count          → "the run banner counts the website check" RED
//   · distanceLine — round "less than a mile" to 0     → "the distance reads as a person would say it" RED
//   · addressSourceLine — name the database vendor     → "where the address came from, in plain words" RED
//   · parsePlace — accept a negative or text distance  → "a place the run did not measure" RED
//   · the inbox City cell dropped                     → "the list has a City column" RED
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreWhyLine, localityLine, parseRelevance, relevancePhrases, parsePlace, distanceLine, cityLine, addressSourceLine } from "../src/lib/leadScoreWhy.ts";
import { readFileSync } from "node:fs";
import { fitSkipPhrases, fitSkipCount, notCheckedLine } from "../src/lib/leadRunFit.ts";

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

// ── The website check (the lead search rewrite, 2 Oct 2026) ─────────────────
// LUMEN stores what the check found on the lead (relevance_json) and appends
// its sentence and services to score_reasons_json. The Overview shows them once,
// in "About this business", and the score's line leaves them out.
const CHECKED = JSON.stringify({
  status: "checked", verdict: "pass", kind: "local_business", does_trade: "yes", serves_area: "yes",
  services: ["Panel upgrades", "EV chargers"], audience: "both",
  reason: "Licensed electrician in Grimes, IA serving the Des Moines area.", model: "x", cached: false,
});

test("a checked lead: one sentence and its services", () => {
  const rel = parseRelevance(CHECKED);
  assert.deepEqual(rel, { status: "checked", reason: "Licensed electrician in Grimes, IA serving the Des Moines area.", services: ["Panel upgrades", "EV chargers"] });
  assert.deepEqual(relevancePhrases(rel), ["Licensed electrician in Grimes, IA serving the Des Moines area.", "offers: Panel upgrades, EV chargers"]);
});

test("a lead the check could not review says so, and carries no services", () => {
  const rel = parseRelevance({ status: "not_checked", reason: "Not checked: the website could not be reviewed for this search.", services: ["x"] });
  assert.equal(rel.status, "not_checked");
  assert.match(rel.reason, /^Not checked/);
  assert.deepEqual(rel.services, []);
  assert.deepEqual(relevancePhrases(rel), ["not checked for relevance"]);
  assert.equal(parseRelevance(null), null, "an intake lead or an older run has none");
  assert.equal(parseRelevance("not json"), null);
  assert.equal(parseRelevance('{"status":"weird"}'), null);
});

test("the score line leaves out what the About block already says", () => {
  const stored = JSON.stringify(["local business", "phone found", "generic info@ email", "email verified",
    "Licensed electrician in Grimes, IA serving the Des Moines area.", "offers: Panel upgrades, EV chargers"]);
  assert.equal(scoreWhyLine(stored, relevancePhrases(parseRelevance(CHECKED))), "Local business · phone found · generic info@ email · email verified");
  assert.match(scoreWhyLine(stored), /offers: Panel upgrades/, "without `omit` nothing is hidden");
  assert.equal(scoreWhyLine(JSON.stringify(["not checked for relevance"]), ["not checked for relevance"]), null);
});

test("the run banner counts the website check in plain words", () => {
  const summary = { skipped: { not_relevant: 3, relevance_unsure: 1 }, delivered_not_checked: 2 };
  assert.deepEqual(fitSkipPhrases(summary), ["3 not the kind of business you searched for", "1 could not be confirmed as a fit"]);
  assert.equal(fitSkipCount(summary), 4);
  assert.equal(notCheckedLine(summary), "2 leads not checked: the website could not be reviewed, so they were saved on the other checks alone.");
  assert.equal(notCheckedLine({ delivered_not_checked: 1 }), "1 lead not checked: the website could not be reviewed, so it was saved on the other checks alone.");
  // A run from before the rewrite has none of these keys: nothing is said.
  assert.deepEqual(fitSkipPhrases({ skipped: { no_email: 2 } }), []);
  assert.equal(fitSkipCount({ skipped: {} }), 0);
  assert.equal(notCheckedLine({}), null);
  assert.equal(notCheckedLine(null), null);
  for (const p of [...fitSkipPhrases(summary), notCheckedLine(summary)]) assert.doesNotMatch(p, /relevance|_|\bAI\b|Claude|model/i, p);
});

// ── The business address (2 Oct 2026) ───────────────────────────────────────
// LUMEN keeps the address in parts on relevance_json.place: the town, the
// state, where it came from and the distance to the search's centre town.
const PLACED = JSON.stringify({
  status: "checked", verdict: "pass", reason: "A plumber.", services: [],
  place: { address: "2201 SE Delaware Ave, Ankeny, IA 50021", street: "2201 SE Delaware Ave", city: "Ankeny", state: "IA", postal_code: "50021", source: "structured_data", miles: 10.9, anchor: "Des Moines, IA", found_in: ["structured_data", "hunter"] },
});

test("the place: the town for the list, the distance beside the area line", () => {
  const p = parsePlace(PLACED);
  assert.deepEqual(p, { city: "Ankeny", state: "IA", source: "structured_data", miles: 10.9, anchor: "Des Moines, IA" });
  assert.equal(cityLine(p), "Ankeny, IA");
  assert.equal(distanceLine(p), "11 miles from Des Moines");
  // parseRelevance is unchanged by the extra key.
  assert.deepEqual(parseRelevance(PLACED), { status: "checked", reason: "A plumber.", services: [] });
});

test("the distance reads as a person would say it", () => {
  const at = (miles, city = "Altoona") => distanceLine({ city, state: "IA", source: "model", miles, anchor: "Des Moines, IA" });
  assert.equal(at(0, "Des Moines"), null, "the centre town itself: town-to-town distances cannot say more, the Address field names it");
  assert.equal(at(0.6, "Pleasant Hill"), "less than a mile from Des Moines");
  assert.equal(at(1.2), "1 mile from Des Moines");
  assert.equal(at(29.6), "30 miles from Des Moines");
});

test("a place the run did not measure, or no place at all, says nothing", () => {
  assert.equal(parsePlace(null), null);
  assert.equal(parsePlace("not json"), null);
  assert.equal(parsePlace(CHECKED), null, "a lead from before the address work");
  const unmeasured = parsePlace({ place: { city: "Nowhereville", state: "IA", source: "page_text", miles: null, anchor: null } });
  assert.equal(cityLine(unmeasured), "Nowhereville, IA");
  assert.equal(distanceLine(unmeasured), null);
  assert.equal(parsePlace({ place: { city: "Ankeny", state: "IA", miles: -3, anchor: "Des Moines, IA" } }).miles, null);
  assert.equal(parsePlace({ place: { city: "Ankeny", state: "IA", miles: "10", anchor: "Des Moines, IA" } }).miles, null);
  assert.equal(parsePlace({ place: { city: "", state: "" } }), null);
});

test("where the address came from, in plain words — never a vendor's name", () => {
  const src = (source) => addressSourceLine({ city: "Ankeny", state: "IA", source, miles: null, anchor: null });
  assert.equal(src("structured_data"), "From their website");
  assert.equal(src("model"), "From their website");
  assert.equal(src("page_text"), "From their website");
  assert.equal(src("hunter"), "From a business database");
  assert.equal(src("business_record"), "From a business database");
  assert.equal(src("something_new"), null);
  for (const s of ["structured_data", "model", "page_text", "hunter", "business_record"]) assert.doesNotMatch(src(s), /hunter|data axle|claude|model|_/i);
});

test("the lead shows the address, its source and the distance; the list has a City column", () => {
  const modal = readFileSync(new URL("../src/components/spark/SparkLeadModal.tsx", import.meta.url), "utf8");
  assert.match(modal, /<Field icon=\{MapPin\} label="Address">\s*\{lead\.full_address \|\| "—"\}/);
  assert.match(modal, /data-testid="lead-address-source">\{addressSourceLine\(place\)\}/);
  assert.match(modal, /localityLine\(lead\.locality\) && distanceLine\(place\) &&/);
  const inbox = readFileSync(new URL("../src/pages/spark/SparkLeadInboxPage.tsx", import.meta.url), "utf8");
  assert.match(inbox, /<th className="px-4 py-3">Phone<\/th>\s*<th className="px-4 py-3">City<\/th>/);
  assert.match(inbox, /cityLine\(parsePlace\(l\.relevance_json\)\)/);
  assert.match(inbox, /colSpan=\{showIntel \? 10 : 9\}/, "the empty row still spans every column");
});

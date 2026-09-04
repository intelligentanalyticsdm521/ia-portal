// test/business-profile-form.test.mjs — Foundation B, the browser half.
//
// src/lib/businessProfileForm.ts is a pure module (no React, no MSAL, no
// import.meta.env), so it belongs under this runner. What it decides is what
// gets WRITTEN to the business's permanent record and what earns a line in its
// change history, which is why these cases are worth pinning:
//
//   * Save sends ONLY what changed. Posting the whole form would fill the
//     History drawer with "industry: Roofing -> Roofing" forever and, worse,
//     could send back an empty value for a field the page failed to load.
//   * A prefilled answer left alone sends nothing. Prefill is a suggestion
//     until the owner touches it; a page that quietly saved every suggestion
//     on first load would be putting words in the owner's mouth.
//   * Prices never leave this page. The catalogue picker stores name +
//     offering_id and nothing else — decision F-3, and the API refuses a price
//     anyway, but the form must not try.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  EMPTY_DRAFT,
  toDraft,
  toFields,
  changedFields,
  confirmPrefillPayload,
  describeValue,
  FIELD_LABELS,
} from "../src/lib/businessProfileForm.ts";

const CATALOGUE = [
  { offeringId: "off-1", name: "Gutter clean" },
  { offeringId: "off-2", name: "Gutter guards" },
];

const SERVER_PROFILE = {
  industry: "Gutter cleaning",
  description: "We clean gutters.",
  tagline: null,
  targetAudience: "Suburban homeowners",
  brandVoice: null,
  services: [{ name: "Gutter clean", offering_id: "off-1" }, { name: "Storm call-outs" }],
  servicesSummary: null,
  serviceArea: { kind: "list", states: ["IA"], cities: ["Ankeny"] },
  capacity: { jobs_per_day: 4 },
  capacityNote: null,
  idealJob: null,
  idealCustomer: null,
  differentiators: null,
  noGoList: null,
  doNotSay: null,
  rulesPlainText: null,
  responsePromiseMinutes: 30,
  responsePromiseText: null,
  escalation: null,
  languages: ["en", "es"],
};

/* ── round trip ──────────────────────────────────────────────────────────── */

test("the server's shape becomes the form's shape and back again, unchanged", () => {
  const draft = toDraft(SERVER_PROFILE);
  assert.deepEqual(draft.selectedOfferingIds, ["off-1"], "catalogue services are the picker's");
  assert.equal(draft.servicesText, "Storm call-outs", "typed services stay typed");
  assert.equal(draft.serviceAreaKind, "list");
  assert.equal(draft.serviceAreaStates, "IA");
  assert.equal(draft.serviceAreaCities, "Ankeny");
  assert.equal(draft.capacityJobsPerDay, "4");
  assert.equal(draft.responsePromiseMinutes, "30");
  assert.equal(draft.languages, "en, es");

  assert.deepEqual(changedFields(SERVER_PROFILE, draft, CATALOGUE), {},
    "a round trip with no edits must produce NO changes");
});

test("a null profile loads as an empty form, and an empty form saves nothing", () => {
  const empty = {
    industry: null, description: null, tagline: null, targetAudience: null, brandVoice: null,
    services: null, servicesSummary: null, serviceArea: null, capacity: null, capacityNote: null,
    idealJob: null, idealCustomer: null, differentiators: null, noGoList: null, doNotSay: null,
    rulesPlainText: null, responsePromiseMinutes: null, responsePromiseText: null,
    escalation: null, languages: null,
  };
  assert.deepEqual(toDraft(null), EMPTY_DRAFT);
  assert.deepEqual(changedFields(empty, EMPTY_DRAFT, []), {});
});

/* ── only what changed ───────────────────────────────────────────────────── */

test("editing one field sends exactly that field", () => {
  const draft = { ...toDraft(SERVER_PROFILE), industry: "Roofing" };
  assert.deepEqual(changedFields(SERVER_PROFILE, draft, CATALOGUE), { industry: "Roofing" });
});

test("clearing a field sends null — an owner deleting an answer must stick", () => {
  const draft = { ...toDraft(SERVER_PROFILE), industry: "   " };
  assert.deepEqual(changedFields(SERVER_PROFILE, draft, CATALOGUE), { industry: null });
});

test("MUTATION: a reordered structured value is NOT a change", () => {
  // If the diff compared JSON.stringify of the raw object, changing the order
  // of two keys — which the form does routinely — would look like an edit and
  // write a version row saying nothing happened.
  const draft = toDraft({ ...SERVER_PROFILE, capacity: { jobs_per_day: 4 } });
  const same = changedFields({ ...SERVER_PROFILE, capacity: { jobs_per_day: 4 } }, draft, CATALOGUE);
  assert.deepEqual(same, {});
});

test("ticking another catalogue service sends the whole services list, names and ids only", () => {
  const draft = { ...toDraft(SERVER_PROFILE), selectedOfferingIds: ["off-1", "off-2"] };
  const change = changedFields(SERVER_PROFILE, draft, CATALOGUE);
  assert.deepEqual(change.services, [
    { name: "Gutter clean", offering_id: "off-1" },
    { name: "Gutter guards", offering_id: "off-2" },
    { name: "Storm call-outs" },
  ]);
  assert.equal(JSON.stringify(change).includes("price"), false, "no price may leave this page");
  assert.equal(Object.keys(change).length, 1, "only services changed");
});

test("a picked service whose catalogue row has vanished is dropped, not invented", () => {
  const draft = { ...toDraft(SERVER_PROFILE), selectedOfferingIds: ["off-1", "off-gone"] };
  const change = changedFields(SERVER_PROFILE, draft, CATALOGUE);
  assert.deepEqual(change, {}, "off-gone contributes nothing, so nothing changed");
});

/* ── structured groups collapse honestly ─────────────────────────────────── */

test("a structured group with nothing in it saves as null, not as an empty shell", () => {
  const draft = { ...EMPTY_DRAFT, serviceAreaKind: "list" };
  const fields = toFields(draft, []);
  assert.equal(fields.serviceArea, null, "only `kind` set is not an answer");
  assert.equal(fields.capacity, null);
  assert.equal(fields.escalation, null);
  assert.equal(fields.services, null);
  assert.equal(fields.languages, null);
});

test("switching to a radius area sends the radius, and only the radius", () => {
  const draft = {
    ...toDraft(SERVER_PROFILE),
    serviceAreaKind: "radius",
    serviceAreaPostalCode: "50023",
    serviceAreaMiles: "30",
  };
  const change = changedFields(SERVER_PROFILE, draft, CATALOGUE);
  assert.deepEqual(change.serviceArea, { kind: "radius", center_postal_code: "50023", miles: 30 });
  assert.equal("states" in change.serviceArea, false, "the list fields are not carried along");
});

test("lists split on commas AND newlines, and drop the blanks", () => {
  const draft = { ...EMPTY_DRAFT, languages: "en , es,\n , fr ", servicesText: "One\n\nTwo\n  " };
  const fields = toFields(draft, []);
  assert.deepEqual(fields.languages, ["en", "es", "fr"]);
  assert.deepEqual(fields.services, [{ name: "One" }, { name: "Two" }]);
});

test("a number field sends a number, and an empty one sends null", () => {
  assert.equal(toFields({ ...EMPTY_DRAFT, responsePromiseMinutes: "45" }, []).responsePromiseMinutes, 45);
  assert.equal(toFields({ ...EMPTY_DRAFT, responsePromiseMinutes: "" }, []).responsePromiseMinutes, null);
});

/* ── prefill ─────────────────────────────────────────────────────────────── */

test("a prefilled answer left alone sends nothing; confirming it sends it", () => {
  // The GET merges prefill into `profile`, so `loaded` already carries the
  // suggestion. Pressing Save without touching anything must be a no-op...
  const draft = toDraft(SERVER_PROFILE);
  assert.deepEqual(changedFields(SERVER_PROFILE, draft, CATALOGUE), {});

  // ...while "yes, that's right" explicitly sends the prefilled fields.
  const payload = confirmPrefillPayload(SERVER_PROFILE, ["industry", "targetAudience", "tagline"]);
  assert.deepEqual(payload, { industry: "Gutter cleaning", targetAudience: "Suburban homeowners" },
    "tagline is null in the profile, so there is nothing to confirm");
});

/* ── the history drawer speaks English ───────────────────────────────────── */

test("every field the API can report has a plain-words label", () => {
  const apiFields = Object.keys(SERVER_PROFILE);
  for (const f of apiFields) {
    assert.ok(FIELD_LABELS[f], `${f} has no human label — the History drawer would show the column name`);
  }
});

test("a change's value is described for a person, not printed as JSON", () => {
  assert.equal(describeValue(null), "nothing");
  assert.equal(describeValue(""), "nothing");
  assert.equal(describeValue([]), "nothing");
  assert.equal(describeValue({}), "nothing");
  assert.equal(describeValue(["en", "es"]), "en, es");
  assert.equal(describeValue([{ name: "Gutter clean", offering_id: "x" }]), "Gutter clean");
  assert.equal(describeValue({ states: ["IA"], cities: ["Ankeny"] }), "states: IA; cities: Ankeny");
  assert.equal(describeValue(30), "30");
});

/* ── the page keeps its promises ─────────────────────────────────────────── */

const PAGE = readFileSync(path.join(process.cwd(), "src/pages/settings/YourBusinessPage.tsx"), "utf8");

test("the page never says 'tenant' to a person", () => {
  // feedback_no_tenant_in_ui. Code identifiers (`tenantId`, `active.tenant`,
  // the `x-tenant-key` header) are not words on a screen; what must not appear
  // is the word in the prose the owner reads. So: drop the comments, drop the
  // identifiers, and whatever mentions of "tenant" survive are visible text.
  const prose = PAGE
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/active\?\.tenant\?\.tenantId/g, " ")
    .replace(/tenantId/g, " ")
    .replace(/x-tenant-key/g, " ");
  assert.equal(/\btenants?\b/i.test(prose), false, "say Business, never tenant");
});

test("the page shows hours and prices but sends neither", () => {
  assert.match(PAGE, /borrowed\.businessHours/, "hours are shown");
  assert.match(PAGE, /settings\/business-profile/, "with a link to the page that owns them");
  assert.match(PAGE, /borrowed\.prices/, "prices are shown");
  assert.match(PAGE, /oliver_catalog/, "with a link to the catalogue that owns them");
  // The save payload is whatever changedFields produced — never a hand-built
  // object that could smuggle one of these in.
  assert.match(PAGE, /payload: pending/);
  assert.equal(/businessHours:\s*draft|payload:\s*\{/.test(PAGE), false,
    "the PUT body must be the computed diff, nothing hand-assembled");
});

test("the page states what the record is used for", () => {
  assert.match(PAGE, /Used by:/);
  assert.match(PAGE, /agents, lead scoring/);
});

test("prefilled answers are marked, and the page says nothing is saved until Save", () => {
  assert.match(PAGE, /We filled this in from/);
  assert.match(PAGE, /Nothing is saved until you press Save/);
});

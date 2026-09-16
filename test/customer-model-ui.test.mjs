// The customer model's four decisions, and the screens that must not re-answer
// them on their own.
//
// Spec: overnight-report/CUSTOMER_MODEL_MULTISITE_2026-09-15.md §7 points 1-4,
// built as §12.
//
// WHAT THESE PIN
//
//   the list is two groups   companies first, then the labelled group. The
//                            order IS the decision, and the two groups render
//                            differently (a company row takes no checkbox).
//   People only FILTERS      it drops company rows; it never expands one into
//                            its contacts, because those people are not on
//                            this page and a bulk delete must not reach rows
//                            nobody saw.
//   the picker is FORCED     at more than one location, and ABSENT at one.
//                            That gate is one function, because three screens
//                            ask and a `> 1` typed into each is three places
//                            for it to become `>= 1`.
//   nothing is guessed       a customer with several sites and no default gets
//                            NO preselection; the summary line drops a clause
//                            it has no answer for instead of printing a dash.
//   show_on is PRESENCE      a field with nothing ticked shows nowhere.
//
// MUTATION-TESTED (each broken on purpose and restored):
//   · mustPickLocation `> 1` -> `>= 1`   caught by "one location never asks"
//   · peopleOnly returning every row     caught by "the chip drops companies"
//   · defaultLocationId picking [0]      caught by "several with no default"
//   · visibleOn as `!== undefined`       caught by "a field with nothing ticked"
//   · the group header on every row      caught by the source pin below
//
// Pure: no DOM, no network, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cm from "../src/lib/customerModel.ts";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const company = (id, over = {}) => ({
  customer_kind: "company", customer_id: String(id), name: `Company ${id}`,
  email: null, phone: null, domain: `c${id}.test`, contact_count: 2, location_count: 1,
  oliver_contact_id: null, open_balance: null, last_job_at: null,
  contact_intelligence_tier: null, contact_intelligence_score: null, source: null,
  email_unsubscribed: false, email_invalid: false, subscription_status: null, updated_at: null,
  ...over,
});
const person = (id, over = {}) => ({
  ...company(id), customer_kind: "person", name: `Person ${id}`,
  email: `p${id}@x.test`, domain: null, contact_count: 0,
  oliver_contact_id: "11111111-1111-4111-8111-11111111111" + (id % 10),
  ...over,
});
const loc = (id, over = {}) => ({
  location_id: id, name: `Site ${id}`, address_line1: "1 Main St", address_line2: null,
  city: "Ankeny", state: "IA", postal_code: "50023", country: "US",
  access_notes: null, gate_code: null, tax_rate: null,
  is_default: false, sort_order: 0, is_archived: false, ...over,
});

// ── 1. the mixed list is two groups ────────────────────────────────────────

test("companies come first, then the people who are not at a company", () => {
  const rows = [person(1), company(2), person(3), company(4)];
  const g = cm.groupMixedList(rows);
  assert.deepEqual(g.companies.map((r) => r.customer_id), ["2", "4"]);
  assert.deepEqual(g.peopleWithoutCompany.map((r) => r.customer_id), ["1", "3"]);
});

test("the server's order inside each group is preserved, not re-sorted", () => {
  // The server ordered by name and the pagination shares that order; re-sorting
  // here is how page 2 repeats a row page 1 already showed.
  const rows = [company(9), company(1), person(8), person(2)];
  const g = cm.groupMixedList(rows);
  assert.deepEqual(g.companies.map((r) => r.customer_id), ["9", "1"]);
  assert.deepEqual(g.peopleWithoutCompany.map((r) => r.customer_id), ["8", "2"]);
});

test("the chip drops companies — it never expands one into its contacts", () => {
  const rows = [company(1, { contact_count: 12 }), person(2), person(3)];
  const flat = cm.peopleOnly(rows);
  assert.deepEqual(flat.map((r) => r.customer_id), ["2", "3"]);
  assert.ok(flat.every((r) => r.customer_kind === "person"),
    "a company's twelve people are not on this page; a bulk action must not reach them");
});

test("a company #10 and a contact #10 are different rows", () => {
  assert.notEqual(cm.customerKey(company(10)), cm.customerKey(person(10)));
  assert.equal(cm.customerKey(company(10)), "company:10");
});

test("NULL money is 'nobody asked', which is not $0.00", () => {
  assert.equal(cm.hasMoney({ open_balance: null }), false);
  assert.equal(cm.hasMoney({ open_balance: 0 }), true, "zero IS an answer; only null is silence");
  assert.equal(cm.hasMoney({ open_balance: 12.5 }), true);
});

// ── 2. the forced picker ───────────────────────────────────────────────────

test("one location never asks, two always do", () => {
  assert.equal(cm.mustPickLocation([]), false, "nothing to choose between");
  assert.equal(cm.mustPickLocation([loc("a")]), false,
    "a homeowner has one location, so the location pane never appears for them");
  assert.equal(cm.mustPickLocation([loc("a"), loc("b")]), true);
  assert.equal(cm.mustPickLocation([loc("a"), loc("b"), loc("c")]), true);
});

test("the only location is preselected; the flagged default wins when there are several", () => {
  assert.equal(cm.defaultLocationId([loc("only")]), "only");
  assert.equal(cm.defaultLocationId([loc("a"), loc("b", { is_default: true })]), "b");
});

test("several with no default preselects NOTHING", () => {
  assert.equal(
    cm.defaultLocationId([loc("a"), loc("b"), loc("c")]), null,
    "quietly picking the first is how a crew ends up at the wrong building with the form looking answered",
  );
});

// ── 3. the summary line ────────────────────────────────────────────────────

test("the summary line says where, who hears, and who pays", () => {
  const out = cm.jobSummary({
    location: loc("a", { name: "Des Moines campus" }),
    siteContactName: "Evan Whitaker",
    billToName: "Accounting, Hope Ministries",
  });
  assert.equal(out.text, "Be done at Des Moines campus · updates to Evan Whitaker · invoice to Accounting, Hope Ministries");
});

test("a clause with no answer is DROPPED, not printed as a dash", () => {
  const out = cm.jobSummary({ location: loc("a", { name: "Home" }), siteContactName: null, billToName: null });
  assert.equal(out.text, "Be done at Home");
  assert.doesNotMatch(out.text, /—/, "'invoice to —' reads as a decision the user made");
  assert.equal(cm.jobSummary({ location: null, siteContactName: null, billToName: null }).text, "");
});

// ── the recipient ladder, the same one the server walks ───────────────────

const roleRow = (over) => ({
  role_id: "1", role: "site", location_id: null, location_name: null,
  person_contact_id: 1, first_name: "A", last_name: "B", display_name: null,
  email: "a@b.test", phone: null, ...over,
});

test("a site contact AT this location wins over a working contact at the customer", () => {
  const roles = [
    roleRow({ role_id: "1", role: "working", person_contact_id: 1, first_name: "Working", location_id: null }),
    roleRow({ role_id: "2", role: "site", person_contact_id: 2, first_name: "Site", location_id: "loc-a" }),
  ];
  assert.equal(cm.personName(cm.siteContactFor(roles, "loc-a")), "Site B");
});

test("with nobody at the location it falls to working, then to primary", () => {
  const working = [roleRow({ role: "working", first_name: "Working", location_id: null })];
  assert.equal(cm.personName(cm.siteContactFor(working, "loc-a")), "Working B");
  const primary = [roleRow({ role: "primary", first_name: "Primary", location_id: null })];
  assert.equal(cm.personName(cm.siteContactFor(primary, "loc-a")), "Primary B");
  assert.equal(cm.siteContactFor([], "loc-a"), null, "no roles means the customer themselves");
});

test("a site contact at ANOTHER location is not this location's", () => {
  const roles = [roleRow({ role: "site", first_name: "Elsewhere", location_id: "loc-b" })];
  assert.equal(cm.siteContactFor(roles, "loc-a"), null);
});

// ── 4. bill-to ─────────────────────────────────────────────────────────────

const profile = (over) => ({
  billing_profile_id: "bp", location_id: null, address_line1: null, address_line2: null,
  city: null, state: null, postal_code: null, country: null, billing_contact_id: null,
  payment_terms_days: 30, po_number: null, tax_exempt: false, stripe_customer_id: null, notes: null, ...over,
});

test("a location that pays for itself wins over the customer's profile", () => {
  const own = profile({ billing_profile_id: "site", location_id: "loc-a", payment_terms_days: 15 });
  const got = cm.resolveBillTo(profile({}), own);
  assert.equal(got.profile.billing_profile_id, "site");
  assert.equal(got.paysForItself, true);
});

test("with no profile of its own the location bills to the customer", () => {
  const got = cm.resolveBillTo(profile({}), null);
  assert.equal(got.profile.billing_profile_id, "bp");
  assert.equal(got.paysForItself, false);
});

// ── 5. custom fields ───────────────────────────────────────────────────────

test("a field with nothing ticked shows NOWHERE", () => {
  const defs = [{ show_on: null }, { show_on: "[]" }, { show_on: '["location_card"]' }];
  assert.equal(cm.visibleOn(defs, "location_card").length, 1,
    "absent must not mean everywhere — that is how an internal note lands on a customer's job sheet");
  assert.equal(cm.visibleOn(defs, "customer_card").length, 0);
});

test("unparseable show_on is NO targets, not all of them", () => {
  assert.deepEqual(cm.parseShowOn("not json"), []);
  assert.deepEqual(cm.parseShowOn('"location_card"'), [], "a bare string is not an array of targets");
  assert.deepEqual(cm.parseShowOn('["location_card","nonsense"]'), ["location_card"]);
});

test("the four tabs map to the API kinds the door accepts", () => {
  assert.deepEqual(cm.CUSTOM_FIELD_TABS.map((t) => t.apiKind), ["customer", "property", "job", "deal"]);
});

// ── 6. the screens do not re-answer any of it ─────────────────────────────

test("every screen that asks 'do I force the picker?' asks the one function", () => {
  const picker = read("components/customers/CustomerLocationPicker.tsx");
  assert.match(picker, /mustPickLocation\(locations\)/);
  assert.doesNotMatch(picker, /locations\.length\s*>=?\s*1/,
    "a hand-written length check beside the named gate is a second answer waiting to drift");
});

test("the contacts list draws its divider ONCE, before the first person", () => {
  const page = read("pages/spark/SparkContactsPage.tsx");
  assert.match(page, /groupHeader=\{\(row\) => \(!peopleOnlyView && customerKey\(row\) === firstPersonKey\)/,
    "a header on every person row is a divider between each of them");
  assert.match(page, /People not at a company/);
});

test("a company row carries no checkbox, and select-all reaches people only", () => {
  const page = read("pages/spark/SparkContactsPage.tsx");
  assert.match(page, /cell: c => c\.customer_kind === "company" \? null :/);
  assert.match(page, /selectablePeople[\s\S]{0,200}customer_kind === "person"/);
});

test("the roles card writes through the roles API, and removes rather than edits", () => {
  const card = read("components/customers/RolesCard.tsx");
  assert.match(card, /post\(`\$\{base\}\/people`/);
  assert.match(card, /del\(`\$\{base\}\/people\/\$\{roleId\}`\)/);
  assert.doesNotMatch(card, /patch\(`\$\{base\}\/people/,
    "the API models each role as its own row; a PATCH would be inventing one");
});

test("the location page shows the fields ticked for the LOCATION card", () => {
  const panel = read("components/customers/LocationPanel.tsx");
  assert.match(panel, /visibleOn\(fields, "location_card"\)/);
  assert.match(panel, /custom-fields\/values\/property\//,
    "`property` is the word the UI uses; the API normalises it to `location` at the door");
});

test("the create panels cannot be rendered without a way to ask where", () => {
  const panels = read("components/oliver/customer/CreatePanels.tsx");
  assert.match(panels, /subject: PanelSubject;/, "required, so the type system catches a caller that forgets");
  for (const p of ["JobCreatePanel", "QuoteCreatePanel", "InvoiceCreatePanel", "SubscriptionCreatePanel"]) {
    assert.match(panels, new RegExp(`export function ${p}\\(\\{[\\s\\S]{0,120}subject`), `${p} must take the subject`);
  }
  assert.equal((panels.match(/<WhereFor /g) || []).length, 4, "one picker per create panel, and no second implementation");
});

test("a quote may cover several sites; a job may not", () => {
  const panels = read("components/oliver/customer/CreatePanels.tsx");
  // EXACTLY ONE picker is multi. Written as a count rather than "the quote's
  // has multi", because adding `multi` to the job's picker left that phrasing
  // green — and a job with two sites is the thing section 7 point 4 forbids.
  const tags = panels.split("<WhereFor ").slice(1).map((c) => c.slice(0, c.indexOf("/>")));
  const multis = tags.filter((t) => / multi[\s/]/.test(t) || t.trimEnd().endsWith(" multi"));
  assert.equal(multis.length, 1, "only the quote covers several sites; accepting it opens one job per location");
  assert.match(multis[0], /value=\{locationIds\}/, "and it is the quote's");
  assert.match(panels, /serviceLocationIds\[0\] \? \{ service_address_id: serviceLocationIds\[0\] \}/,
    "a job = one location");
});

test("SPARK's Companies page and OLIVER's record render the SAME five cards", () => {
  const spark = read("pages/spark/SparkAccountsPage.tsx");
  const oliver = read("components/oliver/customer/CustomerModal.tsx");
  for (const card of ["BillingCard", "RolesCard", "LocationsCard", "NotesCard", "ActivityCard"]) {
    assert.match(spark, new RegExp(`<${card}`), `SPARK is missing ${card}`);
    assert.match(oliver, new RegExp(`<${card}`), `OLIVER is missing ${card}`);
  }
});

test("Companies is a destination again — the embedded mode is gone, not switched off", () => {
  const spark = read("pages/spark/SparkAccountsPage.tsx");
  // The word may still appear in the comment explaining why the mode went; what
  // must not come back is a PROP - `embedded?:`, `embedded:` or `embedded={...}`.
  assert.doesNotMatch(spark, /embedded\s*[?:=]/,
    "a switched-off second layout is a second layout somebody switches back on");
  const contacts = read("pages/spark/SparkContactsPage.tsx");
  assert.doesNotMatch(contacts, /<SparkAccountsPage/, "Contacts must not render the Companies page inside itself");
  const nav = read("components/SubNav.tsx");
  assert.match(nav, /key: "spark_accounts", label: "Companies", route: "\/app\/services\/spark_accounts" \}/,
    "un-merged: merged means folded into another surface, and this page is not");
});

test("the custom-fields page moved, and the SPARK one is deleted", () => {
  assert.equal(fs.existsSync(path.join(SRC, "pages/spark/SparkCustomFieldsPage.tsx")), false,
    "replace means delete");
  const router = read("pages/ServiceRouter.tsx");
  assert.match(router, /import\('\.\/settings\/CustomFieldsPage'\), 'CustomFieldsPage'/);
});

// test/onsite-money.test.mjs — the office side of on-site flow v1, Phase B
// (1 Oct 2026). Contract (ONSITE_FLOW_SCOPE_PLAN_2026-10-01.md, "Portal
// (office)"):
//
//   · Customer modal header and job modal: "Card on file •••• 1234" when any
//     (GET /payments/contacts/:id/methods).
//   · Portal settings window → Workflow tab: "Ask for a deposit when a quote
//     is signed: __ %" reads and writes tenant_settings.default_deposit_percent
//     through GET / PATCH /workflow-settings as `default_deposit_percent`.
//   · Invoices list: "Deposit received" on rows that have one, from the
//     GET /invoices row's `depositReceived`.
//
// DECIDED 1 Oct: the API's names are canonical and the Portal adapts. The
// agreement test below names both fields; oliver-api pins the same two.
//
// What is tested: lib/onsiteMoney.ts for real (which card is named, the
// percent box rules, the "Saved" that needs the read-back, the row deposit), and
// source pins for the badge, the two modals, the Workflow tab and the list.
//
// Run:  npm test   (node --import ./scripts/test-ts-loader.mjs --test test)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as lib from "../src/lib/onsiteMoney.ts";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const badge = read("components/oliver/customer/CardOnFileBadge.tsx");
const customerModal = read("components/oliver/customer/CustomerModal.tsx");
const jobPanel = read("components/oliver/customer/JobDetailPanel.tsx");
const hub = read("pages/oliver/OliverPortalsHubPage.tsx");
const invoices = read("pages/oliver/OliverInvoicesPage.tsx");

// ── card on file ──────────────────────────────────────────────────────────

test("methods come back unwrapped or in { data } — both read", () => {
  const rows = [{ id: "pm_1", brand: "visa", last4: "4242" }];
  assert.deepEqual(lib.readMethods(rows), rows);
  assert.deepEqual(lib.readMethods({ data: rows }), rows);
  assert.deepEqual(lib.readMethods(null), []);
  assert.deepEqual(lib.readMethods({ data: "nope" }), []);
});

test("the default card is named; else the first; a row without four digits is no card", () => {
  assert.deepEqual(lib.pickCardOnFile([
    { id: "pm_1", brand: "visa", last4: "4242" },
    { id: "pm_2", brand: "mastercard", last4: "5555", is_default: true },
  ]), { last4: "5555", brand: "mastercard" });
  assert.deepEqual(lib.pickCardOnFile([{ id: "pm_1", brand: "visa", last4: "4242" }]), { last4: "4242", brand: "visa" });
  assert.equal(lib.pickCardOnFile([]), null);
  assert.equal(lib.pickCardOnFile([{ id: "pm_1", brand: "card", last4: "" }]), null, "the API sends last4 '' for a non-card");
  assert.equal(lib.pickCardOnFile([{ id: "pm_1", last4: "424242424242" }]), null);
  // A default with no digits does not win over a real card.
  assert.deepEqual(lib.pickCardOnFile([{ id: "pm_x", last4: "", is_default: true }, { id: "pm_1", brand: "amex", last4: "0005" }]),
    { last4: "0005", brand: "amex" });
});

test("the badge's words: 'Card on file •••• 1234', the brand in the hover text", () => {
  assert.equal(lib.cardOnFileLabel({ last4: "1234", brand: "visa" }), "Card on file •••• 1234");
  assert.equal(lib.cardOnFileTitle({ last4: "1234", brand: "visa" }), "Visa ending 1234 — the card charges run against.");
  assert.equal(lib.cardOnFileTitle({ last4: "1234", brand: "card" }), "Card ending 1234 — the card charges run against.");
  assert.equal(lib.cardBrandName("amex"), "American Express");
  assert.equal(lib.CARD_CHECK_FAILED, "Could not check for a card on file.");
});

// ── default deposit percent ───────────────────────────────────────────────

test("API agreement: default_deposit_percent on /workflow-settings, depositReceived on the invoices list", () => {
  // The two names oliver-api serves (routes/workflowSettings.js GET/PATCH,
  // routes/invoices.js GET / list). Renaming either side breaks this test.
  assert.equal(lib.DEPOSIT_PERCENT_FIELD, "default_deposit_percent");
  assert.equal(lib.DEPOSIT_RECEIVED_FIELD, "depositReceived");
  // A GET /workflow-settings payload as the API sends it reads...
  assert.equal(lib.depositPercentFromSettings({ reschedule_mode: "admin_approval", default_deposit_percent: 25 }), 25);
  // ...and the Save body carries the same name back.
  assert.deepEqual(lib.depositPatchBody(25), { default_deposit_percent: 25 });
  // A GET /invoices row as the API sends it reads.
  assert.equal(lib.depositReceivedOf({ id: "i1", amount: 500, depositReceived: 125 }), 125);
  // The names that were never served are not read.
  assert.equal(lib.depositPercentFromSettings({ defaultDepositPercent: 25 }), null);
  assert.equal(lib.depositReceivedOf({ depositAmount: 125 }), null);
  // The screens use the lib, not a field name of their own.
  assert.match(hub, /get<WorkflowShape>\("\/workflow-settings"\)/);
  assert.ok(!/["'`]\/settings["'`]/.test(hub), "the Workflow tab no longer talks to /settings");
  assert.match(invoices, /depositReceived\?: number \| null;/);
  assert.ok(!/depositAmount/.test(invoices));
});

test("the stored percent reads from GET /workflow-settings", () => {
  assert.equal(lib.depositPercentFromSettings({ default_deposit_percent: 25 }), 25);
  assert.equal(lib.depositPercentFromSettings({ default_deposit_percent: "12.50" }), 12.5);
  assert.equal(lib.depositPercentFromSettings({ default_deposit_percent: null }), null, "NULL = no deposit asked");
  assert.equal(lib.depositPercentFromSettings({}), null);
  assert.equal(lib.depositPercentFromSettings(null), null);
  assert.equal(lib.depositPercentText(null), "");
  assert.equal(lib.depositPercentText(12.5), "12.5");
  assert.equal(lib.depositPercentText(25), "25");
});

test("the percent box: empty clears; 1–100; two decimals at most; a typed % is forgiven", () => {
  assert.deepEqual(lib.parseDepositPercent(""), { ok: true, value: null });
  assert.deepEqual(lib.parseDepositPercent("  "), { ok: true, value: null });
  assert.deepEqual(lib.parseDepositPercent("25"), { ok: true, value: 25 });
  assert.deepEqual(lib.parseDepositPercent("12.5%"), { ok: true, value: 12.5 });
  assert.deepEqual(lib.parseDepositPercent("100"), { ok: true, value: 100 });
  assert.deepEqual(lib.parseDepositPercent("1"), { ok: true, value: 1 });
  for (const bad of ["0", "0.5", "101", "-5", "abc", "25,5", "1e2"]) {
    const r = lib.parseDepositPercent(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.message, /\s/, `${bad}: a sentence`);
  }
  assert.match(lib.parseDepositPercent("12.345").message, /two decimal places/);
  assert.match(lib.parseDepositPercent("150").message, /between 1% and 100%/);
});

test("the PATCH /workflow-settings body: the rules, the deposit as default_deposit_percent (null to clear), no read-only field", () => {
  assert.deepEqual(lib.depositPatchBody(25), { default_deposit_percent: 25 });
  assert.deepEqual(lib.depositPatchBody(null), { default_deposit_percent: null });
  const loaded = { reschedule_mode: "admin_approval", effective_reschedule_mode: "admin_approval", reschedule_max_count: 2, default_deposit_percent: 10 };
  assert.deepEqual(lib.workflowPatchBody(loaded, 25), { reschedule_mode: "admin_approval", reschedule_max_count: 2, default_deposit_percent: 25 });
  assert.deepEqual(lib.workflowPatchBody(loaded, null), { reschedule_mode: "admin_approval", reschedule_max_count: 2, default_deposit_percent: null });
  // Reset to defaults (no deposit field at all) still sends the deposit as typed.
  assert.deepEqual(lib.workflowPatchBody({ reschedule_mode: "disabled" }, 30), { reschedule_mode: "disabled", default_deposit_percent: 30 });
});

test("'Saved' only when the read-back carries what was sent — an ignored field is said, not hidden", () => {
  assert.deepEqual(lib.depositSaveNote(25, { reschedule_mode: "admin_approval", default_deposit_percent: 25 }), {
    ok: true, text: "Saved. Customers are asked for a 25% deposit when they sign a quote.",
  });
  assert.deepEqual(lib.depositSaveNote(null, { default_deposit_percent: null }), {
    ok: true, text: "Saved. No deposit is asked for when a quote is signed.",
  });
  const ignored = lib.depositSaveNote(25, { reschedule_mode: "admin_approval" });
  assert.equal(ignored.ok, false, "a route that does not know the field must not answer Saved");
  assert.match(ignored.text, /not kept/);
  assert.equal(lib.depositSaveNote(25, { default_deposit_percent: 20 }).ok, false);
  assert.equal(lib.depositSaveNote(null, null).ok, false);
  assert.match(lib.depositSaveError(new Error('OLIVER API 400: {"error":"invalid_deposit_percent","message":"The deposit must be between 1 and 100."}')),
    /^The workflow rules were not saved: The deposit must be between 1 and 100\.$/);
});

// ── deposit received on invoice rows ──────────────────────────────────────

test("a row's deposit: a positive number only", () => {
  assert.equal(lib.depositReceivedOf({ depositReceived: 125 }), 125);
  assert.equal(lib.depositReceivedOf({ depositReceived: "62.505" }), 62.51);
  for (const v of [0, null, undefined, "", "abc", -10]) {
    assert.equal(lib.depositReceivedOf({ depositReceived: v }), null, String(v));
  }
  assert.equal(lib.depositReceivedOf({}), null);
  assert.equal(lib.depositReceivedLabel(1250), "Deposit received $1,250.00");
});

// ── the wiring ────────────────────────────────────────────────────────────

test("badge: reads the methods list once per contact; nothing while loading or with no card; a sentence on failure", () => {
  assert.match(badge, /api\.get<unknown>\(`\/payments\/contacts\/\$\{contactId\}\/methods`\)/);
  assert.match(badge, /setCard\(pickCardOnFile\(readMethods\(r\)\)\)/);
  assert.match(badge, /\.catch\(\(\) => \{ if \(live\) setFailed\(true\); \}\)/);
  assert.match(badge, /\{CARD_CHECK_FAILED\}/);
  assert.match(badge, /if \(!card\) return null;/);
  assert.match(badge, /\{cardOnFileLabel\(card\)\}/);
  assert.match(badge, /\}, \[contactId, api\]\);/);
});

test("badge: takes the dark header's foreground, ink elsewhere — never a hard-coded ink in a header", () => {
  assert.match(badge, /color: "var\(--iadm-head-fg, #0B1C24\)"/);
  assert.match(badge, /border: "1px solid var\(--iadm-head-btn-border, /);
  assert.ok(!/color: "#0B1C24"/.test(badge));
});

test("customer modal header and job modal both carry the badge", () => {
  assert.match(customerModal, /import \{ CardOnFileBadge \} from "\.\/CardOnFileBadge";/);
  assert.match(customerModal, /headerActions=\{detail \? \([\s\S]{0,600}<CardOnFileBadge contactId=\{customerId \|\| detail\.contact_id \|\| null\} api=\{api\} \/>/);
  // + New job still needs an OLIVER contact.
  assert.match(customerModal, /\{customerId && \(\s*<Button variant="primary" onClick=\{\(\) => \{ setTab\("jobs"\)/);
  assert.match(jobPanel, /<CardOnFileBadge contactId=\{job\.contactId\} api=\{p\.api\} \/>/);
});

test("Workflow tab: the deposit box, loaded with GET /workflow-settings, saved on the same PATCH, read back before 'Saved'", () => {
  assert.match(hub, /Ask for a deposit when a quote is signed:/);
  assert.match(hub, /const v = depositPercentFromSettings\(r\);\s*setDepositStored\(v\);\s*setDepositText\(depositPercentText\(v\)\);/);
  assert.match(hub, /const deposit = parseDepositPercent\(depositText\);\s*if \(!deposit\.ok\) \{ setSavedOk\(false\); setSavedMsg\(deposit\.message\); return; \}/);
  // Phase C adds the completion switch to the same body (test/onsite-job.test.mjs).
  assert.match(hub, /await patch\("\/workflow-settings", \{ \.\.\.workflowPatchBody\(wf, deposit\.value\),/);
  assert.match(hub, /const back = await get<WorkflowShape>\("\/workflow-settings"\);\s*note = depositSaveNote\(deposit\.value, back\);/);
  assert.match(hub, /default_deposit_percent\?: number \| null[;}]/);
  // A failed load disables the box instead of offering to overwrite it with empty.
  assert.match(hub, /disabled=\{depositStored === undefined \|\| saving\}/);
  // Errors are red, not the success green.
  assert.match(hub, /savedOk \? "text-emerald-700" : "text-red-700"/);
});

test("Invoices list: 'Deposit received' under the amount on rows that have one", () => {
  assert.match(invoices, /import \{ depositReceivedOf, depositReceivedLabel \} from "\.\.\/\.\.\/lib\/onsiteMoney";/);
  assert.match(invoices, /const deposit = depositReceivedOf\(r\);/);
  assert.match(invoices, /\{deposit !== null && \(/);
  assert.match(invoices, /\{depositReceivedLabel\(deposit\)\}/);
  assert.match(invoices, /depositReceived\?: number \| null;/);
});

test("nothing here names a card number or a cost", () => {
  for (const [name, src] of [["onsiteMoney", read("lib/onsiteMoney.ts")], ["CardOnFileBadge", badge]]) {
    assert.ok(!/card_number|cardNumber|\bcvc\b/i.test(src), name);
    assert.ok(!/console\.(log|info|debug)/.test(src), name);
  }
});

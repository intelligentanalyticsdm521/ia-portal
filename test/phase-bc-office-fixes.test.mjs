// test/phase-bc-office-fixes.test.mjs — the office (Portal) half of the
// on-site Phase B + C pane walk, 1 Oct 2026 (phase_bc_defects.md):
//
//   B3  job window header "Total:" and Financials "Job total" print the
//       server's job total with cents ("$643.5" → "$643.50"); the total itself
//       is the agreed total the API sends (quote + accepted change orders).
//   B4  a declined change order's row says "Declined — <the customer's reason>".
//   W4  the worker window's ON SITE help names tick boxes, not switches.
//   M4  Workflow tab: "Saved…" stays until the next edit; a red error clears
//       when the value changes.
//   M7  the change-order editor's Service box keeps a readable width.
//   M8  no "New change order" / "+ Create invoice" on a completed, invoiced job.
//   M10 the $0 "Change order: …" line is a header on the invoice view.
//   M12 one GET /payments/contacts/:id/methods per customer open.
//
// Run:  npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as lib from "../src/lib/onsiteJob.ts";
import * as cm from "../src/lib/cardMethods.ts";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const panel = read("components/oliver/customer/JobDetailPanel.tsx");
const card = read("components/oliver/customer/ChangeOrdersCard.tsx");
const picker = read("components/oliver/CatalogLineItemPicker.tsx");
const hub = read("pages/oliver/OliverPortalsHubPage.tsx");
const workers = read("pages/oliver/OliverWorkersPage.tsx");
const invoices = read("pages/oliver/OliverInvoicesPage.tsx");
const badge = read("components/oliver/customer/CardOnFileBadge.tsx");
const methodsCard = read("components/oliver/customer/PaymentMethodsCard.tsx");

function workflowTab() {
  const i = hub.indexOf("function WorkflowTabStub");
  assert.ok(i > 0);
  return hub.slice(i);
}

// ── B3 ────────────────────────────────────────────────────────────────────

test("B3: job money always prints cents", () => {
  assert.equal(lib.jobMoney(643.5), "$643.50");
  assert.equal(lib.jobMoney(455.81), "$455.81");
  assert.equal(lib.jobMoney(1200), "$1,200.00");
  assert.equal(lib.jobMoney(0), "$0.00");
  assert.equal(lib.jobMoney(null), "$0.00");
  assert.equal(lib.jobMoney(-12), "−$12.00");
});

test("B3: the header Total and Financials Job total print the server's job total through jobMoney", () => {
  assert.match(panel, /const fmtMoney = jobMoney;/);
  assert.match(panel, /Total: <strong>\{fmtMoney\(job\.total\)\}<\/strong>/);
  assert.match(panel, /<SummaryRow label="Job total" value=\{fmtMoney\(job\.total\)\} bold \/>/);
  assert.doesNotMatch(panel, /minimumFractionDigits: 0/, "no money on the job window prints without cents");
  assert.doesNotMatch(panel, /laborCost\.toLocaleString\(\)|Math\.abs\(profit\)\.toLocaleString\(\)|revenue\.toLocaleString\(\)/);
});

// ── B4 ────────────────────────────────────────────────────────────────────

test("B4: the decline reason is read from the API row (decline_reason, migration 228)", () => {
  const row = lib.readChangeOrder({ change_order_id: "C1", status: "declined", reason: "Add the spring cleanup", decline_reason: "Not this season, maybe next spring", declined_at: "2026-10-01T20:10:28Z" });
  assert.equal(row.declineReason, "Not this season, maybe next spring");
  assert.equal(lib.readChangeOrder({ id: "C2", status: "declined" }).declineReason, null);
  assert.equal(lib.readChangeOrder({ id: "C3", status: "declined", declineReason: "camel too" }).declineReason, "camel too");
});

test("B4: the row says 'Declined — <reason>', or 'Declined' with none, and nothing for other statuses", () => {
  assert.equal(lib.changeOrderDeclinedLine({ status: "declined", declineReason: "Not this season, maybe next spring" }),
    "Declined — Not this season, maybe next spring");
  assert.equal(lib.changeOrderDeclinedLine({ status: "declined", declineReason: null }), "Declined");
  assert.equal(lib.changeOrderDeclinedLine({ status: "accepted", declineReason: "x" }), null);
  assert.match(card, /const declined = changeOrderDeclinedLine\(row\);/);
  assert.match(card, /data-testid="change-order-declined"/);
  assert.match(card, /\{declined\}\{row\.decidedAt \?/);
});

// ── W4 ────────────────────────────────────────────────────────────────────

test("W4: the ON SITE help names the tick boxes it sits over", () => {
  assert.match(workers, /Each box saves when you tick or untick it\./);
  assert.doesNotMatch(workers, /Each switch saves when you flip it/);
  const panelSrc = workers.slice(workers.indexOf("function CrewPermissionsPanel"));
  assert.doesNotMatch(panelSrc.slice(0, 4000), /role="switch"/, "a tick box is announced as a tick box");
});

// 2026-10-08: the help used to end "Owners and admins can always do all four."
// That was true of the code and WRONG IN EFFECT - crewPermissions()
// short-circuited on an admin role that every user has, so the four boxes did
// nothing for anybody (oliver-api 370ae33). A box that is set is now obeyed for
// everyone, so the sentence had to change with it or the screen would lie the
// other way round.
test("W4b: the ON SITE help does not promise that admins override the boxes", () => {
  // Scoped to the words on the SCREEN. The comment above the panel quotes the
  // old sentence on purpose, to record what changed and why.
  const help = workers.slice(workers.indexOf("may do on the tablet"), workers.indexOf("may do on the tablet") + 400);
  assert.match(help, /Once you set a box it holds for everyone, owners and admins included\./);
  assert.doesNotMatch(help, /can always do all four/, "the old promise is gone from the screen");
  assert.doesNotMatch(help, /Owners and admins can always/);
});

// ── M4 ────────────────────────────────────────────────────────────────────

test("M4: the Workflow tab's message is not cleared by a timer", () => {
  assert.doesNotMatch(workflowTab(), /setTimeout\(\(\) => setSavedMsg\(null\)/);
});

test("M4: any edit in the Workflow tab clears the last message (a corrected box loses its red sentence)", () => {
  assert.match(workflowTab(), /<div className="space-y-4" onChange=\{\(\) => setSavedMsg\(null\)\} data-testid="workflow-tab">/);
  assert.match(workflowTab(), /window\.confirm\("Reset workflow rules[^\n]*\n\s*setSavedMsg\(null\);/);
});

// ── M7 ────────────────────────────────────────────────────────────────────

test("M7: the change-order editor drops the Discount column and the Service box keeps a readable width", () => {
  assert.match(card, /<CatalogLineItemPicker items=\{adds\} onChange=\{setAdds\} hideDiscount \/>/);
  assert.match(picker, /export const SERVICE_MIN_WIDTH = (\d+);/);
  assert.ok(Number(picker.match(/SERVICE_MIN_WIDTH = (\d+)/)[1]) >= 160);
  assert.match(picker, /minWidth: SERVICE_MIN_WIDTH/);
  assert.match(picker, /<div style=\{\{ overflowX: "auto" \}\} data-testid="line-items-scroll">/);
  assert.match(picker, /\{!hideDiscount && <th[^>]*>Discount<\/th>\}/);
  assert.match(picker, /colSpan=\{hideDiscount \? 3 : 4\}/);
});

// ── M8 ────────────────────────────────────────────────────────────────────

test("M8: change orders only where the API takes them (changeable status, no live invoice)", () => {
  for (const s of ["scheduled", "dispatched", "assigned", "in_progress"]) {
    assert.equal(lib.jobTakesChangeOrders({ status: s, invoices: [] }), true, s);
  }
  for (const s of ["completed", "invoiced", "paid", "cancelled", "quoted", "inquiry"]) {
    assert.equal(lib.jobTakesChangeOrders({ status: s, invoices: [] }), false, s);
  }
  assert.equal(lib.jobTakesChangeOrders({ status: "in_progress", invoices: [{ status: "draft" }] }), false);
  assert.equal(lib.jobTakesChangeOrders({ status: "in_progress", invoices: [{ status: "void" }] }), true, "a void invoice does not count");
  assert.deepEqual([...lib.CHANGEABLE_JOB_STATUSES], ["scheduled", "dispatched", "assigned", "in_progress"]);
});

test("M8: '+ Create invoice' is not offered on a job that is finished and invoiced", () => {
  assert.equal(lib.jobOffersCreateInvoice({ status: "completed", invoices: [{ status: "draft" }] }), false);
  assert.equal(lib.jobOffersCreateInvoice({ status: "invoiced", invoices: [] }), false);
  assert.equal(lib.jobOffersCreateInvoice({ status: "paid", invoices: [{ status: "paid" }] }), false);
  assert.equal(lib.jobOffersCreateInvoice({ status: "completed", invoices: [] }), true);
  assert.equal(lib.jobOffersCreateInvoice({ status: "completed", invoices: [{ status: "cancelled" }] }), true);
  assert.equal(lib.jobOffersCreateInvoice({ status: "in_progress", invoices: [] }), true);
});

test("M8: the job window uses both rules", () => {
  assert.match(panel, /\{jobOffersCreateInvoice\(job\) && \(\s*<Button variant="secondary" onClick=\{\(\) => navigate\(`\/app\/services\/oliver_invoices\?from_job=/);
  assert.match(panel, /disabled=\{p\.isTerminal \|\| !jobTakesChangeOrders\(job\)\}/);
  assert.match(card, /\{!editing && !disabled && \(\s*<Button variant="secondary" onClick=\{openEditor\}>New change order<\/Button>/);
});

// ── M10 ───────────────────────────────────────────────────────────────────

test("M10: the invoice view draws the change-order line as a header, in both layouts", () => {
  assert.equal((invoices.match(/isChangeOrderHeader\(li\) \? \(\s*<ChangeOrderHeaderRow key=\{li\.line_item_id\} description=\{li\.description\} \/>/g) || []).length, 2);
  assert.match(invoices, /function ChangeOrderHeaderRow/);
  assert.equal(lib.isChangeOrderHeader({ description: "Change order: Weekly mowing", unit_price: 0, line_total: 0 }), true);
  assert.equal(lib.isChangeOrderHeader({ description: "Weekly Mowing", unit_price: 65, line_total: 65 }), false);
});

// ── M12 ───────────────────────────────────────────────────────────────────

test("M12: readers that ask together share one request", async () => {
  cm._resetMethodsCache();
  let calls = 0;
  const paths = [];
  const get = async (p) => { calls++; paths.push(p); return { data: [] }; };
  const t = 1_000_000;
  await Promise.all([cm.fetchMethodsOnce(get, "C1", t), cm.fetchMethodsOnce(get, "C1", t + 1), cm.fetchMethodsOnce(get, "C1", t + 2), cm.fetchMethodsOnce(get, "C1", t + 3)]);
  assert.equal(calls, 1, "four readers in one open → one request");
  await cm.fetchMethodsOnce(get, "C1", t + cm.METHODS_SHARE_MS + 1);
  assert.equal(calls, 2, "a later open reads again");
  await cm.fetchMethodsOnce(get, "C2", t);
  assert.equal(calls, 3, "another customer is its own read");
  assert.deepEqual(paths, ["/payments/contacts/C1/methods", "/payments/contacts/C1/methods", "/payments/contacts/C2/methods"]);
});

test("M12: a failed read is not shared; a changed card list is read again and every reader is told", async () => {
  cm._resetMethodsCache();
  let calls = 0;
  const bad = async () => { calls++; throw new Error("down"); };
  await assert.rejects(cm.fetchMethodsOnce(bad, "C1", 1));
  await new Promise((r) => setImmediate(r));
  await assert.rejects(cm.fetchMethodsOnce(bad, "C1", 2));
  assert.equal(calls, 2);

  cm._resetMethodsCache();
  calls = 0;
  const good = async () => { calls++; return []; };
  await cm.fetchMethodsOnce(good, "C1", 1);
  let told = 0;
  const off = cm.onMethodsChanged("C1", () => { told++; });
  cm.methodsChanged("C1");
  assert.equal(told, 1);
  await cm.fetchMethodsOnce(good, "C1", 2);
  assert.equal(calls, 2, "after a change the list is read again");
  off();
  cm.methodsChanged("C1");
  assert.equal(told, 1);
});

test("M12: the badge and the Payment methods card both read through the shared read, keyed on the customer", () => {
  for (const [name, src] of [["badge", badge], ["methods card", methodsCard]]) {
    assert.match(src, /fetchMethodsOnce\(apiRef\.current\.get, /, name);
    assert.doesNotMatch(src, /api\.get<[^>]*>\(`\/payments\/contacts\/\$\{\w+\}\/methods`\)/, `${name} still reads the list itself`);
  }
  assert.match(methodsCard, /\}, \[customerId\]\);/, "the card's read is not keyed on the api object");
  assert.match(badge, /\}, \[contactId, round\]\);/);
  assert.match(methodsCard, /onAdded=\{\(\) => \{ setAddOpen\(false\); changed\(\); \}\}/);
});

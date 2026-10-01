// test/onsite-job.test.mjs — the office side of on-site flow v1, Phase C
// (1 Oct 2026). Contract (ONSITE_FLOW_SCOPE_PLAN_2026-10-01.md, "Phase C"):
//
//   · Job modal → Line items tab: change orders listed (reason, lines added /
//     taken off, the change in price, status, signed by / at) and "New change
//     order" posting to POST /jobs/:id/change-orders.
//   · Portal settings window → Workflow tab: "Ask the customer to sign when a
//     job is finished", ON by default, on GET / PATCH /workflow-settings as
//     `require_completion_signature`; off shows the notice.
//   · Workers → a worker's card: "Can quote on site", "Can send quotes",
//     "Can add custom lines", "Can take payment" through PATCH /workers/:id.
//
// DECIDED 1 Oct: the API's names are canonical. The agreement pins below name
// every field; oliver-api pins the same names.
//
// Run:  npm test   (node --import ./scripts/test-ts-loader.mjs --test test)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as lib from "../src/lib/onsiteJob.ts";

const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const card = read("components/oliver/customer/ChangeOrdersCard.tsx");
const jobPanel = read("components/oliver/customer/JobDetailPanel.tsx");
const hub = read("pages/oliver/OliverPortalsHubPage.tsx");
const workers = read("pages/oliver/OliverWorkersPage.tsx");
const libSrc = read("lib/onsiteJob.ts");

// ── the agreement with the API (field names) ──────────────────────────────

test("agreement: the API's names, named once", () => {
  assert.equal(lib.COMPLETION_SIGNATURE_FIELD, "require_completion_signature");
  assert.deepEqual(lib.CREW_PERMISSIONS.map((p) => p.key), ["can_quote", "can_send_quotes", "can_quote_custom", "can_charge"]);
  assert.equal(lib.changeOrdersPath("J1"), "/jobs/J1/change-orders");
});

test("the four switches carry Brandon's words", () => {
  assert.deepEqual(lib.CREW_PERMISSIONS.map((p) => p.label),
    ["Can quote on site", "Can send quotes", "Can add custom lines", "Can take payment"]);
  assert.match(lib.CREW_PERMISSIONS[0].help, /prices, never your costs/);
});

// ── change orders: reading ────────────────────────────────────────────────

test("a change order row reads snake case: reason, lines, delta, status, signature", () => {
  const r = lib.readChangeOrder({
    change_order_id: "CO1", status: "accepted", reason: "Back fence too", total: -40, created_at: "2026-10-01T15:00:00Z",
    accepted_at: "2026-10-01T16:00:00Z",
    lines: [
      { kind: "add", description: "Fence line", quantity: 2, unit_price: 30, line_total: 60 },
      { kind: "remove", description: "Hedge trim", quantity: 1, unit_price: 100, line_total: 100 },
    ],
    signature: { signer_name: "Dana Reyes", signed_at: "2026-10-01T16:00:00Z" },
    customer_link: "https://x/p/change-orders/T",
  });
  assert.equal(r.id, "CO1");
  assert.equal(r.status, "accepted");
  assert.equal(r.reason, "Back fence too");
  assert.equal(r.delta, -40);
  assert.equal(r.lines.length, 2);
  assert.deepEqual(r.lines[1], { kind: "remove", description: "Hedge trim", quantity: 1, unitPrice: 100, lineTotal: 100 });
  assert.equal(r.signedBy, "Dana Reyes");
  assert.equal(r.signedAt, "2026-10-01T16:00:00Z");
  assert.equal(r.customerLink, "https://x/p/change-orders/T");
});

test("camel case and flat signature fields read too; the delta is worked out when the total is missing", () => {
  const r = lib.readChangeOrder({
    changeOrderId: "CO2", status: "presented", reason: "Extra",
    lineItems: [{ kind: "add", description: "Mulch", quantity: 3, unitPrice: 10 }, { kind: "remove", description: "Edging", lineTotal: 12 }],
    signer_name: null,
  });
  assert.equal(r.id, "CO2");
  assert.equal(r.lines[0].lineTotal, 30, "quantity × unit price when no line total");
  assert.equal(r.delta, 18, "added 30 less removed 12");
  assert.equal(r.signedBy, null);
});

test("the list: unwrapped, { data }, or { data: { change_orders } }; newest first; junk dropped", () => {
  const rows = [
    { change_order_id: "A", created_at: "2026-10-01T10:00:00Z" },
    { change_order_id: "B", created_at: "2026-10-01T12:00:00Z" },
    { nope: true },
  ];
  assert.deepEqual(lib.readChangeOrders(rows).map((r) => r.id), ["B", "A"]);
  assert.deepEqual(lib.readChangeOrders({ data: rows }).map((r) => r.id), ["B", "A"]);
  assert.deepEqual(lib.readChangeOrders({ data: { change_orders: rows } }).map((r) => r.id), ["B", "A"]);
  assert.deepEqual(lib.readChangeOrders(null), []);
  assert.deepEqual(lib.readChangeOrders({ data: "x" }), []);
});

test("status in plain words, signed line, signed money", () => {
  assert.equal(lib.changeOrderStatusLabel("presented"), "Waiting for the customer");
  assert.equal(lib.changeOrderStatusLabel("void"), "Cancelled");
  assert.equal(lib.changeOrderStatusLabel("accepted"), "Accepted");
  assert.equal(lib.changeOrderSignedLine({ signedBy: null, signedAt: null }), null);
  assert.equal(lib.changeOrderSignedLine({ signedBy: "Dana", signedAt: null }), "Signed by Dana");
  assert.match(lib.changeOrderSignedLine({ signedBy: "Dana", signedAt: "2026-10-01T16:00:00Z" }, "en-US"), /^Signed by Dana on .*2026/);
  assert.equal(lib.deltaLabel(120), "+$120.00");
  assert.equal(lib.deltaLabel(-40.5), "−$40.50");
  assert.equal(lib.deltaLabel(0), "$0.00");
  assert.equal(lib.money(1234.5), "$1,234.50");
});

// ── change orders: the editor ─────────────────────────────────────────────

const add = (o = {}) => ({ description: "Fence line", quantity: 2, unit_price: 30, ...o });

test("the change in price: added lines less the lines taken off (discounts on job lines honoured)", () => {
  assert.equal(lib.changeOrderDelta([add()], []), 60);
  assert.equal(lib.changeOrderDelta([add()], [{ id: "L1", description: "Hedge", quantity: 1, unit_price: 100 }]), -40);
  assert.equal(lib.changeOrderDelta([], [{ id: "L1", description: "Hedge", quantity: 1, unit_price: 100, discount_type: "percent", discount_value: 10 }]), -90);
});

test("Save checks: a reason, at least one line, sane quantities and prices, no discounts, 12 lines at most", () => {
  assert.match(lib.changeOrderProblem("", [add()], []), /why the job is changing/);
  assert.match(lib.changeOrderProblem("x".repeat(501), [add()], []), /500/);
  assert.match(lib.changeOrderProblem("More work", [], []), /Add a line or tick/);
  assert.match(lib.changeOrderProblem("More work", [add({ description: "ab" })], []), /3 to 200/);
  assert.match(lib.changeOrderProblem("More work", [add({ quantity: 0 })], []), /0.25 and 999/);
  assert.match(lib.changeOrderProblem("More work", [add({ unit_price: -1 })], []), /unit price/);
  assert.match(lib.changeOrderProblem("More work", [add({ discount_type: "percent", discount_value: 5 })], []), /cannot carry a discount/);
  assert.match(lib.changeOrderProblem("More work", Array.from({ length: 13 }, () => add()), []), /12 lines/);
  assert.equal(lib.changeOrderProblem("More work", [add()], []), null);
  assert.equal(lib.changeOrderProblem("Take the hedge off", [], ["L1"]), null);
});

test("the POST body: reason + typed add lines at the office's price (no offering_id, so the API never re-prices) + remove lines by job_line_item_id", () => {
  const body = lib.changeOrderBody("  Back fence  ", [add({ service_offering_id: "OFF1", unit_price: 30.005 }), add({ description: "Haul away", quantity: 1, unit_price: 45 })], ["L9"]);
  assert.deepEqual(body, {
    reason: "Back fence",
    lines: [
      { kind: "add", description: "Fence line", quantity: 2, unit_price: 30.01 },
      { kind: "add", description: "Haul away", quantity: 1, unit_price: 45 },
      { kind: "remove", job_line_item_id: "L9" },
    ],
  });
});

test("the agreed lines a change may take off come from the same GET, by line_item_id; the server's line total wins", () => {
  const resp = { agreed_lines: [{ line_item_id: "Q1", description: "Mow", quantity: 1, unit_price: 80, line_total: 72 }, { description: "no id" }], agreed_total: 72, change_orders: [] };
  assert.deepEqual(lib.readAgreedLines(resp), [{ id: "Q1", description: "Mow", quantity: 1, unit_price: 80, line_total: 72 }]);
  assert.deepEqual(lib.readAgreedLines({ data: resp }).map((l) => l.id), ["Q1"]);
  assert.deepEqual(lib.readAgreedLines([]), []);
  assert.equal(lib.changeOrderDelta([], lib.readAgreedLines(resp)), -72, "the agreed line's own total, not 1 × 80");
  assert.equal(lib.presentChangeOrderPath("J1", "CO1"), "/jobs/J1/change-orders/CO1/present");
});

test("saved note: a draft until opened for signing; errors are sentences", () => {
  assert.match(lib.changeOrderSavedNote({}), /draft/);
  assert.match(lib.changeOrderSavedNote({}), /Open for the customer to sign/);
  assert.match(lib.PRESENTED_NOTE, /signing link/);
  assert.match(lib.changeOrderError("present", new Error("x")), /^The change order was not opened for signing/);
  assert.match(lib.changeOrderError("save", new Error("OLIVER API 400: {\"error\":\"bad\",\"message\":\"Reason is required.\"}")), /^The change order was not saved: Reason is required\./);
  assert.match(lib.changeOrderError("load", new Error("boom")), /^Could not load the change orders/);
});

// ── completion signature setting ──────────────────────────────────────────

test("the setting reads true / false from the API, null when it is not sent", () => {
  assert.equal(lib.completionSignatureFromSettings({ require_completion_signature: true }), true);
  assert.equal(lib.completionSignatureFromSettings({ require_completion_signature: 0 }), false);
  assert.equal(lib.completionSignatureFromSettings({ require_completion_signature: false }), false);
  assert.equal(lib.completionSignatureFromSettings({}), null);
  assert.equal(lib.completionSignatureFromSettings(null), null);
});

test("sent only when known; 'Saved' only when the read-back carries it", () => {
  assert.deepEqual(lib.completionPatchPart(null), {});
  assert.deepEqual(lib.completionPatchPart(false), { require_completion_signature: false });
  assert.equal(lib.completionSaveProblem(false, { require_completion_signature: false }), null);
  assert.match(lib.completionSaveProblem(false, { require_completion_signature: true }), /not kept/);
  assert.match(lib.completionSaveProblem(true, {}), /not kept/);
  assert.equal(lib.completionSaveProblem(null, {}), null);
  assert.equal(lib.completionSavedSentence(true), "Customers are asked to sign when a job is finished.");
  assert.equal(lib.completionSavedSentence(false), "Customers are not asked to sign when a job is finished.");
});

test("the off notice is one plain sentence (Brandon's words)", () => {
  assert.equal(lib.COMPLETION_OFF_NOTICE,
    "We don't recommend turning this off: a signed completion is what settles a dispute about the work.");
  assert.equal((lib.COMPLETION_OFF_NOTICE.match(/\./g) || []).length, 1);
});

// ── crew permissions ──────────────────────────────────────────────────────

test("a worker row's switches: booleans or bits; null when not sent; the { data } envelope too", () => {
  assert.deepEqual(lib.readCrewPermissions({ can_quote: true, can_send_quotes: 0, can_quote_custom: 1, can_charge: false }),
    { can_quote: true, can_send_quotes: false, can_quote_custom: true, can_charge: false });
  assert.deepEqual(lib.readCrewPermissions({ data: { can_quote: true } }),
    { can_quote: true, can_send_quotes: null, can_quote_custom: null, can_charge: null });
  assert.deepEqual(lib.readCrewPermissions(null),
    { can_quote: null, can_send_quotes: null, can_quote_custom: null, can_charge: null });
});

test("one switch = one PATCH field; 'Saved' only when the answer carries it", () => {
  assert.deepEqual(lib.permissionPatchBody("can_charge", true), { can_charge: true });
  assert.deepEqual(lib.permissionSaveNote("can_charge", true, { can_charge: true }, "Marcus"), { ok: true, text: "Saved. Marcus can take payment." });
  assert.deepEqual(lib.permissionSaveNote("can_quote", false, { data: { can_quote: false } }, ""), { ok: true, text: "Saved. This worker can no longer quote on site." });
  const bad = lib.permissionSaveNote("can_send_quotes", true, { first_name: "Marcus" }, "Marcus");
  assert.equal(bad.ok, false);
  assert.match(bad.text, /"Can send quotes" was not kept/);
  assert.match(lib.permissionLoadError(new Error("x")), /^Could not read this worker's crew app permissions/);
});

// ── wiring pins ───────────────────────────────────────────────────────────

test("job modal: the change orders card sits under the line items and is given the saved lines", () => {
  assert.match(jobPanel, /import \{ ChangeOrdersCard \} from "\.\/ChangeOrdersCard"/);
  assert.match(jobPanel, /tab === "lines" && \(\s*<ChangeOrdersCard/);
  assert.match(jobPanel, /savedLineItems=\{originalLineItems\}/);
  assert.match(jobPanel, /jobLines=\{p\.savedLineItems\}/);
});

test("change orders card: removals name the agreed lines from the GET; a draft opens for signing; the link is offered only once open", () => {
  assert.match(card, /setAgreed\(readAgreedLines\(r\)\)/);
  assert.match(card, /const removable: JobLine\[\] = agreed\.length \? agreed : jobLines\.filter/);
  assert.match(card, /api\.post<unknown>\(presentChangeOrderPath\(jobId, row\.id\), \{\}\)/);
  assert.match(card, /row\.status === "draft" && !disabled && \(/);
  assert.match(card, />?\s*\{presenting === row\.id \? "Opening…" : "Open for the customer to sign"\}/);
  assert.match(card, /row\.customerLink && row\.status === "presented" && \(/);
});

test("change orders card: GET and POST on the office route, the same line editor, every listed field shown", () => {
  assert.match(card, /api\.get<unknown>\(changeOrdersPath\(jobId\)\)/);
  assert.match(card, /api\.post<unknown>\(changeOrdersPath\(jobId\), changeOrderBody\(reason, adds, removeIds\)\)/);
  assert.match(card, /<CatalogLineItemPicker items=\{adds\} onChange=\{setAdds\}/);
  assert.match(card, />New change order</);
  assert.match(card, /changeOrderProblem\(reason, adds, removeIds\)/);
  for (const shown of ["row.reason", "changeOrderStatusLabel(row.status)", "deltaLabel(row.delta)", "changeOrderSignedLine(row)", "l.kind === \"remove\""]) {
    assert.ok(card.includes(shown), shown);
  }
  // A failure is said, never swallowed into an empty list without a word.
  assert.match(card, /setLoadErr\(changeOrderError\("load", e\)\)/);
  assert.match(card, /setProblem\(changeOrderError\("save", e\)\)/);
});

test("Workflow tab: the completion switch loads from GET, rides the same PATCH, is read back, and shows the notice when off", () => {
  assert.match(hub, /setCompletion\(completionSignatureFromSettings\(r\)\)/);
  assert.match(hub, /patch\("\/workflow-settings", \{ \.\.\.workflowPatchBody\(wf, deposit\.value\), \.\.\.completionPatchPart\(completion \?\? null\) \}\)/);
  assert.match(hub, /completionSaveProblem\(completion \?\? null, back\)/);
  assert.match(hub, /Ask the customer to sign when a job is finished/);
  assert.match(hub, /completion === false && \(/);
  assert.match(hub, /\{COMPLETION_OFF_NOTICE\}/);
  // ON by default: the box is ticked unless the server said false.
  assert.match(hub, /checked=\{completion !== false\}/);
});

test("worker card: four switches, each a PATCH /workers/:id of its own, read from GET /workers/:id", () => {
  assert.match(workers, /<CrewPermissionsPanel workerId=\{worker\.id\}/);
  assert.match(workers, /api\.get<unknown>\(`\/workers\/\$\{workerId\}`\)/);
  assert.match(workers, /api\.patch<unknown>\(`\/workers\/\$\{workerId\}`, permissionPatchBody\(key, value\)\)/);
  assert.match(workers, /permissionSaveNote\(key, value, resp, firstName\)/);
  assert.match(workers, /CREW_PERMISSIONS\.map/);
});

test("nothing here shows a cost", () => {
  for (const [name, src] of [["card", card], ["lib", libSrc]]) {
    assert.ok(!/\bcost\b|unit_cost|unitCost/i.test(src.replace(/never your costs/g, "")), name);
    assert.ok(!/console\.(log|info|debug)/.test(src), name);
  }
});

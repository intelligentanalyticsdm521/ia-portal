// The STELLA Inbox can be cleared once a week in a couple of minutes.
//
// The owner, 2 Oct 2026: "STELLA needs some work. I couldn't figure out the
// categories or a way to categorize anything, and there needs to be a bulk
// editor. Like 90% of that stuff on my account is personal. I'd like to be
// able to once a week go in and just hit bulk assign button and it allows me
// to check multiple items then assign it to a category or personal item."
//
// Measured that day: 317 lines from a personal card, no categories, every
// picker greyed with no reason, the page loading the newest 50 and calling
// that the count, a browser confirm() per Personal, and money-in lines that
// could never be marked Personal.
//
// What has to stay true:
//   • Bulk assign: a checkbox per row, shift-click selects a range in the
//     order shown, "Select all N shown", a count, and ONE bar with "Assign N to
//     this category" and "Mark N personal" — each one POST
//     /ledger/transactions/bulk per 200 ids, with the exact contract body
//   • the answer is said in one line from the per-row messages; rows Personal
//     does not apply to are counted, never dropped silently
//   • never a dead control: no categories / failed read → words + a link
//   • the header count is pagination.total, 100 loaded at a time, "Show N more"
//   • single Personal is immediate with Undo; Undo PATCHes the old status back
//   • bulk Personal asks once, in the page, naming the count — no browser box
//   • "category", not "account", on the Inbox
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · canMarkPersonal — ignore can_mark_personal (direction only)   → "money in from a personal card …" RED
//   · plainReason — show a 5xx error's message                      → "a server failure never puts …" RED
//   · clickRow — range over the selection order, not the shown order → "shift-click selects every row …" RED
//   · selectedShown — return every selected id                      → "a selected row hidden by the search …" RED
//   · bulkBody — drop coa_account_id                                → "the categorize body is exactly …" RED
//   · sendBulk — keep sending after a failed batch                  → "a failed batch stops the sending …" RED
//   · undoPersonalBody — always needs_categorization                → "Undo puts a flagged line back …" RED
//   · queueLine — count the loaded rows                             → "the count is the API's total …" RED
//   · readInboxEnvelope — ignore pagination.total                   → "the total comes from pagination …" RED
//   · bulkResultSentence — drop the skipped clause                  → "skipped money-in lines are counted …" RED
//   · page — put a bare confirm( back in markPersonal               → "no browser box anywhere …" RED
//   · page — the old `|| !activeCoa.length` greyed picker           → "the picker is never greyed …" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import {
  INBOX_PAGE_SIZE, BULK_MAX, BULK_PATH, EMPTY_SELECTION, MONEY_IN_PERSONAL_RULE,
  canMarkPersonal, plainReason, personalSplit, clickRow, selectAllShown, allShownSelected, selectedShown,
  bulkBody, chunkIds, mergeAnswers, succeededIds, sendBulk, refusalGroups, bulkResultSentence,
  bulkPersonalQuestion, queueLine, moreToLoad, readInboxEnvelope, mergePage, undoPersonalBody,
  categoryProblem,
} from "../src/pages/stella/inboxBulk.ts";
import { InboxBulkBar, CategoryNote } from "../src/pages/stella/InboxBulkBar.tsx";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("pages/stella/StellaLedgerInboxPage.tsx");
const TABLE = read("components/oliver/ui/DataTable.tsx");

// Code only — comments may name what used to be there.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const out = (id, extra = {}) => ({ transaction_id: id, direction: "outflow", status: "needs_categorization", ...extra });
const inn = (id, extra = {}) => ({ transaction_id: id, direction: "inflow", status: "needs_categorization", ...extra });
const sel = (ids, anchor = null) => ({ ids: new Set(ids), anchor });
const ids = (s) => [...s.ids].sort();

/* ── Who can be marked personal ─────────────────────────────────────────── */

describe("Personal applies where the API says it does", () => {
  test("money in from a personal card can be marked personal; the API's word wins", () => {
    assert.equal(canMarkPersonal(inn("a", { can_mark_personal: true })), true);
    assert.equal(canMarkPersonal(inn("a", { can_mark_personal: false })), false);
    assert.equal(canMarkPersonal(out("a", { can_mark_personal: false })), false);
    assert.equal(canMarkPersonal(out("a", { can_mark_personal: true })), true);
  });

  test("a BIT that arrives as 1/0 is read the same as true/false", () => {
    assert.equal(canMarkPersonal(inn("a", { can_mark_personal: 1 })), true);
    assert.equal(canMarkPersonal(out("a", { can_mark_personal: 0 })), false);
  });

  test("an API from before the field existed keeps the old rule: money out only", () => {
    assert.equal(canMarkPersonal(out("a")), true);
    assert.equal(canMarkPersonal(inn("a")), false);
    assert.equal(canMarkPersonal(inn("a", { can_mark_personal: null })), false);
  });

  test("a selection splits into the rows Personal applies to and a count of the rest", () => {
    const rows = [out("1"), inn("2"), inn("3", { can_mark_personal: true }), out("4"), inn("5")];
    const { eligible, skipped } = personalSplit(rows);
    assert.deepEqual(eligible.map((r) => r.transaction_id), ["1", "3", "4"]);
    assert.equal(skipped, 2);
  });
});

/* ── Selection ──────────────────────────────────────────────────────────── */

describe("selection", () => {
  const SHOWN = ["a", "b", "c", "d", "e", "f"];

  test("a plain click toggles one row and becomes the anchor", () => {
    let s = clickRow(EMPTY_SELECTION, SHOWN, "c", false);
    assert.deepEqual(ids(s), ["c"]);
    assert.equal(s.anchor, "c");
    s = clickRow(s, SHOWN, "c", false);
    assert.deepEqual(ids(s), []);
  });

  test("shift-click selects every row between the anchor and the click, in the order SHOWN", () => {
    // The anchor was clicked first, so a range built from the selection's own
    // order (or from ids sorted) would differ from the screen.
    const SHOWN_ORDER = ["f", "e", "d", "c", "b", "a"];
    let s = clickRow(EMPTY_SELECTION, SHOWN_ORDER, "e", false);
    s = clickRow(s, SHOWN_ORDER, "b", true);
    assert.deepEqual(ids(s), ["b", "c", "d", "e"]);
    assert.equal(s.anchor, "b");
    // Upward works the same.
    let t = clickRow(EMPTY_SELECTION, SHOWN, "e", false);
    t = clickRow(t, SHOWN, "b", true);
    assert.deepEqual(ids(t), ["b", "c", "d", "e"]);
  });

  test("shift-click onto a selected row clears the range (the clicked row decides)", () => {
    const s = clickRow(sel(["a", "b", "c", "d", "e"], "a"), SHOWN, "d", true);
    assert.deepEqual(ids(s), ["e"]);
  });

  test("shift-click with the anchor no longer shown is a plain click", () => {
    const s = clickRow(sel(["zz"], "zz"), SHOWN, "c", true);
    assert.deepEqual(ids(s), ["c", "zz"]);
  });

  test("Select all N shown adds every shown row and keeps what was already picked", () => {
    const s = selectAllShown(sel(["x"]), ["a", "b"]);
    assert.deepEqual(ids(s), ["a", "b", "x"]);
    assert.equal(allShownSelected(s, ["a", "b"]), true);
    assert.equal(allShownSelected(sel(["a"]), ["a", "b"]), false);
    assert.equal(allShownSelected(sel([]), []), false, "nothing shown is not 'all selected'");
  });

  test("a selected row hidden by the search or a filter is not acted on", () => {
    const shown = [out("a"), out("b")];
    const picked = selectedShown(shown, sel(["a", "hidden"]));
    assert.deepEqual(picked.map((r) => r.transaction_id), ["a"]);
  });
});

/* ── The request ────────────────────────────────────────────────────────── */

describe("POST /ledger/transactions/bulk — the contract body", () => {
  test("the categorize body is exactly { transaction_ids, action, coa_account_id }", () => {
    assert.deepEqual(bulkBody("categorize", ["t1", "t2"], "coa-9"), {
      transaction_ids: ["t1", "t2"], action: "categorize", coa_account_id: "coa-9",
    });
  });

  test("the personal body is exactly { transaction_ids, action } — no category rides along", () => {
    assert.deepEqual(bulkBody("personal", ["t1"], "coa-9"), { transaction_ids: ["t1"], action: "personal" });
  });

  test("more than 200 ids go in batches the API accepts", () => {
    assert.equal(BULK_MAX, 200);
    const many = Array.from({ length: 450 }, (_, i) => `t${i}`);
    const batches = chunkIds(many);
    assert.deepEqual(batches.map((b) => b.length), [200, 200, 50]);
    assert.deepEqual(batches.flat(), many);
  });

  test("sendBulk posts each batch to the bulk route with the contract body, and merges the answers", async () => {
    const calls = [];
    const post = async (p, body) => {
      calls.push({ p, body });
      return { done: body.transaction_ids.length, failed: 0, results: body.transaction_ids.map((id) => ({ transaction_id: id, ok: true })) };
    };
    const many = Array.from({ length: 250 }, (_, i) => `t${i}`);
    const { answer, unsent } = await sendBulk(post, "categorize", many, "coa-1");
    assert.equal(calls.length, 2);
    for (const c of calls) {
      assert.equal(c.p, "/ledger/transactions/bulk");
      assert.equal(c.p, BULK_PATH);
      assert.deepEqual(Object.keys(c.body).sort(), ["action", "coa_account_id", "transaction_ids"]);
      assert.equal(c.body.action, "categorize");
      assert.equal(c.body.coa_account_id, "coa-1");
    }
    assert.deepEqual(calls[0].body.transaction_ids, many.slice(0, 200));
    assert.deepEqual(calls[1].body.transaction_ids, many.slice(200));
    assert.equal(answer.done, 250);
    assert.equal(answer.results.length, 250);
    assert.equal(unsent, null);
  });

  test("a failed batch stops the sending, and how many never went is returned with its sentence", async () => {
    const calls = [];
    const post = async (p, body) => {
      calls.push(body.transaction_ids.length);
      if (calls.length === 2) throw new Error("STELLA is busy right now.");
      return { done: body.transaction_ids.length, failed: 0, results: [] };
    };
    const many = Array.from({ length: 450 }, (_, i) => `t${i}`);
    const { answer, unsent } = await sendBulk(post, "personal", many, null);
    assert.deepEqual(calls, [200, 200], "the third batch is never sent after the second failed");
    assert.equal(answer.done, 200);
    assert.deepEqual(unsent, { count: 250, reason: "STELLA is busy right now." });
  });

  test("a server failure never puts its internals on screen; a refusal's sentence does show", async () => {
    const serverDown = Object.assign(new Error("Timeout: Request failed to complete in 15000ms"), { status: 500 });
    const refusal = Object.assign(new Error("Pick at least one line first."), { status: 400 });
    assert.equal(plainReason(serverDown), "");
    assert.equal(plainReason(refusal), "Pick at least one line first.");
    assert.equal(plainReason({ type: "tier_gate" }), "", "a non-Error throw has no sentence to show");
    const { unsent } = await sendBulk(async () => { throw serverDown; }, "personal", ["a", "b"], null);
    assert.deepEqual(unsent, { count: 2, reason: "" });
    assert.equal(
      bulkResultSentence({ action: "personal", answer: mergeAnswers([]), unsent }),
      "Nothing was changed: we couldn't reach STELLA. Please try again."
    );
  });

  test("answers merge, and a missing answer is tolerated", () => {
    const m = mergeAnswers([
      { done: 2, failed: 1, results: [{ transaction_id: "a", ok: true }, { transaction_id: "b", ok: true }, { transaction_id: "c", ok: false }] },
      null,
      { done: 1, failed: 0, results: [{ transaction_id: "d", ok: true }] },
    ]);
    assert.equal(m.done, 3);
    assert.equal(m.failed, 1);
    assert.deepEqual([...succeededIds(m)].sort(), ["a", "b", "d"]);
  });
});

/* ── The answer, in words ───────────────────────────────────────────────── */

describe("the one line after a bulk action", () => {
  const okRows = (n) => Array.from({ length: n }, (_, i) => ({ transaction_id: `ok${i}`, ok: true }));

  test("Marked 42 personal.", () => {
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 42, failed: 0, results: okRows(42) } }),
      "Marked 42 personal."
    );
  });

  test("assigned and refused, from the per-row messages", () => {
    const answer = {
      done: 9, failed: 2,
      results: [
        ...okRows(9),
        { transaction_id: "x", ok: false, error: "period_closed", message: "The month they belong to is closed." },
        { transaction_id: "y", ok: false, error: "period_closed", message: "The month they belong to is closed." },
      ],
    };
    const line = bulkResultSentence({ action: "categorize", categoryName: "Vehicle & Fuel", answer });
    assert.equal(line, "Assigned 9 to Vehicle & Fuel. 2 could not be changed: the month they belong to is closed.");
    assert.doesNotMatch(line, /period_closed/, "a short code is never on screen");
  });

  test("the API's own closed-period sentence reads as one line", () => {
    const msg = "This line is in a period you have closed (2026-08-01 to 2026-08-31); reopen it under Period Close to change it.";
    const line = bulkResultSentence({
      action: "personal",
      answer: { done: 5, failed: 2, results: [...okRows(5), { transaction_id: "x", ok: false, error: "period_closed", message: msg }, { transaction_id: "y", ok: false, error: "period_closed", message: msg }] },
    });
    assert.equal(line, "Marked 5 personal. 2 could not be changed: this line is in a period you have closed (2026-08-01 to 2026-08-31); reopen it under Period Close to change it.");
  });

  test("several reasons are each counted, largest first", () => {
    const answer = {
      done: 0, failed: 3,
      results: [
        { transaction_id: "a", ok: false, error: "not_in_inbox", message: "It was already taken out of the inbox." },
        { transaction_id: "b", ok: false, error: "period_closed", message: "The month it belongs to is closed." },
        { transaction_id: "c", ok: false, error: "period_closed", message: "The month it belongs to is closed." },
      ],
    };
    assert.deepEqual(refusalGroups(answer), [
      { count: 2, reason: "the month it belongs to is closed" },
      { count: 1, reason: "it was already taken out of the inbox" },
    ]);
    assert.equal(
      bulkResultSentence({ action: "personal", answer }),
      "3 could not be changed: 2: the month it belongs to is closed; 1: it was already taken out of the inbox."
    );
  });

  test("a refusal with no message, or failures the answer did not describe, are still said", () => {
    const line = bulkResultSentence({
      action: "categorize", categoryName: "Meals",
      answer: { done: 1, failed: 3, results: [{ transaction_id: "a", ok: true }, { transaction_id: "b", ok: false, error: "x" }] },
    });
    assert.equal(line, "Assigned 1 to Meals. 3 could not be changed: we couldn't save them, so please try those again.");
  });

  test("an acronym at the start of a reason keeps its capitals", () => {
    const line = bulkResultSentence({
      action: "personal",
      answer: { done: 0, failed: 1, results: [{ transaction_id: "a", ok: false, message: "IRS records for this line are locked." }] },
    });
    assert.equal(line, "1 could not be changed: IRS records for this line are locked.");
  });

  test("skipped money-in lines are counted, never dropped silently", () => {
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 40, failed: 0, results: okRows(40) }, skipped: 2 }),
      `Marked 40 personal. 2 were left as they are: ${MONEY_IN_PERSONAL_RULE}.`
    );
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 0, failed: 0, results: [] }, skipped: 1 }),
      `Nothing was marked personal. 1 was left as it is: ${MONEY_IN_PERSONAL_RULE}.`
    );
  });

  test("a request that never reached the API says nothing was changed, in its own sentence", () => {
    assert.equal(
      bulkResultSentence({ action: "categorize", categoryName: "Meals", answer: { done: 0, failed: 0, results: [] }, unsent: { count: 12, reason: "Pick at most 200 lines at a time." } }),
      "Nothing was changed: pick at most 200 lines at a time. Please try again."
    );
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 200, failed: 0, results: okRows(200) }, unsent: { count: 50, reason: "" } }),
      "Marked 200 personal. 50 were not changed: we couldn't reach STELLA. Try those again."
    );
  });

  test("bulk Personal asks once, naming the count and anything left out", () => {
    assert.equal(
      bulkPersonalQuestion(42, 0),
      "Mark 42 personal? They leave your business books and every report. You can bring any of them back from Transactions → Personal."
    );
    assert.match(bulkPersonalQuestion(40, 2), /2 of the 42 you picked are money coming in and will be left as they are\.$/);
    assert.match(bulkPersonalQuestion(1, 0), /^Mark 1 personal\? It leaves/);
  });
});

/* ── The whole queue ────────────────────────────────────────────────────── */

describe("the whole queue", () => {
  test("the count is the API's total, with what is showing", () => {
    assert.equal(INBOX_PAGE_SIZE, 100);
    assert.equal(queueLine(305, 100), "305 to review — showing 100");
    assert.equal(queueLine(12, 12), "12 to review");
    assert.equal(queueLine(0, 0), "");
  });

  test("Show more offers the next page, or what is left of it", () => {
    assert.equal(moreToLoad(305, 100), 100);
    assert.equal(moreToLoad(305, 300), 5);
    assert.equal(moreToLoad(12, 12), 0);
  });

  test("the total comes from pagination.total, not from the rows sent", () => {
    const env = { data: [out("a"), out("b")], pagination: { total: 305, limit: 100, offset: 0 } };
    const { rows, total } = readInboxEnvelope(env);
    assert.equal(rows.length, 2);
    assert.equal(total, 305);
    assert.equal(readInboxEnvelope({ data: [out("a")] }).total, 1, "no pagination → count what came");
    assert.equal(readInboxEnvelope([out("a"), out("b")]).total, 2);
    assert.deepEqual(readInboxEnvelope(null), { rows: [], total: 0 });
  });

  test("a page appended skips any row already loaded", () => {
    const merged = mergePage([out("a"), out("b")], [out("b"), out("c")]);
    assert.deepEqual(merged.map((r) => r.transaction_id), ["a", "b", "c"]);
  });
});

/* ── Undo ───────────────────────────────────────────────────────────────── */

describe("Undo of a single Personal — PATCH /ledger/transactions/:id", () => {
  test("Undo puts an uncategorized line back to needs_categorization, and sends nothing else", () => {
    assert.deepEqual(undoPersonalBody(out("a")), { status: "needs_categorization" });
  });

  test("Undo puts a flagged line back to flagged", () => {
    assert.deepEqual(undoPersonalBody(out("a", { status: "flagged" })), { status: "flagged" });
  });

  test("a line that needed reimbursement gets that back (marking personal cleared it)", () => {
    assert.deepEqual(
      undoPersonalBody(out("a", { is_reimbursable: 1, reimbursed_at: null })),
      { status: "needs_categorization", is_reimbursable: true, reimbursed_at: null }
    );
    assert.deepEqual(
      undoPersonalBody(out("a", { is_reimbursable: true, reimbursed_at: "2026-09-30T12:00:00.000Z" })),
      { status: "needs_categorization", is_reimbursable: true, reimbursed_at: "2026-09-30T12:00:00.000Z" }
    );
  });
});

/* ── Never a dead control ───────────────────────────────────────────────── */

describe("never a dead control", () => {
  test("no categories, a failed read, or a slow one each say so in words", () => {
    assert.equal(categoryProblem({ loading: true, failed: false, count: 0 }), "Loading your categories…");
    assert.equal(categoryProblem({ loading: false, failed: true, count: 0 }), "Your categories didn't load.");
    assert.equal(categoryProblem({ loading: false, failed: false, count: 0 }), "You have no categories yet.");
    assert.equal(categoryProblem({ loading: false, failed: false, count: 30 }), null);
  });

  test("the note links to the categories page, and offers Try again after a failed read", () => {
    const html = renderToStaticMarkup(h(MemoryRouter, null, h(CategoryNote, { problem: "Your categories didn't load.", onRetry: () => {} })));
    assert.ok(html.includes("Your categories didn&#x27;t load."));
    assert.ok(html.includes('href="/app/services/stella_ledger_coa"'));
    assert.ok(html.includes(">Edit categories<"));
    assert.ok(html.includes(">Try again<"));
    const none = renderToStaticMarkup(h(MemoryRouter, null, h(CategoryNote, { problem: "You have no categories yet." })));
    assert.ok(!none.includes("Try again"));
  });

  test("the picker is never greyed for want of categories; the row shows the note instead", () => {
    const c = code(PAGE);
    assert.doesNotMatch(c, /!activeCoa\.length/);
    assert.match(c, /\{categoryNote \?\? \(/);
    assert.match(c, /const pickerProblem = categoryProblem\(\{/);
  });
});

/* ── The bar ────────────────────────────────────────────────────────────── */

function bar(props) {
  const base = {
    shownCount: 100, selectedCount: 0, allSelected: false,
    onSelectAll() {}, onClear() {}, onDone() {},
    picker: h("span", null, "[picker]"), categoryPicked: false, onAssign() {},
    personalEligible: 0, personalSkipped: 0,
    asking: false, onAskPersonal() {}, onConfirmPersonal() {}, onCancelPersonal() {},
    busy: null,
  };
  return renderToStaticMarkup(h(MemoryRouter, null, h(InboxBulkBar, { ...base, ...props })));
}

describe("the bulk bar", () => {
  test("nothing selected: says so, says how, and offers Select all N shown", () => {
    const html = bar({});
    assert.ok(html.includes("Nothing selected yet"));
    assert.ok(html.includes("shift-click another to pick everything between"));
    assert.ok(html.includes("Select all 100 shown"));
    assert.ok(html.includes(">Done<"));
  });

  test("44 picked, 2 of them money in: the counts on the buttons are the real ones", () => {
    const html = bar({ selectedCount: 44, categoryPicked: true, personalEligible: 42, personalSkipped: 2 });
    assert.ok(html.includes("44 selected"));
    assert.ok(html.includes("Assign 44 to this category"));
    assert.ok(html.includes("Mark 42 personal"));
    assert.ok(html.includes("2 money-in lines will be left as they are."));
    assert.ok(html.includes(">Clear<"));
  });

  test("no category picked yet: the Assign button says what to do", () => {
    assert.ok(bar({ selectedCount: 3, personalEligible: 3 }).includes("Pick a category first"));
  });

  test("only money in picked: says why Personal does not apply", () => {
    const html = bar({ selectedCount: 6, personalEligible: 0, personalSkipped: 6 });
    assert.ok(html.includes(`None of these can be marked personal: ${MONEY_IN_PERSONAL_RULE.replace(/'/g, "&#x27;")}.`));
  });

  test("Mark N personal asks once, in the page, with the count on the button", () => {
    const html = bar({ selectedCount: 44, personalEligible: 42, personalSkipped: 2, asking: true });
    assert.ok(html.includes('role="alertdialog"'));
    assert.ok(html.includes("Mark 42 personal? They leave your business books and every report."));
    assert.ok(html.includes("Yes, mark 42 personal"));
    assert.ok(html.includes(">Cancel<"));
  });

  test("everything shown already selected: no Select all", () => {
    assert.ok(!bar({ selectedCount: 100, allSelected: true }).includes("Select all"));
  });
});

/* ── The page ───────────────────────────────────────────────────────────── */

describe("the Inbox page", () => {
  const c = code(PAGE);

  test("reads the queue kept whole, 100 at a time, and shows the real total", () => {
    assert.match(c, /getFull<unknown>\(`\/ledger\/inbox\?limit=\$\{INBOX_PAGE_SIZE\}&offset=\$\{offset\}`\)/);
    assert.match(c, /\{queueLine\(total, rows\.length\)\}/);
    assert.match(c, /`Show \$\{more\} more`/);
    assert.match(c, /const page = await inboxPage\(rows\.length\);/);
  });

  test("bulk goes through sendBulk with the picked category only", () => {
    assert.match(c, /sendBulk\(post, action, targets\.map\(\(r\) => r\.transaction_id\), bulkCoa\)/);
    assert.match(c, /const targets = action === "personal" \? personal\.eligible : picked;/);
    assert.match(c, /bulkResultSentence\(\{ action, categoryName, answer, skipped, unsent \}\)/);
  });

  test("after a batch the list reloads and selection mode stays on", () => {
    const fn = c.slice(c.indexOf("async function runBulk("), c.indexOf("function toggle("));
    assert.match(fn, /setSel\(EMPTY_SELECTION\);/);
    assert.match(fn, /await load\(Math\.max\(INBOX_PAGE_SIZE, rows\.length\)\);/);
    assert.doesNotMatch(fn, /setSelecting\(false\)/);
  });

  test("single Personal is immediate, offers Undo, and Undo sends undoPersonalBody", () => {
    const mark = c.slice(c.indexOf("async function markPersonal("), c.indexOf("async function undoPersonal("));
    assert.match(mark, /await patch\(`\/ledger\/transactions\/\$\{r\.transaction_id\}`, \{ status: "personal" \}\);/);
    assert.match(mark, /undo: r,/);
    assert.match(c, /await patch\(`\/ledger\/transactions\/\$\{r\.transaction_id\}`, undoPersonalBody\(r\)\);/);
    assert.match(c, /"Undo"/);
  });

  test("no browser box anywhere on the Inbox", () => {
    assert.doesNotMatch(c, /(?<![.\w$])(?:window\s*\.\s*)?(confirm|prompt|alert)\s*\(/);
  });

  test("the row's Personal follows can_mark_personal, not the direction", () => {
    assert.match(c, /const personalOk = canMarkPersonal\(r\);/);
    assert.doesNotMatch(c, /r\.direction === "outflow" && markPersonal/);
  });

  test("shift-click reaches the selection from both the checkbox and the row", () => {
    assert.match(c, /onRowCheckboxClick=\{\(r, e\) => toggle\(r, e\.shiftKey\)\}/);
    assert.match(c, /onRowClick=\{\(r, e\) => \(selecting \? toggle\(r, e\.shiftKey\) : setDetail\(r\)\)\}/);
    assert.match(TABLE, /onClick=\{onRowCheckboxClick \? \(e\) => onRowCheckboxClick\(row, e\) : undefined\}/);
    assert.match(TABLE, /onClick=\{\(e\) => onRowClick\?\.\(row, e\)\}/);
  });

  test("the words are 'category', with an Edit categories link", () => {
    assert.doesNotMatch(c, /Search accounts|No accounts match|Other accounts|pick an account|[Cc]hart of [Aa]ccounts/);
    assert.match(c, /Search categories…/);
    assert.match(c, /<Link to=\{STELLA_SETUP_ROUTES\.coa\}[^>]*>\s*Edit categories\s*<\/Link>/);
    assert.match(c, /What we think/);
  });
});

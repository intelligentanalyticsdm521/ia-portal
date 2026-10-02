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
//
// Independent review, 2 Oct 2026 (each also broken on purpose, seen red, restored):
//   · plainReason — pass a no-status error's text through           → "the browser's own words never …" RED
//   · sendBulk — report a lost answer as "nothing was changed"      → "a lost answer is never 'nothing was changed' …" RED
//   · chunkIds — back to 200 a request                              → "the page sends 50 at a time …" RED
//   · assignSplit — assign a mixed pick to everything               → "a mixed pick assigned to an expense category …" RED
//   · refusalGroups — group by sentence again                       → "two closed months are ONE reason …" RED
//   · showMoreOutcome — append an empty page                        → "Show more that adds nothing reloads …" RED
//   · shownNote — say nothing for a pill                            → "a pill filter says how many it hides …" RED
//   · undoPersonalBody — send the reimbursable flag again           → "Undo sends the status, and nothing else" RED
//   · modal — confirm( back in markPersonal                         → "the detail window marks personal at once …" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import {
  INBOX_PAGE_SIZE, BULK_MAX, BULK_BATCH, BULK_PATH, EMPTY_SELECTION, MONEY_IN_PERSONAL_RULE,
  canMarkPersonal, plainReason, answerLost, personalSplit, assignSplit, assignSkipRule,
  clickRow, selectAllShown, allShownSelected, selectedShown,
  bulkBody, chunkIds, mergeAnswers, succeededIds, sendBulk, refusalGroups, bulkResultSentence, monthList,
  bulkPersonalQuestion, queueLine, moreToLoad, readInboxEnvelope, mergePage, showMoreOutcome, shownNote,
  undoPersonalBody, categoryProblem,
} from "../src/pages/stella/inboxBulk.ts";
import { InboxBulkBar, CategoryNote } from "../src/pages/stella/InboxBulkBar.tsx";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const PAGE = read("pages/stella/StellaLedgerInboxPage.tsx");
const TABLE = read("components/oliver/ui/DataTable.tsx");
const MODAL = read("pages/stella/TransactionDetailModal.tsx");

/** What lib/stellaApi.ts throws for an HTTP answer: the sentence, with the status on it. */
const httpError = (status, sentence) => Object.assign(new Error(sentence), { status });

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

  test("the page sends 50 at a time — never more than the API's 200 — so each request finishes and the bar can count", () => {
    assert.equal(BULK_MAX, 200);
    assert.equal(BULK_BATCH, 50);
    const many = Array.from({ length: 130 }, (_, i) => `t${i}`);
    const batches = chunkIds(many);
    assert.deepEqual(batches.map((b) => b.length), [50, 50, 30]);
    assert.deepEqual(batches.flat(), many);
    assert.deepEqual(chunkIds(Array.from({ length: 450 }, (_, i) => `t${i}`), 999).map((b) => b.length), [200, 200, 50],
      "a bigger size asked for is still capped at the API's 200");
  });

  test("sendBulk posts each batch to the bulk route with the contract body, counts progress, and merges the answers", async () => {
    const calls = [];
    const post = async (p, body) => {
      calls.push({ p, body });
      return { done: body.transaction_ids.length, failed: 0, results: body.transaction_ids.map((id) => ({ transaction_id: id, ok: true })) };
    };
    const many = Array.from({ length: 120 }, (_, i) => `t${i}`);
    const progress = [];
    const { answer, unsent } = await sendBulk(post, "categorize", many, "coa-1", (sent, total) => progress.push([sent, total]));
    assert.equal(calls.length, 3);
    for (const c of calls) {
      assert.equal(c.p, "/ledger/transactions/bulk");
      assert.equal(c.p, BULK_PATH);
      assert.deepEqual(Object.keys(c.body).sort(), ["action", "coa_account_id", "transaction_ids"]);
      assert.equal(c.body.action, "categorize");
      assert.equal(c.body.coa_account_id, "coa-1");
    }
    assert.deepEqual(calls.map((c) => c.body.transaction_ids), [many.slice(0, 50), many.slice(50, 100), many.slice(100)]);
    assert.deepEqual(progress, [[50, 120], [100, 120], [120, 120]], "the bar can say how far it has got");
    assert.equal(answer.done, 120);
    assert.equal(answer.results.length, 120);
    assert.equal(unsent, null);
  });

  test("a refused batch stops the sending, and how many never went is returned with its sentence", async () => {
    const calls = [];
    const post = async (p, body) => {
      calls.push(body.transaction_ids.length);
      if (calls.length === 2) throw httpError(409, "STELLA is busy right now.");
      return { done: body.transaction_ids.length, failed: 0, results: [] };
    };
    const many = Array.from({ length: 140 }, (_, i) => `t${i}`);
    const { answer, unsent } = await sendBulk(post, "personal", many, null);
    assert.deepEqual(calls, [50, 50], "the third batch is never sent after the second failed");
    assert.equal(answer.done, 50);
    assert.deepEqual(unsent, { count: 90, reason: "STELLA is busy right now.", lost: false, uncertain: 0 });
  });

  test("a lost answer is never 'nothing was changed': the server works every line it was given", async () => {
    // fetch's own error when the connection drops: no HTTP status at all.
    const dropped = new TypeError("Failed to fetch");
    const post = async (_p, body) => {
      if (body.transaction_ids[0] === "t50") throw dropped;
      return { done: body.transaction_ids.length, failed: 0, results: body.transaction_ids.map((id) => ({ transaction_id: id, ok: true })) };
    };
    const many = Array.from({ length: 130 }, (_, i) => `t${i}`);
    const { answer, unsent } = await sendBulk(post, "personal", many, null);
    assert.deepEqual(unsent, { count: 80, reason: "", lost: true, uncertain: 50 });
    const line = bulkResultSentence({ action: "personal", answer, unsent });
    assert.equal(line, "Marked 50 personal. We lost the connection, so we can't tell whether 50 lines changed, and 30 more were not sent. The list below shows what is still waiting.");
    assert.doesNotMatch(line, /fetch|Nothing was changed/i);
    // The first batch lost: still no guess.
    const first = await sendBulk(async () => { throw dropped; }, "personal", ["a", "b"], null);
    assert.equal(
      bulkResultSentence({ action: "personal", answer: first.answer, unsent: first.unsent }),
      "We lost the connection, so we can't tell whether 2 lines changed. The list below shows what is still waiting."
    );
    // A gateway answering in the server's place (it cut the request off) is the same.
    assert.equal(answerLost(httpError(504, "Gateway Timeout")), true);
    assert.equal(answerLost(httpError(502, "Bad Gateway")), true);
    assert.equal(answerLost(httpError(500, "x")), false, "our own 500 means the request failed before the lines");
    assert.equal(answerLost(httpError(409, "x")), false);
  });

  test("the browser's own words never reach the screen, nor a server's internals; a refusal's sentence does", async () => {
    const serverDown = httpError(500, "Timeout: Request failed to complete in 15000ms");
    const refusal = httpError(400, "Pick at least one line first.");
    assert.equal(plainReason(serverDown), "");
    assert.equal(plainReason(refusal), "Pick at least one line first.");
    assert.equal(plainReason(new TypeError("Failed to fetch")), "", "no HTTP answer: the browser's text is not a sentence for a person");
    assert.equal(plainReason(new Error("EMERGENCY_SESSION_EXPIRED: …")), "");
    assert.equal(plainReason({ type: "tier_gate" }), "", "a non-Error throw has no sentence to show");
    const { unsent } = await sendBulk(async () => { throw serverDown; }, "personal", ["a", "b"], null);
    assert.deepEqual(unsent, { count: 2, reason: "", lost: false, uncertain: 0 });
    assert.equal(
      bulkResultSentence({ action: "personal", answer: mergeAnswers([]), unsent }),
      "Nothing was changed: something went wrong on our side. Please try again."
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

  const PERIOD_MSG = "This line is in a month you have closed. Reopen that month under Period Close to change it.";
  const closedRow = (id) => ({ transaction_id: id, ok: false, error: "period_closed", message: PERIOD_MSG });

  test("assigned and refused: a closed month is said once, with the month named from the rows", () => {
    const answer = { done: 9, failed: 2, results: [...okRows(9), closedRow("x"), closedRow("y")] };
    const datesById = new Map([["x", "2026-07-03"], ["y", "2026-07-28"]]);
    const line = bulkResultSentence({ action: "categorize", categoryName: "Vehicle & Fuel", answer, datesById });
    assert.equal(line, "Assigned 9 to Vehicle & Fuel. 2 are in a month you've closed (July 2026) — reopen that month under Period Close to change them.");
    assert.doesNotMatch(line, /period_closed/, "a short code is never on screen");
  });

  test("two closed months are ONE reason — 'this line' never follows a count of more than one", () => {
    const answer = { done: 5, failed: 5, results: [...okRows(5), ...["a", "b", "c", "d", "e"].map(closedRow)] };
    const datesById = new Map([["a", "2026-07-01"], ["b", "2026-07-09"], ["c", "2026-08-15"], ["d", "2026-08-30"], ["e", "2026-07-20"]]);
    const line = bulkResultSentence({ action: "categorize", categoryName: "Meals", answer, datesById });
    assert.equal(line, "Assigned 5 to Meals. 5 are in months you've closed (July and August 2026) — reopen those months under Period Close to change them.");
    assert.doesNotMatch(line, /this line|\d{4}-\d{2}-\d{2}/);
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 0, failed: 1, results: [closedRow("a")] }, datesById }),
      "1 is in a month you've closed (July 2026) — reopen that month under Period Close to change it."
    );
  });

  test("the months read plainly, across a new year too", () => {
    assert.deepEqual(monthList(["2026-07-15", "2026-08-02", "2026-07-01"]), { text: "July and August 2026", count: 2 });
    assert.deepEqual(monthList(["2026-06-01", "2026-07-01", "2026-08-01"]), { text: "June, July and August 2026", count: 3 });
    assert.deepEqual(monthList(["2025-12-30", "2026-01-04"]), { text: "December 2025 and January 2026", count: 2 });
    assert.deepEqual(monthList([null, "", "not a date"]), { text: "", count: 0 });
  });

  test("several reasons are each counted, largest first", () => {
    const answer = {
      done: 0, failed: 3,
      results: [
        { transaction_id: "a", ok: false, error: "not_in_inbox", message: "This line is no longer waiting in your inbox." },
        closedRow("b"),
        closedRow("c"),
      ],
    };
    const datesById = new Map([["b", "2026-07-03"], ["c", "2026-07-04"]]);
    assert.deepEqual(refusalGroups(answer, datesById), [
      { count: 2, known: true, reason: "are in a month you've closed (July 2026) — reopen that month under Period Close to change them" },
      { count: 1, known: true, reason: "was no longer waiting in your inbox" },
    ]);
    assert.equal(
      bulkResultSentence({ action: "personal", answer, datesById }),
      "3 could not be changed: 2 are in a month you've closed (July 2026) — reopen that month under Period Close to change them; 1 was no longer waiting in your inbox."
    );
  });

  test("each refusal the API names reads as a sentence about that many lines", () => {
    const one = (error) => bulkResultSentence({ action: "personal", answer: { done: 0, failed: 1, results: [{ transaction_id: "a", ok: false, error, message: "x" }] } });
    assert.equal(one("already_void"), "1 was voided, so it's already out of your books.");
    assert.equal(one("not_found"), "1 could not be found — refresh the page and try again.");
    assert.equal(one("personal_not_allowed"),
      "1 is money coming in, which can be marked personal only when it came from a card you've set as a personal card under Bank and card accounts.");
    // A reason without a code the page knows is said in the API's own words.
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 0, failed: 2, results: [{ transaction_id: "a", ok: false, error: "bank_said_no", message: "The bank refused this one." }, { transaction_id: "b", ok: false, error: "bank_said_no", message: "The bank refused this one." }] } }),
      "2 could not be changed: the bank refused this one."
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

  test("a request the API answered with a refusal says nothing was changed, in its own sentence", () => {
    assert.equal(
      bulkResultSentence({ action: "categorize", categoryName: "Meals", answer: { done: 0, failed: 0, results: [] }, unsent: { count: 12, reason: "Pick at most 200 lines at a time.", lost: false } }),
      "Nothing was changed: pick at most 200 lines at a time. Please try again."
    );
    assert.equal(
      bulkResultSentence({ action: "personal", answer: { done: 200, failed: 0, results: okRows(200) }, unsent: { count: 50, reason: "", lost: false } }),
      "Marked 200 personal. 50 were not changed: something went wrong on our side. Try those again."
    );
  });

  test("lines a pick mixes the wrong way into a category are counted, with why", () => {
    assert.equal(
      bulkResultSentence({ action: "categorize", categoryName: "Meals", answer: { done: 41, failed: 0, results: okRows(41) }, skipped: 3, skippedWhy: assignSkipRule("in") }),
      "Assigned 41 to Meals. 3 were left as they are: money coming in doesn't belong in an expense category, so assign those on their own."
    );
  });

  test("bulk Personal asks once, naming the count and anything left out — and says lines come back one at a time", () => {
    assert.equal(
      bulkPersonalQuestion(42, 0),
      "Mark 42 personal? They leave your business books and every report. You can bring any of them back one at a time from Transactions → Personal."
    );
    assert.match(bulkPersonalQuestion(40, 2), /2 of the 42 you picked are money coming in and will be left as they are\.$/);
    assert.equal(bulkPersonalQuestion(1, 0), "Mark 1 personal? It leaves your business books and every report. You can bring it back from Transactions → Personal.");
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

  test("Show more that adds nothing reloads from the top — new lines at the top are never lost", () => {
    // A bank sync put 3 lines at the top: offset 2 now returns rows already shown.
    const loaded = [out("a"), out("b")];
    assert.deepEqual(showMoreOutcome(loaded, { rows: [out("a"), out("b")], total: 7 }), { kind: "reload" });
    const grew = showMoreOutcome(loaded, { rows: [out("b"), out("c")], total: 7 });
    assert.equal(grew.kind, "append");
    assert.deepEqual(grew.rows.map((r) => r.transaction_id), ["a", "b", "c"]);
    assert.equal(grew.total, 7);
  });

  test("past the end, the count never drops below what is on screen", () => {
    const loaded = [out("a"), out("b"), out("c")];
    const past = showMoreOutcome(loaded, { rows: [], total: 0 });
    assert.deepEqual(past, { kind: "append", rows: loaded, total: 3 }, "an empty page past the end must not wipe the count");
  });

  test("a pill filter says how many it hides from what is loaded, like the search does", () => {
    assert.equal(shownNote({ search: "", filterLabel: "Flagged", shown: 3, loaded: 100, more: 100 }),
      "3 of the 100 shown are flagged — Show more below to see the rest");
    assert.equal(shownNote({ search: "", filterLabel: "Flagged", shown: 1, loaded: 12, more: 0 }), "1 of the 12 shown is flagged");
    assert.equal(shownNote({ search: "coffee", filterLabel: null, shown: 4, loaded: 100, more: 100 }),
      "4 of the 100 shown match — Show more below to search the rest");
    assert.equal(shownNote({ search: "  ", filterLabel: null, shown: 100, loaded: 100, more: 5 }), "", "nothing hidden, nothing said");
  });
});

/* ── One category for lines going both ways ─────────────────────────────── */

describe("a mixed pick and one category", () => {
  test("a mixed pick assigned to an expense category leaves the money-in lines out, counted", () => {
    const rows = [out("1"), inn("2"), out("3"), inn("4")];
    const s = assignSplit(rows, "expense");
    assert.deepEqual(s.eligible.map((r) => r.transaction_id), ["1", "3"]);
    assert.deepEqual([s.skipped, s.skippedSide, s.moneyIn, s.moneyOut], [2, "in", 2, 2]);
  });

  test("…and to an income category leaves the money-out lines out", () => {
    const s = assignSplit([out("1"), inn("2")], "revenue");
    assert.deepEqual(s.eligible.map((r) => r.transaction_id), ["2"]);
    assert.deepEqual([s.skipped, s.skippedSide], [1, "out"]);
  });

  test("a pick all one way is assigned as picked — five refunds into Materials is real", () => {
    const refunds = [inn("1"), inn("2"), inn("3")];
    assert.deepEqual(assignSplit(refunds, "expense"), { eligible: refunds, skipped: 0, skippedSide: null, moneyIn: 3, moneyOut: 0 });
  });

  test("a balance-sheet category (a loan, a transfer) takes a mixed pick whole", () => {
    const rows = [out("1"), inn("2")];
    assert.equal(assignSplit(rows, "liability").eligible.length, 2);
    assert.equal(assignSplit(rows, null).eligible.length, 2, "no category picked yet: nothing is left out");
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

  test("Undo sends the status, and nothing else — marking personal no longer touches the reimbursable flag", () => {
    assert.deepEqual(undoPersonalBody(out("a", { is_reimbursable: 1, reimbursed_at: null })), { status: "needs_categorization" });
    assert.deepEqual(undoPersonalBody(out("a", { is_reimbursable: true, reimbursed_at: "2026-09-30T12:00:00.000Z" })), { status: "needs_categorization" });
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

  test("a mixed pick says so, and says what Assign will leave out — the count on the button is what it will change", () => {
    const html = bar({ selectedCount: 44, categoryPicked: true, assignEligible: 41, assignSkipped: 3, assignSkippedSide: "in", moneyIn: 3, moneyOut: 41, personalEligible: 41, personalSkipped: 3 });
    assert.ok(html.includes("You picked 3 money-in and 41 money-out lines."));
    assert.ok(html.includes("Assigning leaves the 3 money-in lines as they are: money coming in doesn&#x27;t belong in an expense category, so assign those on their own."));
    assert.ok(html.includes("Assign 41 to this category"));
    assert.ok(!bar({ selectedCount: 4, moneyIn: 0, moneyOut: 4 }).includes("You picked"), "a pick all one way says nothing extra");
  });

  test("while sending, the bar counts how far it has got", () => {
    assert.ok(bar({ selectedCount: 120, busy: "personal", personalEligible: 120, progress: { sent: 50, total: 120 } }).includes("Marking… 50 of 120"));
    assert.ok(bar({ selectedCount: 120, categoryPicked: true, busy: "categorize", progress: { sent: 100, total: 120 } }).includes("Assigning… 100 of 120"));
  });

  test("the answer is said inside the sticky bar", () => {
    const html = bar({ selectedCount: 0, result: h("span", null, "Marked 42 personal.") });
    assert.ok(/data-bulk-result="1"[^>]*>.*Marked 42 personal\./.test(html));
    assert.ok(!bar({}).includes("data-bulk-result"));
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

  test("bulk goes through sendBulk with the picked category only, counted on the bar", () => {
    assert.match(c, /sendBulk\(post, action, targets\.map\(\(r\) => r\.transaction_id\), bulkCoa,\s*\(sent, all\) => setBulkProgress\(\{ sent, total: all \}\)\)/);
    assert.match(c, /const targets = action === "personal" \? personal\.eligible : assign\.eligible;/);
    assert.match(c, /const skipped = action === "personal" \? personal\.skipped : assign\.skipped;/);
    assert.match(c, /const assign = useMemo\(\(\) => assignSplit\(picked, bulkCoaType\), \[picked, bulkCoaType\]\);/);
    assert.match(c, /bulkResultSentence\(\{ action, categoryName, answer, skipped, skippedWhy, unsent, datesById \}\)/);
    assert.match(c, /const datesById = new Map\(targets\.map\(\(r\) => \[r\.transaction_id, r\.posted_date\]\)\);/);
  });

  test("Show more goes through showMoreOutcome, and reloads when a page adds nothing", () => {
    const fn = c.slice(c.indexOf("async function showMore("), c.indexOf("function dropRow("));
    assert.match(fn, /const next = showMoreOutcome\(rows, page\);/);
    assert.match(fn, /if \(next\.kind === "reload"\) \{\s*await load\(rows\.length \+ INBOX_PAGE_SIZE\);/);
    assert.match(fn, /setTotal\(next\.total\);/);
    assert.doesNotMatch(fn, /setTotal\(page\.total\)/);
  });

  test("the search box and the pills both say what they hide", () => {
    assert.match(c, /const note = shownNote\(\{ search, filterLabel, shown: filtered\.length, loaded: rows\.length, more \}\);/);
    assert.match(c, /\{note && \(/);
  });

  test("in selection mode the answer is said in the sticky bar, not above the table", () => {
    assert.match(c, /result=\{noticeBox\}/);
    assert.match(c, /\{noticeBox && !selecting && /);
    assert.match(c, /progress=\{bulkProgress\}/);
  });

  test("a greyed Personal says why in WORDS under it, with the way to Bank and card accounts", () => {
    assert.match(c, /\{!personalOk && \(\s*<span data-personal-why="1"/);
    assert.match(c, /Money in is personal only from a card set as personal under\{" "\}\s*<Link to=\{STELLA_SETUP_ROUTES\.bank\}/);
    assert.doesNotMatch(c, /`Can't mark this personal: \$\{MONEY_IN_PERSONAL_RULE\}`/, "the reason is no longer only a tooltip");
  });

  test("the detail window gets the row's Personal rule", () => {
    const fn = c.slice(c.indexOf("function toDetailTxn("), c.indexOf("const more = moreToLoad("));
    assert.match(fn, /direction: r\.direction,/);
    assert.match(fn, /can_mark_personal: r\.can_mark_personal,/);
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

  test("the words around the Inbox say 'category' too: the Categories page, the Dashboard tile, setup", () => {
    const coaPage = code(read("pages/stella/StellaCoaPage.tsx"));
    assert.match(coaPage, /title="Categories"/);
    assert.doesNotMatch(coaPage, /Your seeded, customizable/);
    const dash = read("pages/stella/stellaDashboard.ts");
    assert.match(dash, /Give each one a category and it leaves the queue\./);
    assert.doesNotMatch(dash, /given them an account|Give each one an account/);
    assert.match(read("pages/stella/stellaSetupSteps.ts"), /give each one a category\./);
  });
});

/* ── The detail window the Inbox opens ──────────────────────────────────── */

describe("the detail window", () => {
  const m = code(MODAL);

  test("the detail window marks personal at once — no browser box — and Add back is right there", () => {
    const fn = m.slice(m.indexOf("async function markPersonal("), m.indexOf("async function addBackToBooks("));
    assert.doesNotMatch(fn, /(?<![.\w$])(?:window\s*\.\s*)?confirm\s*\(/);
    assert.match(fn, /await patch\(`\/ledger\/transactions\/\$\{txn\.transaction_id\}`, \{ status: "personal" \}\);/);
    assert.match(fn, /setStatus\("personal"\);/);
    assert.doesNotMatch(fn, /onClose\(true\)/, "it stays open, so the way back is on screen");
    assert.match(fn, /Press Add back to business books\./);
  });

  test("Personal is offered on the row's rule (can_mark_personal), not on 'is it an expense'", () => {
    assert.match(m, /const personalAllowed = canMarkPersonal\(\{/);
    assert.match(m, /\{personalAllowed && \(/);
    assert.doesNotMatch(m, /\{isExpense && \(\s*<button[^>]*onClick=\{markPersonal\}/);
  });

  test("Add back puts a flagged line back to flagged, decides by the SAVED category, and sends the status alone", () => {
    const fn = m.slice(m.indexOf("async function addBackToBooks("), m.indexOf("async function voidTxn("));
    // NEW-1 (2 Oct 2026): an unsaved pick in the window's dropdown must never
    // turn Add back into "categorized" — that sent a line out of the Inbox
    // with no category and no journal entry. The saved category decides.
    assert.match(fn, /const saved = txn\.coa_account_id \|\| "";/);
    assert.match(fn, /const target = txn\.status === "flagged" \? "flagged" : saved \? "categorized" : "needs_categorization";/);
    assert.doesNotMatch(fn, /coaAccountId \? "categorized"/, "the local pick decides nothing here");
    assert.match(fn, /await patch\(`\/ledger\/transactions\/\$\{txn\.transaction_id\}`, \{ status: target \}\);/);
  });
});

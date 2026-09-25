// The Job Board's week bar and cancelled visibility — Brandon, 25 Sep 2026:
//   "does the job board only show this weeks jobs? We may be able to remove the
//    calendar section you built, I forgot we had the schedule. Then just add
//    like a default to show the current week's jobs, then like next week
//    previous week, etc. Also, we should be able to filter to open/cancelled
//    requests. Right now I don't see how the client has visibility on if a job
//    cancels other than an email."
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  mondayOf, addDays, weekRangeLabel, weekName, scopeWord, inDateScope,
  cancelledByPhrase, cancelledLine, DATE_SCOPE_STORAGE_KEY,
} from "../src/oliver/jobBoardWeek.ts";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...p) => readFileSync(path.join(SRC, ...p), "utf8");

// Fri 25 Sep 2026, midday local.
const NOW = new Date(2026, 8, 25, 12, 0);
const THIS_MON = new Date(2026, 8, 21);

test("a week runs Monday to Sunday, and the label reads like the walk says", () => {
  assert.equal(mondayOf(NOW).getTime(), THIS_MON.getTime());
  assert.equal(mondayOf(new Date(2026, 8, 27, 23, 59)).getTime(), THIS_MON.getTime(), "Sunday night is still this week");
  assert.equal(mondayOf(new Date(2026, 8, 28, 0, 1)).getTime(), new Date(2026, 8, 28).getTime(), "Monday starts the next");
  assert.equal(weekRangeLabel(THIS_MON), "Mon 21 – Sun 27 Sep 2026");
  assert.equal(weekRangeLabel(addDays(THIS_MON, 7)), "Mon 28 Sep – Sun 4 Oct 2026");
  assert.equal(weekRangeLabel(new Date(2026, 11, 28)), "Mon 28 Dec 2026 – Sun 3 Jan 2027");
});

test("the three weeks around today are named; the tiles say which scope", () => {
  assert.equal(weekName(THIS_MON, NOW), "This week");
  assert.equal(weekName(addDays(THIS_MON, 7), NOW), "Next week");
  assert.equal(weekName(addDays(THIS_MON, -7), NOW), "Last week");
  assert.equal(weekName(addDays(THIS_MON, -14), NOW), "");
  assert.equal(scopeWord({ allDates: false, weekStart: THIS_MON }, NOW), "this week");
  assert.equal(scopeWord({ allDates: false, weekStart: addDays(THIS_MON, -14) }, NOW), "week of 7 Sep");
  assert.equal(scopeWord({ allDates: true, weekStart: THIS_MON }, NOW), "all dates");
});

test("a job is in the week by its date; undated open jobs show every week; All dates shows all", () => {
  const week = { allDates: false, weekStart: THIS_MON };
  const at = (y, m, d, h = 10) => new Date(y, m, d, h).toISOString();
  assert.equal(inDateScope({ status: "scheduled", scheduledDate: at(2026, 8, 25) }, week), true);
  assert.equal(inDateScope({ status: "scheduled", scheduledDate: at(2026, 8, 21, 0) }, week), true, "Monday 00:00 is in");
  assert.equal(inDateScope({ status: "scheduled", scheduledDate: at(2026, 8, 28, 0) }, week), false, "next Monday 00:00 is out");
  assert.equal(inDateScope({ status: "completed", scheduledDate: at(2026, 8, 10) }, week), false);
  // No date: an inquiry, a quote, an unscheduled job needs attention every week.
  for (const status of ["inquiry", "quoted", "scheduled", "completed", "invoiced"]) {
    assert.equal(inDateScope({ status, scheduledDate: null }, week), true, status);
  }
  // …but a closed job with no date needs nothing; All dates still shows it.
  assert.equal(inDateScope({ status: "cancelled", scheduledDate: null }, week), false);
  assert.equal(inDateScope({ status: "paid", scheduledDate: null }, week), false);
  assert.equal(inDateScope({ status: "cancelled", scheduledDate: null }, { ...week, allDates: true }), true);
  assert.equal(inDateScope({ status: "completed", scheduledDate: at(2020, 0, 1) }, { ...week, allDates: true }), true);
});

test("a cancelled job says who cancelled it and when", () => {
  assert.equal(cancelledByPhrase("customer"), "by the customer");
  assert.equal(cancelledByPhrase("business"), "by your team");
  assert.equal(cancelledByPhrase("system"), "automatically");
  assert.equal(cancelledByPhrase(null), "");
  const at = new Date(2026, 8, 25, 9, 42).toISOString();
  assert.equal(cancelledLine({ cancelledBy: "customer", cancelledAt: at }), "Cancelled by the customer · Fri 25 Sep, 9:42 AM");
  assert.equal(cancelledLine({ cancelledBy: null, cancelledAt: at }), "Cancelled · Fri 25 Sep, 9:42 AM");
  assert.equal(cancelledLine({ cancelledBy: "business", cancelledAt: null }), "Cancelled by your team");
  assert.equal(cancelledLine({}), null, "nothing known, nothing said");
});

test("the board: Kanban by default and this week, week bar above List and Kanban, Cancelled chip and tile", () => {
  const board = read("pages", "oliver", "OliverJobBoardPage.tsx");
  // Brandon, 25 Sep 2026: "the kanban board which is our default view".
  assert.match(board, /const view: "list" \| "kanban" = searchParams\.get\("view"\) === "list" \? "list" : "kanban";/,
    "Kanban unless the URL says ?view=list");
  assert.match(board, /useState\(\(\) => mondayOf\(new Date\(\)\)\)/, "opens on this week");
  assert.equal(DATE_SCOPE_STORAGE_KEY, "oliver.jobBoard.dateScope");
  assert.match(board, /try \{ return window\.localStorage\.getItem\(DATE_SCOPE_STORAGE_KEY\) === "all"; \} catch \{ return false; \}/,
    "the All dates switch is remembered, and a storage failure falls back to this week");
  assert.match(board, /jobs\.filter\(\(j\) => inDateScope\(j, dateScope\)\)/, "the scope applies before the chips, tiles and Kanban");
  assert.match(board, /<KanbanView\s+jobs=\{boardJobs\}/, "Kanban shows the scoped jobs");
  assert.match(board, /\{ key: 'cancelled', label: 'Cancelled', count: bucketCounts\.cancelled/, "a Cancelled chip");
  assert.match(board, /\{ key: 'cancelled',\s+label: 'Cancelled',\s+meaning: 'called off' \}/, "a sixth tile, Cancelled");
  assert.match(board, /openList\(\(k === bucketFilter \? '' : k\) as BoardFilter, \{ fromBoard: false \}\)/, "click a chip again to clear it");
  assert.match(board, /j\.status === "cancelled" \? cancelledLine\(j\) : null/, "cancelled rows say who and when");
  assert.doesNotMatch(board, /CLOSED_BOARD_WINDOW_DAYS|isClosedAndStale/, "the week replaced the Closed 7-day window");
});

// Brandon, 25 Sep 2026: "I can't click cancelled to see cancelled, like if I
// click on the cancelled just have it go to the list prefiltered then a back
// button or something like that to get back to the kanban board".
test("on Kanban a tile or column header opens the List pre-filtered, with Back to board", () => {
  const board = read("pages", "oliver", "OliverJobBoardPage.tsx");
  assert.match(board, /view === "kanban" \? openList\(b\.key, \{ fromBoard: true \}\)/, "a tile on Kanban drills into the List");
  assert.match(board, /onOpenColumn=\{\(key\) => openList\(key, \{ fromBoard: true \}\)\}/, "so does a column header");
  assert.match(board, /p\.set\("view", "list"\);\s+if \(status\) p\.set\("status", status\)/, "URL-driven: ?view=list&status=<key>");
  assert.match(board, /if \(opts\.fromBoard\) setSearchParams\(p, \{ state: \{ fromBoard: true \} \}\);/,
    "a new history entry, so the browser Back button returns to the board");
  assert.match(board, /<Button variant="secondary" onClick=\{showBoard\}>← Back to board<\/Button>/);
  assert.match(board, /\?\.fromBoard\) \{ navigate\(-1\); return; \}/, "Back to board is one step back when the List came from the board");
});

// Brandon, 25 Sep 2026: "I don't think we need to show the any profit,
// profitable losing money no data, that section is confusing and we need
// STELLA to tell that whole story anyway."
test("the List has no profit or recurring chip rows", () => {
  const board = read("pages", "oliver", "OliverJobBoardPage.tsx");
  assert.doesNotMatch(board, /PROFIT_PILLS|Losing money|profitFilter/, "the profit chips are gone");
  assert.doesNotMatch(board, /recurringFilter|label: 'One-off'/, "the Recurring / One-off chips are gone");
  assert.match(board, /<option value="">All types<\/option>/, "Kanban's type select stays");
});

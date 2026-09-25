// The one job colour map — Brandon's rule from walk W-OB-05 (25 Sep 2026):
//   "Green ready to work, yellow business side attention needed, orange
//    customer side or customer issue needs attention, blue new requests
//    needing confirmed."
// Plus: every calendar and the Job Board pills read it from one module, the
// calendars carry the guide, and nothing in a dark modal header is ink-black.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  jobColorKey, jobColor, JOB_COLOR_GUIDE, JOB_COLORS,
  factsFromUnifiedEvent, factsFromScheduleEvent, factsFromJobRow,
} from "../src/oliver/jobStatusColors.ts";
import { layoutLanes } from "../src/oliver/calendarLanes.ts";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const read = (...p) => readFileSync(path.join(SRC, ...p), "utf8");

test("green = confirmed and a worker is assigned", () => {
  for (const status of ["scheduled", "dispatched", "assigned"]) {
    assert.equal(jobColorKey({ kind: "job", status, hasWorker: true }), "ready", status);
  }
  assert.equal(JOB_COLORS.ready.name, "Green");
});

test("yellow = confirmed but no worker yet (business side)", () => {
  assert.equal(jobColorKey({ kind: "job", status: "scheduled", hasWorker: false }), "business_attention");
  // Unknown worker facts are not taken as "assigned" — except an "assigned" status.
  assert.equal(jobColorKey({ kind: "job", status: "scheduled" }), "business_attention");
  assert.equal(jobColorKey({ kind: "job", status: "assigned" }), "ready");
  // A confirmed booking that has not become a job is the business's to act on.
  assert.equal(jobColorKey({ kind: "booking", status: "confirmed" }), "business_attention");
  assert.equal(JOB_COLORS.business_attention.name, "Yellow");
});

test("orange = the customer asked to reschedule, or another customer issue", () => {
  assert.equal(jobColorKey({ kind: "job", status: "scheduled", hasWorker: true, customerAttention: true }), "customer_attention",
    "a customer's reschedule request outranks 'ready to work'");
  assert.equal(jobColorKey({ kind: "job", status: "scheduled", hasWorker: false, customerAttention: true }), "customer_attention");
  assert.equal(jobColorKey({ kind: "booking", status: "no_show" }), "customer_attention", "a missed booking is a customer issue");
  assert.equal(JOB_COLORS.customer_attention.name, "Orange");
});

test("blue = a new request waiting to be confirmed", () => {
  for (const status of ["inquiry", "quoted", "pending_confirmation"]) {
    assert.equal(jobColorKey({ status }), "new_request", status);
  }
  assert.equal(jobColorKey({ kind: "booking", status: "pending_confirmation" }), "new_request");
  assert.equal(JOB_COLORS.new_request.name, "Blue");
});

test("the other states never wear one of the founder's four colours", () => {
  const four = new Set(JOB_COLOR_GUIDE.map((c) => c.solid));
  for (const status of ["in_progress", "completed", "invoiced", "paid", "cancelled"]) {
    const c = jobColor({ kind: "job", status, hasWorker: true });
    assert.ok(!four.has(c.solid), `${status} must not look like ${c.name} from the guide`);
  }
  // A finished job with an old reschedule request is still done, not orange.
  assert.equal(jobColorKey({ status: "paid", customerAttention: true }), "done");
  assert.equal(jobColorKey({ status: "cancelled", customerAttention: true }), "cancelled");
});

test("the guide lists exactly the four, in the founder's order", () => {
  assert.deepEqual(JOB_COLOR_GUIDE.map((c) => c.name), ["Green", "Yellow", "Orange", "Blue"]);
  for (const c of JOB_COLOR_GUIDE) assert.ok(c.meaning.length > 10, `${c.name} needs plain words`);
});

test("each feed's facts map onto the rule", () => {
  // /calendar/unified — worker_count and reschedule_requested from the API.
  assert.equal(jobColorKey(factsFromUnifiedEvent({ kind: "job", status: "scheduled", worker_count: 1 })), "ready");
  assert.equal(jobColorKey(factsFromUnifiedEvent({ kind: "job", status: "scheduled", worker_count: 0 })), "business_attention");
  assert.equal(jobColorKey(factsFromUnifiedEvent({ kind: "job", status: "scheduled", worker_count: 1, reschedule_requested: true })), "customer_attention");
  // An older API without the facts falls back to the Job Board's own rows.
  assert.equal(jobColorKey(factsFromUnifiedEvent({ kind: "job", status: "scheduled" }, { hasWorker: true })), "ready");
  // /schedule/calendar — one row per assignment; worker_id null = nobody on it.
  assert.equal(jobColorKey(factsFromScheduleEvent({ type: "job", status: "scheduled", worker_id: "W1" })), "ready");
  assert.equal(jobColorKey(factsFromScheduleEvent({ type: "job", status: "scheduled", worker_id: null })), "business_attention");
  assert.equal(jobColorKey(factsFromScheduleEvent({ type: "booking", status: "pending_confirmation" })), "new_request");
  // GET /jobs rows — assignedWorkers + rescheduleRequested.
  assert.equal(jobColorKey(factsFromJobRow({ status: "scheduled", assignedWorkers: [{}] })), "ready");
  assert.equal(jobColorKey(factsFromJobRow({ status: "scheduled", assignedWorkers: [] })), "business_attention");
  assert.equal(jobColorKey(factsFromJobRow({ status: "scheduled", assignedWorkers: [{}], rescheduleRequested: true })), "customer_attention");
});

test("overlapping blocks share the column instead of hiding each other", () => {
  const h = (n) => Date.UTC(2026, 8, 29, n);
  const laid = layoutLanes(
    [{ id: "a", s: h(10), e: h(11) }, { id: "b", s: h(10), e: h(11) }, { id: "c", s: h(12), e: h(13) }],
    (x) => ({ start: x.s, end: x.e }),
  );
  const by = Object.fromEntries(laid.map((l) => [l.item.id, l]));
  assert.equal(by.a.lanes, 2);
  assert.equal(by.b.lanes, 2);
  assert.notEqual(by.a.lane, by.b.lane, "two jobs at 10:00 get different lanes");
  assert.equal(by.c.lanes, 1, "a job on its own keeps the full width");
});

test("every job calendar and the Job Board pills read the one map", () => {
  const users = {
    "Schedule page": read("pages", "oliver", "OliverSchedulePage.tsx"),
    "Schedule day view": read("components", "oliver", "DaySchedulePanel.tsx"),
    "Job Board": read("pages", "oliver", "OliverJobBoardPage.tsx"),
    "Dashboard full calendar": read("components", "oliver", "customer", "CalendarModal.tsx"),
    "Dashboard Weekly Glance": read("pages", "oliver", "OliverDashboardPage.tsx"),
    "Job panel status pill": read("components", "oliver", "customer", "JobDetailPanel.tsx"),
  };
  for (const [name, src] of Object.entries(users)) {
    assert.match(src, /oliver\/jobStatusColors/, `${name} must colour jobs from src/oliver/jobStatusColors`);
  }
  // The per-file tables are gone — a second table is how the colours drift.
  assert.doesNotMatch(users["Dashboard full calendar"], /STATUS_COLORS|BOOKING_COLOR/);
  assert.doesNotMatch(users["Dashboard Weekly Glance"], /weeklyGlanceStatusColor/);
});

test("the guide sits under the Schedule calendar and the full calendar", () => {
  for (const f of [
    ["pages", "oliver", "OliverSchedulePage.tsx"],
    ["components", "oliver", "customer", "CalendarModal.tsx"],
  ]) {
    assert.match(read(...f), /<JobColorGuide \/>/, `${f.at(-1)} must render the colour guide`);
  }
});

// Brandon, 25 Sep 2026: "We may be able to remove the calendar section you
// built, I forgot we had the schedule." Schedule is the calendar; the board
// links to it and keeps List and Kanban.
test("the Job Board has no Calendar tab, and links to the Schedule calendar", () => {
  const board = read("pages", "oliver", "OliverJobBoardPage.tsx");
  assert.doesNotMatch(board, /setView\("calendar"\)/, "no Calendar tab beside List and Kanban");
  assert.doesNotMatch(board, /JobWeekCalendar/, "the week view is gone from the board");
  assert.ok(!existsSync(path.join(SRC, "components", "oliver", "JobWeekCalendar.tsx")),
    "replace means delete: the week view file is gone");
  assert.match(board, /<Link\s+to="\/app\/services\/oliver_schedule"[\s\S]{0,200}?Open the full calendar →/);
  // The calendars' job links (?job=) now open the job on the board.
  assert.match(board, /searchParams\.get\("focus"\) \|\| searchParams\.get\("job"\)/);
});

test("a job on the Schedule calendar opens on click, in the month and in the day", () => {
  const page = read("pages", "oliver", "OliverSchedulePage.tsx");
  assert.match(page, /onEventClick=\{openEvent\}/, "month-grid chips open their job");
  assert.match(page, /onOpenEvent=\{openEvent\}/, "day-view blocks open their job");
  assert.match(page, /<CustomerModal[\s\S]*?focusJobId=\{focusJobId\}/, "into the same job panel the Job Board opens");
  const grid = read("components", "UnifiedCalendarGrid.tsx");
  assert.match(grid, /onEventClick \? \(ev: React\.MouseEvent\) => \{ ev\.stopPropagation\(\); onEventClick\(e\); \}/,
    "a chip click must not fall through to opening the day");
  const cal = read("components", "oliver", "customer", "CalendarModal.tsx");
  assert.doesNotMatch(cal, /booking clicked → no-op/, "a booking block in the full calendar's day view must open something");
});

test("nothing in a dark modal header is ink-black: the header publishes its foreground", () => {
  const modal = read("components", "IadmModal.tsx");
  assert.match(modal, /"--iadm-head-fg": "#FFFFFF"/, "the ink header sets its foreground token");
  assert.match(modal, /\.\.\.HEADER_FG_VARS, color: "var\(--iadm-head-fg\)"/, "and uses it for its own text");
  assert.match(modal, /\.\.\.HEADER_FG_RESET/, "the modal root resets it so bodies and nested modals keep their ink");
  const btn = read("components", "oliver", "ui", "Button.tsx");
  assert.match(btn, /ghost:\s+\{ background: "transparent", color: "var\(--iadm-head-fg, #0B1C24\)" \}/,
    "a ghost button takes the header's foreground inside a header and its ink everywhere else");
  assert.match(btn, /color: "var\(--iadm-head-fg, #0B1C24\)",\r?\n\s+border: "1px solid var\(--iadm-head-btn-border/,
    "so does the outline (secondary) button");
  // No calendar patches its header per page any more.
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const f = path.join(d, e);
    return statSync(f).isDirectory() ? walk(f) : /\.tsx$/.test(f) ? [f] : [];
  });
  const patched = walk(SRC).filter((f) => /const ON_DARK\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(patched.map((f) => path.basename(f)), [], "the header colour is fixed once, in IadmModal + Button");
});

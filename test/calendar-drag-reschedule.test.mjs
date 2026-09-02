// Dragging events on the calendar must move JOBS and nothing else.
//
// The grid shows jobs, bookings, campaigns, emails, SMS and social posts on the
// same days. A campaign or an email on that grid is a scheduled SEND — dragging
// one to another day would quietly change when it goes out to real customers.
// That is not something anyone should be able to do by accident, so only job
// chips are draggable.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const GRID = readFileSync(path.join(SRC, "components", "UnifiedCalendarGrid.tsx"), "utf8");
const PAGE = readFileSync(path.join(SRC, "pages", "oliver", "OliverSchedulePage.tsx"), "utf8");

test("only job events are draggable", () => {
  assert.match(
    GRID,
    /e\.kind === "job" && e\.id\.startsWith\("job:"\)/,
    "draggability must be gated on the event being a job — a scheduled campaign " +
      "or email send must not be movable by dragging",
  );
  assert.match(GRID, /draggable=\{canDrag\}/, "the chip's draggable flag must come from that check");
});

test("dragging is off entirely when the grid is read-only", () => {
  // canDrag requires onDropJob, so the Command Center — which passes none —
  // cannot drag anything even though it renders the same job chips.
  assert.match(GRID, /const canDrag = !!onDropJob && !!jobId;/);
});

test("a reschedule keeps the job's time of day", () => {
  // Dragging a 2pm job to Friday must leave it at 2pm. Resetting it to the
  // queue default would silently move a customer's appointment.
  assert.match(
    PAGE,
    /prev\.getHours\(\), prev\.getMinutes\(\)/,
    "the existing start's hours and minutes must be carried onto the new day",
  );
});

test("a reschedule shifts the end by the same delta", () => {
  // Otherwise the job still ENDS on its old day and spans the gap between.
  assert.match(PAGE, /scheduled_end/, "the end must move with the start");
  assert.match(PAGE, /start\.getTime\(\) - prev\.getTime\(\)/, "shifted by the same delta, preserving duration");
});

test("dropping a job back on its own day does nothing", () => {
  // No write, no toast. Reporting "moved" for a move that did not happen is the
  // same false-success shape this release keeps removing.
  assert.match(
    GRID,
    /if \(fromStart && ymd\(new Date\(fromStart\)\) === dayKey\) return;/,
    "a same-day drop must short-circuit before any write",
  );
});

// UnifiedCalendarGrid is shared by the OLIVER Schedule page and the Command
// Center. Making it schedule jobs must stay OPT-IN via a prop.
//
// If the drop handlers ever bind unconditionally, the Command Center — which
// shows campaigns, emails, social posts and jobs across every product — starts
// accepting job drops onto days, in a context where that means nothing. The
// alternative someone reaches for is forking the component, and then the two
// calendars drift apart forever.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const GRID = readFileSync(path.join(SRC, "components", "UnifiedCalendarGrid.tsx"), "utf8");

test("drop handlers are bound only when a handler prop is supplied", () => {
  for (const h of ["onDrop", "onDragOver"]) {
    // The guarded form is `onDrop={onDropJob ? ... : undefined}`. An
    // unconditional `onDrop={` would make every consumer writable.
    const re = new RegExp(`${h}=\{onDropJob \?`);
    assert.match(GRID, re,
      `${h} must be conditional on the onDropJob prop, so consumers that pass ` +
      `nothing (the Command Center) stay read-only`);
  }
});

test("the grid is not forked — exactly one definition exists", () => {
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const f = path.join(d, e);
    return statSync(f).isDirectory() ? walk(f) : /\.tsx?$/.test(f) ? [f] : [];
  });
  const defs = walk(SRC).filter((f) =>
    /export function UnifiedCalendarGrid\b/.test(readFileSync(f, "utf8")));
  assert.equal(defs.length, 1,
    `expected one UnifiedCalendarGrid; found ${defs.length}. A second copy means ` +
    `the Command Center and the Schedule page will drift: ${defs.map((f) => path.relative(SRC, f)).join(", ")}`);
});

test("a failed schedule write does not redraw the calendar", () => {
  const PAGE = readFileSync(path.join(SRC, "pages", "oliver", "OliverSchedulePage.tsx"), "utf8");
  // The drop handler returns false on failure, and the grid only reloads when
  // the handler returns true. Drawing the job on a day it was never saved to
  // is the report-success-over-failed-work shape this release keeps removing.
  assert.match(PAGE, /return false;/,
    "the drop handler must return false when the PATCH fails");
  // The signature gained a `from` argument when drag-to-reschedule landed; the
  // invariant is unchanged — reload ONLY when the handler returns true.
  assert.match(GRID, /if \(await onDropJob\([^)]*\)\) await load\(\);/,
    "the grid must reload only when the write actually landed");
});

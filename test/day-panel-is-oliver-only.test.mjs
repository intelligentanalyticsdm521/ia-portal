// The day-detail modal gains OLIVER scheduling ONLY where OLIVER asks for it.
//
// UnifiedCalendarGrid is shared with the Command Center, which shows campaigns,
// emails, SMS and social posts across every product. A "book a job into this
// gap" panel there would be offering to schedule field work from a dashboard
// that is not about field work — and it would call an OLIVER endpoint on a page
// that has no business doing so.
//
// Same reason onDropJob is a prop rather than a default. This is the third
// thing bolted onto that grid; the pattern has to hold or the Command Center
// slowly becomes an OLIVER page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const GRID = readFileSync(path.join(SRC, "components", "UnifiedCalendarGrid.tsx"), "utf8");

test("the day modal's extra content comes from a prop, not a hardcoded panel", () => {
  assert.match(GRID, /renderDayBody\?:/, "it must be an optional prop");
  assert.match(GRID, /body=\{renderDayBody\?\.\(/, "and only rendered when supplied");
  // The grid must not import OLIVER's panel itself — that would make every
  // consumer pull it in whether they want it or not.
  assert.doesNotMatch(GRID, /DaySchedulePanel/,
    "the shared grid must not know about OLIVER's day panel");
});

test("the OLIVER scheduling endpoint is never called from the shared grid", () => {
  assert.doesNotMatch(GRID, /\/schedule\/slots/,
    "slot lookup belongs to the OLIVER panel; the Command Center must not fire it");
});

test("only the Schedule page passes a day panel", () => {
  const walk = (d) => readdirSync(d).flatMap((e) => {
    const f = path.join(d, e);
    return statSync(f).isDirectory() ? walk(f) : /\.tsx$/.test(f) ? [f] : [];
  });
  const users = walk(SRC).filter((f) => {
    const src = readFileSync(f, "utf8");
    return /<UnifiedCalendarGrid/.test(src) && /renderDayBody=/.test(src);
  }).map((f) => path.basename(f));
  assert.deepEqual(users, ["OliverSchedulePage.tsx"],
    `expected only the OLIVER Schedule page to pass renderDayBody; got ${users.join(", ") || "none"}`);
});

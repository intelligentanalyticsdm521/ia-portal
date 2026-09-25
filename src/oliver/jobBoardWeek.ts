// jobBoardWeek — the Job Board's date scope: one week at a time, or all dates.
//
// Brandon, 25 Sep 2026 (mid-walk): "does the job board only show this weeks
// jobs? We may be able to remove the calendar section you built, I forgot we
// had the schedule. Then just add like a default to show the current week's
// jobs, then like next week previous week, etc. Also, we should be able to
// filter to open/cancelled requests."
//
// The rule, in one place so it is unit-tested (test/job-board-week.test.mjs):
//   - a week runs Monday 00:00 to the next Monday 00:00, local time;
//   - a job is in the week when its scheduled date falls inside it;
//   - a job with NO date (an inquiry, a quote, a job not yet scheduled) shows
//     in every week, because it needs attention whatever week it is — unless it
//     is closed (paid or cancelled), which needs nothing; "All dates" shows it;
//   - "All dates" shows every job the board loaded.
// Pure module (no React).

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Where the board remembers "This week" vs "All dates" (per browser). */
export const DATE_SCOPE_STORAGE_KEY = "oliver.jobBoard.dateScope";

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Monday 00:00 local of the week containing d. */
export function mondayOf(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
}

/** "Mon 21 – Sun 27 Sep 2026", "Mon 28 Sep – Sun 4 Oct 2026",
 *  "Mon 28 Dec 2026 – Sun 3 Jan 2027". */
export function weekRangeLabel(weekStart: Date): string {
  const last = addDays(weekStart, 6);
  const sameYear = weekStart.getFullYear() === last.getFullYear();
  const sameMonth = sameYear && weekStart.getMonth() === last.getMonth();
  const a = `${WD[weekStart.getDay()]} ${weekStart.getDate()}`
    + (sameMonth ? "" : ` ${MON[weekStart.getMonth()]}`)
    + (sameYear ? "" : ` ${weekStart.getFullYear()}`);
  const b = `${WD[last.getDay()]} ${last.getDate()} ${MON[last.getMonth()]} ${last.getFullYear()}`;
  return `${a} – ${b}`;
}

/** "This week" / "Next week" / "Last week" for the three weeks around today,
 *  otherwise "" (the range alone names the week). */
export function weekName(weekStart: Date, now: Date = new Date()): string {
  const diffWeeks = Math.round((mondayOf(weekStart).getTime() - mondayOf(now).getTime()) / (7 * 86400000));
  if (diffWeeks === 0) return "This week";
  if (diffWeeks === 1) return "Next week";
  if (diffWeeks === -1) return "Last week";
  return "";
}

/** How the tiles name the scope: "this week", "next week", "last week",
 *  "week of 7 Sep", or "all dates". */
export function scopeWord(scope: DateScope, now: Date = new Date()): string {
  if (scope.allDates) return "all dates";
  const n = weekName(scope.weekStart, now);
  if (n) return n.toLowerCase();
  return `week of ${scope.weekStart.getDate()} ${MON[scope.weekStart.getMonth()]}`;
}

export interface DateScope {
  allDates: boolean;
  /** Monday 00:00 local of the week shown. */
  weekStart: Date;
}

export interface ScopableJob {
  status?: string | null;
  scheduledDate?: string | null;
}

const CLOSED = new Set(["paid", "cancelled"]);

/** Is the job on the board for this scope? */
export function inDateScope(j: ScopableJob, scope: DateScope): boolean {
  if (scope.allDates) return true;
  const t = j.scheduledDate ? Date.parse(j.scheduledDate) : NaN;
  if (Number.isNaN(t)) return !CLOSED.has(String(j.status || "").toLowerCase());
  const start = scope.weekStart.getTime();
  return t >= start && t < addDays(scope.weekStart, 7).getTime();
}

/** How a cancelled job says who called it off — the Service Requests wording. */
export function cancelledByPhrase(by?: string | null): string {
  if (by === "customer") return "by the customer";
  if (by === "business") return "by your team";
  if (by === "system") return "automatically";
  return "";
}

/** "Cancelled by the customer · Fri 25 Sep, 9:42 AM", or null when the job
 *  knows neither who nor when. */
export function cancelledLine(j: { cancelledBy?: string | null; cancelledAt?: string | null }): string | null {
  const who = cancelledByPhrase(j.cancelledBy);
  const t = j.cancelledAt ? new Date(j.cancelledAt) : null;
  const when = t && !Number.isNaN(t.getTime())
    ? `${WD[t.getDay()]} ${t.getDate()} ${MON[t.getMonth()]}, ${t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : "";
  if (!who && !when) return null;
  return ["Cancelled" + (who ? ` ${who}` : ""), when].filter(Boolean).join(" · ");
}

// stellaDashboard — what STELLA's product Dashboard says, given what the API
// answered. The page (StellaDashboardPage) fetches; the view
// (StellaDashboardView) draws; this file decides the words.
//
// Brandon, 2 Oct 2026: "I still do not see the STELLA overview. Everything is
// in STELLA>LEdger>Overview. Each feature has an overview and then STELLA is
// supposed to have it's own dashboard/overview. all the other platforms call
// it a dashboard and that's where the platform cross features stuff lives,
// like finish set up, etc."
//
// So the Dashboard holds the things that cut ACROSS STELLA's features:
//
//   1. Finish setting up — stellaSetupSteps.ts, read by stellaSetupLoad.ts.
//   2. What needs you — one tile per thing a real endpoint can answer today:
//        Ledger inbox     GET /ledger/overview   inboxCount (all time)
//        Bills            GET /ledger/ap-aging   open bills, days overdue, due dates
//        Owed to you      GET /ledger/overview   owedToYou (all time)
//        Month-end close  GET /ledger/periods + GET /ledger/transactions for
//                         last month (limit=1, the count is the pagination total)
//   3. A way into each feature area, in the nav's own words (STELLA_SHORTCUTS).
//
// Every tile is in one of three states and says which in plain words: it needs
// you, it is clear, or we could not check it. A read that failed is never shown
// as "nothing to do" — that would be the one lie a dashboard must not tell.
//
// Pure: no React, no API, no clock (today is passed in) — test/stella-dashboard
// walks every rule.
import { fmtMoney } from "./stellaTheme";

// ── Inputs (shapes as the API returns them, { data } already unwrapped) ─────

export interface OverviewInput {
  inboxCount?: number | string | null;
  owedToYou?: number | string | null;
}

export interface ApAgingBill {
  due_date?: string | null;
  balance_due?: number | string | null;
  days_overdue?: number | string | null;
}
export interface ApAgingInput {
  bills?: ApAgingBill[] | null;
}

export interface PeriodInput {
  period_start?: string | null;
  period_end?: string | null;
  status?: string | null;
}

export interface NeedsYouInputs {
  /** GET /ledger/overview, or null when it failed. */
  overview: OverviewInput | null;
  /** GET /ledger/ap-aging, or null when it failed. */
  apAging: ApAgingInput | null;
  /** GET /ledger/periods, or null when it failed. */
  periods: PeriodInput[] | null;
  /** How many transactions are dated last month; null when the read failed. */
  lastMonthCount: number | null;
  /** Today, YYYY-MM-DD, in the viewer's own time zone. */
  today: string;
}

// ── Tiles ───────────────────────────────────────────────────────────────────

export type NeedState = "needs_you" | "clear" | "unknown";

export interface NeedTile {
  key: "inbox" | "bills" | "owed" | "close";
  /** The feature the tile is about, in the nav's words. */
  title: string;
  state: NeedState;
  /** The answer, short: "3 transactions to review", "Nothing to review", "Couldn't check right now". */
  headline: string;
  /** One plain sentence. */
  detail: string;
  /** Where the work is done. */
  route: string;
  /** Where the link goes, in the nav's words. */
  linkLabel: string;
}

export const STELLA_DASHBOARD_ROUTES = {
  inbox: "/app/services/stella_ledger_inbox",
  bills: "/app/services/stella_bills",
  billsOverdue: "/app/services/stella_bills?filter=overdue",
  billsOwed: "/app/services/stella_bills?filter=open",
  owed: "/app/services/stella_ledger_transactions?reimbursable=open",
  periodClose: "/app/services/stella_settings_period_close",
} as const;

/** Days ahead that count as "due this week". */
export const DUE_SOON_DAYS = 7;

const COULD_NOT_CHECK = "Couldn't check right now";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** YYYY-MM-DD for a Date, in local time. */
export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The calendar month before `today`: first day, last day, and its name ("September 2026"). */
export function lastMonthRange(today: string): { start: string; end: string; label: string } {
  const [y, m] = today.split("-").map(Number);
  const year = m === 1 ? y - 1 : y;
  const month = m === 1 ? 12 : m - 1; // 1-12
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}

/** today + n days, YYYY-MM-DD. */
export function addDays(today: string, n: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function day(v?: string | null): string {
  return v ? String(v).slice(0, 10) : "";
}

export function inboxTile(overview: OverviewInput | null): NeedTile {
  const base = { key: "inbox" as const, title: "Ledger inbox", route: STELLA_DASHBOARD_ROUTES.inbox, linkLabel: "Ledger → Inbox" };
  if (!overview) {
    return { ...base, state: "unknown", headline: COULD_NOT_CHECK, detail: "The inbox didn't answer — open it to see what's waiting." };
  }
  const n = Math.max(0, Math.round(num(overview.inboxCount)));
  if (n > 0) {
    return {
      ...base,
      state: "needs_you",
      headline: `${plural(n, "transaction", "transactions")} to review`,
      detail: "Give each one an account and it leaves the queue.",
    };
  }
  return { ...base, state: "clear", headline: "Nothing to review", detail: "New transactions wait here until you've given them an account." };
}

export function billsTile(apAging: ApAgingInput | null, today: string): NeedTile {
  const base = { key: "bills" as const, title: "Bills", route: STELLA_DASHBOARD_ROUTES.bills, linkLabel: "Bills" };
  if (!apAging) {
    return { ...base, state: "unknown", headline: COULD_NOT_CHECK, detail: "Your bills didn't answer — open Bills to see what you owe." };
  }
  const open = (Array.isArray(apAging.bills) ? apAging.bills : []).filter((b) => num(b.balance_due) > 0);
  const soonest = addDays(today, DUE_SOON_DAYS);
  const overdue = open.filter((b) => num(b.days_overdue) > 0);
  const dueSoon = open.filter((b) => num(b.days_overdue) <= 0 && day(b.due_date) !== "" && day(b.due_date) <= soonest);
  const sum = (list: ApAgingBill[]) => list.reduce((s, b) => s + num(b.balance_due), 0);

  if (overdue.length > 0) {
    const also = dueSoon.length > 0 ? `, and ${plural(dueSoon.length, "more is", "more are")} due this week` : "";
    return {
      ...base,
      state: "needs_you",
      headline: `${plural(overdue.length, "bill", "bills")} overdue`,
      detail: `${fmtMoney(sum(overdue))} is past its due date${also}.`,
      route: STELLA_DASHBOARD_ROUTES.billsOverdue,
    };
  }
  if (dueSoon.length > 0) {
    return {
      ...base,
      state: "needs_you",
      headline: `${plural(dueSoon.length, "bill", "bills")} due this week`,
      detail: `${fmtMoney(sum(dueSoon))} falls due in the next ${DUE_SOON_DAYS} days.`,
      route: STELLA_DASHBOARD_ROUTES.billsOwed,
    };
  }
  if (open.length > 0) {
    return {
      ...base,
      state: "clear",
      headline: "Nothing due this week",
      detail: `${plural(open.length, "open bill", "open bills")}, ${fmtMoney(sum(open))} in all, none due in the next ${DUE_SOON_DAYS} days.`,
      route: STELLA_DASHBOARD_ROUTES.billsOwed,
    };
  }
  return { ...base, state: "clear", headline: "No bills owed", detail: "Record a bill when one arrives and its due date shows up here." };
}

export function owedTile(overview: OverviewInput | null): NeedTile {
  const base = { key: "owed" as const, title: "Owed to you", route: STELLA_DASHBOARD_ROUTES.owed, linkLabel: "Ledger → Transactions" };
  if (!overview) {
    return { ...base, state: "unknown", headline: COULD_NOT_CHECK, detail: "What you're owed didn't load — open Transactions to see it." };
  }
  const owed = num(overview.owedToYou);
  if (owed > 0) {
    return {
      ...base,
      state: "needs_you",
      headline: `You're owed ${fmtMoney(owed)}`,
      detail: "Business costs you paid yourself and haven't paid yourself back for yet.",
    };
  }
  return {
    ...base,
    state: "clear",
    headline: "Nothing owed to you",
    detail: "Mark a cost as paid personally and it adds up here until you pay yourself back.",
  };
}

/** A closed period covers the whole of [start, end]. */
export function monthClosed(periods: PeriodInput[], start: string, end: string): boolean {
  return periods.some(
    (p) => String(p.status || "").toLowerCase() === "closed" && day(p.period_start) !== "" && day(p.period_start) <= start && day(p.period_end) >= end,
  );
}

export function closeTile(periods: PeriodInput[] | null, lastMonthCount: number | null, today: string): NeedTile {
  const lm = lastMonthRange(today);
  const base = {
    key: "close" as const,
    title: "Month-end close",
    route: STELLA_DASHBOARD_ROUTES.periodClose,
    linkLabel: "Settings → Period Close",
  };
  if (!Array.isArray(periods)) {
    return { ...base, state: "unknown", headline: COULD_NOT_CHECK, detail: "Your closed months didn't load — open Period Close to see them." };
  }
  if (monthClosed(periods, lm.start, lm.end)) {
    return { ...base, state: "clear", headline: `${lm.label} is closed`, detail: "Nothing dated in it can change unless you reopen it." };
  }
  if (lastMonthCount === null) {
    return { ...base, state: "unknown", headline: COULD_NOT_CHECK, detail: `We couldn't tell whether anything was recorded in ${lm.label}.` };
  }
  if (lastMonthCount === 0) {
    return { ...base, state: "clear", headline: "Nothing to close", detail: `Nothing was recorded in ${lm.label}.` };
  }
  return {
    ...base,
    state: "needs_you",
    headline: `${lm.label} isn't closed yet`,
    detail: "Close it once it's reconciled so your reports stop moving.",
  };
}

/** The four tiles, in order. */
export function stellaNeedsYou(i: NeedsYouInputs): NeedTile[] {
  return [
    inboxTile(i.overview),
    billsTile(i.apAging, i.today),
    owedTile(i.overview),
    closeTile(i.periods, i.lastMonthCount, i.today),
  ];
}

// ── Shortcuts — one per STELLA feature area, in the nav's own words ─────────
//
// Labels are the catalog's displayName (single pages) or the STELLA nav group's
// label (whole areas); each route is that page, or the group's landing (its
// first item — what clicking the group header opens). test/stella-dashboard
// holds every label to the catalog and the nav so they cannot drift.

export interface StellaShortcut {
  key: string;
  label: string;
  route: string;
  /** One short line on what is there. */
  detail: string;
}

export const STELLA_SHORTCUTS: StellaShortcut[] = [
  { key: "ledger", label: "Ledger", route: "/app/services/stella_ledger_overview", detail: "The inbox, every transaction and the books themselves." },
  { key: "bills", label: "Bills", route: "/app/services/stella_bills", detail: "What you owe your suppliers, and when." },
  { key: "assets", label: "Assets", route: "/app/services/stella_assets", detail: "Vehicles, machines and tools the business owns." },
  { key: "budgets", label: "Budgets", route: "/app/services/stella_budgets", detail: "What you planned, beside what happened." },
  { key: "unit_economics", label: "Unit Economics", route: "/app/services/stella_ue_margins", detail: "Profit per job, per customer and per service." },
  { key: "data", label: "Database Manager", route: "/app/services/stella_db_registry", detail: "Your data, imports, documents and reminders." },
  { key: "reports", label: "Reports", route: "/app/services/stella_ledger_reports", detail: "Profit and loss, balance sheet, cash flow and more." },
  { key: "settings", label: "Settings", route: "/app/services/stella_settings_bank", detail: "Bank and card accounts, sales tax and period close." },
];

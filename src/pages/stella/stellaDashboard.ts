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
//        Bills            GET /ledger/ap-aging   open bills and their due dates
//        Owed to you      GET /ledger/overview   owedToYou (all time)
//        Month-end close  GET /ledger/periods + GET /ledger/transactions for
//                         last month (limit=1, the count is the pagination
//                         total), less last month's voided lines
//   3. A way into each main feature area, in the nav's own words
//      (STELLA_SHORTCUTS).
//
// Every tile is in one of three states and says which in plain words: it needs
// you, it is clear, or we could not check it. A read that failed is never shown
// as "nothing to do" — that would be the one lie a dashboard must not tell, and
// the section's summary line counts the tiles we could not check too.
//
// An ACCOUNTANT (allowedServiceKeys from /overview/me or /ledger/me) sees only
// the steps, tiles and shortcuts whose pages are in their own nav — never the
// owner's bank setup or Unit Economics (setupStepsFor / shortcutsFor).
//
// Pure: no React, no API, no clock (today is passed in) — test/stella-dashboard
// walks every rule.
import { fmtMoney } from "./stellaTheme";
import type { StellaSetupStep } from "./stellaSetupSteps";

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
  /** How many live (not voided) transactions are dated last month; null when it could not be read. */
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

/**
 * Is this bill past its due date, on the VIEWER's calendar?
 *
 * The API's days_overdue is counted from the server's UTC date, so on a US
 * evening a bill due today already read "1 day overdue" while "due this week"
 * used the local date (independent review, 2 Oct 2026). The due date decides,
 * against the local `today`; days_overdue is only the fallback for a bill
 * with no due date (the API answers 0 for those).
 */
export function billOverdue(b: ApAgingBill, today: string): boolean {
  const due = day(b.due_date);
  return due !== "" ? due < today : num(b.days_overdue) > 0;
}

export function billsTile(apAging: ApAgingInput | null, today: string): NeedTile {
  const base = { key: "bills" as const, title: "Bills", route: STELLA_DASHBOARD_ROUTES.bills, linkLabel: "Bills" };
  if (!apAging) {
    return { ...base, state: "unknown", headline: COULD_NOT_CHECK, detail: "Your bills didn't answer — open Bills to see what you owe." };
  }
  const open = (Array.isArray(apAging.bills) ? apAging.bills : []).filter((b) => num(b.balance_due) > 0);
  const soonest = addDays(today, DUE_SOON_DAYS);
  const overdue = open.filter((b) => billOverdue(b, today));
  const dueSoon = open.filter((b) => !billOverdue(b, today) && day(b.due_date) !== "" && day(b.due_date) <= soonest);
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

/**
 * Closed periods cover the whole of [start, end] — one period, or several
 * that together leave no day open (two closed halves of a month count; the
 * first version needed ONE period spanning the month, 2 Oct 2026 review).
 */
export function monthClosed(periods: PeriodInput[], start: string, end: string): boolean {
  const closed = periods
    .filter((p) => String(p.status || "").toLowerCase() === "closed" && day(p.period_start) !== "" && day(p.period_end) !== "")
    .map((p) => ({ s: day(p.period_start), e: day(p.period_end) }))
    .sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  // `cursor` is the first day not yet known to be closed.
  let cursor = start;
  for (const p of closed) {
    if (p.s > cursor) break; // a gap: an open day nothing later can cover
    if (p.e >= cursor) cursor = addDays(p.e, 1);
    if (cursor > end) return true;
  }
  return cursor > end;
}

/**
 * Last month's live transactions: every line dated in it (the API's default
 * list, which leaves out personal ones) less the voided ones. A month holding
 * only voided lines has nothing to close (2 Oct 2026 review: it read "isn't
 * closed yet"). null when it cannot be told.
 */
export function lastMonthBookCount(allTotal: number | null, voidTotal: number | null): number | null {
  if (allTotal === null) return null;
  if (allTotal <= 0) return 0;
  if (voidTotal === null) return null;
  return Math.max(0, allTotal - voidTotal);
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

/**
 * The line beside "What needs you". It counts the tiles we could not check as
 * well as the ones that need you — "Nothing is waiting" is said only when every
 * tile really answered clear (2 Oct 2026 review: four "Couldn't check" tiles
 * sat under "Nothing is waiting on you right now").
 */
export function needsSummary(needs: NeedTile[]): string {
  const waiting = needs.filter((t) => t.state === "needs_you").length;
  const unknown = needs.filter((t) => t.state === "unknown").length;
  const unchecked = `${unknown} couldn't be checked right now`;
  if (waiting > 0) {
    const base = `${waiting} of ${needs.length} ${waiting === 1 ? "needs" : "need"} a look`;
    return unknown > 0 ? `${base}, and ${unchecked}.` : `${base}.`;
  }
  if (unknown > 0 && unknown === needs.length) return "None of these could be checked right now — open each one to see it.";
  if (unknown > 0) return `Nothing waiting that we could check — ${unchecked}.`;
  return "Nothing is waiting on you right now.";
}

// ── Who sees what — the accountant's Dashboard ──────────────────────────────

/** The service key a Portal route opens: "/app/services/stella_bills?filter=open" → "stella_bills". */
export function routeServiceKey(route: string): string | null {
  const m = String(route).match(/^\/app\/services\/([a-z0-9_]+)/);
  return m ? m[1] : null;
}

/** Is the page `route` opens in this person's nav? null = everything (an owner). */
export function routeAllowed(route: string, allowedServiceKeys: string[] | null): boolean {
  if (!allowedServiceKeys) return true;
  const key = routeServiceKey(route);
  return !key || allowedServiceKeys.includes(key);
}

/** Setup steps that are the OWNER's act: linking the bank, marking the owner's own card. */
export const OWNER_ONLY_SETUP_STEPS: readonly StellaSetupStep["key"][] = ["bank", "personal_card"];

/**
 * The setup steps this person can act on. An accountant is not given the
 * bank page (lib/accountantRole.js), so the two bank steps go, and so does any
 * step whose page is not in their nav. An owner (null) sees all six.
 */
export function setupStepsFor(steps: StellaSetupStep[] | null, allowedServiceKeys: string[] | null): StellaSetupStep[] | null {
  if (!steps || !allowedServiceKeys) return steps;
  const ownsBank = allowedServiceKeys.includes("stella_settings_bank");
  return steps.filter((s) => (ownsBank || !OWNER_ONLY_SETUP_STEPS.includes(s.key)) && routeAllowed(s.route, allowedServiceKeys));
}

/** The tiles whose page is in this person's nav. */
export function needsFor(needs: NeedTile[], allowedServiceKeys: string[] | null): NeedTile[] {
  return allowedServiceKeys ? needs.filter((t) => routeAllowed(t.route, allowedServiceKeys)) : needs;
}

// ── Shortcuts — one per main STELLA feature area, in the nav's own words ────
//
// Labels are the catalog's displayName (single pages) or the STELLA nav group's
// label (whole areas); each route is that page, or the group's landing (its
// first item — what clicking the group header opens). test/stella-dashboard
// holds every label to the catalog and the nav so they cannot drift. `tag` is
// the badge the nav shows on that group's items ("S" = the Standard plan), so
// a business on a lower plan is not walked into an upgrade panel unwarned.

export interface StellaShortcut {
  key: string;
  label: string;
  route: string;
  /** One short line on what is there. */
  detail: string;
  /** The nav's plan badge for this area, when it has one. */
  tag?: string;
}

export const STELLA_SHORTCUTS: StellaShortcut[] = [
  { key: "ledger", label: "Ledger", route: "/app/services/stella_ledger_overview", detail: "The inbox, every transaction and the books themselves." },
  { key: "bills", label: "Bills", route: "/app/services/stella_bills", detail: "What you owe your suppliers, and when." },
  { key: "assets", label: "Assets", route: "/app/services/stella_assets", detail: "Vehicles, machines and tools the business owns." },
  { key: "budgets", label: "Budgets", route: "/app/services/stella_budgets", detail: "What you planned, beside what happened." },
  { key: "unit_economics", label: "Unit Economics", route: "/app/services/stella_ue_margins", detail: "Profit per job, per customer and per service." },
  { key: "data", label: "Database Manager", route: "/app/services/stella_db_registry", detail: "Your data, imports, documents and reminders.", tag: "S" },
  { key: "reports", label: "Reports", route: "/app/services/stella_ledger_reports", detail: "Profit and loss, balance sheet, cash flow and more." },
  { key: "custom_reporting", label: "Custom Reporting", route: "/app/services/stella_report_library", detail: "Build, schedule and export reports of your own.", tag: "S" },
  { key: "settings", label: "Settings", route: "/app/services/stella_settings_bank", detail: "Bank and card accounts, sales tax and period close." },
];

/** STELLA's pages under Settings, in the Settings nav's order, and how the shortcut names each. */
const STELLA_SETTINGS_PAGES: { key: string; words: string }[] = [
  { key: "stella_settings_bank", words: "bank and card accounts" },
  { key: "stella_settings_sales_tax", words: "sales tax" },
  { key: "stella_settings_period_close", words: "period close" },
];
const SETTINGS_NAV_ORDER = ["stella_settings_bank", "stella_settings_period_close", "stella_settings_sales_tax"];

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The shortcuts this person's nav can open. An owner (null) gets all of them.
 * An accountant loses the areas they are not given (Unit Economics), and
 * Settings opens the first STELLA settings page they DO have (Period Close),
 * named for what is there — never the bank page.
 */
export function shortcutsFor(allowedServiceKeys: string[] | null): StellaShortcut[] {
  if (!allowedServiceKeys) return STELLA_SHORTCUTS;
  const out: StellaShortcut[] = [];
  for (const s of STELLA_SHORTCUTS) {
    if (s.key !== "settings") {
      if (routeAllowed(s.route, allowedServiceKeys)) out.push(s);
      continue;
    }
    const first = SETTINGS_NAV_ORDER.find((k) => allowedServiceKeys.includes(k));
    if (!first) continue;
    const words = joinWords(STELLA_SETTINGS_PAGES.filter((p) => allowedServiceKeys.includes(p.key)).map((p) => p.words));
    out.push({ ...s, route: `/app/services/${first}`, detail: `${words.charAt(0).toUpperCase()}${words.slice(1)}.` });
  }
  return out;
}

// ── A permanent "no" is not a blip ──────────────────────────────────────────

export type DashboardAccess = "not_in_plan" | "no_access";

export const STELLA_ACCESS_SENTENCES: Record<DashboardAccess, { title: string; detail: string }> = {
  not_in_plan: {
    title: "STELLA isn't part of your plan yet",
    detail: "Add it from Plan & Pricing in the menu and this page fills in with your books.",
  },
  no_access: {
    title: "Your account doesn't have STELLA for this business",
    detail: "Ask the business owner to give you access under Team Members.",
  },
};

/**
 * Why every read was refused, when the refusal is permanent: STELLA not on the
 * business's plan (the API's feature_not_available 403, which lib/stellaApi
 * throws as { type: "tier_gate" }), or this person not given STELLA (any other
 * 403). null when nothing says so — then the page offers Try again. A 403 used
 * to land on "We couldn't reach your books just now … fills in as soon as
 * STELLA answers", a promise that never comes true (2 Oct 2026 review).
 */
export function accessFromFailures(failures: unknown[]): DashboardAccess | null {
  let found: DashboardAccess | null = null;
  for (const f of failures) {
    if (!f || typeof f !== "object") continue;
    if ((f as { type?: unknown }).type === "tier_gate") return "not_in_plan";
    if ((f as { status?: unknown }).status === 403) found = "no_access";
  }
  return found;
}

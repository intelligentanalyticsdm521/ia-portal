// STELLA's product Dashboard — first in the STELLA nav, what the rail icon
// opens, and where the cross-feature things live.
//
// Brandon, 2 Oct 2026: "I still do not see the STELLA overview. Everything is
// in STELLA>LEdger>Overview. Each feature has an overview and then STELLA is
// supposed to have it's own dashboard/overview. all the other platforms call
// it a dashboard and that's where the platform cross features stuff lives,
// like finish set up, etc."
//
// What has to stay true:
//   • the nav: a label-less first group holding ONE item, "Dashboard"
//     (stella_dashboard) — the shape OLIVER, SPARK and ARION use — ahead of
//     the Ledger group, so first-item-wins makes it STELLA's landing
//   • the Ledger keeps its own Overview as the Ledger group's first item
//   • the legacy aliases land on the Dashboard
//   • the page, top to bottom: Finish setting up → What needs you → Go to
//   • every "needs you" tile says it needs you, it is clear, or we could not
//     check it — a failed read is never "nothing to do"
//   • every shortcut is named exactly as the catalog / nav names it
//
// Independent review, 2 Oct 2026 — also true now:
//   • the summary line never says "Nothing is waiting" over tiles we could not check
//   • an accountant's rail target is in their own (filtered) nav, and their
//     Dashboard shows no owner-only setup steps or shortcuts
//   • overdue is decided by the due date on the viewer's calendar
//   • two closed halves close a month; a month of only voided lines has
//     nothing to close
//   • a 403 that will not go away says so, instead of "fills in as soon as
//     STELLA answers"
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · billOverdue — trust days_overdue over the due date      → "a bill due today is not overdue …" RED
//   · closeTile — skip the lastMonthCount === null branch      → "last month's count unreadable …" RED
//   · StellaDashboardView — draw the shortcuts above the tiles → "the order on the page" RED
//   · SubNav STELLA_NAV — move the Dashboard group after Ledger → "Dashboard is the FIRST item" RED
//   · STELLA_SHORTCUTS — rename "Database Manager" to "Data"   → "every shortcut label …" RED
//   · needsSummary — drop the unknown count                   → "a mix of clear and couldn't-check …" RED
//   · railRouteFor — use the unfiltered config                → "the accountant's rail target …" RED
//   · setupStepsFor — return steps unfiltered                 → "an accountant's Dashboard …" RED
//   · monthClosed — back to one period spanning the month     → "two closed halves …" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import {
  STELLA_DASHBOARD_ROUTES, STELLA_SHORTCUTS, DUE_SOON_DAYS, STELLA_ACCESS_SENTENCES,
  inboxTile, billsTile, owedTile, closeTile, stellaNeedsYou, billOverdue, needsSummary,
  lastMonthRange, addDays, localDateString, monthClosed, lastMonthBookCount,
  routeServiceKey, setupStepsFor, needsFor, shortcutsFor, accessFromFailures,
} from "../src/pages/stella/stellaDashboard.ts";
import { applyRoleNavFilter, firstNavRoute, railRouteFor } from "../src/components/navRoleFilter.ts";
import { loadStellaSetup, STELLA_SETUP_READS, safeRead } from "../src/pages/stella/stellaSetupLoad.ts";
import { stellaSetupSteps } from "../src/pages/stella/stellaSetupSteps.ts";
import { fmtMoney } from "../src/pages/stella/stellaTheme.ts";
import { StellaDashboardView } from "../src/pages/stella/StellaDashboardView.tsx";
import { SERVICE_CATALOG } from "../src/config/serviceCatalog.ts";
import { STELLA_PAGES } from "../src/journeys/content/stellaPages.ts";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const TODAY = "2026-10-02";

/* ── Dates ───────────────────────────────────────────────────────────────── */

describe("dates", () => {
  test("last month is the calendar month before today, with its own name", () => {
    assert.deepEqual(lastMonthRange("2026-10-02"), { start: "2026-09-01", end: "2026-09-30", label: "September 2026" });
    assert.deepEqual(lastMonthRange("2026-01-15"), { start: "2025-12-01", end: "2025-12-31", label: "December 2025" });
    assert.deepEqual(lastMonthRange("2028-03-01"), { start: "2028-02-01", end: "2028-02-29", label: "February 2028" });
  });
  test("addDays crosses month ends; localDateString is the local calendar day", () => {
    assert.equal(addDays("2026-10-28", 7), "2026-11-04");
    assert.equal(addDays(TODAY, DUE_SOON_DAYS), "2026-10-09");
    assert.equal(localDateString(new Date(2026, 9, 2, 23, 59)), "2026-10-02");
  });
});

/* ── Ledger inbox ────────────────────────────────────────────────────────── */

describe("tile — Ledger inbox (GET /ledger/overview inboxCount)", () => {
  test("waiting transactions need you, counted, and link to the Inbox", () => {
    const t = inboxTile({ inboxCount: 3 });
    assert.equal(t.state, "needs_you");
    assert.equal(t.headline, "3 transactions to review");
    assert.equal(t.route, "/app/services/stella_ledger_inbox");
    assert.equal(t.linkLabel, "Ledger → Inbox");
    assert.equal(inboxTile({ inboxCount: "1" }).headline, "1 transaction to review");
  });
  test("an empty inbox is clear", () => {
    const t = inboxTile({ inboxCount: 0 });
    assert.equal(t.state, "clear");
    assert.equal(t.headline, "Nothing to review");
  });
  test("an unreadable overview is 'couldn't check', never 'nothing to review'", () => {
    const t = inboxTile(null);
    assert.equal(t.state, "unknown");
    assert.equal(t.headline, "Couldn't check right now");
  });
});

/* ── Bills ───────────────────────────────────────────────────────────────── */

describe("tile — Bills (GET /ledger/ap-aging)", () => {
  const overdue = { days_overdue: 5, balance_due: 120, due_date: "2026-09-27" };
  const soon = { days_overdue: 0, balance_due: 80, due_date: "2026-10-05" };
  const later = { days_overdue: 0, balance_due: 300, due_date: "2026-10-20" };
  const paid = { days_overdue: 40, balance_due: 0, due_date: "2026-08-01" };

  test("an overdue bill needs you, with the amount, and links to Bills filtered to Overdue", () => {
    const t = billsTile({ bills: [overdue, soon, later, paid] }, TODAY);
    assert.equal(t.state, "needs_you");
    assert.equal(t.headline, "1 bill overdue");
    assert.equal(t.detail, `${fmtMoney(120)} is past its due date, and 1 more is due this week.`);
    assert.equal(t.route, "/app/services/stella_bills?filter=overdue");
  });
  test("nothing overdue but a bill due this week needs you, linked to the Owed list", () => {
    const t = billsTile({ bills: [soon, later] }, TODAY);
    assert.equal(t.state, "needs_you");
    assert.equal(t.headline, "1 bill due this week");
    assert.equal(t.detail, `${fmtMoney(80)} falls due in the next 7 days.`);
    assert.equal(t.route, STELLA_DASHBOARD_ROUTES.billsOwed);
  });
  test("'this week' is today through today + 7, inclusive", () => {
    assert.equal(billsTile({ bills: [{ days_overdue: 0, balance_due: 10, due_date: "2026-10-09" }] }, TODAY).state, "needs_you");
    assert.equal(billsTile({ bills: [{ days_overdue: 0, balance_due: 10, due_date: "2026-10-10" }] }, TODAY).state, "clear");
    assert.equal(billsTile({ bills: [{ days_overdue: 0, balance_due: 10, due_date: TODAY }] }, TODAY).state, "needs_you");
  });
  test("open bills none of which are due soon are clear, and still say what is owed", () => {
    const t = billsTile({ bills: [later] }, TODAY);
    assert.equal(t.state, "clear");
    assert.equal(t.headline, "Nothing due this week");
    assert.match(t.detail, /^1 open bill, /);
  });
  test("no bills (or only paid ones) is clear", () => {
    assert.equal(billsTile({ bills: [] }, TODAY).headline, "No bills owed");
    assert.equal(billsTile({ bills: [paid] }, TODAY).headline, "No bills owed");
  });
  test("an unreadable aging is 'couldn't check'", () => {
    assert.equal(billsTile(null, TODAY).state, "unknown");
  });
  test("a bill due today is not overdue on the viewer's calendar, whatever the server's UTC date says", () => {
    // 2 Oct 2026 review: days_overdue is counted from GETUTCDATE, so on a US
    // evening a bill due today already came back as 1 day overdue.
    const dueToday = { days_overdue: 1, balance_due: 50, due_date: TODAY };
    assert.equal(billOverdue(dueToday, TODAY), false);
    const t = billsTile({ bills: [dueToday] }, TODAY);
    assert.equal(t.headline, "1 bill due this week");
    // Yesterday's due date is overdue even if the server still said 0.
    assert.equal(billOverdue({ days_overdue: 0, balance_due: 10, due_date: "2026-10-01" }, TODAY), true);
    // No due date: the server's count is all there is.
    assert.equal(billOverdue({ days_overdue: 3, balance_due: 10, due_date: null }, TODAY), true);
    assert.equal(billOverdue({ days_overdue: 0, balance_due: 10, due_date: null }, TODAY), false);
  });
});

/* ── Owed to you ─────────────────────────────────────────────────────────── */

describe("tile — Owed to you (GET /ledger/overview owedToYou)", () => {
  test("money owed needs you and links to the open reimbursements", () => {
    const t = owedTile({ owedToYou: 45.5 });
    assert.equal(t.state, "needs_you");
    assert.equal(t.headline, `You're owed ${fmtMoney(45.5)}`);
    assert.equal(t.route, "/app/services/stella_ledger_transactions?reimbursable=open");
  });
  test("nothing owed is clear; unreadable is 'couldn't check'", () => {
    assert.equal(owedTile({ owedToYou: 0 }).state, "clear");
    assert.equal(owedTile(null).state, "unknown");
  });
});

/* ── Month-end close ─────────────────────────────────────────────────────── */

describe("tile — Month-end close (GET /ledger/periods + last month's transactions)", () => {
  const sept = { period_start: "2026-09-01T00:00:00.000Z", period_end: "2026-09-30T00:00:00.000Z", status: "closed" };

  test("last month closed is clear and names the month", () => {
    const t = closeTile([sept], 12, TODAY);
    assert.equal(t.state, "clear");
    assert.equal(t.headline, "September 2026 is closed");
  });
  test("a closed quarter that covers last month counts; a reopened month does not", () => {
    assert.equal(monthClosed([{ period_start: "2026-07-01", period_end: "2026-09-30", status: "closed" }], "2026-09-01", "2026-09-30"), true);
    assert.equal(monthClosed([{ ...sept, status: "open" }], "2026-09-01", "2026-09-30"), false);
    assert.equal(monthClosed([{ period_start: "2026-09-01", period_end: "2026-09-15", status: "closed" }], "2026-09-01", "2026-09-30"), false);
  });
  test("last month open with transactions in it needs you, linked to Period Close", () => {
    const t = closeTile([], 4, TODAY);
    assert.equal(t.state, "needs_you");
    assert.equal(t.headline, "September 2026 isn't closed yet");
    assert.equal(t.route, "/app/services/stella_settings_period_close");
    assert.equal(t.linkLabel, "Settings → Period Close");
  });
  test("last month open with nothing recorded is clear — nothing to close", () => {
    const t = closeTile([], 0, TODAY);
    assert.equal(t.state, "clear");
    assert.equal(t.headline, "Nothing to close");
  });
  test("last month's count unreadable, or periods unreadable, is 'couldn't check'", () => {
    assert.equal(closeTile([], null, TODAY).state, "unknown");
    assert.equal(closeTile(null, 4, TODAY).state, "unknown");
  });
  test("two closed halves close a month; a gap between them does not", () => {
    const first = { period_start: "2026-09-01", period_end: "2026-09-15", status: "closed" };
    const second = { period_start: "2026-09-16T00:00:00.000Z", period_end: "2026-09-30T00:00:00.000Z", status: "closed" };
    assert.equal(monthClosed([second, first], "2026-09-01", "2026-09-30"), true, "order does not matter");
    assert.equal(closeTile([first, second], 9, TODAY).headline, "September 2026 is closed");
    assert.equal(monthClosed([first, { ...second, period_start: "2026-09-17" }], "2026-09-01", "2026-09-30"), false, "the 16th is open");
    assert.equal(monthClosed([first, { ...second, status: "open" }], "2026-09-01", "2026-09-30"), false);
    // Overlaps and a closed year still count.
    assert.equal(monthClosed([{ period_start: "2026-08-20", period_end: "2026-09-20", status: "closed" }, second], "2026-09-01", "2026-09-30"), true);
    assert.equal(monthClosed([{ period_start: "2026-01-01", period_end: "2026-12-31", status: "CLOSED" }], "2026-09-01", "2026-09-30"), true);
    assert.equal(monthClosed([], "2026-09-01", "2026-09-30"), false);
  });
  test("last month's count leaves out voided lines; a month of only voided lines has nothing to close", () => {
    assert.equal(lastMonthBookCount(5, 5), 0);
    assert.equal(closeTile([], lastMonthBookCount(5, 5), TODAY).headline, "Nothing to close");
    assert.equal(lastMonthBookCount(7, 2), 5);
    assert.equal(lastMonthBookCount(0, null), 0, "nothing at all needs no void count");
    assert.equal(lastMonthBookCount(4, null), null, "lines there but the void count unreadable: unknown");
    assert.equal(lastMonthBookCount(null, 0), null);
  });
});

test("the four tiles, in order, each one plain sentence with a link and no code words", () => {
  const tiles = stellaNeedsYou({ overview: { inboxCount: 2, owedToYou: 10 }, apAging: { bills: [] }, periods: [], lastMonthCount: 3, today: TODAY });
  assert.deepEqual(tiles.map((t) => t.key), ["inbox", "bills", "owed", "close"]);
  assert.deepEqual(tiles.map((t) => t.title), ["Ledger inbox", "Bills", "Owed to you", "Month-end close"]);
  for (const t of tiles) {
    assert.match(t.detail, /[.]$/, `${t.key}: a sentence`);
    assert.match(t.route, /^\/app\/services\/stella_/);
    assert.doesNotMatch(`${t.headline} ${t.detail}`, /tenant|[A-Z]{3,}_[A-Z]/);
  }
});

/* ── The shared setup loader ─────────────────────────────────────────────── */

describe("loadStellaSetup — one list of reads for both pages", () => {
  function fakeApi(answers) {
    const calls = [];
    const answer = async (p) => {
      calls.push(p);
      if (!(p in answers)) throw new Error("STELLA API 500");
      return answers[p];
    };
    return { api: { get: answer, getFull: answer }, calls };
  }

  test("reads the six signals and builds the six steps from them", async () => {
    const R = STELLA_SETUP_READS;
    const { api, calls } = fakeApi({
      [R.plaidStatus]: { configured: true, itemCount: 1 },
      [R.plaidItems]: [{ item_id: "i1", institution_name: "First Fixture Bank", is_personal_card: true }],
      [R.coa]: [{ created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-02T10:00:00Z" }],
      [R.taxRates]: [{ is_active: true }],
      [R.categorized]: { pagination: { total: 2 } },
      [R.reconciled]: { pagination: { total: 1 } },
    });
    const s = await loadStellaSetup(api, null, "biz-1");
    assert.deepEqual([...calls].sort(), Object.values(R).sort());
    assert.equal(s.bookedCount, 3);
    assert.deepEqual(s.plaidStatus, { configured: true, itemCount: 1 });
    assert.equal(s.steps.length, 6);
    assert.deepEqual(s.steps.map((x) => x.done), [true, true, true, true, true, false]);
  });

  test("the accountant pack ticks from the download the API recorded, on any browser", async () => {
    // 2 Oct 2026 review: it ticked from this browser's localStorage only.
    const R = STELLA_SETUP_READS;
    const recorded = await loadStellaSetup(fakeApi({ [R.packExports]: [{ audit_log_id: "a1", action: "export" }] }).api, null, "biz-1");
    assert.equal(recorded.steps[5].key, "accountant_pack");
    assert.equal(recorded.steps[5].done, true);
    const none = await loadStellaSetup(fakeApi({ [R.packExports]: [] }).api, null, "biz-1");
    assert.equal(none.steps[5].done, false);
    // An older download remembered on this browser still counts.
    const store = { getItem: () => "1700000000000", setItem() {} };
    assert.equal((await loadStellaSetup(fakeApi({}).api, store, "biz-1")).steps[5].done, true);
    assert.equal(R.packExports, "/ledger/audit-log?entity_table=stella.accountant_pack&action=export&limit=1");
  });

  test("a broken bank connection on /ledger/plaid/items keeps step 1 open", async () => {
    const R = STELLA_SETUP_READS;
    const s = await loadStellaSetup(fakeApi({
      [R.plaidStatus]: { configured: true, itemCount: 1 },
      [R.plaidItems]: [{ item_id: "i1", institution_name: "First Fixture Bank", status: "login_required", error_code: "ITEM_LOGIN_REQUIRED" }],
    }).api, null, "biz-1");
    assert.equal(s.steps[0].done, false);
    assert.match(s.steps[0].detail, /needs attention/);
  });

  test("every failed read is null and its step a reminder — never a throw, never a tick", async () => {
    const { api } = fakeApi({});
    const s = await loadStellaSetup(api, null, null);
    assert.equal(s.plaidStatus, null);
    assert.equal(s.plaidItems, null);
    assert.equal(s.bookedCount, null);
    assert.equal(s.steps.every((x) => !x.done), true);
    assert.equal(await safeRead(Promise.reject(new Error("x"))), null);
  });
});

/* ── The page, rendered ──────────────────────────────────────────────────── */

const NOTHING_DONE = {
  plaidStatus: { configured: true, itemCount: 0 }, plaidItems: [], coa: [], taxRates: [], bookedCount: 0, accountantPackDownloaded: false,
};
const ALL_DONE = {
  plaidStatus: { configured: true, itemCount: 1 }, plaidItems: [{ is_personal_card: true }],
  coa: [{ created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-03T10:00:00Z" }], taxRates: [{ is_active: true }],
  bookedCount: 3, accountantPackDownloaded: true,
};

function render(setupSteps, needs, allowedServiceKeys = null, features = null) {
  const err = console.error;
  console.error = () => {};
  try {
    return renderToStaticMarkup(h(MemoryRouter, null, h(StellaDashboardView, { setupSteps, needs, allowedServiceKeys, features })));
  } finally {
    console.error = err;
  }
}

// What oliver-api lib/accountantRole.js gives an accountant (2 Oct 2026, with
// stella_dashboard added) — a fixture of the STELLA and Settings keys only.
const ACCOUNTANT_KEYS = [
  "stella_dashboard",
  "stella_ledger_overview", "stella_ledger_inbox", "stella_ledger_transactions", "stella_ledger_vendors",
  "stella_ledger_coa", "stella_ledger_mileage_materials", "stella_ledger_receipts", "stella_ledger_accounting",
  "stella_ledger_reports", "stella_bills", "stella_assets", "stella_budgets",
  "stella_settings_period_close", "stella_settings_sales_tax",
  "stella_report_library", "stella_report_builder", "stella_report_dashboards", "stella_report_scheduled", "stella_report_exports",
  "stella_db_registry", "stella_db_documents", "stella_db_import_history", "stella_db_compliance", "stella_db_tags",
];

const NEEDS = stellaNeedsYou({
  overview: { inboxCount: 3, owedToYou: 0 },
  apAging: null,
  periods: [],
  lastMonthCount: 5,
  today: TODAY,
});

describe("StellaDashboardView — the order on the page", () => {
  test("Finish setting up → What needs you → Go to", () => {
    const html = render(stellaSetupSteps(NOTHING_DONE), NEEDS);
    const setup = html.indexOf('data-tour="stella-finish-setup"');
    const needs = html.indexOf('data-tour="stella-dashboard-needs"');
    const go = html.indexOf('data-tour="stella-dashboard-shortcuts"');
    assert.ok(setup >= 0 && needs >= 0 && go >= 0, "all three are on the page");
    assert.ok(setup < needs && needs < go);
    assert.match(html, />Finish setting up</);
    assert.match(html, /0 of 6 done/);
  });

  test("each tile shows its answer and links to where the work is done", () => {
    const html = render(stellaSetupSteps(NOTHING_DONE), NEEDS);
    assert.match(html, /3 transactions to review/);
    assert.ok(html.includes('href="/app/services/stella_ledger_inbox"'));
    assert.match(html, /data-need="bills" data-state="unknown"/);
    assert.match(html, /Couldn&#x27;t check right now|Couldn't check right now/);
    assert.match(html, /September 2026 isn(&#x27;|')t closed yet/);
    assert.ok(html.includes('href="/app/services/stella_settings_period_close"'));
    assert.match(html, /2 of 4 need a look/);
  });

  test("the setup card's rows link to where each step is done", () => {
    const html = render(stellaSetupSteps(NOTHING_DONE), NEEDS);
    assert.ok(html.includes('href="/app/services/stella_settings_bank"'), "connect a bank or card");
    assert.ok(html.includes('href="/app/services/stella_ledger_coa"'), "chart of accounts");
    assert.ok(html.includes('href="/app/services/stella_settings_sales_tax"'), "sales tax");
  });

  test("nine shortcuts, one per main feature area, each a link; the plan badge where the nav shows one", () => {
    // The badge is the catalog's min_tier from the answer (2026-10-11), never
    // a letter written on the shortcut: with no answer there is no badge.
    const features = {
      stella_db_registry: { allowed: true, reason: "", needs: null, product: "stella", min_tier: "standard", addon: null, kind: "page", availability: "live" },
      stella_report_library: { allowed: true, reason: "", needs: null, product: "stella", min_tier: "standard", addon: null, kind: "page", availability: "live" },
    };
    const html = render(null, NEEDS, null, features);
    assert.equal((html.match(/data-shortcut="/g) || []).length, 9);
    for (const s of STELLA_SHORTCUTS) assert.ok(html.includes(`href="${s.route}"`), s.label);
    assert.equal((html.match(/data-shortcut-tag="S"/g) || []).length, 2, "Database Manager and Custom Reporting");
    assert.match(html, /title="Comes with the Standard plan"/);
    assert.equal((render(null, NEEDS).match(/data-shortcut-tag=/g) || []).length, 0, "no answer: no badge");
    assert.match(html, /The main parts of STELLA, one click away\./);
    assert.doesNotMatch(html, /Every part of STELLA/);
  });

  test("every step done: the card folds to one line; while setup is being read, no card", () => {
    assert.match(render(stellaSetupSteps(ALL_DONE), NEEDS), /Setup finished/);
    assert.doesNotMatch(render(null, NEEDS), /stella-finish-setup/);
  });

  test("nothing waiting says so in words", () => {
    const calm = stellaNeedsYou({ overview: { inboxCount: 0, owedToYou: 0 }, apAging: { bills: [] }, periods: [], lastMonthCount: 0, today: TODAY });
    assert.match(render(null, calm), /Nothing is waiting on you right now/);
  });

  test("a mix of clear and couldn't-check tiles never reads as an all-clear", () => {
    // 2 Oct 2026 review: plaid/status answered, the other reads failed, and four
    // "Couldn't check right now" tiles sat under "Nothing is waiting on you".
    const mixed = stellaNeedsYou({ overview: null, apAging: { bills: [] }, periods: null, lastMonthCount: null, today: TODAY });
    assert.deepEqual(mixed.map((t) => t.state), ["unknown", "clear", "unknown", "unknown"]);
    const line = needsSummary(mixed);
    assert.equal(line, "Nothing waiting that we could check — 3 couldn't be checked right now.");
    const html = render(null, mixed);
    assert.doesNotMatch(html, /Nothing is waiting on you right now/);
    assert.match(html, /3 couldn(&#x27;|')t be checked right now/);
    // All four unreadable, and needs-you plus unknown.
    const blind = stellaNeedsYou({ overview: null, apAging: null, periods: null, lastMonthCount: null, today: TODAY });
    assert.equal(needsSummary(blind), "None of these could be checked right now — open each one to see it.");
    assert.equal(needsSummary(NEEDS), "2 of 4 need a look, and 1 couldn't be checked right now.");
    const one = stellaNeedsYou({ overview: { inboxCount: 1, owedToYou: 0 }, apAging: { bills: [] }, periods: [], lastMonthCount: 0, today: TODAY });
    assert.equal(needsSummary(one), "1 of 4 needs a look.");
  });
});

/* ── The accountant's Dashboard and rail ─────────────────────────────────── */

describe("an accountant sees only what their own nav holds (2 Oct 2026 review)", () => {
  test("the accountant's rail target is in their filtered nav — never a page their menu drops", () => {
    const nav = {
      productName: "STELLA",
      groups: [
        { label: "", items: [{ key: "stella_dashboard", label: "Dashboard", route: "/app/services/stella_dashboard" }] },
        { label: "Ledger", items: [{ key: "stella_ledger_overview", label: "Overview", route: "/app/services/stella_ledger_overview" }] },
      ],
    };
    // The list as it was before the fix: no stella_dashboard.
    const before = ACCOUNTANT_KEYS.filter((k) => k !== "stella_dashboard");
    const target = railRouteFor("stella", nav, before);
    const menu = applyRoleNavFilter(nav, before).groups.flatMap((g) => g.items.map((i) => i.route));
    assert.equal(target, "/app/services/stella_ledger_overview");
    assert.ok(menu.includes(target), "the rail opens a page in the accountant's own menu");
    // With the server list fixed, the accountant lands on the Dashboard.
    assert.equal(railRouteFor("stella", nav, ACCOUNTANT_KEYS), "/app/services/stella_dashboard");
    // An owner (null list) and an unfiltered product are first-item-wins.
    assert.equal(railRouteFor("stella", nav, null), "/app/services/stella_dashboard");
    assert.equal(railRouteFor("spark", nav, ["nothing"]), "/app/services/stella_dashboard");
    assert.equal(firstNavRoute({ productName: "X", groups: [{ label: "", items: [] }] }), null);
  });

  test("AppShell takes the rail target from the role-filtered nav", () => {
    const shell = read("components/AppShell.tsx");
    assert.match(shell, /return railRouteFor\(key, SUB_NAV_CONFIGS\[key\], allowedServiceKeys\) \?\? "\/app\/overview";/);
    assert.match(shell, /navigate\(defaultRouteFor\(key, effectiveIsFounder, roleInfo\.allowedServiceKeys\)\)/);
    const filter = read("components/navRoleFilter.ts");
    assert.match(filter, /export const ROLE_FILTERED_PRODUCTS: readonly string\[\] = \["oliver", "stella"\];/);
  });

  test("an accountant's Dashboard: no bank setup steps, no Unit Economics, Settings → Period Close", () => {
    const steps = setupStepsFor(stellaSetupSteps(NOTHING_DONE), ACCOUNTANT_KEYS);
    assert.deepEqual(steps.map((s) => s.key), ["coa", "sales_tax", "first_statement", "accountant_pack"]);
    // Not-switched-on keys route step 1 to Accounting, which they DO have — it still goes (owner's act).
    const offSteps = setupStepsFor(stellaSetupSteps({ ...NOTHING_DONE, plaidStatus: { configured: false, itemCount: 0 } }), ACCOUNTANT_KEYS);
    assert.ok(!offSteps.some((s) => s.key === "bank"));
    const cuts = shortcutsFor(ACCOUNTANT_KEYS);
    assert.ok(!cuts.some((s) => s.key === "unit_economics"));
    const settings = cuts.find((s) => s.key === "settings");
    assert.equal(settings.route, "/app/services/stella_settings_period_close");
    assert.equal(settings.detail, "Sales tax and period close.");
    for (const s of cuts) assert.ok(ACCOUNTANT_KEYS.includes(routeServiceKey(s.route)), s.label);

    const html = render(stellaSetupSteps(NOTHING_DONE), NEEDS, ACCOUNTANT_KEYS);
    assert.ok(!html.includes('href="/app/services/stella_settings_bank"'), "no link to the bank page anywhere");
    assert.ok(!html.includes('href="/app/services/stella_ue_margins"'), "no Unit Economics shortcut");
    assert.doesNotMatch(html, /Connect your bank and card|Mark your personal card/);
    assert.match(html, /0 of 4 done/);
    assert.ok(html.includes('href="/app/services/stella_settings_period_close"'));
  });

  test("an owner sees everything; a tile whose page is not in the nav is not drawn", () => {
    assert.equal(setupStepsFor(stellaSetupSteps(NOTHING_DONE), null).length, 6);
    assert.equal(shortcutsFor(null), STELLA_SHORTCUTS);
    assert.equal(shortcutsFor(null).find((s) => s.key === "settings").detail, "Bank and card accounts, sales tax and period close.");
    assert.equal(needsFor(NEEDS, null).length, 4);
    assert.deepEqual(needsFor(NEEDS, ACCOUNTANT_KEYS.filter((k) => k !== "stella_bills")).map((t) => t.key), ["inbox", "owed", "close"]);
    assert.equal(setupStepsFor(null, ACCOUNTANT_KEYS), null);
    assert.equal(routeServiceKey("/app/services/stella_bills?filter=open"), "stella_bills");
  });

  test("the page hands the person's nav allowlist to the view", () => {
    const page = read("pages/stella/StellaDashboardPage.tsx");
    assert.match(page, /const \{ roleInfo \} = useOliverRole\(\);/);
    assert.match(page, /<StellaDashboardView setupSteps=\{setupSteps\} needs=\{needs\} allowedServiceKeys=\{roleInfo\.allowedServiceKeys\} features=\{featureGate\.features\} \/>/);
  });
});

/* ── A refusal that will not go away ─────────────────────────────────────── */

describe("a 403 is not 'we couldn't reach your books just now'", () => {
  test("STELLA not on the plan, or this person not given it, is told apart from a blip", () => {
    assert.equal(accessFromFailures([{ type: "tier_gate", tierRequired: "standard" }]), "not_in_plan");
    const denied = Object.assign(new Error("Your account has not been granted access to STELLA for this business."), { status: 403 });
    assert.equal(accessFromFailures([new Error("Failed to fetch"), denied]), "no_access");
    assert.equal(accessFromFailures([denied, { type: "tier_gate" }]), "not_in_plan");
    assert.equal(accessFromFailures([Object.assign(new Error("x"), { status: 500 }), new Error("Failed to fetch")]), null);
    assert.equal(accessFromFailures([]), null);
    for (const k of Object.keys(STELLA_ACCESS_SENTENCES)) {
      const s = STELLA_ACCESS_SENTENCES[k];
      assert.match(s.detail, /[.]$/);
      assert.doesNotMatch(`${s.title} ${s.detail}`, /tenant|403|[A-Z]{3,}_[A-Z]|as soon as/i);
    }
  });

  test("the page shows the access sentence, not the retry card, when every read was refused for good", () => {
    const page = read("pages/stella/StellaDashboardPage.tsx");
    assert.match(page, /setAccess\(none \? accessFromFailures\(failures\) : null\);/);
    assert.match(page, /\{unreachable && access \? \(/);
    assert.match(page, /STELLA_ACCESS_SENTENCES\[access\]\.title/);
  });
});

/* ── Names: the catalog's and the nav's own words ────────────────────────── */

describe("names and wiring a typecheck cannot see", () => {
  const nav = read("components/SubNav.tsx");
  const stellaNav = nav.slice(nav.indexOf("const STELLA_NAV"), nav.indexOf("const SETTINGS_NAV"));
  const settingsNav = nav.slice(nav.indexOf("const SETTINGS_NAV"), nav.indexOf("export const SETTINGS_KEYS"));

  test("every shortcut label is the catalog's displayName or the STELLA nav's group label", () => {
    const byRoute = new Map(SERVICE_CATALOG.map((s) => [s.route, s]));
    const groupLabels = [...stellaNav.matchAll(/label: "([^"]+)", icon:/g)].map((m) => m[1]);
    for (const s of STELLA_SHORTCUTS) {
      const page = byRoute.get(s.route);
      assert.ok(page, `${s.label}: ${s.route} is a catalog route`);
      const fromCatalog = page.displayName === s.label;
      const fromNav = groupLabels.includes(s.label) || (s.label === "Settings" && /productName: "Settings"/.test(settingsNav));
      assert.ok(fromCatalog || fromNav, `${s.label} is not a name the catalog or the nav uses`);
    }
    assert.deepEqual(STELLA_SHORTCUTS.map((s) => s.label),
      ["Ledger", "Bills", "Assets", "Budgets", "Unit Economics", "Database Manager", "Reports", "Custom Reporting", "Settings"]);
  });

  test("a gated shortcut carries the badge the nav shows on that area's first item", () => {
    for (const s of STELLA_SHORTCUTS) {
      const key = s.route.match(/\/app\/services\/([a-z_]+)/)[1];
      // The STELLA nav, or (for Settings) the Settings nav.
      const row = (stellaNav + settingsNav).match(new RegExp(`\\{ key: "${key}"[^\\n]*\\}`));
      assert.ok(row, `${s.label}: ${key} is in the nav`);
      const navBadge = /planBadge: /.test(row[0]);
      assert.equal(s.badgeKey ?? null, navBadge ? key : null, `${s.label}: badge matches the nav`);
      assert.doesNotMatch(row[0], /tag: \{ label: "(S|Pro|Business)"/, `${s.label}: the nav writes no plan letter of its own`);
    }
  });

  test("a group shortcut opens what clicking that group's header opens — its first item", () => {
    for (const [label, route] of [["Ledger", "stella_ledger_overview"], ["Unit Economics", "stella_ue_margins"], ["Database Manager", "stella_db_registry"], ["Custom Reporting", "stella_report_library"]]) {
      const at = stellaNav.indexOf(`label: "${label}", icon:`);
      const firstRoute = stellaNav.slice(at).match(/route: "\/app\/services\/([a-z_]+)"/)[1];
      assert.equal(firstRoute, route, label);
      assert.equal(STELLA_SHORTCUTS.find((s) => s.label === label).route, `/app/services/${route}`);
    }
    const stellaSettings = settingsNav.slice(settingsNav.indexOf('label: "STELLA"'));
    assert.equal(stellaSettings.match(/route: "([^"]+)"/)[1], "/app/services/stella_settings_bank", "Settings opens STELLA's first settings page");
  });

  test("Dashboard is the FIRST item of the STELLA nav, alone in a label-less group, ahead of Ledger", () => {
    const firstKey = stellaNav.match(/key: "([a-z_]+)"/)[1];
    assert.equal(firstKey, "stella_dashboard");
    assert.match(stellaNav, /label: "",\s*items: \[\{ key: "stella_dashboard", label: "Dashboard", route: "\/app\/services\/stella_dashboard"(, everyTier: "[^"]+")? \}\],/);
    assert.ok(stellaNav.indexOf("stella_dashboard") < stellaNav.indexOf('label: "Ledger"'));
  });

  test("the same shape OLIVER, SPARK and ARION use for their Dashboard", () => {
    for (const [name, key] of [["OLIVER_NAV", "oliver_dashboard"], ["SPARK_NAV", "spark_overview"], ["ARION_NAV", "arion_dashboard"]]) {
      const block = nav.slice(nav.indexOf(`const ${name}`));
      assert.equal(block.match(/key: "([a-z_]+)"/)[1], key, `${name} opens on its Dashboard`);
      assert.match(block.slice(0, block.indexOf(key) + 80), new RegExp(`key: "${key}", label: "Dashboard"`));
    }
  });

  test("the rail icon opens a product's first nav item (first-item-wins)", () => {
    // 2 Oct 2026: the loop moved to navRoleFilter.firstNavRoute, which
    // AppShell's defaultRouteFor reaches through railRouteFor.
    const filter = read("components/navRoleFilter.ts");
    assert.match(filter, /for \(const group of config\.groups\) \{\s*if \(group\.items\.length > 0\) return group\.items\[0\]\.route;/);
  });

  test("the Ledger keeps its own Overview as the Ledger group's first item", () => {
    const ledger = stellaNav.slice(stellaNav.indexOf('label: "Ledger"'));
    assert.equal(ledger.match(/key: "([a-z_]+)"/)[1], "stella_ledger_overview");
    const router = read("pages/ServiceRouter.tsx");
    assert.match(router, /case 'stella_ledger_overview': stellaPage = <StellaOverviewPage \/>; break;/);
  });

  test("catalog row, route, and the legacy aliases landing on the Dashboard", () => {
    const row = SERVICE_CATALOG.find((s) => s.key === "stella_dashboard");
    assert.ok(row);
    assert.equal(row.displayName, "Dashboard");
    assert.equal(row.section, "STELLA");
    assert.equal("defaultStatus" in row, false, "live or not is the feature catalog's availability");
    assert.equal(row.route, "/app/services/stella_dashboard");
    // First STELLA row in the catalog, like the nav.
    assert.equal(SERVICE_CATALOG.find((s) => s.section === "STELLA").key, "stella_dashboard");
    const router = read("pages/ServiceRouter.tsx");
    assert.match(router, /case 'stella_dashboard': stellaPage = <StellaDashboardPage \/>; break;/);
    assert.match(router, /service\.key === 'stella_coming'\) return <Navigate to="\/app\/services\/stella_dashboard" replace \/>/);
    assert.match(router, /service\.key === 'stella_expenses_coming'\) return <Navigate to="\/app\/services\/stella_dashboard" replace \/>/);
    assert.doesNotMatch(router, /<Navigate to="\/app\/services\/stella_ledger_overview"/);
  });

  test("the page reads each tile's answer from a real endpoint, and the setup through the shared loader", () => {
    const page = read("pages/stella/StellaDashboardPage.tsx");
    for (const p of ['"/ledger/overview"', '"/ledger/ap-aging"', '"/ledger/periods"', "`/ledger/transactions?from=${start}&to=${end}&limit=1`",
      "`/ledger/transactions?from=${start}&to=${end}&status=void&limit=1`"]) {
      assert.ok(page.includes(p), p);
    }
    assert.match(page, /lastMonthCount: lastMonthBookCount\(/);
    assert.match(page, /loadStellaSetup\(\{ get, getFull \}, browserStorage\(\), businessId\)/);
    // Once per visit: the effect keys on ready + the stable reload only.
    assert.match(page, /useEffect\(\(\) => \{\s*if \(ready\) reload\(\);\s*\}, \[ready, reload\]\);/);
  });

  test("the guided tour teaches the Dashboard first, and its spotlights exist on the page", () => {
    const keys = Object.keys(STELLA_PAGES);
    assert.equal(keys[0], "stella_dashboard");
    const html = render(stellaSetupSteps(NOTHING_DONE), NEEDS);
    for (const step of STELLA_PAGES.stella_dashboard.onPage) {
      const attr = step.targetSelector.match(/data-tour="([^"]+)"/)[1];
      assert.ok(html.includes(`data-tour="${attr}"`), attr);
    }
  });

  test("Bills opens already filtered when the tile links with ?filter=", () => {
    const bills = read("pages/stella/StellaBillsPage.tsx");
    assert.match(bills, /const asked = params\.get\("filter"\) \|\| "";/);
    assert.match(bills, /useState\(FILTER_PILLS\.some\(\(p\) => p\.key === asked\) \? asked : "all"\)/);
    for (const k of ["overdue", "open"]) assert.match(bills, new RegExp(`\\{ key: "${k}", label:`));
  });
});

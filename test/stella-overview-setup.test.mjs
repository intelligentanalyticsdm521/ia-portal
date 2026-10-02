// STELLA's "Finish setting up" steps — and the Ledger Overview without them.
//
// Brandon, 1 Oct 2026: "STELLA is the only section that doesn't have its own
// overview. All the rest have a main overview with the key points; this is
// helpful for things like 'Finish Setup' that I need to do for STELLA to
// connect my accounts through Plaid."
// Brandon, 2 Oct 2026: STELLA's own Dashboard is "where the platform cross
// features stuff lives, like finish set up". The independent review of the
// same day found the six-step card on BOTH the Dashboard and Ledger →
// Overview; it now lives only on the Dashboard.
//
// What has to stay true:
//   • six steps, each ticked from the business's own data (never by hand),
//     each a link to the screen that does it — stellaSetupSteps.ts
//   • a bank connection that needs attention keeps step 1 open
//   • the card folds to one line with "Show setup" once every step is done
//   • Ledger → Overview draws no setup card and reads no setup signals
//   • ONE checklist drawing, shared with SPARK — not a third copy
//
// MUTATION CHECKS (each broken on purpose, seen red, restored):
//   · coaMadeOwn — drop the `updated_at` test        → "an edited account …" RED
//   · bankStep — ignore `configured`                 → "keys not switched on …" RED
//   · bankStep — ignore the broken-connection count  → "a connection that needs attention …" RED
//   · StellaOverviewView — draw <StellaFinishSetup> again
//                                                    → "Ledger → Overview draws no setup card" RED
//   · StellaFinishSetup — drop the `finished && !shown` branch
//                                                    → "folds away … Show setup" RED
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import {
  STELLA_SETUP_ROUTES, COA_ADDED_LATER_MS,
  bankStep, personalCardStep, coaStep, coaMadeOwn, salesTaxStep, firstStatementStep, accountantPackStep,
  stellaSetupSteps, allStepsDone, packKey, markPackDownloaded, packDownloaded,
} from "../src/pages/stella/stellaSetupSteps.ts";
import { StellaOverviewView } from "../src/pages/stella/StellaOverviewView.tsx";
import { StellaFinishSetup } from "../src/pages/stella/StellaDashboardView.tsx";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const NOTHING_DONE = {
  plaidStatus: { configured: false, itemCount: 0 },
  plaidItems: [],
  coa: [{ created_at: "2026-09-01T10:00:00Z", updated_at: null }],
  taxRates: [],
  bookedCount: 0,
  accountantPackDownloaded: false,
};
const ALL_DONE = {
  plaidStatus: { configured: true, itemCount: 1 },
  plaidItems: [{ is_personal_card: true, status: "active", error_code: null }],
  coa: [{ created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-03T10:00:00Z" }],
  taxRates: [{ is_active: true }],
  bookedCount: 3,
  accountantPackDownloaded: true,
};

/* ── Step 1 — Connect your bank and card ─────────────────────────────────── */

describe("step 1 — Connect your bank and card", () => {
  test("not done with no connection; links to Settings → Bank", () => {
    const s = bankStep({ configured: true, itemCount: 0 });
    assert.equal(s.done, false);
    assert.equal(s.route, STELLA_SETUP_ROUTES.bank);
    assert.equal(s.route, "/app/services/stella_settings_bank");
    assert.equal(s.linkLabel, "Settings → Bank and card accounts");
  });

  test("done once itemCount > 0", () => {
    const s = bankStep({ configured: true, itemCount: 2 });
    assert.equal(s.done, true);
    assert.match(s.detail, /2 connections/);
    assert.equal(bankStep({ configured: true, itemCount: 1 }).detail.includes("1 connection)"), true);
  });

  test("keys not switched on here: the step says import a statement and links to Accounting", () => {
    const s = bankStep({ configured: false, itemCount: 0 });
    assert.equal(s.done, false);
    assert.equal(s.route, "/app/services/stella_ledger_accounting?tab=reconcile");
    assert.equal(s.linkLabel, "Accounting → Bank Reconciliation");
    assert.match(s.detail, /use Import a bank statement/);
    assert.doesNotMatch(s.detail, /plaid/i, "no vendor name in the sentence");
  });

  test("keys not switched on but a connection already on file: ticked, and still points at the statement import", () => {
    const s = bankStep({ configured: false, itemCount: 1 });
    assert.equal(s.done, true);
    assert.equal(s.route, "/app/services/stella_ledger_accounting?tab=reconcile");
    assert.match(s.detail, /1 connection is on file/);
    assert.match(s.detail, /Import a bank statement/);
  });

  test("status unreadable: a reminder pointing at the Bank page, not a tick", () => {
    const s = bankStep(null);
    assert.equal(s.done, false);
    assert.equal(s.route, STELLA_SETUP_ROUTES.bank);
  });

  test("a connection that needs attention keeps the step open, says so, and links to the Bank page", () => {
    // 2 Oct 2026 review: itemCount counts every row not removed, so a feed the
    // sync marked login_required read "Connected — new transactions come in on
    // their own" while the Bank page said "Connection needs attention".
    const status = { configured: true, itemCount: 1 };
    const s = bankStep(status, [{ status: "login_required", error_code: "ITEM_LOGIN_REQUIRED" }]);
    assert.equal(s.done, false);
    assert.equal(s.detail, "A bank connection needs attention, so new transactions from it aren't coming in.");
    assert.equal(s.route, "/app/services/stella_settings_bank");
    assert.equal(s.linkLabel, "Settings → Bank and card accounts");
    // A failed sync with no Plaid code still sets status 'error'.
    assert.equal(bankStep(status, [{ status: "error", error_code: null }]).done, false);
    const two = bankStep({ configured: true, itemCount: 3 }, [{ status: "error" }, { status: "active" }, { error_code: "ITEM_LOCKED" }]);
    assert.match(two.detail, /^2 bank connections need attention/);
    // Healthy connections tick as before.
    assert.equal(bankStep(status, [{ status: "active", error_code: null }]).done, true);
    // And the six-step builder hands the items in.
    assert.equal(stellaSetupSteps({ ...ALL_DONE, plaidItems: [{ is_personal_card: true, status: "login_required" }] })[0].done, false);
    assert.equal(stellaSetupSteps(ALL_DONE)[0].done, true);
  });
});

/* ── Step 2 — Mark your personal card ────────────────────────────────────── */

describe("step 2 — Mark your personal card", () => {
  test("done when a connected account has the personal-card switch on", () => {
    assert.equal(personalCardStep([{ is_personal_card: false }, { is_personal_card: true }]).done, true);
    assert.equal(personalCardStep([{ is_personal_card: 1 }]).done, true);
  });

  test("not done when no switch is on, or nothing is connected, or the list is unreadable", () => {
    const off = personalCardStep([{ is_personal_card: false }, { is_personal_card: null }]);
    assert.equal(off.done, false);
    assert.match(off.detail, /turn on its personal-card switch/);
    const none = personalCardStep([]);
    assert.equal(none.done, false);
    assert.match(none.detail, /Once your cards are connected/);
    assert.equal(personalCardStep(null).done, false);
  });

  test("links to Settings → Bank, where the switch is", () => {
    assert.equal(personalCardStep([]).route, STELLA_SETUP_ROUTES.bank);
  });
});

/* ── Step 3 — Confirm your chart of accounts ─────────────────────────────── */

describe("step 3 — Confirm your chart of accounts", () => {
  const seeded = [
    { created_at: "2026-09-01T10:00:00Z", updated_at: null },
    { created_at: "2026-09-01T10:00:02Z", updated_at: null },
    { created_at: "2026-09-01T10:00:04Z", updated_at: null },
  ];

  test("the chart exactly as first set up is not done", () => {
    assert.equal(coaMadeOwn(seeded), false);
    const s = coaStep(seeded);
    assert.equal(s.done, false);
    assert.match(s.detail, /rename, add or hide/);
    assert.equal(s.route, "/app/services/stella_ledger_coa");
  });

  test("an edited account (updated_at is only set by a saved edit) is done", () => {
    assert.equal(coaMadeOwn([...seeded.slice(1), { created_at: "2026-09-01T10:00:00Z", updated_at: "2026-09-02T08:00:00Z" }]), true);
  });

  test("an account added after the first setup is done", () => {
    const later = new Date(Date.parse("2026-09-01T10:00:00Z") + COA_ADDED_LATER_MS + 1000).toISOString();
    assert.equal(coaMadeOwn([...seeded, { created_at: later, updated_at: null }]), true);
  });

  test("an empty or unreadable chart is not done, and the empty one says how to start", () => {
    assert.equal(coaMadeOwn([]), false);
    assert.equal(coaMadeOwn(null), false);
    assert.match(coaStep([]).detail, /one click/);
  });
});

/* ── Step 4 — Set your sales-tax rate ────────────────────────────────────── */

describe("step 4 — Set your sales-tax rate", () => {
  test("done when an active rate is set", () => {
    assert.equal(salesTaxStep([{ is_active: true }]).done, true);
    assert.match(salesTaxStep([{ is_active: true }, { is_active: true }]).detail, /2 rates are set/);
  });

  test("not done with no rates, only retired rates, or an unreadable list", () => {
    assert.equal(salesTaxStep([]).done, false);
    assert.equal(salesTaxStep([{ is_active: false }]).done, false);
    assert.equal(salesTaxStep(null).done, false);
  });

  test("links to Settings → Sales tax", () => {
    assert.equal(salesTaxStep([]).route, "/app/services/stella_settings_sales_tax");
    assert.equal(salesTaxStep([]).linkLabel, "Settings → Sales tax");
  });
});

/* ── Step 5 — Review your first statement ────────────────────────────────── */

describe("step 5 — Review your first statement", () => {
  test("done when any transaction is booked", () => {
    assert.equal(firstStatementStep(1).done, true);
    assert.equal(firstStatementStep(240).done, true);
  });
  test("not done with none booked, or unknown", () => {
    assert.equal(firstStatementStep(0).done, false);
    assert.equal(firstStatementStep(null).done, false);
    assert.equal(firstStatementStep(0).route, "/app/services/stella_ledger_inbox");
  });
});

/* ── Step 6 — Accountant pack ────────────────────────────────────────────── */

describe("step 6 — Accountant pack", () => {
  test("done once downloaded; links to Reports → Accountant pack", () => {
    assert.equal(accountantPackStep(true).done, true);
    assert.equal(accountantPackStep(false).done, false);
    assert.equal(accountantPackStep(false).route, "/app/services/stella_ledger_reports?open=accountant_pack");
    assert.equal(accountantPackStep(false).linkLabel, "Reports → Accountant pack");
  });

  test("a download from this browser is also remembered per business (the API record is the main signal)", () => {
    const m = new Map();
    const store = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) };
    assert.equal(packDownloaded(store, "biz-a"), false);
    markPackDownloaded(store, "biz-a", 1700000000000);
    assert.equal(packDownloaded(store, "biz-a"), true);
    assert.equal(packDownloaded(store, "biz-b"), false, "another business is its own");
    assert.equal(packKey(null), "stella_accountant_pack_downloaded:self");
    assert.equal(packDownloaded(null, "biz-a"), false);
    const blocked = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
    assert.doesNotThrow(() => markPackDownloaded(blocked, "biz-a", 1));
    assert.equal(packDownloaded(blocked, "biz-a"), false);
  });
});

/* ── The six together ────────────────────────────────────────────────────── */

test("six steps, in order, each with a title, one sentence, a route and the words for it", () => {
  const steps = stellaSetupSteps(NOTHING_DONE);
  assert.deepEqual(steps.map((s) => s.label), [
    "Connect your bank and card",
    "Mark your personal card",
    "Confirm your chart of accounts",
    "Set your sales-tax rate",
    "Review your first statement",
    "Accountant pack",
  ]);
  for (const s of steps) {
    assert.ok(s.detail && /[.]$/.test(s.detail), `${s.key}: one sentence ending in a full stop`);
    assert.match(s.route, /^\/app\/services\/stella_/);
    assert.ok(s.linkLabel);
    assert.doesNotMatch(`${s.label} ${s.detail}`, /tenant/i);
  }
  assert.equal(allStepsDone(steps), false);
  assert.equal(allStepsDone(stellaSetupSteps(ALL_DONE)), true);
  assert.equal(allStepsDone([]), false);
});

/* ── Ledger → Overview: no setup card ────────────────────────────────────── */

const OV = {
  month: "2026-10", income: 1200, expenses: -300, net: 900, owedToYou: 0, inboxCount: 2,
  expensesByAccount: [], cashflow: [], upcomingRecurring: [], accounts: [],
};

function quiet(fn) {
  // react-router's <Link> warns about useLayoutEffect on the server; that is
  // noise for this test, not a finding.
  const err = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = err;
  }
}

function renderOverview() {
  return quiet(() => renderToStaticMarkup(
    h(MemoryRouter, null, h(StellaOverviewView, { ov: OV, month: "2026-10", isCurrentMonth: true, plaidItems: [] })),
  ));
}

function renderSetup(steps) {
  return quiet(() => renderToStaticMarkup(h(MemoryRouter, null, h(StellaFinishSetup, { steps }))));
}

describe("Ledger → Overview — the Ledger's own overview, without the setup card", () => {
  test("Ledger → Overview draws no setup card: money numbers, then the headline, then the charts", () => {
    const html = renderOverview();
    assert.doesNotMatch(html, /stella-finish-setup/);
    assert.doesNotMatch(html, /Finish setup|Finish setting up|of 6 done|Mark your personal card/);
    const kpi = html.indexOf('data-tour="stella-overview-kpis"');
    const hero = html.indexOf('data-tour="stella-overview-hero"');
    const charts = html.indexOf("Cash flow — last 8 weeks");
    assert.ok(kpi >= 0 && hero > kpi && charts > hero);
    for (const label of ["Money in", "Money out", "Net", "Owed to you"]) assert.ok(html.indexOf(label) < hero, label);
  });
});

/* ── The checklist card (drawn on the Dashboard) ─────────────────────────── */

describe("StellaFinishSetup — the card", () => {
  test("the card shows the six steps, 0 of 6 done, each a link to its page", () => {
    const html = renderSetup(stellaSetupSteps(NOTHING_DONE));
    assert.match(html, />Finish setting up</);
    assert.match(html, /0 of 6 done/);
    for (const label of ["Connect your bank and card", "Mark your personal card", "Confirm your chart of accounts",
      "Set your sales-tax rate", "Review your first statement", "Accountant pack"]) {
      assert.ok(html.includes(label), label);
    }
    assert.ok(html.includes('href="/app/services/stella_ledger_accounting?tab=reconcile"'), "statement import when keys are off");
    assert.ok(html.includes('href="/app/services/stella_settings_bank"'));
    assert.ok(html.includes('href="/app/services/stella_ledger_reports?open=accountant_pack"'));
    assert.equal((html.match(/aria-label="Done"/g) || []).length, 0);
  });

  test("a done step carries a tick", () => {
    const html = renderSetup(stellaSetupSteps({ ...NOTHING_DONE, taxRates: [{ is_active: true }], bookedCount: 4 }));
    assert.match(html, /2 of 6 done/);
    assert.equal((html.match(/aria-label="Done"/g) || []).length, 2);
  });

  test("every step done: the card folds away to one line with Show setup", () => {
    const html = renderSetup(stellaSetupSteps(ALL_DONE));
    assert.match(html, /Setup finished/);
    assert.match(html, />Show setup</);
    assert.doesNotMatch(html, /Mark your personal card/);
    assert.doesNotMatch(html, /of 6 done/);
  });

  test("while the setup data is still being read, no card at all (no flicker)", () => {
    assert.equal(renderSetup(null), "");
  });
});

/* ── Wiring a typecheck cannot see ───────────────────────────────────────── */

describe("one checklist drawing, and the links land where they say", () => {
  test("SPARK and STELLA draw the same SetupChecklistCard — no third copy", () => {
    const spark = read("components/spark/SparkSetupChecklist.tsx");
    const view = read("pages/stella/StellaDashboardView.tsx");
    assert.match(spark, /from '\.\.\/SetupChecklistCard'/);
    assert.match(spark, /<SetupChecklistCard/);
    assert.match(view, /from "\.\.\/\.\.\/components\/SetupChecklistCard"/);
    assert.match(view, /<SetupChecklistCard/);
    // Neither keeps its own row drawing.
    assert.doesNotMatch(spark, /function Row\(/);
    assert.doesNotMatch(view, /function Row\(/);
  });

  test("the Dashboard reads every step's signal from the API through the one shared loader", () => {
    const loader = read("pages/stella/stellaSetupLoad.ts");
    for (const p of ["/ledger/plaid/status", "/ledger/plaid/items", "/ledger/coa", "/ledger/tax-rates",
      "/ledger/transactions?status=categorized&limit=1", "/ledger/transactions?status=reconciled&limit=1",
      "/ledger/audit-log?entity_table=stella.accountant_pack&action=export&limit=1"]) {
      assert.ok(loader.includes(`"${p}"`), p);
    }
    assert.match(loader, /accountantPackDownloaded: packRecorded \|\| packDownloaded\(storage, businessId\)/);
    const dash = read("pages/stella/StellaDashboardPage.tsx");
    assert.match(dash, /loadStellaSetup\(\{ get, getFull \}, browserStorage\(\), businessId\)/);
  });

  test("Ledger → Overview reads no setup signals — only the connections its Accounts card lists", () => {
    const page = read("pages/stella/StellaOverviewPage.tsx");
    const view = read("pages/stella/StellaOverviewView.tsx");
    const code = (s) => s.replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code(page), /loadStellaSetup|setupSteps|stellaSetupSteps/);
    assert.doesNotMatch(code(view), /StellaFinishSetup|SetupChecklistCard|setupSteps/);
    assert.match(page, /safeRead\(get<PlaidItemSummary\[\]>\("\/ledger\/plaid\/items"\)\)/);
    assert.doesNotMatch(page, /what's left to set up/);
  });

  test("Accounting opens the tab ?tab= names; Reports opens the pack on ?open=accountant_pack", () => {
    const accounting = read("pages/stella/accounting/AccountingPage.tsx");
    assert.match(accounting, /const ACCOUNTING_TABS = \["opening", "journal", "reconcile", "audit"\]/);
    assert.match(accounting, /useState\(ACCOUNTING_TABS\.includes\(asked\) \? asked : "journal"\)/);
    const reports = read("pages/stella/StellaReportsPage.tsx");
    assert.match(reports, /params\.get\("open"\) === "accountant_pack"/);
    const pack = read("pages/stella/accounting/AccountantPack.tsx");
    assert.match(pack, /markPackDownloaded\(window\.localStorage, businessId, Date\.now\(\)\)/);
  });
});

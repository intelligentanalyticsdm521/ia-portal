// STELLA pack 2 — the Portal half. Source-pinned, like stella-pack1-ui: these
// are wiring and WORDING facts a typecheck cannot see.
//
// What has to stay true:
//   • Bills exists as a real page over the real routes, and nothing about money
//     on it is arithmetic the browser did
//   • the last placeholder is gone from Reports — AP Aging reads open bills
//   • Cash Flow is a STATEMENT and says whether it reconciles; a page that does
//     not reconcile tells the reader not to file it
//   • Sales Tax is a return per jurisdiction, and the page says out loud that
//     the business keeps the rates current
//   • a taxpayer id is the last four on screen, whole only in the download
//   • a learned suggestion is shown with the rule NAMED and is never applied
//     by the page
//   • the register shows a padlock on a closed month, and deposit grouping
//     appears only when there is money waiting to be banked
//   • an accountant who has the bookkeeping and NOT the field-service product
//     can still be resolved
//   • no STELLA surface says "tenant" to a human
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const bills = read("pages/stella/StellaBillsPage.tsx");
const assets = read("pages/stella/StellaAssetsPage.tsx");
const budgets = read("pages/stella/StellaBudgetsPage.tsx");
const salesTax = read("pages/stella/StellaSalesTaxPage.tsx");
const reportsPage = read("pages/stella/StellaReportsPage.tsx");
const ten99 = read("pages/stella/Ten99Download.tsx");
const deposits = read("pages/stella/DepositGroupingPanel.tsx");
const txnsPage = read("pages/stella/StellaTransactionsPage.tsx");
const inbox = read("pages/stella/StellaLedgerInboxPage.tsx");
const roleHook = read("hooks/useOliverRole.ts");
const catalog = read("config/serviceCatalog.ts");
const subnav = read("components/SubNav.tsx");
const router = read("pages/ServiceRouter.tsx");

/* ── Item 1 — bills ──────────────────────────────────────────────────────── */

test("Bills is a real page over the real routes", () => {
  assert.match(bills, /\/ledger\/bills\?limit=200/);
  assert.match(bills, /post<\{ bill_id: string; total: number; journal_entries: number \}>\("\/ledger\/bills"/);
  assert.match(bills, /\/ledger\/bills\/\$\{bill\.bill_id\}\/payments/);
  assert.match(bills, /\/ledger\/bill-payments\/\$\{id\}/);
});

test("the money on the bills page is the API's answer, not the browser's", () => {
  // The page may TOTAL what it is showing; it must not recompute a balance or a
  // status, which are the server's derived answers (one writer, migration 206).
  assert.ok(!/balance_due\s*=\s*/.test(bills), "the page is computing a balance itself");
  assert.ok(!/status\s*=\s*"paid"/.test(bills), "the page is deciding a bill is paid");
  assert.match(bills, /\{fmtMoney\(bill\.balance_due\)\}/);
});

test("the page explains where a bill lands, in a sentence", () => {
  assert.match(bills, /goes into your books the day it is dated/);
  assert.match(bills, /Reports → AP Aging/);
});

test("Bills, Assets and Budgets are in the catalog, the nav and the router", () => {
  for (const key of ["stella_bills", "stella_assets", "stella_budgets", "stella_settings_sales_tax"]) {
    assert.ok(catalog.includes(`'${key}'`), `${key} is not in the service catalog`);
    assert.ok(subnav.includes(`"${key}"`), `${key} is not in the nav`);
    assert.ok(router.includes(`'${key}'`), `${key} has no route`);
  }
});

/* ── Item 2 + 6 — no placeholder, and a real statement ───────────────────── */

// D-177 (24 Sept): the ten-tab Reports page is gone. AP Aging, the Statement
// of Cash Flows, the sales-tax return and the 1099 worksheet are reports in
// the IA catalog now; their numbers and their sentences ("Do not hand this to
// anybody", "Settings → Sales tax", "STELLA does not file for you") come from
// oliver-api lib/stellaInsightsDetail.js, pinned by its own
// test/stella-insights-detail.test.mjs. What stays true HERE is that every one
// of them is in the catalog, exportable from the statement route it is drawn
// from, and that no taxpayer id is ever rendered by the page.
const exportMap = read("pages/stella/stellaReportExports.ts");
const stellaDash = read("analytics/stellaDashboards.ts");

test("AP Aging is a report over open bills, with its export", () => {
  assert.match(stellaDash, /stella_ap_aging: "Who do I owe\?"/);
  assert.match(exportMap, /case "stella_ap_aging":\s*\n\s*return \{ path: "\/ledger\/ap-aging"/);
  assert.ok(!/Arrives with Bill Pay/.test(reportsPage), "the AP Aging placeholder copy is back");
});

test("Cash Flow is the statement, not a bar chart, and exports as one", () => {
  assert.match(exportMap, /case "stella_cash_flow":\s*\n\s*return \{ path: `\/ledger\/cash-flow\?basis=/);
  assert.ok(!/ComposedChart|BarChart/.test(reportsPage), "a hand-drawn chart is back on the reports page");
});

test("Sales Tax is a report per jurisdiction, on either basis, with its export", () => {
  assert.match(stellaDash, /stella_sales_tax:/);
  assert.match(exportMap, /sales-tax\?basis=\$\{b\}&year=\$\{p\.year\}/);
});

/* ── Item 9 — sales tax ──────────────────────────────────────────────────── */

test("the rates page says WHO keeps the rates current, on the page", () => {
  assert.match(salesTax, /You keep these rates current/);
  assert.match(salesTax, /2027/);
  assert.match(salesTax, /Nothing is taxable until you say so/);
});

test("a rate that has been charged offers no delete", () => {
  assert.match(salesTax, /r\.used_on_invoices === 0 && \(/);
});

/* ── Item 4 — the 1099 ───────────────────────────────────────────────────── */

test("a taxpayer id is never rendered by the reports page, and the whole one is a download", () => {
  // The report payload carries tin_on_file (yes/no) and never the id itself.
  assert.ok(!/\btin\b(?!_)|tin_masked/.test(reportsPage), "the reports page is handling a taxpayer id");
  assert.match(reportsPage, /<Ten99Download counterpartyId=\{chosen\.id\} year=\{year\}/);
  assert.match(reportsPage, /<Ten99CsvDownload year=\{year\}/);
  assert.match(ten99, /\/ledger\/ten99\/\$\{counterpartyId\}\/pdf\?year=\$\{year\}/);
  assert.match(ten99, /\/ledger\/ten99\/irs-csv\?year=\$\{year\}/);
});

test("the download says it is recorded, and a vendor with no W-9 cannot be filed for", () => {
  assert.match(ten99, /This download is recorded/);
  assert.match(ten99, /No taxpayer id on file — ask this vendor for a W-9 first/);
  assert.match(reportsPage, /disabled=\{!chosen\.hasTin\}/);
});

/* ── Item 3 — learned categorisation ─────────────────────────────────────── */

test("a suggestion is shown with the rule NAMED, and the page never saves it by itself", () => {
  // The rule's own sentence must be VISIBLE on the row, not only in a tooltip
  // nobody hovers: a suggestion whose reason is hidden cannot be argued with.
  assert.match(inbox, /color: "#94A3B8" \}\}>\{r\.suggestion\.why\}</);
  assert.match(inbox, /What we think/);
  // The only writes are ones a human presses: Categorize, Personal, and the
  // Undo of Personal (2 Oct 2026). The bulk route is pressed too — and only
  // ever with the category the owner picked in the bar, never a suggestion.
  const applies = inbox.match(/patch\(`\/ledger\/transactions\/\$\{[^}]+\}`/g) || [];
  assert.ok(applies.length <= 3, `the inbox writes the register from ${applies.length} places`);
  // (a fifth argument, the progress counter, may follow the category)
  assert.match(inbox, /sendBulk\(post, action, targets\.map\(\(r\) => r\.transaction_id\), bulkCoa[,)]/);
  assert.doesNotMatch(inbox, /sendBulk\([^)]*suggestion/);
  assert.match(inbox, /Nothing is saved until you press Categorize/);
});

/* ── Item 5 — deposit grouping ───────────────────────────────────────────── */

test("deposit grouping appears ONLY when money is waiting to be banked", () => {
  assert.match(deposits, /if \(!rows\.length\) return null;/);
  assert.match(deposits, /\/ledger\/undeposited/);
  assert.match(deposits, /\/ledger\/deposits/);
});

test("the panel explains what grouping does to the bank line", () => {
  assert.match(deposits, /one row to match instead of/);
  assert.match(deposits, /break it up again/);
});

/* ── Item 11a — the padlock ──────────────────────────────────────────────── */

test("the register shows a padlock on a closed month and still opens the row", () => {
  assert.match(txnsPage, /in_closed_period/);
  assert.match(txnsPage, /<Lock size=\{11\} \/>/);
  assert.match(txnsPage, /changing it is refused until the month is reopened/);
});

/* ── Item 11c — the accountant on a bookkeeping-only business ────────────── */

test("the role hook falls back to the bookkeeping door when the OLIVER one is shut", () => {
  assert.match(roleHook, /get<OliverRoleInfo>\("\/overview\/me"\)/);
  // The CALL, not the mention: the header comment names /ledger/me too, and a
  // test satisfied by the explanation of a fallback rather than the fallback
  // is a test that would let it be deleted.
  assert.match(roleHook, /stella\.get<OliverRoleInfo>\("\/ledger\/me"\)/);
  assert.match(roleHook, /useStellaApi/);
  // …and still defaults to admin when NEITHER answers, so a network glitch
  // never locks somebody out of their own books.
  assert.match(roleHook, /Neither door answered\. Default to admin/);
});

/* ── Assets and budgets ──────────────────────────────────────────────────── */

test("the asset register is honest about what depreciation is for", () => {
  assert.match(assets, /\/ledger\/assets\/depreciation-run/);
  assert.match(assets, /pressing it\s*\n?\s*.*twice changes nothing|skips every month already posted/);
  assert.match(assets, /straight line/i);
  assert.match(assets, /not a tax return/);
});

test("book value is what was POSTED, not what a schedule says should have been", () => {
  assert.match(assets, /Cost less what has actually been posted/);
});

test("budget vs actual reads the books and signs the variance by what it means", () => {
  assert.match(budgets, /\/ledger\/budget-variance\?budget_id=\$\{selected\}&basis=\$\{basis\}/);
  assert.match(budgets, /under budget on a cost, over budget on/);
});

/* ── The house rule ──────────────────────────────────────────────────────── */

test("no pack 2 surface says 'tenant' to a human", () => {
  for (const [name, src] of Object.entries({ bills, assets, budgets, salesTax, deposits, ten99 })) {
    const humanText = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    assert.ok(!/\btenant\b/i.test(humanText), `${name} says "tenant" outside a comment`);
  }
});

test("every pack 2 page goes through the ONE STELLA API hook", () => {
  for (const [name, src] of Object.entries({ bills, assets, budgets, salesTax, deposits })) {
    assert.match(src, /useStellaApi/, `${name} does not use the shared API hook`);
    assert.ok(!/fetch\(/.test(src), `${name} calls fetch() directly instead of the hook`);
  }
});

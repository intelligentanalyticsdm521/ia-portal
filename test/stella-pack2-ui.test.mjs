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

test("AP Aging is no longer a placeholder — it reads open bills", () => {
  assert.match(reportsPage, /const PLACEHOLDERS: Record<[^>]*> = \{\};/);
  assert.ok(!/Arrives with Bill Pay/.test(reportsPage), "the AP Aging placeholder copy is still there");
  assert.match(reportsPage, /\/ledger\/ap-aging/);
  assert.match(reportsPage, /Bills you owe — aged by due date/);
});

test("Cash Flow is a statement with three sections, not a bar chart", () => {
  assert.match(reportsPage, /Statement of Cash Flows/);
  assert.ok(!/ComposedChart/.test(reportsPage), "the cash-flow bar chart is still on the page");
  assert.match(reportsPage, /cashFlow\.sections\.map/);
  assert.match(reportsPage, /Net change in cash/);
});

test("a statement that does not reconcile tells the reader NOT to file it", () => {
  assert.match(reportsPage, /cashFlow\.totals\.reconciles/);
  assert.match(reportsPage, /Do not hand this to anybody/);
});

/* ── Item 9 — sales tax ──────────────────────────────────────────────────── */

test("Sales Tax is a return per jurisdiction, on either basis", () => {
  assert.match(reportsPage, /salesTax\.jurisdictions\.map/);
  assert.match(reportsPage, /Total to file for/);
  assert.match(reportsPage, /basis === "accrual"/);
});

test("a business with no rates is told what to do, not shown an empty table", () => {
  assert.match(reportsPage, /salesTax\.needs_setup/);
  assert.match(reportsPage, /Settings → Sales tax/);
});

test("the rates page says WHO keeps the rates current, on the page", () => {
  assert.match(salesTax, /You keep these rates current/);
  assert.match(salesTax, /2027/);
  assert.match(salesTax, /Nothing is taxable until you say so/);
});

test("a rate that has been charged offers no delete", () => {
  assert.match(salesTax, /r\.used_on_invoices === 0 && \(/);
});

/* ── Item 4 — the 1099 ───────────────────────────────────────────────────── */

test("a taxpayer id on screen is the last four, and the whole one is a download", () => {
  assert.match(reportsPage, /v\.tin_masked/);
  assert.ok(!/v\.tin\b(?!_)/.test(reportsPage), "the reports page is rendering a whole taxpayer id");
  assert.match(ten99, /\/ledger\/ten99\/\$\{counterpartyId\}\/pdf\?year=\$\{year\}/);
  assert.match(ten99, /\/ledger\/ten99\/irs-csv\?year=\$\{year\}/);
});

test("the download says it is recorded, and a vendor with no W-9 cannot be filed for", () => {
  assert.match(ten99, /This download is recorded/);
  assert.match(ten99, /No taxpayer id on file — ask this vendor for a W-9 first/);
});

test("the page says STELLA does not file for you", () => {
  assert.match(reportsPage, /STELLA does not file for you/);
});

/* ── Item 3 — learned categorisation ─────────────────────────────────────── */

test("a suggestion is shown with the rule NAMED, and the page never saves it by itself", () => {
  // The rule's own sentence must be VISIBLE on the row, not only in a tooltip
  // nobody hovers: a suggestion whose reason is hidden cannot be argued with.
  assert.match(inbox, /color: "#94A3B8" \}\}>\{r\.suggestion\.why\}</);
  assert.match(inbox, /What we think/);
  // The only write is the existing categorize() the human presses.
  const applies = inbox.match(/patch\(`\/ledger\/transactions\/\$\{[^}]+\}`/g) || [];
  assert.ok(applies.length <= 2, `the inbox writes the register from ${applies.length} places`);
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

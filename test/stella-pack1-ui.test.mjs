// STELLA pack 1 — the Portal half. Source-pinned, like agent-surfaces-ui and
// il-learning-ui: these are wiring and WORDING facts a typecheck cannot see.
//
// What has to stay true:
//   • every financial statement can leave the screen — Export (CSV / Excel /
//     PDF) and Print, from ONE component so all six behave identically
//   • the export asks the SERVER for the file, from the same endpoint and the
//     same period as the numbers on screen; the browser never rebuilds a
//     statement of its own
//   • a split charge NEVER reads as one account in the register
//   • the split editor shows the remainder live and refuses to save until it is
//     zero — arithmetic the user does in their head is arithmetic they get wrong
//   • opening balances name the balancing figure and explain it before posting
//   • an invited accountant's nav filter covers STELLA, not only OLIVER
//   • no STELLA surface says "tenant" to a human
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");

const exportBar = read("pages/stella/StatementExportBar.tsx");
const reportsPage = read("pages/stella/StellaReportsPage.tsx");
const accountingReports = read("pages/stella/accounting/AccountingReports.tsx");
const splitEditor = read("pages/stella/SplitEditor.tsx");
const recordModal = read("pages/stella/RecordTransactionModal.tsx");
const detailModal = read("pages/stella/TransactionDetailModal.tsx");
const txnsPage = read("pages/stella/StellaTransactionsPage.tsx");
const opening = read("pages/stella/accounting/OpeningBalances.tsx");
const accountingPage = read("pages/stella/accounting/AccountingPage.tsx");
const appShell = read("components/AppShell.tsx");

/* ── Item 4 — statements out of the screen ───────────────────────────────── */

test("the export bar offers all three formats and Print", () => {
  for (const f of ['key: "csv"', 'key: "xlsx"', 'key: "pdf"']) assert.match(exportBar, new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(exportBar, /window\.print\(\)/);
});

test("the export asks the SERVER for the file — the browser builds no statement", () => {
  // downloadStellaFile is the authenticated GET-to-blob helper the document
  // library already uses. Rebuilding the table client-side would be a second
  // implementation of every statement, and the two would drift.
  assert.match(exportBar, /downloadStellaFile\(/);
  assert.match(exportBar, /\$\{path\}\$\{sep\}format=\$\{format\}/);
  assert.ok(!/toCsv|Blob\(\[/.test(exportBar), "the bar builds a file itself");
});

test("a failed download is said on the page, not only in the console", () => {
  assert.match(exportBar, /setError\(/);
  assert.match(exportBar, /The download did not start/);
});

test("all five register statements and the Balance Sheet carry the bar", () => {
  assert.match(reportsPage, /import \{ StatementExportBar, StellaPrintStyles \}/);
  for (const p of ["/ledger/pnl", "/ledger/cash-flow", "/ledger/ar-aging", "/ledger/sales-tax", "/ledger/ten99"]) {
    assert.match(reportsPage, new RegExp(p.replace(/\//g, "\\/")), `${p} is not exportable`);
  }
  assert.match(accountingReports, /StatementExportBar/);
  assert.match(accountingReports, /\/ledger\/balance-sheet\?basis=\$\{basis\}&as_of=\$\{asOf\}/);
});

test("the export period is derived from the SAME state the fetch uses", () => {
  // A separate copy of the period would let someone export August while looking
  // at September, and nothing on the file would say so.
  assert.match(reportsPage, /const exportTarget/);
  assert.match(reportsPage, /const \{ from, to \} = monthRange\(month\);\s*\n\s*return \{ path: `\/ledger\/pnl\?from=\$\{from\}&to=\$\{to\}`/);
  // Pack 2: the sales-tax return carries the BASIS as well as the year, and
  // the export path is still built from the same two pieces of state the
  // fetch above uses — which is the property this test exists to pin.
  assert.match(reportsPage, /sales-tax\?basis=\$\{basis\}&year=\$\{year\}/);
  assert.match(reportsPage, /cash-flow\?basis=\$\{basis\}&from=\$\{year\}-01-01&to=\$\{year\}-12-31/);
});

test("Export is off when there is nothing to export", () => {
  assert.match(reportsPage, /disabled=\{!hasData\}/);
  assert.match(accountingReports, /disabled=\{!data\}/);
});

test("Print hides the app chrome and never splits a section across pages", () => {
  assert.match(exportBar, /@media print/);
  assert.match(exportBar, /\.stella-no-print, nav, aside/);
  assert.match(exportBar, /break-inside: avoid/);
  // The bar itself must not print — a paper P&L with an Export button on it.
  assert.match(exportBar, /className="stella-no-print"/);
});

/* ── Item 9 — split transactions ─────────────────────────────────────────── */

test("the split editor keeps the remainder on screen and names it", () => {
  assert.match(splitEditor, /export function splitTotals/);
  assert.match(splitEditor, /still to account for/);
  assert.match(splitEditor, /more than the charge/);
  assert.match(splitEditor, /The lines add up to the charge\./);
});

test("splitsReady refuses fewer than two lines, a blank account or a bad total", () => {
  assert.match(splitEditor, /if \(lines\.length < 2\) return false/);
  assert.match(splitEditor, /if \(lines\.some\(\(l\) => !l\.coa_account_id \|\| !\(Number\(l\.amount\) > 0\)\)\) return false/);
  assert.match(splitEditor, /return splitTotals\(lines, target\)\.balanced/);
});

test('"Split evenly" gives the rounding to one line so the set still foots', () => {
  // Three ways of $100 is 33.34 / 33.33 / 33.33. Three × 33.33 is 99.99 and the
  // database would refuse it — correctly, and confusingly.
  assert.match(splitEditor, /const each = Math\.floor\(\(magnitude \/ n\) \* 100\) \/ 100/);
  assert.match(splitEditor, /const first = Number\(\(magnitude - each \* \(n - 1\)\)\.toFixed\(2\)\)/);
});

test("the amount is held as a string while typing", () => {
  // Coercing to a number early eats the keystroke in "1." and turns "" into 0.
  assert.match(splitEditor, /amount: string;/);
});

test("recording lets you split, and the register row still gets an account", () => {
  assert.match(recordModal, /SplitEditor/);
  assert.match(recordModal, /Split across accounts/);
  // The parent's account follows the LARGEST split — a blank category would put
  // a fully categorised charge in the Inbox.
  assert.match(recordModal, /sort\(\(a, b\) => b\.amount - a\.amount\)\[0\]\.coa_account_id/);
  assert.match(recordModal, /\.\.\.\(apiSplits \? \{ splits: apiSplits \} : \{\}\)/);
  // Save is refused while the split does not foot.
  assert.match(recordModal, /baseValid && splitsReady\(splits, amountNum\)/);
});

test("an existing line can be split, and the Inbox opens the same modal", () => {
  assert.match(detailModal, /SplitEditor/);
  assert.match(detailModal, /const \[splitting, setSplitting\] = useState\(false\)/);
  // Existing splits are LOADED, so an already-split charge opens showing its
  // lines rather than one category.
  assert.match(detailModal, /\/ledger\/transactions\/\$\{txn\.transaction_id\}/);
  assert.match(detailModal, /setSplitting\(true\)/);
  // The Inbox uses this modal — which is how splitting works from the queue.
  const inbox = read("pages/stella/StellaLedgerInboxPage.tsx");
  assert.match(inbox, /TransactionDetailModal/);
});

test("un-splitting is possible, and sends an empty array to mean it", () => {
  assert.match(detailModal, /const apiSplits = splitting \? splitsForApi\(splits\) : \[\]/);
  assert.match(detailModal, /Sent whenever the split state changed at all — including \[\] to clear\./);
  assert.match(detailModal, /Use one account instead/);
});

test("Save says WHY it is off rather than being greyed out silently", () => {
  assert.match(detailModal, /const saveBlocked = splitting && !splitsReady\(splits, amount\)/);
  assert.match(detailModal, /The split lines have to add up to the charge\./);
  assert.match(detailModal, /Split does not add up/);
});

test("the register shows a split as a SPLIT, never as one account", () => {
  assert.match(txnsPage, /split_count\?: number \| null;/);
  assert.match(txnsPage, /Split × \{n\}/);
  assert.match(txnsPage, /\+ \{n - 1\} more/);
});

test("splitting is opt-in — the common one-account case is not slowed down", () => {
  assert.match(recordModal, /const \[splitting, setSplitting\] = useState\(false\)/);
  assert.match(recordModal, /\{!splitting && \(\s*\n\s*<label>/);
});

/* ── Item 8 — opening balances ───────────────────────────────────────────── */

test("the opening-balance flow previews before it posts", () => {
  assert.match(opening, /\/ledger\/opening-balance\/preview/);
  assert.match(opening, /Show me what will be posted/);
  assert.match(opening, /What will be posted/);
});

test("the balancing figure is shown, named and explained", () => {
  assert.match(opening, /balancing_line/);
  assert.match(opening, /the figure you did not have to know/);
  assert.match(opening, /Retained Earnings/);
  assert.match(opening, /accumulated profit to date/);
});

test("both entry routes exist — type it, or import a trial balance", () => {
  assert.match(opening, /Import a trial balance/);
  assert.match(opening, /readAsText/);
  assert.match(opening, /Add a line/);
  // And the file's required shape is stated BEFORE the upload fails.
  assert.match(opening, /header row with an account <strong>Code<\/strong> column/);
});

test("open AR is offered; what you owe suppliers says why it is not", () => {
  assert.match(opening, /Carry in what customers still owe you/);
  assert.match(opening, /What you owe suppliers is not carried in\./);
  assert.match(opening, /data\.carry_in\.open_ap\.reason/);
});

test("income and expense accounts are not offered, and the page says why", () => {
  assert.match(opening, /asset, liability and equity kind/);
  assert.match(opening, /entering it twice would double it/);
});

test("replacing existing opening balances is stated before it happens", () => {
  assert.match(opening, /Posting this REPLACES the opening balances you already have/);
  assert.match(opening, /Two sets would double every balance/);
});

test("a locked opening entry explains the way out instead of just refusing", () => {
  assert.match(opening, /Reopen that period under Period Close/);
});

test("the page reads the API's plain sentence, never the raw error", () => {
  assert.match(opening, /function detail\(e: unknown\)/);
  assert.match(opening, /\(e as \{ details\?: string \}\)\?\.details/);
});

test("Opening Balances is the FIRST tab on the Accounting page", () => {
  assert.match(accountingPage, /import \{ OpeningBalances \}/);
  assert.match(accountingPage, /\{ key: "opening", label: "Opening Balances" \},\s*\n\s*\{ key: "journal"/);
  assert.match(accountingPage, /\{tab === "opening" && <OpeningBalances \/>\}/);
});

/* ── Item 6 — the accountant's nav ───────────────────────────────────────── */

test("the role nav filter covers STELLA as well as OLIVER", () => {
  assert.match(appShell, /function applyRoleNavFilter\(/);
  assert.match(appShell, /activeProduct === "oliver" \|\| activeProduct === "stella"/);
  // An admin (null list) is still unfiltered.
  assert.match(appShell, /if \(!allowedServiceKeys\) return config;/);
});

test("Period Close and the bank page live under SETTINGS, and that hub is filtered too", () => {
  // Period Close is a stella_settings_* key, so deriveProduct sends it to the
  // "settings" product — not "stella". Filtering only the two product hubs
  // would have left an accountant able to walk into the bank-link page from
  // Settings, which the server list deliberately withholds.
  assert.match(appShell, /if \(activeProduct === "settings"\)/);
  assert.match(appShell, /applyRoleNavFilter\(rawSubNavConfig, roleInfo\.allowedServiceKeys, \["stella_", "oliver_"\]\)/);
});

test("account settings are NOT product-gated, so the Settings filter is prefix-scoped", () => {
  // reference_account_settings_not_product_gated: tenant-level settings belong
  // to every member of a business whatever their product role. Filtering the
  // whole hub against a PRODUCT allowlist would have stripped them.
  assert.match(appShell, /prefixes: string\[\] \| null = null/);
  assert.match(appShell, /const inScope = \(key: string\) => !prefixes \|\| prefixes\.some\(\(p\) => key\.startsWith\(p\)\)/);
  assert.match(appShell, /items: g\.items\.filter\(\(i\) => !inScope\(i\.key\) \|\| allowSet\.has\(i\.key\)\)/);

  // And the three product-settings keys are on the right sides of the line.
  const subNav = read("components/SubNav.tsx");
  for (const k of ["oliver_settings", "stella_settings_bank", "stella_settings_period_close"]) {
    assert.match(subNav, new RegExp(`key: "${k}"`), `${k} is not in the Settings nav any more`);
  }
});

/* ── House rules ─────────────────────────────────────────────────────────── */

test('no STELLA surface built here says "tenant" to a human', () => {
  for (const [name, src] of [
    ["StatementExportBar", exportBar],
    ["SplitEditor", splitEditor],
    ["OpeningBalances", opening],
  ]) {
    // Code identifiers are fine (tenantOverride); PROSE is not.
    const prose = src.replace(/^\s*\/\/.*$/gm, "").match(/>[^<>{}]*\btenants?\b[^<>{}]*</gi) || [];
    assert.equal(prose.length, 0, `${name} shows "tenant" to a human: ${prose.join(" | ")}`);
  }
});

test("nothing new hardcodes a tier, a price or a service id", () => {
  for (const [name, src] of [["StatementExportBar", exportBar], ["SplitEditor", splitEditor], ["OpeningBalances", opening]]) {
    assert.ok(!/\$\d+(\.\d+)?\/mo|price_[A-Za-z0-9]{6,}/.test(src), `${name} hardcodes pricing`);
  }
});

// stellaReportExports.ts — which statement a STELLA report's Export/Print is.
//
// D-177. Every STELLA report in the catalog is drawn from one of the /ledger
// statement routes, and its Export button asks THAT route for the file
// (?format=csv|xlsx|pdf — lib/stellaStatements.js on the server), so the file
// is generated from the same payload as the numbers on screen. This maps report
// id → the route and period, built from the period the SERVER says the reports
// cover (GET /ledger/insights-detail → period), never from a second copy of the
// date arithmetic in the browser.
//
// The paths are the ones the old ten-tab page passed, with two changes the
// lead asked for on 24 Sept: the P&L is the journal statement
// (/ledger/income-statement — basis-aware, agrees with the Balance Sheet)
// rather than the register one, and the Trial Balance and General Ledger now
// have an export at all.
//
// Pure: no React, so the test runner imports it directly.
import type { StellaReportPeriod } from "../../hooks/useProductInsightsPayload";

export interface StatementExport {
  /** The statement route, WITHOUT ?format (StatementExportBar adds it). */
  path: string;
  /** Names the file when the server sends no filename. */
  fileBase: string;
}

export function statementExportFor(reportId: string, p: StellaReportPeriod): StatementExport | null {
  const b = p.basis;
  switch (reportId) {
    case "stella_income_by_account":
    case "stella_expenses_by_account":
    case "stella_net_profit":
      return { path: `/ledger/income-statement?basis=${b}&from=${p.from}&to=${p.to}`, fileBase: `profit-and-loss-${p.month}-${b}` };
    case "stella_cash_flow":
      return { path: `/ledger/cash-flow?basis=${b}&from=${p.year}-01-01&to=${p.year}-12-31`, fileBase: `cash-flow-${p.year}-${b}` };
    case "stella_balance_sheet":
      return { path: `/ledger/balance-sheet?basis=${b}&as_of=${p.as_of}`, fileBase: `balance-sheet-${p.as_of}-${b}` };
    case "stella_ar_aging":
      return { path: "/ledger/ar-aging", fileBase: "ar-aging" };
    case "stella_ap_aging":
      return { path: "/ledger/ap-aging", fileBase: "ap-aging" };
    case "stella_sales_tax":
      return { path: `/ledger/sales-tax?basis=${b}&year=${p.year}`, fileBase: `sales-tax-${p.year}-${b}` };
    case "stella_1099":
      return { path: `/ledger/ten99?year=${p.year}`, fileBase: `1099-worksheet-${p.year}` };
    case "stella_trial_balance":
      return { path: `/ledger/trial-balance?basis=${b}&to=${p.as_of}`, fileBase: `trial-balance-${p.as_of}-${b}` };
    case "stella_general_ledger":
      return { path: `/ledger/general-ledger?basis=${b}&from=${p.from}&to=${p.to}&limit=1000`, fileBase: `general-ledger-${p.month}-${b}` };
    default:
      return null;
  }
}

/** "YYYY-MM" for today, local time — the month picker's default. */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

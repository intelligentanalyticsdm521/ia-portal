// stellaDashboards.ts — STELLA (bookkeeping) dashboards, D-177.
//
// The spec (overnight-report/INSIGHTS_STELLA_AND_NEW_DATA.md, Part 1) names
// STELLA's five Trends dashboards — Profitability, Cash Flow, Unit Economics,
// Expenses, Revenue Quality — and says to wire its Insights "exactly like the
// other four platforms". The Reports catalog is the first piece of that wiring:
// it groups reports by the SECTION they carry (reportGroups.ts), bucketed by
// these dashboards, so every STELLA report id's section must exist here.
//
// Where the reports file (scope STELLA_REPORTS_CATALOG_SCOPE_2026-09-22 §4.2):
//   profitability.statements   Income by account · Expenses by account · Net profit
//   cash_flow.position         Cash flow · Balance sheet
//   revenue_quality.receivables  AR aging
//   revenue_quality.payables     AP aging
//   books.tax                  Sales tax · 1099 vendors
//   books.ledger               Trial balance · General ledger
//
// "books" is the sixth dashboard the scope adds for the plain records an
// accountant asks for. Unit Economics and Expenses carry no catalog report yet
// (their reports arrive with STELLA Trends); they are declared so the order of
// the nav is the order of the catalog when they do.
//
// Metrics: the Trends pages are still "coming soon" for STELLA, and nothing
// computes a STELLA metric series yet. A metric declared here with no producer
// would be a fabricated catalog entry (feedback_no_fabricated_catalog), so the
// sections carry none until the Trends feed exists.
import type { DashboardDef } from "./catalog";

export const STELLA_DASHBOARDS: DashboardDef[] = [
  {
    key: "profitability", label: "Profitability",
    question: "Am I making money?",
    sections: [
      { key: "statements", label: "Profit & Loss", weight: 1, metrics: [] },
    ],
  },
  {
    key: "cash_flow", label: "Cash Flow",
    question: "Where did the cash go, and what do I own and owe?",
    sections: [
      { key: "position", label: "Cash flow & balance sheet", weight: 1, metrics: [] },
    ],
  },
  {
    key: "unit_economics", label: "Unit Economics",
    question: "What does each job really earn?",
    sections: [],
  },
  {
    key: "expenses", label: "Expenses",
    question: "Where is the money going?",
    sections: [],
  },
  {
    key: "revenue_quality", label: "Revenue Quality",
    question: "Who owes me, and who do I owe?",
    sections: [
      { key: "receivables", label: "What you're owed", weight: 0.5, metrics: [] },
      { key: "payables", label: "What you owe", weight: 0.5, metrics: [] },
    ],
  },
  {
    key: "books", label: "The books",
    question: "What does my accountant need?",
    sections: [
      { key: "tax", label: "Tax", weight: 0.5, metrics: [] },
      { key: "ledger", label: "Trial balance & general ledger", weight: 0.5, metrics: [] },
    ],
  },
];

/** dashboard key → the feature name an owner recognises (catalog headings). */
export const STELLA_FEATURE_LABEL: Record<string, string> = {
  profitability: "Profit & Loss",
  cash_flow: "Cash & balance",
  unit_economics: "Unit economics",
  expenses: "Expenses",
  revenue_quality: "What you're owed and owe",
  books: "The books",
};

/** What each report answers, in the owner's words (the SPARK page's pattern). */
export const STELLA_ANSWERS: Record<string, string> = {
  stella_income_by_account: "Where is my income coming from?",
  stella_expenses_by_account: "Where is the money going?",
  stella_net_profit: "Am I making money?",
  stella_cash_flow: "Where did the cash go?",
  stella_balance_sheet: "What do I own and owe — and do the books balance?",
  stella_ar_aging: "Who owes me?",
  stella_ap_aging: "Who do I owe?",
  stella_sales_tax: "How much sales tax do I file?",
  stella_1099: "Who needs a 1099?",
  stella_trial_balance: "Do my debits equal my credits?",
  stella_general_ledger: "What hit the books this month?",
};

/** The eleven STELLA report ids, in catalog order. */
export const STELLA_REPORT_IDS = Object.keys(STELLA_ANSWERS);

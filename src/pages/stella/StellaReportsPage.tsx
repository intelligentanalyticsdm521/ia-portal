// StellaReportsPage — Ledger → Reports.
//
// ONE nav item consolidating the financial reports (house pattern:
// OliverReportsPage — one scrolling dashboard, no per-report nav rows).
// A report picker switches between [P&L | Balance Sheet | Trial Balance |
// General Ledger | Cash Flow | AR Aging | AP Aging | Sales Tax | 1099 |
// Accountant pack].
//
// STELLA pack 2 finished this page. EVERY tab is now real:
//   * AP Aging was the last placeholder on it, promising "arrives with Bill
//     Pay" — Bill Pay arrived, and it reads open bills;
//   * Cash Flow was a cash-in / cash-out bar chart and is now the Statement of
//     Cash Flows, with the three sections and a line saying whether it
//     reconciles to what the bank accounts actually did;
//   * Sales Tax was twelve months of "tax collected" with no jurisdiction on
//     it — unfileable — and is now a return, per jurisdiction, per rate, on
//     either basis;
//   * 1099 was a worksheet with nothing to send, and now produces the form and
//     the filing CSV.
import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useStellaApi } from "../../hooks/useStellaApi";
import { BalanceSheetReport, TrialBalanceReport, GeneralLedgerReport, type Basis } from "./accounting/AccountingReports";
import { AccountantPack } from "./accounting/AccountantPack";
import { StellaShell, StellaScaffoldCard, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
// STELLA pack 1, item 4: Export (CSV / Excel / PDF) and Print on every
// statement. The export calls THIS statement's endpoint with ?format=, so the
// file is generated from the same payload that drew the screen.
import { StatementExportBar, StellaPrintStyles } from "./StatementExportBar";
// STELLA pack 2, item 4 — the 1099-NEC form and the filing CSV.
import { Ten99Download, Ten99CsvDownload } from "./Ten99Download";

// GET /ledger/pnl response (oliver-api routes/stellaLedger.js).
interface PnlLine {
  coa_account_id: string | null;
  code: string | null;
  account_name: string | null;
  account_type: string | null; // revenue | expense | asset | liability | equity
  total: number;
  txn_count: number;
}
interface Pnl {
  period: { from: string | null; to: string | null };
  basis: string;
  lines: PnlLine[];
  totals: { income: number; expenses: number; net: number };
}

// GET /ledger/cash-flow — the Statement of Cash Flows (STELLA pack 2, item 6).
// This path used to serve a cash-in / cash-out bar chart off the register; it
// is a real statement now — from the journal, basis-aware, three sections — and
// it says whether it reconciles to what the bank accounts actually did.
interface CashFlowLine { code: string | null; label: string; account_name: string | null; amount: number; is_adjustment?: boolean; is_net_income?: boolean }
interface CashFlowSection { label: string; lines: CashFlowLine[]; total: number }
interface CashFlow {
  basis: string;
  period: { from: string | null; to: string | null };
  sections: CashFlowSection[];
  note?: string;
  totals: {
    operating: number; investing: number; financing: number;
    net_change_in_cash: number; cash_accounts_moved: number;
    opening_cash: number; closing_cash: number;
    reconciles: boolean; difference: number; net_income: number;
  };
}

// GET /ledger/ar-aging — open OLIVER invoice balances bucketed on due_date.
interface ArBucket { label: string; count: number; amount: number }
interface ArInvoice {
  invoice_number: string | null;
  contact_name: string | null;
  due_date: string | null;
  balance_due: number;
  days_overdue: number;
}
interface ArAging { buckets: ArBucket[]; invoices: ArInvoice[] }

// GET /ledger/ap-aging — open BILLS, aged the same five ways as AR (pack 2).
interface ApBill { bill_id: string; bill_number: string | null; vendor_name: string | null; due_date: string | null; balance_due: number; days_overdue: number }
interface ApAging { buckets: ArBucket[]; bills: ApBill[]; total: number }

// GET /ledger/sales-tax — the RETURN: per jurisdiction, per rate, per period,
// on either basis (STELLA pack 2, item 9). What it replaced was twelve months
// of "tax collected" with no jurisdiction on it, which nobody can file.
interface SalesTaxRate { tax_rate_id: string; name: string; rate_percent: number; taxable_amount: number; tax_amount: number; invoices: number }
interface SalesTaxJurisdiction { jurisdiction: string; rates: SalesTaxRate[]; taxable_amount: number; tax_amount: number; invoices: number }
interface SalesTax {
  basis: string;
  period_label: string;
  period: { from: string; to: string };
  jurisdictions: SalesTaxJurisdiction[];
  total: number;
  taxable_total: number;
  sales_tax_payable_balance: number;
  needs_setup: boolean;
  note: string;
  configured_rates: { tax_rate_id: string; name: string; jurisdiction: string; rate_percent: number; is_active: boolean }[];
}

// GET /ledger/ten99?year — 1099-NEC candidates (>= threshold OR flagged is_1099).
interface Ten99Vendor {
  counterparty_id: string;
  display_name: string | null;
  is_1099: boolean;
  w9_on_file: boolean;
  total_paid: number;
  // Pack 2: the last four only. The whole number exists in the download and
  // nowhere else, and taking that download is written to the audit log.
  tin_masked: string | null;
  tin_on_file: boolean;
}
interface Ten99 { year: number; threshold: number; vendors: Ten99Vendor[] }

const REPORTS = [
  { key: "pnl", label: "P&L" },
  // Balance Sheet is LIVE as of the double-entry ledger (M3) — it is no longer
  // a placeholder, and Trial Balance + General Ledger arrived with it.
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "trial_balance", label: "Trial Balance" },
  { key: "general_ledger", label: "General Ledger" },
  { key: "cash_flow", label: "Cash Flow" },
  { key: "ar_aging", label: "AR Aging" },
  { key: "ap_aging", label: "AP Aging" },
  { key: "sales_tax", label: "Sales Tax" },
  { key: "1099", label: "1099" },
  // Ops O-5 (b): the year-end hand-off — GL + trial balance + transactions
  // for a period, as one Excel workbook or as CSVs.
  { key: "accountant", label: "Accountant pack" },
];

// The three journal-backed reports render themselves; the rest of this page
// reads the register directly and is cash-only by construction.
const JOURNAL_REPORTS = new Set(["balance_sheet", "trial_balance", "general_ledger", "accountant"]);

// NO PLACEHOLDERS LEFT ON THIS PAGE. AP Aging was the last one, and what it
// promised — "arrives with Bill Pay" — arrived (STELLA pack 2, item 1). Every
// tab here now reads real numbers, or says in words that there are none.
const PLACEHOLDERS: Record<string, { title: string; note: string; bullets: string[]; tier?: "Pro" }> = {};

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

// month "YYYY-MM" → { from, to } covering the whole month.
function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

// "YYYY-MM" → "Mar" / "March 2026" (chart ticks / tooltips + table rows).

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

export function StellaReportsPage() {
  const { get, ready } = useStellaApi();
  const [report, setReport] = useState("pnl");
  // Shared across the journal-backed reports: having picked accrual on the
  // Balance Sheet, you should still be on accrual when you open the GL.
  const [basis, setBasis] = useState<Basis>("cash");
  const [month, setMonth] = useState(currentMonth());
  // Year picker shared by Sales Tax + 1099 (both are calendar-year reports).
  const [year, setYear] = useState(new Date().getFullYear());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [arAging, setArAging] = useState<ArAging | null>(null);
  const [apAging, setApAging] = useState<ApAging | null>(null);
  const [salesTax, setSalesTax] = useState<SalesTax | null>(null);
  const [ten99, setTen99] = useState<Ten99 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    if (PLACEHOLDERS[report]) return; // placeholder tabs fetch nothing
    // The journal-backed reports load their own data (they have their own
    // basis + as-of controls), so this page must not fetch or spin for them.
    if (JOURNAL_REPORTS.has(report)) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      if (report === "pnl") {
        const { from, to } = monthRange(month);
        setPnl(await get<Pnl>(`/ledger/pnl?from=${from}&to=${to}`));
      } else if (report === "cash_flow") {
        setCashFlow(await get<CashFlow>(`/ledger/cash-flow?basis=${basis}&from=${year}-01-01&to=${year}-12-31`));
      } else if (report === "ar_aging") {
        setArAging(await get<ArAging>("/ledger/ar-aging"));
      } else if (report === "ap_aging") {
        setApAging(await get<ApAging>("/ledger/ap-aging"));
      } else if (report === "sales_tax") {
        setSalesTax(await get<SalesTax>(`/ledger/sales-tax?basis=${basis}&year=${year}`));
      } else if (report === "1099") {
        setTen99(await get<Ten99>(`/ledger/ten99?year=${year}`));
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, report, month, year, basis]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();

  const incomeLines = (pnl?.lines || []).filter((l) => l.account_type === "revenue" && l.total !== 0);
  const expenseLines = (pnl?.lines || []).filter((l) => l.account_type === "expense" && l.total !== 0);
  const expenseChart = expenseLines
    .map((l) => ({ name: l.account_name || "Uncategorized", amount: Math.abs(l.total) }))
    .sort((a, b) => b.amount - a.amount);

  const placeholder = PLACEHOLDERS[report];
  const isJournalReport = JOURNAL_REPORTS.has(report);
  const hasData =
    report === "pnl" ? !!pnl
    : report === "cash_flow" ? !!cashFlow
    : report === "ar_aging" ? !!arAging
    : report === "ap_aging" ? !!apAging
    : report === "sales_tax" ? !!salesTax
    : report === "1099" ? !!ten99
    : false;

  const yearNow = new Date().getFullYear();
  const yearOptions = [yearNow, yearNow - 1, yearNow - 2, yearNow - 3, yearNow - 4];

  // The endpoint for whatever is on screen — derived from the SAME state the
  // fetch above uses, so an export can never be of a different period than the
  // numbers the person is looking at. Null = this tab is not exportable
  // (placeholders, and the journal-backed reports which carry their own bar).
  const exportTarget: { path: string; file: string } | null = (() => {
    if (report === "pnl") {
      const { from, to } = monthRange(month);
      return { path: `/ledger/pnl?from=${from}&to=${to}`, file: `profit-and-loss-${month}` };
    }
    if (report === "cash_flow") return { path: `/ledger/cash-flow?basis=${basis}&from=${year}-01-01&to=${year}-12-31`, file: `cash-flow-${year}` };
    if (report === "ar_aging") return { path: "/ledger/ar-aging", file: "ar-aging" };
    if (report === "ap_aging") return { path: "/ledger/ap-aging", file: "ap-aging" };
    if (report === "sales_tax") return { path: `/ledger/sales-tax?basis=${basis}&year=${year}`, file: `sales-tax-${year}` };
    if (report === "1099") return { path: `/ledger/ten99?year=${year}`, file: `1099-worksheet-${year}` };
    return null;
  })();

  return (
    <StellaShell
      title="Reports"
      subtitle="Your financial statements in one place — P&L, Balance Sheet, Trial Balance, General Ledger, the Statement of Cash Flows, what you are owed and what you owe, your sales-tax return, 1099s, and the pack your accountant asks for."
      showRecord
      onRecorded={() => reload()}
      actions={
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {report === "pnl" && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
            />
          )}
          {(report === "cash_flow" || report === "sales_tax") && (
            <div className="ptabs">
              {(["cash", "accrual"] as const).map((b) => (
                <button key={b} className={`ptab${basis === b ? " active" : ""}`} onClick={() => setBasis(b)}>
                  {b === "cash" ? "Cash" : "Accrual"}
                </button>
              ))}
            </div>
          )}
          {(report === "cash_flow" || report === "sales_tax" || report === "1099") && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24", background: "#fff" }}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
          {exportTarget && (
            <StatementExportBar path={exportTarget.path} fileBase={exportTarget.file} disabled={!hasData} />
          )}
        </div>
      }
      error={!placeholder && !isJournalReport ? error : undefined}
      loading={!placeholder && !isJournalReport && loading && !hasData}
    >
      <StellaPrintStyles />
      <StellaTabs tabs={REPORTS} active={report} onChange={setReport} dataTour="stella-reports-tabs" />

      {report === "balance_sheet" && <BalanceSheetReport basis={basis} onBasis={setBasis} />}
      {report === "trial_balance" && <TrialBalanceReport basis={basis} onBasis={setBasis} />}
      {report === "general_ledger" && <GeneralLedgerReport basis={basis} onBasis={setBasis} />}
      {report === "accountant" && <AccountantPack />}

      {report === "pnl" && pnl && (
        <>
          {/* Stat tiles — income / expenses / net */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatTile label="Income" value={fmtMoney(pnl.totals.income)} />
            <StatTile label="Expenses" value={fmtMoney(pnl.totals.expenses)} />
            <StatTile
              label="Net income"
              value={fmtMoney(pnl.totals.net)}
              color={pnl.totals.net >= 0 ? "#047857" : "#B91C1C"}
            />
          </div>

          {/* Expenses by account bar */}
          {expenseChart.length > 0 && (
            <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>Expenses by account</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 8 }}>{monthLabel} · cash basis</div>
              <ResponsiveContainer width="100%" height={Math.max(180, expenseChart.length * 34)}>
                <BarChart data={expenseChart} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v: number) => `$${Number(v).toLocaleString()}`} />
                  <YAxis type="category" dataKey="name" stroke="#64748B" fontSize={11} width={160} />
                  <Tooltip formatter={(v) => fmtMoney(Number(v ?? 0))} />
                  <Bar dataKey="amount" fill={STELLA_INDIGO} radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Statement table */}
          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Profit &amp; Loss — {monthLabel}</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2, textTransform: "capitalize" }}>{pnl.basis} basis</div>
            </div>
            <div style={{ padding: "8px 20px 16px" }}>
              <div style={{ marginTop: 8, marginBottom: 2, fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Income
              </div>
              {incomeLines.length === 0 ? (
                <div style={{ padding: "6px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>$0 income recorded</div>
              ) : (
                incomeLines.map((l) => (
                  <Row key={l.coa_account_id || l.account_name || "income"} label={l.account_name || "Uncategorized"} value={fmtMoney(l.total)} indent />
                ))
              )}
              <Row label="Total income" value={fmtMoney(pnl.totals.income)} bold />

              <div style={{ marginTop: 12, marginBottom: 2, fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
                Expenses
              </div>
              {expenseLines.length === 0 ? (
                <div style={{ padding: "6px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>$0 expenses recorded</div>
              ) : (
                expenseLines.map((l) => {
                  // Expense account totals are normally negative (costs). A
                  // POSITIVE total is a net credit (e.g. a refund exceeding
                  // the month's costs) — QB convention: show it as a negative
                  // expense so the visible lines sum to Total expenses.
                  const isCredit = l.total > 0;
                  return (
                    <Row
                      key={l.coa_account_id || l.account_name || "expense"}
                      label={isCredit ? `${l.account_name || "Uncategorized"} (credit)` : l.account_name || "Uncategorized"}
                      value={isCredit ? `−${fmtMoney(l.total)}` : fmtMoney(Math.abs(l.total))}
                      color={isCredit ? "#0F6E56" : undefined}
                      indent
                    />
                  );
                })
              )}
              <Row label="Total expenses" value={fmtMoney(pnl.totals.expenses)} bold />

              <div style={{ borderTop: `2px solid ${STELLA_INDIGO}`, marginTop: 8 }}>
                <Row label="Net income" value={fmtMoney(pnl.totals.net)} bold color={pnl.totals.net >= 0 ? "#047857" : "#B91C1C"} last />
              </div>
            </div>
          </div>
        </>
      )}

      {report === "cash_flow" && cashFlow && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatTile label="Cash at the start" value={fmtMoney(cashFlow.totals.opening_cash)} />
            <StatTile
              label="Net change in cash"
              value={fmtMoney(cashFlow.totals.net_change_in_cash)}
              color={cashFlow.totals.net_change_in_cash >= 0 ? "#047857" : "#B91C1C"}
            />
            <StatTile label="Cash at the end" value={fmtMoney(cashFlow.totals.closing_cash)} />
          </div>

          {/* THE line that says whether to trust the page. A statement that does
              not reconcile is not a formatting problem. */}
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 16,
              borderRadius: 8, fontSize: 12,
              background: cashFlow.totals.reconciles ? "#ECFDF5" : "#FEF2F2",
              color: cashFlow.totals.reconciles ? "#065F46" : "#991B1B",
              border: `1px solid ${cashFlow.totals.reconciles ? "#A7F3D0" : "#FECACA"}`,
            }}
          >
            {cashFlow.totals.reconciles
              ? "These three sections add up to exactly what your bank accounts did over the period."
              : `These sections are out by ${fmtMoney(Math.abs(cashFlow.totals.difference))} against what your bank accounts did. Do not hand this to anybody — run Rebuild the ledger under Accounting, then look for a hand-written entry that does not balance.`}
          </div>

          {cashFlow.note && (
            <div style={{ padding: "10px 14px", marginBottom: 16, fontSize: 12, background: "#F8FAFC", color: "#475569", border: "1px solid #E2E8F0", borderRadius: 8 }}>
              {cashFlow.note}
            </div>
          )}

          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Statement of Cash Flows</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                {cashFlow.period.from} to {cashFlow.period.to} · {cashFlow.basis} basis · starts from your profit and
                works back to the money that actually moved
              </div>
            </div>
            <div style={{ padding: "8px 20px 16px" }}>
              {cashFlow.sections.map((sec) => (
                <div key={sec.label} style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", padding: "6px 0" }}>{sec.label}</div>
                  {sec.lines.length === 0 && (
                    <Row label="Nothing this period" value="" indent color="#94A3B8" />
                  )}
                  {sec.lines.map((l, i) => (
                    <Row
                      key={`${sec.label}-${i}`}
                      label={l.is_net_income ? "Net profit / loss" : l.label}
                      value={fmtMoney(l.amount)}
                      indent
                      bold={l.is_net_income}
                      color={l.amount < 0 ? "#B91C1C" : undefined}
                    />
                  ))}
                  <div style={{ borderTop: "1px solid #E2E8F0" }}>
                    <Row label={`Total ${sec.label.toLowerCase()}`} value={fmtMoney(sec.total)} bold />
                  </div>
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${STELLA_INDIGO}`, marginTop: 10 }}>
                <Row label="Net change in cash" value={fmtMoney(cashFlow.totals.net_change_in_cash)} bold last />
              </div>
            </div>
          </div>
        </>
      )}

      {report === "ap_aging" && apAging && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            {apAging.buckets.map((b) => (
              <StatTile
                key={b.label}
                label={b.label === "Current" ? "Not due yet" : `${b.label} days late`}
                value={fmtMoney(b.amount)}
                sub={`${b.count} bill${b.count === 1 ? "" : "s"}`}
                color={b.label !== "Current" && b.amount > 0 ? "#B91C1C" : undefined}
              />
            ))}
          </div>

          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Bills you owe — aged by due date</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                {apAging.bills.length} open bill{apAging.bills.length === 1 ? "" : "s"} · {fmtMoney(apAging.total)} outstanding · record and pay them under Bills
              </div>
            </div>
            <div style={{ padding: "8px 20px 16px", overflowX: "auto" }}>
              {apAging.bills.length === 0 ? (
                <div style={{ padding: "12px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                  You owe nobody right now. Bills you record under Bills show up here until they are paid.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Vendor</th>
                      <th style={thStyle}>Bill</th>
                      <th style={thStyle}>Due</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Days late</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Still owed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apAging.bills.map((b) => (
                      <tr key={b.bill_id}>
                        <td style={{ ...tdStyle, fontWeight: 600 }}>{b.vendor_name || "—"}</td>
                        <td style={tdStyle}>{b.bill_number || "—"}</td>
                        <td style={tdStyle}>{fmtDate(b.due_date)}</td>
                        <td style={{ ...tdStyle, textAlign: "right", color: b.days_overdue > 0 ? "#B91C1C" : "#5A7A8A", fontWeight: b.days_overdue > 0 ? 700 : 500 }}>
                          {b.days_overdue > 0 ? b.days_overdue : "—"}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtMoney(b.balance_due)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {report === "ar_aging" && arAging && (
        <>
          {/* Bucket tiles — Current / 1-30 / 31-60 / 61-90 / 90+ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
            {arAging.buckets.map((b) => (
              <StatTile
                key={b.label}
                label={b.label === "Current" ? "Current" : `${b.label} days`}
                value={fmtMoney(b.amount)}
                sub={`${b.count} invoice${b.count === 1 ? "" : "s"}`}
                color={b.label !== "Current" && b.amount > 0 ? "#B91C1C" : undefined}
              />
            ))}
          </div>

          {/* Open invoice table */}
          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Open invoices — aged by due date</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                OLIVER invoice balances still owed to you. No due date counts as current.
              </div>
            </div>
            <div style={{ padding: "8px 20px 16px", overflowX: "auto" }}>
              {arAging.invoices.length === 0 ? (
                <div style={{ padding: "12px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                  No open invoices — nothing is owed to you right now.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Invoice</th>
                      <th style={thStyle}>Customer</th>
                      <th style={thStyle}>Due date</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Days overdue</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arAging.invoices.map((inv) => {
                      const overdue = inv.days_overdue > 0;
                      return (
                        <tr key={`${inv.invoice_number}-${inv.due_date}-${inv.balance_due}`}>
                          <td style={{ ...tdStyle, fontWeight: 600 }}>{inv.invoice_number || "—"}</td>
                          <td style={tdStyle}>{inv.contact_name || "—"}</td>
                          <td style={tdStyle}>{fmtDate(inv.due_date)}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: overdue ? "#B91C1C" : "#5A7A8A", fontWeight: overdue ? 700 : 500 }}>
                            {overdue ? inv.days_overdue : "—"}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", color: overdue ? "#B91C1C" : "#0B1C24", fontWeight: 600 }}>
                            {fmtMoney(inv.balance_due)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {report === "sales_tax" && salesTax && (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Sales tax — {salesTax.period_label}</div>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
              {salesTax.basis === "accrual"
                ? "Accrual — the tax on every invoice you ISSUED in this period, in full."
                : "Cash — the tax inside the money that actually ARRIVED in this period. A part payment carries part of the tax."}
            </div>
          </div>
          <div style={{ padding: "8px 20px 16px" }}>
            {salesTax.needs_setup ? (
              <div style={{ padding: "14px 0", fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                You have not set up any sales-tax rates yet, so there is nothing to file from here.
                Add the rate you charge and mark which of your services are taxable under
                <strong> Settings → Sales tax</strong>, and this becomes the figure you file.
              </div>
            ) : salesTax.jurisdictions.length === 0 ? (
              <div style={{ padding: "14px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                No tax was charged in this period.
              </div>
            ) : (
              <>
                {salesTax.jurisdictions.map((j) => (
                  <div key={j.jurisdiction} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#0B1C24", padding: "6px 0" }}>{j.jurisdiction}</div>
                    {j.rates.map((r) => (
                      <Row
                        key={r.tax_rate_id}
                        label={`${r.name} (${r.rate_percent}%) — ${fmtMoney(r.taxable_amount)} taxable across ${r.invoices} invoice${r.invoices === 1 ? "" : "s"}`}
                        value={fmtMoney(r.tax_amount)}
                        indent
                      />
                    ))}
                    <div style={{ borderTop: "1px solid #E2E8F0" }}>
                      <Row label={`Total to file for ${j.jurisdiction}`} value={fmtMoney(j.tax_amount)} bold />
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: `2px solid ${STELLA_INDIGO}`, marginTop: 10 }}>
                  <Row label="All jurisdictions" value={fmtMoney(salesTax.total)} bold last />
                </div>
                <div style={{ marginTop: 10, padding: "10px 12px", background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 11, color: "#475569", lineHeight: 1.6 }}>
                  Your books currently hold <strong>{fmtMoney(salesTax.sales_tax_payable_balance)}</strong> of
                  sales tax owed (Sales Tax Payable on your Balance Sheet). That figure and the one above
                  differ by whatever you have already paid over. {salesTax.note}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {report === "1099" && ten99 && (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>1099-NEC worksheet — {ten99.year}</div>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
              Vendors and subs paid {fmtMoney(ten99.threshold)} or more this year, plus anyone flagged 1099 — manage flags and W-9s on the Vendors page.
            </div>
          </div>
          <div style={{ padding: "8px 20px 16px", overflowX: "auto" }}>
            {ten99.vendors.length === 0 ? (
              <div style={{ padding: "12px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
                No vendors at or over the {fmtMoney(ten99.threshold)} threshold this year.
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Vendor</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Total paid</th>
                    <th style={thStyle}>1099 flag</th>
                    <th style={thStyle}>W-9</th>
                    <th style={thStyle}>Tax ID</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Form</th>
                  </tr>
                </thead>
                <tbody>
                  {ten99.vendors.map((v) => (
                    <tr key={v.counterparty_id}>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{v.display_name || "—"}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: v.total_paid >= ten99.threshold ? 700 : 500 }}>
                        {fmtMoney(v.total_paid)}
                      </td>
                      <td style={tdStyle}>
                        {v.is_1099 ? (
                          <span style={{ ...pillStyle, background: `${STELLA_INDIGO}18`, color: STELLA_INDIGO }}>1099</span>
                        ) : (
                          <span style={{ ...pillStyle, background: "#F1F5F9", color: "#64748B" }}>Not flagged</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {v.w9_on_file ? (
                          <span style={{ ...pillStyle, background: "#D1FAE5", color: "#047857" }}>On file</span>
                        ) : (
                          <span style={{ ...pillStyle, background: "#FEF3C7", color: "#92400E" }}>Missing</span>
                        )}
                      </td>
                      {/* The last four only. The whole number is in the PDF and
                          the CSV, and taking either is written to the audit log. */}
                      <td style={{ ...tdStyle, fontVariantNumeric: "tabular-nums", color: "#5A7A8A" }}>
                        {v.tin_masked || <span style={{ color: "#B4531F" }}>none on file</span>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <Ten99Download counterpartyId={v.counterparty_id} year={ten99.year} name={v.display_name} disabled={!v.tin_on_file} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Ten99CsvDownload year={ten99.year} disabled={!ten99.vendors.length} />
              <span style={{ fontSize: 11, color: "#5A7A8A" }}>
                One file for the whole year, in the shape a filing service imports.
              </span>
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
              Contractors paid {fmtMoney(ten99.threshold)} or more in a calendar year generally require a 1099-NEC.
              Card and third-party-processor payments are reported by the processor on 1099-K instead.
              <strong> STELLA does not file for you</strong> — the form and the file are yours to send, through
              a filing service or on the official scannable paper.
            </div>
          </div>
        </div>
      )}

      {placeholder && (
        <StellaScaffoldCard note={placeholder.note} bullets={placeholder.bullets} phase="P2" tier={placeholder.tier} />
      )}
    </StellaShell>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px 8px 0",
  fontSize: 11,
  fontWeight: 700,
  color: "#5A7A8A",
  textTransform: "uppercase",
  letterSpacing: 0.4,
  borderBottom: "1px solid #F1F5F9",
  whiteSpace: "nowrap",
};
const tdStyle: React.CSSProperties = {
  padding: "8px 12px 8px 0",
  fontSize: 12,
  color: "#0B1C24",
  borderBottom: "1px solid #F1F5F9",
};
const pillStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "3px 9px",
  borderRadius: 99,
  fontSize: 11,
  fontWeight: 600,
};

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#0B1C24", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  indent,
  color,
  last,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  color?: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "7px 0",
        borderBottom: last ? "none" : "1px solid #F1F5F9",
      }}
    >
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 500, color: color || "#0B1C24", paddingLeft: indent ? 14 : 0 }}>{label}</span>
      <span style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 500, color: color || "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

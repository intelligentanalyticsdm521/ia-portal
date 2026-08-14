// StellaReportsPage — Ledger → Reports.
//
// ONE nav item consolidating the seven financial reports (house pattern:
// OliverReportsPage — one scrolling dashboard, no per-report nav rows).
// A report picker switches between [P&L | Balance Sheet | Cash Flow |
// AR Aging | AP Aging | Sales Tax | 1099]. FIVE are LIVE over the
// stellaLedger routes: P&L (/ledger/pnl), Cash Flow (/ledger/cash-flow),
// AR Aging (/ledger/ar-aging), Sales Tax (/ledger/sales-tax) and 1099
// (/ledger/ten99). Balance Sheet (needs accrual accounting) and AP Aging
// (needs bills) stay honest in-shell placeholders — no fake data.
import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useStellaApi } from "../../hooks/useStellaApi";
import { StellaShell, StellaScaffoldCard, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

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

// GET /ledger/cash-flow — monthly inflow/outflow/net, zero-filled, oldest first.
interface CashFlowMonth { month: string; inflow: number; outflow: number; net: number }
interface CashFlow { months: CashFlowMonth[]; totals: { inflow: number; outflow: number; net: number } }

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

// GET /ledger/sales-tax?year — tax collected per month (12 buckets, zero-filled).
interface SalesTax { year: number; collected: { month: string; amount: number }[]; total: number }

// GET /ledger/ten99?year — 1099-NEC candidates (>= threshold OR flagged is_1099).
interface Ten99Vendor {
  counterparty_id: string;
  display_name: string | null;
  is_1099: boolean;
  w9_on_file: boolean;
  total_paid: number;
}
interface Ten99 { year: number; threshold: number; vendors: Ten99Vendor[] }

const REPORTS = [
  { key: "pnl", label: "P&L" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_flow", label: "Cash Flow" },
  { key: "ar_aging", label: "AR Aging" },
  { key: "ap_aging", label: "AP Aging" },
  { key: "sales_tax", label: "Sales Tax" },
  { key: "1099", label: "1099" },
];

// The two remaining placeholders — same page, honest copy, no fake data.
// Walkthrough finding (Brandon, 2026-08-14): the Pro badge here read as "my
// plan is blocking this" — it isn't. Balance Sheet is a PHASE gap, not a tier
// gate, so the section carries no tier badge and says so plainly.
const PLACEHOLDERS: Record<string, { title: string; note: string; bullets: string[]; tier?: "Pro" }> = {
  balance_sheet: {
    title: "Balance Sheet",
    note: "Balance Sheet arrives with accrual accounting in a later STELLA phase — every plan gets it, no upgrade needed. A point-in-time statement of what your business owns, owes, and is worth, derived from your ledger.",
    bullets: ["Assets · Liabilities · Equity", "As-of date picker", "Arrives for every plan — no upgrade needed"],
  },
  ap_aging: {
    title: "AP Aging",
    note: "What you owe and when it's due — current, 30, 60, 90+ day buckets across your vendors. Data lands in P2.",
    bullets: ["Current / 30 / 60 / 90+ buckets", "Per-vendor breakdown", "Prioritize what to pay next"],
  },
};

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
function fmtMonthShort(m: string) {
  const [y, mo] = String(m).split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short" });
}
function fmtMonthLong(m: string) {
  const [y, mo] = String(m).split("-").map(Number);
  if (!y || !mo) return m;
  return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

export function StellaReportsPage() {
  const { get, ready } = useStellaApi();
  const [report, setReport] = useState("pnl");
  const [month, setMonth] = useState(currentMonth());
  // Year picker shared by Sales Tax + 1099 (both are calendar-year reports).
  const [year, setYear] = useState(new Date().getFullYear());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlow | null>(null);
  const [arAging, setArAging] = useState<ArAging | null>(null);
  const [salesTax, setSalesTax] = useState<SalesTax | null>(null);
  const [ten99, setTen99] = useState<Ten99 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    if (PLACEHOLDERS[report]) return; // placeholder tabs fetch nothing
    setLoading(true);
    setError(null);
    try {
      if (report === "pnl") {
        const { from, to } = monthRange(month);
        setPnl(await get<Pnl>(`/ledger/pnl?from=${from}&to=${to}`));
      } else if (report === "cash_flow") {
        setCashFlow(await get<CashFlow>("/ledger/cash-flow?months=6"));
      } else if (report === "ar_aging") {
        setArAging(await get<ArAging>("/ledger/ar-aging"));
      } else if (report === "sales_tax") {
        setSalesTax(await get<SalesTax>(`/ledger/sales-tax?year=${year}`));
      } else if (report === "1099") {
        setTen99(await get<Ten99>(`/ledger/ten99?year=${year}`));
      }
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, report, month, year]);

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
  const hasData =
    report === "pnl" ? !!pnl
    : report === "cash_flow" ? !!cashFlow
    : report === "ar_aging" ? !!arAging
    : report === "sales_tax" ? !!salesTax
    : report === "1099" ? !!ten99
    : false;

  const yearNow = new Date().getFullYear();
  const yearOptions = [yearNow, yearNow - 1, yearNow - 2, yearNow - 3, yearNow - 4];

  return (
    <StellaShell
      title="Reports"
      subtitle="Your financial statements in one place — P&L, Cash Flow, AR Aging, Sales Tax, and 1099 are live."
      showRecord
      onRecorded={() => reload()}
      actions={
        report === "pnl" ? (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
          />
        ) : report === "sales_tax" || report === "1099" ? (
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24", background: "#fff" }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        ) : undefined
      }
      error={!placeholder ? error : undefined}
      loading={!placeholder && loading && !hasData}
    >
      <StellaTabs tabs={REPORTS} active={report} onChange={setReport} dataTour="stella-reports-tabs" />

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
          {/* Totals tiles — cash in / cash out / net */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
            <StatTile label="Cash in" value={fmtMoney(cashFlow.totals.inflow)} />
            <StatTile label="Cash out" value={fmtMoney(cashFlow.totals.outflow)} />
            <StatTile
              label="Net cash flow"
              value={fmtMoney(cashFlow.totals.net)}
              color={cashFlow.totals.net >= 0 ? "#047857" : "#B91C1C"}
            />
          </div>

          {/* Monthly in/out bars + net line */}
          <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1C24" }}>Monthly cash flow</div>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 8 }}>
              Last 6 months · cash basis · every non-void cash movement by sign (uncategorized included)
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={cashFlow.months} margin={{ left: 8, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="month" stroke="#64748B" fontSize={11} tickFormatter={(v: string) => fmtMonthShort(v)} />
                <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v: number) => `$${Number(v).toLocaleString()}`} />
                <Tooltip formatter={(v) => fmtMoney(Number(v ?? 0))} labelFormatter={(l) => fmtMonthLong(String(l))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="inflow" name="Cash in" fill="#047857" radius={[4, 4, 0, 0]} barSize={22} />
                <Bar dataKey="outflow" name="Cash out" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={22} />
                <Line type="monotone" dataKey="net" name="Net" stroke={STELLA_INDIGO} strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
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
            <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Sales tax collected — {salesTax.year}</div>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
              Cash basis — tax is recognized in the month the invoice was paid, full invoice tax at payment.
            </div>
          </div>
          <div style={{ padding: "8px 20px 16px" }}>
            {salesTax.collected.map((c) => (
              <Row
                key={c.month}
                label={fmtMonthLong(c.month)}
                value={fmtMoney(c.amount)}
                indent
                color={c.amount === 0 ? "#94A3B8" : undefined}
              />
            ))}
            <div style={{ borderTop: `2px solid ${STELLA_INDIGO}`, marginTop: 8 }}>
              <Row label="Total collected" value={fmtMoney(salesTax.total)} bold last />
            </div>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 12, fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
              Contractors paid {fmtMoney(ten99.threshold)} or more in a calendar year generally require a 1099-NEC.
              Card and third-party-processor payments are reported by the processor on 1099-K instead.
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

// StellaReportsPage — Ledger → Reports.
//
// ONE nav item consolidating the seven financial reports (house pattern:
// OliverReportsPage — one scrolling dashboard, no per-report nav rows).
// A report picker switches between [P&L | Balance Sheet | Cash Flow |
// AR Aging | AP Aging | Sales Tax | 1099]. P&L is LIVE over GET /ledger/pnl
// (stat tiles + expense-by-account bar + statement table); the other six are
// honest in-shell placeholders until their data lands in P2 — no fake data.
// Supersedes StellaPnlPage + the six separate report scaffold pages.
import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useStellaApi } from "../../hooks/useStellaApi";
import { StellaShell, StellaScaffoldCard, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

// GET /ledger/pnl response (stella-api routes/ledger.js).
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

const REPORTS = [
  { key: "pnl", label: "P&L" },
  { key: "balance_sheet", label: "Balance Sheet" },
  { key: "cash_flow", label: "Cash Flow" },
  { key: "ar_aging", label: "AR Aging" },
  { key: "ap_aging", label: "AP Aging" },
  { key: "sales_tax", label: "Sales Tax" },
  { key: "1099", label: "1099" },
];

// The six P2 placeholders — same page, honest copy, no fake data.
const PLACEHOLDERS: Record<string, { title: string; note: string; bullets: string[]; tier?: "Pro" }> = {
  balance_sheet: {
    title: "Balance Sheet",
    note: "A point-in-time statement of what your business owns, owes, and is worth, derived from your ledger. Data lands in P2.",
    bullets: ["Assets · Liabilities · Equity", "As-of date picker", "Pro tier and above"],
    tier: "Pro",
  },
  cash_flow: {
    title: "Cash Flow",
    note: "See where cash actually came from and went — operating, investing, and financing activity over a period. Data lands in P2.",
    bullets: ["Operating / Investing / Financing", "Period selector", "Pro tier and above"],
    tier: "Pro",
  },
  ar_aging: {
    title: "AR Aging",
    note: "Who owes you and for how long — current, 30, 60, 90+ day buckets across your customers. Data lands in P2.",
    bullets: ["Current / 30 / 60 / 90+ buckets", "Per-customer breakdown", "Ties into OLIVER invoices"],
  },
  ap_aging: {
    title: "AP Aging",
    note: "What you owe and when it's due — current, 30, 60, 90+ day buckets across your vendors. Data lands in P2.",
    bullets: ["Current / 30 / 60 / 90+ buckets", "Per-vendor breakdown", "Prioritize what to pay next"],
  },
  sales_tax: {
    title: "Sales Tax",
    note: "A jurisdiction-by-jurisdiction summary of tax collected vs owed so filing season is a lookup, not a scramble. Data lands in P2.",
    bullets: ["Collected vs owed by jurisdiction", "Period selector", "Export for filing"],
  },
  "1099": {
    title: "1099 Worksheet",
    note: "Totals per 1099-flagged contractor with W-9 status, so year-end reporting is ready when you are. Data lands in P2.",
    bullets: ["Per-contractor annual totals", "W-9 status at a glance", "Feeds year-end 1099-NEC"],
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

export function StellaReportsPage() {
  const { get, ready } = useStellaApi();
  const [report, setReport] = useState("pnl");
  const [month, setMonth] = useState(currentMonth());
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthRange(month);
      const data = await get<Pnl>(`/ledger/pnl?from=${from}&to=${to}`);
      setPnl(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, month]);

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

  return (
    <StellaShell
      title="Reports"
      subtitle="Your financial statements in one place — P&L live today, the rest land in P2."
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
        ) : undefined
      }
      error={report === "pnl" ? error : undefined}
      loading={report === "pnl" && loading && !pnl}
    >
      <StellaTabs tabs={REPORTS} active={report} onChange={setReport} />

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
                expenseLines.map((l) => (
                  <Row key={l.coa_account_id || l.account_name || "expense"} label={l.account_name || "Uncategorized"} value={fmtMoney(Math.abs(l.total))} indent />
                ))
              )}
              <Row label="Total expenses" value={fmtMoney(pnl.totals.expenses)} bold />

              <div style={{ borderTop: `2px solid ${STELLA_INDIGO}`, marginTop: 8 }}>
                <Row label="Net income" value={fmtMoney(pnl.totals.net)} bold color={pnl.totals.net >= 0 ? "#047857" : "#B91C1C"} last />
              </div>
            </div>
          </div>
        </>
      )}

      {placeholder && (
        <StellaScaffoldCard note={placeholder.note} bullets={placeholder.bullets} phase="P2" tier={placeholder.tier} />
      )}
    </StellaShell>
  );
}

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#0B1C24", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
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

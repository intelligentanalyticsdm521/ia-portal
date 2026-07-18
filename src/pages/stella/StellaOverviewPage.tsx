// StellaOverviewPage — STELLA 0.1.0 monthly P&L.
//
// A QuickBooks-style income statement (Income − Expenses-by-category = Net
// Income) for a chosen month, with a Cash/Accrual basis toggle (default Cash).
// Reads GET /stella/pnl on oliver-api (read-only over oliver.invoice + oliver.expense).
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

interface Pnl {
  month: string;
  basis: "cash" | "accrual";
  income: number;
  expenseTotal: number;
  netIncome: number;
  expensesByCategory: { category: string; amount: number }[];
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function StellaOverviewPage() {
  const { get, ready } = useOliverApi();
  const [month, setMonth] = useState(currentMonth());
  const [basis, setBasis] = useState<"cash" | "accrual">("cash");
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<Pnl>(`/stella/pnl?month=${month}&basis=${basis}`);
      setPnl(data);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, month, basis]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const monthLabel = (() => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return month;
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  })();

  return (
    <StellaShell
      title="Overview"
      subtitle="Your monthly profit & loss — revenue in, expenses out."
      actions={
        <>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
          />
          <div style={{ display: "inline-flex", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, overflow: "hidden" }}>
            {(["cash", "accrual"] as const).map((b) => (
              <button
                key={b}
                onClick={() => setBasis(b)}
                style={{
                  padding: "6px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  border: 0,
                  background: basis === b ? STELLA_INDIGO : "#fff",
                  color: basis === b ? "#fff" : "#5A7A8A",
                  textTransform: "capitalize",
                }}
              >
                {b}
              </button>
            ))}
          </div>
        </>
      }
      error={error}
      loading={loading && !pnl}
    >
      {pnl && (
        <div style={{ background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", background: STELLA_LAVENDER }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: STELLA_INDIGO }}>Profit &amp; Loss — {monthLabel}</div>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2, textTransform: "capitalize" }}>{pnl.basis} basis</div>
          </div>

          <div style={{ padding: "8px 20px 16px" }}>
            <Row label="Income" value={fmtMoney(pnl.income)} bold />

            <div style={{ marginTop: 12, marginBottom: 2, fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Expenses
            </div>
            {pnl.expenseTotal === 0 ? (
              <div style={{ padding: "6px 0", fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>$0 expenses recorded</div>
            ) : (
              pnl.expensesByCategory.map((e) => <Row key={e.category} label={e.category} value={fmtMoney(e.amount)} indent />)
            )}
            <Row label="Total expenses" value={fmtMoney(pnl.expenseTotal)} bold />

            <div style={{ borderTop: `2px solid ${STELLA_INDIGO}`, marginTop: 8 }}>
              <Row label="Net income" value={fmtMoney(pnl.netIncome)} bold color={pnl.netIncome >= 0 ? "#047857" : "#B91C1C"} last />
            </div>
          </div>
        </div>
      )}
    </StellaShell>
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

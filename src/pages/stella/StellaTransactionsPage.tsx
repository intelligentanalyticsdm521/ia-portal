// StellaTransactionsPage — Ledger → Transactions.
//
// The canonical ledger, consolidated per the 8-item nav cap: in-page tabs
// [All | Income | Expenses | Recurring] replace the separate Income /
// Recurring nav pages. Recording now rides the shell-level "+ Record"
// split-menu (StellaShell showRecord → shared RecordTransactionModal).
//
// 2026-07-30 design pass (QuickBooks-replacement look):
//   - Money-bar KPI tiles (Money in / Money out / Net, this month, from
//     /ledger/overview) that act as filters — in→Income tab, out→Expenses tab.
//   - Reimbursable filter pill (GET /ledger/transactions?reimbursable=open)
//     with an "owed" badge; deep-linkable via ?reimbursable=open (the Overview
//     hero links here).
//   - Amount column carries a "Personal card" indigo tag on is_reimbursable
//     rows; row click opens the TransactionDetailModal (IadmModal standard).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, type Column } from "../../components/oliver/ui";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import type { CoaAccount } from "./RecordTransactionModal";
import { TransactionDetailModal } from "./TransactionDetailModal";

// GET /ledger/transactions returns stella.[transaction] rows (t.*).
interface StellaTransaction {
  transaction_id: string;
  posted_date: string;
  direction: "inflow" | "outflow" | string;
  amount_signed: number | string;
  coa_account_id: string | null;
  counterparty_name?: string | null; // present when the API joins/echoes it
  description: string | null;
  memo: string | null;
  status: string | null;
  raw_source: string | null;
  is_reimbursable?: boolean | number | null;
  reimbursed_at?: string | null;
}

// Month money-bar slice of GET /ledger/overview (envelope unwrapped).
interface OverviewMoney {
  income: number;
  expenses: number;
  net: number;
  owedToYou: number;
}

// /ledger/recurring ships in the Ingestion phase — shape is best-effort.
interface RecurringRow {
  recurring_id?: string;
  template_id?: string;
  name?: string | null;
  counterparty_name?: string | null;
  cadence?: string | null;
  amount?: number | string | null;
  next_date?: string | null;
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  categorized: { bg: "#D1FAE5", color: "#047857" },
  needs_categorization: { bg: "#FEF3C7", color: "#92400E" },
  flagged: { bg: "#FEE2E2", color: "#991B1B" },
  reconciled: { bg: "#E0E7FF", color: "#3730A3" },
  void: { bg: "#F1F5F9", color: "#64748B" },
};

const TABS = [
  { key: "all", label: "All" },
  { key: "income", label: "Income" },
  { key: "expenses", label: "Expenses" },
  { key: "recurring", label: "Recurring" },
];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

export function StellaTransactionsPage() {
  const api = useStellaApi();
  const { get, ready } = api;
  const location = useLocation();
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<StellaTransaction[]>([]);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  const [money, setMoney] = useState<OverviewMoney | null>(null);
  // recurring: undefined = not loaded, null = endpoint not live yet (404)
  const [recurring, setRecurring] = useState<RecurringRow[] | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<StellaTransaction | null>(null);
  // Reimbursable filter — deep-linkable: the Overview hero links to
  // ?reimbursable=open. Toggled by the pill next to the search box.
  const [reimbOnly, setReimbOnly] = useState(() => new URLSearchParams(location.search).has("reimbursable"));

  // One fetch per page (house rule): transactions + COA + overview money-bar
  // together; recurring is allowed to 404 until the Ingestion phase and the
  // overview soft-fails (money bar simply hides) — neither poisons the page.
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const month = new Date().toISOString().slice(0, 7);
      const [txns, accounts, ovw, rec] = await Promise.all([
        get<StellaTransaction[]>(`/ledger/transactions${reimbOnly ? "?reimbursable=open" : ""}`),
        get<CoaAccount[]>("/ledger/coa").catch(() => [] as CoaAccount[]),
        get<OverviewMoney>(`/ledger/overview?month=${month}`).catch(() => null),
        get<RecurringRow[]>("/ledger/recurring").catch(() => null),
      ]);
      setRows(txns || []);
      setCoa(accounts || []);
      setMoney(ovw);
      setRecurring(rec);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, reimbOnly]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const coaNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of coa) m.set(a.coa_account_id, a.name);
    return m;
  }, [coa]);

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === "income") out = out.filter((r) => r.direction === "inflow" || toNum(r.amount_signed) > 0);
    else if (tab === "expenses") out = out.filter((r) => r.direction === "outflow" || toNum(r.amount_signed) < 0);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (r) =>
          (r.counterparty_name || "").toLowerCase().includes(q) ||
          (r.description || "").toLowerCase().includes(q) ||
          (r.memo || "").toLowerCase().includes(q) ||
          (coaNameById.get(r.coa_account_id || "") || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, tab, search, coaNameById]);

  function flashMsg(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  const columns: Column<StellaTransaction>[] = [
    {
      key: "posted_date",
      header: "Date",
      sortable: true,
      sortAccessor: (r) => r.posted_date,
      render: (r) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{fmtDate(r.posted_date)}</span>,
    },
    {
      key: "counterparty",
      header: "Counterparty / Description",
      render: (r) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
          {r.counterparty_name || r.description || r.memo || "—"}
        </span>
      ),
    },
    {
      key: "account",
      header: "Account",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A" }}>
          {coaNameById.get(r.coa_account_id || "") || "Uncategorized"}
        </span>
      ),
    },
    {
      key: "amount_signed",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (r) => toNum(r.amount_signed),
      render: (r) => {
        const n = toNum(r.amount_signed);
        return (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
            {!!r.is_reimbursable && (
              <span
                title={r.reimbursed_at ? `Personal card — reimbursed ${fmtDate(r.reimbursed_at)}` : "Personal card — needs reimbursement"}
                style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                  background: r.reimbursed_at ? "#F1F5F9" : `${STELLA_INDIGO}14`,
                  color: r.reimbursed_at ? "#64748B" : STELLA_INDIGO,
                  whiteSpace: "nowrap",
                }}
              >
                Personal card
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 600, color: n >= 0 ? "#047857" : "#0B1C24", fontVariantNumeric: "tabular-nums" }}>
              {n >= 0 ? "+" : "−"}
              {fmtMoney(Math.abs(n))}
            </span>
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const key = r.status || "needs_categorization";
        const p = STATUS_PILL[key] || STATUS_PILL.needs_categorization;
        return (
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
            {key.replace(/_/g, " ")}
          </span>
        );
      },
    },
  ];

  const recurringColumns: Column<RecurringRow>[] = [
    { key: "name", header: "Template", render: (r) => <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.name || r.counterparty_name || "—"}</span> },
    { key: "cadence", header: "Cadence", render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A", textTransform: "capitalize" }}>{r.cadence || "—"}</span> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{r.amount != null ? fmtMoney(toNum(r.amount)) : "—"}</span> },
    { key: "next_date", header: "Next", render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{fmtDate(r.next_date)}</span> },
  ];

  const moneyTile = (label: string, value: number, targetTab: string, color?: string) => {
    const active = tab === targetTab;
    return (
      <button
        onClick={() => setTab(targetTab)}
        style={{
          background: "#fff",
          border: `1px solid ${active ? STELLA_INDIGO : STELLA_LAVENDER}`,
          boxShadow: active ? `0 0 0 1px ${STELLA_INDIGO}` : undefined,
          borderRadius: 12,
          padding: "12px 16px",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: color || "#0B1C24", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
          {fmtMoney(value)}
        </div>
        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>this month · click to filter</div>
      </button>
    );
  };

  return (
    <StellaShell
      title="Transactions"
      subtitle="Your canonical ledger — every money-in and money-out line, cash-basis by default."
      showRecord
      onRecorded={(msg) => {
        reload();
        flashMsg(msg);
      }}
      error={error}
      loading={loading && !rows.length}
    >
      {flash && (
        <div style={{ marginBottom: 12, padding: "8px 12px", fontSize: 12, background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 8 }}>
          {flash}
        </div>
      )}

      {/* Money bar — this month's totals, click to filter */}
      {money && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
          {moneyTile("Money in", toNum(money.income), "income", "#047857")}
          {moneyTile("Money out", Math.abs(toNum(money.expenses)), "expenses")}
          {moneyTile("Net", toNum(money.net), "all", toNum(money.net) >= 0 ? "#047857" : "#B91C1C")}
        </div>
      )}

      <StellaTabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "recurring" ? (
        recurring == null || recurring.length === 0 ? (
          <EmptyState
            title="Recurring is coming in the Ingestion phase"
            description="STELLA will auto-detect recurring obligations — rent, SaaS, insurance — from your transaction history and let you define your own templates, with variance and missed-fire flags. Nothing to set up yet."
          />
        ) : (
          <DataTable
            rows={recurring}
            columns={recurringColumns}
            rowKey={(r) => r.recurring_id || r.template_id || `${r.name || ""}-${r.next_date || ""}-${r.amount ?? ""}`}
            emptyMessage="No recurring templates yet."
          />
        )
      ) : !rows.length && !loading && !reimbOnly && !search ? (
        <EmptyState
          title="No transactions yet"
          description="Transactions land here from bank feeds, receipts, recurring templates, and manual entry. Record your first income or expense with the + Record button above."
        />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by counterparty, account, or memo…"
              style={{ width: 320, maxWidth: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
            />
            <button
              onClick={() => setReimbOnly((v) => !v)}
              title="Show only personal-card expenses awaiting reimbursement"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 99,
                border: `1px solid ${reimbOnly ? STELLA_INDIGO : STELLA_LAVENDER}`,
                background: reimbOnly ? STELLA_INDIGO : "#fff",
                color: reimbOnly ? "#fff" : "#0B1C24",
                cursor: "pointer",
              }}
            >
              Reimbursable
              {money != null && toNum(money.owedToYou) > 0 && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 7px",
                    borderRadius: 99,
                    background: reimbOnly ? "rgba(255,255,255,0.22)" : `${STELLA_INDIGO}14`,
                    color: reimbOnly ? "#fff" : STELLA_INDIGO,
                  }}
                >
                  {fmtMoney(toNum(money.owedToYou))} owed
                </span>
              )}
            </button>
          </div>
          {filtered.length === 0 && reimbOnly ? (
            <EmptyState
              title="Nothing awaiting reimbursement"
              description="Personal-card expenses show up here until they're marked reimbursed. Record one with + Record → Record expense → Paid personally."
            />
          ) : (
            <DataTable
              rows={filtered}
              columns={columns}
              rowKey={(r) => r.transaction_id}
              onRowClick={(r) => setDetail(r)}
              initialSort={{ key: "posted_date", direction: "desc" }}
              emptyMessage="No transactions match these filters."
            />
          )}
        </>
      )}

      {detail && (
        <TransactionDetailModal
          txn={detail}
          coa={coa}
          onClose={(changed) => {
            setDetail(null);
            if (changed) reload();
          }}
        />
      )}
    </StellaShell>
  );
}

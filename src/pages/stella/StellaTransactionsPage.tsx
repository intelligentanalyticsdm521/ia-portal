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
//
// 2026-08-13 (Task E) — register drill target: the Chart of Accounts page
// links here as ?coa=<coa_account_id> (the QBO account-register pattern).
// The param becomes a server-side ?coa_account_id API filter plus a
// dismissible "Account: 6050 — Vehicle & Fuel ×" chip; clearing the chip
// clears both the filter and the URL param (same URL-sync discipline as the
// reimbursable pill below).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, type Column } from "../../components/oliver/ui";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";
import type { CoaAccount } from "./RecordTransactionModal";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { RecurringTab } from "./RecurringTab";
// STELLA pack 2, item 5 — several payments, one bank line. The panel shows
// itself only when there IS money waiting to be banked.
import { DepositGroupingPanel } from "./DepositGroupingPanel";

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
  // Job tag (Unit Economics) — the API LEFT JOINs oliver.job on tagged rows.
  job_id?: string | null;
  job_number?: string | null;
  job_title?: string | null;
  // Split lines (pack 1, item 9) — the API returns the count on every row.
  split_count?: number | null;
  // STELLA pack 2, item 11a. period_locked has been stamped by period close
  // since the double-entry migration and NOTHING has ever read it — a column
  // that was written and never believed. The register reads it now, to show a
  // padlock. It is NOT the refusal: refusing an edit is decided server-side
  // from the period's dates, which stays the one mechanism.
  in_closed_period?: boolean | number | null;
  // Which bank deposit this payment was banked in, if any (pack 2, item 5).
  deposit_id?: string | null;
}

// Month money-bar slice of GET /ledger/overview (envelope unwrapped).
interface OverviewMoney {
  income: number;
  expenses: number;
  net: number;
  owedToYou: number;
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  categorized: { bg: "#D1FAE5", color: "#047857" },
  needs_categorization: { bg: "#FEF3C7", color: "#92400E" },
  flagged: { bg: "#FEE2E2", color: "#991B1B" },
  reconciled: { bg: "#E0E7FF", color: "#3730A3" },
  void: { bg: "#F1F5F9", color: "#64748B" },
  // Personal (migration 157) — excluded from the books; slate. Rows only show
  // under the explicit Personal filter pill (the API hides them by default).
  personal: { bg: "#F1F5F9", color: "#475569" },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<StellaTransaction | null>(null);
  // The row THIS session just recorded via + Record. Marked with the
  // .stella-txn-new class so the do-it-with-me walkthrough spotlights the
  // user's own line — never a same-day stranger that happens to sort first
  // (the SPARK contact/campaign marker pattern). Cleared on the next record.
  const [newTxnId, setNewTxnId] = useState<string | null>(null);
  // Reimbursable filter — deep-linkable: the Overview hero links to
  // ?reimbursable=open. Toggled by the pill next to the search box. The URL
  // is kept in sync on toggle so a copied link always matches what's shown
  // (test finding: toggling off used to leave a stale ?reimbursable=open).
  const [reimbOnly, setReimbOnlyState] = useState(() => new URLSearchParams(location.search).has("reimbursable"));
  const setReimbOnly = useCallback((on: boolean) => {
    setReimbOnlyState(on);
    const url = new URL(window.location.href);
    if (on) url.searchParams.set("reimbursable", "open");
    else url.searchParams.delete("reimbursable");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  // Personal filter — the API hides status='personal' rows from every default
  // list; this pill sends the explicit ?status=personal so excluded personal
  // charges can be reviewed (and added back via the detail modal).
  const [personalOnly, setPersonalOnly] = useState(false);
  // Account filter — the COA register drill deep-links here as ?coa=<id>.
  // Server-side (?coa_account_id on the API); cleared via the chip's ×, which
  // also strips the URL param (same URL-sync pattern as the reimbursable pill).
  const [coaFilter, setCoaFilterState] = useState<string | null>(() => new URLSearchParams(location.search).get("coa"));
  const clearCoaFilter = useCallback(() => {
    setCoaFilterState(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("coa");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  // Job filter — deep-linkable as ?job=<job_id> (Unit Economics drill / the
  // row chip). Server-side (?job_id on the API); same URL-sync discipline as
  // the coa chip above.
  const [jobFilter, setJobFilterState] = useState<string | null>(() => new URLSearchParams(location.search).get("job"));
  const setJobFilter = useCallback((id: string | null) => {
    setJobFilterState(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("job", id);
    else url.searchParams.delete("job");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  // One fetch per page (house rule): transactions + COA + overview money-bar
  // together; the overview soft-fails (the money bar simply hides) rather than
  // poisoning the page. Recurring loads its own data inside RecurringTab —
  // it is a whole surface now, not one extra list.
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const month = new Date().toISOString().slice(0, 7);
      const qs = new URLSearchParams();
      if (reimbOnly) qs.set("reimbursable", "open");
      if (personalOnly) qs.set("status", "personal");
      if (coaFilter) qs.set("coa_account_id", coaFilter);
      if (jobFilter) qs.set("job_id", jobFilter);
      const query = qs.toString();
      const [txns, accounts, ovw] = await Promise.all([
        get<StellaTransaction[]>(`/ledger/transactions${query ? `?${query}` : ""}`),
        get<CoaAccount[]>("/ledger/coa").catch(() => [] as CoaAccount[]),
        get<OverviewMoney>(`/ledger/overview?month=${month}`).catch(() => null),
      ]);
      setRows(txns || []);
      setCoa(accounts || []);
      setMoney(ovw);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, reimbOnly, personalOnly, coaFilter, jobFilter]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const coaNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of coa) m.set(a.coa_account_id, a.name);
    return m;
  }, [coa]);

  // Chip label for the ?coa account filter — "6050 — Vehicle & Fuel".
  const coaFilterLabel = useMemo(() => {
    if (!coaFilter) return null;
    const a = coa.find((x) => x.coa_account_id === coaFilter);
    if (!a) return "Selected account";
    return a.code ? `${a.code} — ${a.name}` : a.name;
  }, [coa, coaFilter]);

  // Chip label for the ?job filter — "JOB-99001 — Patio install". The rows
  // themselves echo job_number/title (server LEFT JOIN), so the first tagged
  // row names the chip; a job with zero matching rows falls back generically.
  const jobFilterLabel = useMemo(() => {
    if (!jobFilter) return null;
    const r = rows.find((x) => x.job_id && String(x.job_id).toLowerCase() === jobFilter.toLowerCase());
    if (!r) return "Selected job";
    return r.job_number ? `${r.job_number}${r.job_title ? ` — ${r.job_title}` : ""}` : r.job_title || "Selected job";
  }, [rows, jobFilter]);

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
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
            {r.counterparty_name || r.description || r.memo || "—"}
          </span>
          {r.job_id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setJobFilter(String(r.job_id));
              }}
              title={`Tagged to ${r.job_number || "a job"}${r.job_title ? ` — ${r.job_title}` : ""}. Click to filter.`}
              style={{
                fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                background: `${STELLA_INDIGO}14`, color: STELLA_INDIGO,
                border: 0, cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              {r.job_number || "Job"}
            </button>
          )}
        </span>
      ),
    },
    {
      key: "account",
      header: "Account",
      render: (r) => {
        const n = Number(r.split_count || 0);
        // A split charge must NOT read as one account. Naming only the largest
        // category on a three-category charge is the register lying quietly.
        if (n >= 2) {
          return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span
                title="This charge is split across several accounts — open it to see the lines."
                style={{
                  fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
                  background: `${STELLA_INDIGO}14`, color: STELLA_INDIGO, whiteSpace: "nowrap",
                }}
              >
                Split × {n}
              </span>
              <span style={{ fontSize: 11, color: "#5A7A8A" }}>
                {coaNameById.get(r.coa_account_id || "") || "Uncategorized"} + {n - 1} more
              </span>
            </span>
          );
        }
        return (
          <span style={{ fontSize: 11, color: "#5A7A8A" }}>
            {coaNameById.get(r.coa_account_id || "") || "Uncategorized"}
          </span>
        );
      },
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
              {key.replace(/_/g, " ")}
            </span>
            {/* The padlock the closed-period column exists for. Opening the row
                still works — reading a closed month is fine; it is CHANGING it
                that is refused, and the refusal names the month and the way to
                reopen it. */}
            {!!r.in_closed_period && (
              <span
                title="This month is closed. You can look at this line; changing it is refused until the month is reopened under Settings → Period Close."
                style={{ display: "inline-flex", alignItems: "center", color: "#64748B" }}
              >
                <Lock size={11} />
              </span>
            )}
          </span>
        );
      },
    },
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
      onRecorded={(msg, transactionId) => {
        setNewTxnId(transactionId || null);
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
        <div data-tour="stella-money-bar" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 14 }}>
          {moneyTile("Money in", toNum(money.income), "income", "#047857")}
          {moneyTile("Money out", Math.abs(toNum(money.expenses)), "expenses")}
          {moneyTile("Net", toNum(money.net), "all", toNum(money.net) >= 0 ? "#047857" : "#B91C1C")}
        </div>
      )}

      {/* Money taken in and not yet banked (STELLA pack 2, item 5). The panel
          renders nothing at all when there is none, which is the normal state
          for a business that takes cards. */}
      <DepositGroupingPanel
        accounts={coa}
        onDeposited={(msg) => { flashMsg(msg); reload(); }}
      />

      <StellaTabs tabs={TABS} active={tab} onChange={setTab} dataTour="stella-txn-tabs" />

      {/* Ops O-5 (b): the real recurring surface. This tab used to say the
          feature was "coming in the Ingestion phase" while POST /ledger/recurring
          and /run had already shipped behind it. */}
      {tab === "recurring" ? (
        <RecurringTab />
      ) : !rows.length && !loading && !reimbOnly && !personalOnly && !coaFilter && !jobFilter && !search ? (
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
              data-tour="stella-reimbursable-pill"
              onClick={() => setReimbOnly(!reimbOnly)}
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
            <button
              onClick={() => setPersonalOnly(!personalOnly)}
              title="Show personal charges you've excluded from your business books"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 99,
                border: `1px solid ${personalOnly ? "#475569" : STELLA_LAVENDER}`,
                background: personalOnly ? "#475569" : "#fff",
                color: personalOnly ? "#fff" : "#0B1C24",
                cursor: "pointer",
              }}
            >
              Personal
            </button>
            {coaFilter && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 99,
                  border: `1px solid ${STELLA_INDIGO}`,
                  background: `${STELLA_INDIGO}14`,
                  color: STELLA_INDIGO,
                }}
              >
                Account: {coaFilterLabel}
                <button
                  onClick={clearCoaFilter}
                  aria-label="Clear account filter"
                  title="Clear account filter"
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 14,
                    fontWeight: 700,
                    color: STELLA_INDIGO,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </span>
            )}
            {jobFilter && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "6px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 99,
                  border: `1px solid ${STELLA_INDIGO}`,
                  background: `${STELLA_INDIGO}14`,
                  color: STELLA_INDIGO,
                }}
              >
                Job: {jobFilterLabel}
                <button
                  onClick={() => setJobFilter(null)}
                  aria-label="Clear job filter"
                  title="Clear job filter"
                  style={{
                    background: "transparent",
                    border: 0,
                    padding: 0,
                    lineHeight: 1,
                    fontSize: 14,
                    fontWeight: 700,
                    color: STELLA_INDIGO,
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </span>
            )}
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
              rowClassName={(r) => {
                // Case-insensitive GUID compare: SQL Server echoes uppercase
                // GUIDs on reads while the POST returns lowercase (same trap
                // the job-filter compare above guards against).
                return newTxnId && String(r.transaction_id).toLowerCase() === newTxnId.toLowerCase() ? "stella-txn-new" : "";
              }}
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

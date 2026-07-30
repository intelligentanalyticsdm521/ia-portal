// StellaTransactionsPage — Ledger → Transactions.
//
// The canonical ledger, consolidated per the 8-item nav cap: in-page tabs
// [All | Income | Expenses | Recurring] replace the separate Income /
// Recurring nav pages, and "Record income" / "Record expense" open an inline
// modal (house pattern: OliverSlaPoliciesPage.CreatePolicyModal) that POSTs
// /ledger/transactions. Receipts have no page — the modal carries a disabled
// "Attach receipt" hint until OCR lands in the Ingestion phase.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { Button, DataTable, EmptyState, type Column } from "../../components/oliver/ui";
import { StellaShell, StellaTabs, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

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
}

interface CoaAccount {
  coa_account_id: string;
  code: string | null;
  name: string;
  type: string | null; // asset | liability | equity | revenue | expense
  is_active: boolean | number | null;
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
  const [tab, setTab] = useState("all");
  const [rows, setRows] = useState<StellaTransaction[]>([]);
  const [coa, setCoa] = useState<CoaAccount[]>([]);
  // recurring: undefined = not loaded, null = endpoint not live yet (404)
  const [recurring, setRecurring] = useState<RecurringRow[] | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"inflow" | "outflow" | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // One fetch per page (house rule): transactions + COA together; recurring is
  // allowed to 404 until the Ingestion phase and must NOT poison the page.
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txns, accounts, rec] = await Promise.all([
        get<StellaTransaction[]>("/ledger/transactions"),
        get<CoaAccount[]>("/ledger/coa").catch(() => [] as CoaAccount[]),
        get<RecurringRow[]>("/ledger/recurring").catch(() => null),
      ]);
      setRows(txns || []);
      setCoa(accounts || []);
      setRecurring(rec);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

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
          <span style={{ fontSize: 12, fontWeight: 600, color: n >= 0 ? "#047857" : "#0B1C24", fontVariantNumeric: "tabular-nums" }}>
            {n >= 0 ? "+" : "−"}
            {fmtMoney(Math.abs(n))}
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

  return (
    <StellaShell
      title="Transactions"
      subtitle="Your canonical ledger — every money-in and money-out line, cash-basis by default."
      actions={
        <>
          <Button variant="secondary" onClick={() => setModal("inflow")}>Record income</Button>
          <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={() => setModal("outflow")}>
            Record expense
          </Button>
        </>
      }
      error={error}
      loading={loading && !rows.length}
    >
      {flash && (
        <div style={{ marginBottom: 12, padding: "8px 12px", fontSize: 12, background: "#D1FAE5", color: "#047857", border: "1px solid #A7F3D0", borderRadius: 8 }}>
          {flash}
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
      ) : !rows.length && !loading ? (
        <EmptyState
          title="No transactions yet"
          description="Transactions land here from bank feeds, receipts, recurring templates, and manual entry. Record your first income or expense with the buttons above."
        />
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by counterparty, account, or memo…"
              style={{ width: 320, maxWidth: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
            />
          </div>
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.transaction_id}
            initialSort={{ key: "posted_date", direction: "desc" }}
            emptyMessage="No transactions match these filters."
          />
        </>
      )}

      {modal && (
        <RecordTransactionModal
          direction={modal}
          coa={coa}
          post={api.post}
          onClose={() => setModal(null)}
          onCreated={(msg) => {
            setModal(null);
            reload();
            setFlash(msg);
            setTimeout(() => setFlash(null), 3000);
          }}
        />
      )}
    </StellaShell>
  );
}

// ── Record income / expense modal ────────────────────────────────────────────

function RecordTransactionModal({
  direction,
  coa,
  post,
  onClose,
  onCreated,
}: {
  direction: "inflow" | "outflow";
  coa: CoaAccount[];
  post: <T>(path: string, body?: unknown) => Promise<T>;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const isIncome = direction === "inflow";
  // Income posts to revenue accounts, expenses to expense accounts — but keep
  // the full COA reachable under an "Other accounts" group for edge cases.
  const preferredType = isIncome ? "revenue" : "expense";
  const preferred = coa.filter((a) => a.type === preferredType && a.is_active !== false && a.is_active !== 0);
  const others = coa.filter((a) => a.type !== preferredType && a.is_active !== false && a.is_active !== 0);

  const [counterparty, setCounterparty] = useState("");
  const [coaAccountId, setCoaAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [postedDate, setPostedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = Number(amount);
  const valid = counterparty.trim().length > 0 && coaAccountId && Number.isFinite(amountNum) && amountNum > 0 && !!postedDate;

  async function submit() {
    if (!valid) return;
    setErr(null);
    setSaving(true);
    try {
      await post("/ledger/transactions", {
        direction,
        coa_account_id: coaAccountId,
        counterparty_name: counterparty.trim(),
        amount: amountNum,
        posted_date: postedDate,
        memo: memo.trim() || null,
      });
      onCreated(`Recorded ${isIncome ? "income" : "expense"} of ${fmtMoney(amountNum)}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to record the transaction. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const optionFor = (a: CoaAccount) => (
    <option key={a.coa_account_id} value={a.coa_account_id}>
      {a.code ? `${a.code} — ${a.name}` : a.name}
    </option>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 460, maxWidth: "calc(100vw - 32px)", background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: `1px solid ${STELLA_LAVENDER}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0B1C24" }}>
            {isIncome ? "Record income" : "Record expense"}
          </h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label>
            <span style={mLabel}>{isIncome ? "Customer" : "Vendor"}</span>
            <input
              style={mInput}
              placeholder={isIncome ? "e.g. Johnson Residence" : "e.g. Home Depot"}
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              autoFocus
            />
          </label>
          <label>
            <span style={mLabel}>Account</span>
            <select style={mInput} value={coaAccountId} onChange={(e) => setCoaAccountId(e.target.value)}>
              <option value="">Select an account…</option>
              {preferred.length > 0 && <optgroup label={isIncome ? "Revenue" : "Expenses"}>{preferred.map(optionFor)}</optgroup>}
              {others.length > 0 && <optgroup label="Other accounts">{others.map(optionFor)}</optgroup>}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label>
              <span style={mLabel}>Amount</span>
              <input type="number" min="0.01" step="0.01" style={mInput} placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label>
              <span style={mLabel}>Date</span>
              <input type="date" style={mInput} value={postedDate} onChange={(e) => setPostedDate(e.target.value)} />
            </label>
          </div>
          <label>
            <span style={mLabel}>Memo</span>
            <textarea rows={2} style={{ ...mInput, resize: "vertical" }} placeholder="Optional note" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <button
            disabled
            title="Receipt OCR lands in the Ingestion phase"
            style={{ ...mInput, textAlign: "left", color: "#94A3B8", background: "#F8FAFC", cursor: "not-allowed", border: `1px dashed ${STELLA_LAVENDER}` }}
          >
            Attach receipt (OCR lands in the Ingestion phase)
          </button>
          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" style={{ background: STELLA_INDIGO }} onClick={submit} disabled={saving || !valid}>
              {saving ? "Saving…" : isIncome ? "Record income" : "Record expense"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const mLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const mInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, background: "#fff", color: "#0B1C24" };

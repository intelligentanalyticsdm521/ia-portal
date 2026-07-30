// StellaLedgerInboxPage — Ledger → Inbox.
//
// The needs-review queue (uncategorized / flagged / duplicate / OCR-pending) —
// the core bookkeeping UX. QBO-inspired one-tap accept/reject, but reviewable.
// Reads GET /ledger/inbox; accept/reject POST to /ledger/inbox/:id/accept|reject.
// Row click opens the TransactionDetailModal (IadmModal standard) so a line
// can be recategorized / memo'd / voided without leaving the queue.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { DataTable, EmptyState, Button, FilterBar, type Column } from "../../components/oliver/ui";
import { CheckCircle2, XCircle } from "lucide-react";
import { StellaShell, STELLA_INDIGO, fmtMoney } from "./StellaShell";
import { TransactionDetailModal, type DetailTxn } from "./TransactionDetailModal";

interface InboxItem {
  transaction_id: string;
  txn_date: string;
  counterparty_name: string | null;
  suggested_account: string | null;
  memo: string | null;
  amount: number | string;
  review_reason: string | null; // uncategorized | flagged | duplicate | ocr_pending
  trust_flags?: string[] | null;
  is_reimbursable?: boolean | number | null;
  reimbursed_at?: string | null;
}

const REASON_PILL: Record<string, { bg: string; color: string; label: string }> = {
  uncategorized: { bg: "#FEF3C7", color: "#92400E", label: "Uncategorized" },
  flagged: { bg: "#FEE2E2", color: "#991B1B", label: "Flagged" },
  duplicate: { bg: "#FCE7F3", color: "#9D174D", label: "Possible duplicate" },
  ocr_pending: { bg: "#E0E7FF", color: "#3730A3", label: "OCR pending" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "uncategorized", label: "Uncategorized" },
  { key: "flagged", label: "Flagged" },
  { key: "duplicate", label: "Duplicates" },
  { key: "ocr_pending", label: "OCR pending" },
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

export function StellaLedgerInboxPage() {
  const { get, post, ready } = useStellaApi();
  const [rows, setRows] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [detail, setDetail] = useState<InboxItem | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<InboxItem[]>("/ledger/inbox");
      setRows(data || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => (r.review_reason || "uncategorized") === filter);
  }, [rows, filter]);

  function flashMsg(m: string) {
    setFlash(m);
    setTimeout(() => setFlash(null), 3000);
  }

  async function act(id: string, verb: "accept" | "reject") {
    setBusy(id);
    try {
      await post(`/ledger/inbox/${id}/${verb}`);
      flashMsg(verb === "accept" ? "Accepted into the ledger." : "Rejected.");
      setRows((prev) => prev.filter((r) => r.transaction_id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : `${verb} failed`);
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<InboxItem>[] = [
    {
      key: "txn_date",
      header: "Date",
      render: (r) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{fmtDate(r.txn_date)}</span>,
    },
    {
      key: "counterparty_name",
      header: "Counterparty",
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.counterparty_name || "—"}</div>
          {r.memo && <div style={{ fontSize: 10, color: "#94A3B8" }}>{r.memo}</div>}
        </div>
      ),
    },
    {
      key: "suggested_account",
      header: "Suggested category",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{r.suggested_account || "—"}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => {
        const n = toNum(r.amount);
        return (
          <span style={{ fontSize: 12, fontWeight: 600, color: n >= 0 ? "#047857" : "#0B1C24", fontVariantNumeric: "tabular-nums" }}>
            {n >= 0 ? "+" : "−"}
            {fmtMoney(Math.abs(n))}
          </span>
        );
      },
    },
    {
      key: "review_reason",
      header: "Reason",
      render: (r) => {
        const p = REASON_PILL[r.review_reason || "uncategorized"] || REASON_PILL.uncategorized;
        return (
          <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: p.bg, color: p.color, fontSize: 11, fontWeight: 600 }}>
            {p.label}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      // stopPropagation so the one-tap buttons don't ALSO open the row's
      // detail modal (rows are clickable — see onRowClick below).
      render: (r) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }} onClick={(e) => e.stopPropagation()}>
          <Button variant="secondary" size="sm" onClick={() => act(r.transaction_id, "accept")} disabled={busy === r.transaction_id}>
            <CheckCircle2 size={11} color="#059669" /> Accept
          </Button>
          <Button variant="ghost" size="sm" onClick={() => act(r.transaction_id, "reject")} disabled={busy === r.transaction_id}>
            <XCircle size={11} color="#dc2626" />
          </Button>
        </div>
      ),
    },
  ];

  // Map an inbox item onto the DetailTxn shape the shared modal expects.
  function toDetailTxn(r: InboxItem): DetailTxn {
    return {
      transaction_id: r.transaction_id,
      posted_date: r.txn_date,
      counterparty_name: r.counterparty_name,
      memo: r.memo,
      amount_signed: r.amount,
      coa_account_id: null,
      status: r.review_reason === "flagged" ? "flagged" : "needs_categorization",
      is_reimbursable: r.is_reimbursable,
      reimbursed_at: r.reimbursed_at,
    };
  }

  return (
    <StellaShell
      title="Inbox"
      subtitle="Review new transactions — accept them into the ledger or reject the noise. One tap, always reviewable."
      showRecord
      onRecorded={() => {
        reload();
        flashMsg("Recorded.");
      }}
      error={error}
      loading={loading && !rows.length}
    >
      {flash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#EEF0FB", color: "#3730A3", border: `1px solid ${STELLA_INDIGO}33`, borderRadius: 6 }}>
          {flash}
        </div>
      )}

      {!rows.length && !loading ? (
        <EmptyState
          title="Inbox zero"
          description="Nothing needs review right now. New transactions from bank feeds, receipts, and recurring templates will queue up here for a quick accept or reject."
        />
      ) : (
        <>
          <FilterBar pills={FILTER_PILLS} activePill={filter} onPillChange={setFilter} />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.transaction_id}
            onRowClick={(r) => setDetail(r)}
            emptyMessage="Nothing to review in this filter."
          />
        </>
      )}

      {detail && (
        <TransactionDetailModal
          txn={toDetailTxn(detail)}
          onClose={(changed) => {
            setDetail(null);
            if (changed) reload();
          }}
        />
      )}
    </StellaShell>
  );
}

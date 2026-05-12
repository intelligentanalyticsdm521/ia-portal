import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";

interface Dispute {
  dispute_id: string;
  stripe_dispute_id: string;
  stripe_charge_id: string | null;
  stripe_payment_intent_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  contact_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  amount: number;
  currency: string;
  reason: string | null;
  status: string;
  evidence_due_by: string | null;
  has_evidence: boolean;
  stripe_dashboard_url: string | null;
  created_at_stripe: string | null;
}

interface Summary {
  total_count: number;
  total_amount: number;
  needs_response_count: number;
  needs_response_amount: number;
  won_count: number;
  lost_count: number;
}

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function fmtDaysUntil(d?: string | null): { text: string; tone: "ok" | "warn" | "alert" } {
  if (!d) return { text: "—", tone: "ok" };
  const ms = new Date(d).getTime() - Date.now();
  const days = Math.floor(ms / 86400000);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "alert" };
  if (days === 0) return { text: "Due today", tone: "alert" };
  if (days <= 3) return { text: `${days}d left`, tone: "alert" };
  if (days <= 7) return { text: `${days}d left`, tone: "warn" };
  return { text: `${days}d left`, tone: "ok" };
}

const STATUS_PILL: Record<string, { label: string; bg: string; color: string }> = {
  warning_needs_response: { label: "Action required", bg: "#FEE2E2", color: "#991B1B" },
  needs_response:         { label: "Action required", bg: "#FEE2E2", color: "#991B1B" },
  warning_under_review:   { label: "Under review",    bg: "#FEF3C7", color: "#92400E" },
  under_review:           { label: "Under review",    bg: "#FEF3C7", color: "#92400E" },
  won:                    { label: "Won",             bg: "#D1FAE5", color: "#047857" },
  lost:                   { label: "Lost",            bg: "#F3E8FF", color: "#7E22CE" },
  charge_refunded:        { label: "Refunded",        bg: "#E0F2FE", color: "#075985" },
  warning_closed:         { label: "Closed",          bg: "#F1F5F9", color: "#5A7A8A" },
  charge_dispute_closed:  { label: "Closed",          bg: "#F1F5F9", color: "#5A7A8A" },
};

const REASON_LABEL: Record<string, string> = {
  fraudulent: "Fraud claim",
  duplicate: "Duplicate charge",
  subscription_canceled: "Subscription canceled",
  product_not_received: "Product not received",
  product_unacceptable: "Product unacceptable",
  unrecognized: "Unrecognized",
  credit_not_processed: "Credit not processed",
  general: "General",
};

const FILTER_PILLS = [
  { key: "open", label: "Open" },
  { key: "", label: "All" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "closed", label: "Closed" },
];

export function OliverDisputesPage() {
  const { get, post, ready } = useOliverApi();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = filter ? `?status=${filter}` : "";
      const data = await get<{ disputes: Dispute[]; summary: Summary }>(`/disputes${qs}`);
      setDisputes(data.disputes || []);
      setSummary(data.summary || null);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, filter]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function syncFromStripe() {
    setSyncing(true); setFlash(null);
    try {
      const result = await post<{ total: number; imported: number; updated: number }>("/disputes/sync");
      await reload();
      setFlash(`Synced ${result.total} disputes from Stripe. ${result.imported} new, ${result.updated} updated.`);
      setTimeout(() => setFlash(null), 4000);
    } catch (err) {
      setError(err);
    } finally {
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return disputes;
    const q = search.toLowerCase();
    return disputes.filter((d) =>
      (d.customer_name || "").toLowerCase().includes(q) ||
      (d.invoice_number || "").toLowerCase().includes(q) ||
      (d.stripe_dispute_id || "").toLowerCase().includes(q));
  }, [disputes, search]);

  const columns: Column<Dispute>[] = [
    {
      key: "customer",
      header: "Customer",
      render: (d) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>{d.customer_name || "—"}</div>
          {d.invoice_number && (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{d.invoice_number}</div>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (d) => Number(d.amount),
      render: (d) => (
        <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#B91C1C" }}>{fmtMoney(d.amount)}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (d) => (
        <span style={{ color: "#0B1C24" }}>{REASON_LABEL[d.reason || ""] || d.reason || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (d) => {
        const pill = STATUS_PILL[d.status] || { label: d.status, bg: "#F1F5F9", color: "#5A7A8A" };
        return (
          <span style={{
            display: "inline-block", padding: "3px 9px", borderRadius: 99,
            background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600,
          }}>{pill.label}</span>
        );
      },
    },
    {
      key: "evidence_due",
      header: "Evidence due",
      render: (d) => {
        if (!d.evidence_due_by) return <span style={{ color: "#94A3B8" }}>—</span>;
        const t = fmtDaysUntil(d.evidence_due_by);
        const tone = {
          ok:    { color: "#475569" },
          warn:  { color: "#D97706" },
          alert: { color: "#B91C1C", fontWeight: 700 },
        }[t.tone];
        return (
          <div>
            <div style={{ fontSize: 12, ...tone }}>{t.text}</div>
            <div style={{ fontSize: 10, color: "#5A7A8A" }}>{fmtDate(d.evidence_due_by)}</div>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      width: "180px",
      align: "right",
      render: (d) => d.stripe_dashboard_url ? (
        <a
          href={d.stripe_dashboard_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block", padding: "5px 12px", fontSize: 11,
            borderRadius: 6, background: "#635BFF", color: "#fff",
            fontWeight: 600, textDecoration: "none",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {d.status === "warning_needs_response" || d.status === "needs_response" ? "Respond on Stripe →" : "View on Stripe →"}
        </a>
      ) : null,
    },
  ];

  return (
    <OliverPageWrapper title="Disputes" subtitle="Stripe chargebacks" error={error} loading={loading && !disputes.length}>
      <PageHeader
        title="Disputes"
        subtitle="Customer chargebacks pulled from Stripe. Evidence upload happens on the Stripe dashboard — OLIVER tracks them for you."
        actions={
          <Button variant="secondary" onClick={syncFromStripe} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync from Stripe"}
          </Button>
        }
      />

      {flash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>
          {flash}
        </div>
      )}

      {summary && summary.needs_response_count > 0 && (
        <div style={{
          padding: 16, marginBottom: 14, borderRadius: 10,
          background: "linear-gradient(90deg, #FEE2E2 0%, #FECACA 100%)",
          border: "1px solid #FCA5A5",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "#991B1B",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 18,
          }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#991B1B", fontSize: 14 }}>
              {summary.needs_response_count} dispute{summary.needs_response_count === 1 ? "" : "s"} need a response — {fmtMoney(summary.needs_response_amount)} at risk
            </div>
            <div style={{ fontSize: 12, color: "#7F1D1D", marginTop: 2 }}>
              Submit evidence on Stripe before the deadline or the dispute auto-loses.
            </div>
          </div>
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Total disputes</div>
          <div className="stat-val">{summary?.total_count ?? 0}</div>
          <div className="stat-delta neu">{fmtMoney(summary?.total_amount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Needs response</div>
          <div className="stat-val" style={{ color: (summary?.needs_response_count ?? 0) > 0 ? "#B91C1C" : undefined }}>
            {summary?.needs_response_count ?? 0}
          </div>
          <div className="stat-delta neu">{fmtMoney(summary?.needs_response_amount)} at risk</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Won</div>
          <div className="stat-val" style={{ color: "#059669" }}>{summary?.won_count ?? 0}</div>
          <div className="stat-delta neu">disputes successfully defended</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Lost</div>
          <div className="stat-val" style={{ color: "#7E22CE" }}>{summary?.lost_count ?? 0}</div>
          <div className="stat-delta neu">disputes that went against you</div>
        </div>
      </div>

      {!disputes.length && !loading ? (
        <EmptyState
          title="No disputes"
          description="Nice. If a customer disputes a charge in Stripe, it will appear here automatically. You can also click 'Sync from Stripe' to pull historical disputes."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search customer, invoice, or dispute ID…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(d) => d.dispute_id}
            initialSort={{ key: "amount", direction: "desc" }}
            emptyMessage="No disputes match these filters."
          />
        </>
      )}
    </OliverPageWrapper>
  );
}

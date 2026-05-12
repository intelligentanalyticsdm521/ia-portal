import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { oliverDownload } from "../../lib/oliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState,
  StatusBadge, TimeRangeSelector, Button, rangeForPreset,
  type Column, type TimeRange,
} from "../../components/oliver/ui";

interface PaymentRow {
  id: string;
  amount: number;
  currency: string;
  status: string;
  type: string; // 'payment' | 'refund'
  stripe_payment_intent_id?: string | null;
  stripe_charge_id?: string | null;
  stripe_refund_id?: string | null;
  paid_at?: string | null;
  created_at: string;
  invoice_id?: string;
  invoice_number?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
}

interface PaymentMeta {
  total_collected: number;
  total_refunded: number;
  net_collected: number;
  payment_count: number;
  refund_count: number;
}

interface PaymentsEnvelope {
  rows: PaymentRow[];
  meta: PaymentMeta;
}

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "type:payment", label: "Payments" },
  { key: "type:refund", label: "Refunds" },
  { key: "status:succeeded", label: "Succeeded" },
  { key: "status:failed", label: "Failed" },
];

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function rangeToQuery(r: TimeRange): string {
  const params = new URLSearchParams();
  if (r.fromISO) params.set("from", r.fromISO);
  if (r.toISO) params.set("to", r.toISO);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function OliverPaymentsPage() {
  const { get, post, ready } = useOliverApi();
  const { instance, accounts } = useMsal();
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [meta, setMeta] = useState<PaymentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    const account = accounts[0];
    if (!account) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (range.fromISO) params.set("from", range.fromISO);
      if (range.toISO) params.set("to", range.toISO);
      if (filter.startsWith("type:")) params.set("type", filter.split(":")[1]);
      if (filter.startsWith("status:")) params.set("status", filter.split(":")[1]);
      const qs = params.toString() ? `?${params.toString()}` : "";
      await oliverDownload(instance, account, `/exports/payments.csv${qs}`, `payments-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (e) {
      console.error(e);
    } finally {
      setExporting(false);
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const env = await get<PaymentsEnvelope>(`/payments${rangeToQuery(range)}`);
      // New shape: { rows, meta }. Old shape (defensive): direct array.
      if (env && Array.isArray((env as unknown as PaymentRow[]))) {
        const arr = env as unknown as PaymentRow[];
        setRows(arr);
        setMeta(computeMetaFromRows(arr));
      } else {
        setRows(env?.rows || []);
        setMeta(env?.meta || computeMetaFromRows(env?.rows || []));
      }
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, range]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter.startsWith("type:")) {
      const t = filter.split(":")[1];
      list = list.filter((r) => r.type === t);
    } else if (filter.startsWith("status:")) {
      const s = filter.split(":")[1];
      list = list.filter((r) => r.status === s);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.invoice_number?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q) ||
        r.customerEmail?.toLowerCase().includes(q) ||
        r.stripe_charge_id?.toLowerCase().includes(q) ||
        r.stripe_payment_intent_id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filter, search]);

  const columns: Column<PaymentRow>[] = [
    {
      key: "paid_at",
      header: "Date",
      sortable: true,
      sortAccessor: (r) => r.paid_at ?? r.created_at,
      render: (r) => <span style={{ fontSize: 12, color: "#5A7A8A" }}>{new Date(r.paid_at || r.created_at).toLocaleDateString()}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, color: "#0B1C24" }}>{r.customerName || "—"}</div>
          {r.customerEmail && <div style={{ fontSize: 10, color: "#5A7A8A" }}>{r.customerEmail}</div>}
        </div>
      ),
    },
    {
      key: "invoice",
      header: "Invoice",
      render: (r) => r.invoice_number ? <span style={{ fontFamily: "monospace", fontSize: 12, color: "#1A7DB5" }}>{r.invoice_number}</span> : "—",
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 500,
          padding: "2px 8px", borderRadius: 999,
          background: r.type === "refund" ? "#F3E8FF" : "#D1FAE5",
          color: r.type === "refund" ? "#7E22CE" : "#047857",
        }}>{r.type}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (r) => Number(r.amount),
      render: (r) => (
        <span style={{ fontWeight: 600, fontFamily: "monospace", color: r.type === "refund" ? "#9333EA" : "#059669" }}>
          {r.type === "refund" ? "−" : ""}{fmtMoney(r.amount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "stripe_id",
      header: "Stripe ID",
      render: (r) => {
        const id = r.stripe_refund_id || r.stripe_charge_id || r.stripe_payment_intent_id;
        return id ? <span style={{ fontFamily: "monospace", fontSize: 10, color: "#5A7A8A" }}>{id.slice(0, 18)}…</span> : <span style={{ fontSize: 10, color: "#94A3B8" }}>—</span>;
      },
    },
  ];

  return (
    <OliverPageWrapper title="Payments" subtitle="Payment & refund history" error={error} loading={loading}>
      <PageHeader
        title="Payments"
        subtitle="Every charge and refund routed through your Stripe Connect account"
        actions={
          <>
            <Button variant="secondary" onClick={exportCsv} disabled={exporting || !rows.length}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <TimeRangeSelector value={range} onChange={setRange} />
          </>
        }
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Net collected</div>
          <div className="stat-val">{fmtMoney(meta?.net_collected)}</div>
          <div className="stat-delta neu">in selected range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Gross</div>
          <div className="stat-val">{fmtMoney(meta?.total_collected)}</div>
          <div className="stat-delta neu">{meta?.payment_count ?? 0} payments</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Refunded</div>
          <div className="stat-val">{fmtMoney(meta?.total_refunded)}</div>
          <div className="stat-delta neu">{meta?.refund_count ?? 0} refunds</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Average</div>
          <div className="stat-val">
            {fmtMoney((meta?.payment_count ?? 0) > 0 ? (meta!.total_collected / meta!.payment_count) : 0)}
          </div>
          <div className="stat-delta neu">per successful payment</div>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState
          title="No payments in this range"
          description="Try a wider time range, or send your first invoice from the Invoices page to start collecting payments."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search customer, invoice, or Stripe ID…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            initialSort={{ key: "paid_at", direction: "desc" }}
            emptyMessage="No transactions match these filters."
          />
        </>
      )}

      {detailId && (
        <PaymentDetailDrawer
          paymentId={detailId}
          onClose={() => setDetailId(null)}
          api={{ get, post }}
          onMutated={reload}
        />
      )}
    </OliverPageWrapper>
  );
}

function computeMetaFromRows(rows: PaymentRow[]): PaymentMeta {
  const collected = rows.filter(r => r.type === "payment" && r.status === "succeeded").reduce((s, r) => s + Number(r.amount || 0), 0);
  const refunded  = rows.filter(r => r.type === "refund"  && r.status === "succeeded").reduce((s, r) => s + Number(r.amount || 0), 0);
  return {
    total_collected: collected,
    total_refunded: refunded,
    net_collected: collected - refunded,
    payment_count: rows.filter(r => r.type === "payment" && r.status === "succeeded").length,
    refund_count: rows.filter(r => r.type === "refund" && r.status === "succeeded").length,
  };
}

interface PaymentDetail extends PaymentRow {
  invoice_total?: number;
  customer_name?: string;
  customer_email?: string;
}

function PaymentDetailDrawer({
  paymentId, onClose, api, onMutated,
}: {
  paymentId: string;
  onClose: () => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
  onMutated?: () => void;
}) {
  const [p, setP] = useState<PaymentDetail | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("customer_request");
  const [refundSaving, setRefundSaving] = useState(false);
  const [refundMsg, setRefundMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => { setP(await api.get<PaymentDetail>(`/payments/${paymentId}`)); })();
  }, [paymentId, api]);

  async function submitRefund() {
    if (!p) return;
    setRefundSaving(true);
    setRefundMsg(null);
    try {
      const amount = refundAmount.trim() ? Number(refundAmount) : undefined;
      const result = await api.post<{ amount_refunded: number; stripe_refund_id: string; fully_refunded: boolean }>(
        `/payments/${paymentId}/refund`,
        { amount, reason: refundReason },
      );
      setRefundMsg(
        `Refunded ${fmtMoney(result.amount_refunded)} successfully${result.fully_refunded ? " (full refund)" : ""}.`,
      );
      // Refresh detail so the "refundable balance" reflects the new state
      setP(await api.get<PaymentDetail>(`/payments/${paymentId}`));
      onMutated?.();
      setTimeout(() => { setRefundOpen(false); setRefundMsg(null); }, 2000);
    } catch (e) {
      setRefundMsg(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setRefundSaving(false);
    }
  }

  if (!p) {
    return <DetailDrawer open onClose={onClose} title="Loading…" width="md"><div style={{ padding: 20, color: "#5A7A8A" }}>Loading payment…</div></DetailDrawer>;
  }

  const canRefund = p.type === "payment" && p.status === "succeeded"
    && (p.stripe_payment_intent_id || p.stripe_charge_id);

  return (
    <DetailDrawer
      open onClose={onClose}
      title={p.type === "refund" ? "Refund" : "Payment"}
      subtitle={`${fmtMoney(p.amount)} · ${new Date(p.paid_at || p.created_at).toLocaleString()}`}
      width="lg"
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <StatusBadge status={p.status} />
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 500,
          padding: "2px 8px", borderRadius: 999,
          background: p.type === "refund" ? "#F3E8FF" : "#D1FAE5",
          color: p.type === "refund" ? "#7E22CE" : "#047857",
        }}>{p.type}</span>
        {canRefund && !refundOpen && (
          <Button variant="secondary" onClick={() => setRefundOpen(true)} style={{ marginLeft: "auto" }}>
            Refund this payment
          </Button>
        )}
      </div>

      {refundOpen && (
        <div className="card" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <div className="card-ttl" style={{ color: "#92400E" }}>Issue refund</div>
          <div className="card-sub">Posts to Stripe and records a refund row locally. Amount can be partial.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Amount (USD)</span>
              <input type="number" min="0.01" step="0.01" placeholder={`Full: ${fmtMoney(p.amount)}`}
                style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" }}
                value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Reason</span>
              <select style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" }}
                value={refundReason} onChange={(e) => setRefundReason(e.target.value)}>
                <option value="customer_request">Requested by customer</option>
                <option value="duplicate">Duplicate</option>
                <option value="fraud">Fraudulent</option>
              </select>
            </label>
          </div>
          {refundMsg && (
            <div style={{ marginTop: 10, padding: 8, fontSize: 12,
                          background: refundMsg.includes("failed") ? "#FEF2F2" : "#F0FDF4",
                          color: refundMsg.includes("failed") ? "#991B1B" : "#15803D",
                          border: `1px solid ${refundMsg.includes("failed") ? "#FECACA" : "#BBF7D0"}`,
                          borderRadius: 6 }}>{refundMsg}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button variant="ghost" onClick={() => { setRefundOpen(false); setRefundAmount(""); setRefundMsg(null); }} disabled={refundSaving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitRefund} disabled={refundSaving}>
              {refundSaving ? "Refunding…" : "Issue refund"}
            </Button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-ttl">Transaction</div>
        <Row label="Amount" value={<span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(p.amount)} {p.currency}</span>} />
        {p.invoice_number && <Row label="Invoice" value={<span style={{ fontFamily: "monospace", color: "#1A7DB5" }}>{p.invoice_number}</span>} />}
        {p.invoice_total != null && <Row label="Invoice total" value={<span style={{ fontFamily: "monospace" }}>{fmtMoney(p.invoice_total)}</span>} />}
        {p.customer_name && <Row label="Customer" value={<>{p.customer_name}{p.customer_email && <span style={{ color: "#5A7A8A" }}> · {p.customer_email}</span>}</>} />}
        {p.paid_at && <Row label="Settled" value={new Date(p.paid_at).toLocaleString()} />}
      </div>

      <div className="card">
        <div className="card-ttl">Stripe references</div>
        {p.stripe_payment_intent_id && <Row label="Payment Intent" value={<span style={{ fontFamily: "monospace", fontSize: 11 }}>{p.stripe_payment_intent_id}</span>} />}
        {p.stripe_charge_id && <Row label="Charge" value={<span style={{ fontFamily: "monospace", fontSize: 11 }}>{p.stripe_charge_id}</span>} />}
        {p.stripe_refund_id && <Row label="Refund" value={<span style={{ fontFamily: "monospace", fontSize: 11 }}>{p.stripe_refund_id}</span>} />}
        {!p.stripe_payment_intent_id && !p.stripe_charge_id && !p.stripe_refund_id && (
          <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic" }}>No Stripe references on this transaction.</div>
        )}
      </div>
    </DetailDrawer>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "5px 0", fontSize: 12 }}>
      <span style={{ color: "#5A7A8A" }}>{label}</span>
      <span style={{ color: "#0B1C24" }}>{value}</span>
    </div>
  );
}

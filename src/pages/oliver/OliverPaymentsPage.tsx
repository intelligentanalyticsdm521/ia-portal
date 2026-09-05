import { useCallback, useEffect, useMemo, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation } from "../../lib/oliverLocations";
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
  payment_brand?: string | null;
  payment_last4?: string | null;
  payment_method?: string | null;
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
  const loc = useOliverLocations(); // header location picker → list scope (payments follow their invoice)
  const { instance } = useMsal();
  // useActiveAccount, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there
  // is no MSAL session, so accounts[0] is undefined and every `if (!account)`
  // guard below it turns the control into a button that does nothing.
  const activeAccount = useActiveAccount();
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [meta, setMeta] = useState<PaymentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualFlash, setManualFlash] = useState<string | null>(null);

  async function exportCsv() {
    const account = activeAccount;
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
      const env = await get<PaymentsEnvelope>(withLocation(`/payments${rangeToQuery(range)}`, loc.selectedLocationId));
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
  }, [get, range, loc.selectedLocationId]);

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
      key: "method",
      header: "Method",
      render: (r) => <PaymentMethodCell row={r} />,
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
            <Button variant="secondary" onClick={() => setManualOpen(true)}>+ Record payment</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={exporting || !rows.length}>
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <TimeRangeSelector value={range} onChange={setRange} />
          </>
        }
      />

      {manualOpen && (
        <ManualPaymentDrawer
          onClose={() => setManualOpen(false)}
          onRecorded={async (msg) => {
            setManualOpen(false);
            await reload();
            setManualFlash(msg);
            setTimeout(() => setManualFlash(null), 3500);
          }}
          api={{ get, post }}
        />
      )}

      {manualFlash && (
        <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>
          {manualFlash}
        </div>
      )}

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

// ─── Payment method cell ────────────────────────────────────────────────
// Shows card brand + last4, or "Cash"/"Check"/"Wire" for manual payments.
function PaymentMethodCell({ row }: { row: PaymentRow }) {
  // Manual payments (payment_method set by /payments/manual)
  if (row.payment_method && !row.payment_brand) {
    const label: Record<string, string> = {
      cash: "Cash", check: "Check", wire: "Wire", ach_manual: "ACH (manual)", other: "Other",
    };
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: "#0B1C24", fontWeight: 500 }}>{label[row.payment_method] || row.payment_method}</div>
        <div style={{ fontSize: 10, color: "#5A7A8A" }}>Manual</div>
      </div>
    );
  }
  // Stripe-tagged payments
  if (row.payment_brand && row.payment_last4) {
    const brandLabel: Record<string, string> = {
      visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover",
      diners: "Diners", jcb: "JCB", unionpay: "UnionPay", link: "Link",
    };
    return (
      <div style={{ fontSize: 12 }}>
        <div style={{ color: "#0B1C24", fontWeight: 500 }}>
          {brandLabel[row.payment_brand] || row.payment_brand}
        </div>
        <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>•••• {row.payment_last4}</div>
      </div>
    );
  }
  if (row.payment_brand) {
    return <span style={{ fontSize: 12, color: "#0B1C24" }}>{row.payment_brand}</span>;
  }
  // Fallback: Stripe payment with no method details (older import)
  if (row.stripe_payment_intent_id || row.stripe_charge_id) {
    return <span style={{ fontSize: 12, color: "#0B1C24" }}>Stripe</span>;
  }
  return <span style={{ fontSize: 10, color: "#94A3B8" }}>—</span>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "5px 0", fontSize: 12 }}>
      <span style={{ color: "#5A7A8A" }}>{label}</span>
      <span style={{ color: "#0B1C24" }}>{value}</span>
    </div>
  );
}

// ─── Manual payment drawer ──────────────────────────────────────────────────
// Lets the admin record an off-Stripe payment (cash/check/wire/etc.) against
// an outstanding invoice. We fetch the list of open invoices for the picker
// so the user doesn't have to remember invoice numbers.
interface OpenInvoiceOption {
  id: string;
  invoice_number: string;
  total: number;
  balance_due: number;
  customer_name?: string | null;
}

function ManualPaymentDrawer({
  onClose, onRecorded, api,
}: {
  onClose: () => void;
  onRecorded: (msg: string) => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, body?: unknown) => Promise<T>;
  };
}) {
  const [invoices, setInvoices] = useState<OpenInvoiceOption[]>([]);
  const [invoiceId, setInvoiceId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("check");
  const [paidAt, setPaidAt] = useState<string>(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Reuse the existing invoice list endpoint, filter for open balances.
        const list = await api.get<Array<{
          invoice_id: string; invoice_number: string;
          total: number; balance_due: number; status: string;
          customer_name?: string;
        }>>("/invoices?status=sent");
        const open = (list || [])
          .filter((i) => Number(i.balance_due) > 0)
          .map((i) => ({
            id: i.invoice_id, invoice_number: i.invoice_number,
            total: Number(i.total), balance_due: Number(i.balance_due),
            customer_name: i.customer_name,
          }));
        setInvoices(open);
      } catch {
        setInvoices([]);
      }
    })();
  }, [api]);

  const selected = invoices.find((i) => i.id === invoiceId);

  async function submit() {
    if (!invoiceId) { setErr("Select an invoice"); return; }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) { setErr("Enter an amount > 0"); return; }
    setErr(null);
    setSaving(true);
    try {
      const res = await api.post<{
        amount: number; invoice_status: string; invoice_balance: number;
      }>("/payments/manual", {
        invoice_id: invoiceId,
        amount: amt,
        method,
        paid_at: paidAt ? new Date(paidAt + "T12:00:00").toISOString() : undefined,
        note: note.trim() || undefined,
      });
      onRecorded(
        res.invoice_status === "paid"
          ? `Recorded ${fmtMoney(res.amount)} via ${method}. Invoice marked paid.`
          : `Recorded ${fmtMoney(res.amount)} via ${method}. Balance remaining: ${fmtMoney(res.invoice_balance)}.`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>Record payment</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <div style={{ fontSize: 12, color: "#5A7A8A", lineHeight: 1.5, padding: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6 }}>
            Records a payment that didn't go through Stripe (cash, check, wire, etc.). The invoice's balance and status are updated automatically.
          </div>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Invoice</span>
            <select style={inputStyleM} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
              <option value="">Pick an open invoice…</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.invoice_number} — {i.customer_name || "(no customer)"} · {fmtMoney(i.balance_due)} due
                </option>
              ))}
            </select>
            {!invoices.length && (
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 6 }}>
                No invoices with an outstanding balance.
              </div>
            )}
          </label>

          {selected && (
            <div style={{ padding: 10, background: "#F0F9FF", border: "1px solid #BAE6FD", borderRadius: 8, fontSize: 12 }}>
              <div style={{ color: "#0B1C24" }}>{selected.invoice_number} — {selected.customer_name || "(no customer)"}</div>
              <div style={{ color: "#5A7A8A", marginTop: 4 }}>
                Total {fmtMoney(selected.total)} · Balance due <strong style={{ color: "#B91C1C" }}>{fmtMoney(selected.balance_due)}</strong>
              </div>
            </div>
          )}

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Amount (USD)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#5A7A8A" }}>$</span>
              <input type="number" min="0.01" step="0.01"
                placeholder={selected ? selected.balance_due.toFixed(2) : "0.00"}
                style={{ ...inputStyleM, flex: 1 }}
                value={amount} onChange={(e) => setAmount(e.target.value)} />
              {selected && (
                <button type="button" onClick={() => setAmount(selected.balance_due.toFixed(2))}
                  style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "1px solid #1A7DB5", background: "#fff", color: "#1A7DB5", cursor: "pointer" }}>
                  Pay in full
                </button>
              )}
            </div>
          </label>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Method</span>
            <select style={inputStyleM} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="check">Check</option>
              <option value="cash">Cash</option>
              <option value="wire">Wire transfer</option>
              <option value="ach_manual">ACH (manual)</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Date received</span>
            <input type="date" style={inputStyleM}
              value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Note (optional)</span>
            <textarea rows={2} style={{ ...inputStyleM, resize: "vertical" }}
              placeholder="Check #1234, deposited 5/12"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !invoiceId || !amount}>
              {saving ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyleM: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};

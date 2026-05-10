import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState,
  StatusBadge, type Column,
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

export function OliverPaymentsPage() {
  const { get, ready } = useOliverApi();
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [meta, setMeta] = useState<PaymentMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the underlying request to access meta envelope
      const path = "/payments";
      const data = await get<PaymentRow[]>(path);
      setRows(data || []);
      // Re-fetch with meta envelope (requires a follow-up call since unwrap strips meta)
      // For now compute KPIs locally
      const collected = (data ?? []).filter(r => r.type === "payment" && r.status === "succeeded").reduce((s, r) => s + Number(r.amount || 0), 0);
      const refunded  = (data ?? []).filter(r => r.type === "refund"  && r.status === "succeeded").reduce((s, r) => s + Number(r.amount || 0), 0);
      setMeta({
        total_collected: collected,
        total_refunded: refunded,
        net_collected: collected - refunded,
        payment_count: (data ?? []).filter(r => r.type === "payment" && r.status === "succeeded").length,
        refund_count: (data ?? []).filter(r => r.type === "refund" && r.status === "succeeded").length,
      });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get]);

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
      render: (r) => <span className="text-sm text-slate-600">{new Date(r.paid_at || r.created_at).toLocaleDateString()}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      render: (r) => (
        <div>
          <div className="text-sm text-slate-700">{r.customerName || "—"}</div>
          {r.customerEmail && <div className="text-xs text-slate-500">{r.customerEmail}</div>}
        </div>
      ),
    },
    {
      key: "invoice",
      header: "Invoice",
      render: (r) => r.invoice_number ? <span className="font-mono text-sm text-oliver-teal">{r.invoice_number}</span> : "—",
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
          r.type === "refund" ? "bg-purple-50 text-purple-700 ring-purple-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
        }`}>
          {r.type}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (r) => Number(r.amount),
      render: (r) => (
        <span className={`font-medium tabular-nums ${r.type === "refund" ? "text-purple-700" : "text-emerald-700"}`}>
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
        return id ? <span className="font-mono text-xs text-slate-500">{id.slice(0, 18)}…</span> : <span className="text-xs text-slate-400">—</span>;
      },
    },
  ];

  return (
    <OliverPageWrapper title="Payments" subtitle="Payment & refund history" error={error} loading={loading}>
      <PageHeader title="Payments" subtitle="Every charge and refund routed through your Stripe Connect account" />

      <div className="flex items-end gap-12 mb-6">
        <div>
          <div className="text-xs text-slate-500">Net collected</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{fmtMoney(meta?.net_collected)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Gross</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{fmtMoney(meta?.total_collected)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Refunded</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">{fmtMoney(meta?.total_refunded)}</div>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState
          title="No payments yet"
          description="Payments and refunds appear here as soon as your customers pay an invoice. Send your first invoice from the Invoices page to get started."
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
          api={{ get }}
        />
      )}
    </OliverPageWrapper>
  );
}

interface PaymentDetail extends PaymentRow {
  invoice_total?: number;
  customer_name?: string;
  customer_email?: string;
}

function PaymentDetailDrawer({ paymentId, onClose, api }: { paymentId: string; onClose: () => void; api: { get: <T>(p: string) => Promise<T> } }) {
  const [p, setP] = useState<PaymentDetail | null>(null);
  useEffect(() => {
    (async () => { setP(await api.get<PaymentDetail>(`/payments/${paymentId}`)); })();
  }, [paymentId, api]);

  if (!p) {
    return <DetailDrawer open onClose={onClose} title="Loading…" width="md"><div className="text-sm text-slate-500">Loading payment…</div></DetailDrawer>;
  }
  return (
    <DetailDrawer
      open onClose={onClose}
      title={p.type === "refund" ? "Refund" : "Payment"}
      subtitle={`${fmtMoney(p.amount)} · ${new Date(p.paid_at || p.created_at).toLocaleString()}`}
      width="lg"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <StatusBadge status={p.status} size="md" />
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${
            p.type === "refund" ? "bg-purple-50 text-purple-700 ring-purple-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
          }`}>{p.type}</span>
        </div>

        <div className="rounded-xl bg-slate-50 ring-1 ring-gray-200 p-4 space-y-2 text-sm">
          <Row label="Amount" value={<span className="tabular-nums font-semibold">{fmtMoney(p.amount)} {p.currency}</span>} />
          {p.invoice_number && <Row label="Invoice" value={<span className="font-mono text-oliver-teal">{p.invoice_number}</span>} />}
          {p.invoice_total != null && <Row label="Invoice total" value={<span className="tabular-nums">{fmtMoney(p.invoice_total)}</span>} />}
          {p.customer_name && <Row label="Customer" value={<>{p.customer_name}{p.customer_email && <span className="text-slate-500"> · {p.customer_email}</span>}</>} />}
          {p.paid_at && <Row label="Settled" value={new Date(p.paid_at).toLocaleString()} />}
        </div>

        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-4 text-sm space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stripe references</h3>
          {p.stripe_payment_intent_id && <Row label="Payment Intent" value={<span className="font-mono text-xs">{p.stripe_payment_intent_id}</span>} />}
          {p.stripe_charge_id && <Row label="Charge" value={<span className="font-mono text-xs">{p.stripe_charge_id}</span>} />}
          {p.stripe_refund_id && <Row label="Refund" value={<span className="font-mono text-xs">{p.stripe_refund_id}</span>} />}
          {!p.stripe_payment_intent_id && !p.stripe_charge_id && !p.stripe_refund_id && (
            <div className="text-xs text-slate-500 italic">No Stripe references on this transaction.</div>
          )}
        </div>
      </div>
    </DetailDrawer>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}

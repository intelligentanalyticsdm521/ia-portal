import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";
import { QuoteCreateForm } from "./QuoteCreateForm";

interface QuoteRow {
  id: string;
  jobTitle: string;
  jobId: string;
  customerName?: string;
  amount: number;
  status: string;
  createdAt: string;
  sentAt?: string | null;
  validUntil?: string | null;
}

interface QuoteLineItem {
  line_item_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  sort_order: number;
}

interface QuoteDetail {
  quote_id: string;
  job_id: string;
  contact_id: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  valid_until?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  created_at: string;
  line_items?: QuoteLineItem[];
}

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "accepted", label: "Accepted" },
  { key: "declined", label: "Declined" },
  { key: "expired", label: "Expired" },
];

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function OliverQuotesPage() {
  const { get, post, ready } = useOliverApi();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<QuoteRow[]>("/quotes");
      setRows(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter) list = list.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) => r.jobTitle?.toLowerCase().includes(q) || r.customerName?.toLowerCase().includes(q));
    }
    return list;
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);
  const pills = FILTER_PILLS.map((p) => ({ ...p, count: counts[p.key] ?? 0 }));

  const kpis = useMemo(() => {
    const valueByStatus = (s: string) => rows.filter((r) => r.status === s).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const open = rows.filter((r) => r.status === "sent").length;
    const totalDecided = rows.filter((r) => r.status === "accepted" || r.status === "declined").length;
    const accepted = rows.filter((r) => r.status === "accepted").length;
    const rate = totalDecided ? Math.round((accepted / totalDecided) * 100) : null;
    return { sentValue: valueByStatus("sent"), acceptedValue: valueByStatus("accepted"), open, conversionRate: rate };
  }, [rows]);

  const columns: Column<QuoteRow>[] = [
    {
      key: "job",
      header: "Job",
      sortable: true,
      sortAccessor: (r) => r.jobTitle?.toLowerCase() ?? "",
      render: (r) => (
        <div>
          <div className="font-medium text-oliver-teal">{r.jobTitle || "(untitled)"}</div>
          {r.customerName && <div className="text-xs text-slate-500 mt-0.5">{r.customerName}</div>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (r) => Number(r.amount),
      render: (r) => <span className="font-medium tabular-nums">{fmtMoney(r.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      sortAccessor: (r) => r.status,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "validUntil",
      header: "Valid until",
      sortable: true,
      sortAccessor: (r) => r.validUntil ?? "",
      render: (r) => <span className="text-sm text-slate-600">{fmtDate(r.validUntil)}</span>,
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      sortAccessor: (r) => r.createdAt,
      render: (r) => <span className="text-sm text-slate-500">{fmtDate(r.createdAt)}</span>,
    },
  ];

  return (
    <OliverPageWrapper title="Quotes" subtitle="Quote management" error={error} loading={loading}>
      <PageHeader
        title="Quotes"
        subtitle="Send estimates, track acceptance, and convert into jobs"
        actions={!showCreate && <Button variant="primary" onClick={() => setShowCreate(true)}>+ Create quote</Button>}
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Open</div>
          <div className="stat-val">{fmtMoney(kpis.sentValue)}</div>
          <div className="stat-delta neu">{kpis.open} sent</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Accepted</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(kpis.acceptedValue)}</div>
          <div className="stat-delta neu">{counts["accepted"] ?? 0} accepted</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Conversion rate</div>
          <div className="stat-val">{kpis.conversionRate != null ? `${kpis.conversionRate}%` : "—"}</div>
          <div className="stat-delta neu">accepted ÷ decided</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Drafts</div>
          <div className="stat-val">{counts["draft"] ?? 0}</div>
          <div className="stat-delta neu">awaiting send</div>
        </div>
      </div>

      {showCreate && (
        <QuoteCreateForm
          onCreated={() => { setShowCreate(false); reload(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!rows.length && !showCreate ? (
        <EmptyState
          title="No quotes yet"
          description="Create your first quote to send pricing to a customer. Accepted quotes auto-flow to invoices."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create quote</Button>}
        />
      ) : !rows.length && showCreate ? null : (
        <>
          <FilterBar
            pills={pills}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by job or customer…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            initialSort={{ key: "createdAt", direction: "desc" }}
            emptyMessage="No quotes match these filters."
          />
        </>
      )}

      {detailId && (
        <QuoteDetailDrawer
          quoteId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          api={{ get, post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function QuoteDetailDrawer({ quoteId, onClose, onChanged, api }: { quoteId: string; onClose: () => void; onChanged: () => void; api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> }; }) {
  const [q, setQ] = useState<QuoteDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setQ(await api.get<QuoteDetail>(`/quotes/${quoteId}`));
  }, [api, quoteId]);

  useEffect(() => { reload(); }, [reload]);

  if (!q) return <DetailDrawer open onClose={onClose} title="Loading…" width="lg"><div className="text-sm text-slate-500">Loading quote…</div></DetailDrawer>;

  async function send() {
    setBusy("send"); setErr(null);
    try { await api.post(`/quotes/${q!.quote_id}/send`); await reload(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }
  async function convert() {
    setBusy("convert"); setErr(null);
    try { await api.post(`/quotes/${q!.quote_id}/convert-to-invoice`); await reload(); onChanged(); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <DetailDrawer
      open onClose={onClose}
      title={`Quote · ${fmtMoney(q.total)}`}
      subtitle={`${fmtDate(q.created_at)} · ${q.line_items?.length ?? 0} line item${q.line_items?.length === 1 ? "" : "s"}`}
      width="xl"
      footer={
        <>
          {q.status === "draft" && <Button variant="primary" loading={busy === "send"} onClick={send}>Send to customer</Button>}
          {q.status === "accepted" && <Button variant="secondary" loading={busy === "convert"} onClick={convert}>Convert to invoice</Button>}
        </>
      }
    >
      {err && <div className="mb-4 rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-2 text-sm text-red-800">{err}</div>}
      <div className="flex items-center gap-2 mb-5">
        <StatusBadge status={q.status} size="md" />
        {q.sent_at && <span className="text-sm text-slate-500">Sent {fmtDate(q.sent_at)}</span>}
        {q.accepted_at && <span className="text-sm text-emerald-700">Accepted {fmtDate(q.accepted_at)}</span>}
        {q.valid_until && <span className="text-sm text-slate-500">Valid until {fmtDate(q.valid_until)}</span>}
      </div>

      <div className="rounded-xl bg-slate-50 ring-1 ring-gray-200 p-4 mb-5 text-sm">
        <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="tabular-nums">{fmtMoney(q.subtotal)}</span></div>
        {Number(q.tax_amount) > 0 && <div className="flex justify-between"><span className="text-slate-500">Tax</span><span className="tabular-nums">{fmtMoney(q.tax_amount)}</span></div>}
        <div className="flex justify-between mt-1 pt-1 border-t border-gray-200"><span className="font-semibold text-slate-700">Total</span><span className="tabular-nums font-semibold text-oliver-teal">{fmtMoney(q.total)}</span></div>
      </div>

      <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal mb-2">Line items</h3>
      <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100 mb-4">
        {(q.line_items ?? []).map((li) => (
          <div key={li.line_item_id} className="px-3 py-2 grid grid-cols-12 gap-2 items-center">
            <div className="col-span-7 text-sm text-slate-800">{li.description}</div>
            <div className="col-span-1 text-right text-xs text-slate-500 tabular-nums">{li.quantity}</div>
            <div className="col-span-2 text-right text-sm tabular-nums">{fmtMoney(li.unit_price)}</div>
            <div className="col-span-2 text-right text-sm font-medium tabular-nums">{fmtMoney(li.line_total)}</div>
          </div>
        ))}
      </div>

      {q.notes && (
        <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 p-3 text-sm text-amber-900">
          <div className="font-medium uppercase text-xs tracking-wide mb-1">Notes</div>
          {q.notes}
        </div>
      )}
    </DetailDrawer>
  );
}

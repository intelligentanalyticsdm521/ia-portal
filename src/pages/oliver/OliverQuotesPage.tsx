import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";
import { QuoteCreateForm } from "./QuoteCreateForm";
import {
  ApproveMilestoneModal,
  type MilestoneShape,
} from "../../components/oliver/ApproveMilestoneModal";

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
  const { get, post, patch, del, ready } = useOliverApi();
  const [rows, setRows] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [initialJobId, setInitialJobId] = useState<string | undefined>();
  const [initialContactId, setInitialContactId] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();

  // Open the creator pre-seeded by deep-links:
  //   ?from_job=<id>      → from Service Requests detail drawer
  //   ?for_customer=<id>  → from Customers detail drawer
  useEffect(() => {
    const fromJob = searchParams.get("from_job");
    const forCustomer = searchParams.get("for_customer");
    if (fromJob || forCustomer) {
      if (fromJob) setInitialJobId(fromJob);
      if (forCustomer) setInitialContactId(forCustomer);
      setShowCreate(true);
      const next = new URLSearchParams(searchParams);
      next.delete("from_job");
      next.delete("for_customer");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);

  async function bulkSendDrafts() {
    const draftIds = rows.filter((r) => selected.has(r.id) && r.status === "draft").map((r) => r.id);
    if (!draftIds.length) return;
    if (!confirm(`Send ${draftIds.length} draft quote${draftIds.length === 1 ? "" : "s"} to customers?`)) return;
    setBulkBusy(true);
    setBulkResult(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(draftIds.map(async (id) => {
      try { await post(`/quotes/${id}/send`); ok++; }
      catch { failed++; }
    }));
    setBulkResult({ ok, failed });
    setSelected(new Set());
    setBulkBusy(false);
    await reload();
    setTimeout(() => setBulkResult(null), 6000);
  }

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<QuoteRow[]>("/quotes");
      setRows(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Duplicate action in the drawer hops to the new draft.
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ quoteId: string }>).detail?.quoteId;
      if (id) { reload(); setDetailId(id); }
    }
    window.addEventListener("oliver:open-quote", onOpen);
    return () => window.removeEventListener("oliver:open-quote", onOpen);
  }, [reload]);

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

  // Quotes in 'sent' that expire within 3 days — call out before they go stale
  const expiringSoon = useMemo(() => {
    const cutoff = Date.now() + 3 * 86400000;
    return rows.filter((r) =>
      r.status === "sent" && r.validUntil &&
      new Date(r.validUntil).getTime() <= cutoff &&
      new Date(r.validUntil).getTime() >= Date.now()
    ).length;
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
      render: (r) => {
        if (!r.validUntil) return <span className="text-sm text-slate-600">—</span>;
        const ms = new Date(r.validUntil).getTime() - Date.now();
        const days = Math.floor(ms / 86400000);
        const expired = ms < 0;
        const expiring = !expired && days <= 3 && r.status === "sent";
        return (
          <div>
            <div className={`text-sm ${expired ? "text-red-600 font-semibold" : expiring ? "text-amber-600 font-semibold" : "text-slate-600"}`}>
              {fmtDate(r.validUntil)}
            </div>
            {expiring && !expired && (
              <div className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mt-0.5">
                {days === 0 ? "Expires today" : `${days}d left`}
              </div>
            )}
            {expired && r.status === "sent" && (
              <div className="text-[10px] font-semibold text-red-600 uppercase tracking-wide mt-0.5">
                Expired
              </div>
            )}
          </div>
        );
      },
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
          <div className="stat-lbl">Open value</div>
          <div className="stat-val">{fmtMoney(kpis.sentValue)}</div>
          <div className="stat-delta neu">{kpis.open} sent · pending decision</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Accepted value</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(kpis.acceptedValue)}</div>
          <div className="stat-delta neu">{counts["accepted"] ?? 0} accepted</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Conversion rate</div>
          <div className="stat-val" style={{
            color: kpis.conversionRate != null
              ? kpis.conversionRate >= 60 ? "#059669"
                : kpis.conversionRate >= 30 ? undefined
                : "#D97706"
              : undefined,
          }}>{kpis.conversionRate != null ? `${kpis.conversionRate}%` : "—"}</div>
          <div className="stat-delta neu">accepted ÷ decided</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Expiring soon</div>
          <div className="stat-val" style={{ color: expiringSoon > 0 ? "#D97706" : undefined }}>{expiringSoon}</div>
          <div className="stat-delta neu">sent · within 3 days</div>
        </div>
      </div>

      {/* Funnel — visual hierarchy of where quotes are stuck */}
      {rows.length > 0 && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Quote funnel</div>
              <div className="card-sub">Where your quotes are in their lifecycle</div>
            </div>
          </div>
          {(() => {
            const stages = [
              { key: "draft", label: "Drafted", color: "#94A3B8", value: counts["draft"] ?? 0 },
              { key: "sent",  label: "Sent",    color: "#1A7DB5", value: counts["sent"] ?? 0 },
              { key: "accepted", label: "Accepted", color: "#059669", value: counts["accepted"] ?? 0 },
              { key: "rejected", label: "Declined", color: "#9333EA", value: (counts["rejected"] ?? 0) + (counts["expired"] ?? 0) },
            ];
            const max = Math.max(...stages.map((s) => s.value), 1);
            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 6 }}>
                {stages.map((s, i) => {
                  const conversion = i > 0 && stages[i - 1].value > 0
                    ? Math.round((s.value / stages[i - 1].value) * 100)
                    : null;
                  return (
                    <div key={s.key} onClick={() => setFilter(s.key === "rejected" ? "rejected" : s.key)}
                      style={{ cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
                          {s.label}
                        </span>
                        {conversion != null && i === 2 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                            background: conversion >= 60 ? "#D1FAE5" : conversion >= 30 ? "#FEF3C7" : "#FEE2E2",
                            color: conversion >= 60 ? "#047857" : conversion >= 30 ? "#92400E" : "#991B1B",
                          }}>{conversion}%</span>
                        )}
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>
                        {s.value}
                      </div>
                      <div style={{ marginTop: 4, height: 6, background: "#F1F5F9", borderRadius: 99 }}>
                        <div style={{
                          width: `${(s.value / max) * 100}%`, height: "100%",
                          background: s.color, borderRadius: 99,
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {showCreate && (
        <QuoteCreateForm
          onCreated={() => { setShowCreate(false); setInitialJobId(undefined); setInitialContactId(undefined); reload(); }}
          onCancel={() => { setShowCreate(false); setInitialJobId(undefined); setInitialContactId(undefined); }}
          initialJobId={initialJobId}
          initialContactId={initialContactId}
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

          {bulkResult && (
            <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#065F46" }}>
                {bulkResult.ok} quote{bulkResult.ok === 1 ? "" : "s"} sent{bulkResult.failed > 0 ? ` · ${bulkResult.failed} failed` : ""}.
              </div>
            </div>
          )}

          {selected.size > 0 && (() => {
            const draftCount = rows.filter((r) => selected.has(r.id) && r.status === "draft").length;
            return (
              <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)", marginBottom: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "#0C4A60" }}>
                    <strong>{selected.size}</strong> selected · {draftCount} draft{draftCount === 1 ? "" : "s"} can be sent
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Button variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
                    <Button variant="primary" onClick={bulkSendDrafts} disabled={bulkBusy || draftCount === 0}>
                      {bulkBusy ? "Sending…" : `Send ${draftCount} draft${draftCount === 1 ? "" : "s"}`}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })()}

          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            initialSort={{ key: "createdAt", direction: "desc" }}
            emptyMessage="No quotes match these filters."
            selectedIds={selected}
            onSelectionChange={setSelected}
            isRowSelectable={(r) => r.status === "draft" || r.status === "sent"}
          />
        </>
      )}

      {detailId && (
        <QuoteDetailDrawer
          quoteId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          api={{ get, post, patch, del }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// F2 — Payment Splits inside the QuoteDetailDrawer.
//
// Payment Splits is an OLIVER-product feature (not consulting-only) per
// SCOPE_WORKING.md F2. The drawer lets the founder pick a preset
// (50/50, 40/30/30, custom) which calls
//   POST /quotes/:id/payment-milestones { kind }
// on oliver-api. The server seeds milestone rows according to the preset
// and returns them. Each milestone row gets an [Approve + Charge] button
// that opens ApproveMilestoneModal.
//
// "Custom" opens an inline editor for { name, pct } rows; submitting POSTs
// the same endpoint with kind='custom' + the milestone payload.
// ──────────────────────────────────────────────────────────────────────────
type PaymentSplitKind = "" | "50_50" | "40_30_30" | "custom";

interface PaymentMilestoneRow {
  payment_milestone_id: string;
  parent_kind: "quote" | "proposal" | "project";
  parent_id: string;
  sort_order: number;
  name: string;
  payment_pct: number | null;
  payment_amount_cents: number | null;
  status: string;
  charge_id: string | null;
}

const SPLIT_OPTIONS: Array<{ key: PaymentSplitKind; label: string }> = [
  { key: "",         label: "None" },
  { key: "50_50",    label: "50 / 50" },
  { key: "40_30_30", label: "40 / 30 / 30" },
  { key: "custom",   label: "Custom" },
];

function statusBadgeStyle(status: string): React.CSSProperties {
  const map: Record<string, { bg: string; color: string }> = {
    "n/a":             { bg: "#F1F5F9", color: "#5A7A8A" },
    ready:             { bg: "#E0E7FF", color: "#4338CA" },
    requires_action:   { bg: "#FEF3C7", color: "#92400E" },
    processing:        { bg: "#DBEAFE", color: "#1E40AF" },
    succeeded:         { bg: "#D1FAE5", color: "#047857" },
    partial_refund:    { bg: "#FEF3C7", color: "#92400E" },
    full_refund:       { bg: "#FEE2E2", color: "#991B1B" },
    disputed:          { bg: "#FEE2E2", color: "#991B1B" },
    failed:            { bg: "#FEE2E2", color: "#991B1B" },
    canceled:          { bg: "#F1F5F9", color: "#94A3B8" },
  };
  const pill = map[status] ?? map["n/a"];
  return {
    display: "inline-block", padding: "2px 8px", borderRadius: 99,
    background: pill.bg, color: pill.color,
    fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4,
  };
}

function QuoteDetailDrawer({ quoteId, onClose, onChanged, api }: { quoteId: string; onClose: () => void; onChanged: () => void; api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T>; del: <T>(p: string) => Promise<T> }; }) {
  const [q, setQ] = useState<QuoteDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Array<{ description: string; quantity: number; unit_price: number }>>([]);
  const [editValidUntil, setEditValidUntil] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");

  // ── Payment Splits (F2) ────────────────────────────────────────────────
  const [splitKind, setSplitKind] = useState<PaymentSplitKind>("");
  const [milestones, setMilestones] = useState<PaymentMilestoneRow[]>([]);
  const [splitsBusy, setSplitsBusy] = useState(false);
  const [splitsErr, setSplitsErr] = useState<string | null>(null);
  // Custom editor — only used when splitKind = 'custom'.
  const [customRows, setCustomRows] = useState<Array<{ name: string; pct: number }>>([
    { name: "Deposit", pct: 50 },
    { name: "Final",   pct: 50 },
  ]);
  // The milestone currently being approved (drives the modal).
  const [approveTarget, setApproveTarget] = useState<MilestoneShape | null>(null);

  const reload = useCallback(async () => {
    setQ(await api.get<QuoteDetail>(`/quotes/${quoteId}`));
  }, [api, quoteId]);

  // Pull existing payment milestones for this quote. Returns [] when none
  // are configured yet (server returns 200 + empty array). 404 / errors
  // surface to splitsErr so the UI can show "Couldn't load milestones".
  const reloadMilestones = useCallback(async () => {
    try {
      const list = await api.get<PaymentMilestoneRow[]>(`/quotes/${quoteId}/payment-milestones`);
      setMilestones(Array.isArray(list) ? list : []);
      // Infer the kind from the existing rows so the dropdown reflects
      // saved state on re-open. 2 rows ≈ 50/50, 3 rows ≈ 40/30/30,
      // anything else = custom.
      if (Array.isArray(list) && list.length > 0) {
        if (list.length === 2) setSplitKind("50_50");
        else if (list.length === 3) setSplitKind("40_30_30");
        else setSplitKind("custom");
      } else {
        setSplitKind("");
      }
      setSplitsErr(null);
    } catch (e) {
      setMilestones([]);
      // Don't blow up the whole drawer for this — the section just sits empty.
      setSplitsErr((e as Error).message);
    }
  }, [api, quoteId]);

  useEffect(() => { reload(); reloadMilestones(); }, [reload, reloadMilestones]);

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
  async function duplicate() {
    setBusy("duplicate"); setErr(null);
    try {
      const dup = await api.post<{ quote_id: string }>(`/quotes/${q!.quote_id}/duplicate`);
      onChanged();
      onClose();
      window.dispatchEvent(new CustomEvent("oliver:open-quote", { detail: { quoteId: dup.quote_id } }));
    } catch (e) { setErr(`Duplicate failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }
  async function deleteQuote() {
    if (!q) return;
    // Soft delete — row stays in DB with deleted_at set. Restore endpoint
    // exists if needed. Confirm in plain JS — IadmConfirmModal can replace
    // this in a follow-up styling pass.
    if (!window.confirm(`Delete this quote (${fmtMoney(q.total)})?\n\nIt will be hidden from your quote list. This can be restored later if needed.`)) return;
    setBusy("delete"); setErr(null);
    try {
      await api.del(`/quotes/${q.quote_id}`);
      onChanged();
      onClose();
    } catch (e) {
      setErr(`Delete failed: ${(e as Error).message}`);
      setBusy(null);
    }
  }
  function startEdit() {
    if (!q) return;
    setEditItems((q.line_items ?? []).map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unit_price: Number(li.unit_price),
    })));
    setEditValidUntil(q.valid_until ? new Date(q.valid_until).toISOString().slice(0, 10) : "");
    setEditNotes(q.notes ?? "");
    setEditing(true);
    setErr(null);
  }
  async function saveEdit() {
    setBusy("save"); setErr(null);
    try {
      const cleaned = editItems.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
      if (!cleaned.length) { setErr("Add at least one line item."); setBusy(null); return; }
      await api.patch(`/quotes/${q!.quote_id}`, {
        line_items: cleaned,
        valid_until: editValidUntil || null,
        notes: editNotes.trim() || null,
      });
      setEditing(false);
      await reload();
      onChanged();
    } catch (e) {
      setErr(`Save failed: ${(e as Error).message}`);
    } finally { setBusy(null); }
  }
  function updateEditItem(idx: number, patch: Partial<{ description: string; quantity: number; unit_price: number }>) {
    setEditItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeEditItem(idx: number) { setEditItems((prev) => prev.filter((_, i) => i !== idx)); }
  function addEditLine() { setEditItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0 }]); }

  // ── Payment Splits handlers ────────────────────────────────────────────
  async function applySplitKind(kind: PaymentSplitKind) {
    if (!q) return;
    if (kind === splitKind) return;
    if (kind === "" || kind === "custom") {
      // 'None' clears UI selection but doesn't auto-delete server-side
      // milestones — leave them alone for the founder to remove explicitly
      // (avoids accidental destructive UI). 'custom' opens the inline
      // editor; nothing is POSTed until they hit Save.
      setSplitKind(kind);
      return;
    }
    setSplitsBusy(true);
    setSplitsErr(null);
    try {
      // Preset path — server seeds the milestone rows from the kind and
      // returns the list. Idempotent: re-POSTing the same kind no-ops at
      // the server (per F2 backend contract).
      const rows = await api.post<PaymentMilestoneRow[]>(
        `/quotes/${q.quote_id}/payment-milestones`,
        { kind },
      );
      setMilestones(Array.isArray(rows) ? rows : []);
      setSplitKind(kind);
    } catch (e) {
      setSplitsErr((e as Error).message);
    } finally {
      setSplitsBusy(false);
    }
  }

  async function saveCustomSplit() {
    if (!q) return;
    const cleaned = customRows
      .filter((r) => r.name.trim() && Number(r.pct) > 0)
      .map((r) => ({ name: r.name.trim(), pct: Number(r.pct) }));
    if (!cleaned.length) {
      setSplitsErr("Add at least one milestone");
      return;
    }
    const total = cleaned.reduce((s, r) => s + r.pct, 0);
    if (Math.round(total * 100) / 100 !== 100) {
      setSplitsErr(`Custom splits must sum to 100% (got ${total}%)`);
      return;
    }
    setSplitsBusy(true);
    setSplitsErr(null);
    try {
      const rows = await api.post<PaymentMilestoneRow[]>(
        `/quotes/${q.quote_id}/payment-milestones`,
        { kind: "custom", milestones: cleaned },
      );
      setMilestones(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setSplitsErr((e as Error).message);
    } finally {
      setSplitsBusy(false);
    }
  }

  function updateCustomRow(i: number, patch: Partial<{ name: string; pct: number }>) {
    setCustomRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }
  function addCustomRow() { setCustomRows((prev) => [...prev, { name: "", pct: 0 }]); }
  function removeCustomRow(i: number) { setCustomRows((prev) => prev.filter((_, idx) => idx !== i)); }

  return (
    <DetailDrawer
      open onClose={onClose}
      title={`Quote · ${fmtMoney(q.total)}`}
      subtitle={`${fmtDate(q.created_at)} · ${q.line_items?.length ?? 0} line item${q.line_items?.length === 1 ? "" : "s"}`}
      width="xl"
      footer={
        <>
          <Button variant="ghost" loading={busy === "delete"} onClick={deleteQuote} className="text-red-600 hover:bg-red-50">Delete</Button>
          <div className="flex-1" />
          <Button variant="ghost" loading={busy === "duplicate"} onClick={duplicate}>Duplicate</Button>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal" style={{ margin: 0 }}>Line items</h3>
        {q.status === "draft" && !editing && <Button variant="secondary" onClick={startEdit}>Edit</Button>}
        {editing && <Button variant="secondary" onClick={addEditLine}>+ Line</Button>}
      </div>

      {!editing ? (
        <>
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
        </>
      ) : (
        <>
          <div style={{ border: "1px solid #eef2f4", borderRadius: 6, marginBottom: 12 }}>
            {editItems.map((it, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 80px 110px 110px 32px", gap: 8,
                padding: "8px 10px", alignItems: "center",
                borderBottom: i < editItems.length - 1 ? "1px solid #f0f4f6" : "none",
              }}>
                <input
                  type="text" placeholder="Description"
                  value={it.description} onChange={(e) => updateEditItem(i, { description: e.target.value })}
                  style={qEditInputStyle}
                />
                <input
                  type="number" step="0.001" min="0" placeholder="Qty"
                  value={it.quantity} onChange={(e) => updateEditItem(i, { quantity: Number(e.target.value) })}
                  style={{ ...qEditInputStyle, textAlign: "right" }}
                />
                <input
                  type="number" step="0.01" min="0" placeholder="Unit $"
                  value={it.unit_price} onChange={(e) => updateEditItem(i, { unit_price: Number(e.target.value) })}
                  style={{ ...qEditInputStyle, textAlign: "right" }}
                />
                <span style={{ textAlign: "right", fontSize: 12, fontFamily: "monospace", color: "#0B1C24" }}>
                  {fmtMoney(it.quantity * it.unit_price)}
                </span>
                <button onClick={() => removeEditItem(i)} title="Remove"
                  style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Valid until</span>
              <input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} style={qEditInputStyle} />
            </label>
            <label style={{ display: "block" }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Notes</span>
              <textarea rows={2} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} style={{ ...qEditInputStyle, fontFamily: "inherit", resize: "vertical" }} />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveEdit} disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      )}

      {/* ── F2 Payment Splits ─────────────────────────────────────────── */}
      <div style={{ marginTop: 20, borderTop: "1px solid #E2E8F0", paddingTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-oliver-teal" style={{ margin: 0 }}>
            Payment splits
          </h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A" }}>Payment terms</label>
            <select
              value={splitKind}
              onChange={(e) => applySplitKind(e.target.value as PaymentSplitKind)}
              disabled={splitsBusy}
              style={{ ...qEditInputStyle, width: "auto", padding: "4px 8px" }}
            >
              {SPLIT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {splitsErr && (
          <div style={{ marginBottom: 8, padding: 8, fontSize: 11, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 4 }}>
            {splitsErr}
          </div>
        )}

        {/* Custom editor — only shown while picking custom AND no rows
            from the server yet (or the founder wants to redo them). */}
        {splitKind === "custom" && milestones.length === 0 && (
          <div style={{ marginBottom: 12, padding: 10, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 6 }}>
              Custom milestones — must sum to 100%
            </div>
            {customRows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input
                  type="text" placeholder="Name (e.g. Deposit)"
                  value={r.name}
                  onChange={(e) => updateCustomRow(i, { name: e.target.value })}
                  style={qEditInputStyle}
                />
                <input
                  type="number" step="1" min="0" max="100"
                  placeholder="%"
                  value={r.pct}
                  onChange={(e) => updateCustomRow(i, { pct: Number(e.target.value) })}
                  style={{ ...qEditInputStyle, textAlign: "right" }}
                />
                <button
                  onClick={() => removeCustomRow(i)}
                  title="Remove"
                  style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 16 }}
                >×</button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <button
                onClick={addCustomRow}
                style={{ fontSize: 11, fontWeight: 600, color: "#1A7DB5", background: "transparent", border: 0, cursor: "pointer" }}
              >+ Add milestone</button>
              <Button variant="primary" onClick={saveCustomSplit} disabled={splitsBusy}>
                {splitsBusy ? "Saving…" : "Save milestones"}
              </Button>
            </div>
          </div>
        )}

        {/* Milestone rows — server state. */}
        {milestones.length > 0 && (
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 6 }}>
            {milestones.map((m, i) => {
              const isLast = i === milestones.length - 1;
              const amount = m.payment_amount_cents != null
                ? Number(m.payment_amount_cents)
                : m.payment_pct != null
                  ? Math.round((Number(m.payment_pct) / 100) * Math.round(Number(q.total) * 100))
                  : 0;
              const pctLabel = m.payment_pct != null ? `${m.payment_pct}%` : "—";
              const canApprove = m.status === "n/a" || m.status === "ready" || m.status === "failed";
              return (
                <div key={m.payment_milestone_id} style={{
                  display: "grid", gridTemplateColumns: "32px 1fr 80px 110px 130px 160px",
                  gap: 8, padding: "10px 12px", alignItems: "center",
                  borderBottom: !isLast ? "1px solid #F1F5F9" : "none",
                }}>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "#94A3B8" }}>{m.sort_order}</span>
                  <div style={{ fontSize: 13, color: "#0B1C24", fontWeight: 500 }}>{m.name}</div>
                  <span style={{ fontSize: 12, fontFamily: "monospace", textAlign: "right", color: "#5A7A8A" }}>{pctLabel}</span>
                  <span style={{ fontSize: 13, fontFamily: "monospace", textAlign: "right", color: "#0B1C24", fontWeight: 600 }}>
                    {fmtMoney(amount / 100)}
                  </span>
                  <span style={statusBadgeStyle(m.status)}>{m.status.replace(/_/g, " ")}</span>
                  <div style={{ textAlign: "right" }}>
                    {canApprove ? (
                      <Button variant="primary" onClick={() => setApproveTarget({
                        payment_milestone_id: m.payment_milestone_id,
                        name: m.name,
                        payment_pct: m.payment_pct,
                        payment_amount_cents: m.payment_amount_cents,
                        status: m.status,
                      })}>Approve + Charge</Button>
                    ) : (
                      <span style={{ fontSize: 10, color: "#94A3B8" }}>
                        {m.status === "succeeded" ? "Paid" : "—"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {splitKind === "" && milestones.length === 0 && (
          <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>
            No payment splits configured. Pick a preset above to charge in steps.
          </div>
        )}
      </div>

      {approveTarget && q && (
        <ApproveMilestoneModal
          open
          milestone={approveTarget}
          parentKind="quote"
          parentId={q.quote_id}
          // parentTotal in cents — server stores DECIMAL(18,2); we round-trip
          // through Math.round to dodge float drift.
          parentTotal={Math.round(Number(q.total) * 100)}
          onConfirm={async () => {
            setApproveTarget(null);
            await reloadMilestones();
            onChanged();
          }}
          onCancel={() => setApproveTarget(null)}
        />
      )}
    </DetailDrawer>
  );
}

const qEditInputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.18)", borderRadius: 4,
  background: "#fff",
};

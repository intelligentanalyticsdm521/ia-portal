import { useCallback, useEffect, useMemo, useState } from "react";
import { IadmModal } from "../../components/IadmModal";
import { DocumentBrandFrame } from "../../components/oliver/DocumentBrandFrame";
import { useSearchParams } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";
import { useMsal } from "@azure/msal-react";
import { useActiveAccount } from "../../auth/useAccessToken";
import { oliverFetchRaw, oliverDownload } from "../../lib/oliverApi";
import { InvoiceCreateForm } from "./InvoiceCreateForm";
import { ReadyToInvoicePanel } from "./ReadyToInvoicePanel";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation, rowLocationId, rowLocationName, locationNameOf } from "../../lib/oliverLocations";

// ── Types ────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  id: string;
  invoiceNumber: string;
  jobTitle: string;
  customerName?: string;
  amount: number;
  status: string;
  issuedAt: string;
  dueDate?: string | null;
  stripePaymentLink?: string | null;
}

interface InvoiceLineItem {
  line_item_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_tax: boolean;
  sort_order: number;
}

/**
 * A BILL TO block and a SERVICE LOCATION block, exactly as
 * `GET /invoices/:id` returns them (CUSTOMER_MODEL_MULTISITE §9.6).
 *
 * The owner's screen shows what the customer's copy shows. Until now it showed
 * neither, so "who is this invoice addressed to?" could only be answered by
 * opening the PDF.
 */
interface AddressBlock {
  name?: string | null;
  company?: string | null;
  email?: string | null;
  address?: {
    address_line_1?: string | null; address_line_2?: string | null;
    city?: string | null; state?: string | null; postal_code?: string | null;
  } | null;
  payment_terms_days?: number | null;
  po_number?: string | null;
  tax_exempt?: boolean;
  source?: string | null;
}

/** One site's lines on a multi-site invoice, with its own subtotal and tax. */
interface InvoiceLineGroup {
  location_id: string | null;
  name: string | null;
  address: AddressBlock["address"];
  po_number: string | null;
  lines: InvoiceLineItem[];
  subtotal: number;
  tax_rate: number | null;
  tax_amount: number;
  total: number;
}

interface InvoiceDetail {
  invoice_id: string;
  tenant_id: string;
  invoice_number: string;
  job_id: string;
  contact_id: string;
  status: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  total_refunded?: number;
  balance_due: number;
  due_date?: string | null;
  stripe_payment_url?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  created_at: string;
  updated_at: string;
  line_items?: InvoiceLineItem[];
  bill_to?: AddressBlock | null;
  service_location?: (AddressBlock & { location_id?: string | null }) | null;
  line_groups?: InvoiceLineGroup[];
  line_group_totals?: { subtotal: number; tax_amount: number; total: number } | null;
}

/** One address, on one line. Used by both blocks so they cannot read differently. */
function addressLine(a: AddressBlock["address"]): string {
  if (!a) return "";
  return [a.address_line_1, a.address_line_2, [a.city, a.state].filter(Boolean).join(", "), a.postal_code]
    .filter((x) => String(x ?? "").trim())
    .join(", ");
}

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "paid", label: "Paid" },
  { key: "refunded", label: "Refunded" },
  { key: "void", label: "Void" },
];

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function OliverInvoicesPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('oliver').payload;

  const { get, post, patch, ready } = useOliverApi();
  const loc = useOliverLocations();
  const { instance } = useMsal();
  // useActiveAccount, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there
  // is no MSAL session, so accounts[0] is undefined and every `if (!account)`
  // guard below it turns the control into a button that does nothing.
  const activeAccount = useActiveAccount();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"send" | "mark-paid" | null>(null);
  const [bulkResult, setBulkResult] = useState<{ kind: "send" | "mark-paid"; ok: number; failed: number } | null>(null);

  async function bulkSendDrafts() {
    const draftIds = rows.filter((r) => selected.has(r.id) && r.status === "draft").map((r) => r.id);
    if (!draftIds.length) return;
    if (!confirm(`Send ${draftIds.length} draft invoice${draftIds.length === 1 ? "" : "s"} to customers?`)) return;
    setBulkBusy("send");
    setBulkResult(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(draftIds.map(async (id) => {
      try { await post(`/invoices/${id}/send`); ok++; }
      catch { failed++; }
    }));
    setBulkResult({ kind: "send", ok, failed });
    setSelected(new Set());
    setBulkBusy(null);
    await reload();
    setTimeout(() => setBulkResult(null), 6000);
  }

  async function bulkMarkPaid() {
    const sentRows = rows.filter((r) => selected.has(r.id) && r.status === "sent");
    if (!sentRows.length) return;
    const method = prompt(
      `Mark ${sentRows.length} sent invoice${sentRows.length === 1 ? "" : "s"} as paid.\nPayment method (cash, check, ACH, other):`,
      "cash"
    );
    if (!method) return;
    setBulkBusy("mark-paid");
    setBulkResult(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(sentRows.map(async (r) => {
      try {
        // Mark each invoice paid for its full balance. Backend defaults to balance_due
        // when amount is omitted, so we pass nothing and let it figure out the amount.
        await post(`/invoices/${r.id}/mark-paid`, { amount: Number(r.amount), method });
        ok++;
      } catch { failed++; }
    }));
    setBulkResult({ kind: "mark-paid", ok, failed });
    setSelected(new Set());
    setBulkBusy(null);
    await reload();
    setTimeout(() => setBulkResult(null), 6000);
  }

  async function exportCsv() {
    const account = activeAccount;
    if (!account) return;
    setExporting(true);
    try {
      const qs = filter ? `?status=${encodeURIComponent(filter)}` : "";
      await oliverDownload(instance, account, withLocation(`/exports/invoices.csv${qs}`, loc.selectedLocationId), `invoices-${new Date().toISOString().slice(0, 10)}.csv`);
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
      const data = await get<InvoiceRow[]>(withLocation("/invoices", loc.selectedLocationId));
      setRows(data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, loc.selectedLocationId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // When a Duplicate action fires from inside a drawer, jump to the new invoice.
  useEffect(() => {
    function onOpen(e: Event) {
      const id = (e as CustomEvent<{ invoiceId: string }>).detail?.invoiceId;
      if (id) { reload(); setDetailId(id); }
    }
    window.addEventListener("oliver:open-invoice", onOpen);
    return () => window.removeEventListener("oliver:open-invoice", onOpen);
  }, [reload]);

  // Deep-link: ?from_job=<id> or ?for_customer=<id> opens the creator pre-seeded.
  const [initialJobId, setInitialJobId] = useState<string | undefined>();
  const [initialContactId, setInitialContactId] = useState<string | undefined>();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // ── The month-end screen lives in the URL ─────────────────────────────
  // `?view=ready` rather than component state, so the browser's Back button
  // and the left-nav link both return to the list, and a link to the screen is
  // a link somebody can send — convention_back_button_top_left.
  const view = searchParams.get("view");
  const showReady = view === "ready";
  const openReady = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.set("view", "ready");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const closeReady = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);
  const [batchNote, setBatchNote] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter) list = list.filter((r) => r.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((r) =>
        r.invoiceNumber.toLowerCase().includes(q) ||
        r.jobTitle?.toLowerCase().includes(q) ||
        r.customerName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  const pills = FILTER_PILLS.map((p) => ({ ...p, count: counts[p.key] ?? 0 }));

  // KPI summary
  const kpis = useMemo(() => {
    const sum = (pred: (r: InvoiceRow) => boolean) => rows.filter(pred).reduce((s, r) => s + Number(r.amount || 0), 0);
    const today = new Date();
    const isOverdue = (r: InvoiceRow): boolean => !!(r.status === "sent" && r.dueDate && new Date(r.dueDate) < today);
    return {
      paid: sum((r) => r.status === "paid"),
      outstanding: sum((r) => r.status === "sent"),
      overdue: sum(isOverdue),
      overdueCount: rows.filter(isOverdue).length,
    };
  }, [rows]);

  const columns: Column<InvoiceRow>[] = [
    {
      key: "invoiceNumber",
      header: "Invoice #",
      sortable: true,
      sortAccessor: (r) => r.invoiceNumber,
      render: (r) => <span className="font-medium text-oliver-teal">{r.invoiceNumber}</span>,
    },
    {
      key: "customer",
      header: "Customer",
      sortable: true,
      sortAccessor: (r) => r.customerName?.toLowerCase() ?? "",
      render: (r) => r.customerName || <span className="text-slate-400">—</span>,
    },
    {
      key: "jobTitle",
      header: "Job",
      render: (r) => <span className="text-sm text-slate-600 line-clamp-1">{r.jobTitle || "—"}</span>,
    },
    ...(loc.multi ? [{
      key: "location", header: "Location",
      render: (r: InvoiceRow) => <span className="text-xs text-slate-600">{locationNameOf(rowLocationId(r), loc.locations, rowLocationName(r)) || "—"}</span>,
    } satisfies Column<InvoiceRow>] : []),
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
      render: (r) => {
        const overdue = r.status === "sent" && r.dueDate && new Date(r.dueDate) < new Date();
        return overdue ? <StatusBadge status="overdue" /> : <StatusBadge status={r.status} />;
      },
    },
    {
      key: "dueDate",
      header: "Due",
      sortable: true,
      sortAccessor: (r) => r.dueDate ?? "",
      render: (r) => <span className="text-sm text-slate-600">{fmtDate(r.dueDate)}</span>,
    },
    {
      key: "issuedAt",
      header: "Issued",
      sortable: true,
      sortAccessor: (r) => r.issuedAt,
      render: (r) => <span className="text-sm text-slate-500">{fmtDate(r.issuedAt)}</span>,
    },
  ];

  // The month-end screen is a VIEW of this page, not a page of its own: it is
  // reached from Invoices, it returns to Invoices, and what it creates lands in
  // this list. One route, one nav item, Back top-left.
  if (showReady) {
    return (
      <OliverPageWrapper title="Invoices" subtitle="Ready to invoice" error={null} loading={false}>
        <ReadyToInvoicePanel
          api={{ get, post }}
          onBack={closeReady}
          onCreated={(result) => {
            const made = result?.created?.length ?? 0;
            const failed = result?.failed?.length ?? 0;
            setBatchNote(
              `${made} invoice${made === 1 ? "" : "s"} created${failed ? ` · ${failed} failed` : ""}.`
              + (made ? ` ${result.created.map((c) => c.invoiceNumber).join(", ")}` : ""),
            );
            closeReady();
            void reload();
            // The first one OPENS, so the line groups are seen rather than
            // assumed — "Create invoices" that only changes a count is a button
            // nobody trusts.
            if (result?.created?.[0]?.invoiceId) setDetailId(result.created[0].invoiceId);
          }}
        />
      </OliverPageWrapper>
    );
  }

  return (
    <OliverPageWrapper title="Invoices" subtitle="Invoice management" error={error} loading={loading}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_overdue_invoices', label: 'Who to chase' },
        { id: 'oliver_invoice_aging', label: 'Receivables aging' },
      ]} />
      <PageHeader
        title="Invoices"
        subtitle="Send, track, and reconcile invoices through Stripe"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={openReady}
              title="Bill a month's finished work in one go — one invoice per customer, with a section for each of their sites"
            >
              Ready to invoice
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={exporting || !rows.length} title="Download this list as a CSV file">
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            {!showCreate && <Button variant="primary" data-tour="new-invoice" onClick={() => setShowCreate(true)} title="Raise a single invoice by hand">+ Create invoice</Button>}
          </>
        }
      />

      {batchNote && (
        <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#065F46" }}>{batchNote}</span>
            <button type="button" onClick={() => setBatchNote(null)} title="Dismiss this message"
              style={{ background: "transparent", border: 0, color: "#065F46", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        </div>
      )}

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Paid all-time</div>
          <div className="stat-val">{fmtMoney(kpis.paid)}</div>
          <div className="stat-delta neu">{counts["paid"] ?? 0} paid</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Outstanding</div>
          <div className="stat-val">{fmtMoney(kpis.outstanding)}</div>
          <div className="stat-delta neu">{counts["sent"] ?? 0} sent</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Overdue</div>
          <div className="stat-val" style={{ color: kpis.overdue > 0 ? "#D97706" : undefined }}>{fmtMoney(kpis.overdue)}</div>
          <div className="stat-delta neu">{kpis.overdueCount} past due</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Drafts</div>
          <div className="stat-val">{counts["draft"] ?? 0}</div>
          <div className="stat-delta neu">awaiting send</div>
        </div>
      </div>

      {showCreate && (
        /* Founder 2026-08-19: invoices get the same treatment as quotes — a
           pop-up modal ON the branded document (accent bar, logo, footer as
           the customer receives it), not a screen-switching inline card. */
        <IadmModal
          open
          onClose={() => { setShowCreate(false); setInitialJobId(undefined); setInitialContactId(undefined); }}
          product="oliver"
          eyebrow="OLIVER · BILLING"
          title="New invoice"
          subtitle="What you see here is what the customer receives."
          size="info"
        >
          <div style={{ padding: 20, background: "#EEF3F6" }}>
            <DocumentBrandFrame get={get} docLabel="INVOICE">
              <InvoiceCreateForm
                onCreated={() => { setShowCreate(false); setInitialJobId(undefined); setInitialContactId(undefined); reload(); }}
                onCancel={() => { setShowCreate(false); setInitialJobId(undefined); setInitialContactId(undefined); }}
                initialJobId={initialJobId}
                initialContactId={initialContactId}
              />
            </DocumentBrandFrame>
          </div>
        </IadmModal>
      )}

      {!rows.length && !showCreate ? (
        <EmptyState
          title="No invoices yet"
          description="Create your first invoice to start collecting payments. Each invoice generates a Stripe-hosted Pay Now link."
          action={<Button variant="primary" data-tour="new-invoice" onClick={() => setShowCreate(true)}>+ Create invoice</Button>}
        />
      ) : (
        <>
          <FilterBar
            pills={pills}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search invoice #, customer, job…"
          />

          {bulkResult && (
            <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#065F46" }}>
                {bulkResult.ok} invoice{bulkResult.ok === 1 ? "" : "s"} {bulkResult.kind === "send" ? "sent" : "marked paid"}
                {bulkResult.failed > 0 ? ` · ${bulkResult.failed} failed` : ""}.
              </div>
            </div>
          )}

          {selected.size > 0 && (() => {
            const sel = rows.filter((r) => selected.has(r.id));
            const draftCount = sel.filter((r) => r.status === "draft").length;
            const sentCount = sel.filter((r) => r.status === "sent").length;
            return (
              <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)", marginBottom: 8, padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "#0C4A60" }}>
                    <strong>{selected.size}</strong> selected
                    <span style={{ color: "#5A7A8A", marginLeft: 8 }}>
                      ({draftCount} draft{draftCount === 1 ? "" : "s"} · {sentCount} sent)
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Button variant="secondary" onClick={() => setSelected(new Set())} title="Untick every invoice">Clear</Button>
                    <Button variant="secondary" onClick={bulkMarkPaid} disabled={!!bulkBusy || sentCount === 0} title="Record a payment on every sent invoice you have ticked">
                      {bulkBusy === "mark-paid" ? "Marking…" : `Mark ${sentCount} as paid`}
                    </Button>
                    <Button variant="primary" onClick={bulkSendDrafts} disabled={!!bulkBusy || draftCount === 0} title="Email every draft invoice you have ticked">
                      {bulkBusy === "send" ? "Sending…" : `Send ${draftCount} draft${draftCount === 1 ? "" : "s"}`}
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
            initialSort={{ key: "issuedAt", direction: "desc" }}
            emptyMessage="No invoices match these filters."
            selectedIds={selected}
            onSelectionChange={setSelected}
            isRowSelectable={(r) => r.status === "draft" || r.status === "sent"}
          />
        </>
      )}

      {detailId && (
        <InvoiceDetailDrawer
          invoiceId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => { reload(); }}
          api={{ get, post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ── Detail Drawer ────────────────────────────────────────────────────────────

interface DrawerProps {
  invoiceId: string;
  onClose: () => void;
  onChanged: () => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
}

function InvoiceDetailDrawer({ invoiceId, onClose, onChanged, api }: DrawerProps) {
  const { instance } = useMsal();
  // useActiveAccount, NOT useMsal().accounts[0]: under VITE_DEV_AUTH=1 there
  // is no MSAL session, so accounts[0] is undefined and every `if (!account)`
  // guard below it turns the control into a button that does nothing.
  const activeAccount = useActiveAccount();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<Array<{ description: string; quantity: number; unit_price: number; is_tax: boolean }>>([]);
  const [editDueDate, setEditDueDate] = useState<string>("");

  async function downloadPdf() {
    const account = activeAccount;
    if (!account || !inv) return;
    try {
      const res = await oliverFetchRaw(instance, account, `/invoices/${inv.invoice_id}/pdf`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${inv.invoice_number}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErr(`PDF download failed: ${(e as Error).message}`);
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get<InvoiceDetail>(`/invoices/${invoiceId}`);
      setInv(d);
    } finally {
      setLoading(false);
    }
  }, [api, invoiceId]);

  useEffect(() => { reload(); }, [reload]);

  if (loading || !inv) {
    return (
      <DetailDrawer open onClose={onClose} title="Loading…" width="xl">
        <div className="text-sm text-slate-500">Loading invoice…</div>
      </DetailDrawer>
    );
  }

  async function send() {
    setBusy("send"); setErr(null);
    try {
      await api.post(`/invoices/${inv!.invoice_id}/send`);
      await reload();
      onChanged();
    } catch (e) {
      const m = (e as Error).message || "";
      if (m.includes("stripe_not_connected") || m.includes("412")) {
        setErr("Connect Stripe first (Settings → Payments) before sending invoices.");
      } else {
        setErr(`Send failed: ${m}`);
      }
    } finally { setBusy(null); }
  }

  async function voidInvoice() {
    if (!confirm("Void this invoice? This cannot be undone.")) return;
    setBusy("void"); setErr(null);
    try {
      await api.post(`/invoices/${inv!.invoice_id}/void`);
      await reload();
      onChanged();
    } catch (e) { setErr(`Void failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function fullRefund() {
    if (!confirm(`Issue a full refund of ${fmtMoney(inv!.amount_paid)}?`)) return;
    setBusy("refund"); setErr(null);
    try {
      await api.post(`/invoices/${inv!.invoice_id}/refund`);
      await reload();
      onChanged();
    } catch (e) { setErr(`Refund failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function markPaid() {
    const balance = Number(inv!.balance_due) || (Number(inv!.total) - Number(inv!.amount_paid || 0));
    const amountStr = prompt(`Record manual payment. Amount (default = balance ${fmtMoney(balance)}):`, balance.toFixed(2));
    if (amountStr == null) return;
    const amount = Number(amountStr);
    if (!(amount > 0)) { setErr("Invalid amount"); return; }
    const method = prompt("Payment method (cash, check, ACH, other):", "cash") || "cash";
    setBusy("markpaid"); setErr(null);
    try {
      await api.post(`/invoices/${inv!.invoice_id}/mark-paid`, { amount, method });
      await reload();
      onChanged();
    } catch (e) { setErr(`Mark paid failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function markUncollectible() {
    if (!confirm("Mark this invoice as uncollectible? It will be voided.")) return;
    setBusy("uncollectible"); setErr(null);
    try {
      await api.post(`/invoices/${inv!.invoice_id}/mark-uncollectible`);
      await reload();
      onChanged();
    } catch (e) { setErr(`Mark uncollectible failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function duplicate() {
    setBusy("duplicate"); setErr(null);
    try {
      const dup = await api.post<{ invoice_id: string }>(`/invoices/${inv!.invoice_id}/duplicate`);
      onChanged();
      // Hop the drawer to the new draft so the user can immediately edit + send.
      onClose();
      // The parent reload + opening logic doesn't expose a "switch invoice" API,
      // so emit a custom event the page listens for.
      window.dispatchEvent(new CustomEvent("oliver:open-invoice", { detail: { invoiceId: dup.invoice_id } }));
    } catch (e) { setErr(`Duplicate failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  function startEdit() {
    if (!inv) return;
    setEditItems((inv.line_items ?? []).map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unit_price: Number(li.unit_price),
      is_tax: !!li.is_tax,
    })));
    setEditDueDate(inv.due_date ? new Date(inv.due_date).toISOString().slice(0, 10) : "");
    setEditing(true);
    setErr(null);
  }

  async function saveEdit() {
    setBusy("save"); setErr(null);
    try {
      const cleaned = editItems.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
      if (!cleaned.length) { setErr("Add at least one line item."); setBusy(null); return; }
      await api.patch(`/invoices/${inv!.invoice_id}`, {
        line_items: cleaned,
        due_date: editDueDate || null,
      });
      setEditing(false);
      await reload();
      onChanged();
    } catch (e) {
      setErr(`Save failed: ${(e as Error).message}`);
    } finally { setBusy(null); }
  }

  function updateEditItem(idx: number, patch: Partial<{ description: string; quantity: number; unit_price: number; is_tax: boolean }>) {
    setEditItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeEditItem(idx: number) {
    setEditItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addEditLine() {
    setEditItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, is_tax: false }]);
  }
  function addEditTaxLine() {
    setEditItems((prev) => [...prev, { description: "Sales Tax", quantity: 1, unit_price: 0, is_tax: true }]);
  }

  const overdue = inv.status === "sent" && inv.due_date && new Date(inv.due_date) < new Date();
  const refundable = Number(inv.amount_paid || 0) - Number(inv.total_refunded || 0);

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={inv.invoice_number}
      subtitle={`Issued ${fmtDate(inv.created_at)} · Total ${fmtMoney(inv.total)}`}
      width="xl"
      headerActions={
        <button onClick={downloadPdf} className="text-sm text-oliver-teal hover:underline" title="Download this invoice as a PDF, exactly as the customer receives it">
          Download PDF
        </button>
      }
      footer={
        <>
          <Button variant="ghost" onClick={duplicate} loading={busy === "duplicate"} title="Copy this invoice into a new draft">Duplicate</Button>
          {inv.status === "draft" && <Button variant="ghost" onClick={voidInvoice} loading={busy === "void"} title="Cancel this invoice. It stays on the record but is no longer owed.">Void</Button>}
          {inv.status === "draft" && <Button variant="secondary" onClick={markPaid} loading={busy === "markpaid"} title="Record a payment you took outside the system">Mark as paid</Button>}
          {inv.status === "draft" && <Button variant="primary" onClick={send} loading={busy === "send"} title="Email this invoice to the bill-to contact with a pay link">Send invoice</Button>}
          {inv.status === "sent" && (
            <>
              <Button variant="ghost" onClick={markUncollectible} loading={busy === "uncollectible"} title="Write this off as money you will not collect">Mark uncollectible</Button>
              <Button variant="ghost" onClick={voidInvoice} loading={busy === "void"} title="Cancel this invoice. It stays on the record but is no longer owed.">Void</Button>
              <Button variant="primary" onClick={markPaid} loading={busy === "markpaid"}>Mark as paid</Button>
            </>
          )}
          {inv.status === "paid" && refundable > 0 && (
            <>
              <Button variant="ghost" onClick={() => setRefundOpen(true)} title="Refund part of what was paid">Partial refund…</Button>
              <Button variant="danger" onClick={fullRefund} loading={busy === "refund"} title="Refund everything that was paid on this invoice">Refund {fmtMoney(refundable)}</Button>
            </>
          )}
          {inv.stripe_payment_url && (
            <a href={inv.stripe_payment_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-lg ring-1 ring-gray-300 bg-white text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Open in Stripe ↗
            </a>
          )}
        </>
      }
    >
      {err && <div className="mb-4 rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-2 text-sm text-red-800">{err}</div>}

      <div className="flex items-center gap-2 mb-5">
        {overdue ? <StatusBadge status="overdue" size="md" /> : <StatusBadge status={inv.status} size="md" />}
        {inv.paid_at && <span className="text-sm text-slate-500">Paid {fmtDate(inv.paid_at)}</span>}
        {inv.sent_at && !inv.paid_at && <span className="text-sm text-slate-500">Sent {fmtDate(inv.sent_at)}</span>}
      </div>

      {/* ── BILL TO + SERVICE LOCATIONS ─────────────────────────────────
          §9.6: "GET /invoices/:id returns bill_to — print it as the BILL TO
          block". The owner's screen shows what the customer's copy shows; it
          used to show neither, so "who is this addressed to?" could only be
          answered by opening the PDF. */}
      {(inv.bill_to || inv.service_location || (inv.line_groups?.length ?? 0) > 0) && (
        <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {inv.bill_to && (
            <div className="rounded-xl ring-1 ring-gray-200 p-4" data-testid="bill-to-block">
              <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1">Bill to</div>
              <div className="text-sm font-semibold text-slate-900">
                {inv.bill_to.company || inv.bill_to.name || "—"}
              </div>
              {inv.bill_to.company && inv.bill_to.name && (
                <div className="text-xs text-slate-600">Attn: {inv.bill_to.name}</div>
              )}
              {inv.bill_to.email && <div className="text-xs text-slate-600">{inv.bill_to.email}</div>}
              {addressLine(inv.bill_to.address) && (
                <div className="text-xs text-slate-600 mt-1">{addressLine(inv.bill_to.address)}</div>
              )}
              <div className="text-xs text-slate-500 mt-1">
                {inv.bill_to.payment_terms_days != null ? `Net ${inv.bill_to.payment_terms_days}` : "No payment terms set"}
                {inv.bill_to.po_number ? ` · PO ${inv.bill_to.po_number}` : ""}
                {inv.bill_to.tax_exempt ? " · Tax exempt" : ""}
              </div>
            </div>
          )}

          {/* One site, or the several a batch invoice covers. Both from the
              same shape, so a single-site invoice reads exactly as it did. */}
          {(() => {
            const sited = (inv.line_groups || []).filter((g) => g.location_id);
            if (sited.length > 1) {
              return (
                <div className="rounded-xl ring-1 ring-gray-200 p-4" data-testid="service-location-block">
                  <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1">
                    Service locations ({sited.length})
                  </div>
                  {sited.map((g) => (
                    <div key={g.location_id} className="mb-1">
                      <div className="text-sm font-semibold text-slate-900">{g.name || "This site"}</div>
                      <div className="text-xs text-slate-600">{addressLine(g.address)}</div>
                      {g.po_number && <div className="text-xs text-slate-500">PO {g.po_number}</div>}
                    </div>
                  ))}
                </div>
              );
            }
            const one = inv.service_location || (sited.length === 1 ? {
              name: sited[0].name, address: sited[0].address, po_number: sited[0].po_number,
            } as AddressBlock : null);
            if (!one) return null;
            return (
              <div className="rounded-xl ring-1 ring-gray-200 p-4" data-testid="service-location-block">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 mb-1">Service location</div>
                <div className="text-sm font-semibold text-slate-900">{one.name || "—"}</div>
                <div className="text-xs text-slate-600">{addressLine(one.address)}</div>
                {one.po_number && <div className="text-xs text-slate-500">PO {one.po_number}</div>}
              </div>
            );
          })()}
        </div>
      )}

      {/* Summary block */}
      <div className="rounded-xl bg-slate-50 ring-1 ring-gray-200 p-4 mb-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="text-slate-500">Subtotal</div>
          <div className="text-right tabular-nums">{fmtMoney(inv.subtotal)}</div>
          {Number(inv.tax_amount) > 0 && (
            <>
              <div className="text-slate-500">Tax</div>
              <div className="text-right tabular-nums">{fmtMoney(inv.tax_amount)}</div>
            </>
          )}
          {Number((inv as InvoiceDetail & { discount_amount?: number }).discount_amount || 0) > 0 && (
            <>
              <div className="text-emerald-700">
                Discount
                {(inv as InvoiceDetail & { discount_code?: string }).discount_code && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99, background: "#D1FAE5", color: "#047857", fontFamily: "monospace" }}>
                    {(inv as InvoiceDetail & { discount_code?: string }).discount_code}
                  </span>
                )}
              </div>
              <div className="text-right tabular-nums text-emerald-700">
                −{fmtMoney((inv as InvoiceDetail & { discount_amount?: number }).discount_amount || 0)}
                {inv.status === "draft" && (
                  <button
                    onClick={async () => {
                      try {
                        await api.post(`/coupons/remove`, { invoice_id: inv.invoice_id });
                        await reload();
                        onChanged();
                      } catch (e) {
                        setErr(`Remove coupon failed: ${(e as Error).message}`);
                      }
                    }}
                    style={{ marginLeft: 8, fontSize: 10, color: "#9333EA", background: "transparent", border: 0, textDecoration: "underline", cursor: "pointer" }}
                  >
                    remove
                  </button>
                )}
              </div>
            </>
          )}
          <div className="text-slate-700 font-semibold">Total</div>
          <div className="text-right tabular-nums font-semibold text-oliver-teal">{fmtMoney(inv.total)}</div>
          {Number(inv.amount_paid) > 0 && (
            <>
              <div className="text-emerald-700">Paid</div>
              <div className="text-right tabular-nums text-emerald-700">−{fmtMoney(inv.amount_paid)}</div>
            </>
          )}
          {Number(inv.total_refunded) > 0 && (
            <>
              <div className="text-purple-700">Refunded</div>
              <div className="text-right tabular-nums text-purple-700">+{fmtMoney(inv.total_refunded)}</div>
            </>
          )}
          {Number(inv.balance_due) !== 0 && (
            <>
              <div className="text-slate-700 font-semibold">Balance due</div>
              <div className="text-right tabular-nums font-semibold">{fmtMoney(inv.balance_due)}</div>
            </>
          )}
        </div>

        {/* Apply coupon affordance — draft only, hidden if a coupon already applied */}
        {inv.status === "draft" && !Number((inv as InvoiceDetail & { discount_amount?: number }).discount_amount || 0) && (
          <ApplyCouponInline
            onApply={async (code) => {
              await api.post(`/coupons/apply`, { code, invoice_id: inv.invoice_id });
              await reload();
              onChanged();
            }}
          />
        )}
      </div>

      {/* Line items — editable when draft */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h3 className="text-sm font-semibold text-oliver-teal uppercase tracking-wide" style={{ margin: 0 }}>Line items</h3>
        {inv.status === "draft" && !editing && (
          <Button variant="secondary" onClick={startEdit} title="Change the lines on this draft">Edit</Button>
        )}
        {editing && (
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="secondary" onClick={addEditLine} title="Add another line to this invoice">+ Line</Button>
            <Button variant="secondary" onClick={addEditTaxLine} title="Add a tax line. Tax lines are never taxed again.">+ Tax line</Button>
          </div>
        )}
      </div>

      {!editing ? (
        // §9.6: "show group headings only when line_groups has more than one
        // sited group; a single-site invoice must look exactly as it does
        // today." That condition is the whole rule, and it is written once.
        (inv.line_groups || []).filter((g) => g.location_id).length > 1 ? (
          <div className="rounded-lg ring-1 ring-gray-200 mb-5 overflow-hidden" data-testid="line-groups">
            {(inv.line_groups || []).map((g) => (
              <div key={g.location_id || "none"} data-testid="line-group">
                <div className="px-3 py-2 bg-slate-100 flex justify-between gap-3">
                  <span className="text-xs font-bold text-slate-800">
                    {g.location_id ? (g.name || "This site") : "Not tied to a site"}
                    {addressLine(g.address) && <span className="font-normal text-slate-500"> · {addressLine(g.address)}</span>}
                    {g.po_number && <span className="font-normal text-slate-500"> · PO {g.po_number}</span>}
                  </span>
                  <span className="text-xs font-bold tabular-nums text-slate-800">{fmtMoney(g.subtotal)}</span>
                </div>
                {g.lines.map((li) => (
                  <div key={li.line_item_id} className={`px-3 py-2 grid grid-cols-12 gap-2 items-center border-b border-gray-100 ${li.is_tax ? "bg-amber-50/50" : ""}`}>
                    <div className="col-span-7">
                      <div className="text-sm text-slate-800">{li.description}</div>
                      {li.is_tax && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Tax</span>}
                    </div>
                    <div className="col-span-1 text-right text-xs text-slate-500 tabular-nums">{li.quantity}</div>
                    <div className="col-span-2 text-right text-sm tabular-nums">{fmtMoney(li.unit_price)}</div>
                    <div className="col-span-2 text-right text-sm font-medium tabular-nums">{fmtMoney(li.line_total)}</div>
                  </div>
                ))}
                {Number(g.tax_amount) > 0 && (
                  <div className="px-3 py-1.5 flex justify-between gap-3 text-xs text-slate-500 border-b border-gray-100">
                    <span>Tax{g.tax_rate != null ? ` · ${g.tax_rate}%` : ""} · {g.name || "this site"}</span>
                    <span className="tabular-nums">{fmtMoney(g.tax_amount)}</span>
                  </div>
                )}
              </div>
            ))}
            {inv.line_group_totals && (
              <div className="px-3 py-2 flex justify-between gap-3 bg-slate-50">
                <span className="text-xs font-bold text-slate-800">Total across all locations</span>
                <span className="text-xs font-bold tabular-nums text-slate-800">{fmtMoney(inv.line_group_totals.total)}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100 mb-5">
            {(inv.line_items ?? []).map((li) => (
              <div key={li.line_item_id} className={`px-3 py-2 grid grid-cols-12 gap-2 items-center ${li.is_tax ? "bg-amber-50/50" : ""}`}>
                <div className="col-span-7">
                  <div className="text-sm text-slate-800">{li.description}</div>
                  {li.is_tax && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Tax</span>}
                </div>
                <div className="col-span-1 text-right text-xs text-slate-500 tabular-nums">{li.quantity}</div>
                <div className="col-span-2 text-right text-sm tabular-nums">{fmtMoney(li.unit_price)}</div>
                <div className="col-span-2 text-right text-sm font-medium tabular-nums">{fmtMoney(li.line_total)}</div>
              </div>
            ))}
          </div>
        )
      ) : (
        <>
          <div style={{ border: "1px solid #eef2f4", borderRadius: 6, marginBottom: 12 }}>
            {editItems.map((it, i) => (
              <div key={i} style={{
                display: "grid", gridTemplateColumns: "1fr 80px 110px 110px 32px", gap: 8,
                padding: "8px 10px", alignItems: "center",
                borderBottom: i < editItems.length - 1 ? "1px solid #f0f4f6" : "none",
                background: it.is_tax ? "#FFFBEB" : "transparent",
              }}>
                <input
                  type="text"
                  placeholder={it.is_tax ? "e.g. Sales Tax 6%" : "Description"}
                  value={it.description}
                  onChange={(e) => updateEditItem(i, { description: e.target.value })}
                  style={editInputStyle}
                />
                <input
                  type="number" step="0.001" min="0" placeholder="Qty"
                  value={it.quantity}
                  onChange={(e) => updateEditItem(i, { quantity: Number(e.target.value) })}
                  style={{ ...editInputStyle, textAlign: "right" }}
                />
                <input
                  type="number" step="0.01" min="0" placeholder="Unit $"
                  value={it.unit_price}
                  onChange={(e) => updateEditItem(i, { unit_price: Number(e.target.value) })}
                  style={{ ...editInputStyle, textAlign: "right" }}
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
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Due date</span>
              <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} style={editInputStyle} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveEdit} disabled={busy === "save"}>
                {busy === "save" ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="text-xs text-slate-400 space-y-1">
        <div>Invoice ID: <span className="font-mono">{inv.invoice_id}</span></div>
        <div>Job ID: <span className="font-mono">{inv.job_id}</span></div>
        {inv.due_date && <div>Due: {fmtDate(inv.due_date)}</div>}
      </div>

      {refundOpen && (
        <PartialRefundForm
          maxAmount={refundable}
          onCancel={() => setRefundOpen(false)}
          onSubmit={async (amount, reason) => {
            try {
              await api.post(`/invoices/${inv.invoice_id}/refund`, { amount, reason });
              setRefundOpen(false);
              await reload();
              onChanged();
            } catch (e) {
              setErr(`Refund failed: ${(e as Error).message}`);
              setRefundOpen(false);
            }
          }}
        />
      )}
    </DetailDrawer>
  );
}

function PartialRefundForm({ maxAmount, onCancel, onSubmit }: { maxAmount: number; onCancel: () => void; onSubmit: (amount: number, reason: string) => Promise<void>; }) {
  const [amount, setAmount] = useState(maxAmount.toFixed(2));
  const [reason, setReason] = useState("requested_by_customer");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-oliver-teal/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-semibold text-oliver-teal">Partial refund</h3>
        <p className="text-sm text-slate-500 mt-1">Up to {fmtMoney(maxAmount)} refundable</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Amount</span>
            <input type="number" step="0.01" min="0.01" max={maxAmount}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700 font-medium">Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm">
              <option value="requested_by_customer">Requested by customer</option>
              <option value="duplicate">Duplicate charge</option>
              <option value="fraudulent">Fraudulent</option>
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={async () => {
            const a = Number(amount);
            if (!(a > 0 && a <= maxAmount)) return;
            setBusy(true);
            try { await onSubmit(a, reason); } finally { setBusy(false); }
          }}>Refund {fmtMoney(Number(amount))}</Button>
        </div>
      </div>
    </div>
  );
}

const editInputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.18)", borderRadius: 4,
  background: "#fff",
};

// ─── Apply Coupon inline ─────────────────────────────────────────────────────
// Compact form embedded in the invoice summary block. Lets an admin type a
// code, hit Apply, and see the discount appear immediately on the totals.
function ApplyCouponInline({ onApply }: { onApply: (code: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) {
    return (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #CBD5E1", textAlign: "right" }}>
        <button
          onClick={() => setOpen(true)}
          style={{ fontSize: 11, fontWeight: 600, color: "#1A7DB5", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
        >
          + Apply coupon
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #CBD5E1" }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Enter coupon code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoFocus
          style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", textTransform: "uppercase", letterSpacing: 0.5, fontFamily: "monospace" }}
        />
        <Button
          variant="primary"
          onClick={async () => {
            if (!code.trim()) return;
            setBusy(true); setErr(null);
            try {
              await onApply(code.trim());
              setOpen(false); setCode("");
            } catch (e) {
              setErr((e as Error).message || "Failed to apply");
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || !code.trim()}
        >
          {busy ? "Applying…" : "Apply"}
        </Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setCode(""); setErr(null); }}>Cancel</Button>
      </div>
      {err && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#B91C1C" }}>{err}</div>
      )}
    </div>
  );
}

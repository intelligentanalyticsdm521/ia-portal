import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState,
  StatusBadge, Button, type Column,
} from "../../components/oliver/ui";

interface ServiceRequest {
  id: string;
  job_id?: string;
  job_number?: string;
  title: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerNotes?: string;
  scheduledDate?: string;
  source: string;
  status: string;
  createdAt?: string;
  job_type?: string;
}

interface RequestDetail extends ServiceRequest {
  description?: string;
  estimated_amount?: number;
  service_address?: string;
  preferred_date?: string;
}

function fmtRelative(d?: string) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) {
    const future = Math.abs(days);
    if (future === 0) return "today";
    if (future === 1) return "tomorrow";
    return `in ${future} days`;
  }
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(d).toLocaleDateString();
}

export function OliverServiceRequestsPage() {
  const { get, patch, ready } = useOliverApi();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"quote" | "cancel" | null>(null);
  const [bulkResult, setBulkResult] = useState<{ kind: "quote" | "cancel"; ok: number; failed: number } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<ServiceRequest[]>("/jobs?status=inquiry");
      setRequests(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function bulkAdvance(toStatus: "quoted" | "cancelled") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const label = toStatus === "quoted" ? "mark as quoted" : "cancel";
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} ${ids.length} request${ids.length === 1 ? "" : "s"}?`)) return;
    setBulkBusy(toStatus === "quoted" ? "quote" : "cancel");
    setBulkResult(null);
    let ok = 0;
    let failed = 0;
    await Promise.all(ids.map(async (id) => {
      try { await patch(`/jobs/${id}/status`, { status: toStatus }); ok++; }
      catch { failed++; }
    }));
    setBulkResult({ kind: toStatus === "quoted" ? "quote" : "cancel", ok, failed });
    setSelected(new Set());
    setBulkBusy(null);
    await reload();
    setTimeout(() => setBulkResult(null), 6000);
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter((r) =>
      r.title?.toLowerCase().includes(q) ||
      r.customerName?.toLowerCase().includes(q) ||
      r.customerEmail?.toLowerCase().includes(q) ||
      r.customerNotes?.toLowerCase().includes(q)
    );
  }, [requests, search]);

  const fromPortal = requests.filter((r) => r.source === "api" || r.source === "portal").length;
  const last24h = requests.filter((r) => r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 86400000).length;

  const columns: Column<ServiceRequest>[] = [
    {
      key: "title",
      header: "Request",
      sortable: true,
      sortAccessor: (r) => r.title?.toLowerCase() ?? "",
      render: (r) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{r.title || "(no subject)"}</div>
          {r.customerNotes && (
            <div style={{ fontSize: 10, color: "#5A7A8A", fontStyle: "italic", marginTop: 2 }}>
              {r.customerNotes.slice(0, 80)}{r.customerNotes.length > 80 ? "…" : ""}
            </div>
          )}
        </div>
      ),
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
      key: "received",
      header: "Received",
      sortable: true,
      sortAccessor: (r) => r.createdAt ?? "",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{fmtRelative(r.createdAt)}</span>,
    },
    {
      key: "preferred",
      header: "Preferred date",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString() : "—"}</span>,
    },
    {
      key: "source",
      header: "Source",
      render: (r) => (
        <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999, background: "#F3E8FF", color: "#7E22CE", textTransform: "uppercase" }}>
          {r.source === "api" ? "Portal" : (r.source || "Portal")}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <OliverPageWrapper title="Service Requests" subtitle="Inbound job inquiries" error={error} loading={loading}>
      <PageHeader
        title="Service Requests"
        subtitle="Job inquiries from the customer portal — review, schedule, or convert to a quote"
        actions={
          <Button variant="secondary" onClick={() => navigate("/app/services/oliver_job_board")}>
            Open job board
          </Button>
        }
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Pending</div>
          <div className="stat-val">{requests.length}</div>
          <div className="stat-delta neu">awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Last 24 hours</div>
          <div className="stat-val">{last24h}</div>
          <div className="stat-delta neu">new requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">From portal</div>
          <div className="stat-val">{fromPortal}</div>
          <div className="stat-delta neu">customer-initiated</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Avg response</div>
          <div className="stat-val">—</div>
          <div className="stat-delta neu">tracked over time</div>
        </div>
      </div>

      {!requests.length ? (
        <EmptyState
          title="No pending service requests"
          description="When customers submit a job request from your customer portal, it will appear here for you to review, schedule, or convert into a quote."
        />
      ) : (
        <>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search title, customer, email, or notes…"
          />

          {bulkResult && (
            <div className="card" style={{ background: "#D1FAE5", border: "1px solid #6EE7B7", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#065F46" }}>
                {bulkResult.ok} request{bulkResult.ok === 1 ? "" : "s"} {bulkResult.kind === "quote" ? "advanced to quoted" : "cancelled"}
                {bulkResult.failed > 0 ? ` · ${bulkResult.failed} failed` : ""}.
              </div>
            </div>
          )}

          {selected.size > 0 && (
            <div className="card" style={{ background: "#E8F4FB", border: "1px solid rgba(45,156,219,0.3)", marginBottom: 8, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "#0C4A60" }}>
                  <strong>{selected.size}</strong> selected
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Button variant="secondary" onClick={() => setSelected(new Set())}>Clear</Button>
                  <Button variant="ghost" onClick={() => bulkAdvance("cancelled")} disabled={!!bulkBusy}>
                    {bulkBusy === "cancel" ? "Cancelling…" : `Cancel ${selected.size}`}
                  </Button>
                  <Button variant="primary" onClick={() => bulkAdvance("quoted")} disabled={!!bulkBusy}>
                    {bulkBusy === "quote" ? "Updating…" : `Mark ${selected.size} as quoted`}
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(r) => r.id || r.job_id || ""}
            onRowClick={(r) => setPickedId(r.id || r.job_id || null)}
            initialSort={{ key: "received", direction: "desc" }}
            emptyMessage="No service requests match this search."
            selectedIds={selected}
            onSelectionChange={setSelected}
          />
        </>
      )}

      {pickedId && <RequestDetailModal jobId={pickedId} onClose={() => setPickedId(null)} api={{ get }} navigate={navigate} />}
    </OliverPageWrapper>
  );
}

function RequestDetailModal({ jobId, onClose, api, navigate }: { jobId: string; onClose: () => void; api: { get: <T>(p: string) => Promise<T> }; navigate: (p: string) => void }) {
  const [detail, setDetail] = useState<RequestDetail | null>(null);

  useEffect(() => {
    (async () => {
      try { setDetail(await api.get<RequestDetail>(`/jobs/${jobId}`)); }
      catch { /* ignore */ }
    })();
  }, [jobId, api]);

  if (!detail) {
    return <DetailDrawer open onClose={onClose} title="Loading…" width="lg"><div style={{ padding: 20, color: "#5A7A8A" }}>Loading request…</div></DetailDrawer>;
  }

  return (
    <DetailDrawer
      open onClose={onClose}
      title={detail.title || "Service request"}
      subtitle={`From ${detail.customerName || "—"} · ${fmtRelative(detail.createdAt)}`}
      width="lg"
    >
      <div className="card">
        <div className="card-ttl">Request details</div>
        {detail.description && (
          <div style={{ fontSize: 12, color: "#0B1C24", marginTop: 8, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
            {detail.description}
          </div>
        )}
        {detail.customerNotes && (
          <div style={{ fontSize: 12, color: "#0B1C24", marginTop: 8, lineHeight: 1.5, whiteSpace: "pre-wrap", fontStyle: "italic" }}>
            "{detail.customerNotes}"
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-ttl">Customer</div>
        <Row label="Name" value={detail.customerName || "—"} />
        {detail.customerEmail && <Row label="Email" value={<a href={`mailto:${detail.customerEmail}`} style={{ color: "#1A7DB5" }}>{detail.customerEmail}</a>} />}
        {detail.customerPhone && <Row label="Phone" value={detail.customerPhone} />}
        {detail.service_address && <Row label="Service address" value={detail.service_address} />}
      </div>

      <div className="card">
        <div className="card-ttl">Schedule</div>
        <Row label="Preferred date" value={detail.preferred_date || detail.scheduledDate ? new Date(detail.preferred_date || detail.scheduledDate || "").toLocaleString() : "Flexible"} />
        {detail.estimated_amount && <Row label="Estimated value" value={`$${Number(detail.estimated_amount).toLocaleString()}`} />}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button variant="primary" onClick={() => navigate(`/app/services/oliver_job_board?focus=${jobId}`)}>
          Open in job board
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/app/services/oliver_quotes?from_job=${jobId}`)}>
          Convert to quote
        </Button>
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

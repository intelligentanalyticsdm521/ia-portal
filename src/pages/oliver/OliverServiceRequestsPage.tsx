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

  // Source label normalization — covers the historical sources + new lead intake routes
  function sourceLabel(s?: string): { label: string; bg: string; color: string } {
    const key = (s || "portal").toLowerCase();
    if (key === "api" || key === "portal") return { label: "Customer portal", bg: "#F3E8FF", color: "#7E22CE" };
    if (key === "arion_lead_form" || key.startsWith("arion")) return { label: "ARION lead form", bg: "#E0F2FE", color: "#075985" };
    if (key === "zapier") return { label: "Zapier", bg: "#FEF3C7", color: "#92400E" };
    if (key === "lead_intake") return { label: "External intake", bg: "#DBEAFE", color: "#1E40AF" };
    if (key === "manual" || key === "admin") return { label: "Manual", bg: "#F1F5F9", color: "#5A7A8A" };
    if (key === "lead_intake") return { label: "External", bg: "#F1F5F9", color: "#5A7A8A" };
    return { label: key.charAt(0).toUpperCase() + key.slice(1), bg: "#F1F5F9", color: "#5A7A8A" };
  }

  // Age in hours since received. Drives staleness coloring + "average wait" KPI.
  function ageHours(r: ServiceRequest): number {
    if (!r.createdAt) return 0;
    return Math.floor((Date.now() - new Date(r.createdAt).getTime()) / 3600000);
  }

  const fromPortal = requests.filter((r) => r.source === "api" || r.source === "portal").length;
  const last24h = requests.filter((r) => r.createdAt && Date.now() - new Date(r.createdAt).getTime() < 86400000).length;
  const oldestHours = requests.length
    ? Math.max(...requests.map(ageHours))
    : 0;
  const avgAgeHours = requests.length
    ? Math.round(requests.reduce((s, r) => s + ageHours(r), 0) / requests.length)
    : 0;

  // Group by source for the breakdown card. Limit to top 4 + "other" bucket.
  const sourceBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; count: number; bg: string; color: string }>();
    for (const r of requests) {
      const meta = sourceLabel(r.source);
      const key = meta.label;
      const cur = map.get(key) || { ...meta, count: 0 };
      cur.count++;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [requests]);

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
      render: (r) => {
        const h = ageHours(r);
        const stale = h >= 48;     // ≥ 2 days → red
        const aging = h >= 24;     // ≥ 1 day → amber
        return (
          <div>
            <div style={{
              fontSize: 11, fontWeight: stale ? 700 : 500,
              color: stale ? "#B91C1C" : aging ? "#D97706" : "#0B1C24",
            }}>{fmtRelative(r.createdAt)}</div>
            {(stale || aging) && (
              <div style={{ fontSize: 9, color: stale ? "#B91C1C" : "#D97706", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 2 }}>
                {stale ? "Needs reply" : "Aging"}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "preferred",
      header: "Preferred date",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{r.scheduledDate ? new Date(r.scheduledDate).toLocaleDateString() : "—"}</span>,
    },
    {
      key: "source",
      header: "Source",
      render: (r) => {
        const meta = sourceLabel(r.source);
        return (
          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: meta.bg, color: meta.color }}>
            {meta.label}
          </span>
        );
      },
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
          <div className="stat-val" style={{ color: requests.length > 0 ? "#D97706" : undefined }}>{requests.length}</div>
          <div className="stat-delta neu">awaiting review</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Last 24 hours</div>
          <div className="stat-val">{last24h}</div>
          <div className="stat-delta neu">new requests</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Average wait</div>
          <div className="stat-val" style={{ color: avgAgeHours >= 48 ? "#B91C1C" : avgAgeHours >= 24 ? "#D97706" : undefined }}>
            {avgAgeHours === 0 ? "—" : avgAgeHours < 24 ? `${avgAgeHours}h` : `${Math.round(avgAgeHours / 24)}d`}
          </div>
          <div className="stat-delta neu">since received</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Oldest pending</div>
          <div className="stat-val" style={{ color: oldestHours >= 48 ? "#B91C1C" : oldestHours >= 24 ? "#D97706" : undefined }}>
            {oldestHours === 0 ? "—" : oldestHours < 24 ? `${oldestHours}h` : `${Math.round(oldestHours / 24)}d`}
          </div>
          <div className="stat-delta neu">don't leave them waiting</div>
        </div>
      </div>

      {/* Source breakdown card — only meaningful with at least one request */}
      {requests.length > 0 && sourceBreakdown.length > 1 && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Where requests come from</div>
              <div className="card-sub">Of your {requests.length} pending request{requests.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", border: "1px solid #E2E8F0" }}>
            {sourceBreakdown.map((s) => {
              const w = (s.count / requests.length) * 100;
              return (
                <div key={s.label} title={`${s.count} from ${s.label}`}
                  style={{
                    width: `${w}%`, background: s.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                  }}>
                  {w > 14 && s.count}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10, fontSize: 12 }}>
            {sourceBreakdown.map((s) => (
              <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <span style={{ color: "#0B1C24", fontWeight: 500 }}>{s.label}</span>
                <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>· {s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

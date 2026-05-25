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
      // Two sources of pending work:
      //   1. /jobs?status=inquiry → traditional service requests from portal/ARION/Zapier/etc.
      //   2. /booking/pending → Standard-tier booking submissions awaiting tenant confirmation.
      // Both flow into the same inbox so staff has one place to triage incoming demand.
      const [jobs, bookings] = await Promise.all([
        get<ServiceRequest[]>("/jobs?status=inquiry").catch(() => [] as ServiceRequest[]),
        get<ServiceRequest[]>("/booking/pending").catch(() => [] as ServiceRequest[]),
      ]);
      const merged = [...(jobs || []), ...(bookings || [])].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta; // newest first
      });
      setRequests(merged);
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
    if (key === "booking") return { label: "Booking Request", bg: "#FEF3C7", color: "#A16207" };
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

      {pickedId && (() => {
        // Route to the right detail drawer based on source. Booking rows
        // have source='booking' and need the booking-specific confirm /
        // reschedule / decline actions (vs. the regular job inquiry flow
        // which routes to job board + quote conversion).
        const picked = requests.find((r) => (r.id || r.job_id) === pickedId);
        if (picked?.source === "booking") {
          return (
            <BookingDetailDrawer
              row={picked}
              onClose={() => setPickedId(null)}
              api={{ get, patch }}
              onActionComplete={reload}
            />
          );
        }
        return <RequestDetailModal jobId={pickedId} onClose={() => setPickedId(null)} api={{ get }} navigate={navigate} />;
      })()}
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
        {detail.service_address && <Row label="Address" value={detail.service_address} />}
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

/**
 * BookingDetailDrawer — replaces RequestDetailModal when the picked row is
 * a booking (source='booking'). Standard tier surfaces Confirm / Reschedule /
 * Decline actions; the underlying booking_slot row already has everything
 * needed, so no GET is required (we already fetched it as part of /booking/pending).
 */
interface BookingRow extends ServiceRequest {
  slot_end_utc?: string;
  guest_timezone?: string;
  booking_page_id?: string;
  confirmation_token?: string;
}

function BookingDetailDrawer({
  row, onClose, api, onActionComplete,
}: {
  row: BookingRow;
  onClose: () => void;
  api: { get: <T>(p: string) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
  onActionComplete: () => void;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | "reschedule" | null>(null);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function doConfirm() {
    if (!confirm("Confirm this booking? The guest will receive a confirmation email.")) return;
    setBusy("confirm"); setError(null);
    try {
      await api.patch(`/booking/slots/${row.id}/confirm`, {});
      onActionComplete();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function doCancel() {
    if (!confirm("Decline this booking? The guest will be notified.")) return;
    setBusy("cancel"); setError(null);
    try {
      await api.patch(`/booking/slots/${row.id}/cancel`, {});
      onActionComplete();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function doReschedule() {
    if (!newStart) { setError("Pick a new start time."); return; }
    setBusy("reschedule"); setError(null);
    try {
      // Compute end from start + same duration as original.
      const start = new Date(newStart);
      const originalDuration = row.scheduledDate && row.slot_end_utc
        ? new Date(row.slot_end_utc).getTime() - new Date(row.scheduledDate).getTime()
        : 30 * 60_000;
      const end = new Date(start.getTime() + originalDuration);
      await api.patch(`/booking/slots/${row.id}/reschedule`, {
        slot_start_utc: start.toISOString(),
        slot_end_utc: end.toISOString(),
      });
      onActionComplete();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Parse the form_data JSON the guest submitted (custom fields beyond name/email/phone)
  let formData: Record<string, unknown> | null = null;
  if (typeof row.customerNotes === "string" && row.customerNotes.trim()) {
    try { formData = JSON.parse(row.customerNotes); } catch { /* not JSON, leave as text */ }
  }

  const localTime = row.scheduledDate
    ? new Date(row.scheduledDate).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })
    : "—";

  return (
    <DetailDrawer
      open onClose={onClose}
      title={row.title || "Booking request"}
      subtitle={`From ${row.customerName || "—"} · ${fmtRelative(row.createdAt)}`}
      width="lg"
    >
      <div className="card">
        <div className="card-ttl">Requested time</div>
        <Row label="When" value={localTime} />
        {row.guest_timezone && <Row label="Guest timezone" value={row.guest_timezone} />}
      </div>

      <div className="card">
        <div className="card-ttl">Customer</div>
        <Row label="Name" value={row.customerName || "—"} />
        {row.customerEmail && <Row label="Email" value={<a href={`mailto:${row.customerEmail}`} style={{ color: "#1A7DB5" }}>{row.customerEmail}</a>} />}
        {row.customerPhone && <Row label="Phone" value={row.customerPhone} />}
      </div>

      {formData && Object.keys(formData).length > 0 && (
        <div className="card">
          <div className="card-ttl">Form responses</div>
          {Object.entries(formData).map(([k, v]) => (
            <Row key={k} label={k.replace(/_/g, " ")} value={String(v)} />
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: "#FEE2E2", color: "#991B1B", padding: 10, borderRadius: 6, fontSize: 12, marginTop: 8 }}>
          {error}
        </div>
      )}

      {rescheduleMode ? (
        <div className="card" style={{ background: "#FEF3C7" }}>
          <div className="card-ttl">Reschedule</div>
          <Row label="New start time" value={
            <input
              type="datetime-local"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              style={{ padding: "4px 8px", border: "1px solid #d1d5db", borderRadius: 4, fontSize: 13 }}
            />
          } />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Button variant="primary" onClick={doReschedule} disabled={busy === "reschedule" || !newStart}>
              {busy === "reschedule" ? "Saving…" : "Send new time"}
            </Button>
            <Button variant="secondary" onClick={() => { setRescheduleMode(false); setError(null); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <Button variant="primary" onClick={doConfirm} disabled={!!busy}>
            {busy === "confirm" ? "Confirming…" : "Confirm booking"}
          </Button>
          <Button variant="secondary" onClick={() => setRescheduleMode(true)} disabled={!!busy}>
            Reschedule
          </Button>
          <Button variant="secondary" onClick={doCancel} disabled={!!busy}>
            {busy === "cancel" ? "Cancelling…" : "Decline"}
          </Button>
        </div>
      )}
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

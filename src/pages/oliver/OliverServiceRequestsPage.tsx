import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation } from "../../lib/oliverLocations";
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
  /** The catalog service, job scope or custom entry the customer picked (GET /booking/pending). */
  service_name?: string | null;
  /** The booking page (form) a booking request came in on (GET /booking/pending, /booking/decided). */
  booking_page_title?: string | null;
  /** Where the visit is, as the guest typed it on the booking form; null on a page that does not ask. */
  service_address?: { address_line_1?: string; address_line_2?: string; city?: string; state?: string; postal_code?: string; access_notes?: string } | string | null;
  service_address_line?: string | null;
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

// 2026-09-25 (Brandon's walk W-OB-06): "it let me accept it but I can't see the
// request in service requests anymore." Confirm turns a booking request into a
// job and the row left the list with nothing naming the job. The page now opens
// on Open (unchanged) with Confirmed / Declined / Cancelled beside it, read from
// GET /booking/decided (last 30 days, booking requests AND inquiry jobs), and a
// confirmed row links to the job it became.
type RequestView = "open" | "confirmed" | "declined" | "cancelled";

/** A request that has been decided — the GET /booking/decided row shape. */
interface DecidedRequest extends ServiceRequest {
  kind: "booking" | "inquiry";
  outcome: "confirmed" | "declined" | "cancelled";
  decided_at?: string;
  /** Who called it off, when the record says; null when it does not. */
  cancelled_by?: "business" | "customer" | null;
  job_status?: string | null;
}

/** What PATCH /booking/slots/:id/confirm answers (the fields this page reads). */
interface ConfirmResult {
  job_id?: string;
  job_number?: string;
  promotion_error?: string;
}

/** The job's own drawer on the Job Board — the link every job pointer here uses. */
function jobHref(jobId: string) {
  return `/app/services/oliver_job_board?focus=${encodeURIComponent(jobId)}`;
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

/** "today" / "3 days ago" / "on 9/1/2026" — reads after "Confirmed", "Declined". */
function whenPhrase(d?: string) {
  if (!d) return "";
  const rel = fmtRelative(d);
  return /^\d/.test(rel) ? `on ${rel}` : rel;
}

export function OliverServiceRequestsPage() {
  const { get, patch, ready } = useOliverApi();
  // Multi-location: the header picker scopes the inbox (both sources).
  const loc = useOliverLocations();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [search, setSearch] = useState("");
  // D-BK11 (Brandon, 25 Sep 2026, Test 2.6): "a dropdown filter that allows
  // them to filter the panels by a specific job type, like Mowing, or ... only
  // my website booking requests". Two narrow filters beside the search: the
  // service (what was asked for) and where the request came from. Options are
  // read off the rows in the current view, so the lists never offer a choice
  // that matches nothing.
  const [typeFilter, setTypeFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<"quote" | "cancel" | null>(null);
  const [bulkResult, setBulkResult] = useState<{ kind: "quote" | "cancel"; ok: number; failed: number } | null>(null);
  // Open is the default and behaves exactly as before; the other three read
  // the decided list, fetched alongside so the chips can carry their counts.
  const [view, setView] = useState<RequestView>("open");
  const [decided, setDecided] = useState<DecidedRequest[]>([]);
  const [decidedFailed, setDecidedFailed] = useState(false);
  // Set by the booking drawer's Confirm; stays until dismissed or replaced.
  const [confirmedNotice, setConfirmedNotice] = useState<ConfirmResult | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Two sources of pending work:
      //   1. /jobs?status=inquiry → traditional service requests from portal/ARION/Zapier/etc.
      //   2. /booking/pending → Standard-tier booking submissions awaiting tenant confirmation.
      // Both flow into the same inbox so staff has one place to triage incoming demand.
      // 3. /booking/decided → what left the inbox in the last 30 days, by outcome.
      //    Its own failure flag: a problem there never empties the Open list.
      const [jobs, bookings, decidedRes] = await Promise.all([
        get<ServiceRequest[]>(withLocation("/jobs?status=inquiry", loc.selectedLocationId)).catch(() => [] as ServiceRequest[]),
        get<ServiceRequest[]>(withLocation("/booking/pending", loc.selectedLocationId)).catch(() => [] as ServiceRequest[]),
        get<DecidedRequest[]>(withLocation("/booking/decided", loc.selectedLocationId))
          .then((rows) => ({ rows: Array.isArray(rows) ? rows : [], failed: false }))
          .catch(() => ({ rows: [] as DecidedRequest[], failed: true })),
      ]);
      const merged = [...(jobs || []), ...(bookings || [])].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta; // newest first
      });
      setRequests(merged);
      setDecided(decidedRes.rows);
      setDecidedFailed(decidedRes.failed);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, loc.selectedLocationId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // ?request=<slot id> (a booking-request card on the Job Board calendar, the
  // Schedule or the Dashboard calendar) opens that one request, then drops the
  // parameter so a refresh does not reopen it. 2026-09-25, Brandon W-OB-05.
  const location = useLocation();
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get("request");
    if (!wanted || loading) return;
    if (requests.some((r) => (r.id || r.job_id) === wanted)) setPickedId(wanted);
    navigate(location.pathname, { replace: true });
  }, [location.search, location.pathname, loading, requests, navigate]);

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

  /** The service a row asked for: the booked service, else the title before " · ". */
  const serviceOf = (r: ServiceRequest) =>
    String(r.service_name || String(r.title || "").split(" · ")[0] || "").trim();
  /** Where a request came from, one entry per booking page. 2026-09-25 (Brandon,
   *  Test 4.17): "None of the service requests say which form it is from." */
  const sourceOf = (r: ServiceRequest) =>
    r.source === "booking" ? `Booking · ${r.booking_page_title || "booking page"}` : sourceLabel(r.source).label;
  const passesDropdowns = (r: ServiceRequest) =>
    (!typeFilter || serviceOf(r) === typeFilter) &&
    (!sourceFilter || sourceOf(r) === sourceFilter);

  const filtered = useMemo(() => {
    const rows = requests.filter(passesDropdowns);
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.title?.toLowerCase().includes(q) ||
      r.customerName?.toLowerCase().includes(q) ||
      r.customerEmail?.toLowerCase().includes(q) ||
      r.customerNotes?.toLowerCase().includes(q)
    );
  }, [requests, search, typeFilter, sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confirmed / Declined / Cancelled — the same search, over the decided list.
  const filteredDecided = useMemo(() => {
    const rows = (view === "open" ? [] : decided.filter((d) => d.outcome === view)).filter(passesDropdowns);
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.title?.toLowerCase().includes(q) ||
      r.customerName?.toLowerCase().includes(q) ||
      r.customerEmail?.toLowerCase().includes(q) ||
      r.customerNotes?.toLowerCase().includes(q) ||
      r.job_number?.toLowerCase().includes(q)
    );
  }, [decided, view, search, typeFilter, sourceFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // The dropdowns offer only what the current view holds.
  const viewRows: ServiceRequest[] = view === "open" ? requests : decided.filter((d) => d.outcome === view);
  const typeOptions = Array.from(new Set(viewRows.map(serviceOf).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const sourceOptions = Array.from(new Set(viewRows.map(sourceOf))).sort((a, b) => a.localeCompare(b));

  const decidedCount = (o: DecidedRequest["outcome"]) => decided.filter((d) => d.outcome === o).length;
  const viewPills = [
    { key: "open", label: "Open", count: requests.length },
    { key: "confirmed", label: "Confirmed", count: decidedCount("confirmed") },
    { key: "declined", label: "Declined", count: decidedCount("declined") },
    { key: "cancelled", label: "Cancelled", count: decidedCount("cancelled") },
  ];

  function changeView(next: string) {
    setView(next as RequestView);
    setSelected(new Set()); // bulk actions belong to Open only
  }

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
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: meta.bg, color: meta.color }}>
              {meta.label}
            </span>
            {/* 2026-09-25 (Brandon, Test 4.17): which booking page (form) it came in on. */}
            {r.source === "booking" && r.booking_page_title && (
              <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 3, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.booking_page_title}>
                {r.booking_page_title}
              </div>
            )}
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  // Decided views: the request, who, what happened and when, and — for a
  // confirmed one — the job it became, as a link to that job on the Job Board.
  function outcomeCell(r: DecidedRequest) {
    const when = whenPhrase(r.decided_at);
    const exact = r.decided_at ? new Date(r.decided_at).toLocaleString() : undefined;
    if (r.outcome === "confirmed") {
      return (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#065F46" }} title={exact}>Confirmed {when}</div>
          {r.job_id && r.job_number ? (
            <Link
              to={jobHref(r.job_id)}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 11, color: "#1A7DB5", fontWeight: 600 }}
            >
              Now {r.job_number} on Jobs
            </Link>
          ) : (
            <div style={{ fontSize: 10, color: "#5A7A8A" }}>No job linked</div>
          )}
        </div>
      );
    }
    const label = r.outcome === "declined"
      ? (r.cancelled_by === "customer" ? "Withdrawn by the customer" : "Declined")
      : `Cancelled${r.cancelled_by === "customer" ? " by the customer" : r.cancelled_by === "business" ? " by your team" : ""}`;
    return (
      <div style={{ fontSize: 11, fontWeight: 600, color: "#B91C1C" }} title={exact}>
        {label} {when}
      </div>
    );
  }

  // Same Request / Customer / Preferred date / Source cells as Open; Outcome
  // takes the place of Received + Status.
  const sharedColumn = (key: string): Column<DecidedRequest>[] => columns.filter((c) => c.key === key);
  const decidedColumns: Column<DecidedRequest>[] = [
    ...sharedColumn("title"),
    ...sharedColumn("customer"),
    {
      key: "outcome",
      header: "Outcome",
      sortable: true,
      sortAccessor: (r) => r.decided_at ?? "",
      render: outcomeCell,
    },
    ...sharedColumn("preferred"),
    ...sharedColumn("source"),
  ];

  const decidedEmpty: Record<Exclude<RequestView, "open">, string> = {
    confirmed: "No requests were confirmed in the last 30 days.",
    declined: "No requests were declined in the last 30 days.",
    cancelled: "No confirmed requests were cancelled in the last 30 days.",
  };

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

      {/* Open (default) | Confirmed | Declined | Cancelled — always shown, so the
          history is reachable even when nothing is waiting. */}
      <FilterBar
        pills={viewPills}
        activePill={view}
        onPillChange={changeView}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search title, customer, email, or notes…"
        rightSlot={
          <>
            <select
              aria-label="Service"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              title="Only requests for one service"
            >
              <option value="">All services</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              aria-label="Source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
              title="Only requests from one place"
            >
              <option value="">All sources</option>
              {sourceOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        }
      />

      {confirmedNotice && (
        <div className="card" style={{
          background: confirmedNotice.job_number ? "#D1FAE5" : "#FEF3C7",
          border: `1px solid ${confirmedNotice.job_number ? "#6EE7B7" : "#FCD34D"}`,
          marginBottom: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: confirmedNotice.job_number ? "#065F46" : "#92400E" }}>
              {confirmedNotice.job_id && confirmedNotice.job_number ? (
                <>
                  Confirmed — now{" "}
                  <Link to={jobHref(confirmedNotice.job_id)} style={{ color: "#065F46", fontWeight: 700, textDecoration: "underline" }}>
                    {confirmedNotice.job_number} on Jobs
                  </Link>
                </>
              ) : (
                <>Confirmed, but the job was not created. Add it on the Job Board.</>
              )}
            </div>
            <Button variant="ghost" onClick={() => setConfirmedNotice(null)}>Dismiss</Button>
          </div>
        </div>
      )}

      {view !== "open" ? (
        decidedFailed ? (
          <div className="card" style={{ background: "#FEF3C7", border: "1px solid #FCD34D", fontSize: 12, color: "#92400E" }}>
            Confirmed, declined and cancelled requests could not be loaded just now. Reload the page to try again.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 8 }}>
              Decided in the last 30 days, newest first.
            </div>
            <DataTable
              key={view}
              rows={filteredDecided}
              columns={decidedColumns}
              rowKey={(r) => `${r.kind}:${r.id}`}
              onRowClick={view === "confirmed" ? (r) => { if (r.job_id) navigate(jobHref(r.job_id)); } : undefined}
              initialSort={{ key: "outcome", direction: "desc" }}
              emptyMessage={search.trim() ? "No requests match this search." : decidedEmpty[view]}
            />
          </>
        )
      ) : !requests.length ? (
        <EmptyState
          title="No pending service requests"
          description="When customers submit a job request from your customer portal, it will appear here for you to review, schedule, or convert into a quote."
        />
      ) : (
        <>
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
              onConfirmed={setConfirmedNotice}
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
  row, onClose, api, onActionComplete, onConfirmed,
}: {
  row: BookingRow;
  onClose: () => void;
  api: { get: <T>(p: string) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
  onActionComplete: () => void;
  /** Hands the page the job the booking became, for "Confirmed — now JOB-… on Jobs". */
  onConfirmed: (result: ConfirmResult) => void;
}) {
  const [busy, setBusy] = useState<"confirm" | "cancel" | "reschedule" | null>(null);
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [newStart, setNewStart] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function doConfirm() {
    if (!confirm("Confirm this booking? The guest will receive a confirmation email.")) return;
    setBusy("confirm"); setError(null);
    try {
      const result = await api.patch<ConfirmResult>(`/booking/slots/${row.id}/confirm`, {});
      onConfirmed(result || {});
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
  const accessNotes = row.service_address && typeof row.service_address === "object"
    ? String(row.service_address.access_notes || "").trim() || null
    : null;

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

      {/* 2026-09-25 (register oliver-service-request-modal-omits-the-service-
          address): the office used to confirm a visit without being shown what
          was booked or where. GET /booking/pending has carried both since
          OLIVER pack 1; the drawer never read them. */}
      {(row.booking_page_title || row.service_name || row.service_address_line || accessNotes) && (
        <div className="card">
          <div className="card-ttl">What and where</div>
          {row.booking_page_title && <Row label="Booking page" value={row.booking_page_title} />}
          {row.service_name && <Row label="Service" value={row.service_name} />}
          {row.service_address_line && <Row label="Address" value={row.service_address_line} />}
          {accessNotes && <Row label="Getting in" value={accessNotes} />}
        </div>
      )}

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

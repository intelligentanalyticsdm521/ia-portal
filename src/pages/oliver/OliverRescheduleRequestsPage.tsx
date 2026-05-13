import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";
import { CheckCircle2, XCircle, AlertTriangle, CalendarClock } from "lucide-react";

interface RescheduleRequest {
  request_id: string;
  job_id: string;
  job_title: string;
  job_scheduled_at: string | null;
  requested_by: string;
  original_at: string;
  proposed_at: string;
  reason: string | null;
  status: "pending" | "approved" | "declined";
  created_at: string;
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  pending: { bg: "#FEF3C7", color: "#92400E" },
  approved: { bg: "#D1FAE5", color: "#047857" },
  declined: { bg: "#FEE2E2", color: "#991B1B" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
];

function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}
function fmtRelative(d: string) {
  const t = new Date(d).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function OliverRescheduleRequestsPage() {
  const { get, post, ready } = useOliverApi();
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const path = filter && filter !== "all" ? `/reschedule-requests?status=${filter}` : "/reschedule-requests";
      const data = await get<RescheduleRequest[]>(path);
      setRequests(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, filter]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Always know the pending count for the badge regardless of current filter
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const all = await get<RescheduleRequest[]>("/reschedule-requests?status=pending");
        setPendingCount((all || []).length);
      } catch { /* ignore */ }
    })();
  }, [ready, get, requests.length]);

  const filtered = useMemo(() => {
    if (!search.trim()) return requests;
    const q = search.toLowerCase();
    return requests.filter((r) =>
      (r.job_title || "").toLowerCase().includes(q) ||
      (r.requested_by || "").toLowerCase().includes(q) ||
      (r.reason || "").toLowerCase().includes(q));
  }, [requests, search]);

  async function approve(r: RescheduleRequest) {
    setBusy(r.request_id);
    try {
      await post(`/reschedule-requests/${r.request_id}/approve`);
      setFlash(`Approved — "${r.job_title}" rescheduled.`);
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    } finally { setBusy(null); }
  }

  async function decline(r: RescheduleRequest) {
    if (!confirm(`Decline reschedule request for "${r.job_title}"?`)) return;
    setBusy(r.request_id);
    try {
      await post(`/reschedule-requests/${r.request_id}/decline`);
      setFlash(`Declined.`);
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Decline failed");
    } finally { setBusy(null); }
  }

  const columns: Column<RescheduleRequest>[] = [
    {
      key: "job", header: "Job",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>{r.job_title}</div>
          <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{r.job_id.slice(0, 8)}</div>
        </div>
      ),
    },
    {
      key: "requested_by", header: "Requested by",
      render: (r) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{r.requested_by}</span>,
    },
    {
      key: "original", header: "Original time",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#5A7A8A", textDecoration: "line-through" }}>{fmtDateTime(r.original_at)}</span>
      ),
    },
    {
      key: "proposed", header: "Proposed time",
      render: (r) => (
        <span style={{ fontSize: 11, color: "#0B1C24", fontWeight: 600 }}>
          <CalendarClock size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
          {fmtDateTime(r.proposed_at)}
        </span>
      ),
    },
    {
      key: "reason", header: "Reason",
      render: (r) => r.reason ? <span style={{ fontSize: 11, color: "#0B1C24" }}>{r.reason}</span> : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "submitted", header: "Submitted",
      render: (r) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{fmtRelative(r.created_at)}</span>,
    },
    {
      key: "status", header: "Status",
      render: (r) => {
        const pill = STATUS_PILL[r.status] || STATUS_PILL.pending;
        return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600 }}>{r.status}</span>;
      },
    },
    {
      key: "actions", header: "", align: "right",
      render: (r) => r.status === "pending" ? (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" onClick={() => approve(r)} disabled={busy === r.request_id}><CheckCircle2 size={11} color="#059669" /> Approve</Button>
          <Button variant="ghost" size="sm" onClick={() => decline(r)} disabled={busy === r.request_id}><XCircle size={11} color="#dc2626" /></Button>
        </div>
      ) : null,
    },
  ];

  return (
    <OliverPageWrapper title="Reschedule Requests" subtitle="Customer & worker time-change requests" error={error} loading={loading && !requests.length}>
      <PageHeader
        title="Reschedule Requests"
        subtitle="Approve or decline customer / worker requests to move a scheduled job."
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      {pendingCount > 0 && (
        <div style={{ padding: 14, marginBottom: 14, background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <AlertTriangle size={20} color="#92400E" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>{pendingCount} pending request{pendingCount === 1 ? "" : "s"}</div>
            <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>Review and approve to update the job schedule, or decline to keep the original time.</div>
          </div>
        </div>
      )}

      {!requests.length && !loading && filter === "all" ? (
        <EmptyState
          title="No reschedule requests"
          description="When a customer or worker requests to move a job, it'll appear here for approval."
        />
      ) : (
        <>
          <FilterBar pills={FILTER_PILLS} activePill={filter} onPillChange={setFilter} search={search} onSearchChange={setSearch} searchPlaceholder="Search by job, requester, or reason…" />
          <DataTable rows={filtered} columns={columns} rowKey={(r) => r.request_id} emptyMessage="No requests match these filters." />
        </>
      )}
    </OliverPageWrapper>
  );
}

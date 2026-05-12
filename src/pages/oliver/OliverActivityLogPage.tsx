import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState,
  type Column,
} from "../../components/oliver/ui";

interface ActivityEvent {
  id: string;
  description: string;
  type: string;
  timestamp: string;
  created_at?: string;
}

const TYPE_PILLS = [
  { key: "", label: "All" },
  { key: "type:job_status", label: "Jobs" },
  { key: "type:invoice", label: "Invoices" },
  { key: "type:quote", label: "Quotes" },
  { key: "type:payment", label: "Payments" },
  { key: "type:dispatch", label: "Dispatch" },
  { key: "type:notification", label: "Notifications" },
];

// Per-type visual treatment so admins can scan the log by eye.
const TYPE_META: Record<string, { icon: string; bg: string; color: string; label: string }> = {
  job_status:   { icon: "🛠",  bg: "#DBEAFE", color: "#1E40AF", label: "Job" },
  invoice:      { icon: "🧾",  bg: "#D1FAE5", color: "#047857", label: "Invoice" },
  quote:        { icon: "📋",  bg: "#FEF3C7", color: "#92400E", label: "Quote" },
  payment:      { icon: "💰",  bg: "#D1FAE5", color: "#047857", label: "Payment" },
  dispatch:     { icon: "🚚",  bg: "#E0E7FF", color: "#4338CA", label: "Dispatch" },
  notification: { icon: "📧",  bg: "#F3E8FF", color: "#7E22CE", label: "Notification" },
  info:         { icon: "ℹ",   bg: "#F1F5F9", color: "#5A7A8A", label: "Info" },
};

function fmtRelative(d?: string) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export function OliverActivityLogPage() {
  const { get, ready } = useOliverApi();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<ActivityEvent[]>("/dashboard/activity");
      // Normalize timestamp field (some endpoints return created_at)
      const normalized = (data || []).map((e) => ({
        ...e,
        timestamp: e.timestamp || e.created_at || "",
      }));
      setEvents(normalized);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = events;
    if (filter.startsWith("type:")) {
      const t = filter.split(":")[1];
      list = list.filter((e) => e.type === t);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) => e.description?.toLowerCase().includes(q));
    }
    return list;
  }, [events, filter, search]);

  // Counts for KPI summary
  const last24h = events.filter((e) => Date.now() - new Date(e.timestamp).getTime() < 86400000).length;
  const last7d = events.filter((e) => Date.now() - new Date(e.timestamp).getTime() < 7 * 86400000).length;
  const byType = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1;
    return acc;
  }, {});
  const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];

  const columns: Column<ActivityEvent>[] = [
    {
      key: "type",
      header: "Type",
      render: (e) => {
        const meta = TYPE_META[e.type] || TYPE_META.info;
        return (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 9px", borderRadius: 99,
            background: meta.bg, color: meta.color,
            fontSize: 11, fontWeight: 600,
          }}>
            <span style={{ fontSize: 13 }}>{meta.icon}</span>
            {meta.label}
          </span>
        );
      },
    },
    {
      key: "description",
      header: "Event",
      render: (e) => <span style={{ fontSize: 12, color: "#0B1C24" }}>{e.description}</span>,
    },
    {
      key: "timestamp",
      header: "When",
      sortable: true,
      sortAccessor: (e) => e.timestamp,
      render: (e) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "#0B1C24" }}>{fmtRelative(e.timestamp)}</div>
          <div style={{ fontSize: 10, color: "#5A7A8A" }}>{new Date(e.timestamp).toLocaleString()}</div>
        </div>
      ),
      align: "right",
    },
  ];

  return (
    <OliverPageWrapper title="Activity Log" subtitle="Full audit trail" error={error} loading={loading}>
      <PageHeader
        title="Activity Log"
        subtitle="Every status transition, payment event, and customer interaction in OLIVER"
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Total events</div>
          <div className="stat-val">{events.length}</div>
          <div className="stat-delta neu">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Last 24 hours</div>
          <div className="stat-val">{last24h}</div>
          <div className="stat-delta neu">recent activity</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Last 7 days</div>
          <div className="stat-val">{last7d}</div>
          <div className="stat-delta neu">weekly volume</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Most common</div>
          <div className="stat-val" style={{ fontSize: 14 }}>{topType ? topType[0].replace(/_/g, " ") : "—"}</div>
          <div className="stat-delta neu">{topType ? `${topType[1]} events` : "—"}</div>
        </div>
      </div>

      {!events.length ? (
        <EmptyState
          title="No activity yet"
          description="Activity events appear here as you create jobs, send quotes, mark invoices paid, and more. The audit trail is automatic — every important action is recorded."
        />
      ) : (
        <>
          <FilterBar
            pills={TYPE_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search event description…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(e) => e.id}
            initialSort={{ key: "timestamp", direction: "desc" }}
            emptyMessage="No events match these filters."
          />
        </>
      )}
    </OliverPageWrapper>
  );
}

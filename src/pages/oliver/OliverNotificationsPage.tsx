import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState,
  StatusBadge, TimeRangeSelector, rangeForPreset,
  type Column, type TimeRange,
} from "../../components/oliver/ui";

interface Notification {
  notification_id: string;
  channel: string;
  to_address: string;
  subject?: string;
  template_id?: string;
  source_entity_type?: string;
  source_entity_id?: string;
  status: string;
  error_message?: string;
  created_at: string;
  sent_at?: string;
}

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "channel:email", label: "Email" },
  { key: "channel:sms", label: "SMS" },
  { key: "status:sent", label: "Sent" },
  { key: "status:queued", label: "Queued" },
  { key: "status:failed", label: "Failed" },
];

function fmtRelative(d?: string) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(d).toLocaleDateString();
}
function rangeToQuery(r: TimeRange): string {
  const params = new URLSearchParams();
  if (r.fromISO) params.set("from", r.fromISO);
  if (r.toISO) params.set("to", r.toISO);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function OliverNotificationsPage() {
  const { get, ready } = useOliverApi();
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [events, setEvents] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Notification[]>(`/notifications${rangeToQuery(range)}`);
      setEvents(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, range]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filtered = useMemo(() => {
    let list = events;
    if (filter.startsWith("channel:")) {
      const c = filter.split(":")[1];
      list = list.filter((e) => e.channel === c);
    } else if (filter.startsWith("status:")) {
      const s = filter.split(":")[1];
      list = list.filter((e) => e.status === s);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((e) =>
        e.to_address?.toLowerCase().includes(q) ||
        e.subject?.toLowerCase().includes(q) ||
        e.template_id?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [events, filter, search]);

  const sent = events.filter((e) => e.status === "sent").length;
  const queued = events.filter((e) => e.status === "queued").length;
  const failed = events.filter((e) => e.status === "failed").length;

  const columns: Column<Notification>[] = [
    {
      key: "channel",
      header: "Channel",
      render: (e) => (
        <span style={{
          display: "inline-block", fontSize: 10, fontWeight: 500,
          padding: "2px 8px", borderRadius: 999,
          background: e.channel === "sms" ? "#FEF3C7" : "#DBEAFE",
          color: e.channel === "sms" ? "#B45309" : "#1E40AF",
          textTransform: "uppercase",
        }}>{e.channel}</span>
      ),
    },
    {
      key: "to",
      header: "To",
      render: (e) => <span style={{ fontSize: 12, fontFamily: "monospace", color: "#0B1C24" }}>{e.to_address}</span>,
    },
    {
      key: "subject",
      header: "Subject",
      render: (e) => (
        <div>
          <div style={{ fontSize: 12, color: "#0B1C24" }}>{e.subject || "(no subject)"}</div>
          {e.template_id && <div style={{ fontSize: 10, color: "#5A7A8A" }}>{e.template_id}</div>}
        </div>
      ),
    },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status} /> },
    {
      key: "created",
      header: "When",
      sortable: true,
      sortAccessor: (e) => e.created_at,
      render: (e) => <span style={{ fontSize: 11, color: "#5A7A8A" }}>{fmtRelative(e.created_at)}</span>,
    },
  ];

  return (
    <OliverPageWrapper title="Notifications" subtitle="Email + SMS notification history" error={error} loading={loading}>
      <PageHeader
        title="Notifications"
        subtitle="Every email and SMS sent from OLIVER — delivery status, recipients, and templates"
        actions={<TimeRangeSelector value={range} onChange={setRange} />}
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Total</div>
          <div className="stat-val">{events.length}</div>
          <div className="stat-delta neu">in selected range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Sent</div>
          <div className="stat-val" style={{ color: "#059669" }}>{sent}</div>
          <div className="stat-delta neu">delivered</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Queued</div>
          <div className="stat-val" style={{ color: "#D97706" }}>{queued}</div>
          <div className="stat-delta neu">awaiting send</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Failed</div>
          <div className="stat-val" style={{ color: failed > 0 ? "#DC2626" : undefined }}>{failed}</div>
          <div className="stat-delta neu">delivery errors</div>
        </div>
      </div>

      {!events.length ? (
        <EmptyState
          title="No notifications in this range"
          description="OLIVER automatically sends emails when quotes are sent, invoices become due, jobs are confirmed, and payments are received. Activity will appear here as it happens."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search recipient, subject, or template…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(e) => e.notification_id}
            initialSort={{ key: "created", direction: "desc" }}
            emptyMessage="No notifications match these filters."
          />
        </>
      )}
    </OliverPageWrapper>
  );
}

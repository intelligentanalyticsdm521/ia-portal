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

/** Shape of GET/PATCH /settings/owner-alerts (oliver-api, migration 178). */
interface OwnerAlerts {
  push: boolean;
  sms: boolean;
  email: boolean;
  quiet_hours: { start?: string | null; end?: string | null; tz?: string };
  sms_daily_cap: number;
  events?: Record<string, boolean>;
  owner_phone?: string | null;
  owner_email?: string | null;
  quiet_hours_timezone?: string;
  kinds?: string[];
}

const KIND_LABELS: Record<string, string> = {
  "booking.requested": "Someone requests a booking",
  "booking.confirmed": "A booking is confirmed",
  // 2026-09-25 — the API has sent these three; the card printed the raw key.
  "booking.cancelled": "A customer cancels a booking",
  "booking.rescheduled": "A customer moves a booking",
  "reschedule.requested": "A customer asks to move a visit",
  "quote.accepted": "A quote is accepted",
  "invoice.paid": "An invoice is paid",
  "support_ticket.created": "A customer opens a support ticket",
  "review.new": "A new Google review arrives",
};

/**
 * "Alert me on my phone" — how the business hears about its own bookings,
 * accepted quotes, payments and tickets.
 *
 * This is the owner's side of notifications; everything below it on this page
 * is the log of what went out to CUSTOMERS. Deliberately small: no phone
 * number field (that lives once, on the business profile) and no way to raise
 * the daily SMS cap, which is a platform cost control rather than a setting.
 */
function OwnerAlertsCard() {
  const { get, patch, ready } = useOliverApi();
  const [cfg, setCfg] = useState<OwnerAlerts | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    get<OwnerAlerts>("/settings/owner-alerts")
      .then((d) => { if (!cancelled) setCfg(d); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load alert settings"); });
    return () => { cancelled = true; };
  }, [get, ready]);

  const save = useCallback(async (patchBody: Partial<OwnerAlerts>) => {
    setSaving(true); setSaved(false);
    // Optimistic: the toggles must feel like switches, not like forms.
    setCfg((prev) => (prev ? { ...prev, ...patchBody } as OwnerAlerts : prev));
    try {
      const next = await patch<OwnerAlerts>("/settings/owner-alerts", patchBody);
      setCfg((prev) => (prev ? { ...prev, ...next } : prev));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }, [patch]);

  if (loadError && !cfg) {
    return (
      <div className="card">
        <div style={{ fontSize: 12, color: "#B45309" }}>
          Alert settings unavailable: {loadError}
        </div>
      </div>
    );
  }
  if (!cfg) return null;

  const quietOn = !!(cfg.quiet_hours?.start && cfg.quiet_hours?.end);
  const tz = cfg.quiet_hours_timezone || cfg.quiet_hours?.tz || "";

  const channel = (key: "push" | "sms" | "email", label: string, hint: string, disabled?: string) => (
    <label
      key={key}
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
        border: "1px solid #E2E8F0", borderRadius: 8, flex: "1 1 200px",
        opacity: disabled ? 0.6 : 1, cursor: disabled ? "not-allowed" : "pointer",
      }}
      title={disabled || undefined}
    >
      <input
        type="checkbox"
        checked={!!cfg[key]}
        disabled={!!disabled || saving}
        onChange={(e) => save({ [key]: e.target.checked } as Partial<OwnerAlerts>)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{label}</span>
        <span style={{ display: "block", fontSize: 11, color: "#5A7A8A" }}>{disabled || hint}</span>
      </span>
    </label>
  );

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24", margin: 0 }}>Alert me on my phone</h3>
        <span style={{ fontSize: 11, color: saved ? "#059669" : "#5A7A8A" }}>
          {saving ? "Saving…" : saved ? "Saved" : "These are alerts to you, not to your customers"}
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        {channel("push", "Push", "A notification on your phone or desktop.")}
        {channel("email", "Email",
          cfg.owner_email ? `To ${cfg.owner_email}` : "No business email set",
          cfg.owner_email ? undefined : "Set your business email on the Business Setup page first.")}
        {channel("sms", "Text message",
          cfg.owner_phone ? `To ${cfg.owner_phone} — up to ${cfg.sms_daily_cap} a day` : "No business phone set",
          cfg.owner_phone ? undefined : "Set your business phone on the Business Setup page first.")}
      </div>

      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 8 }}>
        Your phone and email come from your Business Setup page, so they only ever need changing in one place.
      </div>

      {/* Quiet hours — text only, by design (O-3). A push is dismissible; a
          text at 2 a.m. is not. Texts raised during quiet hours are still
          queued straight away and go out at the end time. */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
          <input
            type="checkbox"
            checked={quietOn}
            disabled={saving}
            onChange={(e) => save({
              quiet_hours: e.target.checked
                ? { start: "21:00", end: "07:00" }
                : { start: null, end: null },
            })}
          />
          Quiet hours for text messages
        </label>
        {quietOn && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#0B1C24" }}>
            <span>No texts between</span>
            <input
              type="time"
              value={cfg.quiet_hours.start || "21:00"}
              disabled={saving}
              onChange={(e) => save({ quiet_hours: { ...cfg.quiet_hours, start: e.target.value } })}
              style={{ fontSize: 12, padding: "2px 6px", border: "1px solid #CBD5E1", borderRadius: 4 }}
            />
            <span>and</span>
            <input
              type="time"
              value={cfg.quiet_hours.end || "07:00"}
              disabled={saving}
              onChange={(e) => save({ quiet_hours: { ...cfg.quiet_hours, end: e.target.value } })}
              style={{ fontSize: 12, padding: "2px 6px", border: "1px solid #CBD5E1", borderRadius: 4 }}
            />
            {tz && <span style={{ color: "#5A7A8A", fontSize: 11 }}>({tz})</span>}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 6 }}>
          Texts raised during quiet hours are held and sent at the end time — nothing is lost. Push and email are not held.
        </div>
      </div>

      {/* What to be told about. Absent from the saved config means "all of
          them", so an unticked box is the only thing that turns anything off. */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #E2E8F0" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", marginBottom: 8 }}>Tell me when…</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 6 }}>
          {(cfg.kinds || Object.keys(KIND_LABELS)).map((k) => (
            <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#0B1C24" }}>
              <input
                type="checkbox"
                checked={cfg.events?.[k] !== false}
                disabled={saving}
                onChange={(e) => save({ events: { ...(cfg.events || {}), [k]: e.target.checked } })}
              />
              {KIND_LABELS[k] || k}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
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

      {/* How the BUSINESS hears about its own activity. Everything below is
          the log of what went out to customers — two different audiences on
          one page, so this sits first and says whose alerts it is. */}
      <OwnerAlertsCard />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Total</div>
          <div className="stat-val">{events.length}</div>
          <div className="stat-delta neu">in selected range</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Delivery rate</div>
          <div className="stat-val" style={{
            color: events.length === 0 ? undefined
              : sent / events.length >= 0.95 ? "#059669"
              : sent / events.length >= 0.8 ? "#D97706" : "#DC2626",
          }}>
            {events.length === 0 ? "—" : `${Math.round((sent / events.length) * 100)}%`}
          </div>
          <div className="stat-delta neu">{sent} of {events.length} delivered</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Queued</div>
          <div className="stat-val" style={{ color: queued > 0 ? "#D97706" : undefined }}>{queued}</div>
          <div className="stat-delta neu">awaiting send</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Failed</div>
          <div className="stat-val" style={{ color: failed > 0 ? "#DC2626" : undefined }}>{failed}</div>
          <div className="stat-delta neu">delivery errors</div>
        </div>
      </div>

      {/* Delivery-status stacked bar — visualizes where each batch ended up */}
      {events.length > 0 && (
        <div className="card">
          <div style={{ display: "flex", height: 24, borderRadius: 6, overflow: "hidden", border: "1px solid #E2E8F0" }}>
            {[
              { count: sent,   color: "#059669", label: "Sent" },
              { count: queued, color: "#D97706", label: "Queued" },
              { count: failed, color: "#DC2626", label: "Failed" },
            ].map((seg) => {
              const w = (seg.count / events.length) * 100;
              if (w === 0) return null;
              return (
                <div key={seg.label} title={`${seg.count} ${seg.label}`} style={{
                  width: `${w}%`, background: seg.color, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 700,
                }}>
                  {w > 12 && seg.count}
                </div>
              );
            })}
          </div>
        </div>
      )}

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

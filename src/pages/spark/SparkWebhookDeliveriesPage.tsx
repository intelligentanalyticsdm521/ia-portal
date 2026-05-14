// SparkWebhookDeliveriesPage — Inspect outbound webhook delivery history (v3.1).
//
// Mirrors SparkAuditLogPage but scoped to webhook deliveries: 4 stat tiles,
// a filter bar (days/status/event_type), a paginated table with per-row
// expand showing payload+response, and a right-rail panel with top-events
// + by-status distributions.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Webhook,
  Filter,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Repeat,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface Delivery {
  id: number;
  subscription_id: number;
  subscription_name: string | null;
  target_url: string;
  event_type: string;
  event_id: string | null;
  status_code: number | null;
  error_message: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  delivered_at: string | null;
  occurred_at: string;
  duration_ms: number | null;
}

interface DeliveryDetail extends Delivery {
  payload_json: string | null;
  response_body: string | null;
}

interface DeliveryListResponse {
  data: Delivery[];
  meta: {
    days: number;
    limit: number;
    offset: number;
    count: number;
  };
}

interface SummaryResponse {
  totals: { total: number; ok: number; failed: number; pending: number; avg_ms: number };
  by_event: Array<{ event_type: string; n: number }>;
  by_status: Array<{ status_code: number | null; n: number }>;
  by_day: Array<{ d: string; n: number }>;
  meta: { days: number };
}

type DaysWindow = 1 | 7 | 30;
type StatusFilter = "all" | "success" | "failed" | "pending";

const PAGE_SIZE = 100;

// ── Helpers ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 min ago";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function fmtAbsolute(iso: string): string {
  return new Date(iso).toLocaleString();
}

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try { return JSON.stringify(JSON.parse(raw), null, 2); }
  catch { return raw; }
}

function statusKind(d: Delivery): "ok" | "fail" | "pending" {
  if (d.status_code != null && d.status_code >= 200 && d.status_code < 300) return "ok";
  if (d.delivered_at) return "ok";
  if (d.status_code != null && d.status_code >= 400) return "fail";
  if (d.error_message) return "fail";
  return "pending";
}

// ── Page ─────────────────────────────────────────────────────────────

export function SparkWebhookDeliveriesPage() {
  const { get, post, ready } = useSparkApi();

  const [days, setDays] = useState<DaysWindow>(7);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [eventTypeInput, setEventTypeInput] = useState("");
  const [debouncedEventType, setDebouncedEventType] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEventType(eventTypeInput.trim()), 250);
    return () => clearTimeout(t);
  }, [eventTypeInput]);

  const [rows, setRows] = useState<Delivery[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Per-row expansion + lazy-loaded detail (payload+response).
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [detailById, setDetailById] = useState<Record<number, DeliveryDetail>>({});

  // In-flight retry button state.
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const buildQuery = useCallback((nextOffset: number): string => {
    const params = new URLSearchParams();
    params.set("days", String(days));
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(nextOffset));
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (debouncedEventType) params.set("event_type", debouncedEventType);
    return `?${params.toString()}`;
  }, [days, statusFilter, debouncedEventType]);

  const fetchInitial = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null); setOffset(0);
    try {
      const r = await get<DeliveryListResponse>(`/api/v1/webhook-deliveries${buildQuery(0)}`);
      const items = r.data || [];
      setRows(items);
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, buildQuery]);

  useEffect(() => { fetchInitial(); }, [fetchInitial]);

  const fetchSummary = useCallback(async () => {
    if (!ready) return;
    setSummaryLoading(true);
    try {
      const r = await get<SummaryResponse>(`/api/v1/webhook-deliveries/summary?days=${days}`);
      setSummary(r);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [get, ready, days]);

  useEffect(() => { fetchSummary(); }, [fetchSummary]);

  async function loadMore() {
    if (loadingMore || rows.length === 0) return;
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const r = await get<DeliveryListResponse>(`/api/v1/webhook-deliveries${buildQuery(nextOffset)}`);
      const items = r.data || [];
      setRows((prev) => [...prev, ...items]);
      setOffset(nextOffset);
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) { setError(err); }
    finally { setLoadingMore(false); }
  }

  async function toggleExpanded(row: Delivery) {
    const id = row.id;
    const isOpen = expanded.has(id);
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    if (!isOpen && !detailById[id]) {
      try {
        const r = await get<{ data: DeliveryDetail }>(
          `/api/v1/webhook-subscriptions/${row.subscription_id}/deliveries/${id}`
        );
        if (r?.data) setDetailById((prev) => ({ ...prev, [id]: r.data }));
      } catch {
        // Detail load is non-critical — header row stays useful.
      }
    }
  }

  async function retry(row: Delivery) {
    setRetryingId(row.id);
    try {
      await post(`/api/v1/webhook-deliveries/${row.id}/retry`, {});
      await fetchInitial();
      await fetchSummary();
    } catch (err) {
      alert(`Retry failed: ${(err as Error).message}`);
    } finally {
      setRetryingId(null);
    }
  }

  // ── Stats: 4 tiles + avg_ms ────────────────────────────────────────
  const statsPanel = useMemo(() => {
    const t = summary?.totals;
    function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
      return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex-1 min-w-[110px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: color || "#0B1C24" }}>{value}</div>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-stretch gap-2">
        <Tile label="Total" value={summaryLoading ? "…" : (t?.total ?? 0).toLocaleString()} />
        <Tile label="Success" value={summaryLoading ? "…" : (t?.ok ?? 0).toLocaleString()} color="#059669" />
        <Tile label="Failed" value={summaryLoading ? "…" : (t?.failed ?? 0).toLocaleString()} color="#DC2626" />
        <Tile label="Pending" value={summaryLoading ? "…" : (t?.pending ?? 0).toLocaleString()} color="#D97706" />
        <Tile label="Avg ms" value={summaryLoading ? "…" : Math.round(t?.avg_ms ?? 0).toLocaleString()} />
      </div>
    );
  }, [summary, summaryLoading]);

  // ── Filter bar ─────────────────────────────────────────────────────
  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Days</span>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value) as DaysWindow)}
          className="text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        >
          <option value={1}>1</option>
          <option value={7}>7</option>
          <option value={30}>30</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Status</span>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        >
          <option value="all">All</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Event type</span>
        <input
          type="text"
          value={eventTypeInput}
          onChange={(e) => setEventTypeInput(e.target.value)}
          placeholder="e.g. contact.created"
          className="w-44 text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      {(statusFilter !== "all" || debouncedEventType) && (
        <button
          type="button"
          onClick={() => { setStatusFilter("all"); setEventTypeInput(""); }}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Clear
        </button>
      )}
    </div>
  );

  // ── Right rail panels ──────────────────────────────────────────────
  function BarList({ title, rows: items, formatLabel }: {
    title: string;
    rows: Array<{ label: string; count: number }>;
    formatLabel?: (s: string) => string;
  }) {
    const max = items.reduce((m, r) => Math.max(m, r.count), 0) || 1;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</div>
          <div className="text-[10px] text-slate-400">Last {days}d</div>
        </div>
        {summaryLoading ? (
          <div className="text-xs text-slate-400 py-2">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-xs text-slate-400 py-2">No data.</div>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 10).map((r, idx) => {
              const pct = Math.max(2, Math.round((r.count / max) * 100));
              return (
                <li key={`${idx}-${r.label}`} className="text-xs">
                  <div className="flex items-center justify-between mb-0.5 gap-2">
                    <span className="font-medium text-slate-700 truncate min-w-0" title={r.label}>
                      {formatLabel ? formatLabel(r.label) : (r.label || "(none)")}
                    </span>
                    <span className="text-slate-500 tabular-nums flex-shrink-0">{r.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#EF6C33" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }

  const topEvents = useMemo(
    () => (summary?.by_event ?? []).map((r) => ({ label: r.event_type, count: r.n })),
    [summary]
  );
  const byStatus = useMemo(
    () => (summary?.by_status ?? []).map((r) => ({
      label: r.status_code == null ? "pending" : String(r.status_code),
      count: r.n,
    })),
    [summary]
  );

  const total = rows.length;

  return (
    <SparkPageShell
      title="Webhook Deliveries"
      subtitle={`${total.toLocaleString()} deliver${total === 1 ? "y" : "ies"} loaded`}
      help="Outbound webhook delivery log. See which events fired, where they went, and whether the destination accepted them. Failed deliveries can be retried individually."
      stats={statsPanel}
      filters={filters}
      actions={
        <button
          onClick={() => { fetchInitial(); fetchSummary(); }}
          className="text-sm px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      }
      loading={loading}
      error={error}
    >
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Webhook className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No webhook deliveries</div>
          <div className="text-xs text-slate-500 mt-1">Try expanding the time window or clearing filters.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="min-w-0">
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-24">Time</th>
                    <th className="text-left font-semibold px-3 py-2 w-20">Status</th>
                    <th className="text-left font-semibold px-3 py-2">Event</th>
                    <th className="text-left font-semibold px-3 py-2">Subscription</th>
                    <th className="text-left font-semibold px-3 py-2 w-16">Attempts</th>
                    <th className="text-left font-semibold px-3 py-2 w-20">Duration</th>
                    <th className="w-24 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const kind = statusKind(row);
                    const isOpen = expanded.has(row.id);
                    const detail = detailById[row.id];
                    return (
                      <DeliveryRow
                        key={row.id}
                        row={row}
                        kind={kind}
                        isOpen={isOpen}
                        detail={detail}
                        retrying={retryingId === row.id}
                        onToggle={() => toggleExpanded(row)}
                        onRetry={() => retry(row)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-center">
              {hasMore ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={loadMore}
                  className="text-sm px-4 py-2 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              ) : (
                <div className="text-[11px] text-slate-400">End of delivery log.</div>
              )}
            </div>
          </div>

          <aside className="space-y-3">
            <BarList title="Top events" rows={topEvents} />
            <BarList title="By status" rows={byStatus} />
          </aside>
        </div>
      )}
    </SparkPageShell>
  );
}

// ── Row ──────────────────────────────────────────────────────────────

function DeliveryRow(props: {
  row: Delivery;
  kind: "ok" | "fail" | "pending";
  isOpen: boolean;
  detail: DeliveryDetail | undefined;
  retrying: boolean;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const { row, kind, isOpen, detail, retrying, onToggle, onRetry } = props;
  const StatusIcon = kind === "ok" ? CheckCircle2 : kind === "fail" ? XCircle : Clock;
  const statusColor = kind === "ok" ? "#059669" : kind === "fail" ? "#DC2626" : "#D97706";
  return (
    <>
      <tr className="hover:bg-slate-50/60 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 align-top text-slate-500 tabular-nums whitespace-nowrap" title={fmtAbsolute(row.occurred_at)}>
          {timeAgo(row.occurred_at)}
        </td>
        <td className="px-3 py-2 align-top">
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: statusColor }}>
            <StatusIcon className="h-3 w-3" />
            {row.status_code != null ? row.status_code : kind}
          </span>
        </td>
        <td className="px-3 py-2 align-top">
          <code className="text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded font-mono break-all">
            {row.event_type}
          </code>
        </td>
        <td className="px-3 py-2 align-top text-slate-700 break-all">
          {row.subscription_name || `Subscription #${row.subscription_id}`}
        </td>
        <td className="px-3 py-2 align-top text-slate-500 tabular-nums">{row.attempt_count}</td>
        <td className="px-3 py-2 align-top text-slate-500 tabular-nums">
          {row.duration_ms != null ? `${row.duration_ms} ms` : "—"}
        </td>
        <td className="px-2 py-2 align-top text-right whitespace-nowrap">
          {kind === "fail" && (
            <button
              type="button"
              disabled={retrying}
              onClick={(e) => { e.stopPropagation(); onRetry(); }}
              className="text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center gap-1 mr-1"
              title="Retry delivery"
            >
              {retrying ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Repeat className="h-3 w-3" />}
              Retry
            </button>
          )}
          {isOpen
            ? <ChevronUp className="h-3.5 w-3.5 text-slate-400 inline-block" />
            : <ChevronDown className="h-3.5 w-3.5 text-slate-400 inline-block" />}
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-slate-50/60">
          <td colSpan={7} className="px-3 py-3">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3 text-[11px]">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Target URL</div>
                <code className="text-slate-700 break-all">{row.target_url}</code>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 mt-2">Occurred</div>
                <div className="text-slate-700 tabular-nums">{fmtAbsolute(row.occurred_at)}</div>
                {row.delivered_at && (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 mt-2">Delivered</div>
                    <div className="text-slate-700 tabular-nums">{fmtAbsolute(row.delivered_at)}</div>
                  </>
                )}
                {row.next_retry_at && (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 mt-2">Next retry</div>
                    <div className="text-slate-700 tabular-nums">{fmtAbsolute(row.next_retry_at)}</div>
                  </>
                )}
                {row.error_message && (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 mt-2">Error</div>
                    <div className="text-rose-700 break-all">{row.error_message}</div>
                  </>
                )}
                {row.event_id && (
                  <>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 mt-2">Event ID</div>
                    <code className="text-slate-700 break-all">{row.event_id}</code>
                  </>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Payload</div>
                  {detail ? (
                    detail.payload_json ? (
                      <pre className="text-[10.5px] text-slate-700 bg-white border border-slate-200 rounded p-2 max-h-44 overflow-auto whitespace-pre-wrap break-all">
{prettyJson(detail.payload_json)}
                      </pre>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )
                  ) : (
                    <span className="text-slate-400 italic">Loading…</span>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">Response body</div>
                  {detail ? (
                    detail.response_body ? (
                      <pre className="text-[10.5px] text-slate-700 bg-white border border-slate-200 rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">
{detail.response_body}
                      </pre>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )
                  ) : (
                    <span className="text-slate-400 italic">Loading…</span>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default SparkWebhookDeliveriesPage;

// SparkActivityStreamPage — Cross-product contact activity timeline
//
// Renders a paginated activity stream from `/api/v1/activity` plus a
// compact 30-day summary chart from `/api/v1/activity/summary`.
//
// Filterable by contact_id, product (spark / oliver / arion / all), and
// free-text activity_type. Pagination is keyset-style via before_id so
// new rows arriving at the head don't shift the page.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Activity,
  AlertCircle,
  Briefcase,
  CreditCard,
  Mail,
  MessageSquare,
  Phone,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

type ProductKey = "spark" | "oliver" | "arion";

interface ActivityRow {
  id: number;
  contact_id: number | null;
  product: ProductKey | string;
  activity_type: string;
  title: string;
  detail: string | null;
  icon: string | null;
  actor_type: string | null;
  actor_id: string | null;
  ref_entity_type: string | null;
  ref_entity_id: string | null;
  metadata_json: string | null;
  occurred_at: string;
}

interface ActivityListResponse {
  items: ActivityRow[];
  total?: number;
  has_more?: boolean;
}

interface ActivitySummaryRow {
  activity_type: string;
  count: number;
}

interface ActivitySummaryResponse {
  items: ActivitySummaryRow[];
  days?: number;
}

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const PRODUCT_COLORS: Record<string, string> = {
  spark: "#EF6C33",
  oliver: "#FEC82C",
  arion: "#2D9CDB",
};

// Whitelist of lucide icons we explicitly support. The activity row's
// `icon` field is a free-form string supplied by the back end, so we
// fall back to the generic Activity icon for anything unknown.
const ICON_MAP: Record<string, LucideIcon> = {
  UserPlus,
  Mail,
  Star,
  Phone,
  MessageSquare,
  Briefcase,
  CreditCard,
  AlertCircle,
};

function pickIcon(name: string | null): LucideIcon {
  if (!name) return Activity;
  return ICON_MAP[name] ?? Activity;
}

// ── Time formatting ──────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 minute ago";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? "" : "s"} ago`;
  const diffYr = Math.floor(diffMo / 12);
  return `${diffYr} year${diffYr === 1 ? "" : "s"} ago`;
}

function fmtAbsolute(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ── Page ─────────────────────────────────────────────────────────────

export function SparkActivityStreamPage() {
  const { get, ready } = useSparkApi();

  // Filters
  const [contactIdInput, setContactIdInput] = useState("");
  const [productFilter, setProductFilter] = useState<"all" | ProductKey>("all");
  const [typeFilter, setTypeFilter] = useState("");

  // Debounce filter values so we don't refetch on every keystroke.
  const [debouncedContactId, setDebouncedContactId] = useState("");
  const [debouncedType, setDebouncedType] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedContactId(contactIdInput.trim()), 250);
    return () => clearTimeout(t);
  }, [contactIdInput]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedType(typeFilter.trim()), 250);
    return () => clearTimeout(t);
  }, [typeFilter]);

  // Data
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // 30-day summary
  const [summary, setSummary] = useState<ActivitySummaryRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);

  function buildQuery(beforeId?: number): string {
    const params = new URLSearchParams();
    if (debouncedContactId && /^\d+$/.test(debouncedContactId)) {
      params.set("contact_id", debouncedContactId);
    }
    if (productFilter !== "all") {
      params.set("product", productFilter);
    }
    if (debouncedType) {
      params.set("type", debouncedType);
    }
    params.set("limit", String(PAGE_SIZE));
    if (beforeId != null) {
      params.set("before_id", String(beforeId));
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  }

  const fetchInitial = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<ActivityListResponse>(`/api/v1/activity${buildQuery()}`);
      const items = r.items || [];
      setRows(items);
      setHasMore(r.has_more ?? items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get, ready, debouncedContactId, productFilter, debouncedType]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const fetchSummary = useCallback(async () => {
    if (!ready) return;
    setSummaryLoading(true);
    try {
      const r = await get<ActivitySummaryResponse>(`/api/v1/activity/summary?days=30`);
      setSummary(r.items || []);
    } catch {
      // Summary is non-critical — swallow errors so a broken summary
      // endpoint doesn't break the main timeline.
      setSummary([]);
    } finally {
      setSummaryLoading(false);
    }
  }, [get, ready]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  async function loadMore() {
    if (loadingMore || rows.length === 0) return;
    const lastId = rows[rows.length - 1].id;
    setLoadingMore(true);
    try {
      const r = await get<ActivityListResponse>(`/api/v1/activity${buildQuery(lastId)}`);
      const items = r.items || [];
      setRows((prev) => [...prev, ...items]);
      setHasMore(r.has_more ?? items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const total = rows.length;

  // ── Summary panel (top-5 horizontal bar chart) ─────────────────────
  const summaryPanel = useMemo(() => {
    const top5 = [...summary]
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const max = top5.reduce((m, r) => Math.max(m, r.count), 0) || 1;

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Top 5 activity types
          </div>
          <div className="text-[10px] text-slate-400">Last 30 days</div>
        </div>
        {summaryLoading ? (
          <div className="text-xs text-slate-400 py-2">Loading summary…</div>
        ) : top5.length === 0 ? (
          <div className="text-xs text-slate-400 py-2">No activity in the last 30 days.</div>
        ) : (
          <ul className="space-y-2">
            {top5.map((r) => {
              const pct = Math.max(2, Math.round((r.count / max) * 100));
              return (
                <li key={r.activity_type} className="text-xs">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-medium text-slate-700 truncate">{r.activity_type}</span>
                    <span className="text-slate-500 tabular-nums">{r.count.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: "#EF6C33" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  }, [summary, summaryLoading]);

  // ── Filter bar ─────────────────────────────────────────────────────
  const filters = (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">
          Contact ID
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={contactIdInput}
          onChange={(e) => setContactIdInput(e.target.value.replace(/[^\d]/g, ""))}
          placeholder="e.g. 1234"
          className="w-28 text-xs border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">
          Product
        </span>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value as "all" | ProductKey)}
          className="text-xs border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        >
          <option value="all">All</option>
          <option value="spark">SPARK</option>
          <option value="oliver">OLIVER</option>
          <option value="arion">ARION</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">
          Activity Type
        </span>
        <input
          type="text"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="e.g. email_sent"
          className="w-44 text-xs border border-slate-300 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      {(debouncedContactId || productFilter !== "all" || debouncedType) && (
        <button
          type="button"
          onClick={() => {
            setContactIdInput("");
            setProductFilter("all");
            setTypeFilter("");
          }}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Clear
        </button>
      )}
    </div>
  );

  return (
    <SparkPageShell
      title="Activity Stream"
      subtitle={`${total.toLocaleString()} entr${total === 1 ? "y" : "ies"} loaded`}
      help="Unified contact activity timeline across SPARK, OLIVER, and ARION. Newest first, paginated 50 at a time."
      stats={summaryPanel}
      filters={filters}
      loading={loading}
      error={error}
    >
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <Activity className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No activity found</div>
          <div className="text-xs text-slate-500 mt-1">
            Try adjusting the filters above, or wait for new activity to arrive.
          </div>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((row) => {
              const Icon = pickIcon(row.icon);
              const productColor = PRODUCT_COLORS[row.product] || "#64748B";
              return (
                <li
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-slate-300 transition-colors"
                >
                  <div
                    className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center"
                    style={{ background: "#F4F7F9", color: "#0B1C24" }}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900 text-sm truncate">
                        {row.title}
                      </span>
                      <span
                        className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full text-white tracking-wide"
                        style={{ background: productColor }}
                      >
                        {row.product}
                      </span>
                      <code className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded">
                        {row.activity_type}
                      </code>
                    </div>
                    {row.detail && (
                      <div className="mt-0.5 text-xs text-slate-600 whitespace-pre-wrap break-words">
                        {row.detail}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                      {row.contact_id != null && (
                        <span>Contact #{row.contact_id}</span>
                      )}
                      {row.actor_type && (
                        <span>
                          · {row.actor_type}
                          {row.actor_id ? ` ${row.actor_id}` : ""}
                        </span>
                      )}
                      {row.ref_entity_type && row.ref_entity_id && (
                        <span>
                          · {row.ref_entity_type} #{row.ref_entity_id}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex-shrink-0 text-[11px] text-slate-500 text-right tabular-nums"
                    title={fmtAbsolute(row.occurred_at)}
                  >
                    {timeAgo(row.occurred_at)}
                  </div>
                </li>
              );
            })}
          </ul>
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
              <div className="text-[11px] text-slate-400">End of timeline.</div>
            )}
          </div>
        </>
      )}
    </SparkPageShell>
  );
}

export default SparkActivityStreamPage;

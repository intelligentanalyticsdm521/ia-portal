// SparkAuditLogPage — Tenant-wide audit log dashboard (v1.16)
//
// Renders a paginated audit-entry table from `/api/v1/audit-log` plus
// summary tiles, a tiny by-day sparkline, and right-rail top-actions /
// top-users panels from `/api/v1/audit-log/summary`.
//
// Filterable by days window, product, action prefix, entity_type, and
// user_email. Text inputs debounced 250ms. Pagination is offset+limit
// (50 per page) with "Load more" appending to the list.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  FileText,
  User,
  ShieldAlert,
  Filter,
  ChevronDown,
  ChevronUp,
  Download,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number;
  tenant_id: number | string;
  user_id: string | null;
  user_email: string | null;
  product: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  metadata_json: string | null;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
}

interface AuditListResponse {
  data: AuditEntry[];
  meta: {
    days: number;
    limit: number;
    offset: number;
    count: number;
  };
}

interface ByProductRow { product: string; count: number; }
interface ByActionRow { action: string; count: number; }
interface ByUserRow { user_email: string; count: number; }
interface ByDayRow { d: string; count: number; }

interface AuditSummaryResponse {
  totals: {
    events: number;
    unique_users: number;
    unique_actions: number;
  };
  by_product: ByProductRow[];
  by_action: ByActionRow[];
  by_user: ByUserRow[];
  by_day: ByDayRow[];
  meta: { days: number };
}

type DaysWindow = 7 | 30 | 90 | 365;
type ProductFilter = "all" | "spark" | "oliver" | "arion" | "platform";

// ── Constants ────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const PRODUCT_COLORS: Record<string, string> = {
  spark: "#EF6C33",
  oliver: "#FEC82C",
  arion: "#2D9CDB",
};

const SLATE = "#64748B";

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

// Try to pretty-print the stored metadata blob. Audit metadata is
// stored as a JSON string in the DB; we attempt to parse, and fall back
// to the raw string if it isn't valid JSON.
function prettyMetadata(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

// ── Page ─────────────────────────────────────────────────────────────

export function SparkAuditLogPage() {
  const { get, download, ready } = useSparkApi();

  // Filters
  const [days, setDays] = useState<DaysWindow>(30);
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [actionInput, setActionInput] = useState("");
  const [entityTypeInput, setEntityTypeInput] = useState("");
  const [userEmailInput, setUserEmailInput] = useState("");

  // Debounce text inputs so we don't refetch on every keystroke.
  const [debouncedAction, setDebouncedAction] = useState("");
  const [debouncedEntityType, setDebouncedEntityType] = useState("");
  const [debouncedUserEmail, setDebouncedUserEmail] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAction(actionInput.trim()), 250);
    return () => clearTimeout(t);
  }, [actionInput]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedEntityType(entityTypeInput.trim()), 250);
    return () => clearTimeout(t);
  }, [entityTypeInput]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUserEmail(userEmailInput.trim()), 250);
    return () => clearTimeout(t);
  }, [userEmailInput]);

  // Data — paginated audit list
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);

  // Export state — the button says what it is doing and cannot be pressed twice.
  const [exporting, setExporting] = useState(false);

  // Summary
  const [summary, setSummary] = useState<AuditSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Expanded-row state — entry IDs whose metadata/IP/UA detail is shown.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const buildQuery = useCallback((nextOffset: number): string => {
    const params = new URLSearchParams();
    params.set("days", String(days));
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(nextOffset));
    if (productFilter !== "all") params.set("product", productFilter);
    if (debouncedAction) params.set("action", debouncedAction);
    if (debouncedEntityType) params.set("entity_type", debouncedEntityType);
    if (debouncedUserEmail) params.set("user_id", debouncedUserEmail);
    return `?${params.toString()}`;
  }, [days, productFilter, debouncedAction, debouncedEntityType, debouncedUserEmail]);

  const fetchInitial = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    setOffset(0);
    try {
      const r = await get<AuditListResponse>(`/api/v1/audit-log${buildQuery(0)}`);
      const items = r.data || [];
      setRows(items);
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready, buildQuery]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const fetchSummary = useCallback(async () => {
    if (!ready) return;
    setSummaryLoading(true);
    try {
      const r = await get<AuditSummaryResponse>(`/api/v1/audit-log/summary?days=${days}`);
      setSummary(r);
    } catch {
      // Summary is non-critical — swallow errors so a broken summary
      // endpoint doesn't break the main audit table.
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [get, ready, days]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  async function loadMore() {
    if (loadingMore || rows.length === 0) return;
    const nextOffset = offset + PAGE_SIZE;
    setLoadingMore(true);
    try {
      const r = await get<AuditListResponse>(`/api/v1/audit-log${buildQuery(nextOffset)}`);
      const items = r.data || [];
      setRows((prev) => [...prev, ...items]);
      setOffset(nextOffset);
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const total = rows.length;

  // ── Stats slot: 4 tiles + inline by_day sparkline ──────────────────
  const statsPanel = useMemo(() => {
    const t = summary?.totals;
    const byDay = summary?.by_day ?? [];
    const max = byDay.reduce((m, r) => Math.max(m, r.count), 0) || 1;

    function Tile({ label, value }: { label: string; value: string }) {
      return (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex-1 min-w-[120px]">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-0.5 text-lg font-semibold text-[#0B1C24] tabular-nums">{value}</div>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-stretch gap-2">
        <Tile label="Events" value={summaryLoading ? "…" : (t?.events ?? 0).toLocaleString()} />
        <Tile label="Unique users" value={summaryLoading ? "…" : (t?.unique_users ?? 0).toLocaleString()} />
        <Tile label="Unique actions" value={summaryLoading ? "…" : (t?.unique_actions ?? 0).toLocaleString()} />
        <Tile label="Days" value={String(days)} />
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 flex-[2] min-w-[200px]">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Events by day
            </div>
            <div className="text-[10px] text-slate-400">last {days}d</div>
          </div>
          {summaryLoading ? (
            <div className="text-xs text-slate-400 py-1">Loading…</div>
          ) : byDay.length === 0 ? (
            <div className="text-xs text-slate-400 py-1">No events.</div>
          ) : (
            <div className="mt-1 flex items-end gap-[2px] h-8" aria-label="Events per day">
              {byDay.map((r) => {
                const pct = Math.max(4, Math.round((r.count / max) * 100));
                return (
                  <div
                    key={r.d}
                    className="flex-1 min-w-[2px] rounded-sm"
                    style={{ height: `${pct}%`, background: "#EF6C33" }}
                    title={`${r.d}: ${r.count.toLocaleString()}`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }, [summary, summaryLoading, days]);

  // ── Filter bar ─────────────────────────────────────────────────────
  const hasActiveFilters =
    productFilter !== "all" ||
    !!debouncedAction ||
    !!debouncedEntityType ||
    !!debouncedUserEmail;

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
          <option value={7}>7</option>
          <option value={30}>30</option>
          <option value={90}>90</option>
          <option value={365}>365</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Product</span>
        <select
          value={productFilter}
          onChange={(e) => setProductFilter(e.target.value as ProductFilter)}
          className="text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        >
          <option value="all">All</option>
          <option value="spark">SPARK</option>
          <option value="oliver">OLIVER</option>
          <option value="arion">ARION</option>
          <option value="platform">Platform</option>
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Action</span>
        <input
          type="text"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          placeholder="e.g. contact."
          className="w-40 text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">Entity Type</span>
        <input
          type="text"
          value={entityTypeInput}
          onChange={(e) => setEntityTypeInput(e.target.value)}
          placeholder="e.g. contact"
          className="w-36 text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-slate-600">
        <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">User Email</span>
        <input
          type="text"
          value={userEmailInput}
          onChange={(e) => setUserEmailInput(e.target.value)}
          placeholder="e.g. user@…"
          className="w-44 text-xs border border-slate-200 rounded px-2 py-1 focus:border-[#EF6C33] focus:ring-1 focus:ring-[#EF6C33]"
        />
      </label>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => {
            setProductFilter("all");
            setActionInput("");
            setEntityTypeInput("");
            setUserEmailInput("");
          }}
          className="text-xs text-slate-500 hover:text-slate-700 underline"
        >
          Clear
        </button>
      )}
    </div>
  );

  // ── Right-rail summary panels ──────────────────────────────────────
  function BarList({ title, icon: Icon, rows: items, labelKey }: {
    title: string;
    icon: typeof User;
    rows: Array<{ label: string; count: number }>;
    labelKey: string;
  }) {
    const max = items.reduce((m, r) => Math.max(m, r.count), 0) || 1;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-slate-500" />
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {title}
            </div>
          </div>
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
                <li key={`${labelKey}-${idx}-${r.label}`} className="text-xs">
                  <div className="flex items-center justify-between mb-0.5 gap-2">
                    <span className="font-medium text-slate-700 truncate min-w-0" title={r.label}>
                      {r.label || "(none)"}
                    </span>
                    <span className="text-slate-500 tabular-nums flex-shrink-0">
                      {r.count.toLocaleString()}
                    </span>
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
  }

  const topActions = useMemo(() => {
    const items = (summary?.by_action ?? []).map(r => ({ label: r.action, count: r.count }));
    return items;
  }, [summary]);

  const topUsers = useMemo(() => {
    const items = (summary?.by_user ?? []).map(r => ({ label: r.user_email, count: r.count }));
    return items;
  }, [summary]);

  // Export — the entries you are looking at, as a spreadsheet.
  //
  // THIS USED TO BE `window.open`, and it could not work in production. An
  // anchor or a new tab sends no headers, and /api/v1/audit-log/export.csv is
  // behind authVerify() and requireHeaders — so the request arrived with no
  // bearer token and no business, and the client got a 401 in a blank tab
  // instead of a file. The code's own comment admitted it ("the user will need
  // to add a download token mechanism in a follow-up").
  //
  // `download` is that mechanism, and it already existed: the same helper the
  // Lead Inbox export uses, which fetches with the real Authorization header
  // and the business header, honours the server's Content-Disposition name and
  // hands the blob to the browser. One download mechanism, not two.
  const onExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("days", String(days));
      if (productFilter !== "all") params.set("product", productFilter);
      if (debouncedAction) params.set("action", debouncedAction);
      if (debouncedEntityType) params.set("entity_type", debouncedEntityType);
      if (debouncedUserEmail) params.set("user_id", debouncedUserEmail);
      params.set("max", "10000");
      await download(
        `/api/v1/audit-log/export.csv?${params.toString()}`,
        `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      );
    } catch (err) {
      alert((err as Error)?.message || "The export didn't finish. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  }, [download, exporting, days, productFilter, debouncedAction, debouncedEntityType, debouncedUserEmail]);

  return (
    <SparkPageShell
      title="Audit Log"
      subtitle={`${total.toLocaleString()} entr${total === 1 ? "y" : "ies"} loaded`}
      help="Tenant-wide audit trail across SPARK, OLIVER, ARION, and the IADM platform. Each row records who did what, to which entity, and when. Filter by product, action prefix, entity type, or user email."
      stats={statsPanel}
      filters={filters}
      actions={
        <button
          type="button"
          onClick={onExport}
          disabled={exporting}
          className="text-sm px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1"
          title={exporting ? "Building your file…" : "Export current filter as CSV (up to 10,000 rows)"}
        >
          <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
        </button>
      }
      loading={loading}
      error={error}
    >
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-700">No audit entries found</div>
          <div className="text-xs text-slate-500 mt-1">
            Try expanding the time window or clearing filters.
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          {/* Main: paginated audit table */}
          <div className="min-w-0">
            <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2 w-28">Time</th>
                    <th className="text-left font-semibold px-3 py-2 w-20">Product</th>
                    <th className="text-left font-semibold px-3 py-2">Action</th>
                    <th className="text-left font-semibold px-3 py-2">Summary</th>
                    <th className="text-left font-semibold px-3 py-2">User</th>
                    <th className="text-left font-semibold px-3 py-2">Entity</th>
                    <th className="w-8 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const productKey = (row.product || "").toLowerCase();
                    const productColor = PRODUCT_COLORS[productKey] || SLATE;
                    const isOpen = expanded.has(row.id);
                    const hasDetail = !!(row.metadata_json || row.ip_address || row.user_agent);
                    return (
                      <>
                        <tr
                          key={row.id}
                          className="hover:bg-slate-50/60 cursor-pointer"
                          onClick={() => hasDetail && toggleExpanded(row.id)}
                        >
                          <td className="px-3 py-2 align-top text-slate-500 tabular-nums whitespace-nowrap" title={fmtAbsolute(row.occurred_at)}>
                            {timeAgo(row.occurred_at)}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span
                              className="inline-block text-[10px] font-medium uppercase px-1.5 py-0.5 rounded-full text-white tracking-wide"
                              style={{ background: productColor }}
                            >
                              {row.product || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <code className="text-[11px] text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded font-mono break-all">
                              {row.action}
                            </code>
                          </td>
                          <td className="px-3 py-2 align-top text-slate-700 break-words">
                            {row.summary || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-500 break-all">
                            {row.user_email || <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-3 py-2 align-top text-slate-500 whitespace-nowrap">
                            {row.entity_type ? (
                              <span>
                                {row.entity_type}
                                {row.entity_id ? <span className="text-slate-400"> #{row.entity_id}</span> : null}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 align-top text-right">
                            {hasDetail ? (
                              isOpen ? (
                                <ChevronUp className="h-3.5 w-3.5 text-slate-400 inline-block" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-400 inline-block" />
                              )
                            ) : null}
                          </td>
                        </tr>
                        {isOpen && hasDetail && (
                          <tr key={`${row.id}-detail`} className="bg-slate-50/60">
                            <td colSpan={7} className="px-3 py-3">
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
                                <div className="md:col-span-1 space-y-2">
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5 flex items-center gap-1">
                                      <ShieldAlert className="h-3 w-3" /> IP Address
                                    </div>
                                    <code className="text-slate-700 break-all">
                                      {row.ip_address || <span className="text-slate-400">—</span>}
                                    </code>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                                      User Agent
                                    </div>
                                    <div className="text-slate-700 break-all">
                                      {row.user_agent || <span className="text-slate-400">—</span>}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                                      Occurred At
                                    </div>
                                    <div className="text-slate-700 tabular-nums">
                                      {fmtAbsolute(row.occurred_at)}
                                    </div>
                                  </div>
                                </div>
                                <div className="md:col-span-2">
                                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-0.5">
                                    Metadata
                                  </div>
                                  {row.metadata_json ? (
                                    <pre className="text-[10.5px] text-slate-700 bg-white border border-slate-200 rounded p-2 max-h-60 overflow-auto whitespace-pre-wrap break-all">
{prettyMetadata(row.metadata_json)}
                                    </pre>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
                <div className="text-[11px] text-slate-400">End of audit log.</div>
              )}
            </div>
          </div>

          {/* Right rail: top actions / top users */}
          <aside className="space-y-3">
            <BarList
              title="Top actions"
              icon={FileText}
              rows={topActions}
              labelKey="action"
            />
            <BarList
              title="Top users"
              icon={User}
              rows={topUsers}
              labelKey="user"
            />
          </aside>
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkAuditLogPage;

// SocialCalendarPage — wave 2 of the My Brand stack (LUMEN-API migration 050).
//
// Shows every scheduled/published social post across every connected channel
// in one of two views:
//
//   • List view  — paged table with status + platform filters. Standard tier
//                  only sees this (calendar grid is gated to Pro+).
//   • Calendar   — month grid with platform-colored chips per post. Click a
//                  chip to open the post-detail modal (edit / reschedule /
//                  cancel). Pro+ unlocks drag-to-reschedule across days.
//
// API surface (already shipped on LUMEN-API):
//   GET    /api/v1/my-brand/social/posts?from=&to=&status=&platform=
//   PATCH  /api/v1/my-brand/social/posts/:id/reschedule { scheduled_for }
//   DELETE /api/v1/my-brand/social/posts/:id   (only "scheduled" can cancel)
//
// Tier gate is informational — the LUMEN-API also enforces server-side, so we
// just toggle the default view (list for Standard, calendar for Pro+) and
// disable the grid toggle entirely on Lite/Standard. Drag-reschedule is
// further gated to Pro+ even when calendar view is reachable.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  List,
  LayoutGrid,
  Plus,
  Share2,
  X,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useProductTier, tierMeets } from "../../hooks/useProductTier";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { IadmModal } from "../../components/IadmModal";

// ── Types ─────────────────────────────────────────────────────────────────

// F-MB.SOC.7 (2026-06-22) — `pending_approval` and `rejected` are surfaced
// so the calendar reflects the moderation queue alongside the scheduler.
type PostStatus = "scheduled" | "published" | "failed" | "draft" | "cancelled" | "pending_approval" | "rejected";

interface SocialPost {
  id: number;
  scheduled_for: string | null;   // ISO timestamp; null = draft
  published_at: string | null;    // ISO timestamp once published
  status: PostStatus;
  body: string;
  platforms: string[];            // ["facebook","instagram",...]
  media_urls?: string[];
  error_reason?: string | null;
  created_at: string;
}

// Platform identity — keep colors in lockstep with the IconRail / analytics
// page so a chip color always means the same channel everywhere in the app.
const PLATFORM_META: Record<string, { label: string; color: string }> = {
  facebook:  { label: "Facebook",        color: "#1877F2" },
  instagram: { label: "Instagram",       color: "#E4405F" },
  linkedin:  { label: "LinkedIn",        color: "#0A66C2" },
  x:         { label: "X",               color: "#0F1419" },
  twitter:   { label: "Twitter",         color: "#1DA1F2" },
  tiktok:    { label: "TikTok",          color: "#000000" },
  youtube:   { label: "YouTube",         color: "#FF0000" },
  gbp:       { label: "Google Business", color: "#34A853" },
};
function platformMeta(p: string) {
  return PLATFORM_META[p] || { label: p, color: "#64748B" };
}

const STATUS_META: Record<PostStatus, { label: string; className: string }> = {
  scheduled:        { label: "Scheduled",      className: "bg-amber-100 text-amber-800" },
  published:        { label: "Published",      className: "bg-emerald-100 text-emerald-800" },
  failed:           { label: "Failed",         className: "bg-rose-100 text-rose-700" },
  draft:            { label: "Draft",          className: "bg-slate-100 text-slate-700" },
  cancelled:        { label: "Cancelled",      className: "bg-slate-100 text-slate-500 line-through" },
  // F-MB.SOC.7 — amber dot is conveyed by the same warm palette as scheduled,
  // plus the "Pending approval" label so calendar viewers can distinguish a
  // submitted-but-unreleased post from one that's locked into the dispatcher.
  pending_approval: { label: "Pending approval", className: "bg-amber-100 text-amber-900 ring-1 ring-amber-400" },
  rejected:         { label: "Rejected",       className: "bg-rose-100 text-rose-700 line-through" },
};

// ── Date helpers (local-tz, no library) ───────────────────────────────────
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function startOfGrid(d: Date) {
  const first = startOfMonth(d);
  const day = first.getDay(); // 0=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - day);
  return start;
}
function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function endOfWeek(d: Date) {
  const r = startOfWeek(d);
  r.setDate(r.getDate() + 6);
  r.setHours(23, 59, 59, 999);
  return r;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

type View = "list" | "calendar";
type GridScope = "month" | "week";

// ── Page ──────────────────────────────────────────────────────────────────
export function SocialCalendarPage() {
  const { get, patch, del, ready } = useSparkApi();
  const { tier, ready: tierReady } = useProductTier("spark");
  // My Brand Wave 3 gate — Calendar requires Standard (list view). Lite
  // tenants see the upgrade card; Standard+ continues into the existing
  // list/grid logic where grid is further gated to Pro+.
  const gate = useMyBrandTier();
  if (gate.ready && !gate.meets("social_calendar_list")) {
    return (
      <div className="p-6">
        <MyBrandUpgradeGate
          featureName="Social Calendar"
          requiredTier={gate.requiredTier("social_calendar_list")}
          currentTier={gate.tier}
        />
      </div>
    );
  }
  // Calendar grid only unlocked at Pro+. Drag-to-reschedule also Pro+.
  const hasCalendar = tierMeets(tier, "pro");
  const hasDrag = hasCalendar;

  // Default view depends on tier — Standard starts in list, Pro+ in calendar.
  const [view, setView] = useState<View>("list");
  const [scope, setScope] = useState<GridScope>("month");
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openPost, setOpenPost] = useState<SocialPost | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  // Drag state — { postId, originalDate }. Stores nothing if no drag in progress.
  const [drag, setDrag] = useState<{ id: number; from: string } | null>(null);

  // Default view flip-flop: when tier resolves and we have calendar access,
  // switch default to calendar. Standard stays on list. Don't override if the
  // user manually toggled.
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (!tierReady || userToggled) return;
    setView(hasCalendar ? "calendar" : "list");
  }, [tierReady, hasCalendar, userToggled]);

  // Window of posts to fetch. For calendar = grid window. For list = wide
  // 90-day window centered on cursor (paginated client-side, with intent
  // to swap to server pagination in v1.1 once volume warrants it).
  const fromDate = useMemo(() => {
    if (view === "calendar") {
      return scope === "month" ? startOfGrid(cursor) : startOfWeek(cursor);
    }
    return addDays(new Date(), -30);
  }, [view, scope, cursor]);
  const toDate = useMemo(() => {
    if (view === "calendar") {
      return scope === "month" ? addDays(startOfGrid(cursor), 41) : endOfWeek(cursor);
    }
    return addDays(new Date(), 60);
  }, [view, scope, cursor]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({
        from: ymd(fromDate),
        to:   ymd(toDate),
      });
      if (statusFilter !== "all")   qs.set("status", statusFilter);
      if (platformFilter !== "all") qs.set("platform", platformFilter);
      // useSparkApi.get auto-unwraps {data:...} envelope — see memory
      // feedback "oliver_api_envelope_unwrap" (same applies to sparkApi).
      const r = await get<SocialPost[] | { data: SocialPost[] }>(`/api/v1/my-brand/social/posts?${qs}`);
      const arr = Array.isArray(r) ? r : (r?.data || []);
      setPosts(arr);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, fromDate, toDate, statusFilter, platformFilter]);

  useEffect(() => { load(); }, [load]);

  // Bucket posts by YYYY-MM-DD of their scheduled_for / published_at — calendar
  // groups by intent: scheduled posts on the day they should fire, published
  // on the day they fired.
  const postsByDay = useMemo(() => {
    const m: Record<string, SocialPost[]> = {};
    for (const p of posts) {
      const dt = p.scheduled_for || p.published_at;
      if (!dt) continue;
      const key = ymd(new Date(dt));
      (m[key] = m[key] || []).push(p);
    }
    return m;
  }, [posts]);

  // List-view pagination (client-side until volume warrants server-side).
  const totalPages = Math.max(1, Math.ceil(posts.length / pageSize));
  const pagedPosts = useMemo(() => {
    const sorted = [...posts].sort((a, b) => {
      const av = (a.scheduled_for || a.published_at || a.created_at || "");
      const bv = (b.scheduled_for || b.published_at || b.created_at || "");
      return bv.localeCompare(av);
    });
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [posts, page]);

  // ── Mutation handlers ───────────────────────────────────────────────────
  async function reschedulePost(id: number, scheduled_for: string) {
    try {
      await patch(`/api/v1/my-brand/social/posts/${id}/reschedule`, { scheduled_for });
      await load();
    } catch (e) {
      // Surface error to the user — typical cause is "already published"
      // (server returns 409). Re-throw so callers can display inline.
      throw e;
    }
  }
  async function cancelPost(id: number) {
    if (!confirm("Cancel this scheduled post? This cannot be undone.")) return;
    try {
      await del(`/api/v1/my-brand/social/posts/${id}`);
      setOpenPost(null);
      await load();
    } catch (e) {
      alert(`Cancel failed: ${(e as Error).message}`);
    }
  }

  // ── Drag-to-reschedule handlers ─────────────────────────────────────────
  function onChipDragStart(p: SocialPost, e: React.DragEvent) {
    if (!hasDrag || p.status !== "scheduled") { e.preventDefault(); return; }
    setDrag({ id: p.id, from: ymd(new Date(p.scheduled_for!)) });
    e.dataTransfer.effectAllowed = "move";
  }
  function onDayDragOver(e: React.DragEvent) {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  async function onDayDrop(targetDay: string, e: React.DragEvent) {
    if (!drag) return;
    e.preventDefault();
    if (targetDay === drag.from) { setDrag(null); return; }
    // Build new ISO. Preserve the original H:M; only the date changes.
    const original = posts.find(p => p.id === drag.id);
    if (!original?.scheduled_for) { setDrag(null); return; }
    const orig = new Date(original.scheduled_for);
    const [yy, mm, dd] = targetDay.split("-").map(Number);
    const next = new Date(yy, mm - 1, dd, orig.getHours(), orig.getMinutes(), 0, 0);
    try {
      await reschedulePost(drag.id, next.toISOString());
    } catch (err) {
      alert(`Reschedule failed: ${(err as Error).message}`);
    } finally {
      setDrag(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const today = ymd(new Date());

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Social Calendar</h1>
          <p className="mt-1 text-sm text-slate-600 max-w-2xl">
            Every scheduled, published, and failed post across every connected channel.
            {hasCalendar
              ? " Drag chips between days to reschedule on the fly."
              : " Upgrade to Pro for the calendar grid view and drag-to-reschedule."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle
            view={view}
            onChange={(v) => { setUserToggled(true); setView(v); }}
            hasCalendar={hasCalendar}
          />
          <Link
            to="/app/services/my_brand_compose"
            className="inline-flex items-center gap-1.5 rounded-md bg-[#1A3A4A] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0B1C24]"
          >
            <Plus className="h-4 w-4" /> New post
          </Link>
        </div>
      </header>

      <FilterRow
        statusFilter={statusFilter}
        onStatusChange={(s) => { setStatusFilter(s); setPage(1); }}
        platformFilter={platformFilter}
        onPlatformChange={(p) => { setPlatformFilter(p); setPage(1); }}
        connectedPlatforms={uniquePlatforms(posts)}
      />

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {loading && posts.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
      ) : posts.length === 0 ? (
        <EmptyState />
      ) : view === "calendar" && hasCalendar ? (
        <CalendarView
          cursor={cursor}
          setCursor={setCursor}
          scope={scope}
          setScope={setScope}
          postsByDay={postsByDay}
          today={today}
          onChipClick={setOpenPost}
          onChipDragStart={onChipDragStart}
          onDayDragOver={onDayDragOver}
          onDayDrop={onDayDrop}
          dragActive={!!drag}
          hasDrag={hasDrag}
        />
      ) : (
        <ListView
          posts={pagedPosts}
          totalCount={posts.length}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          onRowClick={setOpenPost}
        />
      )}

      {openPost && (
        <PostDetailModal
          post={openPost}
          onClose={() => setOpenPost(null)}
          onCancel={() => cancelPost(openPost.id)}
          onReschedule={async (newWhen) => {
            try {
              await reschedulePost(openPost.id, newWhen);
              setOpenPost(null);
            } catch (e) {
              alert(`Reschedule failed: ${(e as Error).message}`);
            }
          }}
        />
      )}
    </div>
  );
}

// ── View toggle ───────────────────────────────────────────────────────────
function ViewToggle({ view, onChange, hasCalendar }: {
  view: View;
  onChange: (v: View) => void;
  hasCalendar: boolean;
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-300 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
          view === "list" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <List className="h-3.5 w-3.5" /> List
      </button>
      <button
        type="button"
        onClick={() => hasCalendar && onChange("calendar")}
        disabled={!hasCalendar}
        title={hasCalendar ? "" : "Calendar view available on Pro+"}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
          view === "calendar"
            ? "bg-slate-900 text-white"
            : hasCalendar
              ? "text-slate-700 hover:bg-slate-50"
              : "text-slate-400 cursor-not-allowed"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> Calendar {!hasCalendar && <span className="text-[10px]">Pro+</span>}
      </button>
    </div>
  );
}

// ── Filter row ────────────────────────────────────────────────────────────
function FilterRow({
  statusFilter, onStatusChange, platformFilter, onPlatformChange, connectedPlatforms,
}: {
  statusFilter: PostStatus | "all";
  onStatusChange: (s: PostStatus | "all") => void;
  platformFilter: string;
  onPlatformChange: (p: string) => void;
  connectedPlatforms: string[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <Filter className="h-3.5 w-3.5 text-slate-500" />
      <label className="text-xs font-medium text-slate-600">Status</label>
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value as PostStatus | "all")}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        <option value="all">All</option>
        <option value="scheduled">Scheduled</option>
        <option value="published">Published</option>
        <option value="failed">Failed</option>
        <option value="draft">Draft</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <label className="text-xs font-medium text-slate-600 ml-3">Platform</label>
      <select
        value={platformFilter}
        onChange={(e) => onPlatformChange(e.target.value)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
      >
        <option value="all">All</option>
        {connectedPlatforms.map((p) => (
          <option key={p} value={p}>{platformMeta(p).label}</option>
        ))}
      </select>
    </div>
  );
}

function uniquePlatforms(posts: SocialPost[]): string[] {
  const seen = new Set<string>();
  for (const p of posts) {
    for (const plat of (p.platforms || [])) seen.add(plat);
  }
  return Array.from(seen).sort();
}

// ── Empty state ───────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
      <Share2 className="h-10 w-10 mx-auto text-slate-300 mb-3" />
      <h3 className="text-sm font-semibold text-slate-900">No posts yet</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
        Connect a channel and schedule your first post — it will appear here as soon as it's queued.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link
          to="/app/services/my_brand_social_channels"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Connect a channel
        </Link>
        <Link
          to="/app/services/my_brand_compose"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#1A3A4A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0B1C24]"
        >
          <Plus className="h-3.5 w-3.5" /> New post
        </Link>
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────
function ListView({
  posts, totalCount, page, totalPages, onPageChange, onRowClick,
}: {
  posts: SocialPost[];
  totalCount: number;
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  onRowClick: (p: SocialPost) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">When</th>
            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Platforms</th>
            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Body</th>
            <th className="text-left px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
            <th className="text-right px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-600">Actions</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr
              key={p.id}
              onClick={() => onRowClick(p)}
              className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
            >
              <td className="px-4 py-2 whitespace-nowrap text-xs text-slate-700">
                {formatWhen(p)}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-1 flex-wrap">
                  {(p.platforms || []).map((plat) => (
                    <span
                      key={plat}
                      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      style={{ background: platformMeta(plat).color }}
                    >
                      {platformMeta(plat).label}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-2 max-w-md">
                <div className="text-sm text-slate-700 line-clamp-2">{p.body || <em className="text-slate-400">(no body)</em>}</div>
              </td>
              <td className="px-4 py-2">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[p.status]?.className || "bg-slate-100 text-slate-600"}`}>
                  {STATUS_META[p.status]?.label || p.status}
                </span>
                {p.status === "failed" && p.error_reason && (
                  <div className="mt-0.5 text-[10px] text-rose-700 max-w-[200px] line-clamp-1" title={p.error_reason}>
                    {p.error_reason}
                  </div>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onRowClick(p); }}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 text-xs text-slate-600">
          <span>{totalCount} post{totalCount === 1 ? "" : "s"} • page {page} of {totalPages}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >Prev</button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
            >Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatWhen(p: SocialPost): string {
  const dt = p.scheduled_for || p.published_at || p.created_at;
  if (!dt) return "—";
  const d = new Date(dt);
  return d.toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

// ── Calendar view ─────────────────────────────────────────────────────────
function CalendarView({
  cursor, setCursor, scope, setScope, postsByDay, today,
  onChipClick, onChipDragStart, onDayDragOver, onDayDrop, dragActive, hasDrag,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  scope: GridScope;
  setScope: (s: GridScope) => void;
  postsByDay: Record<string, SocialPost[]>;
  today: string;
  onChipClick: (p: SocialPost) => void;
  onChipDragStart: (p: SocialPost, e: React.DragEvent) => void;
  onDayDragOver: (e: React.DragEvent) => void;
  onDayDrop: (day: string, e: React.DragEvent) => void;
  dragActive: boolean;
  hasDrag: boolean;
}) {
  const gridStart = scope === "month" ? startOfGrid(cursor) : startOfWeek(cursor);
  const cellCount = scope === "month" ? 42 : 7;

  function nav(delta: -1 | 1) {
    if (scope === "month") {
      setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    } else {
      setCursor(addDays(cursor, delta * 7));
    }
  }
  function jumpToday() {
    setCursor(scope === "month" ? startOfMonth(new Date()) : startOfWeek(new Date()));
  }

  const label = scope === "month"
    ? cursor.toLocaleString(undefined, { month: "long", year: "numeric" })
    : `${startOfWeek(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${endOfWeek(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => nav(-1)} className="p-1.5 rounded hover:bg-slate-100" aria-label="Previous">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold text-slate-900 min-w-[200px] text-center">{label}</h3>
          <button onClick={() => nav(1)} className="p-1.5 rounded hover:bg-slate-100" aria-label="Next">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={jumpToday}
            className="ml-2 text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >Today</button>
        </div>
        <div className="inline-flex rounded-md border border-slate-300 bg-white overflow-hidden text-xs">
          <button
            onClick={() => setScope("month")}
            className={`px-2.5 py-1 font-semibold ${scope === "month" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >Month</button>
          <button
            onClick={() => setScope("week")}
            className={`px-2.5 py-1 font-semibold ${scope === "week" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >Week</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-t-lg overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 rounded-b-lg overflow-hidden">
        {Array.from({ length: cellCount }, (_, i) => {
          const day = addDays(gridStart, i);
          const dayKey = ymd(day);
          const inCurrentMonth = scope === "week" || day.getMonth() === cursor.getMonth();
          const isToday = dayKey === today;
          const dayPosts = postsByDay[dayKey] || [];
          const maxVisible = scope === "month" ? 3 : 8;

          return (
            <div
              key={dayKey}
              onDragOver={hasDrag ? onDayDragOver : undefined}
              onDrop={hasDrag ? (e) => onDayDrop(dayKey, e) : undefined}
              className={`bg-white p-1.5 text-left flex flex-col gap-0.5 transition-colors ${
                inCurrentMonth ? "" : "bg-slate-50"
              } ${isToday ? "ring-2 ring-inset ring-[#FEC82C]" : ""} ${
                dragActive ? "outline-dashed outline-1 outline-blue-300" : ""
              }`}
              style={{ minHeight: scope === "month" ? 88 : 220 }}
            >
              <div className={`text-[11px] font-medium ${
                inCurrentMonth ? "text-slate-700" : "text-slate-400"
              } ${isToday ? "text-[#1A3A4A] font-bold" : ""}`}>
                {day.getDate()}
              </div>
              <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                {dayPosts.slice(0, maxVisible).map((p) => (
                  <PostChip key={p.id} post={p} onClick={() => onChipClick(p)} onDragStart={onChipDragStart} draggable={hasDrag && p.status === "scheduled"} />
                ))}
                {dayPosts.length > maxVisible && (
                  <div className="text-[9px] text-slate-500 px-1">+{dayPosts.length - maxVisible} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostChip({ post, onClick, onDragStart, draggable }: {
  post: SocialPost;
  onClick: () => void;
  onDragStart: (p: SocialPost, e: React.DragEvent) => void;
  draggable: boolean;
}) {
  const primary = post.platforms?.[0] || "x";
  const meta = platformMeta(primary);
  const isMulti = (post.platforms?.length || 0) > 1;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => onDragStart(post, e)}
      onClick={onClick}
      title={`${post.body?.slice(0, 120) || ""}${post.body && post.body.length > 120 ? "…" : ""}`}
      className="group relative text-[9px] truncate rounded px-1 py-px font-medium text-white text-left hover:opacity-90 transition-opacity"
      style={{ background: meta.color }}
    >
      <span className="font-bold mr-1">{meta.label}{isMulti && `+${post.platforms.length - 1}`}</span>
      {post.body?.slice(0, 24) || ""}
    </button>
  );
}

// ── Detail modal ──────────────────────────────────────────────────────────
function PostDetailModal({
  post, onClose, onCancel, onReschedule,
}: {
  post: SocialPost;
  onClose: () => void;
  onCancel: () => void;
  onReschedule: (iso: string) => void;
}) {
  const isScheduled = post.status === "scheduled";
  const [newWhen, setNewWhen] = useState<string>(() => {
    const dt = post.scheduled_for || post.published_at || new Date().toISOString();
    const d = new Date(dt);
    // toISOString → "YYYY-MM-DDTHH:MM:SS.sssZ" — datetime-local wants
    // "YYYY-MM-DDTHH:MM" in LOCAL time. Build manually.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const meta = STATUS_META[post.status];

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="SOCIAL POST"
      title={`Post #${post.id}`}
      subtitle={meta?.label || post.status}
      size="info"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >Close</button>
          {isScheduled && (
            <>
              <button
                type="button"
                onClick={() => onReschedule(new Date(newWhen).toISOString())}
                className="rounded-md bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >Reschedule</button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700"
              >Cancel post</button>
            </>
          )}
        </>
      }
    >
      <div className="p-5 space-y-4">
        <div>
          <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">Platforms</div>
          <div className="flex items-center gap-1 flex-wrap">
            {(post.platforms || []).map((plat) => (
              <span
                key={plat}
                className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold text-white"
                style={{ background: platformMeta(plat).color }}
              >
                {platformMeta(plat).label}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">When</div>
          <div className="text-sm text-slate-800">{formatWhen(post)}</div>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">Body</div>
          <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {post.body || <em className="text-slate-400">(no body)</em>}
          </div>
        </div>
        {post.error_reason && (
          <div>
            <div className="text-[11px] font-bold uppercase text-rose-700 mb-1">Failure reason</div>
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {post.error_reason}
            </div>
          </div>
        )}
        {(post.media_urls || []).length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase text-slate-500 mb-1">Media</div>
            <div className="grid grid-cols-4 gap-2">
              {(post.media_urls || []).map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded border border-slate-200">
                  <img src={url} alt={`media ${i + 1}`} className="h-full w-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}
        {isScheduled && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-blue-700 flex-shrink-0" />
            <label className="text-xs font-medium text-blue-900">Reschedule to:</label>
            <input
              type="datetime-local"
              value={newWhen}
              onChange={(e) => setNewWhen(e.target.value)}
              className="rounded border border-blue-300 bg-white px-2 py-1 text-xs"
            />
          </div>
        )}
        <div className="flex items-center justify-end pt-2">
          <Link
            to="/app/services/my_brand_compose"
            onClick={onClose}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            Open in composer →
          </Link>
        </div>
      </div>
    </IadmModal>
  );
}

export default SocialCalendarPage;

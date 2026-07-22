// SocialCalendarPage — wave 2 of the My Brand stack (LUMEN-API migration 050).
//
// Canonical SparkPageShell library page: every scheduled/published social
// post across every connected channel in one of two views:
//
//   • List view  — spark-table with status + platform + search filters.
//                  Standard tier only sees this (grid is gated to Pro+).
//   • Calendar   — month grid with platform-colored chips per post. Click a
//                  chip to open the post-detail modal (edit / reschedule /
//                  cancel). Pro+ unlocks drag-to-reschedule across days.
//
// The composer is a centered IadmModal (SocialComposerModal) launched from
// "+ New post", the empty-state CTA, and the detail modal's "Edit in
// composer" path. The /my_brand_compose route renders this page with the
// modal pre-opened (see SocialComposerPage.tsx shim) so deep links work.
//
// API surface (already shipped on LUMEN-API):
//   GET    /api/v1/my-brand/social/posts?from=&to=
//   PATCH  /api/v1/my-brand/social/posts/:id/reschedule { scheduled_for }
//   DELETE /api/v1/my-brand/social/posts/:id   (only "scheduled" can cancel)
//
// Fetch is keyed ONLY on the date window; status/platform/search filter
// client-side in one useMemo (convention_data_fetching — no per-facet
// refetch). Tier gate is informational — LUMEN-API also enforces
// server-side; we toggle the default view (list for Standard, calendar for
// Pro+) and disable the grid toggle on Lite/Standard.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  List,
  LayoutGrid,
  Plus,
  Share2,
} from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useProductTier, tierMeets } from "../../hooks/useProductTier";
import { useMyBrandTier } from "../../hooks/useMyBrandTier";
import { MyBrandUpgradeGate } from "../../components/MyBrandUpgradeGate";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { IadmModal, IadmButton } from "../../components/IadmModal";
import {
  SocialComposerModal,
  type ComposerPrefillPost,
  type Platform,
} from "../../components/myBrand/SocialComposerModal";

// ── Types ─────────────────────────────────────────────────────────────────

// F-MB.SOC.7 (2026-06-22) — `pending_approval` and `rejected` are surfaced
// so the calendar reflects the moderation queue alongside the scheduler.
type PostStatus = "scheduled" | "published" | "failed" | "draft" | "cancelled" | "pending_approval" | "rejected";

interface SocialPost {
  id: string;                     // GUID (API: post_id)
  scheduled_for: string | null;   // ISO timestamp; null = draft
  published_at: string | null;    // ISO timestamp once published
  status: PostStatus;
  body: string;
  platforms: string[];            // ["facebook","instagram",...]
  content_type?: string;          // post | story | reel
  media_urls?: string[];
  error_reason?: string | null;
  created_at: string;
}

// The list API speaks post_id / body_default / targets[] — this page (and
// the composer prefill) speak the id / body / platforms view model above.
// Normalize at the fetch boundary; before this, every reschedule/cancel hit
// /posts/undefined/... and chips showed no platform or body (same latent
// contract-mismatch class as the composer destinations bug, fixed 6a888e6).
interface ApiTarget { platform: string; status?: string | null; error_class?: string | null }
function normalizePost(row: Record<string, unknown>): SocialPost {
  const targets = (row.targets as ApiTarget[] | undefined) || [];
  const failed = targets.filter((t) => t.status === "failed");
  return {
    id: String(row.post_id ?? row.id ?? ""),
    scheduled_for: (row.scheduled_for as string | null) ?? null,
    published_at: (row.published_at as string | null) ?? null,
    status: row.status as PostStatus,
    body: String(row.body_default ?? row.body ?? ""),
    platforms: Array.isArray(row.platforms)
      ? (row.platforms as string[])
      : targets.map((t) => t.platform),
    content_type: (row.content_type as string | undefined) || "post",
    error_reason: (row.error_reason as string | null | undefined)
      ?? (failed.length
        ? failed.map((t) => `${platformMeta(t.platform).label}: ${t.error_class || "failed"}`).join(" · ")
        : null),
    created_at: String(row.created_at ?? ""),
  };
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

// Status filter chips — LOCKED 3-lane customer vocabulary (re-cut §2,
// 2026-07-22): Draft · Scheduled · Published. pending_approval/rejected are
// leftovers of the approval workflow that moved to Consulting; cancelled
// posts are just gone from the surfaces; failed is NOT a lane — a failed
// post stays VISIBLE under All/Published-adjacent slots with its red
// "didn't publish" marker (STATUS_META keeps the failed treatment), it just
// isn't a filter chip. The status column itself is untouched.
const STATUS_FILTERS: Array<{ key: PostStatus | "all"; label: string }> = [
  { key: "all",       label: "All" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
  { key: "draft",     label: "Drafts" },
];

// ── Date helpers (local-tz, no library) ───────────────────────────────────
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
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

/** What the composer modal opens with — empty = blank new post. */
interface ComposerLaunch {
  destinations?: Platform[];
  assetIds?: string[];
  post?: ComposerPrefillPost;
}

interface SocialCalendarPageProps {
  /** Deep-link support (/my_brand_compose): open the composer on mount. */
  initialComposerOpen?: boolean;
  /** Deep-link prefill forwarded from ?destination= / ?asset_ids=. */
  composerDefaults?: { destinations?: Platform[]; assetIds?: string[] };
}

// ── Page ──────────────────────────────────────────────────────────────────
export function SocialCalendarPage({ initialComposerOpen = false, composerDefaults }: SocialCalendarPageProps = {}) {
  const { get, patch, del, ready } = useSparkApi();
  const { tier, ready: tierReady } = useProductTier("spark");
  // My Brand Wave 3 gate — Calendar requires Standard (list view). Lite
  // tenants see the upgrade card; Standard+ continues into the existing
  // list/grid logic where grid is further gated to Pro+. NOTE: the gate's
  // early return lives BELOW every hook declaration — returning before the
  // hooks made the hook count change when gate.ready flipped mid-session
  // (rules-of-hooks crash).
  const gate = useMyBrandTier();
  // Calendar grid only unlocked at Pro+. Drag-to-reschedule also Pro+.
  const hasCalendar = tierMeets(tier, "pro");
  const hasDrag = hasCalendar;

  // Default view depends on tier — Standard starts in list, Pro+ in calendar.
  const [view, setView] = useState<View>("list");
  const [scope, setScope] = useState<GridScope>("month");
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()));
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [openPost, setOpenPost] = useState<SocialPost | null>(null);
  const [composer, setComposer] = useState<ComposerLaunch | null>(
    initialComposerOpen
      ? { destinations: composerDefaults?.destinations, assetIds: composerDefaults?.assetIds }
      : null,
  );
  const [page, setPage] = useState(1);
  const pageSize = 25;
  // Drag state — { postId, originalDate }. Stores nothing if no drag in progress.
  const [drag, setDrag] = useState<{ id: string; from: string } | null>(null);

  // Default view flip-flop: when tier resolves and we have calendar access,
  // switch default to calendar. Standard stays on list. Don't override if the
  // user manually toggled.
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (!tierReady || userToggled) return;
    setView(hasCalendar ? "calendar" : "list");
  }, [tierReady, hasCalendar, userToggled]);

  // Window of posts to fetch. For calendar = grid window. For list = wide
  // 90-day window centered on today (paginated client-side, with intent
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
      // Window-only query — status/platform/search apply CLIENT-side in the
      // `filtered` useMemo below (canon: fetch once per window, no
      // render-driven refetch per facet change).
      const qs = new URLSearchParams({
        from: ymd(fromDate),
        to:   ymd(toDate),
      });
      // useSparkApi does NOT auto-unwrap the {data:...} envelope — handle
      // both shapes (see memory feedback "oliver_api_envelope_unwrap").
      type ApiRow = Record<string, unknown>;
      const r = await get<ApiRow[] | { data: ApiRow[] }>(`/api/v1/my-brand/social/posts?${qs}`);
      const arr = Array.isArray(r) ? r : (r?.data || []);
      setPosts(arr.map(normalizePost));
    } catch (e) {
      // Keep the raw error — SparkPageShell renders Error messages and
      // short-circuits tier_gate objects to the upgrade gate.
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, ready, fromDate, toDate]);

  useEffect(() => { load(); }, [load]);

  // Client-side facet filtering over the fetched window (canon
  // SparkTemplatesPage pattern — one useMemo, lowercased .includes search).
  const filtered = useMemo(() => {
    let list = posts;
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (platformFilter !== "all") list = list.filter((p) => (p.platforms || []).includes(platformFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => (p.body || "").toLowerCase().includes(q));
    }
    return list;
  }, [posts, statusFilter, platformFilter, search]);

  // Bucket posts by YYYY-MM-DD of their scheduled_for / published_at — calendar
  // groups by intent: scheduled posts on the day they should fire, published
  // on the day they fired.
  const postsByDay = useMemo(() => {
    const m: Record<string, SocialPost[]> = {};
    for (const p of filtered) {
      const dt = p.scheduled_for || p.published_at;
      if (!dt) continue;
      const key = ymd(new Date(dt));
      (m[key] = m[key] || []).push(p);
    }
    return m;
  }, [filtered]);

  // List-view pagination (client-side until volume warrants server-side).
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedPosts = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const av = (a.scheduled_for || a.published_at || a.created_at || "");
      const bv = (b.scheduled_for || b.published_at || b.created_at || "");
      return bv.localeCompare(av);
    });
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [filtered, page]);

  // ── Mutation handlers ───────────────────────────────────────────────────
  // Both throw on failure — PostDetailModal surfaces errors inline (no
  // window.alert; see the canon inline AlertTriangle banner there).
  const reschedulePost = useCallback(async (id: string, scheduled_for: string) => {
    // Typical failure is "already published" (server returns 409).
    await patch(`/api/v1/my-brand/social/posts/${id}/reschedule`, { scheduled_for });
    await load();
  }, [patch, load]);
  const cancelPost = useCallback(async (id: string) => {
    await del(`/api/v1/my-brand/social/posts/${id}`);
    await load();
  }, [del, load]);

  // ── Drag-to-reschedule handlers ─────────────────────────────────────────
  const [dragError, setDragError] = useState<string | null>(null);
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
      setDragError(null);
      await reschedulePost(drag.id, next.toISOString());
    } catch (err) {
      setDragError(`Reschedule failed: ${(err as Error).message}`);
    } finally {
      setDrag(null);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  const today = ymd(new Date());
  const pageTitle = "Social Calendar";
  const pageSubtitle = "Every scheduled and published post across your channels";

  // Tier gate — rendered through the shell so the sticky header survives,
  // mirroring the shell's own OliverUpgradeGate short-circuit shape.
  if (gate.ready && !gate.meets("social_calendar_list")) {
    return (
      <SparkPageShell title={pageTitle} subtitle={pageSubtitle}>
        <MyBrandUpgradeGate
          featureName="Social Calendar"
          requiredTier={gate.requiredTier("social_calendar_list")}
          currentTier={gate.tier}
        />
      </SparkPageShell>
    );
  }

  return (
    <SparkPageShell
      title={pageTitle}
      subtitle={pageSubtitle}
      help="One calendar for every scheduled, published, and failed post. Click a post to reschedule or cancel it; + New post opens the composer. Pro unlocks the month grid and drag-to-reschedule."
      actions={
        <>
          <ViewToggle
            view={view}
            onChange={(v) => { setUserToggled(true); setView(v); }}
            hasCalendar={hasCalendar}
          />
          <button
            type="button"
            onClick={() => setComposer({})}
            className="rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25] inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> New post
          </button>
        </>
      }
      filters={
        <div className="flex flex-wrap items-center gap-2">
          {/* Status segmented control */}
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => { setStatusFilter(s.key); setPage(1); }}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {/* Platform filter */}
          <select
            value={platformFilter}
            onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="all">All platforms</option>
            {uniquePlatforms(posts).map((p) => (
              <option key={p} value={p}>{platformMeta(p).label}</option>
            ))}
          </select>
          {/* Search */}
          <input
            type="search"
            placeholder="Search posts"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="text-xs border border-slate-300 rounded-md px-2 py-1 w-44"
          />
        </div>
      }
      loading={loading}
      error={error}
    >
      {dragError && (
        <div className="mb-3 rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span className="flex-1">{dragError}</span>
          <button type="button" onClick={() => setDragError(null)} className="font-semibold hover:underline">Dismiss</button>
        </div>
      )}

      {posts.length === 0 ? (
        <EmptyState onNew={() => setComposer({})} />
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          No posts match the current filters.
        </div>
      ) : view === "calendar" && hasCalendar ? (
        <div className="flex flex-col xl:flex-row gap-4">
          <div className="flex-1 min-w-0">
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
          </div>
          <UpcomingRail posts={filtered} onOpen={setOpenPost} />
        </div>
      ) : (
        <ListView
          posts={pagedPosts}
          totalCount={filtered.length}
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
          onCancel={async () => { await cancelPost(openPost.id); setOpenPost(null); }}
          onReschedule={async (iso) => { await reschedulePost(openPost.id, iso); setOpenPost(null); }}
          onEdit={() => { setComposer({ post: openPost }); setOpenPost(null); }}
        />
      )}

      {composer && (
        <SocialComposerModal
          open
          onClose={() => setComposer(null)}
          onChanged={() => { setComposer(null); load(); }}
          initialDestinations={composer.destinations}
          initialAssetIds={composer.assetIds}
          initialPost={composer.post || null}
        />
      )}
    </SparkPageShell>
  );
}

// ── View toggle (canon segmented control) ─────────────────────────────────
function ViewToggle({ view, onChange, hasCalendar }: {
  view: View;
  onChange: (v: View) => void;
  hasCalendar: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
      <button
        type="button"
        onClick={() => onChange("list")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          view === "list" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
        }`}
      >
        <List className="h-3.5 w-3.5" /> List
      </button>
      <button
        type="button"
        onClick={() => hasCalendar && onChange("calendar")}
        disabled={!hasCalendar}
        title={hasCalendar ? "" : "Calendar view available on Pro+"}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          view === "calendar"
            ? "bg-white text-slate-900 shadow-sm"
            : hasCalendar
              ? "text-slate-500 hover:text-slate-700"
              : "text-slate-300 cursor-not-allowed"
        }`}
      >
        <LayoutGrid className="h-3.5 w-3.5" /> Calendar {!hasCalendar && <span className="text-[10px]">Pro+</span>}
      </button>
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

// ── Empty state (canon dashed card, actionable) ───────────────────────────
function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <Share2 className="h-7 w-7 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900">No posts yet</h3>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        Connect a channel and schedule your first post — it will appear here as soon as it's queued.
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link
          to="/app/services/my_brand_social_channels"
          className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Connect a channel
        </Link>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1 rounded-lg bg-[#EF6C33] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#d75a25]"
        >
          <Plus className="h-3.5 w-3.5" /> New post
        </button>
      </div>
    </div>
  );
}

// ── List view (spark-table directly on the page body — no wrapper card) ───
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
    <div className="spark-table-wrap">
      <div className="overflow-x-auto">
      <table className="spark-table">
        <thead>
          <tr>
            <th>When</th>
            <th>Platforms</th>
            <th>Body</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr
              key={p.id}
              onClick={() => onRowClick(p)}
              className="spark-table-row cursor-pointer"
            >
              <td className="whitespace-nowrap text-xs text-slate-700">
                {formatWhen(p)}
              </td>
              <td>
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
              <td className="max-w-md">
                <div className="text-sm text-slate-700 line-clamp-2">{p.body || <em className="text-slate-400">(no body)</em>}</div>
              </td>
              <td>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_META[p.status]?.className || "bg-slate-100 text-slate-600"}`}>
                  {STATUS_META[p.status]?.label || p.status}
                </span>
                {p.status === "failed" && p.error_reason && (
                  <div className="mt-0.5 text-[10px] text-rose-700 max-w-[200px] line-clamp-1" title={p.error_reason}>
                    {p.error_reason}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {totalPages > 1 && (
        <div className="spark-table-footer text-xs text-slate-600">
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
        {/* Month/Week scope — canon segmented control */}
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-xs">
          <button
            onClick={() => setScope("month")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${scope === "month" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >Month</button>
          <button
            onClick={() => setScope("week")}
            className={`rounded-md px-2.5 py-1 font-medium transition-colors ${scope === "week" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
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
              } ${isToday ? "ring-2 ring-inset ring-[#EF6C33]" : ""} ${
                dragActive ? "outline-dashed outline-1 outline-blue-300" : ""
              }`}
              style={{ minHeight: scope === "month" ? 88 : 220 }}
            >
              <div className={`text-[11px] font-medium ${
                inCurrentMonth ? "text-slate-700" : "text-slate-400"
              } ${isToday ? "text-[#EF6C33] font-bold" : ""}`}>
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

// ── Upcoming rail (re-cut §9 item 5) ──────────────────────────────────────
// The next scheduled posts in the viewed window, chronological — the "what
// fires next" list Meta Business Suite pairs with its calendar. Computed
// from the already-fetched window (respects the active facet filters); a
// past-due-but-still-scheduled post sorts first, which is exactly where the
// eye should land (the dispatcher claims it within 5 minutes).
function UpcomingRail({ posts, onOpen }: {
  posts: SocialPost[];
  onOpen: (p: SocialPost) => void;
}) {
  const upcoming = useMemo(() => {
    return posts
      .filter((p) => p.status === "scheduled" && p.scheduled_for)
      .sort((a, b) => (a.scheduled_for || "").localeCompare(b.scheduled_for || ""))
      .slice(0, 10);
  }, [posts]);

  return (
    <aside className="xl:w-72 flex-shrink-0">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-3 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <CalendarIcon className="h-3.5 w-3.5 text-slate-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">Upcoming</h4>
          <span className="ml-auto text-[10px] text-slate-400">{upcoming.length ? `next ${upcoming.length}` : ""}</span>
        </div>
        {upcoming.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            No scheduled posts in this window.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onOpen(p)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="text-[11px] font-semibold text-slate-800">
                    {formatWhen(p)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                    {(p.platforms || []).map((plat) => (
                      <span
                        key={plat}
                        className="inline-flex items-center rounded px-1 py-px text-[9px] font-semibold text-white"
                        style={{ background: platformMeta(plat).color }}
                      >
                        {platformMeta(plat).label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                    {p.body || <em className="text-slate-400">(no body)</em>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
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
// Canon footer order: [danger red text, mr-auto] Close(ghost) positive(accent).
// Cancel-post confirmation is an IadmModal size="confirm" (replaces
// window.confirm); reschedule/cancel failures render as inline banners.
function PostDetailModal({
  post, onClose, onCancel, onReschedule, onEdit,
}: {
  post: SocialPost;
  onClose: () => void;
  /** DELETE + reload; the caller closes this modal on success. Throws on failure. */
  onCancel: () => Promise<void>;
  /** PATCH reschedule + reload; the caller closes on success. Throws on failure. */
  onReschedule: (iso: string) => Promise<void>;
  /** Open the composer modal pre-filled from this post. */
  onEdit: () => void;
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS_META[post.status];

  async function doReschedule() {
    setBusy(true); setError(null);
    try {
      await onReschedule(new Date(newWhen).toISOString());
    } catch (e) {
      setError(`Reschedule failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  async function doCancel() {
    setBusy(true); setError(null);
    try {
      await onCancel();
      setConfirmCancel(false);
    } catch (e) {
      setConfirmCancel(false);
      setError(`Cancel failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <IadmModal
      open
      onClose={onClose}
      product="spark"
      eyebrow="MY BRAND · SOCIAL POST"
      title="Social post"
      subtitle={meta?.label || post.status}
      size="info"
      footer={
        <>
          {isScheduled && (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              disabled={busy}
              className="mr-auto text-xs text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
            >
              Cancel post
            </button>
          )}
          <IadmButton variant="ghost" onClick={onClose}>Close</IadmButton>
          {isScheduled && (
            <IadmButton variant="accent" product="spark" onClick={doReschedule} disabled={busy}>
              {busy ? "Working…" : "Reschedule"}
            </IadmButton>
          )}
        </>
      }
    >
      <div className="p-5 space-y-4">
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
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
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-semibold text-[#EF6C33] hover:underline"
          >
            Edit in composer →
          </button>
        </div>
      </div>

      {/* Cancel-post confirm — IadmModal size="confirm" replaces window.confirm */}
      {confirmCancel && (
        <IadmModal
          open
          onClose={() => setConfirmCancel(false)}
          product="spark"
          eyebrow="MY BRAND · SOCIAL POST"
          title="Cancel this post?"
          size="confirm"
          footer={
            <>
              <IadmButton variant="ghost" onClick={() => setConfirmCancel(false)}>Keep post</IadmButton>
              <button
                type="button"
                onClick={doCancel}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50"
              >
                {busy ? "Cancelling…" : "Cancel post"}
              </button>
            </>
          }
        >
          <div className="p-5 text-sm text-slate-700">
            The scheduled post will be removed from the queue and will not publish. This cannot be undone.
          </div>
        </IadmModal>
      )}
    </IadmModal>
  );
}

// ComingSoonOverlay HOC removed 2026-06-22 — see VoicePage.tsx note.
export default SocialCalendarPage;

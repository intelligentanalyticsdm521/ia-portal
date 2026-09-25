import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";
import { CustomerModal } from "../../components/oliver/customer/CustomerModal";
import { NewEntityLauncher } from "../../components/oliver/customer/NewEntityLauncher";
import { JobStatusPill } from "../../components/oliver/JobColors";
import { jobColor, factsFromJobRow, JOB_COLORS } from "../../oliver/jobStatusColors";
import {
  DATE_SCOPE_STORAGE_KEY, addDays, mondayOf, weekRangeLabel, weekName, scopeWord,
  inDateScope, cancelledLine,
} from "../../oliver/jobBoardWeek";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation, rowLocationId, rowLocationName, locationNameOf } from "../../lib/oliverLocations";

interface AssignedWorker {
  worker_id: string;
  first_name?: string | null;
  last_name?: string | null;
}

interface Job {
  id: string;
  title: string;
  customerName: string;
  status: string;
  scheduledDate?: string | null;
  /** A pending reschedule request from the customer (GET /jobs, 2026-09-25).
   *  Orange in the one colour map. Absent on an older API — read as no. */
  rescheduleRequested?: boolean | null;
  /** A cancelled job: who called it off ("customer" | "business" | "system")
   *  and when — the latest status event to 'cancelled' (GET /jobs,
   *  2026-09-25). Null on every other status and on an older API. */
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  total: number;
  revenue?: number;
  laborCost?: number;
  profit?: number;
  /** Optional — set when the job was generated from a recurring template /
   *  subscription. Surfaces a "Recurring" tag in the board. Backend wires
   *  this up in Phase 1C (subscription management); until then it's always
   *  falsy and the filter shows zero matches, which is the correct behavior. */
  recurringJobId?: string | null;
  isRecurring?: boolean;
  /** F-26 — assigned worker(s). Backend returns from /jobs as a parsed
   *  array. Rendered as initial bubbles on the Kanban card; "Unassigned"
   *  amber badge if empty AND the job is in a status that needs a worker. */
  assignedWorkers?: AssignedWorker[];
  /** Multi-location: set client-side (from location_id) only when the
   *  business has 2+ active locations, so single-location boards render
   *  exactly as before. */
  locationName?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-bucket reorg (2026-05-25 founder spec)
//
//   Quotes        ← inquiry, quoted              (work not yet booked)
//   Scheduled     ← scheduled, dispatched, assigned (booked, not started)
//   In Progress   ← in_progress                  (active job)
//   Job Completed ← completed, invoiced          (work done, money may not yet be received)
//   Job Closed    ← paid, cancelled              (terminal; substatus pills discriminate)
//
// Statuses are kept on the backend exactly as today — buckets are purely a
// UI grouping so we don't have to touch the state machine in jobs.js. What
// the board shows is scoped by the week bar (src/oliver/jobBoardWeek): this
// week by default, or all dates. The week replaced the Closed bucket's rolling
// 7-day window (2026-09-25): stepping back a week has to show that week's paid
// and cancelled jobs. Closed-job history also lives on the Archive page (#41).
// ─────────────────────────────────────────────────────────────────────────────
type BucketKey = 'quotes' | 'scheduled' | 'in_progress' | 'completed' | 'closed';
/** The board's status filter: a bucket, or the Cancelled shortcut (Brandon,
 *  2026-09-25: "we should be able to filter to open/cancelled requests"). */
type BoardFilter = '' | BucketKey | 'cancelled';

interface BucketDef {
  key: BucketKey;
  label: string;
  statuses: string[];
}

const BUCKETS: BucketDef[] = [
  { key: 'quotes',      label: 'Quotes',         statuses: ['inquiry', 'quoted'] },
  { key: 'scheduled',   label: 'Scheduled',      statuses: ['scheduled', 'dispatched', 'assigned'] },
  { key: 'in_progress', label: 'In Progress',    statuses: ['in_progress'] },
  { key: 'completed',   label: 'Job Completed',  statuses: ['completed', 'invoiced'] },
  { key: 'closed',      label: 'Job Closed',     statuses: ['paid', 'cancelled'] },
];

const STATUS_TO_BUCKET: Record<string, BucketKey> = BUCKETS.reduce((acc, b) => {
  for (const s of b.statuses) acc[s] = b.key;
  return acc;
}, {} as Record<string, BucketKey>);

function bucketOf(status: string): BucketKey | null {
  return STATUS_TO_BUCKET[status] ?? null;
}

// Closed-bucket substatus pills — only rendered when the Closed bucket is
// selected. Default '' shows both.
const CLOSED_SUBSTATUS_PILLS = [
  { key: '',          label: 'All' },
  { key: 'paid',      label: 'Paid' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

// The six tiles: the five Kanban buckets, then Cancelled (red, 2026-09-25).
const TILES: Array<{ key: Exclude<BoardFilter, ''>; label: string; meaning: string }> = [
  { key: 'quotes',      label: 'Quotes',        meaning: 'awaiting decision' },
  { key: 'scheduled',   label: 'Scheduled',     meaning: 'booked' },
  { key: 'in_progress', label: 'In Progress',   meaning: 'active work' },
  { key: 'completed',   label: 'Job Completed', meaning: 'awaiting close' },
  { key: 'closed',      label: 'Job Closed',    meaning: 'paid or cancelled' },
  { key: 'cancelled',   label: 'Cancelled',     meaning: 'called off' },
];

const PROFIT_PILLS = [
  { key: "", label: "Any profit" },
  { key: "profit:positive", label: "Profitable" },
  { key: "profit:negative", label: "Losing money" },
  { key: "profit:none", label: "No data" },
];

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function OliverJobBoardPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('oliver').payload;

  const { get, post, patch, del, ready } = useOliverApi();
  // Multi-location: the header picker scopes the board (location_id on
  // /jobs). "All locations" sends nothing — identical to today.
  const loc = useOliverLocations();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // status filter: '' = all, a bucket, or 'cancelled'
  const [bucketFilter, setBucketFilter] = useState<BoardFilter>('');
  // substatus filter — only meaningful when bucketFilter='closed'
  const [closedSubstatus, setClosedSubstatus] = useState<'' | 'paid' | 'cancelled'>('');
  // recurring tag filter — '' = any, 'recurring' = only recurring,
  // 'one_off' = only one-off
  const [recurringFilter, setRecurringFilter] = useState<'' | 'recurring' | 'one_off'>('');
  const [profitFilter, setProfitFilter] = useState("");
  const [search, setSearch] = useState("");
  // Opens on List with this week (Brandon, 2026-09-25). The Calendar tab of
  // the same morning is gone: "I forgot we had the schedule" — Schedule is the
  // calendar, and the header links to it.
  const [view, setView] = useState<"list" | "kanban">("list");
  // The week bar: one week (Mon–Sun, this week to start) or all dates. The
  // All dates switch is remembered per browser; the week always opens on this
  // week. Storage can throw (private window, blocked site data) — then the
  // board simply opens on this week.
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [allDates, setAllDates] = useState<boolean>(() => {
    try { return window.localStorage.getItem(DATE_SCOPE_STORAGE_KEY) === "all"; } catch { return false; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(DATE_SCOPE_STORAGE_KEY, allDates ? "all" : "week"); } catch { /* per-browser nicety only */ }
  }, [allDates]);
  const dateScope = useMemo(() => ({ allDates, weekStart }), [allDates, weekStart]);
  // 2026-05-25 — "+ New job" now opens the NewEntityLauncher (customer-first
  // picker), then routes the user into the CustomerModal at the chosen
  // section's create panel. The old inline JobCreateForm is gone.
  const [launcherOpen, setLauncherOpen] = useState(false);
  // The launcher now answers with the SITE too, so the create panel below
  // opens with the location already chosen rather than asking a second time.
  const [pendingNew, setPendingNew] = useState<{
    customerId: string; kind: "job" | "quote";
    subject?: { kind: "company" | "person"; id: string } | null;
  } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  // The page-wide "Loading…" is for the FIRST load only. OliverPageWrapper
  // swaps the whole page for it, so showing it on every refetch unmounted the
  // open job panel — and threw the week bar back to this week (W-OB-05
  // follow-up). Later loads swap the rows in place.
  const [loadedOnce, setLoadedOnce] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Job[]>(withLocation("/jobs?per_page=500", loc.selectedLocationId));
      setJobs(data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); setLoadedOnce(true); }
  }, [get, loc.selectedLocationId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Deep-link: ?focus=<job_id> opens the job's panel immediately.
  // Used by the Service Requests detail drawer's "Open in job board" action.
  // ?job=<job_id> is accepted too: the calendars' "Open →" links used it for
  // months and the board ignored it, so the job never opened (W-OB-05).
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get("focus") || searchParams.get("job");
    if (focus) {
      setDetailId(focus);
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      next.delete("job");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // The week bar scopes the board BEFORE any other filter runs: the tiles,
  // the chips, List and Kanban all count and show the same jobs. Jobs with no
  // date show in every week (src/oliver/jobBoardWeek).
  const boardJobs = useMemo(() => {
    const scoped = jobs.filter((j) => inDateScope(j, dateScope));
    if (!loc.multi) return scoped;
    return scoped.map((j) => ({ ...j, locationName: locationNameOf(rowLocationId(j), loc.locations, rowLocationName(j)) }));
  }, [jobs, dateScope, loc.multi, loc.locations]);
  const scopeText = scopeWord(dateScope);
  const undatedShown = useMemo(() => boardJobs.filter((j) => !j.scheduledDate).length, [boardJobs]);

  const filtered = useMemo(() => {
    let list = boardJobs;
    if (bucketFilter === 'cancelled') {
      list = list.filter((j) => j.status === 'cancelled');
    } else if (bucketFilter) {
      list = list.filter((j) => bucketOf(j.status) === bucketFilter);
      if (bucketFilter === 'closed' && closedSubstatus) {
        list = list.filter((j) => j.status === closedSubstatus);
      }
    }
    if (recurringFilter === 'recurring') {
      list = list.filter((j) => !!j.isRecurring || !!j.recurringJobId);
    } else if (recurringFilter === 'one_off') {
      list = list.filter((j) => !j.isRecurring && !j.recurringJobId);
    }
    if (profitFilter === "profit:positive") {
      list = list.filter((j) => Number(j.profit ?? 0) > 0);
    } else if (profitFilter === "profit:negative") {
      list = list.filter((j) => Number(j.profit ?? 0) < 0 || (Number(j.laborCost ?? 0) > 0 && Number(j.revenue ?? 0) === 0));
    } else if (profitFilter === "profit:none") {
      list = list.filter((j) => Number(j.revenue ?? 0) === 0 && Number(j.laborCost ?? 0) === 0);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) => j.title?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q));
    }
    return list;
  }, [boardJobs, bucketFilter, closedSubstatus, recurringFilter, profitFilter, search]);

  // Counts follow the week bar, so the tile and chip totals are what the
  // board shows.
  const bucketCounts = useMemo(() => {
    const c: Record<string, number> = { '': boardJobs.length, cancelled: 0 };
    for (const b of BUCKETS) c[b.key] = 0;
    for (const j of boardJobs) {
      const b = bucketOf(j.status);
      if (b) c[b] = (c[b] || 0) + 1;
      if (j.status === 'cancelled') c.cancelled += 1;
    }
    return c;
  }, [boardJobs]);
  const bucketPills = useMemo(
    () => [
      { key: '', label: 'All', count: bucketCounts[''] ?? 0 },
      ...BUCKETS.map((b) => ({ key: b.key, label: b.label, count: bucketCounts[b.key] ?? 0 })),
      { key: 'cancelled', label: 'Cancelled', count: bucketCounts.cancelled ?? 0 },
    ],
    [bucketCounts],
  );

  const columns: Column<Job>[] = [
    {
      key: "title", header: "Job", sortable: true, sortAccessor: (j) => j.title?.toLowerCase() ?? "",
      render: (j) => (
        <div>
          <div className="font-medium text-oliver-teal flex items-center gap-1.5">
            <span>{j.title || "(untitled)"}</span>
            {(j.isRecurring || j.recurringJobId) && (
              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-800">
                Recurring
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">{j.customerName || "—"}</div>
        </div>
      ),
    },
    {
      key: "status", header: "Status", sortable: true, sortAccessor: (j) => j.status,
      render: (j) => {
        // A cancelled job says who called it off and when, when the job knows.
        const cx = j.status === "cancelled" ? cancelledLine(j) : null;
        return (
          <div>
            <JobStatusPill status={j.status} facts={factsFromJobRow(j)} />
            {cx && <div className="mt-1 text-[11px] font-medium text-rose-700">{cx}</div>}
          </div>
        );
      },
    },
    ...(loc.multi ? [{
      key: "location", header: "Location", sortable: true, sortAccessor: (j: Job) => j.locationName ?? "",
      render: (j: Job) => <span className="text-xs text-slate-600">{j.locationName || "—"}</span>,
    } satisfies Column<Job>] : []),
    {
      key: "scheduled", header: "Scheduled", sortable: true, sortAccessor: (j) => j.scheduledDate ?? "",
      render: (j) => <span className="text-sm text-slate-600">{j.scheduledDate ? new Date(j.scheduledDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</span>,
    },
    {
      key: "total", header: "Amount", align: "right", sortable: true, sortAccessor: (j) => Number(j.total),
      render: (j) => <span className="font-medium tabular-nums">{fmtMoney(j.total)}</span>,
    },
    {
      key: "profit", header: "Profit", align: "right",
      sortable: true,
      sortAccessor: (j) => Number(j.profit ?? 0),
      render: (j) => {
        const rev = Number(j.revenue ?? 0);
        const lc = Number(j.laborCost ?? 0);
        const p = Number(j.profit ?? 0);
        if (rev === 0 && lc === 0) {
          return <span style={{ color: "#94A3B8", fontSize: 12 }}>—</span>;
        }
        return (
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: p >= 0 ? "#059669" : "#DC2626" }}>
            {p >= 0 ? "" : "−"}{fmtMoney(Math.abs(p))}
            {lc > 0 && (
              <div style={{ fontSize: 10, color: "#5A7A8A", fontWeight: 400 }}>
                {fmtMoney(rev)} − {fmtMoney(lc)}
              </div>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <OliverPageWrapper title="Job Board" subtitle="Active and recent jobs" error={error} loading={loading && !loadedOnce}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_job_status', label: 'Jobs by status' },
        { id: 'oliver_jobs_by_service', label: 'Jobs by service' },
        { id: 'oliver_booked_ahead', label: 'Booked ahead' },
        { id: 'oliver_job_reliability', label: 'Ran clean vs not' },
      ]} />
      <PageHeader
        title="Job Board"
        subtitle="Track every job from inquiry to paid"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="ptabs" style={{ marginBottom: 0 }}>
              <button className={`ptab${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>List</button>
              <button className={`ptab${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")}>Kanban</button>
            </div>
            <Link
              to="/app/services/oliver_schedule"
              className="text-xs font-semibold text-[#1A7DB5] hover:underline"
              title="Jobs, Schedule: the calendar, month and day"
            >
              Open the full calendar →
            </Link>
            <Button variant="primary" onClick={() => setLauncherOpen(true)}>+ New job</Button>
          </div>
        }
      />

      <WeekBar
        weekStart={weekStart}
        allDates={allDates}
        shown={boardJobs.length}
        undated={undatedShown}
        onWeek={setWeekStart}
        onAllDates={setAllDates}
      />

      {/* F-05 — Stat cards: smaller (compact padding + smaller numbers), the
          five Kanban buckets plus Cancelled (2026-09-25). They count what the
          week bar shows and say which scope. Click a card to filter the List
          to it; click again to clear. */}
      {/* PHONE PASS 2026-09-06: five 1fr columns is 63px each at 375px, which
          cut "SCHEDULED" and "JOB COMPLETED" mid-word. `auto-fit` with a 104px
          floor keeps the five-across row on every desktop width the design was
          drawn for and drops to three, then two, on a phone. The class exists
          so the width rule can live in CSS; the inline style would otherwise
          win over any media query. */}
      <div
        className="mb-3 oliver-bucket-grid"
        style={{ display: "grid", gap: 8 }}
      >
        {TILES.map((b) => {
          const count = bucketCounts[b.key] ?? 0;
          const active = bucketFilter === b.key;
          const isCompleted = b.key === 'completed';
          const isClosed = b.key === 'closed';
          const isCancelled = b.key === 'cancelled';
          const label = `${b.meaning} · ${scopeText}`;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => { setBucketFilter(active ? '' : b.key); setClosedSubstatus(''); }}
              title={`Filter the List to ${b.label} (click again to clear)`}
              style={{
                background: active ? "#FFF8E1" : isCancelled ? "#FEF2F2" : "#fff",
                border: `1px solid ${active ? "#FEC82C" : isCancelled ? "#FECACA" : "#E5E7EB"}`,
                borderRadius: 8,
                padding: "8px 10px",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.12s",
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: isCancelled ? "#991B1B" : "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>
                {b.label}
              </div>
              <div style={{
                fontSize: 22, fontWeight: 700, fontFamily: "monospace", lineHeight: 1.2, marginTop: 2,
                color: isCompleted ? "#059669" : isClosed ? "#5A7A8A" : isCancelled ? "#B91C1C" : "#0B1C24",
              }}>
                {count}
              </div>
              <div style={{ fontSize: 10, color: isCancelled ? "#991B1B" : "#5A7A8A", marginTop: 2 }}>
                {label}
              </div>
            </button>
          );
        })}
      </div>

      {!jobs.length ? (
        <EmptyState
          title="No jobs yet"
          description="Jobs appear here when customers submit service requests, or when you create them manually."
          action={<Button variant="primary" onClick={() => setLauncherOpen(true)}>+ New job</Button>}
        />
      ) : view === "list" ? (
        <>
          <FilterBar
            pills={bucketPills}
            activePill={bucketFilter}
            onPillChange={(k) => {
              // Click a chip again to clear it, as the tiles do.
              const next = (k === bucketFilter ? '' : k) as BoardFilter;
              setBucketFilter(next);
              if (next !== 'closed') setClosedSubstatus('');
            }}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search title or customer…"
          />
          {/* Substatus pills — only shown when Closed bucket is selected,
              since "paid" vs "cancelled" only matters for terminal jobs. */}
          {bucketFilter === 'closed' && (
            <div className="ptabs" style={{ marginBottom: 8, marginTop: -4 }}>
              {CLOSED_SUBSTATUS_PILLS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setClosedSubstatus(p.key as '' | 'paid' | 'cancelled')}
                  className={`ptab${closedSubstatus === p.key ? " active" : ""}`}
                >
                  {p.label}
                </button>
              ))}
              <Link
                to="/app/services/oliver_jobs_archive"
                style={{ marginLeft: 8, alignSelf: 'center', fontSize: 12, color: '#1A7DB5' }}
              >
                Closed-job history → Archive
              </Link>
            </div>
          )}
          {/* Recurring tag filter — orthogonal to bucket, applies everywhere.
              Backend recurring linkage lands in Phase 1C; until then the
              filter returns zero matches for "Recurring", which is correct. */}
          <div className="ptabs" style={{ marginBottom: 8, marginTop: -4 }}>
            {[
              { key: '', label: 'All jobs' },
              { key: 'recurring', label: 'Recurring' },
              { key: 'one_off', label: 'One-off' },
            ].map((p) => (
              <button
                key={p.key}
                onClick={() => setRecurringFilter(p.key as '' | 'recurring' | 'one_off')}
                className={`ptab${recurringFilter === p.key ? " active" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Profitability pills */}
          <div className="ptabs" style={{ marginBottom: 12, marginTop: -4 }}>
            {PROFIT_PILLS.map((p) => (
              <button
                key={p.key}
                onClick={() => setProfitFilter(p.key)}
                className={`ptab${profitFilter === p.key ? " active" : ""}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <DataTable
            rows={filtered}
            emptyMessage={allDates ? "No jobs match these filters." : `No jobs ${scopeText} match these filters. Try Previous week, Next week or All dates.`}
            columns={columns}
            rowKey={(j) => j.id}
            onRowClick={(j) => setDetailId(j.id)}
            initialSort={{ key: "scheduled", direction: "desc" }}
          />
        </>
      ) : (
        <KanbanView
          jobs={boardJobs}
          allJobs={jobs}
          search={search}
          onSearch={setSearch}
          onPick={setDetailId}
          onMove={async (jobId, targetStatus) => {
            // F-40: optimistic local update, then PATCH /jobs/:id/status
            // with force=true so the state-machine guards don't block free
            // movement. Reload on success to pull in the canonical state.
            const prev = jobs.find((j) => j.id === jobId)?.status;
            setJobs((rows) => rows.map((j) => j.id === jobId ? { ...j, status: targetStatus } : j));
            try {
              await patch(`/jobs/${jobId}/status`, { status: targetStatus, force: true });
              reload();
            } catch (e) {
              // Revert + alert
              setJobs((rows) => rows.map((j) => j.id === jobId ? { ...j, status: prev || j.status } : j));
              alert(`Couldn't move job: ${e instanceof Error ? e.message : "unknown"}`);
            }
          }}
        />
      )}

      {detailId && (
        <CustomerModal
          focusJobId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          api={{ get, post, patch, del }}
        />
      )}

      {/* "+ New job" customer-first picker. Resolves to {customerId, kind}
          and then opens the CustomerModal at that section's create panel. */}
      {launcherOpen && (
        <NewEntityLauncher
          defaultKind="job"
          api={{ get, post }}
          onCancel={() => setLauncherOpen(false)}
          onResolved={({ customerId, kind, subject }) => {
            setLauncherOpen(false);
            setPendingNew({ customerId, kind, subject });
          }}
        />
      )}

      {pendingNew && (
        <CustomerModal
          customerId={pendingNew.customerId || undefined}
          customerKind={pendingNew.subject?.kind}
          customerLumenId={pendingNew.subject?.id}
          initialCreating={pendingNew.kind}
          onClose={() => setPendingNew(null)}
          onChanged={reload}
          api={{ get, post, patch, del }}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The week bar (Brandon, 2026-09-25): "just add like a default to show the
// current week's jobs, then like next week previous week, etc."
//   ‹ Previous week · This week (Mon 21 – Sun 27 Sep 2026) · Next week ›  [All dates]
// The rule for what is in a week is src/oliver/jobBoardWeek.
// ─────────────────────────────────────────────────────────────────────────────
function WeekBar({
  weekStart, allDates, shown, undated, onWeek, onAllDates,
}: {
  weekStart: Date;
  allDates: boolean;
  /** Jobs on the board for this scope (before the chips and search). */
  shown: number;
  /** Of those, how many have no date — they show in every week. */
  undated: number;
  onWeek: (d: Date) => void;
  onAllDates: (on: boolean) => void;
}) {
  const name = weekName(weekStart);
  const range = weekRangeLabel(weekStart);
  const navBtn = "rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 max-md:min-h-[40px]";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2" aria-label="Which dates the board shows">
      <button type="button" className={navBtn} disabled={allDates} onClick={() => onWeek(addDays(weekStart, -7))}>
        ‹ Previous week
      </button>
      <span className="min-w-[230px] text-center text-sm font-bold text-slate-900" aria-live="polite">
        {allDates ? "All dates" : name ? `${name} (${range})` : range}
      </span>
      <button type="button" className={navBtn} disabled={allDates} onClick={() => onWeek(addDays(weekStart, 7))}>
        Next week ›
      </button>
      {!allDates && name !== "This week" && (
        <button type="button" className={navBtn} onClick={() => onWeek(mondayOf(new Date()))}>
          Back to this week
        </button>
      )}
      <span className="text-[11px] text-slate-500">
        {allDates
          ? `${shown} job${shown === 1 ? "" : "s"}, every date`
          : `${shown - undated} with a date in the week · ${undated} with no date, shown every week`}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={allDates}
        onClick={() => onAllDates(!allDates)}
        className="ml-auto inline-flex items-center gap-2 rounded-md px-1.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 max-md:min-h-[40px]"
        title={allDates ? "Show one week at a time" : "Show every job, whatever its date"}
      >
        <span
          aria-hidden
          className={`relative inline-block h-4 w-7 rounded-full transition-colors ${allDates ? "bg-[#1A7DB5]" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${allDates ? "left-3.5" : "left-0.5"}`} />
        </span>
        All dates
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// F-40 — Drag-and-drop between buckets. Native HTML5 DnD.
// On drop, we PATCH /jobs/:id/status with force=true to the FIRST status
// in the target bucket's list (e.g. drop on "Scheduled" → status='scheduled').
// State machine guard is bypassed because the founder explicitly opted
// in to free movement: the Kanban is a manager-grade tool, not a strict
// workflow gate.
// ─────────────────────────────────────────────────────────────────────────────
function KanbanView({
  jobs,
  allJobs,
  search,
  onSearch,
  onPick,
  onMove,
}: {
  /** The jobs in the week bar's scope. */
  jobs: Job[];
  /** Every job loaded — the worker list does not change with the week, so a
   *  picked worker stays in the dropdown in a week they have no jobs. */
  allJobs: Job[];
  search: string;
  onSearch: (q: string) => void;
  onPick: (id: string) => void;
  /** F-40: called when a card is dropped on a bucket different from its
   *  current one. Returns the chosen target status. */
  onMove: (jobId: string, targetStatus: string) => void;
}) {
  // F-08 — filter dropdowns. Worker filter narrows the board to a single
  // worker's jobs (or unassigned-only). Recurring toggle filters jobs that
  // came from a subscription template.
  const [workerFilter, setWorkerFilter] = useState<string>("");           // "" | "__unassigned" | worker_id
  const [recurringOnly, setRecurringOnly] = useState<"" | "yes" | "no">(""); // "" | yes | no

  // Build the worker dropdown options from whatever workers appear in jobs.
  const workerOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const j of allJobs) {
      for (const w of j.assignedWorkers || []) {
        if (w.worker_id && !seen.has(w.worker_id)) {
          seen.set(w.worker_id, `${(w.first_name || "").trim()} ${(w.last_name || "").trim()}`.trim() || w.worker_id);
        }
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allJobs]);

  const filtered = useMemo(() => {
    let list = jobs;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) => j.title?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q));
    }
    if (workerFilter === "__unassigned") {
      list = list.filter((j) => !(j.assignedWorkers && j.assignedWorkers.length));
    } else if (workerFilter) {
      list = list.filter((j) => (j.assignedWorkers || []).some((w) => w.worker_id === workerFilter));
    }
    if (recurringOnly === "yes") list = list.filter((j) => j.isRecurring || j.recurringJobId);
    else if (recurringOnly === "no") list = list.filter((j) => !(j.isRecurring || j.recurringJobId));
    return list;
  }, [jobs, search, workerFilter, recurringOnly]);

  // Track which column is currently being hovered with a drag for visual feedback.
  const [dragOverBucket, setDragOverBucket] = useState<BucketKey | null>(null);
  // The job being dragged — used to hide its source card while in flight.
  const [draggingId, setDraggingId] = useState<string | null>(null);

  return (
    <>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search title or customer…"
          className="w-full md:w-72 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-oliver-gold focus:ring-1 focus:ring-oliver-gold focus:outline-none"
        />
        {/* F-08 — worker filter */}
        <select
          value={workerFilter}
          onChange={(e) => setWorkerFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-oliver-gold focus:outline-none"
          title="Filter by assigned worker"
        >
          <option value="">All workers</option>
          <option value="__unassigned">Unassigned only</option>
          {workerOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        {/* F-08 — recurring filter */}
        <select
          value={recurringOnly}
          onChange={(e) => setRecurringOnly(e.target.value as "" | "yes" | "no")}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-oliver-gold focus:outline-none"
          title="Filter by recurring vs one-off"
        >
          <option value="">All types</option>
          <option value="yes">Recurring only</option>
          <option value="no">One-off only</option>
        </select>
        {(workerFilter || recurringOnly) && (
          <button
            onClick={() => { setWorkerFilter(""); setRecurringOnly(""); }}
            className="text-[11px] text-slate-500 hover:text-slate-700 underline"
          >
            Clear filters
          </button>
        )}
        <span className="text-[11px] text-slate-400 italic ml-auto">
          Tip: drag any card to a different column to change its status.
        </span>
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3 min-w-max">
          {BUCKETS.map((bucket) => {
            const colJobs = filtered.filter((j) => bucketOf(j.status) === bucket.key);
            const isDropTarget = dragOverBucket === bucket.key;
            return (
              <div key={bucket.key} className="w-72 flex-shrink-0">
                <div className="bg-slate-100 rounded-t-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{bucket.label}</span>
                  <span className="text-xs text-slate-500">{colJobs.length}</span>
                </div>
                <div
                  className={`rounded-b-lg p-2 min-h-[400px] space-y-2 transition-colors ${
                    isDropTarget ? "bg-amber-50 ring-2 ring-amber-300" : "bg-slate-50"
                  }`}
                  onDragOver={(e) => {
                    // Preventing default is what allows the drop.
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverBucket !== bucket.key) setDragOverBucket(bucket.key);
                  }}
                  onDragLeave={(e) => {
                    // Only clear if we're leaving the column entirely, not just
                    // moving between child cards.
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    if (dragOverBucket === bucket.key) setDragOverBucket(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverBucket(null);
                    const jobId = e.dataTransfer.getData("text/plain");
                    if (!jobId) return;
                    const job = jobs.find((j) => j.id === jobId);
                    if (!job) return;
                    if (bucketOf(job.status) === bucket.key) return; // same column — no-op
                    // Pick the FIRST status in the target bucket's list.
                    const targetStatus = bucket.statuses[0];
                    onMove(jobId, targetStatus);
                  }}
                >
                  {colJobs.length === 0 && <div className="text-xs text-slate-400 italic text-center py-4">No jobs</div>}
                  {colJobs.map((j) => (
                    <KanbanCard
                      key={j.id}
                      job={j}
                      bucket={bucket.key}
                      isDragging={draggingId === j.id}
                      onPick={() => onPick(j.id)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", j.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(j.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onStatusChange={(next) => onMove(j.id, next)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// All valid job statuses — used by F-29 quick-edit status dropdown.
const ALL_STATUSES: Array<{ key: string; label: string }> = [
  { key: "inquiry",     label: "Inquiry" },
  { key: "quoted",      label: "Quoted" },
  { key: "scheduled",   label: "Scheduled" },
  { key: "dispatched",  label: "Dispatched" },
  { key: "assigned",    label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed",   label: "Completed" },
  { key: "invoiced",    label: "Invoiced" },
  { key: "paid",        label: "Paid" },
  { key: "cancelled",   label: "Cancelled" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Single Kanban card. Uniform height so the column rhythm stays clean
// (F-06). Worker bubbles + "Unassigned" amber badge per F-26.
// F-29: status dropdown on each card for direct edit without opening the
// modal — click the status pill to open a native select.
// ─────────────────────────────────────────────────────────────────────────────
function KanbanCard({
  job, bucket, isDragging, onPick, onDragStart, onDragEnd, onStatusChange,
}: {
  job: Job;
  bucket: BucketKey;
  isDragging: boolean;
  onPick: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onStatusChange?: (next: string) => void;
}) {
  // Bucket statuses that need a worker assignment for the work to actually
  // happen. Quotes/Closed don't need a worker.
  const needsWorker = bucket === "scheduled" || bucket === "in_progress";
  const workers = job.assignedWorkers || [];
  // The one status → colour map (src/oliver/jobStatusColors): the same colour
  // this job has on the calendars, as a stripe down the card's left edge.
  const colour = jobColor(factsFromJobRow(job));
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onPick}
      className={`bg-white rounded-lg ring-1 ring-gray-200 p-3 shadow-sm hover:shadow-md transition cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-30" : ""
      }`}
      style={{ minHeight: 110, borderLeft: `4px solid ${colour.solid}` }}
      title={`${colour.label}: ${colour.meaning} Drag to move between columns, or click to open.`}
    >
      <div className="text-sm font-medium text-oliver-teal line-clamp-2" style={{ minHeight: 36 }}>
        {job.title || "(untitled)"}
      </div>
      {job.customerName && <div className="text-xs text-slate-500 mt-1">{job.customerName}</div>}
      <div className="flex items-center gap-1.5 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
        {/* F-29 — inline status quick-edit. Stopping click propagation
            so the parent's onPick doesn't fire when the user just wants
            to change status. */}
        {onStatusChange ? (
          <select
            value={job.status}
            onChange={(e) => onStatusChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border border-slate-200 bg-white cursor-pointer hover:border-oliver-gold"
            title="Quick-edit status"
          >
            {ALL_STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        ) : (
          bucket === 'closed' && <JobStatusPill status={job.status} facts={factsFromJobRow(job)} />
        )}
        {(job.isRecurring || job.recurringJobId) && (
          <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-800">
            Recurring
          </span>
        )}
        {job.locationName && (
          <span className="rounded-full bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-sky-800 ring-1 ring-sky-200" title="Location">
            {job.locationName}
          </span>
        )}
        {needsWorker && workers.length === 0 && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ background: JOB_COLORS.business_attention.soft, color: JOB_COLORS.business_attention.softText }}
          >
            Unassigned
          </span>
        )}
        {job.rescheduleRequested && (
          <span
            className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ background: JOB_COLORS.customer_attention.soft, color: JOB_COLORS.customer_attention.softText }}
            title="The customer asked to move this job — decide it on the Reschedule Queue"
          >
            Reschedule asked
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 gap-2">
        <div className="flex items-center gap-1">
          {workers.slice(0, 3).map((w, idx) => {
            const first = (w.first_name || "").trim();
            const last = (w.last_name || "").trim();
            const initials = `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
            return (
              <span
                key={w.worker_id || idx}
                title={`${first} ${last}`.trim()}
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-oliver-teal text-white text-[9px] font-bold ring-2 ring-white"
                style={{ marginLeft: idx > 0 ? -6 : 0 }}
              >
                {initials}
              </span>
            );
          })}
          {workers.length > 3 && (
            <span className="text-[9px] text-slate-500 ml-1">+{workers.length - 3}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {job.scheduledDate && <span className="text-[10px] text-slate-500">{fmtDate(job.scheduledDate)}</span>}
          {Number(job.total) > 0 && <span className="text-xs font-medium tabular-nums text-slate-700">{fmtMoney(job.total)}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Job Detail Drawer ───────────────────────────────────────────────────────

interface JobDetail {
  id: string;
  title?: string;
  customerName?: string;
  customerEmail?: string;
  status: string;
  description?: string; // mapped from team_notes server-side
  scheduledDate?: string;
  scheduledEnd?: string;
  total?: number;
  assignedWorkers?: Array<{
    assignmentId?: string;
    id: string;
    name: string;
    actualHours?: number | null;
    hourlyRate?: number | null;
  }>;
  quotes?: Array<{ id: string; amount: number; status: string }>;
  invoices?: Array<{ id: string; amount: number; amountPaid?: number; status: string }>;
  statusHistory?: Array<{ status: string; timestamp: string; note?: string }>;
}

const VALID_NEXT: Record<string, string[]> = {
  inquiry: ["quoted", "cancelled"],
  quoted: ["scheduled", "cancelled"],
  scheduled: ["dispatched", "cancelled"],
  dispatched: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced"],
  invoiced: ["paid"],
  paid: [],
  cancelled: [],
};

function JobDetailDrawer({ jobId, onClose, onChanged, api }: {
  jobId: string;
  onClose: () => void;
  onChanged: () => void;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
}) {
  const navigate = useNavigate();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState("");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eNotes, setENotes] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try { setJob(await api.get<JobDetail>(`/jobs/${jobId}`)); }
    finally { setLoading(false); }
  }, [api, jobId]);

  useEffect(() => { reload(); }, [reload]);

  function toLocalDtInput(iso?: string): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function startEdit() {
    if (!job) return;
    setETitle(job.title || "");
    setEStart(toLocalDtInput(job.scheduledDate));
    setEEnd(toLocalDtInput(job.scheduledEnd));
    setENotes(job.description || "");
    setEditing(true);
    setErr(null);
  }
  async function saveEdit() {
    setBusy("save"); setErr(null);
    try {
      await api.patch(`/jobs/${jobId}`, {
        title: eTitle.trim(),
        scheduled_start: eStart ? new Date(eStart).toISOString() : null,
        scheduled_end: eEnd ? new Date(eEnd).toISOString() : null,
        team_notes: eNotes,
      });
      setEditing(false);
      await reload();
      onChanged();
    } catch (e) {
      setErr(`Save failed: ${(e as Error).message}`);
    } finally { setBusy(null); }
  }

  async function advanceTo(newStatus: string) {
    if (newStatus === "cancelled" && !confirm("Cancel this job? This is a terminal status.")) return;
    setBusy(newStatus); setErr(null);
    try {
      await api.patch(`/jobs/${jobId}/status`, { status: newStatus });
      await reload();
      onChanged();
    } catch (e) {
      setErr(`Status update failed: ${(e as Error).message}`);
    } finally { setBusy(null); }
  }

  if (loading || !job) {
    return (
      <DetailDrawer open onClose={onClose} title="Loading…" width="xl">
        <div style={{ padding: 20, color: "#5A7A8A" }}>Loading job…</div>
      </DetailDrawer>
    );
  }

  const nextStates = VALID_NEXT[job.status] || [];
  const nonTerminal = nextStates.filter((s) => s !== "cancelled");

  return (
    <DetailDrawer
      open onClose={onClose}
      title={job.title || "(untitled)"}
      subtitle={`${job.customerName || "—"}${job.customerEmail ? ` · ${job.customerEmail}` : ""}`}
      width="xl"
      headerActions={
        !editing && job.status !== "cancelled" && job.status !== "paid"
          ? <button onClick={startEdit} style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500 }}>Edit job</button>
          : undefined
      }
      footer={
        editing ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveEdit} disabled={busy === "save"}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => navigate(`/app/services/oliver_invoices?from_job=${jobId}`)}>
              + Create invoice
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/app/services/oliver_quotes?from_job=${jobId}`)}>
              + Create quote
            </Button>
            {nonTerminal.map((s) => (
              <Button key={s} variant="primary" onClick={() => advanceTo(s)} disabled={busy === s}>
                {busy === s ? "Updating…" : `Advance to ${s.replace(/_/g, " ")}`}
              </Button>
            ))}
            {nextStates.includes("cancelled") && (
              <Button variant="danger" onClick={() => advanceTo("cancelled")} disabled={busy === "cancelled"}>
                {busy === "cancelled" ? "Cancelling…" : "Cancel job"}
              </Button>
            )}
          </>
        )
      }
    >
      {err && <div style={{ marginBottom: 12, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{err}</div>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <StatusBadge status={job.status} />
        {job.scheduledDate && <span style={{ fontSize: 11, color: "#5A7A8A" }}>Scheduled {new Date(job.scheduledDate).toLocaleString()}</span>}
        {Number(job.total) > 0 && <span style={{ fontSize: 11, color: "#5A7A8A" }}>Quote/invoice total: <strong>{fmtMoney(job.total)}</strong></span>}
      </div>

      {editing ? (
        <div className="card">
          <div className="card-ttl">Edit job details</div>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Title</span>
            <input value={eTitle} onChange={(e) => setETitle(e.target.value)} style={jdInputStyle} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <label>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Scheduled start</span>
              <input type="datetime-local" value={eStart} onChange={(e) => setEStart(e.target.value)} style={jdInputStyle} />
            </label>
            <label>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Scheduled end</span>
              <input type="datetime-local" value={eEnd} onChange={(e) => setEEnd(e.target.value)} style={jdInputStyle} />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 10 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>Team notes (internal)</span>
            <textarea rows={4} value={eNotes} onChange={(e) => setENotes(e.target.value)} style={{ ...jdInputStyle, fontFamily: "inherit", resize: "vertical" }} />
          </label>
        </div>
      ) : job.description ? (
        <div className="card">
          <div className="card-ttl">Team notes</div>
          <div style={{ fontSize: 12, color: "#0B1C24", marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{job.description}</div>
        </div>
      ) : null}

      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Assigned workers</div>
              <div className="card-sub">{job.assignedWorkers?.length || 0} active · enter hours to track labor cost</div>
            </div>
          </div>
          {(job.assignedWorkers ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>
              No active assignments. Use the Dispatch page to offer this job to a worker.
            </div>
          ) : (
            (job.assignedWorkers ?? []).map((w) => (
              <AssignmentRow
                key={w.assignmentId || w.id}
                worker={w}
                onSave={async (hours) => {
                  if (!w.assignmentId) return;
                  await api.patch(`/jobs/${jobId}/assignments/${w.assignmentId}`, { actual_hours: hours });
                  await reload();
                  onChanged();
                }}
              />
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Status history</div>
              <div className="card-sub">{job.statusHistory?.length || 0} transitions</div>
            </div>
          </div>
          {(job.statusHistory ?? []).map((h, i) => (
            <div key={i} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <StatusBadge status={h.status} />
              <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A" }}>
                {new Date(h.timestamp).toLocaleString()}
              </div>
              {h.note && <div style={{ fontSize: 11, color: "#0B1C24", fontStyle: "italic" }}>{h.note}</div>}
            </div>
          ))}
          {!(job.statusHistory ?? []).length && (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No history yet.</div>
          )}
        </div>
      </div>

      <JobProfitabilityCard
        workers={job.assignedWorkers ?? []}
        invoices={job.invoices ?? []}
      />

      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Quotes</div>
              <div className="card-sub">{job.quotes?.length || 0} on this job</div>
            </div>
          </div>
          {(job.quotes ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No quotes yet.</div>
          ) : (
            (job.quotes ?? []).map((q) => (
              <div key={q.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <StatusBadge status={q.status} />
                <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{q.id.slice(0, 12)}…</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(q.amount)}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Invoices</div>
              <div className="card-sub">{job.invoices?.length || 0} on this job</div>
            </div>
          </div>
          {(job.invoices ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>No invoices yet.</div>
          ) : (
            (job.invoices ?? []).map((inv) => (
              <div key={inv.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <StatusBadge status={inv.status} />
                <div style={{ flex: 1, fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{inv.id.slice(0, 12)}…</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(inv.amount)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </DetailDrawer>
  );
}

const jdInputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff",
};

function JobProfitabilityCard({
  workers,
  invoices,
}: {
  workers: Array<{ assignmentId?: string; id: string; name: string; actualHours?: number | null; hourlyRate?: number | null }>;
  invoices: Array<{ id: string; amount: number; amountPaid?: number; status: string }>;
}) {
  const laborCost = workers.reduce((s, w) => {
    const hrs = Number(w.actualHours || 0);
    const rate = Number(w.hourlyRate || 0);
    return s + hrs * rate;
  }, 0);
  const totalHours = workers.reduce((s, w) => s + Number(w.actualHours || 0), 0);
  const revenue = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.amountPaid ?? i.amount ?? 0), 0);
  const profit = revenue - laborCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  const hasData = laborCost > 0 || revenue > 0;

  if (!hasData) {
    return (
      <div className="card" style={{ background: "#f8fafc" }}>
        <div className="card-ttl">Profitability</div>
        <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 4, lineHeight: 1.5 }}>
          Set hourly rates on the Workers page and log hours on each assignment, then send + collect on an invoice to see this job's profit.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ background: profit >= 0 ? "#F0FDF4" : "#FEF2F2", borderLeft: `4px solid ${profit >= 0 ? "#059669" : "#DC2626"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="card-ttl" style={{ margin: 0 }}>Profitability</div>
          <div className="card-sub" style={{ marginTop: 2 }}>
            {revenue > 0 ? fmtMoney(revenue) : "$0"} collected · {totalHours.toFixed(1)}h logged · {fmtMoney(laborCost)} labor
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: profit >= 0 ? "#059669" : "#DC2626", fontFamily: "monospace" }}>
            {profit >= 0 ? "" : "−"}{fmtMoney(Math.abs(profit))}
          </div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
            {margin != null ? `${margin}% margin` : "profit"}
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentRow({
  worker,
  onSave,
}: {
  worker: { id: string; name: string; assignmentId?: string; actualHours?: number | null; hourlyRate?: number | null };
  onSave: (hours: number | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState<string>(worker.actualHours != null ? String(worker.actualHours) : "");
  const [saving, setSaving] = useState(false);
  const rate = Number(worker.hourlyRate || 0);
  const hours = Number(worker.actualHours || 0);
  const cost = hours * rate;

  async function save() {
    setSaving(true);
    try {
      const num = val.trim() === "" ? null : Number(val);
      await onSave(num != null && Number.isFinite(num) ? num : null);
      setEditing(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="hrow" style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
      <span className="hdot ok" />
      <div style={{ flex: 1, minWidth: 120 }}>
        <div style={{ fontSize: 12, color: "#0B1C24", fontWeight: 500 }}>{worker.name}</div>
        {rate > 0 && !editing && (
          <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>
            ${rate.toFixed(2)}/hr{hours > 0 ? ` · ${hours.toFixed(1)}h · $${cost.toFixed(2)} cost` : ""}
          </div>
        )}
      </div>

      {editing ? (
        <>
          <input
            type="number" step="0.25" min="0" placeholder="Hours"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
            style={{ width: 70, padding: "4px 6px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 4, textAlign: "right" }}
          />
          <span style={{ fontSize: 11, color: "#5A7A8A" }}>hr</span>
          <button onClick={save} disabled={saving}
            style={{ fontSize: 11, padding: "3px 8px", border: "none", background: "#0C4A60", color: "#fff", borderRadius: 4, cursor: "pointer" }}>
            {saving ? "…" : "Save"}
          </button>
          <button onClick={() => { setVal(worker.actualHours != null ? String(worker.actualHours) : ""); setEditing(false); }}
            style={{ fontSize: 11, padding: "3px 8px", border: "1px solid #ddd", background: "#fff", borderRadius: 4, cursor: "pointer" }}>
            Cancel
          </button>
        </>
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ fontSize: 11, padding: "3px 10px", border: "1px solid rgba(45,156,219,0.28)", background: "#fff", color: "#1A7DB5", borderRadius: 4, cursor: "pointer", fontWeight: 500 }}>
          {worker.actualHours != null ? `${hours.toFixed(1)}h` : "+ Hours"}
        </button>
      )}
    </div>
  );
}

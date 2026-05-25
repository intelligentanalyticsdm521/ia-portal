import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";
import { JobCreateForm } from "./JobCreateForm";
import { CustomerModal } from "../../components/oliver/customer/CustomerModal";

interface Job {
  id: string;
  title: string;
  customerName: string;
  status: string;
  scheduledDate?: string | null;
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
// UI grouping so we don't have to touch the state machine in jobs.js. The
// Closed bucket shows a rolling 7-day window on the board; older closed
// jobs live on the Archive page (#41).
// ─────────────────────────────────────────────────────────────────────────────
type BucketKey = 'quotes' | 'scheduled' | 'in_progress' | 'completed' | 'closed';

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

const PROFIT_PILLS = [
  { key: "", label: "Any profit" },
  { key: "profit:positive", label: "Profitable" },
  { key: "profit:negative", label: "Losing money" },
  { key: "profit:none", label: "No data" },
];

// Days back included in the Closed bucket on the main board. Older closed
// jobs are surfaced via /app/services/oliver_jobs_archive.
const CLOSED_BOARD_WINDOW_DAYS = 7;

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function OliverJobBoardPage() {
  const { get, post, patch, ready } = useOliverApi();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // bucket filter: '' = all buckets, else one of BucketKey
  const [bucketFilter, setBucketFilter] = useState<'' | BucketKey>('');
  // substatus filter — only meaningful when bucketFilter='closed'
  const [closedSubstatus, setClosedSubstatus] = useState<'' | 'paid' | 'cancelled'>('');
  // recurring tag filter — '' = any, 'recurring' = only recurring,
  // 'one_off' = only one-off
  const [recurringFilter, setRecurringFilter] = useState<'' | 'recurring' | 'one_off'>('');
  const [profitFilter, setProfitFilter] = useState("");
  const [search, setSearch] = useState("");
  // Default Kanban — easier to see at a glance per founder request 2026-05-25.
  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Job[]>("/jobs?per_page=200");
      setJobs(data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Deep-link: ?focus=<job_id> opens the JobDetailDrawer immediately.
  // Used by the Service Requests detail drawer's "Open in job board" action.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get("focus");
    if (focus) {
      setDetailId(focus);
      const next = new URLSearchParams(searchParams);
      next.delete("focus");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Board-visible jobs apply the rolling 7-day window to the Closed bucket
  // BEFORE any user filters run. This keeps the board feeling current and
  // pushes long-tail history to /oliver_jobs_archive without forcing the API
  // to know about the cutoff.
  const cutoffMs = useMemo(
    () => Date.now() - CLOSED_BOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    [],
  );
  function isClosedAndStale(j: Job): boolean {
    if (bucketOf(j.status) !== 'closed') return false;
    if (!j.scheduledDate) return false; // no anchor date → keep on board
    const t = Date.parse(j.scheduledDate);
    if (Number.isNaN(t)) return false;
    return t < cutoffMs;
  }
  const boardJobs = useMemo(() => jobs.filter((j) => !isClosedAndStale(j)), [jobs, cutoffMs]);
  const closedHidden = jobs.length - boardJobs.length;

  const filtered = useMemo(() => {
    let list = boardJobs;
    if (bucketFilter) {
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

  // Counts are board-scoped (post 7-day window) so the pill totals reflect
  // what's actually visible.
  const bucketCounts = useMemo(() => {
    const c: Record<string, number> = { '': boardJobs.length };
    for (const b of BUCKETS) c[b.key] = 0;
    for (const j of boardJobs) {
      const b = bucketOf(j.status);
      if (b) c[b] = (c[b] || 0) + 1;
    }
    return c;
  }, [boardJobs]);
  const bucketPills = useMemo(
    () => [
      { key: '', label: 'All', count: bucketCounts[''] ?? 0 },
      ...BUCKETS.map((b) => ({ key: b.key, label: b.label, count: bucketCounts[b.key] ?? 0 })),
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
    { key: "status", header: "Status", sortable: true, sortAccessor: (j) => j.status, render: (j) => <StatusBadge status={j.status} /> },
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
    <OliverPageWrapper title="Job Board" subtitle="Active and recent jobs" error={error} loading={loading}>
      <PageHeader
        title="Job Board"
        subtitle="Track every job from inquiry to paid"
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="ptabs" style={{ marginBottom: 0 }}>
              <button className={`ptab${view === "list" ? " active" : ""}`} onClick={() => setView("list")}>List</button>
              <button className={`ptab${view === "kanban" ? " active" : ""}`} onClick={() => setView("kanban")}>Kanban</button>
            </div>
            {!showCreate && <Button variant="primary" onClick={() => setShowCreate(true)}>+ New job</Button>}
          </div>
        }
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Quotes</div>
          <div className="stat-val">{bucketCounts['quotes'] ?? 0}</div>
          <div className="stat-delta neu">awaiting decision</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Scheduled</div>
          <div className="stat-val">{bucketCounts['scheduled'] ?? 0}</div>
          <div className="stat-delta neu">booked</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">In Progress</div>
          <div className="stat-val">{bucketCounts['in_progress'] ?? 0}</div>
          <div className="stat-delta neu">active work</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Completed</div>
          <div className="stat-val" style={{ color: "#059669" }}>{bucketCounts['completed'] ?? 0}</div>
          <div className="stat-delta neu">work done, awaiting close</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Closed · last {CLOSED_BOARD_WINDOW_DAYS}d</div>
          <div className="stat-val">{bucketCounts['closed'] ?? 0}</div>
          <div className="stat-delta neu">
            {closedHidden > 0 ? (
              <Link to="/app/services/oliver_jobs_archive" style={{ color: '#1A7DB5' }}>
                +{closedHidden} in archive →
              </Link>
            ) : 'no older closed jobs'}
          </div>
        </div>
      </div>

      {showCreate && (
        <JobCreateForm
          onCreated={() => { setShowCreate(false); reload(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {!jobs.length && !showCreate ? (
        <EmptyState
          title="No jobs yet"
          description="Jobs appear here when customers submit service requests, or when you create them manually."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New job</Button>}
        />
      ) : !jobs.length && showCreate ? null : view === "list" ? (
        <>
          <FilterBar
            pills={bucketPills}
            activePill={bucketFilter}
            onPillChange={(k) => {
              setBucketFilter(k as '' | BucketKey);
              if (k !== 'closed') setClosedSubstatus('');
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
                Older than {CLOSED_BOARD_WINDOW_DAYS} days → Archive
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
            columns={columns}
            rowKey={(j) => j.id}
            onRowClick={(j) => setDetailId(j.id)}
            initialSort={{ key: "scheduled", direction: "desc" }}
          />
        </>
      ) : (
        <KanbanView
          jobs={boardJobs}
          search={search}
          onSearch={setSearch}
          onPick={setDetailId}
          closedHidden={closedHidden}
        />
      )}

      {detailId && (
        <CustomerModal
          focusJobId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          api={{ get, post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

function KanbanView({
  jobs,
  search,
  onSearch,
  onPick,
  closedHidden,
}: {
  jobs: Job[];
  search: string;
  onSearch: (q: string) => void;
  onPick: (id: string) => void;
  closedHidden: number;
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter((j) => j.title?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q));
  }, [jobs, search]);

  return (
    <>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search title or customer…"
          className="w-full md:w-80 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-oliver-gold focus:ring-1 focus:ring-oliver-gold focus:outline-none"
        />
        {closedHidden > 0 && (
          <Link to="/app/services/oliver_jobs_archive" className="text-xs text-blue-600 hover:underline">
            +{closedHidden} closed jobs older than {CLOSED_BOARD_WINDOW_DAYS}d → Archive
          </Link>
        )}
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3 min-w-max">
          {BUCKETS.map((bucket) => {
            const colJobs = filtered.filter((j) => bucketOf(j.status) === bucket.key);
            return (
              <div key={bucket.key} className="w-72 flex-shrink-0">
                <div className="bg-slate-100 rounded-t-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{bucket.label}</span>
                  <span className="text-xs text-slate-500">{colJobs.length}</span>
                </div>
                <div className="bg-slate-50 rounded-b-lg p-2 min-h-[400px] space-y-2">
                  {colJobs.length === 0 && <div className="text-xs text-slate-400 italic text-center py-4">No jobs</div>}
                  {colJobs.map((j) => (
                    <div key={j.id} onClick={() => onPick(j.id)} className="bg-white rounded-lg ring-1 ring-gray-200 p-3 shadow-sm hover:shadow-md transition cursor-pointer">
                      <div className="text-sm font-medium text-oliver-teal line-clamp-2">{j.title || "(untitled)"}</div>
                      {j.customerName && <div className="text-xs text-slate-500 mt-1">{j.customerName}</div>}
                      <div className="flex items-center gap-1.5 mt-1">
                        {/* Substatus chip on closed cards so paid vs cancelled
                            is obvious at a glance. */}
                        {bucket.key === 'closed' && <StatusBadge status={j.status} />}
                        {(j.isRecurring || j.recurringJobId) && (
                          <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-800">
                            Recurring
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        {j.scheduledDate && <span className="text-xs text-slate-500">{fmtDate(j.scheduledDate)}</span>}
                        {Number(j.total) > 0 && <span className="text-xs font-medium tabular-nums text-slate-700">{fmtMoney(j.total)}</span>}
                      </div>
                    </div>
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

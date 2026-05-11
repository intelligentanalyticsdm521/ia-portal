import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";
import { JobCreateForm } from "./JobCreateForm";

interface Job {
  id: string;
  title: string;
  customerName: string;
  status: string;
  scheduledDate?: string | null;
  total: number;
}

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "inquiry", label: "Inquiry" },
  { key: "quoted", label: "Quoted" },
  { key: "scheduled", label: "Scheduled" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
  { key: "invoiced", label: "Invoiced" },
  { key: "paid", label: "Paid" },
];

const KANBAN_COLS = ["inquiry", "quoted", "scheduled", "in_progress", "completed", "invoiced", "paid"] as const;

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
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">("list");
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

  const filtered = useMemo(() => {
    let list = jobs;
    if (filter) list = list.filter((j) => j.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) => j.title?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q));
    }
    return list;
  }, [jobs, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { "": jobs.length };
    for (const j of jobs) c[j.status] = (c[j.status] || 0) + 1;
    return c;
  }, [jobs]);
  const pills = FILTER_PILLS.map((p) => ({ ...p, count: counts[p.key] ?? 0 }));

  const columns: Column<Job>[] = [
    {
      key: "title", header: "Job", sortable: true, sortAccessor: (j) => j.title?.toLowerCase() ?? "",
      render: (j) => (
        <div>
          <div className="font-medium text-oliver-teal">{j.title || "(untitled)"}</div>
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
          <div className="stat-lbl">Active</div>
          <div className="stat-val">{jobs.filter((j) => !["paid", "cancelled", "completed"].includes(j.status)).length}</div>
          <div className="stat-delta neu">in progress</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Inquiry</div>
          <div className="stat-val">{counts["inquiry"] ?? 0}</div>
          <div className="stat-delta neu">awaiting action</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Scheduled</div>
          <div className="stat-val">{counts["scheduled"] ?? 0}</div>
          <div className="stat-delta neu">booked</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Completed</div>
          <div className="stat-val" style={{ color: "#059669" }}>{(counts["completed"] ?? 0) + (counts["invoiced"] ?? 0) + (counts["paid"] ?? 0)}</div>
          <div className="stat-delta neu">all time</div>
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
            pills={pills}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search title or customer…"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(j) => j.id}
            onRowClick={(j) => setDetailId(j.id)}
            initialSort={{ key: "scheduled", direction: "desc" }}
          />
        </>
      ) : (
        <KanbanView jobs={jobs} search={search} onSearch={setSearch} onPick={setDetailId} />
      )}

      {detailId && (
        <JobDetailDrawer
          jobId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          api={{ get, post, patch }}
        />
      )}
    </OliverPageWrapper>
  );
}

function KanbanView({ jobs, search, onSearch, onPick }: { jobs: Job[]; search: string; onSearch: (q: string) => void; onPick: (id: string) => void }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return jobs;
    const q = search.toLowerCase();
    return jobs.filter((j) => j.title?.toLowerCase().includes(q) || j.customerName?.toLowerCase().includes(q));
  }, [jobs, search]);

  return (
    <>
      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search title or customer…"
          className="w-full md:w-80 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-oliver-gold focus:ring-1 focus:ring-oliver-gold focus:outline-none"
        />
      </div>
      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3 min-w-max">
          {KANBAN_COLS.map((col) => {
            const colJobs = filtered.filter((j) => j.status === col);
            return (
              <div key={col} className="w-72 flex-shrink-0">
                <div className="bg-slate-100 rounded-t-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">{col.replace(/_/g, " ")}</span>
                  <span className="text-xs text-slate-500">{colJobs.length}</span>
                </div>
                <div className="bg-slate-50 rounded-b-lg p-2 min-h-[400px] space-y-2">
                  {colJobs.length === 0 && <div className="text-xs text-slate-400 italic text-center py-4">No jobs</div>}
                  {colJobs.map((j) => (
                    <div key={j.id} onClick={() => onPick(j.id)} className="bg-white rounded-lg ring-1 ring-gray-200 p-3 shadow-sm hover:shadow-md transition cursor-pointer">
                      <div className="text-sm font-medium text-oliver-teal line-clamp-2">{j.title || "(untitled)"}</div>
                      {j.customerName && <div className="text-xs text-slate-500 mt-1">{j.customerName}</div>}
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
  assignedWorkers?: Array<{ id: string; name: string }>;
  quotes?: Array<{ id: string; amount: number; status: string }>;
  invoices?: Array<{ id: string; amount: number; status: string }>;
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
              <div className="card-sub">{job.assignedWorkers?.length || 0} active</div>
            </div>
          </div>
          {(job.assignedWorkers ?? []).length === 0 ? (
            <div style={{ fontSize: 11, color: "#5A7A8A", fontStyle: "italic", padding: "8px 0" }}>
              No active assignments. Use the Dispatch page to offer this job to a worker.
            </div>
          ) : (
            (job.assignedWorkers ?? []).map((w) => (
              <div key={w.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="hdot ok" />
                <div style={{ flex: 1, fontSize: 12, color: "#0B1C24" }}>{w.name}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{w.id.slice(0, 8)}…</div>
              </div>
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

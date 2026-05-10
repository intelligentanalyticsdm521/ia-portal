import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState, Button,
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
  const { get, ready } = useOliverApi();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showCreate, setShowCreate] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Job[]>("/jobs?per_page=200");
      setJobs(data || []);
    } catch (e) { setError(e); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

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
            initialSort={{ key: "scheduled", direction: "desc" }}
          />
        </>
      ) : (
        <KanbanView jobs={jobs} search={search} onSearch={setSearch} />
      )}
    </OliverPageWrapper>
  );
}

function KanbanView({ jobs, search, onSearch }: { jobs: Job[]; search: string; onSearch: (q: string) => void }) {
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
                    <div key={j.id} className="bg-white rounded-lg ring-1 ring-gray-200 p-3 shadow-sm hover:shadow-md transition cursor-pointer">
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

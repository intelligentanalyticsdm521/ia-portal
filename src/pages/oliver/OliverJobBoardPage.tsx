import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface Job {
  id: string;
  title: string;
  customerName: string;
  status: string;
  scheduledDate: string;
  total: number;
}

const STATUSES = ["all", "inquiry", "quoted", "scheduled", "in_progress", "completed", "invoiced", "paid"] as const;
const KANBAN_COLS = ["inquiry", "quoted", "scheduled", "in_progress", "completed", "invoiced", "paid"] as const;

export function OliverJobBoardPage() {
  const { get, post, ready } = useOliverApi();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [view, setView] = useState<"list" | "kanban">("list");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", customerName: "", source: "manual" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<Job[]>("/jobs");
        if (!cancelled) setJobs(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load jobs");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  const filtered = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);

  async function handleCreate() {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const newJob = await post<Job>("/jobs", form);
      setJobs((prev) => [newJob, ...prev]);
      setShowCreate(false);
      setForm({ title: "", customerName: "", source: "manual" });
    } catch {
      // error handled inline
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="rounded-xl bg-white ring-1 ring-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-5 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Job Board</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView(view === "list" ? "kanban" : "list")}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-gray-50"
          >
            {view === "list" ? "Kanban" : "List"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            Create Job
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-1">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-slate-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : s.replace("_", " ")}
          </button>
        ))}
      </div>

      {/* List View */}
      {view === "list" && (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((j) => (
                <tr key={j.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{j.title}</td>
                  <td className="px-4 py-3 text-slate-600">{j.customerName}</td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      {j.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {j.scheduledDate ? new Date(j.scheduledDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">${j.total?.toLocaleString() ?? "0"}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No jobs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Kanban View */}
      {view === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {KANBAN_COLS.map((col) => {
            const colJobs = jobs.filter((j) => j.status === col);
            return (
              <div key={col} className="min-w-[220px] flex-shrink-0">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {col.replace("_", " ")} ({colJobs.length})
                </h3>
                <div className="space-y-2">
                  {colJobs.map((j) => (
                    <div key={j.id} className="rounded-lg bg-white ring-1 ring-gray-200 p-3">
                      <p className="text-sm font-medium text-slate-800">{j.title}</p>
                      <p className="text-xs text-slate-500">{j.customerName}</p>
                      {j.total > 0 && <p className="text-xs text-slate-400 mt-1">${j.total.toLocaleString()}</p>}
                    </div>
                  ))}
                  {colJobs.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-xs text-slate-400">
                      Empty
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-xl bg-white p-6 shadow-xl w-full max-w-md space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Create Job</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.customerName}
                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
              <select
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                <option value="manual">Manual</option>
                <option value="portal">Customer Portal</option>
                <option value="referral">Referral</option>
                <option value="website">Website</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-slate-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.title.trim()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

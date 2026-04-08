import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface Job {
  id: string;
  title: string;
  status: string;
  assignedWorkerId: string | null;
  assignedWorkerName: string | null;
  scheduledDate: string;
  customerName: string;
}

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
}

export function OliverDispatchPage() {
  const { get, post, ready } = useOliverApi();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offering, setOffering] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [j, w] = await Promise.all([
          get<Job[]>("/jobs?status=scheduled,dispatched,assigned"),
          get<Worker[]>("/workers"),
        ]);
        if (!cancelled) { setJobs(j); setWorkers(w); }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dispatch data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  async function handleOffer(jobId: string) {
    const workerId = selectedWorker[jobId];
    if (!workerId) return;
    setOffering(jobId);
    try {
      await post("/dispatch/offer", { job_id: jobId, worker_id: workerId });
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: "dispatched", assignedWorkerId: workerId, assignedWorkerName: workers.find((w) => w.id === workerId)?.first_name ?? "Worker" }
            : j
        )
      );
    } catch {
      // keep state as-is on failure
    } finally {
      setOffering(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl bg-white ring-1 ring-gray-200 p-4 animate-pulse h-20" />
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
      <h1 className="text-2xl font-semibold text-slate-900">Dispatch</h1>

      {jobs.length === 0 ? (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-8 text-center text-slate-400">
          No jobs ready for dispatch.
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl bg-white ring-1 ring-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{job.title}</p>
                <p className="text-xs text-slate-500">
                  {job.customerName} &middot; {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : "Unscheduled"}
                </p>
                <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  job.status === "assigned" ? "bg-green-50 text-green-700" :
                  job.status === "dispatched" ? "bg-amber-50 text-amber-700" :
                  "bg-blue-50 text-blue-700"
                }`}>
                  {job.status}
                </span>
                {job.assignedWorkerName && (
                  <span className="ml-2 text-xs text-slate-500">Assigned to {job.assignedWorkerName}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedWorker[job.id] ?? ""}
                  onChange={(e) => setSelectedWorker({ ...selectedWorker, [job.id]: e.target.value })}
                >
                  <option value="">Select worker</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>{w.first_name} {w.last_name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleOffer(job.id)}
                  disabled={!selectedWorker[job.id] || offering === job.id}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {offering === job.id ? "Sending..." : "Offer"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

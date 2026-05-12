import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, EmptyState,
  StatusBadge, Button,
} from "../../components/oliver/ui";

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

// Per-status visual treatment for the job card
const STATUS_BORDER: Record<string, string> = {
  scheduled:  "#F59E0B",   // amber — needs attention
  dispatched: "#1A7DB5",   // blue — offered, waiting
  assigned:   "#059669",   // emerald — accepted, ready
};

const FILTER_PILLS = [
  { key: "", label: "All ready" },
  { key: "status:scheduled", label: "Scheduled (unassigned)" },
  { key: "status:dispatched", label: "Dispatched (offered)" },
  { key: "status:assigned", label: "Assigned" },
];

function fmtDate(d?: string) {
  if (!d) return "Unscheduled";
  return new Date(d).toLocaleDateString();
}

export function OliverDispatchPage() {
  const { get, post, ready } = useOliverApi();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [offering, setOffering] = useState<string | null>(null);
  const [selectedWorker, setSelectedWorker] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [j, w] = await Promise.all([
        get<Job[]>("/jobs?status=scheduled,dispatched,assigned"),
        get<Worker[]>("/workers"),
      ]);
      setJobs(j || []);
      setWorkers(w || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function handleOffer(jobId: string) {
    const workerId = selectedWorker[jobId];
    if (!workerId) return;
    setOffering(jobId);
    try {
      await post("/dispatch/offer", { job_id: jobId, worker_id: workerId });
      const w = workers.find((wk) => wk.id === workerId);
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: "dispatched", assignedWorkerId: workerId, assignedWorkerName: w ? `${w.first_name} ${w.last_name}` : "Worker" }
            : j
        )
      );
    } catch { /* keep state */ }
    finally { setOffering(null); }
  }

  const filtered = useMemo(() => {
    let list = jobs;
    if (filter.startsWith("status:")) {
      const s = filter.split(":")[1];
      list = list.filter((j) => j.status === s);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((j) =>
        j.title?.toLowerCase().includes(q) ||
        j.customerName?.toLowerCase().includes(q) ||
        j.assignedWorkerName?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [jobs, filter, search]);

  const unassigned = jobs.filter((j) => j.status === "scheduled" && !j.assignedWorkerId).length;
  const offered = jobs.filter((j) => j.status === "dispatched").length;
  const accepted = jobs.filter((j) => j.status === "assigned").length;

  // Workload per worker today — how many jobs each worker is on so dispatcher
  // doesn't pile on. Counts active states (scheduled/dispatched/assigned/
  // in_progress) for the worker's id.
  const workloadByWorker = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs) {
      if (!j.assignedWorkerId) continue;
      if (["scheduled", "dispatched", "assigned", "in_progress"].includes(j.status)) {
        map.set(j.assignedWorkerId, (map.get(j.assignedWorkerId) || 0) + 1);
      }
    }
    return map;
  }, [jobs]);

  return (
    <OliverPageWrapper title="Dispatch" subtitle="Assign and offer jobs to your team" error={error} loading={loading}>
      <PageHeader
        title="Dispatch"
        subtitle="Pick a worker and offer the job — the worker accepts or declines on their device"
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Unassigned</div>
          <div className="stat-val" style={{ color: unassigned > 0 ? "#D97706" : undefined }}>{unassigned}</div>
          <div className="stat-delta neu">need a worker</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Offered</div>
          <div className="stat-val">{offered}</div>
          <div className="stat-delta neu">awaiting accept</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Assigned</div>
          <div className="stat-val" style={{ color: "#059669" }}>{accepted}</div>
          <div className="stat-delta neu">ready to go</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Active workers</div>
          <div className="stat-val">{workers.length}</div>
          <div className="stat-delta neu">available</div>
        </div>
      </div>

      {!jobs.length ? (
        <EmptyState
          title="No jobs ready for dispatch"
          description="Once a job is scheduled, it appears here so you can offer it to a worker. Workers accept or decline on their device, and accepted jobs move to the assigned state."
        />
      ) : (
        <>
          <FilterBar
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search job, customer, or assigned worker…"
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((job) => {
              const borderColor = STATUS_BORDER[job.status] || "#E5E7EB";
              return (
                <div key={job.id} className="card" style={{
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  borderLeft: `4px solid ${borderColor}`,
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{job.title || "(untitled)"}</div>
                    <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                      {job.customerName} · {fmtDate(job.scheduledDate)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <StatusBadge status={job.status} />
                      {job.assignedWorkerName && (
                        <span style={{ fontSize: 11, color: "#5A7A8A" }}>
                          → {job.assignedWorkerName}
                          {job.assignedWorkerId && workloadByWorker.has(job.assignedWorkerId) && (
                            <span style={{ marginLeft: 4, color: "#94A3B8" }}>
                              ({workloadByWorker.get(job.assignedWorkerId)} active)
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select
                      style={{
                        padding: "6px 10px",
                        border: "1px solid rgba(45,156,219,0.28)",
                        borderRadius: 6, fontSize: 12, background: "#fff",
                        minWidth: 200,
                      }}
                      value={selectedWorker[job.id] ?? job.assignedWorkerId ?? ""}
                      onChange={(e) => setSelectedWorker({ ...selectedWorker, [job.id]: e.target.value })}
                    >
                      <option value="">Select worker…</option>
                      {workers.map((w) => {
                        const load = workloadByWorker.get(w.id) || 0;
                        return (
                          <option key={w.id} value={w.id}>
                            {w.first_name} {w.last_name}
                            {load > 0 ? ` · ${load} active` : ""}
                          </option>
                        );
                      })}
                    </select>
                    <Button
                      variant="primary"
                      onClick={() => handleOffer(job.id)}
                      disabled={!selectedWorker[job.id] || offering === job.id}
                    >
                      {offering === job.id ? "Sending…" : job.status === "scheduled" ? "Offer" : "Re-offer"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="card">
                <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
                  No jobs match these filters.
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </OliverPageWrapper>
  );
}

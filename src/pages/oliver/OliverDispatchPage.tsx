// @deprecated 2026-06-12 — Dispatch is absorbed into the Jobs board (see
// SubNav comment near line 86). Route still resolves but is hidden from nav.
// Per OLIVER E2E audit "Other route-without-nav pages" finding. Confirm
// with founder before deletion as part of task #174.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation, rowLocationId, rowLocationName, locationNameOf } from "../../lib/oliverLocations";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, EmptyState,
  StatusBadge, Button,
} from "../../components/oliver/ui";

interface Job {
  id: string;
  title: string;
  status: string;
  // GET /jobs returns the live assignments as assignedWorkers (F-26). The page
  // used to read assignedWorkerId / assignedWorkerName, which the API never
  // sent, so the row only ever showed a name the page had just typed itself.
  assignedWorkers?: { worker_id: string; first_name: string; last_name: string }[];
  scheduledDate: string;
  customerName: string;
}

interface Worker {
  id: string;
  first_name: string;
  last_name: string;
}

// oliver.job_offer as GET /job-offers returns it. An Offer on this page writes
// one naming the worker (register oliver-dispatch-offer-reaches-no-one), and
// the crew app answers it; the newest one per job is what the row reads back.
interface Offer {
  offer_id: string;
  job_id: string;
  status: "open" | "claimed" | "declined" | "cancelled" | string;
  broadcast_to_json: string;
  created_at: string;
}

const sameId = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

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
  const loc = useOliverLocations();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [offering, setOffering] = useState<string | null>(null);
  const [offerError, setOfferError] = useState<Record<string, string>>({});
  const [selectedWorker, setSelectedWorker] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) { setLoading(true); setError(null); }
    try {
      // GET /jobs matches ONE status (routes/jobs.js: `j.status = @status`), so
      // "?status=scheduled,dispatched,assigned" matched nothing and Dispatch
      // always read "No jobs ready for dispatch" (pane test 25 Sep). Ask per status.
      const [s, d, a, w, o] = await Promise.all([
        get<Job[]>(withLocation("/jobs?status=scheduled&per_page=200", loc.selectedLocationId)),
        get<Job[]>(withLocation("/jobs?status=dispatched&per_page=200", loc.selectedLocationId)),
        get<Job[]>(withLocation("/jobs?status=assigned&per_page=200", loc.selectedLocationId)),
        get<Worker[]>(withLocation("/workers", loc.selectedLocationId)),
        get<Offer[]>("/job-offers?status=all"),
      ]);
      setJobs([...(s || []), ...(d || []), ...(a || [])]);
      setWorkers(w || []);
      setOffers(o || []);
    } catch (err) { setError(err); }
    finally { if (!quiet) setLoading(false); }
  }, [get, loc.selectedLocationId]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function handleOffer(jobId: string) {
    const workerId = selectedWorker[jobId];
    if (!workerId) return;
    setOffering(jobId);
    setOfferError((prev) => ({ ...prev, [jobId]: "" }));
    try {
      await post("/dispatch/offer", { job_id: jobId, worker_id: workerId });
      // Read the row back from the server: the offer is stored now, so what
      // the row says is what the crew app sees.
      await load(true);
      setSelectedWorker((prev) => { const n = { ...prev }; delete n[jobId]; return n; });
    } catch (err) {
      // This was `catch { /* keep state */ }` — a failed offer looked sent.
      const msg = (err as { details?: string; message?: string })?.details
        || (err as Error)?.message || "The offer did not go out.";
      setOfferError((prev) => ({ ...prev, [jobId]: msg }));
    }
    finally { setOffering(null); }
  }

  const workerName = useCallback((id: string) => {
    const w = workers.find((wk) => sameId(wk.id, id));
    return w ? `${w.first_name} ${w.last_name}` : "a crew member";
  }, [workers]);

  // Newest offer per job (GET /job-offers is newest first).
  const latestOffer = useMemo(() => {
    const map = new Map<string, Offer>();
    for (const o of offers) {
      const key = o.job_id.toLowerCase();
      if (!map.has(key)) map.set(key, o);
    }
    return map;
  }, [offers]);

  function offeredNames(o: Offer): string {
    try {
      const ids = JSON.parse(o.broadcast_to_json) as string[];
      return ids.map(workerName).join(", ");
    } catch { return "a crew member"; }
  }

  /** What the row says about who has the job, read from the server. */
  function crewLine(job: Job): { text: string; tone: "info" | "warn" | "ok" } | null {
    const assigned = (job.assignedWorkers || []).map((w) => `${w.first_name} ${w.last_name}`);
    const o = latestOffer.get(job.id.toLowerCase());
    if (job.status === "assigned" && assigned.length) return { text: `Assigned to ${assigned.join(", ")}`, tone: "ok" };
    if (o?.status === "open" && job.status === "dispatched") return { text: `Offered to ${offeredNames(o)} · waiting for an answer`, tone: "info" };
    if (o?.status === "declined" && job.status === "scheduled") return { text: `Declined by ${offeredNames(o)}`, tone: "warn" };
    if (assigned.length) return { text: `Assigned to ${assigned.join(", ")}`, tone: "ok" };
    return null;
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
        (j.assignedWorkers || []).some((w) => `${w.first_name} ${w.last_name}`.toLowerCase().includes(q))
      );
    }
    return list;
  }, [jobs, filter, search]);

  const unassigned = jobs.filter((j) => j.status === "scheduled" && !(j.assignedWorkers || []).length).length;
  const offered = jobs.filter((j) => j.status === "dispatched").length;
  const accepted = jobs.filter((j) => j.status === "assigned").length;

  // Workload per worker — how many of these jobs each worker is already on,
  // so the dispatcher doesn't pile on.
  const workloadByWorker = useMemo(() => {
    const map = new Map<string, number>();
    for (const j of jobs) {
      for (const w of j.assignedWorkers || []) {
        const key = w.worker_id.toLowerCase();
        map.set(key, (map.get(key) || 0) + 1);
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
              const line = crewLine(job);
              return (
                <div key={job.id} className="card" style={{
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                  borderLeft: `4px solid ${borderColor}`,
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{job.title || "(untitled)"}</div>
                    <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>
                      {job.customerName} · {fmtDate(job.scheduledDate)}
                      {loc.multi && (() => { const n = locationNameOf(rowLocationId(job), loc.locations, rowLocationName(job)); return n ? <> · <span title="Location">{n}</span></> : null; })()}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      <StatusBadge status={job.status} />
                      {line && (
                        <span style={{
                          fontSize: 11,
                          color: line.tone === "warn" ? "#B45309" : line.tone === "ok" ? "#047857" : "#5A7A8A",
                          fontWeight: line.tone === "warn" ? 600 : 400,
                        }}>
                          {line.text}
                        </span>
                      )}
                    </div>
                    {offerError[job.id] && (
                      <div role="alert" style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>{offerError[job.id]}</div>
                    )}
                  </div>
                  {job.status === "assigned" ? (
                    <div style={{ fontSize: 11, color: "#5A7A8A", maxWidth: 220 }}>
                      Accepted. Change the crew on the job&apos;s Workers &amp; Time.
                    </div>
                  ) : (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <select
                      style={{
                        padding: "6px 10px",
                        border: "1px solid rgba(45,156,219,0.28)",
                        borderRadius: 6, fontSize: 12, background: "#fff",
                        minWidth: 200,
                      }}
                      value={selectedWorker[job.id] ?? ""}
                      onChange={(e) => setSelectedWorker({ ...selectedWorker, [job.id]: e.target.value })}
                    >
                      <option value="">Select worker…</option>
                      {workers.map((w) => {
                        const load = workloadByWorker.get(w.id.toLowerCase()) || 0;
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
                      {offering === job.id ? "Sending…" : (job.status === "scheduled" && !latestOffer.has(job.id.toLowerCase())) ? "Offer" : "Re-offer"}
                    </Button>
                  </div>
                  )}
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

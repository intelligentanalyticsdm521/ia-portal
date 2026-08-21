import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation } from "../../lib/oliverLocations";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, type Column,
} from "../../components/oliver/ui";
import { Play, Square, Trash2, Clock } from "lucide-react";

interface TimeEntry {
  entry_id: string;
  job_id: string | null;
  worker_id: string;
  worker_name?: string;
  job_title?: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  billable: boolean;
  hourly_rate: number | null;
  notes: string | null;
  source: string;
}

interface JobLite { job_id: string; title?: string; }
interface WorkerLite { worker_id: string; first_name?: string; last_name?: string; email?: string; display_name?: string; }

function fmtDuration(min?: number | null) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}
function liveDuration(startedAt: string): number {
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
}

export function OliverTimeTrackingPage() {
  const { get, post, del, ready } = useOliverApi();
  // Multi-location: the header picker scopes entries, jobs and workers.
  const loc = useOliverLocations();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [jobs, setJobs] = useState<JobLite[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showClockIn, setShowClockIn] = useState(false);
  const [tick, setTick] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [e, j, w] = await Promise.all([
        get<TimeEntry[]>(withLocation("/time-entries", loc.selectedLocationId)),
        get<JobLite[]>(withLocation("/jobs?per_page=100", loc.selectedLocationId)),
        get<WorkerLite[]>(withLocation("/workers?per_page=100", loc.selectedLocationId)),
      ]);
      setEntries(e || []);
      setJobs(j || []);
      setWorkers(w || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, loc.selectedLocationId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  // Live timer tick for any active entries
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const active = useMemo(() => entries.filter((e) => !e.ended_at), [entries]);
  const completed = useMemo(() => entries.filter((e) => e.ended_at), [entries]);

  const totals = useMemo(() => {
    const totalMin = completed.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const billableMin = completed.filter((e) => e.billable).reduce((s, e) => s + (e.duration_minutes || 0), 0);
    return { totalMin, billableMin };
  }, [completed]);

  async function stopEntry(e: TimeEntry) {
    try {
      await post(`/time-entries/${e.entry_id}/stop`);
      setFlash("Timer stopped.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Stop failed");
    }
  }

  async function deleteEntry(e: TimeEntry) {
    if (!confirm("Delete this time entry?")) return;
    try {
      await del(`/time-entries/${e.entry_id}`);
      setFlash("Entry deleted.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  }

  function workerName(id: string): string {
    const w = workers.find((w) => w.worker_id === id);
    if (!w) return id.slice(0, 8);
    return w.display_name || `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email || id.slice(0, 8);
  }
  function jobTitle(id: string | null): string {
    if (!id) return "—";
    const j = jobs.find((j) => j.job_id === id);
    return j?.title || id.slice(0, 8);
  }

  const columns: Column<TimeEntry>[] = [
    { key: "worker", header: "Worker", render: (e) => <span style={{ fontSize: 12, color: "#1A3A4A" }}>{workerName(e.worker_id)}</span> },
    { key: "job", header: "Job", render: (e) => <span style={{ fontSize: 12, color: "#0B1C24" }}>{jobTitle(e.job_id)}</span> },
    { key: "started", header: "Started", render: (e) => <span style={{ fontSize: 11, fontFamily: "monospace" }}>{fmtDateTime(e.started_at)}</span> },
    { key: "ended", header: "Ended", render: (e) => <span style={{ fontSize: 11, fontFamily: "monospace" }}>{fmtDateTime(e.ended_at)}</span> },
    { key: "duration", header: "Duration", align: "right", render: (e) => <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmtDuration(e.duration_minutes)}</span> },
    { key: "billable", header: "Billable", render: (e) => e.billable ? <span style={{ color: "#059669", fontSize: 11, fontWeight: 600 }}>Yes</span> : <span style={{ color: "#94A3B8", fontSize: 11 }}>No</span> },
    { key: "source", header: "Source", render: (e) => <span style={{ fontSize: 10, color: "#5A7A8A", textTransform: "uppercase" }}>{e.source}</span> },
    {
      key: "actions", header: "", align: "right",
      render: (e) => (
        <Button variant="ghost" size="sm" onClick={() => deleteEntry(e)}><Trash2 size={11} color="#dc2626" /></Button>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="Time Tracking" subtitle="Track billable hours by worker and job" error={error} loading={loading && !entries.length}>
      <PageHeader
        title="Time Tracking"
        subtitle="Workers can clock in to track hours against any job. Mobile app or here in the portal."
        actions={<Button variant="primary" onClick={() => setShowClockIn(true)}><Play size={12} /> Clock in</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      {active.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          {active.map((e) => (
            <div key={e.entry_id} style={{ padding: 14, background: "linear-gradient(90deg, #FEC82C 0%, #F59E0B 100%)", borderRadius: 8, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#1A3A4A", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={12} /> ACTIVE TIMER
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1A3A4A", marginTop: 4 }}>
                  {workerName(e.worker_id)} on {jobTitle(e.job_id)}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#1A3A4A", fontFamily: "monospace", marginTop: 4 }}>
                  {fmtDuration(liveDuration(e.started_at))}
                  <span style={{ fontSize: 11, marginLeft: 8, opacity: 0.6 }}>started {fmtDateTime(e.started_at)}</span>
                </div>
              </div>
              <Button variant="danger" onClick={() => stopEntry(e)}><Square size={12} /> Stop</Button>
            </div>
          ))}
        </div>
      )}
      <span style={{ display: "none" }}>{tick}</span>

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Total tracked</div>
          <div className="stat-val">{fmtDuration(totals.totalMin)}</div>
          <div className="stat-delta neu">across {completed.length} completed entries</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Billable</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtDuration(totals.billableMin)}</div>
          <div className="stat-delta neu">{totals.totalMin > 0 ? Math.round((totals.billableMin / totals.totalMin) * 100) : 0}% of total</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Active timers</div>
          <div className="stat-val">{active.length}</div>
          <div className="stat-delta neu">workers clocked in now</div>
        </div>
      </div>

      {!entries.length && !loading ? (
        <EmptyState
          title="No time entries yet"
          description="Clock in to start tracking time on a job. Hours can be billable or internal."
          action={<Button variant="primary" onClick={() => setShowClockIn(true)}>Clock in your first entry</Button>}
        />
      ) : (
        <DataTable rows={completed} columns={columns} rowKey={(e) => e.entry_id} emptyMessage="No completed entries." />
      )}

      {showClockIn && (
        <ClockInModal
          jobs={jobs}
          workers={workers}
          onClose={() => setShowClockIn(false)}
          onStarted={(msg) => { setShowClockIn(false); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function ClockInModal({ jobs, workers, onClose, onStarted, api }: {
  jobs: JobLite[];
  workers: WorkerLite[];
  onClose: () => void;
  onStarted: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [workerId, setWorkerId] = useState("");
  const [jobId, setJobId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!workerId) { setErr("Pick a worker"); return; }
    setErr(null); setSaving(true);
    try {
      await api.post("/time-entries/start", {
        worker_id: workerId,
        job_id: jobId || null,
        notes: notes.trim() || null,
      });
      onStarted("Timer started.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Clock in</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Worker</span>
            <select style={pInput} value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
              <option value="">— Pick a worker —</option>
              {workers.map((w) => {
                const name = w.display_name || `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email || w.worker_id.slice(0, 8);
                return <option key={w.worker_id} value={w.worker_id}>{name}</option>;
              })}
            </select>
          </label>
          <label><span style={pLabel}>Job (optional)</span>
            <select style={pInput} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">— No specific job —</option>
              {jobs.map((j) => <option key={j.job_id} value={j.job_id}>{j.title || j.job_id.slice(0, 8)}</option>)}
            </select>
          </label>
          <label><span style={pLabel}>Notes</span><textarea rows={2} style={{ ...pInput, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !workerId}>{saving ? "Starting…" : "Start timer"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };

import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation } from "../../lib/oliverLocations";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, FilterBar, type Column,
} from "../../components/oliver/ui";
import { Megaphone, X, Users, Clock } from "lucide-react";

interface JobOffer {
  offer_id: string;
  job_id: string;
  job_title: string;
  scheduled_at: string | null;
  price: number | null;
  status: "open" | "claimed" | "expired" | "cancelled";
  expires_at: string | null;
  accepted_by: string | null;
  broadcast_to_json: string | string[] | null;
  created_at: string;
}

interface JobLite { job_id: string; title?: string; }
interface WorkerLite { worker_id: string; first_name?: string; last_name?: string; email?: string; display_name?: string; }

function fmtMoney(n?: number | null) {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}
function countBroadcastTargets(raw: string | string[] | null): number {
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.length;
  try { const a = JSON.parse(raw); return Array.isArray(a) ? a.length : 0; } catch { return 0; }
}

const STATUS_PILL: Record<string, { bg: string; color: string }> = {
  open: { bg: "#DBEAFE", color: "#1E40AF" },
  claimed: { bg: "#D1FAE5", color: "#047857" },
  expired: { bg: "#FEF3C7", color: "#92400E" },
  cancelled: { bg: "#F1F5F9", color: "#5A7A8A" },
};

const FILTER_PILLS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "claimed", label: "Claimed" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
];

export function OliverJobOffersPage() {
  const { get, post, ready } = useOliverApi();
  // Multi-location: the header picker scopes the offer list and the broadcast pickers.
  const loc = useOliverLocations();
  const [offers, setOffers] = useState<JobOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState("all");
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const path = filter && filter !== "all" ? `/job-offers?status=${filter}` : "/job-offers";
      const data = await get<JobOffer[]>(withLocation(path, loc.selectedLocationId));
      setOffers(data || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, filter, loc.selectedLocationId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const counts = useMemo(() => {
    const open = offers.filter((o) => o.status === "open").length;
    const claimed = offers.filter((o) => o.status === "claimed").length;
    return { open, claimed };
  }, [offers]);

  async function handleCancel(o: JobOffer) {
    if (!confirm(`Cancel offer for "${o.job_title}"?`)) return;
    try {
      await post(`/job-offers/${o.offer_id}/cancel`);
      setFlash("Offer cancelled.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Cancel failed");
    }
  }

  const columns: Column<JobOffer>[] = [
    {
      key: "job", header: "Job", sortable: true, sortAccessor: (o) => o.job_title,
      render: (o) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A" }}>{o.job_title}</div>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontFamily: "monospace" }}>{o.job_id.slice(0, 8)}</div>
        </div>
      ),
    },
    {
      key: "scheduled", header: "Scheduled",
      render: (o) => <span style={{ fontSize: 11, color: "#0B1C24" }}>{fmtDateTime(o.scheduled_at)}</span>,
    },
    {
      key: "price", header: "Price", align: "right",
      render: (o) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#059669" }}>{fmtMoney(o.price)}</span>,
    },
    {
      key: "broadcast", header: "Broadcast",
      render: (o) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "#0B1C24" }}>
          <Users size={11} /> {countBroadcastTargets(o.broadcast_to_json)} workers
        </span>
      ),
    },
    {
      key: "status", header: "Status",
      render: (o) => {
        const pill = STATUS_PILL[o.status] || STATUS_PILL.open;
        return <span style={{ display: "inline-block", padding: "3px 9px", borderRadius: 99, background: pill.bg, color: pill.color, fontSize: 11, fontWeight: 600 }}>{o.status}</span>;
      },
    },
    {
      key: "accepted", header: "Accepted by",
      render: (o) => o.accepted_by ? <span style={{ fontSize: 11, color: "#0B1C24", fontFamily: "monospace" }}>{o.accepted_by.slice(0, 8)}</span> : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "expires", header: "Expires",
      render: (o) => o.expires_at ? (
        <span style={{ fontSize: 11, color: "#0B1C24", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <Clock size={10} /> {fmtDateTime(o.expires_at)}
        </span>
      ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "actions", header: "", align: "right",
      render: (o) => o.status === "open" ? (
        <Button variant="ghost" size="sm" onClick={() => handleCancel(o)}>
          <X size={11} /> Cancel
        </Button>
      ) : null,
    },
  ];

  return (
    <OliverPageWrapper title="Job Offers" subtitle="Broadcast jobs to workers and track who claims them" error={error} loading={loading && !offers.length}>
      <PageHeader
        title="Job Offers"
        subtitle="Send a job offer to multiple workers — first to accept gets it."
        actions={<Button variant="primary" onClick={() => setShowBroadcast(true)}><Megaphone size={12} /> Broadcast new offer</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Open offers</div>
          <div className="stat-val">{counts.open}</div>
          <div className="stat-delta neu">awaiting acceptance</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Claimed</div>
          <div className="stat-val" style={{ color: "#059669" }}>{counts.claimed}</div>
          <div className="stat-delta neu">across all time</div>
        </div>
      </div>

      {!offers.length && !loading && filter === "all" ? (
        <EmptyState
          title="No job offers yet"
          description="Broadcast a job to several workers at once — first to accept claims it. Great for filling slots on short notice."
          action={<Button variant="primary" onClick={() => setShowBroadcast(true)}>+ Broadcast your first offer</Button>}
        />
      ) : (
        <>
          <FilterBar pills={FILTER_PILLS} activePill={filter} onPillChange={setFilter} />
          <DataTable rows={offers} columns={columns} rowKey={(o) => o.offer_id} emptyMessage="No offers match this filter." />
        </>
      )}

      {showBroadcast && (
        <BroadcastModal
          onClose={() => setShowBroadcast(false)}
          onCreated={(msg) => { setShowBroadcast(false); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ get, post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function BroadcastModal({ onClose, onCreated, api }: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const loc = useOliverLocations();
  const [jobs, setJobs] = useState<JobLite[]>([]);
  const [workers, setWorkers] = useState<WorkerLite[]>([]);
  const [jobId, setJobId] = useState("");
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set());
  const [expiresIn, setExpiresIn] = useState("60");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [j, w] = await Promise.all([
          api.get<JobLite[]>(withLocation("/jobs?status=unassigned&per_page=100", loc.selectedLocationId)),
          api.get<WorkerLite[]>(withLocation("/workers?per_page=100", loc.selectedLocationId)),
        ]);
        setJobs(j || []);
        setWorkers(w || []);
      } catch { /* ignore */ }
    })();
  }, [api, loc.selectedLocationId]);

  function toggleWorker(id: string) {
    const next = new Set(selectedWorkers);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedWorkers(next);
  }

  async function submit() {
    if (!jobId) { setErr("Pick a job"); return; }
    if (!selectedWorkers.size) { setErr("Pick at least one worker"); return; }
    setErr(null); setSaving(true);
    try {
      await api.post("/job-offers", {
        job_id: jobId,
        worker_ids: Array.from(selectedWorkers),
        expires_in_minutes: expiresIn ? Number(expiresIn) : undefined,
      });
      onCreated(`Broadcast sent to ${selectedWorkers.size} worker(s).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 520, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>Broadcast job offer</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <label><span style={pLabel}>Job</span>
            <select style={pInput} value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">— Pick a job —</option>
              {jobs.map((j) => (<option key={j.job_id} value={j.job_id}>{j.title || j.job_id.slice(0, 8)}</option>))}
            </select>
          </label>
          <label><span style={pLabel}>Expires in (minutes)</span><input type="number" min="5" style={pInput} value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} /></label>
          <div>
            <span style={pLabel}>Broadcast to ({selectedWorkers.size} selected)</span>
            <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid #E2E8F0", borderRadius: 6, padding: 8 }}>
              {workers.length === 0 && <div style={{ fontSize: 11, color: "#94A3B8", padding: 8 }}>No workers found.</div>}
              {workers.map((w) => {
                const name = w.display_name || `${w.first_name ?? ""} ${w.last_name ?? ""}`.trim() || w.email || w.worker_id.slice(0, 8);
                return (
                  <label key={w.worker_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", cursor: "pointer", fontSize: 12 }}>
                    <input type="checkbox" checked={selectedWorkers.has(w.worker_id)} onChange={() => toggleWorker(w.worker_id)} />
                    <span>{name}</span>
                  </label>
                );
              })}
            </div>
          </div>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !jobId || !selectedWorkers.size}>{saving ? "Sending…" : "Send broadcast"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };

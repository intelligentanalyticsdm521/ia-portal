import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, type Column,
} from "../../components/oliver/ui";
import { Trash2, Shield, AlertTriangle, Plus } from "lucide-react";

interface SlaPolicy {
  sla_id: string;
  name: string;
  description: string | null;
  target_first_response_minutes: number | null;
  target_arrival_minutes: number | null;
  target_completion_hours: number | null;
  applies_to_priority: "low" | "normal" | "high" | "urgent" | "all" | null;
  is_active: boolean;
}

interface BreachReport {
  total_jobs: number;
  breached: number;
  met: number;
}

const PRIORITY_COLOR: Record<string, string> = {
  low: "#5A7A8A",
  normal: "#0B1C24",
  high: "#D97706",
  urgent: "#B91C1C",
  all: "#1E40AF",
};

function fmtMinutes(min?: number | null) {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
function fmtHours(h?: number | null) {
  if (h == null) return "—";
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24 * 10) / 10}d`;
}

export function OliverSlaPoliciesPage() {
  const { get, post, del, ready } = useOliverApi();
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [breach, setBreach] = useState<BreachReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [p, b] = await Promise.all([
        get<SlaPolicy[]>("/sla-policies"),
        get<BreachReport>("/sla-policies/breach-report?days=30").catch(() => null),
      ]);
      setPolicies(p || []);
      setBreach(b);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const breachPct = useMemo(() => {
    if (!breach || !breach.total_jobs) return 0;
    return Math.round((breach.breached / breach.total_jobs) * 100);
  }, [breach]);

  const metPct = useMemo(() => {
    if (!breach || !breach.total_jobs) return 0;
    return Math.round((breach.met / breach.total_jobs) * 100);
  }, [breach]);

  async function deletePolicy(p: SlaPolicy) {
    if (!confirm(`Delete SLA policy "${p.name}"?`)) return;
    try {
      await del(`/sla-policies/${p.sla_id}`);
      setFlash(`Deleted "${p.name}".`);
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  }

  const columns: Column<SlaPolicy>[] = [
    {
      key: "name", header: "Policy",
      render: (p) => (
        <div>
          <div style={{ fontWeight: 600, color: "#1A3A4A", display: "flex", alignItems: "center", gap: 6 }}>
            <Shield size={13} color="#5A7A8A" /> {p.name}
          </div>
          {p.description && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{p.description}</div>}
        </div>
      ),
    },
    {
      key: "priority", header: "Applies to",
      render: (p) => p.applies_to_priority ? (
        <span style={{ fontSize: 11, fontWeight: 600, color: PRIORITY_COLOR[p.applies_to_priority] || "#0B1C24", textTransform: "uppercase" }}>{p.applies_to_priority}</span>
      ) : <span style={{ color: "#94A3B8", fontSize: 11 }}>—</span>,
    },
    {
      key: "first_response", header: "First response", align: "right",
      render: (p) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{fmtMinutes(p.target_first_response_minutes)}</span>,
    },
    {
      key: "arrival", header: "Arrival", align: "right",
      render: (p) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{fmtMinutes(p.target_arrival_minutes)}</span>,
    },
    {
      key: "completion", header: "Completion", align: "right",
      render: (p) => <span style={{ fontFamily: "monospace", fontSize: 11 }}>{fmtHours(p.target_completion_hours)}</span>,
    },
    {
      key: "active", header: "Active",
      render: (p) => p.is_active ? (
        <span style={{ padding: "2px 8px", borderRadius: 99, background: "#D1FAE5", color: "#047857", fontSize: 11, fontWeight: 600 }}>Active</span>
      ) : (
        <span style={{ padding: "2px 8px", borderRadius: 99, background: "#F1F5F9", color: "#5A7A8A", fontSize: 11, fontWeight: 600 }}>Inactive</span>
      ),
    },
    {
      key: "actions", header: "", align: "right",
      render: (p) => (
        <Button variant="ghost" size="sm" onClick={() => deletePolicy(p)}><Trash2 size={11} color="#dc2626" /></Button>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="SLA Policies" subtitle="Service-level commitments and breach tracking" error={error} loading={loading && !policies.length}>
      <PageHeader
        title="SLA Policies"
        subtitle="Define response, arrival, and completion targets — track which jobs meet or miss them."
        actions={<Button variant="primary" onClick={() => setShowCreate(true)}><Plus size={12} /> New policy</Button>}
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      {breach && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1A3A4A" }}>SLA performance (last 30 days)</div>
              <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>Across {breach.total_jobs} job{breach.total_jobs === 1 ? "" : "s"}</div>
            </div>
            {breach.breached > 0 && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "#FEE2E2", color: "#991B1B", borderRadius: 99, fontSize: 12, fontWeight: 600 }}>
                <AlertTriangle size={12} /> {breach.breached} breach{breach.breached === 1 ? "" : "es"}
              </span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600 }}>Total jobs</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#0B1C24", marginTop: 4 }}>{breach.total_jobs}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600 }}>Met</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#059669", marginTop: 4 }}>{breach.met} <span style={{ fontSize: 13, color: "#5A7A8A" }}>({metPct}%)</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600 }}>Breached</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: breach.breached > 0 ? "#B91C1C" : "#0B1C24", marginTop: 4 }}>{breach.breached} <span style={{ fontSize: 13, color: "#5A7A8A" }}>({breachPct}%)</span></div>
            </div>
          </div>
          {breach.total_jobs > 0 && (
            <div style={{ marginTop: 12, height: 8, background: "#F1F5F9", borderRadius: 99, overflow: "hidden", display: "flex" }}>
              <div style={{ width: `${metPct}%`, background: "#059669" }} />
              <div style={{ width: `${breachPct}%`, background: "#B91C1C" }} />
            </div>
          )}
        </div>
      )}

      {!policies.length && !loading ? (
        <EmptyState
          title="No SLA policies"
          description="Define service-level commitments — response time, arrival time, and completion. Each job will be measured against your targets."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ Create first policy</Button>}
        />
      ) : (
        <DataTable rows={policies} columns={columns} rowKey={(p) => p.sla_id} emptyMessage="No policies." />
      )}

      {showCreate && (
        <CreatePolicyModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => { setShowCreate(false); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function CreatePolicyModal({ onClose, onCreated, api }: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [firstResponse, setFirstResponse] = useState("");
  const [arrival, setArrival] = useState("");
  const [completion, setCompletion] = useState("");
  const [priority, setPriority] = useState("all");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) { setErr("Name is required"); return; }
    setErr(null); setSaving(true);
    try {
      await api.post("/sla-policies", {
        name: name.trim(),
        description: description.trim() || null,
        target_first_response_minutes: firstResponse ? Number(firstResponse) : null,
        target_arrival_minutes: arrival ? Number(arrival) : null,
        target_completion_hours: completion ? Number(completion) : null,
        applies_to_priority: priority || "all",
        is_active: isActive,
      });
      onCreated(`Created "${name}".`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 460, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>New SLA policy</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Name</span><input style={pInput} placeholder="e.g. Urgent Same-Day" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <label><span style={pLabel}>Description</span><textarea rows={2} style={{ ...pInput, resize: "vertical" }} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          <label><span style={pLabel}>Applies to priority</span>
            <select style={pInput} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All priorities</option>
              <option value="urgent">Urgent only</option>
              <option value="high">High only</option>
              <option value="normal">Normal only</option>
              <option value="low">Low only</option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>First response (min)</span><input type="number" min="0" style={pInput} placeholder="60" value={firstResponse} onChange={(e) => setFirstResponse(e.target.value)} /></label>
            <label><span style={pLabel}>Arrival (min)</span><input type="number" min="0" style={pInput} placeholder="240" value={arrival} onChange={(e) => setArrival(e.target.value)} /></label>
            <label><span style={pLabel}>Completion (h)</span><input type="number" min="0" style={pInput} placeholder="24" value={completion} onChange={(e) => setCompletion(e.target.value)} /></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !name.trim()}>{saving ? "Creating…" : "Create policy"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };

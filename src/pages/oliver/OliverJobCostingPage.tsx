import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, DataTable, EmptyState, Button, type Column,
} from "../../components/oliver/ui";
import { RefreshCw, Plus, DollarSign, TrendingUp } from "lucide-react";

interface JobCost {
  cost_id: string;
  cost_type: "labor" | "material" | "expense" | "fuel" | "subcontractor" | "other";
  description: string;
  amount: number;
  incurred_on: string;
  source_table: string | null;
}

interface Margin {
  revenue: number;
  costs: Record<string, number>;
  total_cost: number;
  margin: number;
  margin_pct: number;
}

const COST_TYPE_OPTIONS = [
  { value: "labor", label: "Labor" },
  { value: "material", label: "Material" },
  { value: "expense", label: "Expense" },
  { value: "fuel", label: "Fuel" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "other", label: "Other" },
];

const COST_TYPE_COLOR: Record<string, string> = {
  labor: "#1E40AF",
  material: "#15803D",
  expense: "#D97706",
  fuel: "#7C2D12",
  subcontractor: "#7C3AED",
  other: "#5A7A8A",
};

function fmtMoney(n?: number | null) {
  if (n == null) return "$0";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function OliverJobCostingPage() {
  const { get, post, ready } = useOliverApi();
  const [costs, setCosts] = useState<JobCost[]>([]);
  const [margin, setMargin] = useState<Margin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const jobId = useMemo(() => new URLSearchParams(window.location.search).get("jobId") || "", []);

  const reload = useCallback(async () => {
    if (!jobId) {
      setError(new Error("Missing jobId query param"));
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const [c, m] = await Promise.all([
        get<JobCost[]>(`/jobs/${jobId}/costs`),
        get<Margin>(`/jobs/${jobId}/margin`).catch(() => null),
      ]);
      setCosts(c || []);
      setMargin(m);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, jobId]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function sync() {
    setSyncing(true);
    try {
      await post(`/jobs/${jobId}/costs/sync`);
      setFlash("Synced from time entries & approved expenses.");
      setTimeout(() => setFlash(null), 3000);
      reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Sync failed");
    } finally { setSyncing(false); }
  }

  const marginColor = margin && margin.margin_pct >= 30 ? "#059669"
    : margin && margin.margin_pct >= 10 ? "#D97706"
    : "#B91C1C";

  const columns: Column<JobCost>[] = [
    { key: "date", header: "Date", sortable: true, sortAccessor: (c) => c.incurred_on, render: (c) => <span style={{ fontSize: 11, fontFamily: "monospace" }}>{fmtDate(c.incurred_on)}</span> },
    {
      key: "type", header: "Type",
      render: (c) => (
        <span style={{ fontSize: 11, fontWeight: 600, color: COST_TYPE_COLOR[c.cost_type] || "#0B1C24", textTransform: "capitalize" }}>{c.cost_type}</span>
      ),
    },
    { key: "description", header: "Description", render: (c) => <span style={{ fontSize: 12, color: "#1A3A4A" }}>{c.description}</span> },
    {
      key: "source", header: "Source",
      render: (c) => c.source_table ? (
        <span style={{ fontSize: 10, color: "#5A7A8A", textTransform: "uppercase", fontFamily: "monospace" }}>{c.source_table}</span>
      ) : <span style={{ padding: "2px 7px", borderRadius: 99, background: "#EEF2FF", color: "#4338CA", fontSize: 10, fontWeight: 600 }}>Manual</span>,
    },
    {
      key: "amount", header: "Amount", align: "right",
      sortable: true, sortAccessor: (c) => Number(c.amount),
      render: (c) => <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#B91C1C" }}>{fmtMoney(c.amount)}</span>,
    },
  ];

  const costBreakdown = useMemo(() => {
    if (!margin?.costs) return [];
    return Object.entries(margin.costs)
      .map(([k, v]) => ({ category: k, amount: Number(v) }))
      .sort((a, b) => b.amount - a.amount);
  }, [margin]);

  return (
    <OliverPageWrapper title="Job Costing" subtitle="Cost rollup and margin analysis per job" error={error} loading={loading && !costs.length && !margin}>
      <PageHeader
        title="Job Costing"
        subtitle={jobId ? `Job ${jobId.slice(0, 8)} — track every dollar spent to deliver the work.` : "Missing jobId."}
        actions={
          <div style={{ display: "flex", gap: 6 }}>
            <Button variant="secondary" onClick={sync} disabled={syncing || !jobId}><RefreshCw size={12} /> {syncing ? "Syncing…" : "Sync from time & expenses"}</Button>
            <Button variant="primary" onClick={() => setShowAdd(true)} disabled={!jobId}><Plus size={12} /> Add manual cost</Button>
          </div>
        }
      />

      {flash && <div style={{ padding: 10, marginBottom: 12, fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>{flash}</div>}

      {margin && (
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <DollarSign size={12} /> REVENUE
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", marginTop: 4, fontFamily: "monospace" }}>{fmtMoney(margin.revenue)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600 }}>TOTAL COST</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#B91C1C", marginTop: 4, fontFamily: "monospace" }}>−{fmtMoney(margin.total_cost)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600 }}>MARGIN</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: marginColor, marginTop: 4, fontFamily: "monospace" }}>{fmtMoney(margin.margin)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                <TrendingUp size={12} /> MARGIN %
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: marginColor, marginTop: 4, fontFamily: "monospace" }}>{margin.margin_pct.toFixed(1)}%</div>
            </div>
          </div>

          {costBreakdown.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #E2E8F0" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", marginBottom: 8 }}>Cost breakdown</div>
              <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "#F1F5F9", marginBottom: 10 }}>
                {costBreakdown.map((b) => (
                  <div key={b.category} title={`${b.category}: ${fmtMoney(b.amount)}`} style={{
                    width: `${(b.amount / Math.max(margin.total_cost, 1)) * 100}%`,
                    background: COST_TYPE_COLOR[b.category] || "#5A7A8A",
                  }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {costBreakdown.map((b) => (
                  <div key={b.category} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: COST_TYPE_COLOR[b.category] || "#5A7A8A" }} />
                    <span style={{ color: "#0B1C24", textTransform: "capitalize" }}>{b.category}</span>
                    <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>{fmtMoney(b.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!costs.length && !loading ? (
        <EmptyState
          title="No costs recorded"
          description="Sync from time entries & approved expenses, or add manual costs to track this job's profitability."
          action={
            <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
              <Button variant="secondary" onClick={sync} disabled={syncing}>Sync from time & expenses</Button>
              <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add manual cost</Button>
            </div>
          }
        />
      ) : (
        <DataTable rows={costs} columns={columns} rowKey={(c) => c.cost_id} initialSort={{ key: "date", direction: "desc" }} emptyMessage="No costs recorded." />
      )}

      {showAdd && jobId && (
        <AddCostModal
          jobId={jobId}
          onClose={() => setShowAdd(false)}
          onAdded={(msg) => { setShowAdd(false); reload(); setFlash(msg); setTimeout(() => setFlash(null), 3000); }}
          api={{ post }}
        />
      )}
    </OliverPageWrapper>
  );
}

function AddCostModal({ jobId, onClose, onAdded, api }: {
  jobId: string;
  onClose: () => void;
  onAdded: (msg: string) => void;
  api: { post: <T>(p: string, b?: unknown) => Promise<T> };
}) {
  const [costType, setCostType] = useState<JobCost["cost_type"]>("material");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!description.trim() || !amount) { setErr("Description and amount required"); return; }
    setErr(null); setSaving(true);
    try {
      await api.post(`/jobs/${jobId}/costs`, {
        cost_type: costType,
        description: description.trim(),
        amount: Number(amount),
        incurred_on: incurredOn,
      });
      onAdded("Cost added.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 440, background: "#fff", borderRadius: 8 }}>
        <div style={{ padding: 18, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1A3A4A" }}>Add manual cost</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 18, display: "grid", gap: 12 }}>
          <label><span style={pLabel}>Cost type</span>
            <select style={pInput} value={costType} onChange={(e) => setCostType(e.target.value as JobCost["cost_type"])}>
              {COST_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label><span style={pLabel}>Description</span><input style={pInput} value={description} onChange={(e) => setDescription(e.target.value)} autoFocus /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label><span style={pLabel}>Amount ($)</span><input type="number" min="0" step="0.01" style={pInput} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label><span style={pLabel}>Incurred on</span><input type="date" style={pInput} value={incurredOn} onChange={(e) => setIncurredOn(e.target.value)} /></label>
          </div>
          {err && <div style={errBox}>{err}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !description.trim() || !amount}>{saving ? "Adding…" : "Add cost"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const pLabel: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 };
const pInput: React.CSSProperties = { width: "100%", padding: "7px 10px", fontSize: 12, border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff", color: "#0B1C24" };
const errBox: React.CSSProperties = { padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 };

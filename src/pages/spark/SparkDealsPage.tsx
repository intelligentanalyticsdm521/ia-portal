import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { Plus, Trophy, XCircle, DollarSign, Briefcase, ArrowRight } from "lucide-react";

interface Pipeline { id: number; name: string; is_default: boolean; }
interface Stage { id: number; name: string; sort_order: number; is_won: boolean; is_lost: boolean; }
interface Deal {
  id: number; pipeline_id: number; stage_id: number; contact_id: number | null;
  title: string; value: number; currency: string; status: string;
  expected_close_date: string | null; actual_close_date: string | null;
  created_at: string; updated_at: string;
}

export function SparkDealsPage() {
  const { get, post, put, ready } = useSparkApi();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<number | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ title: "", value: 0, stage_id: 0 });

  const loadPipelines = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: Pipeline[] }>("/api/v1/pipelines");
      setPipelines(r.data || []);
      const def = r.data?.find(p => p.is_default) || r.data?.[0];
      if (def && !pipelineId) setPipelineId(def.id);
    } catch (err) { setError(err); }
  }, [get, ready, pipelineId]);

  const loadStages = useCallback(async () => {
    if (!ready || !pipelineId) return;
    try {
      const r = await get<{ data: Stage[] }>(`/api/v1/pipelines/${pipelineId}/stages`);
      setStages(r.data || []);
      if (r.data?.[0]) setForm(f => ({ ...f, stage_id: r.data[0].id }));
    } catch (err) { setError(err); }
  }, [get, ready, pipelineId]);

  const loadDeals = useCallback(async () => {
    if (!ready || !pipelineId) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Deal[] }>(`/api/v1/deals?pipeline_id=${pipelineId}&limit=200`);
      setDeals(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready, pipelineId]);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { loadStages(); }, [loadStages]);
  useEffect(() => { loadDeals(); }, [loadDeals]);

  async function moveDeal(dealId: number, stageId: number) {
    try { await post(`/api/v1/deals/${dealId}/move`, { stage_id: stageId }); await loadDeals(); }
    catch (err) { setError(err); }
  }

  async function createDeal() {
    if (!form.title.trim() || !pipelineId || !form.stage_id) return;
    try {
      await post("/api/v1/deals", { pipeline_id: pipelineId, stage_id: form.stage_id, title: form.title.trim(), value: form.value });
      setDrawerOpen(false);
      setForm({ title: "", value: 0, stage_id: stages[0]?.id || 0 });
      await loadDeals();
    } catch (err) { setError(err); }
  }

  async function markStatus(d: Deal, status: "won" | "lost") {
    const target = stages.find(s => status === "won" ? s.is_won : s.is_lost);
    try {
      await put(`/api/v1/deals/${d.id}`, {
        status, stage_id: target?.id || d.stage_id,
        actual_close_date: new Date().toISOString().slice(0, 10),
      });
      await loadDeals();
    } catch (err) { setError(err); }
  }

  const stageOpenDeals = (stageId: number) => deals.filter(d => d.stage_id === stageId && d.status === "open");

  const totals = useMemo(() => {
    const open = deals.filter(d => d.status === "open");
    const won = deals.filter(d => d.status === "won");
    const lost = deals.filter(d => d.status === "lost");
    return {
      openCount: open.length,
      openValue: open.reduce((s, d) => s + Number(d.value || 0), 0),
      wonCount: won.length,
      wonValue: won.reduce((s, d) => s + Number(d.value || 0), 0),
      lostCount: lost.length,
    };
  }, [deals]);

  return (
    <SparkPageShell
      title="Deals"
      subtitle="Drag deals through your pipeline"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent" disabled={!stages.length}>
          <Plus className="h-3.5 w-3.5" /> New deal
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Open deals", value: totals.openCount, icon: Briefcase },
          { label: "Open value", value: `$${totals.openValue.toLocaleString()}`, icon: DollarSign, accent: "emerald" },
          { label: "Won", value: totals.wonCount, icon: Trophy, accent: "emerald", delta: totals.wonValue > 0 ? `$${totals.wonValue.toLocaleString()}` : undefined, deltaPositive: true },
          { label: "Lost", value: totals.lostCount, icon: XCircle, accent: "rose" },
        ]} />
      }
      filters={
        <div className="flex flex-wrap items-center gap-1.5">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => setPipelineId(p.id)}
              className={`spark-pill ${pipelineId === p.id ? "spark-pill-active" : ""}`}>
              {p.name}
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      {stages.length === 0 ? (
        <div className="spark-mini-card py-8 text-center">
          <div className="text-sm text-slate-500">This pipeline has no stages yet.</div>
          <a href="/app/services/spark_pipelines" className="text-sm text-emerald-600 mt-2 inline-block">Configure pipeline stages →</a>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {stages.filter(s => !s.is_won && !s.is_lost).map(stage => {
            const open = stageOpenDeals(stage.id);
            const totalVal = open.reduce((a, d) => a + Number(d.value || 0), 0);
            return (
              <div key={stage.id} className="bg-white border border-slate-200 rounded-lg flex flex-col min-h-[300px]">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-xs uppercase font-semibold text-slate-700 tracking-wide">{stage.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{open.length} · ${(totalVal / 1000).toFixed(0)}k</span>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                  {open.length === 0 && <div className="text-center text-xs text-slate-400 py-6">No deals</div>}
                  {open.map(d => (
                    <div key={d.id} className="bg-slate-50 border border-slate-200 rounded-md p-2.5 hover:shadow-sm hover:border-slate-300 transition">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.title}</div>
                      <div className="text-xs text-emerald-700 font-semibold mt-0.5">${Number(d.value).toLocaleString()}</div>
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {stages.filter(s => !s.is_won && !s.is_lost && s.id !== d.stage_id).slice(0, 2).map(s => (
                          <button key={s.id} onClick={() => moveDeal(d.id, s.id)}
                            className="text-[10px] flex items-center gap-0.5 bg-white border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 px-1.5 py-0.5 rounded transition">
                            <ArrowRight className="h-2.5 w-2.5" /> {s.name}
                          </button>
                        ))}
                        <button onClick={() => markStatus(d, "won")} className="text-[10px] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-1.5 py-0.5 rounded">Won</button>
                        <button onClick={() => markStatus(d, "lost")} className="text-[10px] bg-rose-50 text-rose-700 hover:bg-rose-100 px-1.5 py-0.5 rounded">Lost</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create deal"
        subtitle="Track an opportunity through your pipeline"
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createDeal} disabled={!form.title.trim()} className="spark-btn spark-btn-primary">Create deal</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Title</label>
          <input className="spark-field-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Acme Inc. — annual contract" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Value (USD)</label>
          <input type="number" className="spark-field-input" value={form.value || ""} onChange={e => setForm({ ...form, value: Number(e.target.value) })} placeholder="15000" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Starting stage</label>
          <select className="spark-field-select" value={form.stage_id || ""} onChange={e => setForm({ ...form, stage_id: Number(e.target.value) })}>
            {stages.filter(s => !s.is_won && !s.is_lost).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkDealsPage;

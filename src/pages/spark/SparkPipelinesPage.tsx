import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { Plus, GitBranch, DollarSign, Trophy, XCircle } from "lucide-react";

interface Pipeline { id: number; name: string; description: string | null; is_default: boolean; is_archived: boolean; }
interface Stage { id: number; pipeline_id: number; name: string; sort_order: number; win_probability: number; is_won: boolean; is_lost: boolean; color: string | null; }
interface FunnelRow { stage_id: number; stage_name: string; sort_order: number; deal_count: number; total_value: number; }

export function SparkPipelinesPage() {
  const { get, post, ready } = useSparkApi();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [funnel, setFunnel] = useState<FunnelRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [pipelineDrawer, setPipelineDrawer] = useState(false);
  const [stageDrawer, setStageDrawer] = useState(false);
  const [pipelineForm, setPipelineForm] = useState({ name: "", description: "" });
  const [stageForm, setStageForm] = useState({ name: "", win_probability: 50, is_won: false, is_lost: false });

  const loadPipelines = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Pipeline[] }>("/api/v1/pipelines");
      setPipelines(r.data || []);
      if (r.data?.length && !selectedId) setSelectedId(r.data[0].id);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready, selectedId]);

  const loadStagesAndFunnel = useCallback(async () => {
    if (!ready || !selectedId) return;
    try {
      const s = await get<{ data: Stage[] }>(`/api/v1/pipelines/${selectedId}/stages`);
      setStages(s.data || []);
      const f = await get<{ data: FunnelRow[] }>(`/api/v1/deals/funnel/${selectedId}`);
      setFunnel(f.data || []);
    } catch (err) { setError(err); }
  }, [get, ready, selectedId]);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { loadStagesAndFunnel(); }, [loadStagesAndFunnel]);

  async function createPipeline() {
    if (!pipelineForm.name.trim()) return;
    await post("/api/v1/pipelines", pipelineForm);
    setPipelineForm({ name: "", description: "" });
    setPipelineDrawer(false);
    await loadPipelines();
  }

  async function addStage() {
    if (!stageForm.name.trim() || !selectedId) return;
    await post(`/api/v1/pipelines/${selectedId}/stages`, {
      ...stageForm, sort_order: stages.length,
    });
    setStageForm({ name: "", win_probability: 50, is_won: false, is_lost: false });
    setStageDrawer(false);
    await loadStagesAndFunnel();
  }

  const totals = useMemo(() => {
    const open = funnel.filter(s => {
      const stage = stages.find(st => st.id === s.stage_id);
      return stage && !stage.is_won && !stage.is_lost;
    });
    const wonCount = funnel.find(s => stages.find(st => st.id === s.stage_id)?.is_won)?.deal_count || 0;
    const lostCount = funnel.find(s => stages.find(st => st.id === s.stage_id)?.is_lost)?.deal_count || 0;
    const openValue = open.reduce((sum, s) => sum + Number(s.total_value || 0), 0);
    const openCount = open.reduce((sum, s) => sum + s.deal_count, 0);
    return { openCount, openValue, wonCount, lostCount };
  }, [funnel, stages]);

  return (
    <SparkPageShell
      title="Pipelines"
      subtitle="Multi-stage opportunity tracking"
      actions={
        <button onClick={() => setPipelineDrawer(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> New pipeline
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Open deals", value: totals.openCount, icon: GitBranch },
          { label: "Open value", value: `$${totals.openValue.toLocaleString()}`, icon: DollarSign, accent: "emerald" },
          { label: "Won", value: totals.wonCount, icon: Trophy, accent: "emerald" },
          { label: "Lost", value: totals.lostCount, icon: XCircle, accent: "rose" },
        ]} />
      }
      filters={
        <div className="flex flex-wrap items-center gap-1.5">
          {pipelines.map(p => (
            <button key={p.id} onClick={() => setSelectedId(p.id)}
              className={`spark-pill ${selectedId === p.id ? "spark-pill-active" : ""}`}>
              {p.name} {p.is_default && <span className={`spark-pill-count ${selectedId === p.id ? "spark-pill-count-active" : ""}`}>default</span>}
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      {selectedId && (
        <>
          {/* Funnel visual */}
          <div className="spark-mini-card mb-4">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title">Funnel (open deals)</span>
              <span className="text-xs text-slate-500">{stages.length} stages</span>
            </div>
            {funnel.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                No stages defined yet. Add stages below to start tracking deals.
              </div>
            ) : (
              <div className="space-y-2">
                {funnel.map(s => {
                  const stage = stages.find(st => st.id === s.stage_id);
                  const max = Math.max(...funnel.map(x => x.deal_count), 1);
                  const w = Math.round((s.deal_count / max) * 100);
                  const isWon = stage?.is_won;
                  const isLost = stage?.is_lost;
                  return (
                    <div key={s.stage_id}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className="font-medium text-slate-700">{s.stage_name}</span>
                        <span className="text-slate-500">{s.deal_count} · ${Number(s.total_value || 0).toLocaleString()}</span>
                      </div>
                      <div className="h-3 rounded-md bg-slate-100 overflow-hidden">
                        <div className={`h-full ${isWon ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : isLost ? "bg-gradient-to-r from-rose-300 to-rose-500" : "bg-gradient-to-r from-blue-400 to-blue-600"}`} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stages table */}
          <div className="spark-mini-card">
            <div className="spark-mini-card-header">
              <span className="spark-mini-card-title">Stages</span>
              <button onClick={() => setStageDrawer(true)} className="spark-btn spark-btn-sm spark-btn-primary">
                <Plus className="h-3 w-3" /> Add stage
              </button>
            </div>
            {stages.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">No stages yet. Add your first stage to get started.</div>
            ) : (
              <div className="space-y-1">
                {stages.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200">
                    <span className="text-xs text-slate-400 w-8 text-right font-mono">#{s.sort_order + 1}</span>
                    <span className="font-medium text-sm flex-1">{s.name}</span>
                    <span className="text-xs text-slate-500">win: {s.win_probability}%</span>
                    {s.is_won && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Won</span>}
                    {s.is_lost && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-rose-100 text-rose-700">Lost</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* New pipeline drawer */}
      <SparkDrawer
        open={pipelineDrawer}
        onClose={() => setPipelineDrawer(false)}
        title="New pipeline"
        subtitle="Most businesses only need one. Add multiple if you sell to distinct customer segments with different sales cycles."
        footer={
          <>
            <button onClick={() => setPipelineDrawer(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createPipeline} disabled={!pipelineForm.name.trim()} className="spark-btn spark-btn-primary">Create pipeline</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Name</label>
          <input className="spark-field-input" value={pipelineForm.name} onChange={e => setPipelineForm({ ...pipelineForm, name: e.target.value })} placeholder="Main sales pipeline" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Description</label>
          <textarea className="spark-field-textarea" value={pipelineForm.description} onChange={e => setPipelineForm({ ...pipelineForm, description: e.target.value })} placeholder="Optional — used for internal context only" />
        </div>
      </SparkDrawer>

      {/* Add stage drawer */}
      <SparkDrawer
        open={stageDrawer}
        onClose={() => setStageDrawer(false)}
        title="Add stage"
        subtitle="Stages map to your sales process. Mark Won/Lost to capture closed deals."
        footer={
          <>
            <button onClick={() => setStageDrawer(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={addStage} disabled={!stageForm.name.trim()} className="spark-btn spark-btn-primary">Add stage</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Stage name</label>
          <input className="spark-field-input" value={stageForm.name} onChange={e => setStageForm({ ...stageForm, name: e.target.value })} placeholder="Discovery / Proposal Sent / Negotiation" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Win probability ({stageForm.win_probability}%)</label>
          <input type="range" min={0} max={100} step={5} value={stageForm.win_probability} onChange={e => setStageForm({ ...stageForm, win_probability: Number(e.target.value) })} className="w-full" />
        </div>
        <div className="spark-field">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={stageForm.is_won} onChange={e => setStageForm({ ...stageForm, is_won: e.target.checked, is_lost: e.target.checked ? false : stageForm.is_lost })} />
            <span>This is the "Won" stage</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer mt-1">
            <input type="checkbox" checked={stageForm.is_lost} onChange={e => setStageForm({ ...stageForm, is_lost: e.target.checked, is_won: e.target.checked ? false : stageForm.is_won })} />
            <span>This is the "Lost" stage</span>
          </label>
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkPipelinesPage;

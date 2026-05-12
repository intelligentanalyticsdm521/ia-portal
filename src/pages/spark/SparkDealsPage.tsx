import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

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
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", value: 0, stage_id: 0 });

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
      if (r.data?.[0]) setCreateForm(f => ({ ...f, stage_id: r.data[0].id }));
    } catch (err) { setError(err); }
  }, [get, ready, pipelineId]);

  const loadDeals = useCallback(async () => {
    if (!ready || !pipelineId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await get<{ data: Deal[] }>(`/api/v1/deals?pipeline_id=${pipelineId}&limit=200`);
      setDeals(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready, pipelineId]);

  useEffect(() => { loadPipelines(); }, [loadPipelines]);
  useEffect(() => { loadStages(); }, [loadStages]);
  useEffect(() => { loadDeals(); }, [loadDeals]);

  async function moveDeal(dealId: number, stageId: number) {
    try {
      await post(`/api/v1/deals/${dealId}/move`, { stage_id: stageId });
      await loadDeals();
    } catch (err) { setError(err); }
  }

  async function createDeal() {
    if (!createForm.title.trim() || !pipelineId || !createForm.stage_id) return;
    try {
      await post("/api/v1/deals", {
        pipeline_id: pipelineId, stage_id: createForm.stage_id,
        title: createForm.title.trim(), value: createForm.value,
      });
      setShowCreate(false);
      setCreateForm({ title: "", value: 0, stage_id: stages[0]?.id || 0 });
      await loadDeals();
    } catch (err) { setError(err); }
  }

  async function markWon(d: Deal) {
    const winStage = stages.find(s => s.is_won);
    try {
      await put(`/api/v1/deals/${d.id}`, {
        status: "won",
        stage_id: winStage?.id || d.stage_id,
        actual_close_date: new Date().toISOString().slice(0, 10),
      });
      await loadDeals();
    } catch (err) { setError(err); }
  }

  async function markLost(d: Deal) {
    const lossStage = stages.find(s => s.is_lost);
    try {
      await put(`/api/v1/deals/${d.id}`, {
        status: "lost",
        stage_id: lossStage?.id || d.stage_id,
        actual_close_date: new Date().toISOString().slice(0, 10),
      });
      await loadDeals();
    } catch (err) { setError(err); }
  }

  const stageOpenDeals = (stageId: number) => deals.filter(d => d.stage_id === stageId && d.status === "open");

  return (
    <OliverPageWrapper title="Deals" subtitle="Drag deals through your pipeline" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card mb-4">
          <div className="card-hdr">
            <div className="card-ttl">Pipeline</div>
          </div>
          <div className="p-4 flex flex-wrap items-center gap-3">
            <select value={pipelineId || ""} onChange={e => setPipelineId(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm">
              {pipelines.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
            <button onClick={() => setShowCreate(true)} className="ml-auto px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New deal</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {stages.filter(s => !s.is_won && !s.is_lost).map(stage => {
            const open = stageOpenDeals(stage.id);
            const totalVal = open.reduce((a, d) => a + Number(d.value || 0), 0);
            return (
              <div key={stage.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[200px]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs uppercase font-medium text-gray-600">{stage.name}</div>
                  <div className="text-xs text-gray-500">{open.length} / ${totalVal.toLocaleString()}</div>
                </div>
                <div className="space-y-2">
                  {open.map(d => (
                    <div key={d.id} className="bg-white border border-gray-200 rounded-md p-2 shadow-sm">
                      <div className="text-sm font-medium">{d.title}</div>
                      <div className="text-xs text-gray-500">${Number(d.value).toLocaleString()} · {d.currency}</div>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {stages.filter(s => !s.is_won && !s.is_lost && s.id !== d.stage_id).slice(0, 2).map(s => (
                          <button key={s.id} onClick={() => moveDeal(d.id, s.id)}
                            className="text-[10px] bg-gray-100 hover:bg-blue-100 px-1.5 py-0.5 rounded">→ {s.name}</button>
                        ))}
                        <button onClick={() => markWon(d)} className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded hover:bg-emerald-200">Won</button>
                        <button onClick={() => markLost(d)} className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded hover:bg-rose-200">Lost</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">Create deal</div>
              <div className="space-y-3">
                <input placeholder="Deal title" value={createForm.title} onChange={e => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input type="number" placeholder="Value" value={createForm.value || ""} onChange={e => setCreateForm({ ...createForm, value: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <select value={createForm.stage_id || ""} onChange={e => setCreateForm({ ...createForm, stage_id: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  {stages.filter(s => !s.is_won && !s.is_lost).map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={createDeal} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkDealsPage;

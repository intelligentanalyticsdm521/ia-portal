import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

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
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newStageName, setNewStageName] = useState("");

  const loadPipelines = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
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
    if (!newPipelineName.trim()) return;
    try {
      await post("/api/v1/pipelines", { name: newPipelineName.trim() });
      setNewPipelineName("");
      await loadPipelines();
    } catch (err) { setError(err); }
  }

  async function addStage() {
    if (!newStageName.trim() || !selectedId) return;
    try {
      await post(`/api/v1/pipelines/${selectedId}/stages`, {
        name: newStageName.trim(),
        sort_order: stages.length,
        win_probability: 50,
      });
      setNewStageName("");
      await loadStagesAndFunnel();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="Sales Pipeline" subtitle="Multi-stage opportunity tracking" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card mb-4">
          <div className="card-hdr"><div className="card-ttl">Pipelines</div></div>
          <div className="p-4 flex flex-wrap items-center gap-3">
            {pipelines.map(p => (
              <button key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`px-3 py-1.5 rounded-md text-sm border ${selectedId === p.id ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-gray-300 hover:bg-gray-50"}`}>
                {p.name}{p.is_default ? " *" : ""}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              <input value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)}
                placeholder="New pipeline name…" className="border border-gray-300 rounded-md px-2 py-1 text-sm" />
              <button onClick={createPipeline} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">Create</button>
            </div>
          </div>
        </div>

        {selectedId && (
          <>
            <div className="card mb-4">
              <div className="card-hdr"><div className="card-ttl">Funnel (open deals)</div></div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                {funnel.map(s => (
                  <div key={s.stage_id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                    <div className="text-xs uppercase text-gray-500">{s.stage_name}</div>
                    <div className="text-xl font-semibold mt-1">{s.deal_count}</div>
                    <div className="text-sm text-gray-600 mt-0.5">${Number(s.total_value || 0).toLocaleString()}</div>
                  </div>
                ))}
                {funnel.length === 0 && <div className="text-sm text-gray-500">No stages defined yet.</div>}
              </div>
            </div>

            <div className="card">
              <div className="card-hdr"><div className="card-ttl">Stages</div></div>
              <div className="p-4">
                <div className="space-y-2">
                  {stages.map(s => (
                    <div key={s.id} className="flex items-center gap-3 border border-gray-200 rounded-md p-2">
                      <span className="text-xs text-gray-500 w-8 text-right">#{s.sort_order}</span>
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-gray-500">win %: {s.win_probability}</span>
                      {s.is_won && <span className="text-xs text-emerald-700 bg-emerald-100 px-2 rounded">won</span>}
                      {s.is_lost && <span className="text-xs text-rose-700 bg-rose-100 px-2 rounded">lost</span>}
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex gap-2">
                  <input value={newStageName} onChange={e => setNewStageName(e.target.value)}
                    placeholder="New stage name…" className="border border-gray-300 rounded-md px-2 py-1 text-sm flex-1" />
                  <button onClick={addStage} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">Add stage</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkPipelinesPage;

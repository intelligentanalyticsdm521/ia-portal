// SparkAbTestsPage — A/B test campaigns
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Plus, Trophy, Beaker } from "lucide-react";

interface ABTest {
  id: number;
  name: string;
  variant_a_campaign_id: number;
  variant_b_campaign_id: number;
  split_pct: number;
  winner_metric: string;
  status: "draft" | "running" | "completed";
  winner_variant: "A" | "B" | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Campaign { id: number; name: string; status: string; }

interface VariantResults {
  campaign_id: number;
  delivered: number;
  opened: number;
  clicked: number;
  open_rate: number;
  click_rate: number;
}

export function SparkAbTestsPage() {
  const { get, post, ready } = useSparkApi();
  const [tests, setTests] = useState<ABTest[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<ABTest | null>(null);
  const [results, setResults] = useState<{ A?: VariantResults; B?: VariantResults } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", a: "", b: "", split: 50, metric: "open_rate" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchTests = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const [t, c] = await Promise.all([
        get<{ data: ABTest[] }>("/api/v1/ab-tests"),
        get<{ data: Campaign[] }>("/api/v1/campaigns"),
      ]);
      setTests(t?.data || []);
      setCampaigns(c?.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);

  useEffect(() => { fetchTests(); }, [fetchTests]);

  async function viewResults(t: ABTest) {
    setSelected(t);
    setResults(null);
    try {
      const r = await get<{ data: { variants: { A?: VariantResults; B?: VariantResults } } }>(`/api/v1/ab-tests/${t.id}/results`);
      setResults(r?.data?.variants || {});
    } catch { setResults({}); }
  }

  async function createTest() {
    if (!form.name || !form.a || !form.b) return;
    try {
      await post("/api/v1/ab-tests", {
        name: form.name,
        variant_a_campaign_id: Number(form.a),
        variant_b_campaign_id: Number(form.b),
        split_pct: form.split,
        winner_metric: form.metric,
      });
      setCreating(false);
      setForm({ name: "", a: "", b: "", split: 50, metric: "open_rate" });
      await fetchTests();
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  async function declareWinner(testId: number, winner: "A" | "B") {
    if (!confirm(`Declare variant ${winner} the winner?`)) return;
    try {
      await post(`/api/v1/ab-tests/${testId}/declare-winner`, { winner });
      await fetchTests();
      if (selected?.id === testId) await viewResults({ ...selected, status: "completed", winner_variant: winner });
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
  }

  return (
    <SparkPageShell
      title="A/B Tests"
      subtitle={`${tests.length} test${tests.length === 1 ? "" : "s"}`}
      help="Pit two campaign variants against each other on the same audience. Pick the winning metric (open rate, click rate, conversion) and declare a winner once enough data has come in."
      actions={
        <button onClick={() => setCreating(true)}
          className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] hover:bg-[#d75a25] text-white flex items-center gap-1">
          <Plus className="h-4 w-4" /> New A/B test
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="overflow-x-auto">
        <table className="spark-table">
          <thead><tr><th>Name</th><th>Variants</th><th>Split</th><th>Winning metric</th><th>Status</th><th>Winner</th><th></th></tr></thead>
          <tbody>
            {tests.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-slate-500 py-8">No tests yet. Create one to compare two campaigns head-to-head.</td></tr>}
            {tests.map(t => (
              <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => viewResults(t)}>
                <td className="font-medium">{t.name}</td>
                <td className="text-xs text-slate-600">#{t.variant_a_campaign_id} vs #{t.variant_b_campaign_id}</td>
                <td className="text-xs">{t.split_pct}% / {100 - t.split_pct}%</td>
                <td className="text-xs uppercase">{t.winner_metric.replace("_", " ")}</td>
                <td><span className={`px-2 py-0.5 rounded text-[11px] border ${t.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : t.status === "running" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>{t.status}</span></td>
                <td>{t.winner_variant ? <span className="font-bold text-[#EF6C33]">{t.winner_variant}</span> : <span className="text-slate-400">—</span>}</td>
                <td className="text-xs text-slate-500">{new Date(t.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      {creating && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="text-base font-semibold">New A/B test</div>
            <input placeholder="Test name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full text-sm border border-slate-300 rounded p-2" />
            <div className="grid grid-cols-2 gap-2">
              <select value={form.a} onChange={(e) => setForm({ ...form, a: e.target.value })} className="text-sm border border-slate-300 rounded p-2">
                <option value="">Variant A...</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={form.b} onChange={(e) => setForm({ ...form, b: e.target.value })} className="text-sm border border-slate-300 rounded p-2">
                <option value="">Variant B...</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-600">Split: {form.split}% / {100 - form.split}%</label>
              <input type="range" min={10} max={90} value={form.split} onChange={(e) => setForm({ ...form, split: Number(e.target.value) })} className="w-full" />
            </div>
            <select value={form.metric} onChange={(e) => setForm({ ...form, metric: e.target.value })} className="w-full text-sm border border-slate-300 rounded p-2">
              <option value="open_rate">Open rate</option>
              <option value="click_rate">Click rate</option>
              <option value="conversion">Conversion</option>
            </select>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setCreating(false)} className="text-sm px-3 py-1.5 rounded border border-slate-200">Cancel</button>
              <button onClick={createTest} className="text-sm px-3 py-1.5 rounded bg-[#EF6C33] text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Results panel */}
      {selected && (
        <div className="fixed inset-0 bg-slate-900/30 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-xl w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <div className="text-xs uppercase text-slate-500 font-bold">A/B test</div>
                <div className="text-lg font-semibold">{selected.name}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-slate-500 hover:text-slate-700">Close</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {(["A", "B"] as const).map(v => {
                const r = results?.[v];
                const isWinner = selected.winner_variant === v;
                return (
                  <div key={v} className={`border-2 rounded-lg p-4 ${isWinner ? "border-[#EF6C33] bg-[#FFF6F0]" : "border-slate-200"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-2xl font-bold">{v}</div>
                      {isWinner && <Trophy className="h-5 w-5 text-[#EF6C33]" />}
                    </div>
                    <div className="text-xs text-slate-500 mb-3">Campaign #{v === "A" ? selected.variant_a_campaign_id : selected.variant_b_campaign_id}</div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <Metric label="Delivered" value={r?.delivered || 0} />
                      <Metric label="Opened"    value={r?.opened || 0} />
                      <Metric label="Open %"    value={`${r?.open_rate ?? 0}%`} />
                      <Metric label="Click %"   value={`${r?.click_rate ?? 0}%`} />
                    </div>
                  </div>
                );
              })}
            </div>
            {selected.status !== "completed" && results?.A && results?.B && (
              <div className="border-t border-slate-200 pt-3 flex justify-end gap-2">
                <button onClick={() => declareWinner(selected.id, "A")}
                  className="text-sm px-3 py-1.5 rounded border border-[#EF6C33] text-[#EF6C33]">Declare A winner</button>
                <button onClick={() => declareWinner(selected.id, "B")}
                  className="text-sm px-3 py-1.5 rounded border border-[#EF6C33] text-[#EF6C33]">Declare B winner</button>
              </div>
            )}
          </div>
        </div>
      )}
    </SparkPageShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-slate-500 font-semibold">{label}</div>
      <div className="text-base font-bold text-slate-900">{value}</div>
    </div>
  );
}

export default SparkAbTestsPage;

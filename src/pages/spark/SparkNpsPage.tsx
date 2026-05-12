import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface NpsResponse {
  id: number; contact_id: number | null; score: number; category: string;
  comment: string | null; request_source: string | null; created_at: string;
}
interface NpsSummary { total: number; promoters: number; passives: number; detractors: number; nps: number; window_days: number; }

export function SparkNpsPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<NpsResponse[]>([]);
  const [summary, setSummary] = useState<NpsSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ score: 8, comment: "", contact_id: "" });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: NpsResponse[] }>("/api/v1/nps");
      setList(r.data || []);
      const s = await get<{ data: NpsSummary }>("/api/v1/nps/summary?days=90");
      setSummary(s.data);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    try {
      await post("/api/v1/nps", {
        score: Number(form.score), comment: form.comment || null,
        contact_id: form.contact_id ? Number(form.contact_id) : null,
        request_source: "manual",
      });
      setForm({ score: 8, comment: "", contact_id: "" });
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="NPS" subtitle="Net Promoter Score — last 90 days" error={error} loading={loading}>
      <div className="arion-page">
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="card p-4">
              <div className="text-xs uppercase text-gray-500">NPS</div>
              <div className={`text-3xl font-semibold mt-1 ${summary.nps >= 50 ? "text-emerald-600" : summary.nps >= 0 ? "text-amber-600" : "text-rose-600"}`}>{summary.nps}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase text-emerald-600">Promoters</div>
              <div className="text-3xl font-semibold mt-1">{summary.promoters}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase text-amber-600">Passives</div>
              <div className="text-3xl font-semibold mt-1">{summary.passives}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs uppercase text-rose-600">Detractors</div>
              <div className="text-3xl font-semibold mt-1">{summary.detractors}</div>
            </div>
          </div>
        )}

        <div className="card mb-4">
          <div className="card-hdr"><div className="card-ttl">Submit response</div></div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <div className="text-xs text-gray-500 mb-1">Score (0–10)</div>
              <input type="number" min={0} max={10} value={form.score} onChange={e => setForm({ ...form, score: Number(e.target.value) })}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="text-sm">
              <div className="text-xs text-gray-500 mb-1">Contact ID (optional)</div>
              <input value={form.contact_id} onChange={e => setForm({ ...form, contact_id: e.target.value })}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <label className="text-sm md:col-span-3">
              <div className="text-xs text-gray-500 mb-1">Comment</div>
              <textarea value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })}
                rows={2} className="w-full border border-gray-300 rounded-md px-2 py-1.5" />
            </label>
            <div className="md:col-span-3">
              <button onClick={submit} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">Submit</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-hdr"><div className="card-ttl">Recent responses</div></div>
          <table className="data-table">
            <thead><tr><th>Score</th><th>Category</th><th>Source</th><th>Comment</th><th>When</th></tr></thead>
            <tbody>
              {list.map(r => (
                <tr key={r.id}>
                  <td><span className={`inline-block rounded-full w-7 h-7 text-center leading-7 text-xs font-medium ${r.category === "promoter" ? "bg-emerald-100 text-emerald-700" : r.category === "passive" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{r.score}</span></td>
                  <td className="capitalize">{r.category}</td>
                  <td className="text-xs text-gray-500">{r.request_source || "—"}</td>
                  <td className="text-sm">{r.comment || "—"}</td>
                  <td className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No responses yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

export default SparkNpsPage;

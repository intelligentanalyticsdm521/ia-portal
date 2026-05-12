import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Account {
  id: number; name: string; industry: string | null; employee_count: string | null;
  annual_revenue: number | null; website: string | null; domain: string | null;
  health_score: number | null; health_band: string | null;
  last_engagement_at: string | null; created_at: string;
}

const HEALTH_COLORS: Record<string, string> = {
  thriving: "bg-emerald-100 text-emerald-700",
  healthy: "bg-blue-100 text-blue-700",
  at_risk: "bg-amber-100 text-amber-700",
  churning: "bg-rose-100 text-rose-700",
};

export function SparkAccountsPage() {
  const { get, post, ready } = useSparkApi();
  const [list, setList] = useState<Account[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", industry: "", website: "", domain: "" });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: Account[] }>("/api/v1/lumen-accounts");
      setList(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!form.name.trim()) return;
    try {
      await post("/api/v1/lumen-accounts", form);
      setShowCreate(false);
      setForm({ name: "", industry: "", website: "", domain: "" });
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="B2B Accounts" subtitle="Group multiple contacts under a single account with health scoring" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">Accounts</div>
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New account</button>
          </div>
          <table className="data-table text-sm">
            <thead><tr><th>Name</th><th>Industry</th><th>Revenue</th><th>Health</th><th>Last engagement</th></tr></thead>
            <tbody>
              {list.map(a => (
                <tr key={a.id}>
                  <td className="font-medium">{a.name}{a.website ? <a href={a.website} target="_blank" rel="noreferrer" className="ml-2 text-xs text-blue-700">↗</a> : null}</td>
                  <td className="text-sm text-gray-700">{a.industry || "—"}</td>
                  <td className="text-sm">{a.annual_revenue ? `$${Number(a.annual_revenue).toLocaleString()}` : "—"}</td>
                  <td>
                    {a.health_band
                      ? <span className={`px-2 py-0.5 text-xs rounded capitalize ${HEALTH_COLORS[a.health_band] || "bg-gray-100 text-gray-700"}`}>{a.health_band.replace("_", " ")}</span>
                      : <span className="text-xs text-gray-500">—</span>}
                    {a.health_score !== null && <span className="ml-2 text-xs text-gray-500">{a.health_score}</span>}
                  </td>
                  <td className="text-xs text-gray-500">{a.last_engagement_at ? new Date(a.last_engagement_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-500">No accounts yet</td></tr>}
            </tbody>
          </table>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">New B2B account</div>
              <div className="space-y-3">
                <input placeholder="Account name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Industry" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Website" value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Domain (e.g. acme.com)" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={create} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Create</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkAccountsPage;

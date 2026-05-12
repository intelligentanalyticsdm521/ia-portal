import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Program { id: number; name: string; reward_type: string; reward_value: string | null; is_active: boolean; }
interface Referral { id: number; program_id: number; referrer_contact_id: number; referred_email: string | null; referral_code: string; status: string; created_at: string; referrer_first_name?: string; referrer_last_name?: string; }
interface LeaderRow { referrer_contact_id: number; first_name: string | null; last_name: string | null; total_referrals: number; rewarded_count: number; }

export function SparkReferralsPage() {
  const { get, post, ready } = useSparkApi();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState<"program" | "referral" | null>(null);
  const [progForm, setProgForm] = useState({ name: "", reward_type: "discount", reward_value: "" });
  const [refForm, setRefForm] = useState({ program_id: 0, referrer_contact_id: "", referred_email: "" });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const [p, r, lb] = await Promise.all([
        get<{ data: Program[] }>("/api/v1/referral-programs"),
        get<{ data: Referral[] }>("/api/v1/referrals"),
        get<{ data: LeaderRow[] }>("/api/v1/referrals/leaderboard"),
      ]);
      setPrograms(p.data || []);
      setReferrals(r.data || []);
      setLeaderboard(lb.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function createProgram() {
    try {
      await post("/api/v1/referral-programs", progForm);
      setShowCreate(null);
      setProgForm({ name: "", reward_type: "discount", reward_value: "" });
      await load();
    } catch (err) { setError(err); }
  }

  async function createReferral() {
    try {
      await post("/api/v1/referrals", {
        program_id: Number(refForm.program_id),
        referrer_contact_id: Number(refForm.referrer_contact_id),
        referred_email: refForm.referred_email,
      });
      setShowCreate(null);
      setRefForm({ program_id: 0, referrer_contact_id: "", referred_email: "" });
      await load();
    } catch (err) { setError(err); }
  }

  return (
    <OliverPageWrapper title="Referrals" subtitle="Referral programs + tracking" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card mb-4">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">Programs</div>
            <button onClick={() => setShowCreate("program")} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ New program</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Reward</th><th>Status</th></tr></thead>
            <tbody>
              {programs.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-sm">{p.reward_type}: {p.reward_value || "—"}</td>
                  <td>{p.is_active ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs rounded">Active</span> : <span className="text-gray-500 text-xs">Inactive</span>}</td>
                </tr>
              ))}
              {programs.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No programs</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="card">
            <div className="card-hdr flex items-center justify-between">
              <div className="card-ttl">Recent referrals</div>
              <button onClick={() => setShowCreate("referral")} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ Add</button>
            </div>
            <table className="data-table text-sm">
              <thead><tr><th>Code</th><th>Referrer</th><th>Referred</th><th>Status</th></tr></thead>
              <tbody>
                {referrals.slice(0, 25).map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.referral_code}</td>
                    <td>{r.referrer_first_name || ""} {r.referrer_last_name || ""}</td>
                    <td className="text-xs">{r.referred_email || "—"}</td>
                    <td><span className="text-xs capitalize">{r.status}</span></td>
                  </tr>
                ))}
                {referrals.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-500">No referrals</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card-hdr"><div className="card-ttl">Leaderboard (top referrers)</div></div>
            <table className="data-table text-sm">
              <thead><tr><th>Referrer</th><th>Total</th><th>Rewarded</th></tr></thead>
              <tbody>
                {leaderboard.map(r => (
                  <tr key={r.referrer_contact_id}>
                    <td>{r.first_name || ""} {r.last_name || ""}</td>
                    <td className="font-medium">{r.total_referrals}</td>
                    <td className="text-emerald-700">{r.rewarded_count}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && <tr><td colSpan={3} className="text-center py-4 text-gray-500">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {showCreate === "program" && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">New referral program</div>
              <div className="space-y-3">
                <input placeholder="Program name" value={progForm.name} onChange={e => setProgForm({ ...progForm, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <select value={progForm.reward_type} onChange={e => setProgForm({ ...progForm, reward_type: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="discount">Discount</option><option value="credit">Account credit</option>
                  <option value="gift_card">Gift card</option><option value="custom">Custom</option>
                </select>
                <input placeholder="Reward value (e.g. $50 off)" value={progForm.reward_value} onChange={e => setProgForm({ ...progForm, reward_value: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(null)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={createProgram} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Create</button>
              </div>
            </div>
          </div>
        )}

        {showCreate === "referral" && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">Log a referral</div>
              <div className="space-y-3">
                <select value={refForm.program_id || ""} onChange={e => setRefForm({ ...refForm, program_id: Number(e.target.value) })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="">Select program…</option>
                  {programs.filter(p => p.is_active).map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
                <input placeholder="Referrer contact ID" value={refForm.referrer_contact_id} onChange={e => setRefForm({ ...refForm, referrer_contact_id: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <input placeholder="Referred email (optional)" value={refForm.referred_email} onChange={e => setRefForm({ ...refForm, referred_email: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(null)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={createReferral} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Log referral</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkReferralsPage;

import { useEffect, useState, useCallback } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { Plus, Gift, Users, Trophy } from "lucide-react";

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
  const [drawer, setDrawer] = useState<"program" | "referral" | null>(null);
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
    if (!progForm.name.trim()) return;
    await post("/api/v1/referral-programs", progForm);
    setProgForm({ name: "", reward_type: "discount", reward_value: "" });
    setDrawer(null);
    await load();
  }

  async function createReferral() {
    if (!refForm.program_id || !refForm.referrer_contact_id) return;
    await post("/api/v1/referrals", {
      program_id: Number(refForm.program_id),
      referrer_contact_id: Number(refForm.referrer_contact_id),
      referred_email: refForm.referred_email,
    });
    setRefForm({ program_id: 0, referrer_contact_id: "", referred_email: "" });
    setDrawer(null);
    await load();
  }

  const rewardedCount = referrals.filter(r => r.status === "rewarded").length;
  const activeProgs = programs.filter(p => p.is_active).length;

  return (
    <SparkPageShell
      title="Referrals"
      subtitle="Referral programs + tracking"
      actions={
        <div className="flex gap-2">
          <button onClick={() => setDrawer("program")} className="spark-btn spark-btn-secondary">
            <Gift className="h-3.5 w-3.5" /> New program
          </button>
          <button onClick={() => setDrawer("referral")} className="spark-btn spark-btn-accent" disabled={!programs.length}>
            <Plus className="h-3.5 w-3.5" /> Log referral
          </button>
        </div>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Active programs", value: activeProgs, icon: Gift, accent: "blue" },
          { label: "Total referrals", value: referrals.length, icon: Users },
          { label: "Rewarded", value: rewardedCount, icon: Trophy, accent: "emerald" },
        ]} />
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Programs */}
        <div className="lg:col-span-2 spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">Programs</span>
            <span className="text-xs text-slate-500">{programs.length}</span>
          </div>
          <SparkTable<Program>
            rows={programs}
            getRowKey={p => p.id}
            emptyState="No programs yet. Create one to start tracking referrals."
            columns={[
              { key: "name", header: "Program", cell: p => <span className="font-medium">{p.name}</span>, width: "wide" },
              { key: "reward", header: "Reward", cell: p => <span className="text-sm">{p.reward_type}: {p.reward_value || "—"}</span> },
              { key: "status", header: "Status", width: "compact",
                cell: p => p.is_active
                  ? <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Active</span>
                  : <span className="text-xs text-slate-400">Inactive</span>
              },
            ]}
          />
        </div>

        {/* Leaderboard */}
        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">Leaderboard</span>
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
          </div>
          {leaderboard.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500">No referrals yet</div>
          ) : (
            <div className="space-y-1">
              {leaderboard.slice(0, 10).map((r, i) => (
                <div key={r.referrer_contact_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50">
                  <span className="text-xs font-mono text-slate-400 w-4">{i + 1}</span>
                  <span className="text-sm font-medium flex-1 truncate">{r.first_name || ""} {r.last_name || ""}</span>
                  <span className="text-xs text-slate-500">{r.total_referrals}</span>
                  {r.rewarded_count > 0 && <span className="text-xs text-emerald-600">({r.rewarded_count} rewarded)</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent referrals — full width below */}
      <div className="spark-mini-card mt-4">
        <div className="spark-mini-card-header">
          <span className="spark-mini-card-title">Recent referrals</span>
          <span className="text-xs text-slate-500">{referrals.length}</span>
        </div>
        <SparkTable<Referral>
          rows={referrals.slice(0, 50)}
          getRowKey={r => r.id}
          emptyState="No referrals logged yet."
          columns={[
            { key: "code", header: "Code", width: "compact",
              cell: r => <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{r.referral_code}</span>,
            },
            { key: "referrer", header: "Referrer", cell: r => <span className="font-medium">{r.referrer_first_name || ""} {r.referrer_last_name || ""}</span> },
            { key: "referred", header: "Referred", cell: r => r.referred_email || "—", hideOnMobile: true },
            { key: "status", header: "Status", width: "compact",
              cell: r => <span className={`text-xs px-2 py-0.5 rounded capitalize ${r.status === "rewarded" ? "bg-emerald-100 text-emerald-700" : r.status === "qualified" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{r.status}</span>,
            },
            { key: "when", header: "When", width: "compact", hideOnMobile: true,
              cell: r => <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span>,
            },
          ]}
        />
      </div>

      <SparkDrawer
        open={drawer === "program"}
        onClose={() => setDrawer(null)}
        title="New referral program"
        subtitle="Define what rewards referrers (and optionally the referee) when a referral converts."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createProgram} disabled={!progForm.name.trim()} className="spark-btn spark-btn-primary">Create program</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Program name</label>
          <input className="spark-field-input" value={progForm.name} onChange={e => setProgForm({ ...progForm, name: e.target.value })} placeholder="Friends & Family" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Reward type</label>
          <select className="spark-field-select" value={progForm.reward_type} onChange={e => setProgForm({ ...progForm, reward_type: e.target.value })}>
            <option value="discount">Discount</option>
            <option value="credit">Account credit</option>
            <option value="gift_card">Gift card</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Reward value</label>
          <input className="spark-field-input" value={progForm.reward_value} onChange={e => setProgForm({ ...progForm, reward_value: e.target.value })} placeholder="$50 off / 20% / $25 Amazon gift card" />
        </div>
      </SparkDrawer>

      <SparkDrawer
        open={drawer === "referral"}
        onClose={() => setDrawer(null)}
        title="Log a referral"
        subtitle="Record that an existing contact referred someone."
        footer={
          <>
            <button onClick={() => setDrawer(null)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createReferral} disabled={!refForm.program_id || !refForm.referrer_contact_id} className="spark-btn spark-btn-primary">Log referral</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Program</label>
          <select className="spark-field-select" value={refForm.program_id || ""} onChange={e => setRefForm({ ...refForm, program_id: Number(e.target.value) })}>
            <option value="">Select program…</option>
            {programs.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Referrer contact ID</label>
          <input className="spark-field-input" value={refForm.referrer_contact_id} onChange={e => setRefForm({ ...refForm, referrer_contact_id: e.target.value })} placeholder="123" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Referred person email (optional)</label>
          <input className="spark-field-input" value={refForm.referred_email} onChange={e => setRefForm({ ...refForm, referred_email: e.target.value })} placeholder="friend@example.com" />
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkReferralsPage;

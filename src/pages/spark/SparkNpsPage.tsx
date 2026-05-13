import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkTable } from "../../components/spark/SparkTable";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { Plus, Smile, Meh, Frown, Heart } from "lucide-react";

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState("all");
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
      setDrawerOpen(false);
      await load();
    } catch (err) { setError(err); }
  }

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter(r => r.category === filter);
  }, [list, filter]);

  return (
    <SparkPageShell
      title="NPS"
      subtitle="Net Promoter Score — 90-day rolling"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> Submit response
        </button>
      }
      stats={
        summary
          ? <SparkStatStrip stats={[
              { label: "NPS Score", value: summary.nps, accent: summary.nps >= 50 ? "emerald" : summary.nps >= 0 ? "amber" : "rose" },
              { label: "Promoters", value: summary.promoters, icon: Smile, accent: "emerald" },
              { label: "Passives", value: summary.passives, icon: Meh, accent: "amber" },
              { label: "Detractors", value: summary.detractors, icon: Frown, accent: "rose" },
            ]} />
          : undefined
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { key: "all", label: "All", count: list.length },
            { key: "promoter", label: "Promoters", count: list.filter(r => r.category === "promoter").length },
            { key: "passive", label: "Passives", count: list.filter(r => r.category === "passive").length },
            { key: "detractor", label: "Detractors", count: list.filter(r => r.category === "detractor").length },
          ]}
        />
      }
      loading={loading}
      error={error}
    >
      <SparkTable<NpsResponse>
        rows={filtered}
        getRowKey={r => r.id}
        emptyState="No NPS responses yet. Click 'Submit response' to record one."
        totalCount={filtered.length}
        columns={[
          { key: "score", header: "Score", width: "narrow",
            cell: r => (
              <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${r.category === "promoter" ? "bg-emerald-100 text-emerald-700" : r.category === "passive" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                {r.score}
              </span>
            ),
          },
          { key: "category", header: "Category", width: "compact",
            cell: r => <span className="capitalize text-slate-700">{r.category}</span>,
          },
          { key: "source", header: "Source", width: "compact", hideOnMobile: true,
            cell: r => <span className="text-xs text-slate-500">{r.request_source || "—"}</span>,
          },
          { key: "comment", header: "Comment", width: "wide",
            cell: r => <span className="text-slate-700">{r.comment || <span className="text-slate-400">—</span>}</span>,
          },
          { key: "when", header: "When", width: "compact", hideOnMobile: true,
            cell: r => <span className="text-xs text-slate-500">{new Date(r.created_at).toLocaleDateString()}</span>,
          },
        ]}
      />

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Record NPS response"
        subtitle="On a scale of 0–10, how likely is this customer to recommend us?"
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={submit} className="spark-btn spark-btn-primary">Submit</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Score ({form.score})</label>
          <input type="range" min={0} max={10} value={form.score} onChange={e => setForm({ ...form, score: Number(e.target.value) })} className="w-full" />
          <div className="flex justify-between text-[10px] text-slate-500 mt-1">
            <span>0 detractor</span><span>7-8 passive</span><span>9-10 promoter</span>
          </div>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Contact ID (optional)</label>
          <input className="spark-field-input" value={form.contact_id} onChange={e => setForm({ ...form, contact_id: e.target.value })} placeholder="Leave blank for anonymous" />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Comment</label>
          <textarea className="spark-field-textarea" value={form.comment} onChange={e => setForm({ ...form, comment: e.target.value })} placeholder="What did they say?" rows={4} />
        </div>
        <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
          <Heart className="inline h-3 w-3 text-rose-500 mr-1" />
          Promoters (9-10) are your review-request candidates.
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkNpsPage;

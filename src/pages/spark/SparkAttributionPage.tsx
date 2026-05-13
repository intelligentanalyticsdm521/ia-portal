// SparkAttributionPage — Multi-touch attribution dashboard + per-contact journey viewer.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Activity, Search } from "lucide-react";

type Model = "first" | "last" | "linear" | "u-shaped";

interface ChannelRow { channel: string; credit: number; }
interface Touchpoint { id: number; contact_id: number; channel: string; source: string | null; campaign: string | null; page_url: string | null; occurred_at: string; }

const CHANNEL_COLORS: Record<string, string> = {
  email: "#3B82F6", sms: "#10B981", organic: "#8B5CF6", paid_search: "#EF6C33",
  social: "#F59E0B", referral: "#EC4899", direct: "#64748B", landing_page: "#0B1C24",
};

export function SparkAttributionPage() {
  const { get, ready } = useSparkApi();
  const [model, setModel] = useState<Model>("linear");
  const [days, setDays] = useState(30);
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [conversions, setConversions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [contactQuery, setContactQuery] = useState("");
  const [journey, setJourney] = useState<Touchpoint[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);

  const fetchReport = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ model: Model; conversions: number; channels: ChannelRow[] }>(`/api/v1/attribution/report?model=${model}&days=${days}`);
      setChannels(r?.channels || []);
      setConversions(r?.conversions || 0);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready, model, days]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  async function loadJourney() {
    const contactId = parseInt(contactQuery);
    if (!contactId) return alert("Enter a contact ID");
    setJourneyLoading(true);
    try {
      const r = await get<{ data: Touchpoint[] }>(`/api/v1/attribution/journey/${contactId}`);
      setJourney(r?.data || []);
    } catch (err) { alert(`Failed: ${(err as Error).message}`); }
    finally { setJourneyLoading(false); }
  }

  const totalCredit = channels.reduce((a, b) => a + b.credit, 0);

  return (
    <SparkPageShell
      title="Attribution"
      subtitle={`${conversions} conversions · ${model} model · last ${days} days`}
      help="Multi-touch attribution shows which marketing channels deserve credit for the leads-to-customer conversions in this window. First-touch credits the discovery channel; last-touch credits the closer; linear splits evenly; U-shaped weights first + last 40% each."
      filters={
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-xs font-semibold text-slate-600 mr-2">Model:</div>
          {(["first", "last", "linear", "u-shaped"] as Model[]).map(m => (
            <button key={m} onClick={() => setModel(m)}
              className={`text-xs px-3 py-1 rounded-full border ${model === m ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>
              {m}
            </button>
          ))}
          <div className="text-xs font-semibold text-slate-600 ml-3 mr-2">Window:</div>
          {[7, 30, 90, 180].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`text-xs px-3 py-1 rounded-full border ${days === d ? "bg-[#0B1C24] text-white border-[#0B1C24]" : "border-slate-200"}`}>
              {d}d
            </button>
          ))}
        </div>
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Channel credit chart */}
        <div className="lg:col-span-2 spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title">Credit by channel</span>
            <span className="text-xs text-slate-500">{totalCredit.toFixed(2)} total credit units</span>
          </div>
          {channels.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-12">
              No conversions in this window yet. Conversions = contacts that moved to stage='customer'.
            </div>
          ) : (
            <div className="space-y-2 p-2">
              {channels.map(c => {
                const pct = totalCredit > 0 ? (c.credit / totalCredit) * 100 : 0;
                const color = CHANNEL_COLORS[c.channel] || "#64748B";
                return (
                  <div key={c.channel}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium capitalize">{c.channel.replace("_", " ")}</span>
                      <span className="text-slate-500">{c.credit.toFixed(2)} · {pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Journey lookup */}
        <div className="spark-mini-card">
          <div className="spark-mini-card-header">
            <span className="spark-mini-card-title flex items-center gap-1"><Activity className="h-4 w-4" /> Contact journey</span>
          </div>
          <div className="p-2 space-y-2">
            <div className="flex gap-1">
              <input
                value={contactQuery}
                onChange={(e) => setContactQuery(e.target.value)}
                placeholder="Contact ID"
                className="flex-1 text-sm border border-slate-300 rounded p-1.5"
              />
              <button disabled={journeyLoading} onClick={loadJourney}
                className="text-sm px-3 py-1.5 rounded bg-[#0B1C24] text-white disabled:opacity-50 flex items-center gap-1">
                <Search className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {journey.length === 0 && !journeyLoading && (
                <div className="text-xs text-slate-500 text-center py-4">Enter a contact ID to see their full marketing journey.</div>
              )}
              {journey.map((t, i) => {
                const color = CHANNEL_COLORS[t.channel] || "#64748B";
                return (
                  <div key={t.id} className="flex gap-2 text-xs">
                    <div className="flex flex-col items-center">
                      <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                      {i < journey.length - 1 && <div className="w-px h-full bg-slate-200 mt-0.5" />}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="font-medium capitalize">{t.channel.replace("_", " ")}</div>
                      {(t.source || t.campaign) && <div className="text-slate-500">{[t.source, t.campaign].filter(Boolean).join(" · ")}</div>}
                      {t.page_url && <div className="text-slate-400 truncate text-[10px]">{t.page_url}</div>}
                      <div className="text-slate-400 text-[10px]">{new Date(t.occurred_at).toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </SparkPageShell>
  );
}

export default SparkAttributionPage;

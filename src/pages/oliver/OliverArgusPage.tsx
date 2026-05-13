// OliverArgusPage — ARGUS AI Insight Reports for OLIVER Business tier.
//
// Calls /argus/insights, displays 3-5 ranked insights with detail + recommended
// action, plus a brief summary card with the underlying numbers ARGUS used.
import { useCallback, useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { Sparkles, AlertTriangle, ArrowUpRight, Activity, RefreshCw, DollarSign, Briefcase, CreditCard } from "lucide-react";

interface Insight {
  priority: "high" | "medium" | "low";
  headline: string;
  detail: string;
  recommended_action: string;
}
interface Brief {
  period_days: number;
  revenue: number;
  cost: number;
  job_count: number;
  payment_count: number;
}
interface ArgusResponse {
  data: { insights: Insight[]; brief_summary: Brief };
  generated_at: string;
  cached: boolean;
}

const PRI_STYLES: Record<Insight["priority"], { border: string; bg: string; text: string; icon: typeof AlertTriangle }> = {
  high:   { border: "border-rose-300",    bg: "bg-rose-50",    text: "text-rose-800",    icon: AlertTriangle },
  medium: { border: "border-amber-300",   bg: "bg-amber-50",   text: "text-amber-800",   icon: Activity },
  low:    { border: "border-emerald-300", bg: "bg-emerald-50", text: "text-emerald-800", icon: ArrowUpRight },
};

export function OliverArgusPage() {
  const { get, ready } = useOliverApi();
  const [data, setData] = useState<ArgusResponse["data"] | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const fetchData = useCallback(async (refresh = false) => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<ArgusResponse>(`/argus/insights${refresh ? "?refresh=true" : ""}`);
      setData(r?.data || null);
      setGeneratedAt(r?.generated_at || null);
      setCached(r?.cached || false);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { fetchData(false); }, [fetchData]);

  const b = data?.brief_summary;
  const margin = b ? (b.revenue - b.cost) : 0;
  const marginPct = b && b.revenue > 0 ? ((margin / b.revenue) * 100) : 0;

  return (
    <OliverPageWrapper title="ARGUS Insights" subtitle="AI-generated business intelligence — refreshed daily" error={error} loading={loading}>
      {/* Header */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#FEC82C]" /> Your last {b?.period_days || 14} days
            </div>
            <div className="card-sub">
              {generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : "—"}
              {cached && <span className="text-[10px] uppercase ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">cached</span>}
            </div>
          </div>
          <button onClick={() => fetchData(true)} className="text-xs px-3 py-1.5 rounded border border-slate-200 flex items-center gap-1 hover:bg-slate-50">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        {b && (
          <div className="px-4 pb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={DollarSign} label="Revenue" value={`$${b.revenue.toFixed(0)}`} />
            <Stat icon={DollarSign} label="Cost" value={`$${b.cost.toFixed(0)}`} />
            <Stat icon={DollarSign} label="Margin" value={`${marginPct.toFixed(1)}%`}
              accent={marginPct < 15 ? "rose" : marginPct >= 30 ? "emerald" : "amber"} />
            <Stat icon={Briefcase} label="Jobs" value={b.job_count} />
          </div>
        )}
      </div>

      {/* Insights */}
      <div className="mt-3 space-y-3">
        {!data?.insights?.length && !loading && (
          <div className="card">
            <div className="p-6 text-center text-sm text-slate-500">No insights yet — ARGUS needs at least a few weeks of activity to learn your patterns.</div>
          </div>
        )}
        {data?.insights?.map((insight, i) => {
          const s = PRI_STYLES[insight.priority] || PRI_STYLES.low;
          const Icon = s.icon;
          return (
            <div key={i} className={`rounded-lg border-2 ${s.border} ${s.bg} p-4`}>
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 rounded-full p-2 bg-white border ${s.border}`}>
                  <Icon className={`h-4 w-4 ${s.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${s.bg} ${s.text} border ${s.border}`}>
                      {insight.priority} priority
                    </span>
                  </div>
                  <div className={`font-semibold text-slate-900`}>{insight.headline}</div>
                  <div className="text-sm text-slate-700 mt-1">{insight.detail}</div>
                  <div className="text-sm text-slate-800 mt-2 flex items-start gap-1">
                    <ArrowUpRight className="h-4 w-4 flex-shrink-0 mt-0.5 text-[#1A7DB5]" />
                    <span><strong>Recommended:</strong> {insight.recommended_action}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-slate-400 mt-4 text-center italic">
        ARGUS analyzes anonymized aggregates of your tenant's last 14 days. Recommendations are guidance, not financial or legal advice.
      </div>
    </OliverPageWrapper>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: typeof DollarSign; label: string; value: number | string; accent?: "rose" | "amber" | "emerald" }) {
  const color = accent === "rose" ? "text-rose-700" : accent === "amber" ? "text-amber-700" : accent === "emerald" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="p-2 rounded border border-slate-200 bg-white">
      <div className="text-[10px] uppercase font-semibold text-slate-500 flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

export default OliverArgusPage;

// ArionIAInsightsIntelligencePage — v9.5 LIVE.
//
// All 6 ARION Intelligence reports now run on real engines. Engines read
// the same multi-source data the ARION Trends page consumes (GA4, GSC,
// GBP, Bing, SE Ranking, IA Plugin) and produce IntelligenceReport.
import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { useAnalyticsData } from "../../analytics/useAnalyticsData";
import { useAccessToken } from "../../../auth/useAccessToken";
import { useAppState } from "../../../app/AppState";
import { Lock, TrendingUp, Users, DollarSign, Activity, Target, ArrowRight, X } from "lucide-react";
import { runAllArionIntelligence, type IntelligenceReport, type ArionIntelKey } from "../../analytics/arionIntelligenceEngines";
import type { EngineInput } from "../../analytics/trendEngines";

interface IntelReportMeta {
  key: ArionIntelKey;
  label: string;
  question: string;
  icon: typeof TrendingUp;
  modelType: string;
  minTier: "pro" | "business";
}

const INTEL_REPORTS: IntelReportMeta[] = [
  { key: "acquisition",     label: "Acquisition Efficiency",     question: "Is my digital presence producing customers, not just traffic?",      icon: TrendingUp,  modelType: "Visit → form → contact → job funnel (partial without SPARK/OLIVER)",     minTier: "pro" },
  { key: "lead_source",     label: "Lead Source Quality",        question: "Which channels produce the highest-LTV customers?",                   icon: Users,       modelType: "Source × LTV matrix (requires SPARK + OLIVER for full output)",          minTier: "business" },
  { key: "content_roi",     label: "Content ROI",                question: "Which content investments produce measurable business outcomes?",     icon: DollarSign,  modelType: "Per-page traffic + conversion + (SPARK) contact creation rate",          minTier: "pro" },
  { key: "rep_revenue",     label: "Reputation → Revenue",       question: "Does my online reputation measurably affect conversion?",             icon: Activity,    modelType: "GBP review signals × OLIVER booking rate correlation",                   minTier: "business" },
  { key: "visibility_traj", label: "Visibility Trajectory",      question: "Where will my search presence be in 90 days at current trajectory?",  icon: TrendingUp,  modelType: "Linear regression v1 on GSC impression history; Holt-Winters at 12mo",   minTier: "pro" },
  { key: "competitive",     label: "Competitive Presence Gap",   question: "How does my online presence compare to local market benchmarks?",     icon: Target,      modelType: "ARION trend scores × category benchmark dataset (radar comparison)",     minTier: "pro" },
];

function stateColor(state: IntelligenceReport["state"]): string {
  switch (state) {
    case "ok": return "#16A34A";
    case "partial": return "#EAB308";
    case "insufficient_data": return "#94A3B8";
    case "locked": return "#94A3B8";
  }
}
function stateBg(state: IntelligenceReport["state"]): string {
  switch (state) {
    case "ok": return "border-emerald-200 bg-white";
    case "partial": return "border-amber-200 bg-amber-50/30";
    case "insufficient_data": return "border-slate-200 bg-slate-50";
    case "locked": return "border-slate-200 bg-slate-50";
  }
}
function stateLabel(state: IntelligenceReport["state"]): string {
  switch (state) {
    case "ok": return "Live";
    case "partial": return "Partial";
    case "insufficient_data": return "Collecting data";
    case "locked": return "Tier locked";
  }
}

export function ArionIAInsightsIntelligencePage() {
  const { activeSiteId, arionApi } = useArionContext();
  const { data } = useAnalyticsData(activeSiteId, 90);
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [searchData, setSearchData] = useState<any>(null);
  const [gbpData, setGbpData] = useState<any>(null);
  const [gbpReviews, setGbpReviews] = useState<any>(null);
  const [bingData, setBingData] = useState<any>(null);
  const [seoData, setSeoData] = useState<any>(null);
  const [pluginData, setPluginData] = useState<any>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<ArionIntelKey | null>(null);

  // Fetch the multi-source data the engines need (same fetches as Trends page).
  useEffect(() => {
    if (!activeSiteId || !activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [search, gbp, reviews, bing, seo, pluginContent] = await Promise.all([
          arionApi.getSearchPerformance('google', activeSiteId, { period: 90, groupBy: 'all' }).catch(() => null),
          arionApi.getGbpBusiness(activeSiteId).catch(() => null),
          arionApi.getGbpReviewsLive(activeSiteId).catch(() => null),
          arionApi.getBingPerformance(activeSiteId, 90).catch(() => null),
          arionApi.getSeoRankings(activeSiteId, { range: '30d' }).catch(() => null),
          arionApi.getPluginContentAggregate(activeSiteId).catch(() => null),
        ]);
        if (cancelled) return;
        setSearchData(search);
        setGbpData(gbp);
        setGbpReviews(reviews);
        setBingData(bing);
        setSeoData(seo);
        setPluginData(pluginContent);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeSiteId, activeTenantId, arionApi]);

  // Fetch benchmarks from arion-api (best-effort).
  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const apiBase = (import.meta.env.VITE_ARION_API_BASE_URL as string)?.replace(/\/$/, "");
        if (!apiBase) return;
        const res = await globalThis.fetch(`${apiBase}/arion/ia-insights/benchmarks`, {
          headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
        });
        if (res.ok && !cancelled) {
          const body = await res.json();
          if (body?.data) setBenchmarks(body.data);
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  const reports = useMemo(() => {
    const input: EngineInput = {
      d: data,
      searchData,
      gbpData,
      gbpReviews,
      bingData,
      seoData,
      pluginData,
      sparkConnected: false,  // TODO v9.6: read from tenant context
      benchmarks,
    };
    return runAllArionIntelligence(input);
  }, [data, searchData, gbpData, gbpReviews, bingData, seoData, pluginData, benchmarks]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Modelled cross-product reports. Engines run on live data; reports auto-upgrade from "insufficient data" → "partial" → "live" as your data and product mix accumulates.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>How reports unlock:</strong> Most ARION Intelligence reports compose data across products. Reports run today with ARION-side data in partial mode; connecting SPARK + OLIVER promotes them to full-live state. Each card shows its current state + what's missing.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {INTEL_REPORTS.map((m) => {
          const r = reports[m.key];
          const Icon = m.icon;
          const color = stateColor(r.state);
          const bg = stateBg(r.state);
          return (
            <button key={m.key} onClick={() => setOpen(m.key)} className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}>
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">{m.label}</span>
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${m.minTier === "business" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{m.minTier}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{m.question}</p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 mb-2">
                <div className="flex items-center gap-2">
                  {r.state === "ok" || r.state === "partial" ? (
                    <span className="text-3xl font-bold tabular-nums" style={{ color }}>{r.score}</span>
                  ) : (
                    <span className="text-2xl font-bold text-slate-300">—</span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
                    {r.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    {r.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    {(r.state === "insufficient_data" || r.state === "locked") && <Lock className="h-3 w-3" />}
                    {stateLabel(r.state)}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>

              <p className="text-xs text-slate-700 leading-snug line-clamp-2">{r.headline}</p>
              {r.dataGap && <div className="mt-2 text-[10px] text-amber-800 italic">→ {r.dataGap}</div>}
            </button>
          );
        })}
      </div>

      {open && (() => {
        const m = INTEL_REPORTS.find((x) => x.key === open);
        if (!m) return null;
        const r = reports[open];
        return <IntelligenceModal meta={m} report={r} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

function IntelligenceModal({ meta, report, onClose }: { meta: IntelReportMeta; report: IntelligenceReport; onClose: () => void }) {
  const Icon = meta.icon;
  const color = stateColor(report.state);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{meta.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{meta.question}</p>
              <p className="text-[10px] text-slate-400 mt-1 italic">Model: {meta.modelType}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {report.state === "ok" || report.state === "partial" ? (
                <div className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</div>
              ) : (
                <div className="text-xl text-slate-300">—</div>
              )}
              <div className="text-[9px] uppercase text-slate-400">{stateLabel(report.state)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {report.dataGap && (
            <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div>
              <p className="text-sm text-slate-800">{report.dataGap}</p>
            </div>
          )}
          {report.scoreInputs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {report.scoreInputs.filter((i) => i.value !== null && i.value !== undefined).slice(0, 4).map((k) => (
                <div key={k.key} className="rounded-md border border-slate-200 bg-white px-3 py-2" style={{ borderTopWidth: 3, borderTopColor: color }}>
                  <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{k.key.replace(/_/g, " ")}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{String(k.value)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{k.weight > 0 ? `${Math.round(k.weight * 100)}% of score` : (k.note || "")}</div>
                </div>
              ))}
            </div>
          )}
          {report.observations.length > 0 && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "#84CC1620", color: "#A3E635" }}>ARGUS</span>
                <span className="text-sm">Intelligence · {meta.label}</span>
              </div>
              <ol className="space-y-3">
                {report.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#EA580C", color: "white" }}>{i + 1}</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ol>
              {report.actions.length > 0 && (
                <div className="border-t border-slate-700 mt-4 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A3E635" }}>Recommended actions</div>
                  <ul className="space-y-2">
                    {report.actions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
                        <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full" style={{ background: "#EA580C" }} />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-lg flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span>
          </div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ArionIAInsightsIntelligencePage;

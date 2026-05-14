// OliverIAInsightsTrendsPage — OLIVER Trends with real engines (v5.17).
//
// Uses the LUMEN-API /ia-insights/inputs?product=oliver aggregator to pull
// all 8 reports' inputs in one call, then runs the OLIVER trend engines.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../components/iainsights/types";
import { runAllOliverReports, type AllOliverReports, type ReportAnalysis, type OliverEngineInput } from "../../oliver/analytics/oliverTrendEngines";
import { Wrench, DollarSign, BarChart3, Briefcase, UserCheck, Users, Layers, Sun, ChevronDown, ChevronUp, Award } from "lucide-react";
import { Sparkline } from "../../components/iainsights/Sparkline";

const REPORT_META: Array<{ key: keyof AllOliverReports; label: string; question: string; icon: typeof Wrench; weight: number }> = [
  { key: "ops_health",     label: "Operations Health",         question: "Are jobs being completed efficiently and on time?",                icon: Wrench,    weight: 0.18 },
  { key: "revenue_perf",   label: "Revenue Performance",       question: "How is revenue trending and what is driving change?",              icon: DollarSign, weight: 0.18 },
  { key: "cash_flow",      label: "Cash Flow",                 question: "When is money coming in vs going out and what is the pressure?",  icon: BarChart3, weight: 0.15 },
  { key: "quote_win_rate", label: "Quote & Win Rate",          question: "How effectively am I converting quotes to booked work?",          icon: Briefcase, weight: 0.12 },
  { key: "retention",      label: "Customer Retention",        question: "Who is at risk of leaving and what is the recovery opportunity?", icon: UserCheck, weight: 0.10 },
  { key: "crew_capacity",  label: "Crew & Capacity",           question: "Am I using my crew efficiently and am I resourced for demand?",   icon: Users,     weight: 0.10 },
  { key: "service_line",   label: "Service Line Performance",  question: "Which services are most profitable and which are dragging?",      icon: Layers,    weight: 0.10 },
  { key: "seasonal",       label: "Seasonal Planning",         question: "How does my demand cycle look and am I prepared?",                icon: Sun,       weight: 0.07 },
  { key: "presence",       label: "Overall Trend Score",       question: "What does my operations footprint look like as a whole?",          icon: Award,     weight: 0 },
];

export function OliverIAInsightsTrendsPage() {
  const { get, post, ready } = useSparkApi();  // LUMEN-API hook — OLIVER lives in same backend
  const [inputs, setInputs] = useState<OliverEngineInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [priorScores, setPriorScores] = useState<Record<string, number>>({});
  const [scoreHistories, setScoreHistories] = useState<Record<string, Array<{ period_end: string; score: number }>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchInputs = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<OliverEngineInput>("/api/v1/ia-insights/inputs?product=oliver&days=90");
      setInputs(r);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchInputs(); }, [fetchInputs]);

  const reports: AllOliverReports = useMemo(() => {
    if (!inputs) return null as any;
    return runAllOliverReports(inputs);
  }, [inputs]);

  // Persist current + fetch prior period + score histories
  useEffect(() => {
    if (!reports || !inputs) return;
    let cancelled = false;
    (async () => {
      const periodEnd = new Date().toISOString().slice(0, 10);
      const periodStart = new Date(Date.now() - inputs.period_days * 86400_000).toISOString().slice(0, 10);
      const scoresMap: Record<string, number> = {};
      const keys = ["ops_health", "revenue_perf", "cash_flow", "quote_win_rate", "retention", "crew_capacity", "service_line", "seasonal", "presence"] as const;
      for (const k of keys) scoresMap[k] = reports[k].score;
      try {
        await post("/api/v1/ia-insights/scores?product=oliver", { periodStart, periodEnd, scores: scoresMap });
      } catch { /* swallow */ }
      try {
        const r = await get<{ data: Record<string, { score: number; periodEnd: string }> }>(`/api/v1/ia-insights/prior-scores?product=oliver&beforeDate=${encodeURIComponent(periodEnd)}`);
        if (!cancelled && r?.data) {
          const prior: Record<string, number> = {};
          for (const [k, v] of Object.entries(r.data)) if (v?.score != null) prior[k] = v.score;
          setPriorScores(prior);
        }
      } catch { /* swallow */ }
      try {
        const results = await Promise.all(keys.map((k) =>
          get<{ data: Array<{ period_end: string; score: number }> }>(`/api/v1/ia-insights/score-history?product=oliver&reportKey=${k}&limit=12`)
            .then((r) => ({ k, rows: r?.data || [] }))
            .catch(() => ({ k, rows: [] }))
        ));
        if (!cancelled) {
          const map: Record<string, Array<{ period_end: string; score: number }>> = {};
          for (const { k, rows } of results) map[k] = rows;
          setScoreHistories(map);
        }
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const trendScore = reports?.presence.score ?? 0;
    return {
      product: "oliver",
      overall: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data", drillTo: "/app/services/argus_ia_insights" },
      platform: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data" },
      trend: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data" },
      intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + 90 days of data unlock forecasting reports." },
      trendBreakdown: REPORT_META.filter((m) => m.key !== "presence").map((m) => ({
        key: m.key as string, label: m.label,
        score: reports ? reports[m.key].score : 0,
        previousScore: priorScores[m.key as string],
        band: bandFromScore(reports ? reports[m.key].score : 0),
      })),
      intelligenceBreakdown: ["demand_forecast", "cash_pressure", "churn_pred", "pipeline_rev", "crew_util", "margin"].map((k) => ({
        key: k,
        label: ({ demand_forecast: "Demand Forecast", cash_pressure: "Cash Pressure", churn_pred: "Churn Prediction", pipeline_rev: "Pipeline Revenue", crew_util: "Crew Utilisation", margin: "Margin Analysis" } as any)[k],
        score: 0, band: "unknown" as const, locked: true, lockReason: "Pro tier required",
      })),
      banners: reports ? [] : [{ severity: "info" as const, message: "Loading OLIVER trend data… reports populate once you have 30+ days of jobs, invoices, and payments." }],
      meta: { generatedAt: new Date().toISOString(), tier: "standard" as const },
    };
  }, [reports, priorScores]);

  if (loading && !inputs) return <div className="p-4 text-sm text-slate-500">Loading OLIVER trend data…</div>;
  if (error && !inputs) return <div className="p-4 text-sm text-red-700">Failed to load: {(error as Error).message}</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">OLIVER IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports analysing operations, revenue, cash flow, quotes, retention, capacity, service mix, and seasonality.</p>
      </div>
      <IAInsightsHeader data={headerData} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {REPORT_META.map((m) => {
          const report = reports?.[m.key];
          if (!report) return null;
          return <ReportCard key={m.key} meta={m} report={report} history={scoreHistories[m.key as string] || []} expanded={!!expanded[m.key]} onToggle={() => setExpanded((c) => ({ ...c, [m.key]: !c[m.key] }))} />;
        })}
      </div>
    </div>
  );
}

function ReportCard({
  meta, report, history, expanded, onToggle,
}: {
  meta: { key: string; label: string; question: string; icon: typeof Wrench; weight: number };
  report: ReportAnalysis;
  history: Array<{ period_end: string; score: number }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const band = bandFromScore(report.score);
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", unknown: "#94A3B8" } as any)[band];
  const Icon = meta.icon;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <button onClick={onToggle} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center" style={{ background: `${bandColor}1A`, color: bandColor }}><Icon className="h-4 w-4" /></div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-slate-900">{meta.label}</div>
              <div className="text-[10px] text-slate-500">{meta.question}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Sparkline data={history} color={bandColor} width={88} height={28} />
            <div className="font-bold tabular-nums text-lg" style={{ color: bandColor }}>{report.score}</div>
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
          </div>
        </div>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1">Observations</div>
            <ul className="space-y-1.5 text-xs text-slate-700">
              {report.observations.filter(Boolean).map((o, i) => (<li key={i} className="flex items-start gap-1.5"><span className="text-slate-400 font-bold mt-0.5">·</span><span>{o}</span></li>))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1">Recommended actions</div>
            <ol className="space-y-1 text-xs text-slate-700 list-decimal list-inside">
              {report.actions.map((a, i) => <li key={i}>{a}</li>)}
            </ol>
          </div>
          <div className="border-t border-slate-100 pt-2">
            <div className="text-[9px] uppercase font-semibold tracking-wide text-slate-400 mb-1">Score inputs</div>
            <div className="grid grid-cols-2 gap-1">
              {report.scoreInputs.map((s) => (
                <div key={s.key} className="text-[10px] text-slate-600 flex items-center justify-between bg-slate-50 rounded px-1.5 py-0.5">
                  <span className="truncate">{s.key} ({Math.round(s.weight * 100)}%)</span>
                  <span className="tabular-nums font-mono">{s.value ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OliverIAInsightsTrendsPage;

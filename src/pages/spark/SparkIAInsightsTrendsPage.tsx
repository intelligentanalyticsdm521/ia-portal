// SparkIAInsightsTrendsPage — SPARK IA Insights Trends with real engines (v5.16).
//
// Fetches the SPARK trend inputs from LUMEN-API and runs the 8 analytical
// engines to produce a Trend Score per report + a synthesis presence score
// that drives the Trend gauge in the 4-gauge header.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../components/iainsights/types";
import { runAllSparkReports, type AllSparkReports, type ReportAnalysis, type SparkEngineInput } from "../../spark/analytics/sparkTrendEngines";
import { Users, Activity, Mail, BarChart3, PieChart, Repeat, AlertCircle, DollarSign, ChevronDown, ChevronUp, Award } from "lucide-react";
import { Sparkline } from "../../components/iainsights/Sparkline";

const REPORT_META: Array<{
  key: keyof AllSparkReports;
  label: string;
  question: string;
  icon: typeof Users;
  weight: number;
}> = [
  { key: "contact_health",   label: "Contact Health",          question: "Is my contact base growing, active, and clean?",                       icon: Users,        weight: 0.15 },
  { key: "lead_pipeline",    label: "Lead Pipeline",           question: "What does my lead funnel look like and where is it leaking?",          icon: Activity,     weight: 0.18 },
  { key: "campaign_perf",    label: "Campaign Performance",    question: "Which campaigns are driving engagement and bookings?",                icon: Mail,         weight: 0.15 },
  { key: "marketing_attrib", label: "Marketing Attribution",   question: "Which channels produce the best customers, not just the most leads?",  icon: BarChart3,    weight: 0.12 },
  { key: "segmentation",     label: "Customer Segmentation",   question: "Who are my best customers and what do they have in common?",          icon: PieChart,     weight: 0.10 },
  { key: "automation_eff",   label: "Automation Effectiveness", question: "Are my automations working or just running?",                          icon: Repeat,       weight: 0.10 },
  { key: "retention_risk",   label: "Retention Risk",          question: "Which customers are going quiet and what is the revenue at stake?",   icon: AlertCircle,  weight: 0.10 },
  { key: "revenue_attrib",   label: "Revenue Attribution",     question: "How much revenue is SPARK directly influencing?",                      icon: DollarSign,   weight: 0.10 },
  { key: "presence",         label: "Overall Trend Score",     question: "What does my growth platform look like as a whole?",                  icon: Award,        weight: 0 },
];

export function SparkIAInsightsTrendsPage() {
  const { get, post, ready } = useSparkApi();
  const [inputs, setInputs] = useState<SparkEngineInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [priorScores, setPriorScores] = useState<Record<string, number>>({});
  const [scoreHistories, setScoreHistories] = useState<Record<string, Array<{ period_end: string; score: number }>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});

  const fetchInputs = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<SparkEngineInput>("/api/v1/ia-insights/inputs?product=spark&days=90");
      setInputs(r);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);
  useEffect(() => { fetchInputs(); }, [fetchInputs]);

  // Fetch tenant service_category + matching benchmark set.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const cfg = await get<{ data: { setting_value: string | null } | null }>("/api/v1/tenant-settings/service_category").catch(() => null);
        const category = cfg?.data?.setting_value || "home_services";
        const bench = await get<{ data: Array<{ metric_key: string; benchmark_value: number }> }>(`/api/v1/ia-insights/benchmarks?category=${encodeURIComponent(category)}`).catch(() => ({ data: [] }));
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const row of bench?.data || []) {
          if (row.metric_key && row.benchmark_value != null) map[row.metric_key] = Number(row.benchmark_value);
        }
        setBenchmarks(map);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [ready, get]);

  // Compute scores
  const reports: AllSparkReports = useMemo(() => {
    if (!inputs) return null as any;
    return runAllSparkReports({ ...inputs, benchmarks });
  }, [inputs, benchmarks]);

  // Persist current period scores + fetch prior period + score histories
  useEffect(() => {
    if (!reports || !inputs) return;
    let cancelled = false;
    (async () => {
      const periodEnd = new Date().toISOString().slice(0, 10);
      const periodStart = new Date(Date.now() - inputs.period_days * 86400_000).toISOString().slice(0, 10);
      const scoresMap: Record<string, number> = {};
      const keys = ["contact_health", "lead_pipeline", "campaign_perf", "marketing_attrib", "segmentation", "automation_eff", "retention_risk", "revenue_attrib", "presence"] as const;
      for (const k of keys) scoresMap[k] = reports[k].score;
      try {
        await post("/api/v1/ia-insights/scores?product=spark", { periodStart, periodEnd, scores: scoresMap });
      } catch { /* swallow */ }
      try {
        const r = await get<{ data: Record<string, { score: number; periodEnd: string }> }>(`/api/v1/ia-insights/prior-scores?product=spark&beforeDate=${encodeURIComponent(periodEnd)}`);
        if (!cancelled && r?.data) {
          const prior: Record<string, number> = {};
          for (const [k, v] of Object.entries(r.data)) if (v?.score != null) prior[k] = v.score;
          setPriorScores(prior);
        }
      } catch { /* swallow */ }
      // Fetch per-report score histories for the inline sparklines.
      try {
        const results = await Promise.all(keys.map((k) =>
          get<{ data: Array<{ period_end: string; score: number }> }>(`/api/v1/ia-insights/score-history?product=spark&reportKey=${k}&limit=12`)
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
      product: "spark",
      overall: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data", message: "Cross-product Business Pulse — drill into ARGUS IA Insights for the composite.", drillTo: "/app/services/argus_ia_insights" },
      platform: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data" },
      trend: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data" },
      intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + 90 days of data unlock Intelligence reports." },
      trendBreakdown: REPORT_META.filter((m) => m.key !== "presence").map((m) => ({
        key: m.key as string,
        label: m.label,
        score: reports ? reports[m.key].score : 0,
        previousScore: priorScores[m.key as string],
        band: bandFromScore(reports ? reports[m.key].score : 0),
      })),
      intelligenceBreakdown: ["churn_pred", "ltv_cohort", "campaign_roi", "optimal_send", "segment_forecast"].map((k) => ({
        key: k,
        label: ({ churn_pred: "Churn Prediction", ltv_cohort: "LTV Cohort Analysis", campaign_roi: "Campaign ROI", optimal_send: "Optimal Send Time", segment_forecast: "Segment Growth Forecast" } as any)[k],
        score: 0, band: "unknown" as const, locked: true, lockReason: "Pro tier required",
      })),
      banners: reports ? [] : [{ severity: "info" as const, message: "Loading SPARK trend data… first report builds once contacts, campaigns, and leads have ~30 days of history." }],
      meta: { generatedAt: new Date().toISOString(), tier: "standard" as const },
    };
  }, [reports, priorScores]);

  if (loading && !inputs) return <div className="p-4 text-sm text-slate-500">Loading SPARK trend data…</div>;
  if (error && !inputs) return <div className="p-4 text-sm text-red-700">Failed to load: {(error as Error).message}</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports analysing contact base, lead funnel, campaign engagement, attribution, segmentation, automation, retention, and revenue.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {REPORT_META.map((m) => {
          const report = reports?.[m.key];
          if (!report) return null;
          const isExpanded = !!expanded[m.key];
          return (
            <ReportCard
              key={m.key}
              meta={m}
              report={report}
              history={scoreHistories[m.key as string] || []}
              expanded={isExpanded}
              onToggle={() => setExpanded((cur) => ({ ...cur, [m.key]: !cur[m.key] }))}
            />
          );
        })}
      </div>
    </div>
  );
}

function ReportCard({
  meta, report, history, expanded, onToggle,
}: {
  meta: { key: string; label: string; question: string; icon: typeof Users; weight: number };
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
            <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center" style={{ background: `${bandColor}1A`, color: bandColor }}>
              <Icon className="h-4 w-4" />
            </div>
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

export default SparkIAInsightsTrendsPage;

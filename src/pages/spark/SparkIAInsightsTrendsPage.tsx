// SparkIAInsightsTrendsPage — SPARK IA Insights Trends with real engines (v5.16).
//
// Fetches the SPARK trend inputs from LUMEN-API and runs the 8 analytical
// engines to produce a Trend Score per report + a synthesis presence score
// that drives the Trend gauge in the 4-gauge header.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
// IAInsightsHeader moved to spark_ia_insights_health (v7.0).
// IAInsightsEmptyState moved to GetStartedCard on the Command Dashboard (v7.0).
import { bandFromScore } from "../../components/iainsights/types";
import { runAllSparkReports, type AllSparkReports, type ReportAnalysis, type SparkEngineInput } from "../../spark/analytics/sparkTrendEngines";
import { Users, Activity, Mail, BarChart3, PieChart, Repeat, AlertCircle, DollarSign, Award } from "lucide-react";
import { MonthlyScoreBars, MIN_HISTORY_PERIODS } from "../../components/iainsights/MonthlyScoreBars";
import { SparkReportDetailModal } from "../../components/iainsights/SparkReportDetailModal";

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
  const [openReportKey, setOpenReportKey] = useState<string | null>(null);
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

  // v7.0 — headerData removed; gauges/bars live on spark_ia_insights_health.

  if (loading && !inputs) return <div className="p-4 text-sm text-slate-500">Loading SPARK trend data…</div>;
  if (error && !inputs) return <div className="p-4 text-sm text-red-700">Failed to load: {(error as Error).message}</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports analysing contact base, lead funnel, campaign engagement, attribution, segmentation, automation, retention, and revenue.</p>
      </div>

      {/* IAInsightsHeader + Get Started checklist removed in v7.0 — see
          spark_ia_insights_health for the gauges/bars, and the Command
          Dashboard for the cross-product onboarding card. */}

      {/* v7.3 — 2x4 grid + modal pattern (restoring legacy design). */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {REPORT_META.map((m) => {
          const report = reports?.[m.key];
          if (!report) return null;
          return (
            <ReportCard
              key={m.key}
              meta={m}
              report={report}
              history={scoreHistories[m.key as string] || []}
              onOpen={() => setOpenReportKey(m.key as string)}
            />
          );
        })}
      </div>

      {/* v8.0 — SPARK rich modal with per-report content + rule-library-driven ARGUS box. */}
      {openReportKey && reports && inputs && (() => {
        const m = REPORT_META.find((x) => (x.key as string) === openReportKey);
        if (!m) return null;
        const r = reports[m.key];
        if (!r) return null;
        return (
          <SparkReportDetailModal
            reportKey={m.key as string}
            meta={{ key: m.key as string, label: m.label, question: m.question, icon: m.icon, weight: m.weight }}
            report={r}
            history={scoreHistories[m.key as string] || []}
            inputs={inputs}
            tenantLabel="your SPARK workspace"
            onClose={() => setOpenReportKey(null)}
          />
        );
      })()}
    </div>
  );
}

function formatPeriod(d: string): string {
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function ReportCard({
  meta, report, history, onOpen,
}: {
  meta: { key: string; label: string; question: string; icon: typeof Users; weight: number };
  report: ReportAnalysis;
  history: Array<{ period_end: string; score: number }>;
  onOpen: () => void;
}) {
  const band = bandFromScore(report.score);
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", unknown: "#94A3B8" } as any)[band];
  const periodEnd = history[history.length - 1]?.period_end;
  const periodStart = history[0]?.period_end;
  const periodLabel = (periodStart && periodEnd)
    ? `${formatPeriod(periodStart)} – ${formatPeriod(periodEnd)}`
    : undefined;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col">
      <div className="mb-2">
        <h3 className="font-semibold text-sm text-slate-900 leading-tight">{meta.label}</h3>
        <p className="text-[11px] text-slate-500 leading-snug mt-0.5">{meta.question}</p>
      </div>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="h-2 w-2 rounded-full" style={{ background: history.length >= MIN_HISTORY_PERIODS ? bandColor : "#CBD5E1" }} />
        <span className="text-[10px] text-slate-600">
          {history.length >= MIN_HISTORY_PERIODS
            ? `Ready · score ${report.score}`
            : `Collecting · ${history.length}/${MIN_HISTORY_PERIODS} periods`}
        </span>
      </div>
      <div className="flex-1 mb-2">
        <MonthlyScoreBars data={history} width={280} height={80} />
      </div>
      {periodLabel && (
        <div className="text-[10px] text-slate-400 mb-3">{periodLabel}</div>
      )}
      <button
        onClick={onOpen}
        className="w-full py-2 px-3 rounded bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 transition-colors"
      >
        View report
      </button>
    </div>
  );
}

export default SparkIAInsightsTrendsPage;

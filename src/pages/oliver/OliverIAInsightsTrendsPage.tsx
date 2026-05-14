// OliverIAInsightsTrendsPage — OLIVER Trends with real engines (v5.17).
//
// Uses the LUMEN-API /ia-insights/inputs?product=oliver aggregator to pull
// all 8 reports' inputs in one call, then runs the OLIVER trend engines.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
// IAInsightsHeader moved to oliver_ia_insights_health (v7.0).
// IAInsightsEmptyState moved to GetStartedCard on the Command Dashboard (v7.0).
import { bandFromScore } from "../../components/iainsights/types";
import { runAllOliverReports, type AllOliverReports, type ReportAnalysis, type OliverEngineInput } from "../../oliver/analytics/oliverTrendEngines";
import { Wrench, DollarSign, BarChart3, Briefcase, UserCheck, Users, Layers, Sun, Award } from "lucide-react";
import { MonthlyScoreBars, MIN_HISTORY_PERIODS } from "../../components/iainsights/MonthlyScoreBars";
import { OliverReportDetailModal } from "../../components/iainsights/OliverReportDetailModal";

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
  const [openReportKey, setOpenReportKey] = useState<string | null>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});

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

  const reports: AllOliverReports = useMemo(() => {
    if (!inputs) return null as any;
    return runAllOliverReports({ ...inputs, benchmarks });
  }, [inputs, benchmarks]);

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

  // v7.0 — headerData removed; gauges/bars live on oliver_ia_insights_health.

  if (loading && !inputs) return <div className="p-4 text-sm text-slate-500">Loading OLIVER trend data…</div>;
  if (error && !inputs) return <div className="p-4 text-sm text-red-700">Failed to load: {(error as Error).message}</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">OLIVER IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports analysing operations, revenue, cash flow, quotes, retention, capacity, service mix, and seasonality.</p>
      </div>
      {/* IAInsightsHeader + Get Started checklist removed in v7.0 — see
          oliver_ia_insights_health for the gauges/bars, and the Command
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

      {/* v8.4 — OLIVER rich modal with per-report content + rule-library ARGUS box. */}
      {openReportKey && reports && inputs && (() => {
        const m = REPORT_META.find((x) => (x.key as string) === openReportKey);
        if (!m) return null;
        const r = reports[m.key];
        if (!r) return null;
        return (
          <OliverReportDetailModal
            reportKey={m.key as string}
            meta={{ key: m.key as string, label: m.label, question: m.question, icon: m.icon, weight: m.weight }}
            report={r}
            history={scoreHistories[m.key as string] || []}
            inputs={inputs}
            tenantLabel="your OLIVER workspace"
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
  meta: { key: string; label: string; question: string; icon: typeof Wrench; weight: number };
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

export default OliverIAInsightsTrendsPage;

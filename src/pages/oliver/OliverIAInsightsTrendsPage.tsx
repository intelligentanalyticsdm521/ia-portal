// OliverIAInsightsTrendsPage — OLIVER IA Insights Trends shell (v5.x).
//
// June 1 scope: shell with live data connections. Reports show
// "collecting data" until 30+ days of live job, invoice, and payment
// data accumulate.
import { useMemo } from "react";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { type IAInsightsHeaderData } from "../../components/iainsights/types";
import { Wrench, DollarSign, BarChart3, Briefcase, UserCheck, Users, Layers, Sun, Lock } from "lucide-react";

interface TrendReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Wrench;
  weight: number;
}

const OLIVER_TRENDS: TrendReport[] = [
  { key: "ops_health",       label: "Operations Health",         question: "Are jobs being completed efficiently and on time?",                icon: Wrench,    weight: 0.18 },
  { key: "revenue_perf",     label: "Revenue Performance",       question: "How is revenue trending and what is driving change?",              icon: DollarSign, weight: 0.18 },
  { key: "cash_flow",        label: "Cash Flow",                 question: "When is money coming in vs going out and what is the pressure?",  icon: BarChart3, weight: 0.15 },
  { key: "quote_win_rate",   label: "Quote & Win Rate",          question: "How effectively am I converting quotes to booked work?",          icon: Briefcase, weight: 0.12 },
  { key: "retention",        label: "Customer Retention",        question: "Who is at risk of leaving and what is the recovery opportunity?", icon: UserCheck, weight: 0.10 },
  { key: "crew_capacity",    label: "Crew & Capacity",           question: "Am I using my crew efficiently and am I resourced for demand?",   icon: Users,     weight: 0.10 },
  { key: "service_line",     label: "Service Line Performance",  question: "Which services are most profitable and which are dragging?",      icon: Layers,    weight: 0.10 },
  { key: "seasonal",         label: "Seasonal Planning",         question: "How does my demand cycle look and am I prepared?",                icon: Sun,       weight: 0.07 },
];

export function OliverIAInsightsTrendsPage() {
  const headerData: IAInsightsHeaderData = useMemo(() => ({
    product: "oliver",
    overall: { score: 0, band: "unknown", state: "insufficient_data", drillTo: "/app/services/argus_ia_insights" },
    platform: { score: 0, band: "unknown", state: "insufficient_data" },
    trend: { score: 0, band: "unknown", state: "insufficient_data" },
    intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + 90 days of data to unlock." },
    trendBreakdown: OLIVER_TRENDS.map((r) => ({ key: r.key, label: r.label, score: 0, band: "unknown" as const, locked: true, lockReason: "Collecting data — 30+ days needed" })),
    intelligenceBreakdown: ["demand_forecast", "cash_pressure", "churn_pred", "pipeline_rev", "crew_util", "margin"].map((k) => ({
      key: k,
      label: ({ demand_forecast: "Demand Forecast", cash_pressure: "Cash Pressure Forecast", churn_pred: "Churn Prediction", pipeline_rev: "Pipeline Revenue Forecast", crew_util: "Crew Utilisation", margin: "Margin Analysis" } as any)[k],
      score: 0, band: "unknown" as const, locked: true, lockReason: "Pro tier + data threshold",
    })),
    banners: [{ severity: "info", message: "OLIVER Trend reports require 30+ days of live job, invoice, and payment data. Most reports rely on job_status_events (lifecycle log) for analytical depth — this populates as you complete jobs." }],
    meta: { generatedAt: new Date().toISOString(), tier: "standard" },
  }), []);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">OLIVER IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">8 reports analysing job operations, revenue, cash flow, quotes, retention, capacity, service mix, and seasonality.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {OLIVER_TRENDS.map((r) => (
          <div key={r.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-slate-200 text-slate-500"><r.icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-slate-900">{r.label}</span>
                  <span className="text-[10px] text-slate-500">{Math.round(r.weight * 100)}% weight</span>
                </div>
                <div className="text-[10px] text-slate-500">{r.question}</div>
              </div>
            </div>
            <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] text-blue-800 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Collecting data — your first report will be ready ~30 days after launch
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OliverIAInsightsTrendsPage;

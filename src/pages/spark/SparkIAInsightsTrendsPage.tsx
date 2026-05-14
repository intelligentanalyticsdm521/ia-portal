// SparkIAInsightsTrendsPage — SPARK IA Insights Trends shell (v5.x).
//
// June 1 scope: shell with live data connections. Reports display
// "collecting data" until 30+ days of live contact/campaign/lead data
// accumulate.
import { useMemo } from "react";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../components/iainsights/types";
import { Users, Activity, Mail, BarChart3, PieChart, Repeat, AlertCircle, DollarSign, Lock } from "lucide-react";

interface TrendReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Users;
  weight: number;
}

const SPARK_TRENDS: TrendReport[] = [
  { key: "contact_health",    label: "Contact Health",          question: "Is my contact base growing, active, and clean?",                       icon: Users,        weight: 0.15 },
  { key: "lead_pipeline",     label: "Lead Pipeline",           question: "What does my lead funnel look like and where is it leaking?",          icon: Activity,     weight: 0.18 },
  { key: "campaign_perf",     label: "Campaign Performance",    question: "Which campaigns are driving engagement and bookings?",                icon: Mail,         weight: 0.15 },
  { key: "marketing_attrib",  label: "Marketing Attribution",   question: "Which channels produce the best customers, not just the most leads?",  icon: BarChart3,    weight: 0.12 },
  { key: "segmentation",      label: "Customer Segmentation",   question: "Who are my best customers and what do they have in common?",          icon: PieChart,     weight: 0.10 },
  { key: "automation_eff",    label: "Automation Effectiveness", question: "Are my automations working or just running?",                          icon: Repeat,       weight: 0.10 },
  { key: "retention_risk",    label: "Retention Risk",          question: "Which customers are going quiet and what is the revenue at stake?",   icon: AlertCircle,  weight: 0.10 },
  { key: "revenue_attrib",    label: "Revenue Attribution",     question: "How much revenue is SPARK directly influencing?",                      icon: DollarSign,   weight: 0.10 },
];

export function SparkIAInsightsTrendsPage() {
  const headerData: IAInsightsHeaderData = useMemo(() => ({
    product: "spark",
    overall: { score: 0, band: "unknown", state: "insufficient_data", message: "Business Pulse populates as products accumulate data.", drillTo: "/app/services/argus_ia_insights" },
    platform: { score: 0, band: "unknown", state: "insufficient_data" },
    trend: { score: 0, band: "unknown", state: "insufficient_data" },
    intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + 90 days of data to unlock." },
    trendBreakdown: SPARK_TRENDS.map((r) => ({ key: r.key, label: r.label, score: 0, band: "unknown" as const, locked: true, lockReason: "Collecting data — needs 30+ days" })),
    intelligenceBreakdown: ["churn_pred", "ltv_cohort", "campaign_roi", "optimal_send", "segment_forecast"].map((k) => ({
      key: k,
      label: ({ churn_pred: "Churn Prediction", ltv_cohort: "LTV Cohort Analysis", campaign_roi: "Campaign ROI", optimal_send: "Optimal Send Time", segment_forecast: "Segment Growth Forecast" } as any)[k],
      score: 0,
      band: "unknown" as const,
      locked: true,
      lockReason: "Pro tier + data threshold",
    })),
    banners: [{ severity: "info", message: "SPARK Trend reports require 30+ days of contact, campaign, and lead activity. Reports populate automatically as data accumulates." }],
    meta: { generatedAt: new Date().toISOString(), tier: "standard" },
  }), []);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">Reactive, contextual reports — populate as live contact, campaign, and lead data accumulates.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {SPARK_TRENDS.map((r) => <TrendShellCard key={r.key} report={r} />)}
      </div>
    </div>
  );
}

function TrendShellCard({ report }: { report: TrendReport }) {
  const Icon = report.icon;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-slate-200 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-900">{report.label}</span>
            <span className="text-[10px] text-slate-500">{Math.round(report.weight * 100)}% weight</span>
          </div>
          <div className="text-[10px] text-slate-500">{report.question}</div>
        </div>
      </div>
      <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] text-blue-800 flex items-center gap-1">
        <Lock className="h-3 w-3" /> Collecting data — your first report will be ready ~30 days after launch
      </div>
    </div>
  );
}

export default SparkIAInsightsTrendsPage;

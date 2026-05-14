// SparkIAInsightsIntelligencePage — SPARK Intelligence shell (v5.x).
//
// June 1 scope: section shell with all reports locked. Unlocks at Pro+
// tier with sufficient data history.
import { useMemo } from "react";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { type IAInsightsHeaderData } from "../../components/iainsights/types";
import { Sparkles, Lock, TrendingDown, BarChart3, DollarSign, Clock, TrendingUp } from "lucide-react";

interface IntelReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Sparkles;
  modelType: string;
}

const SPARK_INTEL: IntelReport[] = [
  { key: "churn_pred",       label: "Churn Prediction",         question: "Which contacts are 60 days from disengaging completely?",         icon: TrendingDown, modelType: "Logistic regression on engagement decay" },
  { key: "ltv_cohort",       label: "LTV Cohort Analysis",      question: "What is the expected lifetime value by acquisition source?",      icon: BarChart3,    modelType: "Cohort LTV model: source → job history" },
  { key: "campaign_roi",     label: "Campaign ROI",             question: "What is the actual revenue return on campaign spend?",            icon: DollarSign,   modelType: "Campaign → contact → job → invoice chain" },
  { key: "optimal_send",     label: "Optimal Send Time",        question: "When should I send to maximise engagement per segment?",          icon: Clock,        modelType: "Engagement time distribution analysis" },
  { key: "segment_forecast", label: "Segment Growth Forecast",  question: "How will my key segments change over the next quarter?",          icon: TrendingUp,   modelType: "Trend extrapolation on segment size + churn" },
];

export function SparkIAInsightsIntelligencePage() {
  const headerData: IAInsightsHeaderData = useMemo(() => ({
    product: "spark",
    overall: { score: 0, band: "unknown", state: "insufficient_data" },
    platform: { score: 0, band: "unknown", state: "insufficient_data" },
    trend: { score: 0, band: "unknown", state: "insufficient_data" },
    intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + cross-product data unlock these reports." },
    trendBreakdown: [],
    intelligenceBreakdown: SPARK_INTEL.map((r) => ({ key: r.key, label: r.label, score: 0, band: "unknown" as const, locked: true, lockReason: "Pro tier + data threshold" })),
    banners: [{ severity: "info", message: "SPARK Intelligence reports run on the iadm-intelligence rule engine. Unlock at Pro tier with 90+ days of campaign and contact history." }],
    meta: { generatedAt: new Date().toISOString(), tier: "standard" },
  }), []);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Modelled, scored insights. Pro tier unlocks; Business tier adds cross-product reports.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {SPARK_INTEL.map((r) => (
          <div key={r.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-slate-200 text-slate-500"><r.icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-slate-900">{r.label}</span>
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                </div>
                <div className="text-[10px] text-slate-500">{r.question}</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 italic mb-2">Model: {r.modelType}</div>
            <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Upgrade to Pro to unlock
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SparkIAInsightsIntelligencePage;

// SparkIAInsightsIntelligencePage — SPARK Intelligence shell (v5.x).
//
// June 1 scope: section shell with all reports locked. Unlocks at Pro+
// tier with sufficient data history.
import { useMemo } from "react";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { type IAInsightsHeaderData } from "../../components/iainsights/types";
import { Sparkles, Lock, TrendingDown, BarChart3, DollarSign, Users, Repeat, PieChart } from "lucide-react";

interface IntelReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Sparkles;
  modelType: string;
  minTier: "pro" | "business";
}

// v9.0 — Aligned to Platform Intelligence & ARGUS spec §4 (May 2026).
const SPARK_INTEL: IntelReport[] = [
  { key: "contact_quality",  label: "Contact Quality Score",       question: "Are the contacts I'm acquiring worth acquiring?",                   icon: Users,        modelType: "Multi-dim engagement + revenue potential per acquisition source", minTier: "pro" },
  { key: "campaign_revenue", label: "Campaign Revenue Attribution", question: "Which campaigns are actually producing revenue, not just opens?",   icon: DollarSign,   modelType: "Campaign → contact engaged → job created → invoice paid (30d window)", minTier: "business" },
  { key: "lead_pipeline_forecast", label: "Lead Pipeline Forecast", question: "What revenue should I expect from my current pipeline in 30-60 days?", icon: TrendingDown, modelType: "Open leads × historical lead→contact→job rate × avg job value", minTier: "business" },
  { key: "churn_risk",       label: "Churn Risk Model",            question: "Which contacts are 60 days from going permanently silent?",         icon: TrendingDown, modelType: "Logistic regression on engagement decay + job recency + LTV", minTier: "pro" },
  { key: "automation_effectiveness", label: "Automation Effectiveness", question: "Are my automations producing outcomes or just executing?",       icon: Repeat,       modelType: "Per-automation: execution count → engagement → conversion outcome", minTier: "pro" },
  { key: "audience_segmentation_intel", label: "Audience Segmentation Intelligence", question: "Who are my distinct customer types and what does each need?", icon: PieChart, modelType: "RFM (recency, frequency, monetary) — Champion / Loyal / At-Risk / Hibernating / Lost / New", minTier: "business" },
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
    banners: [{ severity: "info", message: "SPARK Intelligence reports are shells at launch. They go live in two steps: (1) the iadm-intelligence rule engine has to be built per report (post-launch v2 work), then (2) the data must accumulate to the gate (90+ days of campaign + contact history). Trends keep running today and aren't affected." }],
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
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${r.minTier === "business" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                {r.minTier === "business" ? "Business" : "Pro"} tier
              </span>
            </div>
            <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Upgrade to {r.minTier === "business" ? "Business" : "Pro"} to unlock
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SparkIAInsightsIntelligencePage;

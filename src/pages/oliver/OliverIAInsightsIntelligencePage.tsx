// OliverIAInsightsIntelligencePage — OLIVER Intelligence shell (v5.x).
//
// Six modelled reports per the handoff doc. All locked at launch.
import { useMemo } from "react";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { type IAInsightsHeaderData } from "../../components/iainsights/types";
import { TrendingUp, AlertCircle, UserMinus, DollarSign, Users, BarChart3, Lock } from "lucide-react";

interface IntelReport { key: string; label: string; question: string; icon: typeof TrendingUp; modelType: string; minTier: "pro" | "business" }

// v9.0 — Aligned to Platform Intelligence & ARGUS spec §5 (May 2026).
const OLIVER_INTEL: IntelReport[] = [
  { key: "demand_forecast",        label: "Demand Forecast",              question: "What will my job volume and revenue look like in the next 8 weeks?", icon: TrendingUp,  modelType: "Holt-Winters: 8-week forecast on job volume + revenue · 80% CI · seasonal decomposition", minTier: "business" },
  { key: "cash_pressure",          label: "Cash Pressure Forecast",       question: "When will I next hit a cash flow gap and how large will it be?", icon: AlertCircle, modelType: "Rolling 30-day cash flow: scheduled inflows × payment timing patterns", minTier: "business" },
  { key: "quote_win_rate_intel",   label: "Quote Win Rate Intelligence",  question: "Why am I winning and losing quotes — and what is the pattern?",     icon: DollarSign,  modelType: "Win rate by service type / value band / time-to-decision",      minTier: "pro" },
  { key: "customer_retention_risk", label: "Customer Retention Risk",     question: "Which customers are approaching churn and what is the revenue at stake?", icon: UserMinus,   modelType: "Recency + frequency + LTV-weighted churn risk", minTier: "pro" },
  { key: "crew_efficiency_model",  label: "Crew Efficiency Model",        question: "Which crew members perform most efficiently and am I correctly staffed?", icon: Users,       modelType: "Per-worker dispatch-to-on-site + duration + callback rate from job_status_events", minTier: "business" },
  { key: "service_line_profit",    label: "Service Line Profitability",   question: "Which services are worth offering and which are dragging performance?", icon: BarChart3,   modelType: "Revenue per service at launch; margin post-STELLA cost integration", minTier: "business" },
];

export function OliverIAInsightsIntelligencePage() {
  const headerData: IAInsightsHeaderData = useMemo(() => ({
    product: "oliver",
    overall: { score: 0, band: "unknown", state: "insufficient_data" },
    platform: { score: 0, band: "unknown", state: "insufficient_data" },
    trend: { score: 0, band: "unknown", state: "insufficient_data" },
    intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + cross-product data unlock these reports." },
    trendBreakdown: [],
    intelligenceBreakdown: OLIVER_INTEL.map((r) => ({ key: r.key, label: r.label, score: 0, band: "unknown" as const, locked: true, lockReason: r.minTier === "business" ? "Business tier" : "Pro tier" })),
    banners: [{ severity: "info", message: "OLIVER Intelligence reports are shells at launch. They go live in two steps: (1) the iadm-intelligence rule engine has to be built per report (post-launch v2 work — Demand Forecast + Cash Pressure are the highest-priority), then (2) the data must accumulate (60-90 days of jobs + invoices). Margin analysis additionally requires STELLA cost data." }],
    meta: { generatedAt: new Date().toISOString(), tier: "standard" },
  }), []);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">OLIVER IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Modelled, scored forecasting + classification reports. Pro tier unlocks core; Business tier adds STELLA-joined margin analysis.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {OLIVER_INTEL.map((r) => (
          <div key={r.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-slate-200 text-slate-500"><r.icon className="h-4 w-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-slate-900">{r.label}</span>
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${r.minTier === "business" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                    {r.minTier}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500">{r.question}</div>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 italic mb-2">Model: {r.modelType}</div>
            <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1">
              <Lock className="h-3 w-3" /> Upgrade to {r.minTier === "business" ? "Business" : "Pro"} to unlock
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default OliverIAInsightsIntelligencePage;

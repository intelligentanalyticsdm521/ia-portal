// ArionIAInsightsIntelligencePage — v5.x shell (locked-state cards).
//
// Per the May-2026 handoff doc, Intelligence reports require:
//   - Pro/Business tier
//   - 90+ days of data history
//   - Cross-product data availability (some reports need SPARK/OLIVER)
//
// At June 1 launch all 6 reports render in locked / collecting-data states.
// Each card surfaces what data + tier is needed to unlock and a CTA path.
import { useMemo } from "react";
import { useArionContext } from "../../useArionContext";
import { IAInsightsHeader } from "../../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../../components/iainsights/types";
import { Lock, Sparkles, TrendingUp, Users, DollarSign, Activity, Target } from "lucide-react";

interface ReportCard {
  key: string;
  label: string;
  question: string;
  icon: typeof Sparkles;
  productsRequired: string[];
  minTier: "pro" | "business";
  dataMinDays?: number;
}

const INTEL_REPORTS: ReportCard[] = [
  { key: "acquisition", label: "Acquisition Efficiency", question: "Is my digital presence producing customers, not just traffic?", icon: TrendingUp, productsRequired: ["ARION", "SPARK"], minTier: "pro" },
  { key: "lead_source", label: "Lead Source Quality", question: "Which channels produce the highest-value customers?", icon: Users, productsRequired: ["ARION", "SPARK", "OLIVER"], minTier: "business" },
  { key: "content_roi", label: "Content ROI", question: "Which content investments produce measurable business outcomes?", icon: DollarSign, productsRequired: ["ARION", "SPARK"], minTier: "pro" },
  { key: "rep_revenue", label: "Reputation → Revenue", question: "Is my online reputation affecting conversion and repeat business?", icon: Activity, productsRequired: ["ARION", "OLIVER"], minTier: "business" },
  { key: "visibility_traj", label: "Visibility Trajectory", question: "Where will my search presence be in 90 days at current trajectory?", icon: TrendingUp, productsRequired: ["ARION"], minTier: "pro", dataMinDays: 90 },
  { key: "competitive", label: "Competitive Presence Gap", question: "How does my online presence compare to local market benchmarks?", icon: Target, productsRequired: ["ARION"], minTier: "pro" },
];

export function ArionIAInsightsIntelligencePage() {
  const { selectedSite } = useArionContext();
  const tier = ((selectedSite?.arionTier || "standard") as "standard" | "pro" | "business");

  const headerData: IAInsightsHeaderData = useMemo(() => ({
    product: "arion",
    overall: { score: 0, band: "unknown", state: "insufficient_data", message: "Calculated from ARGUS — populates as you accumulate cross-product history." },
    platform: { score: 0, band: "unknown", state: "insufficient_data", message: "Equals Trend Score until Intelligence reports unlock." },
    trend: { score: 0, band: "unknown", state: "insufficient_data", message: "View the Trends tab for live trend scores." },
    intelligence: { score: 0, band: "unknown", state: (tier === "pro" || tier === "business") ? "insufficient_data" : "locked", message: (tier === "pro" || tier === "business") ? "Collecting data — Intelligence reports populate ~90 days post-launch." : "Upgrade to Pro to unlock modelled insights." },
    trendBreakdown: [],
    intelligenceBreakdown: INTEL_REPORTS.map((r) => ({ key: r.key, label: r.label, score: 0, band: "unknown" as const, locked: true, lockReason: lockReason(r, tier as any) })),
    banners: [{ severity: "info", message: "Intelligence reports run on the iadm-intelligence rule engine and require modelled inputs. Trends keep running today — Intelligence reports unlock as your data history and product mix accumulate." }],
    meta: { generatedAt: new Date().toISOString(), tier: (tier as any) || "standard" },
  }), [tier]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">IA Insights — Intelligence</h1>
          <p className="text-sm text-slate-500 mt-0.5">Modelled cross-product insights. Locked or collecting-data on launch; unlock as your data accumulates.</p>
        </div>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {INTEL_REPORTS.map((r) => <IntelligenceCard key={r.key} report={r} tier={tier as any} />)}
      </div>
    </div>
  );
}

function lockReason(r: ReportCard, tier?: "standard" | "pro" | "business"): string {
  if (!tier || tier === "standard") return "Upgrade to Pro to unlock";
  if (tier === "pro" && r.minTier === "business") return "Upgrade to Business — requires cross-product data joins";
  if (r.dataMinDays) return `Collecting data — needs ${r.dataMinDays}+ days history`;
  if (r.productsRequired.length > 1) return `Connect ${r.productsRequired.join(" + ")} to unlock`;
  return "Collecting data";
}

function IntelligenceCard({ report, tier }: { report: ReportCard; tier?: "standard" | "pro" | "business" }) {
  const Icon = report.icon;
  const locked = !tier || tier === "standard" || (tier === "pro" && report.minTier === "business");
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 relative">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-slate-200 text-slate-500">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-900">{report.label}</span>
            <Lock className="h-3.5 w-3.5 text-slate-400" />
          </div>
          <div className="text-[10px] text-slate-500">{report.question}</div>
        </div>
      </div>
      <div className="text-xs text-slate-600 mb-2">
        <span className="font-semibold">Requires:</span> {report.productsRequired.join(" + ")} · {report.minTier === "business" ? "Business tier" : "Pro tier"}
        {report.dataMinDays ? ` · ${report.dataMinDays}-day history minimum` : ""}
      </div>
      <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1">
        <Lock className="h-3 w-3" /> {lockReason(report, tier)}
      </div>
    </div>
  );
}

export default ArionIAInsightsIntelligencePage;

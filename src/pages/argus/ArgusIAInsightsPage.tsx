// ArgusIAInsightsPage — ARGUS-level IA Insights (v5.x).
//
// The only place cross-channel intelligence lives. Every product's
// IA Insights "Cross-Channel" link routes here. June 1 launch: shell
// with Business Pulse gauge + 6 cross-channel report cards rendering
// in collecting-data states.
//
// v5.12 — wired to platform-api GET /argus/business-pulse for the
// composite cross-platform score.
import { useEffect, useMemo, useState } from "react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData, type InsightDataGapBanner } from "../../components/iainsights/types";
import { Sparkles, Lock, TrendingUp, Users, Activity, DollarSign, Repeat, BarChart3 } from "lucide-react";

interface CrossChannelReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Sparkles;
  productsRequired: string[];
  level: "trends" | "intelligence";
}

const CC_REPORTS: CrossChannelReport[] = [
  { key: "web_to_revenue", label: "Web-to-Revenue Funnel", question: "What does a lead's full journey from site visit to paid job look like?", icon: TrendingUp, productsRequired: ["ARION", "SPARK", "OLIVER"], level: "trends" },
  { key: "acquisition_quality", label: "Acquisition Quality", question: "Which channels produce the highest-LTV customers?", icon: Users, productsRequired: ["ARION", "SPARK"], level: "intelligence" },
  { key: "marketing_ops_loop", label: "Marketing → Ops Loop", question: "How well does marketing output translate to booked work?", icon: Activity, productsRequired: ["SPARK", "OLIVER"], level: "trends" },
  { key: "clv", label: "Customer Lifetime Value", question: "What is each customer segment actually worth over time?", icon: DollarSign, productsRequired: ["SPARK", "OLIVER"], level: "intelligence" },
  { key: "retention_revenue", label: "Retention Revenue Recovery", question: "What is the dollar value in dormant customers and what would recovery cost?", icon: Repeat, productsRequired: ["SPARK", "OLIVER"], level: "intelligence" },
  { key: "growth_composite", label: "Growth Composite", question: "Where is the business growing and where is it stalling across all dimensions?", icon: BarChart3, productsRequired: ["ARION", "SPARK", "OLIVER"], level: "intelligence" },
];

interface BusinessPulse {
  pulse: number | null;
  previous_pulse: number | null;
  components: { arion: number | null; spark: number | null; oliver: number | null };
  prior_components: { arion: number | null; spark: number | null; oliver: number | null };
  weights: { arion: number; spark: number; oliver: number };
}

export function ArgusIAInsightsPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [pulse, setPulse] = useState<BusinessPulse | null>(null);
  const [serverBanners, setServerBanners] = useState<InsightDataGapBanner[]>([]);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const base = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string).replace(/\/$/, "");
        const r = await globalThis.fetch(`${base}/argus/business-pulse`, {
          headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
        });
        if (r.ok && !cancelled) {
          const body = await r.json();
          setPulse(body?.data || null);
          setServerBanners(body?.banners || []);
        }
      } catch { /* swallow — banners cover the gap */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const score = pulse?.pulse ?? 0;
    const prev = pulse?.previous_pulse ?? null;
    const components = pulse?.components || { arion: null, spark: null, oliver: null };
    const priorComponents = pulse?.prior_components || { arion: null, spark: null, oliver: null };
    return {
      product: "argus",
      overall: { score, previousScore: prev, band: bandFromScore(score), state: pulse?.pulse != null ? "ok" : "insufficient_data", message: pulse?.pulse != null ? "Business Pulse — weighted blend across active products." : "Business Pulse populates as ARGUS receives data from active products." },
      platform: { score, previousScore: prev, band: bandFromScore(score), state: pulse?.pulse != null ? "ok" : "insufficient_data" },
      trend: { score, previousScore: prev, band: bandFromScore(score), state: pulse?.pulse != null ? "ok" : "insufficient_data" },
      intelligence: { score: 0, band: "unknown", state: "insufficient_data", message: "Cross-channel intelligence reports populate ~90 days post-launch." },
      trendBreakdown: [
        { key: "arion_trend",  label: "ARION",  score: components.arion ?? 0,  previousScore: priorComponents.arion ?? undefined,  band: bandFromScore(components.arion ?? 0),  locked: components.arion == null,  lockReason: components.arion == null ? "Connect ARION"  : undefined, reportRoute: "/app/services/arion_ia_insights_trends" },
        { key: "spark_trend",  label: "SPARK",  score: components.spark ?? 0,  previousScore: priorComponents.spark ?? undefined,  band: bandFromScore(components.spark ?? 0),  locked: components.spark == null,  lockReason: components.spark == null ? "SPARK Trend data not yet wired"  : undefined, reportRoute: "/app/services/spark_ia_insights_trends" },
        { key: "oliver_trend", label: "OLIVER", score: components.oliver ?? 0, previousScore: priorComponents.oliver ?? undefined, band: bandFromScore(components.oliver ?? 0), locked: components.oliver == null, lockReason: components.oliver == null ? "OLIVER Trend data not yet wired" : undefined, reportRoute: "/app/services/oliver_ia_insights_trends" },
      ],
      intelligenceBreakdown: CC_REPORTS.map((r) => ({ key: r.key, label: r.label, score: 0, band: "unknown" as const, locked: true, lockReason: `Requires ${r.productsRequired.join(" + ")}` })),
      banners: serverBanners.length > 0 ? serverBanners : [{ severity: "info", message: "ARGUS Business Pulse is the composite cross-platform score shown in every product's IA Insights header. It populates as your active products accumulate 90+ days of data." }],
      meta: { generatedAt: new Date().toISOString(), tier: "business" },
    };
  }, [pulse, serverBanners]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS IA Insights</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cross-channel intelligence. The Business Pulse score below feeds every product's IA Insights header.</p>
      </div>

      <IAInsightsHeader data={headerData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {CC_REPORTS.map((r) => <CrossChannelCard key={r.key} report={r} />)}
      </div>
    </div>
  );
}

function CrossChannelCard({ report }: { report: CrossChannelReport }) {
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
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${report.level === "intelligence" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
              {report.level}
            </span>
          </div>
          <div className="text-[10px] text-slate-500">{report.question}</div>
        </div>
      </div>
      <div className="text-xs text-slate-600 mb-2">
        <span className="font-semibold">Products required:</span> {report.productsRequired.join(" + ")}
      </div>
      <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1">
        <Lock className="h-3 w-3" /> Collecting data — populates ~90 days post-launch
      </div>
    </div>
  );
}

export default ArgusIAInsightsPage;

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

interface WebToRevenue {
  stages: Array<{ key: string; label: string; score: number | null; period_end: string | null }>;
  weakest_link: { key: string; label: string; score: number } | null;
  present_stages: number;
}

interface MarketingOpsLoop {
  stages: Array<{ key: string; label: string; score: number | null; side: "marketing" | "operations" }>;
  marketing_avg: number | null;
  operations_avg: number | null;
  gap: number | null;
  loop_efficiency: number | null;
  advisory: string | null;
}

export function ArgusIAInsightsPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [pulse, setPulse] = useState<BusinessPulse | null>(null);
  const [serverBanners, setServerBanners] = useState<InsightDataGapBanner[]>([]);
  const [webToRevenue, setWebToRevenue] = useState<WebToRevenue | null>(null);
  const [marketingOps, setMarketingOps] = useState<MarketingOpsLoop | null>(null);

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
      // Also fetch the Trends-level cross-channel reports.
      try {
        const token = await getToken();
        const base = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string).replace(/\/$/, "");
        const headers = { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId };
        const [r2, r3] = await Promise.all([
          globalThis.fetch(`${base}/argus/cross-channel/web-to-revenue`, { headers }),
          globalThis.fetch(`${base}/argus/cross-channel/marketing-ops-loop`, { headers }),
        ]);
        if (r2.ok && !cancelled) {
          const body = await r2.json();
          setWebToRevenue(body?.data || null);
        }
        if (r3.ok && !cancelled) {
          const body = await r3.json();
          setMarketingOps(body?.data || null);
        }
      } catch { /* swallow */ }
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
        {CC_REPORTS.map((r) => r.key === "web_to_revenue"
          ? <WebToRevenueCard key={r.key} report={r} data={webToRevenue} pulse={pulse} />
          : r.key === "marketing_ops_loop"
          ? <MarketingOpsLoopCard key={r.key} report={r} data={marketingOps} pulse={pulse} />
          : <CrossChannelCard key={r.key} report={r} pulse={pulse} />
        )}
      </div>
    </div>
  );
}

// v5.24 — Per-report metric inventory shown in the locked-state card so
// users see exactly what each report will analyze + which data points
// each connected product contributes.
const REPORT_METRICS: Record<string, { product: "ARION" | "SPARK" | "OLIVER"; metric: string }[]> = {
  acquisition_quality: [
    { product: "ARION", metric: "Source channel attribution from GA4 sessions" },
    { product: "ARION", metric: "Search query → landing page conversion paths" },
    { product: "SPARK", metric: "Contact.source field by acquisition channel" },
    { product: "SPARK", metric: "Lifetime value per acquisition source" },
  ],
  clv: [
    { product: "SPARK", metric: "Contact lifetime_value + job_count aggregates" },
    { product: "SPARK", metric: "Segment membership over time" },
    { product: "OLIVER", metric: "Revenue per customer across all jobs" },
    { product: "OLIVER", metric: "Repeat-job intervals and frequency" },
  ],
  retention_revenue: [
    { product: "SPARK", metric: "Contact last_job_date + engagement decay signals" },
    { product: "OLIVER", metric: "Dormant-customer count (60+ days since last job)" },
    { product: "OLIVER", metric: "Historical reactivation conversion rate" },
  ],
  growth_composite: [
    { product: "ARION", metric: "Web visibility trend (impressions, position, CTR)" },
    { product: "SPARK", metric: "Contact growth rate + campaign performance trend" },
    { product: "OLIVER", metric: "Revenue trend + job volume trend" },
  ],
};

function CrossChannelCard({ report, pulse }: { report: CrossChannelReport; pulse: BusinessPulse | null }) {
  const Icon = report.icon;
  const metrics = REPORT_METRICS[report.key] || [];
  // Determine connection status per product based on pulse.components.
  function connectionFor(p: "ARION" | "SPARK" | "OLIVER"): "connected" | "missing" | "unknown" {
    if (!pulse) return "unknown";
    const key = p.toLowerCase() as "arion" | "spark" | "oliver";
    const score = pulse.components[key];
    return score == null ? "missing" : "connected";
  }
  const productStatus = report.productsRequired.map((p) => ({
    product: p as "ARION" | "SPARK" | "OLIVER",
    status: connectionFor(p as "ARION" | "SPARK" | "OLIVER"),
  }));
  const missingProducts = productStatus.filter((p) => p.status === "missing").map((p) => p.product);
  const allConnected = productStatus.every((p) => p.status === "connected");

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

      {/* Per-product connection status */}
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        {productStatus.map((p) => {
          const colors = p.status === "connected"
            ? { bg: "bg-emerald-100", text: "text-emerald-800", icon: "✓" }
            : p.status === "missing"
            ? { bg: "bg-red-100", text: "text-red-800", icon: "✗" }
            : { bg: "bg-slate-200", text: "text-slate-600", icon: "?" };
          return (
            <span key={p.product} className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
              {colors.icon} {p.product}
            </span>
          );
        })}
      </div>

      {/* Metric inventory */}
      {metrics.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] uppercase font-semibold text-slate-500 tracking-wide mb-1">What this report will analyze</div>
          <ul className="space-y-0.5">
            {metrics.map((m, i) => (
              <li key={i} className="text-[10px] text-slate-600 flex items-start gap-1">
                <span className="text-[9px] uppercase font-bold px-1 rounded bg-slate-200 text-slate-700 mt-0.5 flex-shrink-0">{m.product}</span>
                <span className="flex-1">{m.metric}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tailored unlock advisory */}
      <div className={`rounded px-2 py-1.5 text-[10px] flex items-start gap-1 ${allConnected ? "bg-blue-50 border border-blue-200 text-blue-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
        <Lock className="h-3 w-3 flex-shrink-0 mt-0.5" />
        <span>
          {missingProducts.length > 0
            ? <>Connect <strong>{missingProducts.join(" and ")}</strong> to start collecting data for this report.</>
            : allConnected
            ? <>All required products are connected. Report populates after 90 days of historical data — first analysis expected by {new Date(Date.now() + 90 * 86400_000).toLocaleDateString()}.</>
            : <>Collecting data — populates ~90 days post-launch.</>
          }
        </span>
      </div>
    </div>
  );
}

function WebToRevenueCard({ report, data, pulse }: { report: CrossChannelReport; data: WebToRevenue | null; pulse?: BusinessPulse | null }) {
  const Icon = report.icon;
  if (!data || data.present_stages === 0) {
    return <CrossChannelCard report={report} pulse={pulse ?? null} />;
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2 mb-2">
        <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-900">{report.label}</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">live</span>
          </div>
          <div className="text-[10px] text-slate-500">{report.question}</div>
        </div>
      </div>

      <ul className="space-y-1.5 mb-2">
        {data.stages.map((s, i) => {
          const isWeakest = data.weakest_link?.key === s.key;
          const color = s.score == null ? "#94A3B8" : s.score >= 70 ? "#16A34A" : s.score >= 50 ? "#EAB308" : "#DC2626";
          const pct = s.score == null ? 0 : Math.max(5, s.score);
          return (
            <li key={s.key} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-slate-700 truncate">{i + 1}. {s.label}</span>
                <span className="text-[10px] tabular-nums" style={{ color }}>
                  {s.score == null ? "—" : `${s.score}/100`}
                  {isWeakest && <span className="ml-1 text-[9px] uppercase font-bold text-amber-700">weakest</span>}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
            </li>
          );
        })}
      </ul>
      {data.weakest_link && (
        <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800">
          Weakest funnel stage: <strong>{data.weakest_link.label}</strong> ({data.weakest_link.score}/100). Fix this stage first to compound improvements through every downstream step.
        </div>
      )}
    </div>
  );
}

function MarketingOpsLoopCard({ report, data, pulse }: { report: CrossChannelReport; data: MarketingOpsLoop | null; pulse?: BusinessPulse | null }) {
  const Icon = report.icon;
  const hasData = data && data.stages.some((s) => s.score != null);
  if (!hasData) {
    return <CrossChannelCard report={report} pulse={pulse ?? null} />;
  }
  const marketing = data!.stages.filter((s) => s.side === "marketing");
  const operations = data!.stages.filter((s) => s.side === "operations");
  const gap = data!.gap;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-700">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-slate-900">{report.label}</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">live</span>
          </div>
          <div className="text-[10px] text-slate-500">{report.question}</div>
        </div>
        {data?.loop_efficiency != null && (
          <div className="flex-shrink-0 text-right">
            <div className="text-[9px] uppercase font-semibold tracking-wide text-slate-500">Loop</div>
            <div className="font-bold tabular-nums text-base" style={{ color: data.loop_efficiency >= 70 ? "#16A34A" : data.loop_efficiency >= 50 ? "#EAB308" : "#DC2626" }}>
              {data.loop_efficiency}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-2">
        <div>
          <div className="text-[9px] uppercase font-semibold tracking-wide text-slate-500 mb-1">Marketing (SPARK)</div>
          {marketing.map((s) => (
            <ScoreRow key={s.key} label={s.label} score={s.score} />
          ))}
          {data?.marketing_avg != null && (
            <div className="text-[10px] text-slate-700 mt-1">Avg: <strong>{data.marketing_avg}</strong></div>
          )}
        </div>
        <div>
          <div className="text-[9px] uppercase font-semibold tracking-wide text-slate-500 mb-1">Operations (OLIVER)</div>
          {operations.map((s) => (
            <ScoreRow key={s.key} label={s.label} score={s.score} />
          ))}
          {data?.operations_avg != null && (
            <div className="text-[10px] text-slate-700 mt-1">Avg: <strong>{data.operations_avg}</strong></div>
          )}
        </div>
      </div>

      {gap != null && (
        <div className="rounded bg-slate-50 border border-slate-200 px-2 py-1.5 text-[10px] text-slate-700">
          Gap: <strong className={Math.abs(gap) > 15 ? "text-amber-700" : "text-emerald-700"}>
            {gap > 0 ? `+${gap}` : gap} pts
          </strong> ({gap > 0 ? "marketing > operations" : gap < 0 ? "operations > marketing" : "balanced"}).
          {data?.advisory && <div className="mt-1 text-slate-600">{data.advisory}</div>}
        </div>
      )}
    </div>
  );
}

function ScoreRow({ label, score }: { label: string; score: number | null }) {
  const color = score == null ? "#94A3B8" : score >= 70 ? "#16A34A" : score >= 50 ? "#EAB308" : "#DC2626";
  return (
    <div className="text-[10px] mb-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-slate-700 truncate">{label}</span>
        <span className="tabular-nums" style={{ color }}>{score ?? "—"}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score == null ? 0 : Math.max(5, score)}%`, background: color }} />
      </div>
    </div>
  );
}

export default ArgusIAInsightsPage;

// SparkIAInsightsHealthPage — IA Insights Health for SPARK (v6.13, equal-weight).
//
// Brandon 2026-06-21 — Business Pulse is now sourced from platform-api
// /argus/business-pulse ONLY. Per-product Business Pulse calculation is
// REMOVED — every product page reads the canonical ARGUS value. The trend
// engines below still drive Platform/Trend/Intelligence gauges (SPARK-only
// data), but the top "Business Pulse" gauge mirrors the ARGUS endpoint.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../components/iainsights/types";
import { runAllSparkReports, type AllSparkReports, type SparkEngineInput } from "../../spark/analytics/sparkTrendEngines";

// 50/50 = Brandon's LOCKED weighting (2026-06-21, platformPulse.js) — was 60/40
// here, disagreeing with the backend Pulse + ARGUS page (score-weight fix).
function platformScore(trendScore: number, intelligenceScore: number | null, locked: boolean): number {
  if (locked || intelligenceScore == null) return trendScore;
  return Math.round(trendScore * 0.5 + intelligenceScore * 0.5);
}

const TREND_LABELS: Record<string, string> = {
  contact_health: "Contact Health",
  lead_pipeline: "Lead Pipeline",
  campaign_perf: "Campaign Performance",
  marketing_attrib: "Marketing Attribution",
  segmentation: "Customer Segmentation",
  automation_eff: "Automation Effectiveness",
  retention_risk: "Retention Risk",
  revenue_attrib: "Revenue Attribution",
};

const INTEL_LABELS: Record<string, string> = {
  churn_pred: "Churn Prediction",
  ltv_cohort: "LTV Cohort Analysis",
  campaign_roi: "Campaign ROI",
  optimal_send: "Optimal Send Time",
  segment_forecast: "Segment Growth Forecast",
};

export function SparkIAInsightsHealthPage() {
  const { get, ready } = useSparkApi();
  const { getToken } = useAccessToken();
  const { activeTenantId } = useAppState();
  const [inputs, setInputs] = useState<SparkEngineInput | null>(null);
  const [benchmarks, setBenchmarks] = useState<Record<string, number>>({});
  const [priorScores, setPriorScores] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  // Brandon 2026-06-21 — Business Pulse comes from platform-api /argus/business-pulse,
  // NOT from per-product trend math. ONE number across every product page.
  const [businessPulse, setBusinessPulse] = useState<number | null>(null);
  const [businessPulsePrev, setBusinessPulsePrev] = useState<number | null>(null);

  const fetchAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [r, ps] = await Promise.all([
        get<SparkEngineInput>("/api/v1/ia-insights/inputs?product=spark&days=90"),
        get<{ data: Record<string, { score: number; periodEnd: string }> }>(`/api/v1/ia-insights/prior-scores?product=spark&beforeDate=${new Date().toISOString().slice(0,10)}`).catch(() => null),
      ]);
      setInputs(r);
      if (ps?.data) {
        const prior: Record<string, number> = {};
        for (const [k, v] of Object.entries(ps.data)) if (v?.score != null) prior[k] = v.score;
        setPriorScores(prior);
      }
      // Benchmarks
      const cfg = await get<{ data: { setting_value: string | null } | null }>("/api/v1/tenant-settings/service_category").catch(() => null);
      const category = cfg?.data?.setting_value || "home_services";
      const bench = await get<{ data: Array<{ metric_key: string; benchmark_value: number }> }>(`/api/v1/ia-insights/benchmarks?category=${encodeURIComponent(category)}`).catch(() => ({ data: [] }));
      const map: Record<string, number> = {};
      for (const row of bench?.data || []) if (row.metric_key && row.benchmark_value != null) map[row.metric_key] = Number(row.benchmark_value);
      setBenchmarks(map);
    } finally {
      setLoading(false);
    }
  }, [get, ready]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Brandon 2026-06-21 — fetch the canonical Business Pulse from ARGUS endpoint.
  // Fallback: stay null and let the gauge show insufficient_data — never recompute
  // a per-product Business Pulse here.
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
          setBusinessPulse(body?.data?.pulse ?? null);
          setBusinessPulsePrev(body?.data?.previous_pulse ?? null);
        }
      } catch { /* swallow — gauge shows insufficient_data */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  const reports: AllSparkReports | null = useMemo(() => {
    if (!inputs) return null;
    return runAllSparkReports({ ...inputs, benchmarks });
  }, [inputs, benchmarks]);

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const trendScore = reports?.presence.score ?? 0;
    // Brandon 2026-06-21 — Business Pulse comes from ARGUS endpoint, not from
    // SPARK trend math. ONE number across every product page.
    const bpScore = businessPulse ?? 0;
    const bpState = businessPulse == null ? "insufficient_data" as const : "ok" as const;
    return {
      product: "spark",
      overall: { score: bpScore, previousScore: businessPulsePrev, band: bandFromScore(bpScore), state: bpState, message: "Cross-product Business Pulse (sourced from ARGUS).", drillTo: "/app/services/argus_health" },
      platform: { score: platformScore(trendScore, null, true), previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data", message: "Currently equals Trend Score; unlocks weighted blend when Intelligence is enabled." },
      trend: { score: trendScore, previousScore: priorScores.presence, band: bandFromScore(trendScore), state: reports ? "ok" : "insufficient_data", drillTo: "/app/services/spark_ia_insights_trends" },
      intelligence: { score: 0, band: "unknown", state: "locked", message: "Pro tier + 90 days of data to unlock.", drillTo: "/app/services/spark_ia_insights_intelligence" },
      trendBreakdown: Object.keys(TREND_LABELS).map((k) => ({
        key: k, label: TREND_LABELS[k],
        score: reports ? (reports as any)[k]?.score ?? 0 : 0,
        previousScore: priorScores[k],
        band: bandFromScore(reports ? (reports as any)[k]?.score ?? 0 : 0),
        reportRoute: "/app/services/spark_ia_insights_trends",
      })),
      intelligenceBreakdown: Object.keys(INTEL_LABELS).map((k) => ({
        key: k, label: INTEL_LABELS[k],
        score: 0, band: "unknown" as const, locked: true, lockReason: "Pro tier required",
        reportRoute: "/app/services/spark_ia_insights_intelligence",
      })),
      banners: reports ? [] : [{ severity: "info" as const, message: "Loading SPARK trend data…" }],
      meta: { generatedAt: new Date().toISOString(), tier: "standard" },
    };
  }, [reports, priorScores, businessPulse, businessPulsePrev]);

  if (loading && !inputs) return <div className="p-4 text-sm text-slate-500">Loading IA Insights Health…</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Composite snapshot of your SPARK growth platform. Drill into Trends or Intelligence for full per-report observations and actions.</p>
      </div>
      <IAInsightsHeader data={headerData} />
    </div>
  );
}

export default SparkIAInsightsHealthPage;

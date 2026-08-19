// ArionIAInsightsHealthPage — v13.0 (Brandon 2026-07-25 model).
//
// Health = the gauge summary of the SAME builders the Trends and Intelligence
// pages render, so the gauges can never disagree with the pages they link to:
//   Trend Score        = roll-up of the 6 ARION trend dashboards, built from
//                        the same GET /arion/insights/metrics payload the
//                        Trends page fetches
//   Intelligence Score = roll-up of the business-question mirror dashboards
//                        (Visibility Trajectory, Conversion Forecast,
//                         Local Momentum, Content & Site Risk)
//   Platform Score     = 50/50 Trend + Intelligence (LOCKED rule, 2026-06-21)
//   Business Pulse     = client-side roll-up across ARION/SPARK/OLIVER —
//                        reverts to platform-api /argus/business-pulse once
//                        the monthly snapshot jobs land.
import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { useAppState } from "../../../app/AppState";
import { IAInsightsHeader } from "../../../components/iainsights/IAInsightsHeader";
import type { IAInsightsHeaderData } from "../../../components/iainsights/types";
import { buildArionDashboards, type MetricsPayload } from "../../../analytics/arionDashboards";
import { buildIntelligenceMirror, ARION_MIRROR } from "../../../analytics/intelligenceMirror";
import { platformHealth, demoBusinessPulse, gaugeOf } from "../../../analytics/healthSummary";
import { useProductInsightsPayload } from "../../../hooks/useProductInsightsPayload";

const TRENDS_ROUTE = "/app/services/arion_ia_insights_trends";
const INTEL_ROUTE = "/app/services/arion_ia_insights_intelligence";

export function ArionIAInsightsHealthPage() {
  const { activeSiteId, selectedSite, arionApi } = useArionContext();
  const { activeTenantId } = useAppState();
  const tier = ((selectedSite?.arionTier || "standard") as "standard" | "pro" | "business");

  const [payload, setPayload] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const sparkPayload = useProductInsightsPayload("spark");
  const oliverPayload = useProductInsightsPayload("oliver");

  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    setLoading(true);
    (arionApi as any).getInsightsMetrics?.(activeSiteId, 13)
      .then((r: any) => { if (!cancelled) { setPayload(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setPayload(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const trendDs = payload ? buildArionDashboards(payload) : [];
    const intelDs = payload ? buildIntelligenceMirror(payload, ARION_MIRROR).dashboards : [];
    const h = platformHealth(trendDs, intelDs, TRENDS_ROUTE, INTEL_ROUTE);
    // Feed this page's own server payload into the pulse so its ARION
    // component matches the gauges above it exactly.
    const bp = demoBusinessPulse(activeTenantId || "arion", { arionPayload: payload, sparkPayload, oliverPayload });
    return {
      product: "arion",
      overall: gaugeOf(bp.pulse, bp.prior, {
        message: "Cross-product Business Pulse — ARION, SPARK and OLIVER platform scores combined.",
        drillTo: "/app/services/argus_health",
      }),
      platform: gaugeOf(h.platformScore, h.platformPrior, { message: "50/50 Trend + Intelligence." }),
      trend: gaugeOf(h.trendScore, h.trendPrior, { drillTo: TRENDS_ROUTE }),
      intelligence: gaugeOf(h.intelScore, h.intelPrior, {
        message: "Modelled: where visibility, conversions and local momentum are heading.",
        drillTo: INTEL_ROUTE,
      }),
      crossChannel: gaugeOf(bp.argus.score, bp.argus.prior, {
        message: "ARGUS cross-platform intelligence across your active products.",
        drillTo: "/app/services/argus_cross_platform",
      }),
      trendBreakdown: h.trendBreakdown,
      intelligenceBreakdown: h.intelligenceBreakdown,
      banners: !loading && !payload
        ? [{ severity: "info" as const, message: "No trend data available for this site yet. Connect Google Analytics 4 and Search Console in Settings → Connected Accounts.", action: { label: "Open Settings", route: "/app/settings/integrations" } }]
        : [],
      meta: { generatedAt: new Date().toISOString(), tier },
    };
  }, [payload, loading, tier, activeTenantId, sparkPayload, oliverPayload]);

  if (loading && !payload) return <div className="p-4 text-sm text-slate-500">Loading IA Insights…</div>;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARION IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Composite snapshot of your ARION presence. Drill into Trends or Intelligence for the full dashboards and detail reports.</p>
      </div>
      <IAInsightsHeader data={headerData} />
    </div>
  );
}

export default ArionIAInsightsHealthPage;

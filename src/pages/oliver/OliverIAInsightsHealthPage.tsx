// OliverIAInsightsHealthPage — v13.0 (Brandon 2026-07-25 model).
//
// Health = the gauge summary of the SAME builders the Trends and Intelligence
// pages render, so the gauges can never disagree with the pages they link to:
//   Trend Score        = roll-up of the 5 OLIVER trend dashboards
//   Intelligence Score = roll-up of the business-question mirror dashboards
//                        (Demand Forecast, Cash Pressure, Pipeline Revenue,
//                         Churn & Retention, Crew Utilisation)
//   Platform Score     = 50/50 Trend + Intelligence (LOCKED rule, 2026-06-21)
//   Business Pulse     = client-side roll-up across ARION/SPARK/OLIVER —
//                        reverts to platform-api /argus/business-pulse once
//                        the monthly snapshot jobs land.
// Series are client-generated per tenant for review (the OLIVER metrics
// endpoint is the documented follow-up, same as the Trends page).
import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import type { IAInsightsHeaderData } from "../../components/iainsights/types";
import { buildOliverDashboards, demoOliverMetrics } from "../../analytics/oliverDashboards";
import { buildIntelligenceMirror, OLIVER_MIRROR } from "../../analytics/intelligenceMirror";
import { platformHealth, demoBusinessPulse, gaugeOf } from "../../analytics/healthSummary";
import { useArionInsightsPayload } from "../../hooks/useArionInsightsPayload";

const TRENDS_ROUTE = "/app/services/oliver_ia_insights_trends";
const INTEL_ROUTE = "/app/services/oliver_ia_insights_intelligence";

export function OliverIAInsightsHealthPage() {
  const { activeTenantId } = useAppState();
  const arionPayload = useArionInsightsPayload();

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const seed = activeTenantId || "oliver";
    const payload = demoOliverMetrics(seed);
    const trendDs = buildOliverDashboards(payload);
    const intelDs = buildIntelligenceMirror(payload, OLIVER_MIRROR).dashboards;
    const h = platformHealth(trendDs, intelDs, TRENDS_ROUTE, INTEL_ROUTE);
    const bp = demoBusinessPulse(seed, { arionPayload });
    return {
      product: "oliver",
      overall: gaugeOf(bp.pulse, bp.prior, {
        message: "Cross-product Business Pulse — ARION, SPARK and OLIVER platform scores combined.",
        drillTo: "/app/services/argus_health",
      }),
      platform: gaugeOf(h.platformScore, h.platformPrior, { message: "50/50 Trend + Intelligence." }),
      trend: gaugeOf(h.trendScore, h.trendPrior, { drillTo: TRENDS_ROUTE }),
      intelligence: gaugeOf(h.intelScore, h.intelPrior, {
        message: "Modelled: where demand, cash and crews are heading.",
        drillTo: INTEL_ROUTE,
      }),
      crossChannel: gaugeOf(bp.argus.score, bp.argus.prior, {
        message: "ARGUS cross-platform intelligence across your active products.",
        drillTo: "/app/services/argus_cross_platform",
      }),
      trendBreakdown: h.trendBreakdown,
      intelligenceBreakdown: h.intelligenceBreakdown,
      banners: [],
      meta: { generatedAt: new Date().toISOString(), tier: "pro" },
    };
  }, [activeTenantId, arionPayload]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">OLIVER IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Composite snapshot of your OLIVER operations platform. Drill into Trends or Intelligence for the full dashboards and detail reports.</p>
      </div>
      <IAInsightsHeader data={headerData} />
    </div>
  );
}

export default OliverIAInsightsHealthPage;

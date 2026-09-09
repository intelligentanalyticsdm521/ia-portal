// ArgusHealthPage — v13.0 (Brandon 2026-07-25 model).
//
// Health = the gauge summary of the SAME builders the ARGUS Trends and
// Intelligence pages render, so the gauges can never disagree with the pages
// they link to:
//   Trend Score        = roll-up of the ARGUS trend dashboards (cross-platform
//                        overview, customer journey, automation health)
//   Intelligence Score = roll-up of the business-question mirror dashboards
//                        (Revenue Journey, Platform Connectivity & Data Quality)
//   Platform Score     = 50/50 Trend + Intelligence (LOCKED rule, 2026-06-21)
//   Business Pulse     = client-side roll-up across ARION/SPARK/OLIVER —
//                        reverts to platform-api /argus/business-pulse once
//                        the monthly snapshot jobs land.
import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import type { IAInsightsHeaderData } from "../../components/iainsights/types";
import { buildArionDashboards } from "../../analytics/arionDashboards";
import { demoArionMetricsClient } from "../../analytics/arionDemoClient";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { buildOliverDashboards, demoOliverMetrics } from "../../analytics/oliverDashboards";
import { buildArgusDashboards, demoArgusMetrics, type PlatformRollup } from "../../analytics/argusDashboards";
import { buildIntelligenceMirror, ARGUS_MIRROR } from "../../analytics/intelligenceMirror";
import { businessPulse, type DashboardScore } from "../../analytics/scoring";
import { platformHealth, demoBusinessPulse, gaugeOf } from "../../analytics/healthSummary";
import { useArionInsightsPayload } from "../../hooks/useArionInsightsPayload";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";

const TRENDS_ROUTE = "/app/services/argus_trends";
const INTEL_ROUTE = "/app/services/argus_cross_platform";

export function ArgusHealthPage() {
  const { activeTenantId } = useAppState();
  const arionPayload = useArionInsightsPayload();
  const sparkPayload = useProductInsightsPayload("spark").payload;
  const oliverPayload = useProductInsightsPayload("oliver").payload;

  const { headerData, activeProducts } = useMemo(() => {
    const seed = activeTenantId || "argus";

    // Same per-platform roll-up ArgusTrendsPage feeds the cross-platform view.
    const rollup = (label: string, key: string, ds: DashboardScore[]): PlatformRollup => {
      const moves = ds.map((d) => d.movementPct).filter((v): v is number => v != null);
      return {
        key, label, dashboards: ds,
        score: businessPulse(ds.map((d) => d.score)),
        movementPct: moves.length ? moves.reduce((s, v) => s + v, 0) / moves.length : null,
      };
    };
    const platforms: PlatformRollup[] = [
      rollup("ARION", "arion", buildArionDashboards(arionPayload || demoArionMetricsClient(seed))),
      rollup("SPARK", "spark", buildSparkDashboards(sparkPayload || demoSparkMetrics(seed))),
      rollup("OLIVER", "oliver", buildOliverDashboards(oliverPayload || demoOliverMetrics(seed))),
    ];

    const argusPayload = demoArgusMetrics(seed);
    const trendDs = buildArgusDashboards(argusPayload, platforms);
    const intelDs = buildIntelligenceMirror(argusPayload, ARGUS_MIRROR).dashboards;
    const h = platformHealth(trendDs, intelDs, TRENDS_ROUTE, INTEL_ROUTE);
    const bp = demoBusinessPulse(seed, { arionPayload, sparkPayload, oliverPayload });

    const headerData: IAInsightsHeaderData = {
      product: "argus",
      overall: gaugeOf(bp.pulse, bp.prior, {
        message: "Composite of all active Platform Scores — ARION, SPARK and OLIVER combined.",
      }),
      platform: gaugeOf(h.platformScore, h.platformPrior, { message: "50/50 Trend + Intelligence." }),
      trend: gaugeOf(h.trendScore, h.trendPrior, { drillTo: TRENDS_ROUTE }),
      intelligence: gaugeOf(h.intelScore, h.intelPrior, {
        message: "Modelled: the revenue journey end to end, and the connectivity that feeds it.",
        drillTo: INTEL_ROUTE,
      }),
      trendBreakdown: h.trendBreakdown,
      intelligenceBreakdown: h.intelligenceBreakdown,
      banners: [
        {
          severity: "info" as const,
          message: "ARGUS is the cross-platform intelligence layer. Health summarises every active product — drill into Trends or Intelligence for the full dashboards and detail reports.",
        },
      ],
      meta: { generatedAt: new Date().toISOString(), tier: "pro" as const },
    };

    // ARGUS gets the active-products indicator instead of the 5th gauge.
    const activeProducts = [
      { key: "arion" as const, active: bp.components.arion != null, score: bp.components.arion },
      { key: "spark" as const, active: bp.components.spark != null, score: bp.components.spark },
      { key: "oliver" as const, active: bp.components.oliver != null, score: bp.components.oliver },
      { key: "stella" as const, active: false, score: null },  // STELLA not yet shipped
    ];

    return { headerData, activeProducts };
  }, [activeTenantId, arionPayload, sparkPayload, oliverPayload]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cross-platform intelligence layer. Aggregates every active Platform Score into the Business Pulse.</p>
      </div>
      <IAInsightsHeader data={headerData} mode="argus" activeProducts={activeProducts} />
    </div>
  );
}

export default ArgusHealthPage;

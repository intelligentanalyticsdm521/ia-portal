// SparkIAInsightsHealthPage — v13.0 (Brandon 2026-07-25 model).
//
// Health = the gauge summary of the SAME builders the Trends and Intelligence
// pages render, so the gauges can never disagree with the pages they link to:
//   Trend Score        = roll-up of the SPARK trend dashboards
//   Intelligence Score = roll-up of the business-question mirror dashboards
//                        (Churn Prediction, Campaign ROI, Pipeline & Customer
//                         Value, List Growth Forecast)
//   Platform Score     = 50/50 Trend + Intelligence (LOCKED rule, 2026-06-21)
//   Business Pulse     = client-side roll-up across ARION/SPARK/OLIVER —
//                        reverts to platform-api /argus/business-pulse once
//                        the monthly snapshot jobs land.
// Series are client-generated per tenant for review (the SPARK metrics
// endpoint is the documented follow-up, same as the Trends page).
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import type { IAInsightsHeaderData } from "../../components/iainsights/types";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { buildIntelligenceMirror, SPARK_MIRROR } from "../../analytics/intelligenceMirror";
import { platformHealth, demoBusinessPulse, gaugeOf } from "../../analytics/healthSummary";
import { useArionInsightsPayload } from "../../hooks/useArionInsightsPayload";
import { SparkLeadPoolCard } from "../../components/spark/SparkLeadPoolCard";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";

const TRENDS_ROUTE = "/app/services/spark_ia_insights_trends";
const INTEL_ROUTE = "/app/services/spark_ia_insights_intelligence";

export function SparkIAInsightsHealthPage() {
  const { activeTenantId } = useAppState();
  const arionPayload = useArionInsightsPayload();
  const sparkPayload = useProductInsightsPayload("spark");
  const oliverPayload = useProductInsightsPayload("oliver");

  const headerData: IAInsightsHeaderData = useMemo(() => {
    const seed = activeTenantId || "spark";
    const payload = sparkPayload || demoSparkMetrics(seed);
    const trendDs = buildSparkDashboards(payload);
    const intelDs = buildIntelligenceMirror(payload, SPARK_MIRROR).dashboards;
    const h = platformHealth(trendDs, intelDs, TRENDS_ROUTE, INTEL_ROUTE);
    const bp = demoBusinessPulse(seed, { arionPayload, sparkPayload, oliverPayload });
    return {
      product: "spark",
      overall: gaugeOf(bp.pulse, bp.prior, {
        message: "Cross-product Business Pulse — ARION, SPARK and OLIVER platform scores combined.",
        drillTo: "/app/services/argus_health",
      }),
      platform: gaugeOf(h.platformScore, h.platformPrior, { message: "50/50 Trend + Intelligence." }),
      trend: gaugeOf(h.trendScore, h.trendPrior, { drillTo: TRENDS_ROUTE }),
      intelligence: gaugeOf(h.intelScore, h.intelPrior, {
        message: "Modelled: churn risk, campaign payoff and where your list is heading.",
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
  }, [activeTenantId, arionPayload, sparkPayload, oliverPayload]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Composite snapshot of your SPARK marketing platform. Drill into Trends or Intelligence for the full dashboards and detail reports.</p>
      </div>
      <IAInsightsHeader data={headerData} />

      {/* "Lead pool this month" — the section the monthly overnight re-score
          produces (L16). Same payload as the monthly email, so the page and
          the client's inbox always say the same thing. */}
      <SparkLeadPoolCard className="mt-4" />

      {/* Contact scoring + the raw activity feed used to be their own nav
          items. The feature map folds them in here ("Health/Contact Scoring ·
          Activity Stream → one analytics home"), so they live as links off
          Insights rather than two more things to scan past in the menu. */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/app/services/spark_health_score"
          data-tour="insights-contact-scoring"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Contact scoring — tier distribution &amp; per-contact lookup →
        </Link>
        <Link
          to="/app/services/spark_intelligence"
          data-tour="insights-score-distribution"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Score distribution — how your list splits by tier &rarr;
        </Link>
        <Link
          to="/app/services/spark_activity_stream"
          data-tour="insights-activity-stream"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Activity stream — every event, unfiltered →
        </Link>
      </div>
    </div>
  );
}

export default SparkIAInsightsHealthPage;

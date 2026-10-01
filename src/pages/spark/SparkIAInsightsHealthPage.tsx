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
//
// NO DEMO FALLBACK FOR A REAL BUSINESS (SPARK pack 1, 2026-09-08). Two invented
// things used to reach this screen and neither said so:
//
//   · `sparkPayload || demoSparkMetrics(seed)` — the Trend, Intelligence and
//     Platform gauges, all four breakdown bars, drawn from a seed derived from
//     the business's own tenant id whenever the metrics fetch failed or the
//     business had nothing to measure.
//   · `demoBusinessPulse(seed, {...})` — which invents ARION and OLIVER series
//     internally for any product whose payload is null, so the Business Pulse and
//     Cross-Platform gauges were a cross-product score across products that had
//     reported nothing.
//
// A gauge is the most quotable thing on the platform: it is one number with a
// colour, and somebody reads it out. Both are gone. An unresolved score is now an
// `unknown` gauge with a sentence (the header already renders that state), and the
// seeded generators run only behind a dev-only flag that labels the page SAMPLE.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import type { IAInsightsHeaderData } from "../../components/iainsights/types";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { buildIntelligenceMirror, SPARK_MIRROR } from "../../analytics/intelligenceMirror";
import { platformHealth, demoBusinessPulse, gaugeOf } from "../../analytics/healthSummary";
import { insightsDemoAllowed } from "../../components/insights/insightsDemo";
import { InsightsEmpty, InsightsError, InsightsLoading, SampleDataBadge } from "../../components/insights/InsightsStateView";
import { SPARK_INSIGHT_SOURCES } from "../../components/insights/sparkInsightSources";
import { useArionInsightsPayload } from "../../hooks/useArionInsightsPayload";
import { SparkLeadPoolCard } from "../../components/spark/SparkLeadPoolCard";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";

const TRENDS_ROUTE = "/app/services/spark_ia_insights_trends";
const INTEL_ROUTE = "/app/services/spark_ia_insights_intelligence";

export function SparkIAInsightsHealthPage() {
  const { activeTenantId } = useAppState();
  const arionPayload = useArionInsightsPayload();
  const sparkState = useProductInsightsPayload("spark");
  const oliverState = useProductInsightsPayload("oliver");
  const demo = insightsDemoAllowed();

  // The metrics the gauges are built from: this business's own, or — in a dev
  // build with the flag on — the seeded sample set. Never a silent substitute.
  const metrics = sparkState.payload || (demo ? demoSparkMetrics(activeTenantId || "spark") : null);

  const headerData: IAInsightsHeaderData | null = useMemo(() => {
    if (!metrics) return null;
    const trendDs = buildSparkDashboards(metrics);
    const intelDs = buildIntelligenceMirror(metrics, SPARK_MIRROR).dashboards;
    const h = platformHealth(trendDs, intelDs, TRENDS_ROUTE, INTEL_ROUTE);

    // CROSS-PRODUCT: only when we have real numbers from the other products too.
    // demoBusinessPulse invents a series for any payload that is null, which made
    // "Business Pulse" a score across products that had reported nothing. An
    // unknown gauge with a sentence is the honest version — and it is the same
    // shape the header already renders for an insufficient-data gauge.
    const crossProductReal = !!(arionPayload && sparkState.payload && oliverState.payload);
    const bp = (crossProductReal || demo)
      ? demoBusinessPulse(activeTenantId || "spark", {
          arionPayload, sparkPayload: sparkState.payload, oliverPayload: oliverState.payload,
        })
      : null;

    return {
      product: "spark",
      overall: bp
        ? gaugeOf(bp.pulse, bp.prior, {
            message: "Cross-product Business Pulse — ARION, SPARK and OLIVER platform scores combined.",
            drillTo: "/app/services/argus_health",
          })
        : gaugeOf(null, null, {
            message: "This one needs numbers from your other products too. It appears once ARION and OLIVER have a month behind them.",
            drillTo: "/app/services/argus_health",
          }),
      platform: gaugeOf(h.platformScore, h.platformPrior, { message: "50/50 Trend + Intelligence." }),
      trend: gaugeOf(h.trendScore, h.trendPrior, { drillTo: TRENDS_ROUTE }),
      intelligence: gaugeOf(h.intelScore, h.intelPrior, {
        message: "Modelled: churn risk, campaign payoff and where your list is heading.",
        drillTo: INTEL_ROUTE,
      }),
      crossChannel: bp
        ? gaugeOf(bp.argus.score, bp.argus.prior, {
            message: "ARGUS cross-platform intelligence across your active products.",
            drillTo: "/app/services/argus_cross_platform",
          })
        : gaugeOf(null, null, {
            message: "Cross-platform intelligence compares your products against each other, so it waits until more than one of them has data.",
            drillTo: "/app/services/argus_cross_platform",
          }),
      trendBreakdown: h.trendBreakdown,
      intelligenceBreakdown: h.intelligenceBreakdown,
      banners: [],
      meta: { generatedAt: new Date().toISOString(), tier: "pro" },
    };
  }, [metrics, activeTenantId, arionPayload, sparkState.payload, oliverState.payload, demo]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">SPARK IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Composite snapshot of your SPARK marketing platform. Drill into Trends or Intelligence for the full dashboards and detail reports.</p>
      </div>
      {demo && !sparkState.payload && <SampleDataBadge />}

      {!headerData && sparkState.status === "loading" && <InsightsLoading />}
      {!headerData && sparkState.status === "error" && <InsightsError />}
      {!headerData && sparkState.status === "empty" && (
        <InsightsEmpty
          title="No scores yet"
          lead="A score compares this month with the last one, so the gauges stay blank until there is something to compare. These are what move them:"
          sources={SPARK_INSIGHT_SOURCES}
        />
      )}
      {headerData && <IAInsightsHeader data={headerData} />}

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

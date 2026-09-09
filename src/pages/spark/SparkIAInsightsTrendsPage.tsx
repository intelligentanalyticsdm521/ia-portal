// SparkIAInsightsTrendsPage — v13.1 (Brandon 2026-07-25).
//
// Same funnel as ARION. Series come from the REAL metrics endpoint
// (GET /api/v1/ia-insights/metrics?product=spark — live SQL over
// lumen.contact/campaign).
//
// NO DEMO FALLBACK FOR A REAL BUSINESS (SPARK pack 1, 2026-09-08). This page used
// to read `payload || demoSparkMetrics(activeTenantId)`: when the metrics fetch
// failed, or the business had nothing to measure yet, it drew a full year of
// trends from a seed derived from that business's own tenant id — plausible,
// stable across refreshes, and with nothing on the screen saying it was invented.
// The seeded generator now runs only behind a dev-only flag and says SAMPLE on
// screen; a real business gets its numbers, an honest "we couldn't load them", or
// an empty state that names what fills it.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { demoSparkDetail } from "../../analytics/sparkDetail";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";
import { insightsDemoAllowed } from "../../components/insights/insightsDemo";
import { InsightsEmpty, InsightsError, InsightsLoading, SampleDataBadge } from "../../components/insights/InsightsStateView";
import { SPARK_INSIGHT_SOURCES } from "../../components/insights/sparkInsightSources";

export function SparkIAInsightsTrendsPage() {
  const { activeTenantId } = useAppState();
  const state = useProductInsightsPayload("spark");
  const demo = insightsDemoAllowed();

  // The demo metrics are built ONLY when the dev flag allows them, so a
  // production bundle cannot even compute a sample series.
  const shown = state.payload || (demo ? demoSparkMetrics(activeTenantId || "spark") : null);
  const dashboards = useMemo(
    () => (shown ? buildSparkDashboards(shown) : null),
    [shown],
  );
  // Real businesses get ONLY real line items (a missing report simply does not
  // appear); the demo detail set rides with the demo metrics or not at all.
  const detail = state.payload
    ? (state.payload.detail && Object.keys(state.payload.detail).length ? state.payload.detail : undefined)
    : (demo ? demoSparkDetail(activeTenantId || "spark") : undefined);

  return (
    <div className="p-1">
      <div className="insights-shell mb-4">
        <h1 className="text-lg font-bold text-slate-900">SPARK Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your CRM and marketing, scored on where you are and which way you're moving.
          Click any area, then any section, to see every data point trended month over month.
        </p>
      </div>

      {demo && !state.payload && <SampleDataBadge />}

      {state.status === "loading" && !shown && <InsightsLoading />}
      {state.status === "error" && !shown && <InsightsError />}
      {state.status === "empty" && !shown && (
        <InsightsEmpty
          title="Nothing to trend yet"
          lead="Trends compare this month with the ones before it, so they start appearing once there is a month of activity to compare. Here is what feeds them:"
          sources={SPARK_INSIGHT_SOURCES}
        />
      )}
      {dashboards && <TrendDashboardView dashboards={dashboards} platformLabel="SPARK" detail={detail} />}
    </div>
  );
}

export default SparkIAInsightsTrendsPage;

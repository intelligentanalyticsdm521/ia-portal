// SparkIAInsightsIntelligencePage — v13.0 (Brandon 2026-07-25 — mirror model).
// Intelligence MIRRORS Trends: scored dashboards → clickable sections → deep
// detail reports, rendered through the same TrendDashboardView. Content is
// modelled: per-line-item forecasts, anomaly z-scores, impact rankings.
//
// NO DEMO FALLBACK FOR A REAL BUSINESS (SPARK pack 1, 2026-09-08) — and this page
// was the worst of the three for it. `payload || demoSparkMetrics(seed)` fed a
// FORECASTING model with invented history, so a business with no data was shown
// modelled churn risk and campaign payoff for customers it did not have. The
// seeded generator now runs only behind a dev-only flag and says SAMPLE on screen.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { demoSparkMetrics } from "../../analytics/sparkDashboards";
import { demoSparkDetail } from "../../analytics/sparkDetail";
import { buildIntelligenceMirror, SPARK_MIRROR } from "../../analytics/intelligenceMirror";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";
import { insightsDemoAllowed } from "../../components/insights/insightsDemo";
import { InsightsEmpty, InsightsError, InsightsLoading, SampleDataBadge } from "../../components/insights/InsightsStateView";
import { SPARK_INSIGHT_SOURCES } from "../../components/insights/sparkInsightSources";

export function SparkIAInsightsIntelligencePage() {
  const { activeTenantId } = useAppState();
  const state = useProductInsightsPayload("spark");
  const demo = insightsDemoAllowed();

  const built = useMemo(() => {
    const seed = activeTenantId || "spark";
    const metrics = state.payload || (demo ? demoSparkMetrics(seed) : null);
    if (!metrics) return null;
    // Real detail when the business has rows; demo detail only alongside demo
    // metrics — never mixed, because a real trend beside an invented line item is
    // the hardest kind of wrong to notice.
    const detail = state.payload
      ? ((state.payload as any).detail && Object.keys((state.payload as any).detail).length ? (state.payload as any).detail : {})
      : demoSparkDetail(seed);
    return buildIntelligenceMirror({ ...metrics, detail }, SPARK_MIRROR);
  }, [state.payload, activeTenantId, demo]);

  return (
    <div className="p-1">
      <div className="insights-shell mb-4">
        <h1 className="text-lg font-bold text-slate-900">SPARK Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The same structure as Trends, but modelled: where every trend is heading, what's
          unusual, and where focus pays off — down to the individual line item.
        </p>
      </div>

      {demo && !state.payload && <SampleDataBadge />}

      {state.status === "loading" && !built && <InsightsLoading />}
      {state.status === "error" && !built && <InsightsError />}
      {state.status === "empty" && !built && (
        <InsightsEmpty
          title="Nothing to model yet"
          lead="These are forecasts, and a forecast needs a history to work from — there is nothing here we could honestly project. It fills in as the months below accumulate:"
          sources={SPARK_INSIGHT_SOURCES}
        />
      )}
      {built && (
        <TrendDashboardView dashboards={built.dashboards} platformLabel="SPARK" detail={built.detail} scoreNoun="Intelligence" />
      )}
    </div>
  );
}

export default SparkIAInsightsIntelligencePage;

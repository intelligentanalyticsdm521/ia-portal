// SparkIAInsightsIntelligencePage — v13.0 (Brandon 2026-07-25 — mirror model).
// Intelligence MIRRORS Trends: scored dashboards → clickable sections → deep
// detail reports, rendered through the same TrendDashboardView. Content is
// modeled: per-line-item forecasts, anomaly z-scores, impact rankings.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { demoSparkMetrics } from "../../analytics/sparkDashboards";
import { demoSparkDetail } from "../../analytics/sparkDetail";
import { buildIntelligenceMirror, SPARK_MIRROR } from "../../analytics/intelligenceMirror";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function SparkIAInsightsIntelligencePage() {
  const { activeTenantId } = useAppState();
  // Real monthly series when the tenant has rows (same endpoint as Trends);
  // line-item detail stays demo until dimensioned capture lands.
  const payload = useProductInsightsPayload("spark");
  const built = useMemo(() => {
    const seed = activeTenantId || "spark";
    const metrics = payload || demoSparkMetrics(seed);
    return buildIntelligenceMirror({ ...metrics, detail: demoSparkDetail(seed) }, SPARK_MIRROR);
  }, [payload, activeTenantId]);
  return (
    <div className="p-1">
      <div className="max-w-5xl mx-auto mb-4">
        <h1 className="text-lg font-bold text-slate-900">SPARK Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The same structure as Trends, but modelled: where every trend is heading, what's
          unusual, and where focus pays off — down to the individual line item.
        </p>
      </div>
      <TrendDashboardView dashboards={built.dashboards} platformLabel="SPARK" detail={built.detail} scoreNoun="Intelligence" />
    </div>
  );
}

export default SparkIAInsightsIntelligencePage;

// SparkIAInsightsTrendsPage — v12.0 (Brandon 2026-07-24 model).
//
// Same funnel as ARION: monthly metrics → scored dashboards → TrendDashboardView.
// SPARK's production metrics endpoint isn't built yet, so the series are
// client-generated (demoSparkMetrics) keyed to the active tenant, deterministic
// per tenant. When the SPARK /insights/metrics endpoint ships this swaps to a
// fetch; nothing else changes.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function SparkIAInsightsTrendsPage() {
  const { activeTenantId } = useAppState();
  const dashboards = useMemo(() => {
    const payload = demoSparkMetrics(activeTenantId || "spark");
    return buildSparkDashboards(payload);
  }, [activeTenantId]);

  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">SPARK Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your CRM and marketing, scored on where you are and which way you're moving.
          Click any area, then any section, to see every data point trended month over month.
        </p>
      </div>
      <TrendDashboardView dashboards={dashboards} platformLabel="SPARK" />
    </div>
  );
}

export default SparkIAInsightsTrendsPage;

// OliverIAInsightsTrendsPage — v12.0 (Brandon 2026-07-24 model).
// Same funnel as ARION; OLIVER metrics endpoint is a documented follow-up, so
// series are client-generated per tenant for review.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { buildOliverDashboards, demoOliverMetrics } from "../../analytics/oliverDashboards";
import { demoOliverDetail } from "../../analytics/oliverDetail";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function OliverIAInsightsTrendsPage() {
  const { activeTenantId } = useAppState();
  const dashboards = useMemo(
    () => buildOliverDashboards(demoOliverMetrics(activeTenantId || "oliver")),
    [activeTenantId],
  );
  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">OLIVER Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your operations, scored on where you are and which way you're moving.
          Click any area, then any section, to see every data point trended month over month.
        </p>
      </div>
      <TrendDashboardView dashboards={dashboards} platformLabel="OLIVER" detail={demoOliverDetail(activeTenantId || "oliver")} />
    </div>
  );
}

export default OliverIAInsightsTrendsPage;

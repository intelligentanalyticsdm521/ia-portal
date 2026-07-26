// SparkIAInsightsTrendsPage — v13.1 (Brandon 2026-07-25).
//
// Same funnel as ARION. Series come from the REAL metrics endpoint
// (GET /api/v1/ia-insights/metrics?product=spark — live SQL over
// lumen.contact/campaign); the seeded demo generator is only the fallback
// while the fetch is in flight or the tenant has no rows. Line-item detail
// stays demo until dimensioned capture lands.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { demoSparkDetail } from "../../analytics/sparkDetail";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function SparkIAInsightsTrendsPage() {
  const { activeTenantId } = useAppState();
  const payload = useProductInsightsPayload("spark");
  const dashboards = useMemo(
    () => buildSparkDashboards(payload || demoSparkMetrics(activeTenantId || "spark")),
    [payload, activeTenantId],
  );
  // Real tenants get ONLY real line items (missing reports simply don't
  // appear); the demo detail set renders only when metrics fell back to demo.
  const detail = payload
    ? (payload.detail && Object.keys(payload.detail).length ? payload.detail : undefined)
    : demoSparkDetail(activeTenantId || "spark");

  return (
    <div className="p-1">
      <div className="max-w-5xl mx-auto mb-4">
        <h1 className="text-lg font-bold text-slate-900">SPARK Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your CRM and marketing, scored on where you are and which way you're moving.
          Click any area, then any section, to see every data point trended month over month.
        </p>
      </div>
      <TrendDashboardView dashboards={dashboards} platformLabel="SPARK" detail={detail} />
    </div>
  );
}

export default SparkIAInsightsTrendsPage;

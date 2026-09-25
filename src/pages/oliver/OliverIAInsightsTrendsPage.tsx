// OliverIAInsightsTrendsPage — v13.1 (Brandon 2026-07-25).
// Same funnel as ARION. Series come from the REAL metrics endpoint
// (GET /api/v1/ia-insights/metrics?product=oliver — live SQL over
// oliver.invoice/job/quote); the seeded demo generator is only the fallback
// while the fetch is in flight or the tenant has no rows. Line-item detail
// (payload.detail) is real from the same endpoint — 24 reports since D-BK17,
// 2026-09-25; the demo set draws only when the metrics fell back to demo too.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { buildOliverDashboards, demoOliverMetrics } from "../../analytics/oliverDashboards";
import { demoOliverDetail } from "../../analytics/oliverDetail";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function OliverIAInsightsTrendsPage() {
  const { activeTenantId } = useAppState();
  const payload = useProductInsightsPayload("oliver").payload;
  const dashboards = useMemo(
    () => buildOliverDashboards(payload || demoOliverMetrics(activeTenantId || "oliver")),
    [payload, activeTenantId],
  );
  // Real tenants get ONLY real line items (missing reports simply don't
  // appear); the demo detail set renders only when metrics fell back to demo.
  const detail = payload
    ? (payload.detail && Object.keys(payload.detail).length ? payload.detail : undefined)
    : demoOliverDetail(activeTenantId || "oliver");
  return (
    <div className="p-1">
      <div className="insights-shell mb-4">
        <h1 className="text-lg font-bold text-slate-900">OLIVER Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Your operations, scored on where you are and which way you're moving.
          Click any area, then any section, to see every data point trended month over month.
        </p>
      </div>
      <TrendDashboardView dashboards={dashboards} platformLabel="OLIVER" detail={detail} />
    </div>
  );
}

export default OliverIAInsightsTrendsPage;

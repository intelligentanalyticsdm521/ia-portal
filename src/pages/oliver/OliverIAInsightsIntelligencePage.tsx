// OliverIAInsightsIntelligencePage — v13.0 (Brandon 2026-07-25 — mirror model).
// Intelligence MIRRORS Trends: scored dashboards → clickable sections → deep
// detail reports, rendered through the same TrendDashboardView. Content is
// modeled: per-line-item forecasts, anomaly z-scores, impact rankings.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { demoOliverMetrics } from "../../analytics/oliverDashboards";
import { demoOliverDetail } from "../../analytics/oliverDetail";
import { buildIntelligenceMirror, OLIVER_MIRROR } from "../../analytics/intelligenceMirror";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function OliverIAInsightsIntelligencePage() {
  const { activeTenantId } = useAppState();
  const built = useMemo(() => {
    const seed = activeTenantId || "oliver";
    return buildIntelligenceMirror({ ...demoOliverMetrics(seed), detail: demoOliverDetail(seed) }, OLIVER_MIRROR);
  }, [activeTenantId]);
  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">OLIVER Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The same structure as Trends, but modelled: where every trend is heading, what's
          unusual, and where focus pays off — down to the individual line item.
        </p>
      </div>
      <TrendDashboardView dashboards={built.dashboards} platformLabel="OLIVER" detail={built.detail} scoreNoun="Intelligence" />
    </div>
  );
}

export default OliverIAInsightsIntelligencePage;

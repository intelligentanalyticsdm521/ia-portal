// ArgusIntelligencePage — v13.0 (Brandon 2026-07-25 — mirror model).
// Cross-platform Intelligence mirroring Trends: the journey funnel forecast,
// anomaly radar and opportunity model, with per-line-item modeled detail
// (each lead source projected, each channel anomaly-scanned).

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { demoArgusMetrics } from "../../analytics/argusDashboards";
import { demoArgusDetail } from "../../analytics/argusDetail";
import { buildIntelligenceMirror, ARGUS_MIRROR } from "../../analytics/intelligenceMirror";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";

export function ArgusIntelligencePage() {
  const { activeTenantId } = useAppState();
  const built = useMemo(() => {
    const seed = activeTenantId || "argus";
    return buildIntelligenceMirror({ ...demoArgusMetrics(seed), detail: demoArgusDetail(seed) }, ARGUS_MIRROR);
  }, [activeTenantId]);
  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">ARGUS Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The cross-platform journey, modelled: where leads, customers and revenue are
          heading, what broke pattern, and where focus pays off across every product.
        </p>
      </div>
      <TrendDashboardView dashboards={built.dashboards} platformLabel="ARGUS" detail={built.detail} scoreNoun="Intelligence" />
    </div>
  );
}

export default ArgusIntelligencePage;

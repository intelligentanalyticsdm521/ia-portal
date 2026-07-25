// ArgusTrendsPage — v12.0 (Brandon 2026-07-24 model).
//
// ARGUS Trends = the cross-platform roll-up + ARGUS's own dashboards. It builds
// each product's dashboards, rolls them into per-platform scores, and hands
// those to the cross-platform view alongside the journey + automation-health
// dashboards. Demo-driven for review; the cross-platform roll-up is genuine —
// it aggregates the real scored product dashboards.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { TrendDashboardView } from "../../components/insights/TrendDashboardView";
import { buildArionDashboards } from "../../analytics/arionDashboards";
import { demoArionMetricsClient } from "../../analytics/arionDemoClient";
import { buildSparkDashboards, demoSparkMetrics } from "../../analytics/sparkDashboards";
import { buildOliverDashboards, demoOliverMetrics } from "../../analytics/oliverDashboards";
import { buildArgusDashboards, demoArgusMetrics, type PlatformRollup } from "../../analytics/argusDashboards";
import { demoArgusDetail } from "../../analytics/argusDetail";
import { businessPulse, type DashboardScore } from "../../analytics/scoring";
import { useArionInsightsPayload } from "../../hooks/useArionInsightsPayload";

export function ArgusTrendsPage() {
  const { activeTenantId } = useAppState();
  // Server ARION payload so the ARION roll-up matches the ARION pages exactly.
  const arionPayload = useArionInsightsPayload();

  const dashboards = useMemo(() => {
    const seed = activeTenantId || "argus";
    const arion = buildArionDashboards(arionPayload || demoArionMetricsClient(seed));
    const spark = buildSparkDashboards(demoSparkMetrics(seed));
    const oliver = buildOliverDashboards(demoOliverMetrics(seed));

    const rollup = (label: string, key: string, ds: DashboardScore[]): PlatformRollup => {
      const moves = ds.map((d) => d.movementPct).filter((v): v is number => v != null);
      return {
        key, label, dashboards: ds,
        score: businessPulse(ds.map((d) => d.score)),
        movementPct: moves.length ? moves.reduce((s, v) => s + v, 0) / moves.length : null,
      };
    };

    const platforms: PlatformRollup[] = [
      rollup("ARION", "arion", arion),
      rollup("SPARK", "spark", spark),
      rollup("OLIVER", "oliver", oliver),
    ];
    return buildArgusDashboards(demoArgusMetrics(seed), platforms);
  }, [activeTenantId, arionPayload]);

  return (
    <div className="p-1">
      <div className="max-w-5xl mx-auto mb-4">
        <h1 className="text-lg font-bold text-slate-900">ARGUS Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The whole business across every product, plus the customer journey and the
          automation health that connects them. Click any area to drill in.
        </p>
      </div>
      <TrendDashboardView dashboards={dashboards} platformLabel="ARGUS" detail={demoArgusDetail(activeTenantId || "argus")} />
    </div>
  );
}

export default ArgusTrendsPage;

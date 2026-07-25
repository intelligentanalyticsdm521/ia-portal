// ArionIAInsightsTrendsPage — v12.0 (Brandon 2026-07-24 model).
//
// The whole page is now: fetch one monthly-metrics payload, build the six
// scored dashboards from the catalog, render the generic TrendDashboardView.
// Everything below the platform score — dashboards, sections, detail reports,
// insights — is derived from the Movement+Level scoring engine, not hand-built.
//
// Data flow:
//   GET /arion/insights/metrics  → { metrics: { key: number[12] } }
//     → buildArionDashboards()   → DashboardScore[]  (scoring.ts)
//       → <TrendDashboardView/>  → overview → dashboard → section detail

import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { buildArionDashboards, type MetricsPayload } from "../../../analytics/arionDashboards";
import { TrendDashboardView } from "../../../components/insights/TrendDashboardView";

export function ArionIAInsightsTrendsPage() {
  const { activeSiteId, arionApi } = useArionContext();
  const [payload, setPayload] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    setLoading(true);
    (arionApi as any).getInsightsMetrics?.(activeSiteId, 12)
      .then((r: any) => { if (!cancelled) { setPayload(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setPayload(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  const dashboards = useMemo(
    () => (payload ? buildArionDashboards(payload) : []),
    [payload],
  );

  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">IA Insights — Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Six areas of your digital presence, scored on where you are and which way you're moving.
          Click any area, then any section, to see every data point trended month over month.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading your trends…</div>
      ) : !payload || !dashboards.length ? (
        <div className="text-sm text-slate-400 py-12 text-center">No trend data available for this site yet.</div>
      ) : (
        <TrendDashboardView dashboards={dashboards} platformLabel="ARION" detail={payload.detail} />
      )}
    </div>
  );
}

export default ArionIAInsightsTrendsPage;

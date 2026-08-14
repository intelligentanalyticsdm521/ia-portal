// ArionIAInsightsIntelligencePage — v13.0 (Brandon 2026-07-24 — mirror model).
//
// Intelligence now MIRRORS Trends: scored dashboards → clickable sections →
// detail reports, rendered through the SAME TrendDashboardView. The scores and
// detail are model outputs (forecast health, anomaly severity, weighted-impact
// opportunity) instead of movement counts, and the detail reports are per-line-
// item models (each keyword's projected position, each referral's anomaly).

import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { buildArionIntelligenceDashboards } from "../../../analytics/arionIntelligenceDashboards";
import { TrendDashboardView } from "../../../components/insights/TrendDashboardView";
import type { MetricsPayload } from "../../../analytics/arionDashboards";

export function ArionIAInsightsIntelligencePage() {
  const { activeSiteId, arionApi } = useArionContext();
  const [payload, setPayload] = useState<MetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeSiteId) return;
    let cancelled = false;
    setLoading(true);
    (arionApi as any).getInsightsMetrics?.(activeSiteId, 13)
      .then((r: any) => { if (!cancelled) { setPayload(r); setLoading(false); } })
      .catch(() => { if (!cancelled) { setPayload(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  const built = useMemo(() => (payload ? buildArionIntelligenceDashboards(payload) : null), [payload]);

  return (
    <div className="p-1">
      <div className="insights-shell mb-4">
        <h1 className="text-lg font-bold text-slate-900">IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The same structure as Trends, but modelled: where every trend is heading, what's
          unusual, and where focus pays off — down to the individual keyword and referral.
        </p>
      </div>
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Modelling your data…</div>
      ) : !built ? (
        <div className="text-sm text-slate-400 py-12 text-center">Not enough history to model yet.</div>
      ) : (
        <TrendDashboardView dashboards={built.dashboards} platformLabel="ARION" detail={built.detail} scoreNoun="Intelligence" />
      )}
    </div>
  );
}

export default ArionIAInsightsIntelligencePage;

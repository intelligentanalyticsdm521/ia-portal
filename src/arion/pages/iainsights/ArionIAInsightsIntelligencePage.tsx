// ArionIAInsightsIntelligencePage — v12.0 (Brandon 2026-07-24 model).
//
// Intelligence = modeling on the same monthly series Trends counts. Real
// techniques the 12-month data supports: linear-regression forecasts with
// confidence bands, anomaly detection vs the tenant's own baseline, and an
// opportunity model ranking movers by modelled impact (movement × value).
// See analytics/intelligence.ts + arionIntelligence.ts.

import { useEffect, useMemo, useState } from "react";
import { useArionContext } from "../../useArionContext";
import { buildArionIntelligence } from "../../../analytics/arionIntelligence";
import { IntelligenceView } from "../../../components/insights/IntelligenceView";
import type { MetricsPayload } from "../../../analytics/arionDashboards";

export function ArionIAInsightsIntelligencePage() {
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

  const intel = useMemo(() => (payload ? buildArionIntelligence(payload) : null), [payload]);

  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">IA Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Where your trends are heading, what's unusual, and where focus pays off most —
          modelled from 12 months of your own data, with confidence stated.
        </p>
      </div>
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Modelling your data…</div>
      ) : !intel ? (
        <div className="text-sm text-slate-400 py-12 text-center">Not enough history to model yet.</div>
      ) : (
        <IntelligenceView intel={intel} platformLabel="ARION" />
      )}
    </div>
  );
}

export default ArionIAInsightsIntelligencePage;

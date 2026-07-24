// OliverIAInsightsIntelligencePage — v12.0 (Brandon 2026-07-24 model).
// Intelligence = forecasting / anomaly / opportunity modeling on the same
// monthly series Trends counts, via the generic intelligence builder.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { demoOliverMetrics } from "../../analytics/oliverDashboards";
import { buildIntelligence, OLIVER_INTEL } from "../../analytics/intelligenceBuilder";
import { IntelligenceView } from "../../components/insights/IntelligenceView";

export function OliverIAInsightsIntelligencePage() {
  const { activeTenantId } = useAppState();
  const intel = useMemo(
    () => buildIntelligence(demoOliverMetrics(activeTenantId || "OLIVER".toLowerCase()), OLIVER_INTEL),
    [activeTenantId],
  );
  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">OLIVER Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Where your trends are heading, what's unusual, and where focus pays off most —
          modelled from 12 months of your own data, with confidence stated.
        </p>
      </div>
      <IntelligenceView intel={intel} platformLabel="OLIVER" />
    </div>
  );
}

export default OliverIAInsightsIntelligencePage;

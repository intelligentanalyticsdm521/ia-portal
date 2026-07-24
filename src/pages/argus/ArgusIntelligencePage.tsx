// ArgusIntelligencePage — v12.0 (Brandon 2026-07-24 model).
// ARGUS Intelligence models the cross-platform customer journey: forecasting
// leads/customers/revenue across products, anomaly-scanning the funnel, and
// ranking where focus pays off. Same generic engine as the other platforms.

import { useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { demoArgusMetrics } from "../../analytics/argusDashboards";
import { buildIntelligence, ARGUS_INTEL } from "../../analytics/intelligenceBuilder";
import { IntelligenceView } from "../../components/insights/IntelligenceView";

export function ArgusIntelligencePage() {
  const { activeTenantId } = useAppState();
  const intel = useMemo(
    () => buildIntelligence(demoArgusMetrics(activeTenantId || "argus"), ARGUS_INTEL),
    [activeTenantId],
  );
  return (
    <div className="p-1">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">ARGUS Insights — Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          The cross-platform customer journey — where leads, customers and revenue are
          heading across every product, what's unusual, and where focus pays off most.
        </p>
      </div>
      <IntelligenceView intel={intel} platformLabel="ARGUS" />
    </div>
  );
}

export default ArgusIntelligencePage;

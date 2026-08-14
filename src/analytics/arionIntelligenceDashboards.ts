// arionIntelligenceDashboards.ts — thin delegate to the generic mirror.
//
// ARION Intelligence uses the same business-question mirror engine as every
// other platform (intelligenceMirror.ts, ARION_MIRROR config). This file only
// preserves the original export name so the page doesn't change. The old
// dedicated builder (technique-named Forecast/Anomaly/Opportunity dashboards)
// was replaced when Brandon corrected the framing: Intelligence dashboards
// carry business questions — Visibility Trajectory, Conversion Forecast,
// Local Momentum, Content & Site Risk — with the models as sections inside.

import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore } from "./scoring";
import type { DetailPayload } from "./detail";
import { buildIntelligenceMirror, ARION_MIRROR } from "./intelligenceMirror";

export function buildArionIntelligenceDashboards(payload: MetricsPayload): { dashboards: DashboardScore[]; detail: DetailPayload } {
  return buildIntelligenceMirror(payload, ARION_MIRROR);
}

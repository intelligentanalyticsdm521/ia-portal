// useProductInsightsPayload — the tenant's REAL monthly metrics for SPARK or
// OLIVER, from LUMEN-API GET /api/v1/ia-insights/metrics (computed live from
// lumen.* / oliver.* tables — no snapshot job needed for these platforms).
//
// Same contract as useArionInsightsPayload: returns the payload once fetched,
// null before/on failure — callers fall back to the seeded demo generator so
// review environments without real rows still render. A payload with EMPTY
// metrics (brand-new tenant, nothing to measure) is returned as null too:
// the funnel treats "no real data yet" as unmeasured, and the demo fallback
// only applies in dev where the flag-gated demo tenants live.
import { useEffect, useState } from "react";
import { useSparkApi } from "./useSparkApi";
import type { MetricsPayload } from "../analytics/arionDashboards";

export function useProductInsightsPayload(product: "spark" | "oliver"): MetricsPayload | null {
  const { get, ready } = useSparkApi();
  const [payload, setPayload] = useState<MetricsPayload | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setPayload(null); // tenant switch — never show the previous tenant's series
    (async () => {
      try {
        const p = await get<any>(`/api/v1/ia-insights/metrics?product=${product}&months=13`);
        const metrics = p?.metrics && Object.keys(p.metrics).length ? p.metrics : null;
        if (!cancelled && metrics) setPayload({ metrics } as MetricsPayload);
      } catch { /* fall back to the demo generator */ }
    })();
    return () => { cancelled = true; };
  }, [get, ready, product]);

  return payload;
}

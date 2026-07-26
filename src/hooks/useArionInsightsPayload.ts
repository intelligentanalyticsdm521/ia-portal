// useArionInsightsPayload — the tenant's ARION insights payload for surfaces
// OUTSIDE the ARION section (home strip, other platforms' Health pages, the
// ARGUS roll-ups).
//
// Why this exists (Brandon 2026-07-25): the home screen showed ARION 69 while
// the ARION Health page showed 68 — composite surfaces were scoring a
// client-generated series (seeded by tenant) while the ARION pages score the
// SERVER payload from GET /arion/insights/metrics (seeded by site). Every
// surface that shows an ARION number must derive it from the SAME payload, so
// composites fetch the server payload for the tenant's first site and only
// fall back to the client generator when the fetch fails (signed-out, no
// site, network).
import { useEffect, useState } from "react";
import { useAppState } from "../app/AppState";
import { useAccessToken } from "../auth/useAccessToken";
import { listArionSites, getInsightsMetrics } from "../lib/arionApi";
import type { MetricsPayload } from "../analytics/arionDashboards";

export function useArionInsightsPayload(): MetricsPayload | null {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [payload, setPayload] = useState<MetricsPayload | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    setPayload(null); // tenant switch — never show the previous tenant's series
    (async () => {
      try {
        const token = await getToken();
        const auth = {
          baseUrl: import.meta.env.VITE_ARION_API_BASE_URL as string,
          bearerToken: token.accessToken,
          tenantId: activeTenantId,
        };
        const s = await listArionSites(auth);
        const site = s?.sites?.[0];
        if (!site || cancelled) return;
        const p = await getInsightsMetrics({ ...auth, siteId: site.siteId, months: 13 });
        if (!cancelled && p && (p as any).metrics) setPayload(p as MetricsPayload);
      } catch { /* composite falls back to the client generator */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  return payload;
}

// useProductInsightsPayload — the tenant's REAL monthly metrics for SPARK or
// OLIVER, from LUMEN-API GET /api/v1/ia-insights/metrics (computed live from
// lumen.* / oliver.* tables — no snapshot job needed for these platforms).
//
// WHAT CHANGED, AND WHY IT MATTERED (SPARK pack 1, 2026-09-08)
// ─────────────────────────────────────────────────────────────────────────────
// This hook used to return `MetricsPayload | null`, and null meant four different
// things: still loading, the fetch failed, the tenant has no rows, or the tenant
// has rows but every metric is empty. All four collapsed into one value, and the
// three SPARK insight pages then did this:
//
//     const payload = useProductInsightsPayload("spark");
//     const metrics = payload || demoSparkMetrics(activeTenantId);
//
// So a real business whose metrics endpoint 500'd — or who simply had no data yet
// — was shown a full set of dashboards, gauges, month-over-month trends and
// forecasts generated from a SEED DERIVED FROM THEIR OWN TENANT ID. Plausible
// numbers, stable across refreshes, with nothing anywhere on the screen saying
// they were invented. A client could have read their "campaign ROI" out loud in a
// meeting.
//
// The `catch { /* fall back to the demo generator */ }` was the mechanism:
// `reference_catch_swallow_report_success`, in a hook, producing not a wrong 200
// but a wrong CHART.
//
// So the state is now explicit — loading / error / empty / ready — the pages
// render an honest empty state, and the demo generator survives only behind a
// dev-only flag that labels itself SAMPLE on screen (see insightsDemo.ts).
import { useEffect, useState } from "react";
import { useSparkApi } from "./useSparkApi";
import type { MetricsPayload } from "../analytics/arionDashboards";

export type InsightsState =
  /** The request has not finished. Render a skeleton, not an answer. */
  | { status: "loading"; payload: null; error: null }
  /** We could not read the numbers. SAY SO — never draw a chart instead. */
  | { status: "error"; payload: null; error: unknown }
  /** Reached, understood, and there is genuinely nothing to measure yet. */
  | { status: "empty"; payload: null; error: null }
  /** Real numbers for this business. */
  | { status: "ready"; payload: MetricsPayload; error: null };

const LOADING: InsightsState = { status: "loading", payload: null, error: null };

export function useProductInsightsPayload(product: "spark" | "oliver"): InsightsState {
  const { get, ready } = useSparkApi();
  const [state, setState] = useState<InsightsState>(LOADING);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setState(LOADING); // tenant switch — never show the previous tenant's series
    (async () => {
      try {
        const p = await get<any>(`/api/v1/ia-insights/metrics?product=${product}&months=13`);
        const metrics = p?.metrics && Object.keys(p.metrics).length ? p.metrics : null;
        if (cancelled) return;
        if (!metrics) {
          // A brand-new business with nothing to measure. Distinct from an error,
          // and the empty state says what will fill it.
          setState({ status: "empty", payload: null, error: null });
          return;
        }
        setState({
          status: "ready",
          payload: { metrics, benchmarks: p.benchmarks, detail: p.detail } as unknown as MetricsPayload,
          error: null,
        });
      } catch (err) {
        // NOT swallowed. The page tells the owner we could not read their numbers.
        console.error(`[useProductInsightsPayload] ${product} metrics could not be read.`, err);
        if (!cancelled) setState({ status: "error", payload: null, error: err });
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready, product]);

  return state;
}

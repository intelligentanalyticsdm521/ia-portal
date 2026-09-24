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
import { useStellaApi } from "./useStellaApi";
import type { MetricsPayload } from "../analytics/arionDashboards";
import type { DetailPayload } from "../analytics/detail";

/**
 * STELLA (D-177). Its reports are built by oliver-api from the SAME statement
 * functions the /ledger statement routes use (GET /ledger/insights-detail), so
 * the ledger math has one home. The period and basis are the Reports page's
 * month picker and cash/accrual toggle; changing either re-fetches.
 */
export interface StellaInsightsOptions {
  /** "YYYY-MM" — the last month of the 13-month window. Default: this month. */
  month?: string;
  basis?: "cash" | "accrual";
}

/** What the server says the reports cover — the export paths are built from it. */
export interface StellaReportPeriod {
  basis: "cash" | "accrual";
  months: number;
  month: string;
  from: string;
  to: string;
  as_of: string;
  year: number;
  month_list: string[];
}

export function stellaInsightsPath(opts: StellaInsightsOptions = {}): string {
  const q = new URLSearchParams({ months: "13" });
  if (opts.basis) q.set("basis", opts.basis);
  if (opts.month) q.set("month", opts.month);
  return `/ledger/insights-detail?${q.toString()}`;
}

export type InsightsState =
  /** The request has not finished. Render a skeleton, not an answer. */
  | { status: "loading"; payload: null; error: null }
  /** We could not read the numbers. SAY SO — never draw a chart instead. */
  | { status: "error"; payload: null; error: unknown }
  /** Reached, understood, and there is genuinely nothing to measure yet. */
  | { status: "empty"; payload: null; error: null }
  /** Real numbers for this business. */
  | { status: "ready"; payload: MetricsPayload & { period?: StellaReportPeriod }; error: null };

const LOADING: InsightsState = { status: "loading", payload: null, error: null };

export function useProductInsightsPayload(
  product: "spark" | "oliver" | "stella",
  stella: StellaInsightsOptions = {},
): InsightsState {
  const { get, ready } = useSparkApi();
  const stellaApi = useStellaApi();
  const [state, setState] = useState<InsightsState>(LOADING);
  const stellaPath = stellaInsightsPath(stella);

  useEffect(() => {
    if (product !== "stella") return;
    if (!stellaApi.ready) return;
    let cancelled = false;
    setState(LOADING); // period / basis / tenant switch — never show the previous answer
    (async () => {
      try {
        const p = await stellaApi.get<{ detail?: DetailPayload; period?: StellaReportPeriod }>(stellaPath);
        if (cancelled) return;
        const detail = p?.detail && Object.keys(p.detail).length ? p.detail : null;
        if (!detail) {
          setState({ status: "empty", payload: null, error: null });
          return;
        }
        setState({
          status: "ready",
          payload: { metrics: {}, detail, period: p.period } as unknown as MetricsPayload & { period?: StellaReportPeriod },
          error: null,
        });
      } catch (err) {
        console.error("[useProductInsightsPayload] stella reports could not be read.", err);
        if (!cancelled) setState({ status: "error", payload: null, error: err });
      }
    })();
    return () => { cancelled = true; };
  }, [product, stellaApi, stellaPath]);

  useEffect(() => {
    if (product === "stella") return;
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

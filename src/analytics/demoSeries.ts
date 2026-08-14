// demoSeries.ts — deterministic 12-month demo series (client side).
//
// ARION fetches its monthly series from GET /arion/insights/metrics (real
// endpoint, demo-backed in dev). SPARK / OLIVER / ARGUS don't have their
// metric endpoints yet — building three more backends is out of scope for the
// overnight pass — so their Trends dashboards render from this client-side
// generator instead, using the SAME MetricsPayload shape.
//
// Each platform's production metrics endpoint + monthly snapshot job is a
// documented follow-up (see INSIGHTS_MODEL_SPEC + the STELLA/deploy docs); when
// it lands, the platform page swaps this call for the fetch, nothing else
// changes.

import type { MetricsPayload } from "./arionDashboards";

function rng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}

export interface SeriesSpec {
  base: number;
  drift?: number;   // per-month growth fraction (can be negative)
  noise?: number;
  dir?: -1 | 0 | 1; // recent 2-month bias
  integer?: boolean;
  min?: number;
  max?: number;
}

/** One metric's 12-month series, oldest→newest. */
export function genSeries(seed: string, spec: SeriesSpec): number[] {
  const rand = rng(seed);
  const { base, drift = 0.02, noise = 0.05, dir = 0, integer = false, min = 0, max } = spec;
  const out: number[] = [];
  for (let m = 11; m >= 0; m--) {
    const growth = 1 + drift * (11 - m);
    const n = 1 + (rand() - 0.5) * 2 * noise;
    let recent = 1;
    if (dir !== 0 && m <= 1) recent = 1 + dir * (0.1 + rand() * 0.16);
    let v = base * growth * n * recent;
    if (v < min) v = min;
    if (max != null && v > max) v = max;
    out.push(integer ? Math.round(v) : Number(v.toFixed(4)));
  }
  return out;
}

/**
 * Build a MetricsPayload from a spec map. `derive` lets a metric be computed
 * from already-generated ones (e.g. a rate = numerator/denominator per month).
 */
export function buildDemoPayload(
  seedBase: string,
  specs: Record<string, SeriesSpec>,
  derive?: (M: Record<string, number[]>) => Record<string, number[]>,
): MetricsPayload {
  const months: string[] = [];
  const now = new Date();
  for (let m = 11; m >= 0; m--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const M: Record<string, number[]> = {};
  for (const [key, spec] of Object.entries(specs)) M[key] = genSeries(`${seedBase}:${key}`, spec);
  const derived = derive ? derive(M) : {};
  return { source: "demo", months, metrics: { ...M, ...derived } };
}

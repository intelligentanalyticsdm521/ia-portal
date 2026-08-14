// intelligence.ts — the ARION Intelligence modeling engine.
//
// Trends counts movement; Intelligence MODELS it. Honest techniques the
// 12-month monthly series supports (Brandon: push as far as the data allows):
//
//   · linearForecast   — least-squares trend + projection with a confidence
//                        band from the residual spread. Real regression, r²
//                        reported so low-fit forecasts are flagged, not hidden.
//   · detectAnomaly    — z-score of the latest point vs the tenant's own
//                        trailing baseline (own-baseline, not a global norm).
//   · weightedImpact   — rank movers by modelled impact = movement × the value
//                        they carry (the "5 risers had more volume than 3
//                        fallers" analysis).
//
// Techniques that need more history (Holt-Winters / ARIMA seasonal
// decomposition want 18-24 months — SeahawkMedia, Promodo 2026) are documented
// as future work in the model-review doc, NOT faked on 12 months.
//
// All pure functions; every output states its confidence.

export interface Forecast {
  slope: number;            // change per month (in the metric's units)
  intercept: number;
  r2: number;               // 0-1 fit quality
  current: number;
  projected: number[];      // horizon months ahead
  bandLow: number[];        // ~68% confidence lower
  bandHigh: number[];       // ~68% confidence upper
  confidence: "high" | "medium" | "low";
  direction: "rising" | "flat" | "falling";
}

/** Least-squares linear regression + forward projection with a residual band. */
export function linearForecast(series: Array<number | null>, horizon = 3): Forecast | null {
  const pts = series
    .map((v, i) => [i, v] as const)
    .filter((p): p is readonly [number, number] => p[1] != null && isFinite(p[1]!));
  if (pts.length < 4) return null;

  const n = pts.length;
  const sx = pts.reduce((s, p) => s + p[0], 0);
  const sy = pts.reduce((s, p) => s + p[1], 0);
  const sxx = pts.reduce((s, p) => s + p[0] * p[0], 0);
  const sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const denom = n * sxx - sx * sx || 1;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  // r² and residual standard deviation.
  const meanY = sy / n;
  let ssTot = 0, ssRes = 0;
  for (const [x, y] of pts) {
    const pred = slope * x + intercept;
    ssTot += (y - meanY) ** 2;
    ssRes += (y - pred) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  const resSd = Math.sqrt(ssRes / Math.max(1, n - 2));

  const lastX = pts[pts.length - 1][0];
  const current = slope * lastX + intercept;
  const projected: number[] = [], bandLow: number[] = [], bandHigh: number[] = [];
  for (let h = 1; h <= horizon; h++) {
    const x = lastX + h;
    const p = slope * x + intercept;
    // Band widens with horizon (prediction uncertainty grows).
    const widen = resSd * Math.sqrt(1 + h / n);
    projected.push(p);
    bandLow.push(p - widen);
    bandHigh.push(p + widen);
  }

  const relSlope = meanY !== 0 ? (slope / Math.abs(meanY)) : 0;
  const direction = Math.abs(relSlope) < 0.01 ? "flat" : slope > 0 ? "rising" : "falling";
  const confidence = r2 >= 0.6 ? "high" : r2 >= 0.3 ? "medium" : "low";
  return { slope, intercept, r2, current, projected, bandLow, bandHigh, confidence, direction };
}

export interface Anomaly {
  z: number;                // standard deviations from baseline
  isAnomaly: boolean;       // |z| >= 2
  severity: "none" | "watch" | "alert";
  current: number;
  baseline: number;
  direction: "above" | "below";
}

/** z-score of the latest value vs the trailing baseline (the tenant's own norm). */
export function detectAnomaly(series: Array<number | null>, baselineMonths = 6): Anomaly | null {
  const clean = series.filter((v): v is number => v != null && isFinite(v));
  if (clean.length < 5) return null;
  const current = clean[clean.length - 1];
  const base = clean.slice(-baselineMonths - 1, -1);
  if (base.length < 3) return null;
  const mean = base.reduce((s, v) => s + v, 0) / base.length;
  const sd = Math.sqrt(base.reduce((s, v) => s + (v - mean) ** 2, 0) / base.length) || 1;
  const z = (current - mean) / sd;
  const abs = Math.abs(z);
  return {
    z,
    isAnomaly: abs >= 2,
    severity: abs >= 3 ? "alert" : abs >= 2 ? "watch" : "none",
    current, baseline: mean,
    direction: z >= 0 ? "above" : "below",
  };
}

export interface ImpactItem<T> { item: T; movementPct: number; weightValue: number; }
export interface RankedImpact<T> { item: T; movementPct: number; weightValue: number; impact: number; }

/**
 * Rank movers by MODELLED impact = movement × the value/volume they carry.
 * This is the Intelligence answer to a Trends count: not "5 up, 3 down" but
 * "the 5 that rose carry 8,400 volume, the 3 that fell 2,100 — net positive."
 */
export function weightedImpact<T>(items: ImpactItem<T>[]): { ranked: RankedImpact<T>[]; netImpact: number } {
  const ranked = items
    .map((x) => ({ ...x, impact: (x.movementPct / 100) * x.weightValue }))
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
  const netImpact = ranked.reduce((s, x) => s + x.impact, 0);
  return { ranked, netImpact };
}

/** Project a total from a per-unit forecast (e.g. forecast next-month leads → revenue). */
export function projectTotal(forecast: Forecast | null, perUnit: number): { value: number; low: number; high: number } | null {
  if (!forecast) return null;
  return {
    value: forecast.projected[forecast.projected.length - 1] * perUnit,
    low: forecast.bandLow[forecast.bandLow.length - 1] * perUnit,
    high: forecast.bandHigh[forecast.bandHigh.length - 1] * perUnit,
  };
}

// scoring.ts — the canonical Insights scoring engine (all platforms).
//
// Implements the model locked with Brandon 2026-07-24 (see
// overnight-report/INSIGHTS_MODEL_SPEC.md):
//
//   data point score = 0.30 * Movement + 0.70 * Level
//
//   Movement — direction-aware month-over-month change, flat = 50.
//   Level    — is the number actually good, vs Self / Cohort / Absolute.
//
//   section  = weighted avg of its data-point scores
//   dashboard= weighted avg of its section scores
//
// Pure functions, no React, no fetching — every platform's engines import this
// so the math is identical everywhere and tunable in one place.

// ── Tunables (quarterly model review changes these, nothing else) ─────────
export const WEIGHTS = {
  movement: 0.30,
  level: 0.70,
} as const;

/** Improvement% → movement score. flat=50; +25%→~90; −25%→~10. */
// Calibration 2026-07-25 (real-client autopsy): 1.6 → 1.2. At 1.6 a -31%
// month hit the floor; at 1.2 the same month scores 20-ish and a ±10% swing
// moves the score ±12 — still decisive, no longer a cliff.
export const MOVEMENT_SLOPE = 1.2;

/** Level curve anchors: at the benchmark you are "solid" = this score. */
export const LEVEL_AT_BENCHMARK = 70;
/** Above the benchmark, each +100% of benchmark adds this many points. */
export const LEVEL_ABOVE_SLOPE = 40;

// ── Types ────────────────────────────────────────────────────────────────
export type BenchmarkKind = "self" | "cohort" | "absolute";
export type VisualKind = "line" | "bar" | "donut" | "gauge" | "stat";
// "currency" is the rounded dashboard figure ($44.2k). "money" (D-177) is a
// bookkeeping figure — exact cents, minus before the sign ($44,182.86,
// -$1,999.98) — the way QuickBooks prints a statement. STELLA uses "money".
export type ValueFormat =
  | "percent" | "number" | "score" | "position" | "ms" | "rating" | "count" | "currency" | "money";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Exact cents, minus before the dollar sign: 44182.86 → "$44,182.86", -1999.98 → "-$1,999.98". */
export function fmtMoney(n: number): string {
  return MONEY.format(n);
}

export interface Benchmark {
  /** The "solid/typical-good" reference value the metric is judged against. */
  value: number;
  kind: BenchmarkKind;
}

export interface UnmeasuredInfo {
  reason: string;
  kind: "connect" | "plan";
}

export interface DataPointInput {
  key: string;
  label: string;
  /** Monthly values oldest → newest; the last element is the current month. */
  series: Array<number | null>;
  higherIsBetter: boolean;
  format: ValueFormat;
  visual: VisualKind;
  /** Below this absolute value, movement is reported but scored neutral. */
  sufficiencyFloor?: number;
  benchmark?: Benchmark;
  /** Weight within its section (relative; normalised at aggregation). */
  weight: number;
  /** One line: what it measures, owner's language. */
  what?: string;
  /** Set when the source is not connected / not in plan → excluded from score. */
  unmeasured?: UnmeasuredInfo;
}

export interface DataPointScore {
  key: string;
  label: string;
  format: ValueFormat;
  visual: VisualKind;
  what?: string;
  series: Array<number | null>;
  current: number | null;
  priorMonth: number | null;
  /** Direction-aware improvement %, null when no comparable prior. */
  movementPct: number | null;
  movementScore: number;
  levelScore: number | null;
  levelKind: BenchmarkKind | null;
  score: number;
  weight: number;
  unmeasured?: UnmeasuredInfo;
  higherIsBetter: boolean;
}

export interface SectionScore {
  key: string;
  label: string;
  score: number | null;      // null when every data point is unmeasured
  priorScore: number | null; // prior-month section score, for the card's MoM
  movementPct: number | null;
  coverage: number;          // 0-100, share of data points measured
  dataPoints: DataPointScore[];
  weight: number;
}

export interface DashboardScore {
  key: string;
  label: string;
  score: number | null;
  priorScore: number | null;
  movementPct: number | null;
  coverage: number;
  sections: SectionScore[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function lastReal(series: Array<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null && isFinite(series[i]!)) return series[i]!;
  return null;
}

/** Trailing average of the up-to-N months BEFORE the current one. */
function trailingAvg(series: Array<number | null>, n: number): number | null {
  const past = series.slice(0, -1).filter((v): v is number => v != null && isFinite(v));
  if (!past.length) return null;
  const slice = past.slice(-n);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

// ── Movement ────────────────────────────────────────────────────────────────
/**
 * Direction-aware improvement % of current vs a 3-month trailing baseline,
 * and its 0-100 movement score. Returns movementPct=null when there is no
 * usable prior (first month) — the caller shows "first month", not a fake move.
 */
export function movement(dp: DataPointInput, smoothMonths = 3): { pct: number | null; score: number } {
  const current = lastReal(dp.series);
  const baseline = trailingAvg(dp.series, smoothMonths);
  if (current == null || baseline == null || baseline === 0) return { pct: null, score: 50 };

  // Sufficiency floor — tiny absolute numbers produce meaningless % swings.
  if (dp.sufficiencyFloor != null && Math.max(Math.abs(current), Math.abs(baseline)) < dp.sufficiencyFloor) {
    return { pct: null, score: 50 };
  }

  const rawPct = ((current - baseline) / Math.abs(baseline)) * 100;
  const improvementPct = dp.higherIsBetter ? rawPct : -rawPct;
  // Calibration (Brandon 2026-07-25, real-client autopsy): declines floor at
  // 20 instead of 0 — a bad month is bad, not annihilation. One -31% metric
  // was zeroing 30% of its data point's score.
  return { pct: improvementPct, score: clamp(50 + improvementPct * MOVEMENT_SLOPE, 20) };
}

// ── Level ────────────────────────────────────────────────────────────────
/**
 * Is the current value good? Judged against the supplied benchmark, or (when
 * none is supplied) against the tenant's own trailing history (Self).
 *
 * Curve: ratio = value/benchmark (inverted for lower-is-better).
 *   ratio 1   → LEVEL_AT_BENCHMARK (70, "solid")
 *   ratio 1.75→ ~100
 *   ratio 0.5 → ~35
 *   ratio 0   → 0
 */
export function level(dp: DataPointInput, smoothMonths = 3): { score: number | null; kind: BenchmarkKind | null } {
  const current = lastReal(dp.series);
  if (current == null) return { score: null, kind: null };

  let ref: number | null = dp.benchmark?.value ?? null;
  let kind: BenchmarkKind | null = dp.benchmark?.kind ?? null;
  if (ref == null || ref === 0) {
    // Self benchmark — calibration 2026-07-25 (real-client autopsy). This
    // used the SAME 3-month trailing average movement uses, so one decline
    // was punished twice. Now: prefer the SAME MONTH LAST YEAR (real
    // seasonality — needs a 13+ month series, which the prod readers serve),
    // else the FULL-YEAR average ("your normal"), never movement's window.
    const yoy = dp.series.length >= 13 ? dp.series[dp.series.length - 13] : null;
    ref = yoy != null && isFinite(yoy) && yoy !== 0 ? yoy : trailingAvg(dp.series, 12);
    kind = "self";
  }
  if (ref == null || ref === 0) return { score: null, kind: null };

  const ratio = dp.higherIsBetter ? current / ref : ref / current;
  // Below-benchmark slope: against COHORT/ABSOLUTE benchmarks the full
  // proportional penalty applies. Against SELF (your own last year), being
  // 25% below your best-ever year is caution, not failure — calibration
  // 2026-07-25: self-below decays at 45/unit instead of 70 (ratio 0.75 →
  // ~59 instead of 52.5), so a softening business reads "watch this," while
  // industry shortfalls still bite.
  const score = ratio <= 1
    ? (kind === "self"
        ? LEVEL_AT_BENCHMARK - (1 - ratio) * 45
        : LEVEL_AT_BENCHMARK * ratio)
    : LEVEL_AT_BENCHMARK + (ratio - 1) * LEVEL_ABOVE_SLOPE;
  return { score: clamp(score), kind };
}

// ── Data point ────────────────────────────────────────────────────────────
export function scoreDataPoint(dp: DataPointInput, smoothMonths = 3): DataPointScore {
  const current = lastReal(dp.series);
  const priorMonth = dp.series.length >= 2 ? dp.series[dp.series.length - 2] ?? null : null;

  if (dp.unmeasured) {
    return {
      key: dp.key, label: dp.label, format: dp.format, visual: dp.visual, what: dp.what,
      series: dp.series, current, priorMonth,
      movementPct: null, movementScore: 50, levelScore: null, levelKind: null,
      score: 50, weight: dp.weight, unmeasured: dp.unmeasured, higherIsBetter: dp.higherIsBetter,
    };
  }

  const mv = movement(dp, smoothMonths);
  const lv = level(dp, smoothMonths);

  // Combine. When Level can't be computed (no benchmark AND no history), fall
  // back to Movement alone rather than inventing a Level.
  const score = lv.score == null
    ? mv.score
    : WEIGHTS.movement * mv.score + WEIGHTS.level * lv.score;

  return {
    key: dp.key, label: dp.label, format: dp.format, visual: dp.visual, what: dp.what,
    series: dp.series, current, priorMonth,
    movementPct: mv.pct, movementScore: mv.score,
    levelScore: lv.score, levelKind: lv.kind,
    score: clamp(Math.round(score)),
    weight: dp.weight, higherIsBetter: dp.higherIsBetter,
  };
}

// ── Section ────────────────────────────────────────────────────────────────
function weightedAvg(items: Array<{ score: number; weight: number }>): number | null {
  const live = items.filter((i) => isFinite(i.score));
  if (!live.length) return null;
  const total = live.reduce((s, i) => s + i.weight, 0) || 1;
  return live.reduce((s, i) => s + i.score * (i.weight / total), 0);
}

export interface SectionInput {
  key: string;
  label: string;
  weight: number;
  dataPoints: DataPointInput[];
}

export function scoreSection(section: SectionInput, smoothMonths = 3): SectionScore {
  const scored = section.dataPoints.map((dp) => scoreDataPoint(dp, smoothMonths));
  const measured = scored.filter((s) => !s.unmeasured);
  const coverage = Math.round((measured.length / Math.max(1, scored.length)) * 100);
  const score = weightedAvg(measured.map((s) => ({ score: s.score, weight: s.weight })));

  // Prior-month section score: re-score each data point as if last month were
  // "current" (drop the final element), so the card can show a real section MoM.
  const priorScored = measured.map((s) => {
    const dpIn = section.dataPoints.find((d) => d.key === s.key)!;
    if (dpIn.series.length < 3) return null;
    return scoreDataPoint({ ...dpIn, series: dpIn.series.slice(0, -1) }, smoothMonths);
  }).filter(Boolean) as DataPointScore[];
  const priorScore = priorScored.length
    ? weightedAvg(priorScored.map((s) => ({ score: s.score, weight: s.weight })))
    : null;

  const movementPct = score != null && priorScore != null && priorScore !== 0
    ? ((score - priorScore) / priorScore) * 100
    : null;

  return {
    key: section.key, label: section.label,
    score: score == null ? null : clamp(Math.round(score)),
    priorScore: priorScore == null ? null : clamp(Math.round(priorScore)),
    movementPct,
    coverage,
    dataPoints: scored,
    weight: section.weight,
  };
}

// ── Dashboard ────────────────────────────────────────────────────────────
export interface DashboardInput {
  key: string;
  label: string;
  sections: SectionInput[];
}

export function scoreDashboard(dash: DashboardInput, smoothMonths = 3): DashboardScore {
  const sections = dash.sections.map((s) => scoreSection(s, smoothMonths));
  const measured = sections.filter((s) => s.score != null);
  const coverage = measured.length
    ? Math.round(measured.reduce((s, x) => s + x.coverage, 0) / measured.length)
    : 0;

  const score = weightedAvg(measured.map((s) => ({ score: s.score!, weight: s.weight })));
  const priorScore = weightedAvg(
    measured.filter((s) => s.priorScore != null).map((s) => ({ score: s.priorScore!, weight: s.weight })),
  );
  const movementPct = score != null && priorScore != null && priorScore !== 0
    ? ((score - priorScore) / priorScore) * 100
    : null;

  return {
    key: dash.key, label: dash.label,
    score: score == null ? null : clamp(Math.round(score)),
    priorScore: priorScore == null ? null : clamp(Math.round(priorScore)),
    movementPct,
    coverage,
    sections,
  };
}

/** Business Pulse — equal-weight average of active platform scores. */
export function businessPulse(platformScores: Array<number | null>): number | null {
  const live = platformScores.filter((s): s is number => s != null && isFinite(s));
  if (!live.length) return null;
  return clamp(Math.round(live.reduce((s, v) => s + v, 0) / live.length));
}

// healthSummary.ts — shared roll-ups feeding the four IA Insights Health pages.
//
// Health = the gauge header above each platform's Trends/Intelligence pages.
// Everything here derives from the SAME builders those pages render, so the
// gauges can never disagree with the pages they summarise:
//
//   Trend Score        = businessPulse(trend dashboard scores)
//   Intelligence Score = businessPulse(intelligence-mirror dashboard scores)
//   Platform Score     = 50/50 Trend + Intelligence (Brandon's LOCKED rule,
//                        2026-06-21, platformPulse.js) — Trend-only when
//                        Intelligence has no score yet.
//   Business Pulse     = businessPulse(ARION/SPARK/OLIVER platform scores),
//                        computed client-side from the demo builders for
//                        review — the same roll-up ArgusTrendsPage does.
//                        Once the monthly snapshot jobs land (the named prod
//                        prerequisite), this reverts to the platform-api
//                        /argus/business-pulse endpoint as the single source.

import { businessPulse, type DashboardScore } from "./scoring";
import { bandFromScore, type GaugeValue, type ScoreBreakdownBar } from "../components/iainsights/types";
import { buildArionDashboards } from "./arionDashboards";
import { demoArionMetricsClient } from "./arionDemoClient";
import { buildSparkDashboards, demoSparkMetrics } from "./sparkDashboards";
import { buildOliverDashboards, demoOliverMetrics } from "./oliverDashboards";
import { buildArgusDashboards, demoArgusMetrics, type PlatformRollup } from "./argusDashboards";
import { buildIntelligenceMirror, ARION_MIRROR, SPARK_MIRROR, OLIVER_MIRROR, ARGUS_MIRROR } from "./intelligenceMirror";

// ── primitives ─────────────────────────────────────────────────────────────

/** Coverage-blind average of dashboard scores + priors (nulls excluded). */
export function rollupScore(ds: DashboardScore[]): { score: number | null; prior: number | null } {
  return {
    score: businessPulse(ds.map((d) => d.score)),
    prior: businessPulse(ds.map((d) => d.priorScore)),
  };
}

/** Brandon's LOCKED 50/50 Trend/Intelligence blend; Trend-only when intel is null. */
export function blend5050(trend: number | null, intel: number | null): number | null {
  if (trend == null) return intel;
  if (intel == null) return trend;
  return Math.round(trend * 0.5 + intel * 0.5);
}

/** One dashboard → one breakdown bar. Unmeasured dashboards render greyed, never zero-scored. */
export function breakdownBars(ds: DashboardScore[], route: string): ScoreBreakdownBar[] {
  return ds.map((d) => ({
    key: d.key,
    label: d.label,
    score: d.score ?? 0,
    previousScore: d.priorScore,
    band: d.score == null ? ("unknown" as const) : bandFromScore(d.score),
    locked: d.score == null,
    lockReason: d.score == null ? "Not connected yet" : undefined,
    reportRoute: route,
  }));
}

export function gaugeOf(score: number | null, prior: number | null, extra?: Partial<GaugeValue>): GaugeValue {
  return {
    score: score ?? 0,
    previousScore: prior,
    band: score == null ? "unknown" : bandFromScore(score),
    state: score == null ? "insufficient_data" : "ok",
    ...extra,
  };
}

// ── one platform's full health block ──────────────────────────────────────

export interface PlatformHealth {
  trendScore: number | null;
  trendPrior: number | null;
  intelScore: number | null;
  intelPrior: number | null;
  platformScore: number | null;
  platformPrior: number | null;
  trendBreakdown: ScoreBreakdownBar[];
  intelligenceBreakdown: ScoreBreakdownBar[];
}

export function platformHealth(
  trendDs: DashboardScore[],
  intelDs: DashboardScore[],
  trendRoute: string,
  intelRoute: string,
): PlatformHealth {
  const t = rollupScore(trendDs);
  const i = rollupScore(intelDs);
  return {
    trendScore: t.score, trendPrior: t.prior,
    intelScore: i.score, intelPrior: i.prior,
    platformScore: blend5050(t.score, i.score),
    platformPrior: blend5050(t.prior, i.prior),
    trendBreakdown: breakdownBars(trendDs, trendRoute),
    intelligenceBreakdown: breakdownBars(intelDs, intelRoute),
  };
}

// ── the client-side Business Pulse for review ─────────────────────────────

export interface DemoPulse {
  pulse: number | null;
  prior: number | null;
  components: { arion: number | null; spark: number | null; oliver: number | null };
  /** ARGUS platform score (cross-platform product) — feeds the 5th gauge. */
  argus: { score: number | null; prior: number | null };
}

/**
 * Business Pulse across the three product platforms, from the same seeded
 * demo builders every Trends/Intelligence page renders. Deterministic per
 * tenant, so every Health page shows the same Pulse for the same tenant.
 */
export function demoBusinessPulse(seed: string): DemoPulse {
  const platform = (trendDs: DashboardScore[], intelDs: DashboardScore[]) => {
    const t = rollupScore(trendDs);
    const i = rollupScore(intelDs);
    return { score: blend5050(t.score, i.score), prior: blend5050(t.prior, i.prior) };
  };

  const arionPayload = demoArionMetricsClient(seed);
  const sparkPayload = demoSparkMetrics(seed);
  const oliverPayload = demoOliverMetrics(seed);

  const arionDs = buildArionDashboards(arionPayload);
  const sparkDs = buildSparkDashboards(sparkPayload);
  const oliverDs = buildOliverDashboards(oliverPayload);

  const arion = platform(arionDs, buildIntelligenceMirror(arionPayload, ARION_MIRROR).dashboards);
  const spark = platform(sparkDs, buildIntelligenceMirror(sparkPayload, SPARK_MIRROR).dashboards);
  const oliver = platform(oliverDs, buildIntelligenceMirror(oliverPayload, OLIVER_MIRROR).dashboards);

  // ARGUS = the cross-platform product: its trend dashboards take the three
  // product roll-ups (same as ArgusTrendsPage), its intelligence is the mirror.
  const rollup = (label: string, key: string, ds: DashboardScore[]): PlatformRollup => {
    const moves = ds.map((d) => d.movementPct).filter((v): v is number => v != null);
    return {
      key, label, dashboards: ds,
      score: businessPulse(ds.map((d) => d.score)),
      movementPct: moves.length ? moves.reduce((s, v) => s + v, 0) / moves.length : null,
    };
  };
  const argusPayload = demoArgusMetrics(seed);
  const argus = platform(
    buildArgusDashboards(argusPayload, [rollup("ARION", "arion", arionDs), rollup("SPARK", "spark", sparkDs), rollup("OLIVER", "oliver", oliverDs)]),
    buildIntelligenceMirror(argusPayload, ARGUS_MIRROR).dashboards,
  );

  return {
    pulse: businessPulse([arion.score, spark.score, oliver.score]),
    prior: businessPulse([arion.prior, spark.prior, oliver.prior]),
    components: { arion: arion.score, spark: spark.score, oliver: oliver.score },
    argus,
  };
}

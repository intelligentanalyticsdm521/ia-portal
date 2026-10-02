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
//   Platform previous  = LIKE FOR LIKE: last month's Trend prior blended with
//                        the Intelligence score re-run on the series without
//                        their last month (likeForLikePrior). The rule LUMEN's
//                        monthly review uses (lumen-api src/services/
//                        insightsReview/review.js scoreProduct), so the email
//                        and the gauge always say the same change.
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
import { buildIntelligenceMirror, ARION_MIRROR, SPARK_MIRROR, OLIVER_MIRROR, ARGUS_MIRROR, type MirrorConfig } from "./intelligenceMirror";
import type { MetricsPayload } from "./arionDashboards";

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

/**
 * The payload as it stood a month earlier: every series without its last
 * month. The same "drop the final element" rule the engine uses for every
 * Trends prior, and exactly LUMEN's review.js withoutLastMonth (months left as
 * they are, as there).
 */
export function withoutLastMonth(payload: MetricsPayload): MetricsPayload {
  const metrics: Record<string, Array<number | null>> = {};
  for (const [k, s] of Object.entries((payload && payload.metrics) || {})) metrics[k] = Array.isArray(s) ? s.slice(0, -1) : s;
  return { ...payload, metrics };
}

/** The Intelligence mirror as it read last month — what the Platform previous blends in. */
export function priorIntelligence(payload: MetricsPayload | null | undefined, cfg: MirrorConfig): DashboardScore[] {
  if (!payload) return [];
  return buildIntelligenceMirror(withoutLastMonth(payload), cfg).dashboards;
}

/**
 * Last month's Platform Score, like for like.
 *
 * The Intelligence mirror carries no prior, so blending the two priors fell
 * back to the Trend prior ALONE and the gauge compared this month's BLENDED
 * score with last month's TREND score: a change of (Intelligence − Trend) / 2
 * every month even when nothing moved (SPARK read 63 vs 60 "+3" while like for
 * like was 63 vs 64). The previous is the Trend prior blended with the
 * Intelligence score re-run without the last month — LUMEN's likePrior.
 */
export function likeForLikePrior(trendPrior: number | null, intelPriorDs: DashboardScore[]): number | null {
  return blend5050(trendPrior, rollupScore(intelPriorDs).score);
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
  /** The mirror re-run without the last month (priorIntelligence). Required: without it the previous is the Trend prior alone. */
  intelPriorDs: DashboardScore[],
): PlatformHealth {
  const t = rollupScore(trendDs);
  const i = rollupScore(intelDs);
  return {
    trendScore: t.score, trendPrior: t.prior,
    intelScore: i.score, intelPrior: i.prior,
    platformScore: blend5050(t.score, i.score),
    platformPrior: likeForLikePrior(t.prior, intelPriorDs),
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
 *
 * Pass `arionPayload` (the tenant's GET /arion/insights/metrics payload, via
 * useArionInsightsPayload) so the ARION component matches the ARION pages
 * exactly — the client generator is only the fallback when the server payload
 * isn't available (Brandon caught home 69 vs ARION Health 68).
 */
export function demoBusinessPulse(seed: string, opts?: {
  arionPayload?: import("./arionDashboards").MetricsPayload | null;
  sparkPayload?: import("./arionDashboards").MetricsPayload | null;
  oliverPayload?: import("./arionDashboards").MetricsPayload | null;
}): DemoPulse {
  // Each platform's previous is like for like (likeForLikePrior), so the
  // Pulse's previous is the average of those — LUMEN's engine prior pulse.
  const platform = (trendDs: DashboardScore[], intelDs: DashboardScore[], intelPriorDs: DashboardScore[]) => {
    const t = rollupScore(trendDs);
    const i = rollupScore(intelDs);
    return { score: blend5050(t.score, i.score), prior: likeForLikePrior(t.prior, intelPriorDs) };
  };

  const arionPayload = opts?.arionPayload || demoArionMetricsClient(seed);
  const sparkPayload = opts?.sparkPayload || demoSparkMetrics(seed);
  const oliverPayload = opts?.oliverPayload || demoOliverMetrics(seed);

  const arionDs = buildArionDashboards(arionPayload);
  const sparkDs = buildSparkDashboards(sparkPayload);
  const oliverDs = buildOliverDashboards(oliverPayload);

  const arion = platform(arionDs, buildIntelligenceMirror(arionPayload, ARION_MIRROR).dashboards, priorIntelligence(arionPayload, ARION_MIRROR));
  const spark = platform(sparkDs, buildIntelligenceMirror(sparkPayload, SPARK_MIRROR).dashboards, priorIntelligence(sparkPayload, SPARK_MIRROR));
  const oliver = platform(oliverDs, buildIntelligenceMirror(oliverPayload, OLIVER_MIRROR).dashboards, priorIntelligence(oliverPayload, OLIVER_MIRROR));

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
    priorIntelligence(argusPayload, ARGUS_MIRROR),
  );

  return {
    pulse: businessPulse([arion.score, spark.score, oliver.score]),
    prior: businessPulse([arion.prior, spark.prior, oliver.prior]),
    components: { arion: arion.score, spark: spark.score, oliver: oliver.score },
    argus,
  };
}

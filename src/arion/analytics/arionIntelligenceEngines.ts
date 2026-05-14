// arionIntelligenceEngines — v9.5 ARION Intelligence report engines.
//
// 6 engines per spec §3. Each reads ARION EngineInput (GA4, GSC, GBP,
// Bing, SE Ranking, IA Plugin) and produces an IntelligenceReport.
// Cross-product reports (Acquisition Efficiency, Lead Source Quality,
// Reputation→Revenue) run in partial mode without SPARK/OLIVER joins
// and surface the data gap clearly.

import type { EngineInput } from "./trendEngines";

export interface IntelligenceReport {
  score: number;
  state: "ok" | "partial" | "insufficient_data" | "locked";
  headline: string;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  dataGap?: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();
const pct = (n: number | null | undefined, d = 0) => n == null || !isFinite(n) ? "0%" : `${(n * 100).toFixed(d)}%`;

// ══════════════════════════════════════════════════════════════════════
// 1 — Acquisition Efficiency
// ══════════════════════════════════════════════════════════════════════
// Funnel: visits → form views → form submits → contacts → jobs.
// Partial without SPARK (contacts) or OLIVER (jobs).

export function acquisitionEfficiencyEngine(input: EngineInput): IntelligenceReport {
  const sessions = Number(input.d?.summary?.totalSessions || 0);
  const forms = Number(input.d?.summary?.formSubmissions || 0);
  const sparkConnected = !!input.sparkConnected;
  const formToContactRate = Number(input.formToContactRate || 0);

  if (sessions === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No GA4 sessions",
      scoreInputs: [],
      observations: ["GA4 isn't returning session data. Acquisition Efficiency measures the funnel from visit → form → contact → job — every step needs data flowing."],
      actions: ["Connect GA4 in Settings → Connected Accounts."],
      dataGap: "Awaiting first GA4 sessions.",
    };
  }

  if (sessions < 100) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${sessions}/100 sessions`,
      scoreInputs: [{ key: "sessions", value: sessions, weight: 1.0 }],
      observations: [`${sessions} sessions over the period — funnel math is noisy at this volume. Acquisition Efficiency unlocks at 100+ sessions per period.`],
      actions: ["Continue acquisition. Report unlocks at 100+ sessions."],
      dataGap: `${100 - sessions} more sessions needed.`,
    };
  }

  const formSubmitRate = sessions > 0 ? forms / sessions : 0;
  // Stage 1: visit → form submission rate (industry: 1-3% for service businesses)
  const visitToFormScore = clamp(formSubmitRate * 5000);  // 2% → 100
  // Stage 2: form → contact (only available when SPARK connected)
  const formToContactScore = sparkConnected ? clamp(formToContactRate * 100) : 50;
  // Score: blend stages
  const score = Math.round(
    sparkConnected
      ? visitToFormScore * 0.5 + formToContactScore * 0.5
      : visitToFormScore * 1.0
  );

  const observations: string[] = [];
  observations.push(`Funnel: ${fmt(sessions)} site visits → ${fmt(forms)} form submissions (${pct(formSubmitRate, 2)} visit-to-form rate).`);
  if (formSubmitRate < 0.01) {
    observations.push(`Visit-to-form rate is below 1% — industry baseline is 2-3% for service businesses. Either visitors don't find the form (no CTA above fold) or the form is too long for the page intent.`);
  } else if (formSubmitRate < 0.025) {
    observations.push(`Visit-to-form rate is in the 1-2.5% average range. Tighter CTAs above the fold + shorter forms typically lift this 0.5-1 percentage point.`);
  } else {
    observations.push(`Visit-to-form rate of ${pct(formSubmitRate, 2)} is above the 2-3% industry baseline — your funnel is working at the top.`);
  }

  if (sparkConnected) {
    observations.push(`Form → contact creation rate: ${pct(formToContactRate)}. ${formToContactRate < 0.7 ? "Below 70% means form submissions aren't reaching SPARK — inbound webhook + form-mapping audit needed." : "Form-to-contact pipeline is healthy."}`);
  } else {
    observations.push(`SPARK not connected — funnel stops at form submission. Connecting SPARK extends the report through to "contacts created" + "jobs created" so you see end-to-end acquisition ROI.`);
  }

  const actions: string[] = [];
  if (formSubmitRate < 0.015) {
    actions.push(`Audit the top 3 highest-traffic pages. Each one should have a clear CTA above the fold with ≤3 form fields. Move secondary content below.`);
  }
  if (!sparkConnected) {
    actions.push(`Connect SPARK to unlock the contact + job side of acquisition efficiency.`);
  }

  return {
    score,
    state: sparkConnected ? "ok" : "partial",
    headline: sparkConnected ? `${pct(formSubmitRate, 2)} visit→form · ${pct(formToContactRate)} form→contact` : `${pct(formSubmitRate, 2)} visit→form (partial · SPARK needed)`,
    scoreInputs: [
      { key: "sessions", value: sessions, weight: 0.3 },
      { key: "visit_to_form_rate_pct", value: Number((formSubmitRate * 100).toFixed(2)), weight: sparkConnected ? 0.3 : 0.7 },
      ...(sparkConnected ? [{ key: "form_to_contact_rate_pct", value: Math.round(formToContactRate * 100), weight: 0.4 }] : []),
    ],
    observations,
    actions,
    dataGap: sparkConnected ? undefined : "Connect SPARK + OLIVER for the full visit→contact→job chain.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// 2 — Lead Source Quality
// ══════════════════════════════════════════════════════════════════════
// Requires SPARK (LTV) + OLIVER (revenue) for full output. Partial mode
// shows top GSC source breakdown only.

export function leadSourceQualityEngine(input: EngineInput): IntelligenceReport {
  const sparkConnected = !!input.sparkConnected;
  const queries = input.searchData?.breakdowns?.queries || [];
  const sessions = Number(input.d?.summary?.totalSessions || 0);

  if (!sparkConnected || sessions < 50) {
    return {
      score: 0, state: sessions < 50 ? "insufficient_data" : "partial",
      headline: sessions < 50 ? "Sessions needed" : "Partial · SPARK + OLIVER required",
      scoreInputs: [{ key: "sessions", value: sessions, weight: 0.5 }, { key: "spark_connected", value: sparkConnected ? "yes" : "no", weight: 0.5 }],
      observations: [
        sessions < 50
          ? `${sessions} sessions — Lead Source Quality needs traffic volume to compare source LTV reliably.`
          : `Lead Source Quality requires SPARK (for contact LTV) + OLIVER (for job revenue) to measure which channels produce the highest-value customers.`,
        `${queries.length} GSC queries tracked — when SPARK joins these to contacts and OLIVER joins those to revenue, you get a true source × LTV matrix.`,
      ],
      actions: [
        sparkConnected ? "Continue acquisition. Connect OLIVER to add revenue dimension." : "Connect SPARK to join your acquisition sources to contact records.",
      ],
      dataGap: !sparkConnected ? "Connect SPARK + OLIVER for source → LTV matrix." : `${50 - sessions} more sessions needed.`,
    };
  }

  // Partial: show top GSC sources by click volume
  const totalClicks = queries.reduce((s: number, q: any) => s + Number(q.clicks || 0), 0);
  const score = Math.round(clamp(60 + (queries.length >= 10 ? 10 : 0) + (totalClicks > 100 ? 20 : 0)));

  return {
    score,
    state: "partial",
    headline: `${queries.length} queries · ${fmt(totalClicks)} clicks (LTV needs OLIVER)`,
    scoreInputs: [
      { key: "query_diversity", value: queries.length, weight: 0.5 },
      { key: "total_clicks", value: totalClicks, weight: 0.5 },
    ],
    observations: [
      `${queries.length} ranking queries delivering ${fmt(totalClicks)} clicks from organic search.`,
      `Top performing query: "${queries[0]?.query || "—"}" at ${fmt(Number(queries[0]?.clicks || 0))} clicks.`,
      `Per-source LTV ranking requires OLIVER for the revenue dimension. Currently scoring source diversity + click volume only.`,
    ],
    actions: ["Connect OLIVER to unlock per-source LTV ranking. You'll see which acquisition channels produce the highest-revenue customers, not just the most clicks."],
    dataGap: "Connect OLIVER for per-source revenue ranking.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// 3 — Content ROI
// ══════════════════════════════════════════════════════════════════════
// Page-level traffic + form submission rates. Live with GA4 alone;
// upgrades when SPARK adds contact-creation rate per page.

export function contentRoiEngine(input: EngineInput): IntelligenceReport {
  const pages = input.d?.topPages || [];
  const totalSessions = Number(input.d?.summary?.totalSessions || 0);
  const totalForms = Number(input.d?.summary?.formSubmissions || 0);
  const sparkConnected = !!input.sparkConnected;

  if (pages.length === 0 || totalSessions < 100) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${totalSessions}/100 sessions · ${pages.length} pages`,
      scoreInputs: [{ key: "sessions", value: totalSessions, weight: 1.0 }],
      observations: ["Content ROI needs page-level traffic data and at least 100 sessions to score content effectively."],
      actions: ["Connect GA4 if not already. Continue acquisition — report unlocks at 100+ sessions."],
      dataGap: `${Math.max(0, 100 - totalSessions)} more sessions needed.`,
    };
  }

  // Top page concentration
  const topPageViews = Number(pages[0]?.views || pages[0]?.pageviews || 0);
  const topPageShare = totalSessions > 0 ? topPageViews / totalSessions : 0;
  // 80/20 check
  const top3Sum = pages.slice(0, 3).reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
  const totalViews = pages.reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
  const top3Share = totalViews > 0 ? top3Sum / totalViews : 0;

  const formsPerSession = totalSessions > 0 ? totalForms / totalSessions : 0;
  const score = Math.round(clamp(
    60 +
    (formsPerSession > 0.02 ? 20 : 0) +
    (top3Share < 0.85 ? 10 : 0) +
    (pages.length >= 5 ? 10 : 0)
  ));

  const observations: string[] = [];
  observations.push(`${pages.length} pages tracked · ${fmt(totalViews)} pageviews · ${fmt(totalForms)} form submissions (${pct(formsPerSession, 2)} session-to-form).`);
  observations.push(`Top page is ${pages[0]?.path || "(unknown)"} with ${fmt(topPageViews)} views (${pct(topPageShare)} of all sessions). ${topPageShare > 0.5 ? "Highly concentrated — most content isn't earning traffic." : "Reasonably distributed."}`);
  observations.push(`Top 3 pages = ${pct(top3Share)} of pageviews. ${top3Share > 0.85 ? "Classic 80/20 — long tail of pages is consuming content overhead without producing traffic. Consider consolidation or sunset." : "Traffic spreads across the content library — every section is doing some work."}`);
  if (sparkConnected) {
    observations.push(`SPARK connected — page-level contact-creation rates upgrade this report to full ROI scoring per page in the next data refresh.`);
  } else {
    observations.push(`Connect SPARK to add the downstream conversion-rate-per-page dimension. With it, you can tell which pages drive form submissions vs which just attract traffic.`);
  }

  const actions: string[] = [];
  if (formsPerSession < 0.02) {
    actions.push(`Identify top pages without a CTA. Add inline form or "Get a quote →" link above the fold on the 3 highest-traffic content pages.`);
  }
  if (top3Share > 0.85) {
    actions.push(`Audit the long-tail of pages. If a page hasn't been viewed in 90+ days, either refresh it (target a new query) or consolidate.`);
  }

  return {
    score,
    state: sparkConnected ? "ok" : "partial",
    headline: `${pages.length} pages · ${pct(formsPerSession, 2)} conv rate`,
    scoreInputs: [
      { key: "tracked_pages", value: pages.length, weight: 0.3 },
      { key: "session_to_form_rate_pct", value: Number((formsPerSession * 100).toFixed(2)), weight: 0.4 },
      { key: "top_page_concentration_pct", value: Math.round(topPageShare * 100), weight: 0.3 },
    ],
    observations,
    actions,
    dataGap: sparkConnected ? undefined : "Connect SPARK for per-page downstream contact-creation rate.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// 4 — Reputation → Revenue
// ══════════════════════════════════════════════════════════════════════
// Requires OLIVER for revenue side. Partial mode: GBP reputation
// signals without revenue correlation.

export function reputationToRevenueEngine(input: EngineInput): IntelligenceReport {
  const gbp = input.gbpData;
  const reviews = input.gbpReviews?.reviews || [];
  const gbpConnected = gbp?.connected === true;

  if (!gbpConnected) {
    return {
      score: 0, state: "insufficient_data",
      headline: "GBP not connected",
      scoreInputs: [],
      observations: ["Reputation → Revenue needs Google Business Profile for review signals and OLIVER for revenue correlation."],
      actions: ["Connect Google Business Profile in Settings → Connected Accounts."],
      dataGap: "Connect GBP and OLIVER.",
    };
  }

  if (reviews.length < 5) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${reviews.length}/5 reviews needed`,
      scoreInputs: [{ key: "review_count", value: reviews.length, weight: 1.0 }],
      observations: [`${reviews.length} reviews on GBP. Reputation analysis needs 5+ reviews to surface meaningful signals.`],
      actions: ["Request reviews from your 5 most-recent satisfied customers."],
      dataGap: `${Math.max(0, 5 - reviews.length)} more reviews needed.`,
    };
  }

  const avgRating = Number(input.gbpReviews?.averageRating || 0);
  const totalReviews = Number(input.gbpReviews?.totalReviewCount || reviews.length);
  const responseRate = reviews.length > 0 ? reviews.filter((r: any) => r.replyComment).length / reviews.length : 0;
  const recent30 = reviews.filter((r: any) => {
    if (!r.createTime) return false;
    const days = (Date.now() - new Date(r.createTime).getTime()) / 86400000;
    return days <= 30;
  }).length;

  // Reputation Health Index (0-100)
  const repHealth = clamp(
    (avgRating / 5) * 40 +
    Math.min(totalReviews / 50, 1) * 20 +
    responseRate * 30 +
    Math.min(recent30 / 4, 1) * 10
  );

  // Without OLIVER: report on reputation health only (cap at 60 in partial)
  const score = Math.round(repHealth * 0.6);  // Score caps at 60 in partial mode (OLIVER unlocks 60→100 range)

  const observations: string[] = [];
  observations.push(`Reputation profile: ${avgRating.toFixed(1)}★ across ${fmt(totalReviews)} reviews · ${pct(responseRate)} response rate · ${recent30} new this month.`);
  if (avgRating >= 4.5 && responseRate >= 0.7) {
    observations.push(`Strong reputation signals. When OLIVER connects, this report measures the correlation between review velocity/rating and actual job booking rate — quantifying reputation's revenue impact.`);
  } else if (avgRating < 4.0) {
    observations.push(`${avgRating.toFixed(1)}★ is dragging local-pack visibility AND prospective customer trust. Each new review pulls the average toward the threshold — proactive review-asking is the highest-leverage move.`);
  } else if (responseRate < 0.5) {
    observations.push(`Response rate of ${pct(responseRate)} is below the 80% threshold that meaningfully impacts local ranking. Replying to reviews is free + high-leverage.`);
  }
  observations.push(`Revenue correlation requires OLIVER for the job-booking-rate-over-time side. Currently scoring reputation health only (score capped at 60).`);

  const actions: string[] = [];
  if (responseRate < 0.8) {
    actions.push(`Catch up on unanswered reviews this week. Reply quickly + personally; reviews-with-owner-response gain visibility.`);
  }
  if (recent30 < 2) {
    actions.push(`Set a weekly cadence for review requests on completed jobs. Even 2-3/month maintains the recency signal that Google rewards in local rankings.`);
  }
  actions.push(`Connect OLIVER to surface the reputation × revenue correlation.`);

  return {
    score,
    state: "partial",
    headline: `${avgRating.toFixed(1)}★ · ${pct(responseRate)} response (revenue needs OLIVER)`,
    scoreInputs: [
      { key: "avg_rating", value: avgRating.toFixed(1), weight: 0.4 },
      { key: "response_rate_pct", value: Math.round(responseRate * 100), weight: 0.3 },
      { key: "reviews_last_30d", value: recent30, weight: 0.3 },
    ],
    observations,
    actions,
    dataGap: "Connect OLIVER for reputation → revenue correlation analysis.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// 5 — Visibility Trajectory
// ══════════════════════════════════════════════════════════════════════
// Needs 90 days GSC history. v1 uses simple linear regression on
// impression + position; Holt-Winters comes later.

export function visibilityTrajectoryEngine(input: EngineInput): IntelligenceReport {
  const dates = input.searchData?.breakdowns?.dates || [];
  const summary = input.searchData?.summary || {};

  if (dates.length === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "GSC date breakdown needed",
      scoreInputs: [],
      observations: ["Visibility Trajectory requires GSC's date-dimension breakdown. The data should arrive within 7-14 days of GSC connection."],
      actions: ["Verify GSC is connected at the domain level (not just www) and that the sitemap is submitted."],
      dataGap: "GSC date-dimension data not yet flowing.",
    };
  }

  if (dates.length < 60) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${dates.length}/90 days history`,
      scoreInputs: [{ key: "days_of_history", value: dates.length, weight: 1.0 }],
      observations: [`${dates.length} days of GSC history. Trajectory modelling needs 90+ days to project reliably (Holt-Winters requires seasonal decomposition).`],
      actions: ["Continue normal operations. Report unlocks at 90+ days of GSC data."],
      dataGap: `${90 - dates.length} more days of GSC history needed.`,
    };
  }

  // Linear projection on impressions over last 90 days
  const recent = dates.slice(-90);
  const halfLen = Math.floor(recent.length / 2);
  const firstHalfImp = recent.slice(0, halfLen).reduce((s: number, d: any) => s + Number(d.impressions || 0), 0) / halfLen;
  const secondHalfImp = recent.slice(halfLen).reduce((s: number, d: any) => s + Number(d.impressions || 0), 0) / (recent.length - halfLen);
  const growthRate = firstHalfImp > 0 ? (secondHalfImp - firstHalfImp) / firstHalfImp : 0;

  // Project 90 days forward
  const currentImpressions = Number(summary.impressions || 0);
  const projectedImpressions = Math.round(currentImpressions * (1 + growthRate));
  const avgPosition = Number(summary.avgPosition || 0);
  const projectedPosition = Math.max(1, avgPosition - (growthRate > 0 ? 2 : 0));  // Rough — better positions correlated with growth

  const score = Math.round(clamp(
    60 +
    (growthRate > 0.1 ? 25 : growthRate < -0.1 ? -25 : 0) +
    (avgPosition < 15 ? 15 : 0)
  ));

  const direction = growthRate > 0.05 ? "improving" : growthRate < -0.05 ? "declining" : "stable";

  const observations: string[] = [];
  observations.push(`90-day search trajectory: ${direction} (${growthRate > 0 ? "+" : ""}${(growthRate * 100).toFixed(1)}% change in impressions). Current position ${avgPosition.toFixed(1)}.`);
  observations.push(`Forecast for next 90 days: ~${fmt(projectedImpressions)} monthly impressions · projected avg position ${projectedPosition.toFixed(1)}.`);
  if (direction === "improving") {
    observations.push(`Trajectory is positive — content + technical investments are compounding. Maintain refresh cadence.`);
  } else if (direction === "declining") {
    observations.push(`Trajectory is negative. Likely causes: (1) competitor content fresher than yours, (2) Google algorithm shift, (3) technical regression (check Core Web Vitals + indexing).`);
  } else {
    observations.push(`Trajectory is flat. To bend the curve upward: publish 2-3 new pieces per month targeting your weakest top-10 queries.`);
  }
  observations.push(`v1 uses linear regression. v2 (Holt-Winters with seasonal decomposition) unlocks at 12 months of weekly history.`);

  const actions: string[] = [];
  if (direction === "declining") {
    actions.push(`Audit your top 5 ranking pages this week. Update statistics, add new sections, refresh publish date. Content decay is the #1 cause of trajectory decline.`);
  }
  if (avgPosition > 15) {
    actions.push(`Identify your top 10 queries ranking 11-20. A focused content + internal-link refresh on the highest-volume ones is the fastest way to lift average position.`);
  }

  return {
    score,
    state: "ok",
    headline: `${direction} · ~${fmt(projectedImpressions)} (90d)`,
    scoreInputs: [
      { key: "trajectory_pct", value: Math.round(growthRate * 100), weight: 0.5 },
      { key: "projected_90d_impressions", value: projectedImpressions, weight: 0.3 },
      { key: "current_avg_position", value: avgPosition.toFixed(1), weight: 0.2 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 6 — Competitive Presence Gap
// ══════════════════════════════════════════════════════════════════════
// ARION trend scores vs internal benchmark dataset.

export function competitivePresenceGapEngine(input: EngineInput): IntelligenceReport {
  const benchmarks = input.benchmarks || {};
  const hasBenchmarks = Object.keys(benchmarks).length >= 3;
  const sessions = Number(input.d?.summary?.totalSessions || 0);

  if (sessions < 50) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${sessions}/50 sessions`,
      scoreInputs: [],
      observations: ["Competitive Presence Gap needs your ARION trend scores measured before it can compare them to category benchmarks. Score history accumulates as you collect data."],
      actions: ["Continue normal operations. Report unlocks at 50+ sessions + at least 30 days of history."],
      dataGap: "Build score history first.",
    };
  }

  if (!hasBenchmarks) {
    return {
      score: 0, state: "partial",
      headline: "Benchmarks not seeded",
      scoreInputs: [{ key: "sessions", value: sessions, weight: 1.0 }],
      observations: ["Industry benchmark data isn't seeded yet for your business category. The comparison side of this report will populate as the platform aggregates anonymised peer data across tenants."],
      actions: ["Configure your business category in Service Category settings to ensure correct benchmark mapping when data is available."],
      dataGap: "Awaiting benchmark dataset seed.",
    };
  }

  // Score ARION trend categories vs benchmarks
  const trendScores: Record<string, number> = {
    visibility: 50,  // Placeholder — would read from actual trend score
    audience: 50,
    conversion: 50,
    search: 50,
    content: 50,
    local: 50,
    technical: 50,
  };

  let totalGap = 0;
  let dimensionsCompared = 0;
  const gapBreakdown: Array<{ dim: string; score: number; bench: number; gap: number }> = [];
  for (const [dim, score] of Object.entries(trendScores)) {
    const benchKey = `${dim}_benchmark`;
    const bench = benchmarks[benchKey] ?? benchmarks[dim];
    if (bench != null && isFinite(bench)) {
      const gap = score - bench;
      gapBreakdown.push({ dim, score, bench, gap });
      totalGap += gap;
      dimensionsCompared++;
    }
  }
  const avgGap = dimensionsCompared > 0 ? totalGap / dimensionsCompared : 0;
  const score = Math.round(clamp(60 + avgGap * 2));

  const observations: string[] = [];
  observations.push(`Compared across ${dimensionsCompared} measured dimensions. Avg vs benchmark: ${avgGap > 0 ? "+" : ""}${avgGap.toFixed(1)} points.`);
  const sortedByGap = gapBreakdown.sort((a, b) => a.gap - b.gap);
  if (sortedByGap.length > 0) {
    const weakest = sortedByGap[0];
    const strongest = sortedByGap[sortedByGap.length - 1];
    observations.push(`Biggest gap: ${weakest.dim} (you ${weakest.score} vs benchmark ${weakest.bench}, ${weakest.gap > 0 ? "+" : ""}${weakest.gap.toFixed(0)}). Biggest strength: ${strongest.dim} (${strongest.score} vs ${strongest.bench}, ${strongest.gap > 0 ? "+" : ""}${strongest.gap.toFixed(0)}).`);
  }
  observations.push(`Benchmark dataset is anonymised peer data aggregated across the platform. Comparisons are directional and improve as the dataset grows.`);

  const actions: string[] = [];
  if (sortedByGap.length > 0 && sortedByGap[0].gap < -10) {
    actions.push(`Focus the next quarter on closing the ${sortedByGap[0].dim} gap. A 10-point gap typically means a systematic process issue (not random variance) — root-cause review will surface the lever.`);
  }

  return {
    score,
    state: "partial",
    headline: `${dimensionsCompared} dims · ${avgGap > 0 ? "+" : ""}${avgGap.toFixed(0)} vs benchmark`,
    scoreInputs: [
      { key: "avg_gap_vs_benchmark", value: Number(avgGap.toFixed(1)), weight: 0.5 },
      { key: "dimensions_compared", value: dimensionsCompared, weight: 0.3 },
      { key: "benchmark_keys", value: Object.keys(benchmarks).length, weight: 0.2 },
    ],
    observations,
    actions,
    dataGap: "v1 uses scaffolded trend scores; full version reads live score history.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// Engine registry
// ══════════════════════════════════════════════════════════════════════

export const ARION_INTEL_ENGINES = {
  acquisition: acquisitionEfficiencyEngine,
  lead_source: leadSourceQualityEngine,
  content_roi: contentRoiEngine,
  rep_revenue: reputationToRevenueEngine,
  visibility_traj: visibilityTrajectoryEngine,
  competitive: competitivePresenceGapEngine,
} as const;

export type ArionIntelKey = keyof typeof ARION_INTEL_ENGINES;

export function runAllArionIntelligence(input: EngineInput): Record<ArionIntelKey, IntelligenceReport> {
  return {
    acquisition: acquisitionEfficiencyEngine(input),
    lead_source: leadSourceQualityEngine(input),
    content_roi: contentRoiEngine(input),
    rep_revenue: reputationToRevenueEngine(input),
    visibility_traj: visibilityTrajectoryEngine(input),
    competitive: competitivePresenceGapEngine(input),
  };
}

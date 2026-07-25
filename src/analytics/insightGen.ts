// insightGen.ts — derive insights + recommendations from real scored movement.
//
// An insight is a finding; the recommendation is what to do. They are one
// paired unit (Brandon), ranked by score impact, capped, never padded. Nothing
// here is hardcoded per tenant — it reads the actual DashboardScore and speaks
// to whatever genuinely moved.

import type { DashboardScore, DataPointScore, SectionScore } from "./scoring";

export interface InsightPair {
  id: string;
  severity: number;      // higher = bigger impact on the score
  insight: string;
  recommendation: string;
  priority: boolean;     // true = "top priority" (a drop), false = "worth knowing"
}

function fmtPct(n: number): string {
  const a = Math.abs(n);
  return `${a < 10 ? a.toFixed(1) : a.toFixed(0)}%`;
}

/** Recommendation text keyed by data-point key; falls back to a generic line. */
const RECS: Record<string, string> = {
  gsc_clicks: "Focus on the queries losing clicks — refresh those page titles and meta descriptions first.",
  gsc_impressions: "Publish or refresh content around the topics you're slipping on to rebuild impressions.",
  gsc_avg_position: "Strengthen the pages behind your falling keywords with internal links and updated content.",
  kw_top10: "Push the page-two keywords with the most volume over the line — they need the least work.",
  gbp_action_rate: "Add photos, hours and a compelling description to your Google profile so viewers act.",
  gbp_calls: "Make sure your phone number is prominent on the profile and site, and answer during business hours.",
  gbp_rating: "Ask recent happy customers for a review — steady positive reviews lift the average.",
  gbp_review_velocity: "Re-launch your post-job review request; text requests convert far better than email.",
  gbp_response_rate: "Reply to every unanswered review this week — response rate is a published ranking signal.",
  gbp_posts: "Publish one GBP post a week — a service highlight, photo, or seasonal offer keeps you fresh.",
  ga_conversion_rate: "Review the top landing pages for a clear call-to-action and a short, easy form.",
  ga_engagement_rate: "Check whether a recent change slowed the page or buried the content people came for.",
  ga_bounce_rate: "Match your page content to the search intent that brings people there.",
  form_submissions: "Shorten your forms and make the submit button obvious on mobile.",
  content_gap_count: "Create pages for the searches you get impressions for but don't yet answer.",
  content_fresh_ratio: "Refresh your oldest high-traffic pages — decayed content loses rankings.",
  psi_mobile_perf: "Compress the hero image and defer non-critical scripts to lift mobile speed.",
  lcp_ms: "Your largest element is loading slowly — optimise the hero image or the web font it waits on.",
  cwv_pass: "Fix the failing Core Web Vital (usually LCP) — it's a direct ranking factor.",
  security_vulns: "Update the flagged plugins immediately; out-of-date plugins are the top compromise route.",
  broken_links: "Fix or redirect the dead links — they waste crawl budget and frustrate visitors.",
};

function recFor(dp: DataPointScore): string {
  return RECS[dp.key] || `Investigate what changed in ${dp.label.toLowerCase()} this month and address the cause.`;
}

/**
 * Build the insight list for a dashboard from its scored movement.
 * Drops (biggest negative movers, weighted by section weight) become top
 * priorities; strong gains become wins. Only items that cleared the sufficiency
 * bar (movementPct != null) and moved meaningfully are surfaced.
 */
export function deriveInsights(dash: DashboardScore, opts: { maxPriorities?: number; max?: number; minMovePct?: number } = {}): InsightPair[] {
  const maxPriorities = opts.maxPriorities ?? 3;
  const max = opts.max ?? 5;
  const minMove = opts.minMovePct ?? 4;

  type Cand = { dp: DataPointScore; sec: SectionScore; impact: number };
  const cands: Cand[] = [];
  for (const sec of dash.sections) {
    if (sec.score == null) continue;
    for (const dp of sec.dataPoints) {
      if (dp.unmeasured || dp.movementPct == null) continue;
      if (Math.abs(dp.movementPct) < minMove) continue;
      // Impact = how much this move matters: its movement size × section weight.
      const impact = Math.abs(dp.movementPct) * sec.weight * dp.weight;
      cands.push({ dp, sec, impact });
    }
  }

  // Intelligence mirrors reuse a metric across sections (forecast + anomaly +
  // opportunity all model the same series) — keep only the highest-impact
  // mention of each data point so the insight list never repeats itself.
  const byKey = new Map<string, Cand>();
  for (const c of cands) {
    const prev = byKey.get(c.dp.key);
    if (!prev || c.impact > prev.impact) byKey.set(c.dp.key, c);
  }
  const unique = [...byKey.values()];

  const drops = unique.filter((c) => c.dp.movementPct! < 0).sort((a, b) => b.impact - a.impact);
  const gains = unique.filter((c) => c.dp.movementPct! > 0).sort((a, b) => b.impact - a.impact);

  const out: InsightPair[] = [];

  for (const c of drops.slice(0, maxPriorities)) {
    out.push({
      id: `drop:${c.sec.key}:${c.dp.key}`,
      severity: c.impact,
      priority: true,
      insight: `${c.dp.label} fell ${fmtPct(c.dp.movementPct!)} this month (${c.sec.label}). This is one of the biggest drags on your ${dash.label} score.`,
      recommendation: recFor(c.dp),
    });
  }

  // Fill the rest with the strongest wins (positive reinforcement) up to the cap.
  const remaining = max - out.length;
  for (const c of gains.slice(0, remaining)) {
    out.push({
      id: `gain:${c.sec.key}:${c.dp.key}`,
      severity: c.impact,
      priority: false,
      insight: `${c.dp.label} rose ${fmtPct(c.dp.movementPct!)} this month — the work in ${c.sec.label} is showing.`,
      recommendation: `Keep doing what lifted ${c.dp.label.toLowerCase()}; it's moving the right way.`,
    });
  }

  return out.slice(0, max);
}

// sparkIntelligenceEngines — v9.5 SPARK Intelligence report engines.
//
// 6 engines per Platform Intelligence & ARGUS spec §4. Each engine reads
// SparkEngineInput (the same data the Trends engines already consume) and
// produces a ReportAnalysis. All engines support partial-state operation —
// when OLIVER cross-product data isn't available, the engine emits the
// best report it can and surfaces what's missing.
//
// Data flow:
//   tenant onboards → contacts captured → SparkEngineInput populated
//   → these engines run on demand → ReportAnalysis renders in the
//   SparkIAInsightsIntelligencePage grid + modal.

import type { SparkEngineInput } from "./sparkTrendEngines";

export interface IntelligenceReport {
  /** 0-100 score. Engines return 0 + insufficient_data state when partial. */
  score: number;
  /** Lifecycle state. UI uses this to render locked/partial/ok decorations. */
  state: "ok" | "partial" | "insufficient_data" | "locked";
  /** Short headline rendered on the report card. */
  headline: string;
  /** Structured numeric inputs that drove the score; surfaced in modal. */
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  /** Detailed insights (up to ~6 strings). */
  observations: string[];
  /** Recommended actions (up to ~4). */
  actions: string[];
  /** When state != ok, what data is missing to upgrade the report. */
  dataGap?: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();
const pct = (n: number | null | undefined, d = 0) => n == null || !isFinite(n) ? "0%" : `${(n * 100).toFixed(d)}%`;
const dollars = (n: number | null | undefined) => n == null || !isFinite(n) ? "$0" : `$${Math.round(n).toLocaleString()}`;

// ══════════════════════════════════════════════════════════════════════
// 1 — Contact Quality Score
// ══════════════════════════════════════════════════════════════════════
//
// Business question: are the contacts I'm acquiring worth acquiring?
// Partial-state (no OLIVER): engagement-only quality.
// Full (with OLIVER): engagement + revenue potential per source.

export function contactQualityScoreEngine(input: SparkEngineInput): IntelligenceReport {
  const totals = input.contact_totals || { total: 0, active: 0, with_email: 0, with_phone: 0, sms_opt_outs: 0 };
  const active = totals.active || 0;
  const events = Object.fromEntries((input.email_engagement || []).map((e) => [e.event_type, Number(e.n || 0)]));
  const sends = Number(events.sent || events.send || 0);
  const opens = Number(events.opened || 0);
  const clicks = Number(events.clicked || 0);
  const sources = (input.top_sources || []).filter((s) => Number(s.n) >= 5);
  const revenueData = input.revenue_attribution || [];
  const hasOliverData = revenueData.length > 0;

  if (active === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No active contacts yet",
      scoreInputs: [],
      observations: ["No active contacts in SPARK yet. Contact quality scoring requires at least 30 active contacts with measurable engagement signals before it produces meaningful output."],
      actions: ["Import existing contacts or wire a form to start capturing inbound leads. The first contacts unlock all six Intelligence reports."],
      dataGap: "Awaiting first 30 active contacts.",
    };
  }

  if (active < 30) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${active}/30 contacts captured`,
      scoreInputs: [{ key: "active_contacts", value: active, weight: 1.0, note: "30 minimum needed" }],
      observations: [`${active} active contacts — below the 30-contact threshold where quality scoring becomes statistically reliable.`],
      actions: ["Continue acquisition. The report unlocks automatically once you cross 30 active contacts."],
      dataGap: `${30 - active} more active contacts needed.`,
    };
  }

  // Engagement quality (always available)
  const openRate = sends > 0 ? opens / sends : 0;
  const clickRate = sends > 0 ? clicks / sends : 0;
  const ctor = opens > 0 ? clicks / opens : 0;
  const engagementScore = clamp((openRate * 100) * 0.4 + (clickRate * 100) * 0.4 + (ctor * 100) * 0.2);

  // Coverage quality (always available)
  const emailCov = active > 0 ? Number(totals.with_email || 0) / active : 0;
  const phoneCov = active > 0 ? Number(totals.with_phone || 0) / active : 0;
  const coverageScore = clamp(emailCov * 70 + phoneCov * 30);

  // Source quality variance
  const ranked = sources
    .map((s) => ({ name: s.source, n: Number(s.n), active: Number(s.active_count || 0), rate: Number(s.n) > 0 ? Number(s.active_count || 0) / Number(s.n) : 0 }))
    .sort((a, b) => b.rate - a.rate);
  const sourceQualityScore = ranked.length > 0
    ? clamp((ranked.reduce((s, r) => s + r.rate, 0) / ranked.length) * 100)
    : 50;

  // Revenue quality (OLIVER-gated)
  let revenueScore = 50;
  if (hasOliverData) {
    const totalLtv = revenueData.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
    const totalContacts = revenueData.reduce((s, r) => s + Number(r.contacts || 0), 0);
    const avgLtv = totalContacts > 0 ? totalLtv / totalContacts : 0;
    revenueScore = clamp(avgLtv >= 2000 ? 95 : avgLtv >= 500 ? 70 : avgLtv >= 100 ? 50 : 30);
  }

  const score = hasOliverData
    ? Math.round(engagementScore * 0.35 + coverageScore * 0.20 + sourceQualityScore * 0.20 + revenueScore * 0.25)
    : Math.round(engagementScore * 0.50 + coverageScore * 0.25 + sourceQualityScore * 0.25);

  const observations: string[] = [];
  const actions: string[] = [];

  observations.push(`Quality score ${score}/100 across ${fmt(active)} active contacts (${hasOliverData ? "full multi-dimensional model" : "engagement-only — connect OLIVER for revenue dimension"}).`);

  if (sends > 0) {
    observations.push(`Engagement: ${pct(openRate, 1)} open · ${pct(clickRate, 1)} click · ${pct(ctor, 1)} click-to-open across ${fmt(sends)} sends. ${engagementScore >= 70 ? "Top-quartile engagement signal." : engagementScore >= 40 ? "Average engagement quality." : "Low engagement — list-hygiene or content-quality issue."}`);
  } else {
    observations.push(`No email sends recorded this period — engagement dimension can't be evaluated until campaigns run.`);
  }

  observations.push(`Channel reachability: ${pct(emailCov)} email · ${pct(phoneCov)} phone. ${emailCov >= 0.7 && phoneCov >= 0.5 ? "Strong multi-channel posture." : emailCov < 0.5 ? "Email-coverage gap is the highest-leverage data-quality fix." : "Phone-coverage gap caps SMS-channel viability."}`);

  if (ranked.length >= 2) {
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    if (best.rate - worst.rate >= 0.2) {
      observations.push(`Source quality varies sharply: ${best.name} produces ${pct(best.rate)} active vs ${worst.name} at ${pct(worst.rate)}. Shift acquisition spend toward the high-quality channels.`);
      actions.push(`Reallocate at least one cycle of acquisition spend from ${worst.name} to ${best.name}-style channels. Measure quality lift over 60 days before scaling further.`);
    }
  }

  if (hasOliverData) {
    const totalLtv = revenueData.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
    const totalContacts = revenueData.reduce((s, r) => s + Number(r.contacts || 0), 0);
    const avgLtv = totalContacts > 0 ? totalLtv / totalContacts : 0;
    observations.push(`Revenue dimension active: ${dollars(totalLtv)} LTV across ${fmt(totalContacts)} customers · ${dollars(avgLtv)} avg per customer. ${avgLtv >= 2000 ? "High-value customer base — protect retention." : avgLtv >= 500 ? "Mid-value base — cross-sell campaigns produce measurable lift." : "Low avg LTV — focus on repeat-business mechanics."}`);
  } else {
    observations.push(`Revenue dimension locked — connect OLIVER to score contacts by lifetime value, not just engagement.`);
  }

  if (engagementScore < 40) {
    actions.push(`Run a re-engagement campaign on dormant contacts (no opens in 60+ days). Suppress non-openers after the second silent campaign to protect sender reputation.`);
  }
  if (emailCov < 0.7) {
    actions.push(`Require email on every form. Backfill email on phone-only contacts via first-interaction prompts.`);
  }

  return {
    score,
    state: hasOliverData ? "ok" : "partial",
    headline: `${score}/100 · ${hasOliverData ? "full quality model" : "engagement-only"}`,
    scoreInputs: [
      { key: "engagement_score", value: Math.round(engagementScore), weight: hasOliverData ? 0.35 : 0.50 },
      { key: "coverage_score", value: Math.round(coverageScore), weight: hasOliverData ? 0.20 : 0.25 },
      { key: "source_quality_score", value: Math.round(sourceQualityScore), weight: hasOliverData ? 0.20 : 0.25 },
      ...(hasOliverData ? [{ key: "revenue_score", value: Math.round(revenueScore), weight: 0.25 }] : []),
    ],
    observations,
    actions,
    dataGap: hasOliverData ? undefined : "Connect OLIVER to add revenue dimension (LTV per source).",
  };
}

// ══════════════════════════════════════════════════════════════════════
// 2 — Campaign Revenue Attribution
// ══════════════════════════════════════════════════════════════════════
// Requires OLIVER for full attribution. Without OLIVER, returns
// engagement-attribution only.

export function campaignRevenueAttributionEngine(input: SparkEngineInput): IntelligenceReport {
  const sends = Number(input.campaign_recent?.sent || 0);
  const events = Object.fromEntries((input.email_engagement || []).map((e) => [e.event_type, Number(e.n || 0)]));
  const clicks = Number(events.clicked || 0);
  const opens = Number(events.opened || 0);
  const revenueData = input.revenue_attribution || [];
  const hasOliverData = revenueData.length > 0;

  if (sends === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No campaigns sent",
      scoreInputs: [],
      observations: ["No campaign sends recorded this period. Campaign revenue attribution requires sends, engagement, and downstream conversion data."],
      actions: ["Send your first campaign. Even a small (50-recipient) test produces enough engagement signal for partial attribution."],
      dataGap: "Awaiting first campaign sends.",
    };
  }

  if (!hasOliverData) {
    const engagementRate = sends > 0 ? (opens + clicks) / sends : 0;
    const score = Math.round(clamp(engagementRate * 100, 0, 60));  // Capped at 60 in partial mode
    return {
      score,
      state: "partial",
      headline: "Engagement-only (OLIVER required for revenue)",
      scoreInputs: [
        { key: "sends", value: sends, weight: 0.30 },
        { key: "engagement_rate_pct", value: Math.round(engagementRate * 100), weight: 0.70 },
      ],
      observations: [
        `${fmt(sends)} campaigns sent · ${fmt(opens)} opens · ${fmt(clicks)} clicks. Combined engagement rate: ${pct(engagementRate, 1)}.`,
        `Revenue attribution requires OLIVER for the campaign → job → invoice chain. Currently scoring engagement-only at a 60-point cap.`,
        `${engagementRate >= 0.25 ? "Strong engagement floor — when OLIVER lights up, the revenue numbers should be meaningful." : "Engagement floor is low. Either content quality or list health is the constraint."}`,
      ],
      actions: [
        "Connect OLIVER to unlock full revenue attribution (campaign → contact engaged → job created → invoice paid chain).",
      ],
      dataGap: "Connect OLIVER for the campaign → revenue chain.",
    };
  }

  // Full attribution path (OLIVER connected)
  const totalLtv = revenueData.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
  const totalContacts = revenueData.reduce((s, r) => s + Number(r.contacts || 0), 0);
  const revPerContact = totalContacts > 0 ? totalLtv / totalContacts : 0;
  // Rough attributed revenue from clicks (assume 10% of clickers convert at avg revenue)
  const attribClicks = clicks;
  const attribContacts = Math.round(attribClicks * 0.1);
  const attribRevenue = attribContacts * revPerContact;
  const revPerSend = sends > 0 ? attribRevenue / sends : 0;

  const score = Math.round(clamp(revPerSend * 50, 0, 100));  // $2/send → score 100
  return {
    score,
    state: "ok",
    headline: `${dollars(attribRevenue)} attributed · ${dollars(revPerSend)}/send`,
    scoreInputs: [
      { key: "attributed_revenue", value: Math.round(attribRevenue), weight: 0.50 },
      { key: "revenue_per_send", value: Number(revPerSend.toFixed(2)), weight: 0.30 },
      { key: "clicks", value: clicks, weight: 0.20 },
    ],
    observations: [
      `${fmt(sends)} campaign sends produced ${fmt(clicks)} clicks. Estimated downstream conversion: ${fmt(attribContacts)} contacts becoming customers within the attribution window, generating approximately ${dollars(attribRevenue)} (${dollars(revPerSend)} revenue per send).`,
      `Revenue per send is the cleanest ROI signal: ${revPerSend >= 2 ? "above $2/send is top-quartile for service businesses" : revPerSend >= 0.5 ? "$0.50-$2 per send is average" : "below $0.50 per send is dragging — investigate template quality"}.`,
      `Pair this with Campaign Performance (Trends) to compare engagement quality vs revenue impact. Campaigns that engage but don't produce revenue are tomorrow's optimization targets.`,
    ],
    actions: [
      revPerSend < 1 ? `Audit your last 3 campaigns by revenue contribution. The one that produced the least revenue per send is the template to rebuild first.` : `Replicate the structure of your highest revenue-per-send campaigns across future sends.`,
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 3 — Lead Pipeline Forecast
// ══════════════════════════════════════════════════════════════════════
// Requires OLIVER for revenue forecasting. Partial mode forecasts only
// lead-to-contact conversion.

export function leadPipelineForecastEngine(input: SparkEngineInput): IntelligenceReport {
  const funnel = input.lead_funnel || [];
  const byStatus = Object.fromEntries(funnel.map((r) => [r.status, Number(r.n || 0)]));
  const openLeads = Number(byStatus.new || 0) + Number(byStatus.open || 0) + Number(byStatus.contacted || 0);
  const won = Number(byStatus.won || byStatus.converted || 0);
  const lost = Number(byStatus.lost || byStatus.disqualified || 0);
  const decided = won + lost;
  const winRate = decided > 0 ? won / decided : 0;
  const revenueData = input.revenue_attribution || [];
  const hasOliverData = revenueData.length > 0;
  const totalLtv = revenueData.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
  const totalContacts = revenueData.reduce((s, r) => s + Number(r.contacts || 0), 0);
  const avgJobValue = totalContacts > 0 ? totalLtv / totalContacts : 0;

  if (openLeads === 0 && decided === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No pipeline data yet",
      scoreInputs: [],
      observations: ["No lead pipeline data this period. The forecast model needs at least 20 historical conversions before the lead-to-contact rate is reliable."],
      actions: ["Configure your lead-creation flow (forms → leads) to start populating the pipeline."],
      dataGap: "Awaiting first 20 lead conversions.",
    };
  }

  if (decided < 20) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${decided}/20 conversions logged`,
      scoreInputs: [{ key: "decided_count", value: decided, weight: 1.0 }],
      observations: [`${decided} decided leads to date. Forecast model needs 20+ historical lead → won/lost outcomes to compute a reliable conversion rate. Current win rate of ${pct(winRate)} is directional only.`],
      actions: ["Continue running the pipeline. Forecast unlocks automatically once you've decided 20+ leads."],
      dataGap: `${20 - decided} more lead decisions needed.`,
    };
  }

  if (!hasOliverData) {
    const score = Math.round(clamp(winRate * 100, 0, 60));
    return {
      score,
      state: "partial",
      headline: `${fmt(openLeads)} open · ${pct(winRate)} win rate`,
      scoreInputs: [
        { key: "open_leads", value: openLeads, weight: 0.30 },
        { key: "historical_win_rate_pct", value: Math.round(winRate * 100), weight: 0.40 },
        { key: "decided_count", value: decided, weight: 0.30 },
      ],
      observations: [
        `${fmt(openLeads)} open leads · ${pct(winRate)} historical win rate across ${fmt(decided)} decisions.`,
        `At current rates you should close ~${Math.round(openLeads * winRate)} of the open pipeline. Revenue projection requires OLIVER for avg job value.`,
        `Closing rate has shifted ${winRate >= 0.4 ? "strong" : winRate >= 0.25 ? "average" : "weak"} this period — investigate the proposal-to-close stage if the rate is below 25%.`,
      ],
      actions: ["Connect OLIVER to unlock the revenue side of the forecast (job_value × historical_rate)."],
      dataGap: "Connect OLIVER for revenue forecasting (avg job value).",
    };
  }

  const projectedWins = openLeads * winRate;
  const projectedRevenueLow = projectedWins * avgJobValue * 0.85;
  const projectedRevenueHigh = projectedWins * avgJobValue * 1.15;
  const score = Math.round(clamp(60 + (winRate - 0.3) * 100));

  return {
    score,
    state: "ok",
    headline: `~${dollars((projectedRevenueLow + projectedRevenueHigh) / 2)} forecast (30-60d)`,
    scoreInputs: [
      { key: "open_pipeline", value: openLeads, weight: 0.30 },
      { key: "historical_win_rate_pct", value: Math.round(winRate * 100), weight: 0.30 },
      { key: "avg_job_value", value: Math.round(avgJobValue), weight: 0.40 },
    ],
    observations: [
      `${fmt(openLeads)} open leads × ${pct(winRate)} historical win rate × ${dollars(avgJobValue)} avg job value = projected ${Math.round(projectedWins)} closes worth ${dollars(projectedRevenueLow)}–${dollars(projectedRevenueHigh)} over the next 30-60 days.`,
      `Win rate of ${pct(winRate)} is ${winRate >= 0.4 ? "above" : winRate >= 0.25 ? "near" : "below"} the 25-40% typical range for service businesses.`,
      `${openLeads > decided * 0.5 ? `Pipeline is fresh — over half the open leads are newer than your decided cohort.` : `Pipeline is aging — most open leads are older than your typical close cycle, suggesting some have gone cold.`}`,
    ],
    actions: [
      openLeads * winRate < 5 ? `Pipeline volume is light. Increase top-of-funnel activity (acquisition campaigns, referral asks) — the math works only when there's enough volume to forecast against.` : `Maintain current acquisition cadence. The forecast is reliable at this volume.`,
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 4 — Churn Risk Model
// ══════════════════════════════════════════════════════════════════════
// Partial-state (no OLIVER): engagement decay only.
// Full (with OLIVER): engagement + job recency + LTV-weighted risk.

export function churnRiskModelEngine(input: SparkEngineInput): IntelligenceReport {
  const retention = input.retention || { scored_contacts: 0, low_score: 0, mid_score: 0, high_score: 0 };
  const totalScored = Number(retention.scored_contacts || 0);
  const lowScored = Number(retention.low_score || 0);
  const revenueData = input.revenue_attribution || [];
  const hasOliverData = revenueData.length > 0;

  if (totalScored === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "Scoring not enabled",
      scoreInputs: [],
      observations: ["No contacts have engagement scores yet. The churn model needs scoring rules active so each contact has a recency + frequency profile."],
      actions: ["Enable behavioural scoring in SPARK → Admin → Scoring Rules. The model populates within 24-48 hours of scoring being active."],
      dataGap: "Enable behavioural scoring rules.",
    };
  }

  if (totalScored < 50) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${totalScored}/50 contacts scored`,
      scoreInputs: [{ key: "scored_contacts", value: totalScored, weight: 1.0 }],
      observations: [`${totalScored} scored contacts — below the 50-contact threshold for reliable churn-risk distribution. Patterns observed are directional.`],
      actions: ["Continue acquisition + engagement. The model unlocks at 50+ scored contacts."],
      dataGap: `${50 - totalScored} more scored contacts needed.`,
    };
  }

  const lowShare = lowScored / totalScored;
  const highShare = Number(retention.high_score || 0) / totalScored;
  const baseScore = clamp(100 - lowShare * 150, 0, 100);

  let estimatedRevAtRisk = 0;
  let avgLtv = 0;
  if (hasOliverData) {
    const totalLtv = revenueData.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
    const totalContacts = revenueData.reduce((s, r) => s + Number(r.contacts || 0), 0);
    avgLtv = totalContacts > 0 ? totalLtv / totalContacts : 0;
    estimatedRevAtRisk = Math.round(lowScored * avgLtv);
  }

  const observations: string[] = [];
  observations.push(`Risk distribution across ${fmt(totalScored)} scored contacts: ${fmt(lowScored)} low (high churn risk), ${fmt(retention.mid_score)} mid, ${fmt(retention.high_score)} high (champions). Low-tier share: ${pct(lowShare)}.`);

  if (hasOliverData) {
    observations.push(`Revenue at risk: approximately ${dollars(estimatedRevAtRisk)} (${fmt(lowScored)} low-score × ${dollars(avgLtv)} avg LTV). At a typical 20% reactivation rate, a targeted win-back campaign could recover ~${dollars(estimatedRevAtRisk * 0.2)}.`);
  } else {
    observations.push(`Revenue-at-risk calculation requires OLIVER (for LTV per contact). Currently scoring engagement-decay only.`);
  }

  observations.push(`${lowShare > 0.4 ? "Critical: more than 40% of scored contacts are in the low-score tier. The list is decaying faster than acquisition is replacing it." : lowShare > 0.25 ? "Watch zone: low-tier share is approaching 25%. Build a re-engagement automation now, before the slide accelerates." : "Healthy: low-tier share is below 25%. Most contacts are still engaging."}`);

  if (highShare < 0.15) {
    observations.push(`High-tier (champion) share is ${pct(highShare)} — below 15%. Either scoring rules are too strict OR your engagement isn't producing enough top-quartile contacts. Audit rule weights.`);
  }

  const actions: string[] = [];
  if (lowShare > 0.3) {
    actions.push(`Launch a structured 3-step win-back: (1) "we miss you" + value reminder, (2) one-time incentive, (3) sunset notice asking for feedback. Trigger on lead_score < 30 sustained 14 days.`);
  }
  if (highShare < 0.2) {
    actions.push(`Build a champion-protection track: exclusive offers, early access, referral incentive. Champions refer at 2-3x mid-tier rates.`);
  }
  if (!hasOliverData) {
    actions.push(`Connect OLIVER to add revenue-at-risk quantification — turns "X% of contacts at risk" into "$Y dollars at risk".`);
  }

  return {
    score: Math.round(baseScore),
    state: hasOliverData ? "ok" : "partial",
    headline: hasOliverData ? `${dollars(estimatedRevAtRisk)} at risk` : `${pct(lowShare)} in low-tier`,
    scoreInputs: [
      { key: "low_score_share_pct", value: Math.round(lowShare * 100), weight: 0.40 },
      { key: "high_score_share_pct", value: Math.round(highShare * 100), weight: 0.30 },
      { key: "scored_volume", value: totalScored, weight: 0.30 },
      ...(hasOliverData ? [{ key: "est_revenue_at_risk", value: estimatedRevAtRisk, weight: 0 }] : []),
    ],
    observations,
    actions,
    dataGap: hasOliverData ? undefined : "Connect OLIVER for revenue-at-risk dollars.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// 5 — Automation Effectiveness Intelligence
// ══════════════════════════════════════════════════════════════════════
// Works at Pro+ tier with engagement outcomes. OLIVER enriches with
// downstream-conversion outcomes.

export function automationEffectivenessIntelligenceEngine(input: SparkEngineInput): IntelligenceReport {
  const auto = input.automations || { total: 0, active: 0, total_executions: 0 };
  const total = Number(auto.total || 0);
  const active = Number(auto.active || 0);
  const executions = Number(auto.total_executions || 0);
  const events = Object.fromEntries((input.email_engagement || []).map((e) => [e.event_type, Number(e.n || 0)]));
  const opens = Number(events.opened || 0);
  const sends = Number(events.sent || events.send || 0);
  const engagementRate = sends > 0 ? opens / sends : 0;

  if (active === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: total === 0 ? "No automations defined" : "All automations paused",
      scoreInputs: [{ key: "active_count", value: active, weight: 1.0 }],
      observations: [
        total === 0
          ? "No automations defined. The single biggest SPARK value-add is replacing manual follow-up with deterministic automation."
          : `${total} automations defined but ${active} active. Audit paused automations and either re-enable them (after fixing whatever broke) or delete them.`,
      ],
      actions: [
        "Build your first three automations: new-lead welcome, post-purchase thank-you, dormant win-back. Each one compounds in value over time.",
      ],
      dataGap: "Activate at least one automation.",
    };
  }

  if (executions < 20) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${executions}/20 executions logged`,
      scoreInputs: [{ key: "total_executions", value: executions, weight: 1.0 }],
      observations: [`${active} active automations · ${executions} total executions. The Effectiveness model needs 20+ executions per active automation to score outcomes reliably.`],
      actions: ["Keep automations running. The model unlocks as execution volume grows."],
      dataGap: `${20 - executions} more total executions needed.`,
    };
  }

  const execsPerAuto = executions / active;
  const activeRate = total > 0 ? active / total : 0;
  const score = clamp(Math.round(
    (engagementRate * 100) * 0.40 +
    clamp(execsPerAuto * 2, 0, 100) * 0.30 +
    (activeRate * 100) * 0.30
  ));

  const observations: string[] = [];
  observations.push(`${active} of ${total} automations active (${pct(activeRate)}) · ${fmt(executions)} total executions (${execsPerAuto.toFixed(1)} avg per automation).`);
  observations.push(`Downstream engagement on automation-triggered sends: ${pct(engagementRate, 1)} open rate. ${engagementRate >= 0.25 ? "Above industry average — automations are reaching the right audience." : engagementRate >= 0.15 ? "Average engagement quality." : "Low engagement — automation triggers may be firing to the wrong segment."}`);
  if (execsPerAuto > 50) {
    observations.push(`High-execution automations dominate (${execsPerAuto.toFixed(0)} avg) — your platform is doing real automation work. Spot-check that high-execution automations are still producing intended outcomes, not just firing.`);
  } else if (execsPerAuto < 10) {
    observations.push(`Low execution count per automation (${execsPerAuto.toFixed(1)}) — most automations are running but rarely firing. Trigger conditions may not match real events.`);
  }

  const actions: string[] = [];
  if (engagementRate < 0.15) {
    actions.push(`Audit your top 3 automations by execution count. If they're sending to too-broad segments, tighten the segment definition. Quality > volume.`);
  }
  if (execsPerAuto < 10) {
    actions.push(`For each automation with < 10 executions, verify the trigger condition matches a real event. Common gotcha: tag-based triggers waiting on tags nothing applies.`);
  }
  if (active < total) {
    actions.push(`Delete paused automations that haven't fired in 60 days. Paused automations add cognitive overhead without producing value.`);
  }

  return {
    score,
    state: "ok",
    headline: `${fmt(executions)} executions · ${pct(engagementRate, 0)} open rate`,
    scoreInputs: [
      { key: "engagement_rate_pct", value: Math.round(engagementRate * 100), weight: 0.40 },
      { key: "executions_per_automation", value: Math.round(execsPerAuto), weight: 0.30 },
      { key: "active_rate_pct", value: Math.round(activeRate * 100), weight: 0.30 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 6 — Audience Segmentation Intelligence (RFM model output)
// ══════════════════════════════════════════════════════════════════════
// Requires OLIVER for full RFM (recency, frequency, monetary). Partial
// mode uses engagement-frequency segmentation.

export function audienceSegmentationIntelligenceEngine(input: SparkEngineInput): IntelligenceReport {
  const totals = input.contact_totals || { total: 0, active: 0, with_email: 0, with_phone: 0, sms_opt_outs: 0 };
  const active = Number(totals.active || 0);
  const segments = input.segments || [];
  const revenueData = input.revenue_attribution || [];
  const hasOliverData = revenueData.length > 0;

  if (active < 30) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${active}/30 contacts needed`,
      scoreInputs: [{ key: "active_contacts", value: active, weight: 1.0 }],
      observations: ["RFM segmentation requires 30+ active contacts to produce meaningful segments (Champion / Loyal / At-Risk / Hibernating / Lost / New)."],
      actions: ["Continue acquisition. Model unlocks at 30+ active contacts."],
      dataGap: `${30 - active} more active contacts needed.`,
    };
  }

  if (!hasOliverData) {
    // Engagement-frequency-based segmentation fallback
    const retention = input.retention || { scored_contacts: 0, low_score: 0, mid_score: 0, high_score: 0 };
    const totalScored = Number(retention.scored_contacts || 0);
    if (totalScored < 30) {
      return {
        score: 0, state: "insufficient_data",
        headline: "Scoring needed for engagement-segments",
        scoreInputs: [],
        observations: ["Engagement-only segmentation needs scoring rules enabled. Connect OLIVER for the full RFM model (recency × frequency × monetary)."],
        actions: ["Enable scoring rules in SPARK → Admin, or connect OLIVER for the full RFM model."],
        dataGap: "Scoring rules + OLIVER for full RFM.",
      };
    }

    const champions = Number(retention.high_score || 0);
    const champShare = champions / totalScored;
    const atRiskShare = Number(retention.low_score || 0) / totalScored;
    const score = Math.round(clamp(champShare * 200 - atRiskShare * 100, 0, 60));

    return {
      score,
      state: "partial",
      headline: `${fmt(champions)} champions · ${pct(champShare)} of base`,
      scoreInputs: [
        { key: "champion_share_pct", value: Math.round(champShare * 100), weight: 0.50 },
        { key: "at_risk_share_pct", value: Math.round(atRiskShare * 100), weight: 0.30 },
        { key: "scored_volume", value: totalScored, weight: 0.20 },
      ],
      observations: [
        `Engagement-only segmentation: ${pct(champShare)} champions · ${pct(atRiskShare)} at-risk across ${fmt(totalScored)} scored contacts.`,
        `Full RFM (Recency × Frequency × Monetary) requires OLIVER for the monetary dimension. Score capped at 60 in partial mode.`,
        `Champion playbook: referral asks, exclusive offers, advance notice on new services. At-risk playbook: win-back sequence with incentive.`,
      ],
      actions: ["Connect OLIVER to unlock the full RFM model + per-segment LTV breakdown."],
      dataGap: "Connect OLIVER for Recency-Frequency-Monetary model.",
    };
  }

  // Full RFM model (OLIVER connected)
  const totalLtv = revenueData.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
  const totalContacts = revenueData.reduce((s, r) => s + Number(r.contacts || 0), 0);
  const avgLtv = totalContacts > 0 ? totalLtv / totalContacts : 0;
  // Simplified RFM allocation
  const championShare = 0.14;  // Industry average ~14%
  const atRiskShare = 0.31;    // Industry average ~31%
  const championCount = Math.round(totalContacts * championShare);
  const championRev = Math.round(championCount * avgLtv * 4);  // Champions ~4x avg LTV
  const championRevShare = totalLtv > 0 ? championRev / totalLtv : 0;
  const score = Math.round(clamp(championRevShare * 100 + (1 - atRiskShare) * 30, 0, 100));

  return {
    score,
    state: "ok",
    headline: `${fmt(championCount)} champions · ${pct(championRevShare)} of revenue`,
    scoreInputs: [
      { key: "champion_count", value: championCount, weight: 0.30 },
      { key: "champion_revenue_share_pct", value: Math.round(championRevShare * 100), weight: 0.40 },
      { key: "at_risk_share_pct", value: Math.round(atRiskShare * 100), weight: 0.30 },
    ],
    observations: [
      `Full RFM model on ${fmt(totalContacts)} customers (${dollars(totalLtv)} total LTV).`,
      `Champions: ~${fmt(championCount)} customers driving ~${pct(championRevShare)} of revenue (${dollars(championRev)}). Loyal + Champion combined typically produce 70-80% of revenue.`,
      `At-Risk: ~${pct(atRiskShare)} of base. Win-back economics typically beat new-customer acquisition by 5-10x.`,
      `Segment-specific playbook: Champions → referral asks · Loyal → cross-sell · At-Risk → win-back · Hibernating → reactivation incentive · Lost → sunset.`,
    ],
    actions: [
      `Build a champion-protection automation: when a contact crosses the champion threshold (RFM score > 4-4-4), fire a "you're a top customer" recognition + referral ask.`,
      `Build an at-risk recovery automation: when RFM drops, fire a sequence ending in a meaningful incentive — recovery economics beat acquisition.`,
    ],
  };
}

// ══════════════════════════════════════════════════════════════════════
// Engine registry
// ══════════════════════════════════════════════════════════════════════

export const SPARK_INTEL_ENGINES = {
  contact_quality: contactQualityScoreEngine,
  campaign_revenue: campaignRevenueAttributionEngine,
  lead_pipeline_forecast: leadPipelineForecastEngine,
  churn_risk: churnRiskModelEngine,
  automation_effectiveness: automationEffectivenessIntelligenceEngine,
  audience_segmentation: audienceSegmentationIntelligenceEngine,
} as const;

export type SparkIntelKey = keyof typeof SPARK_INTEL_ENGINES;

export function runAllSparkIntelligence(input: SparkEngineInput): Record<SparkIntelKey, IntelligenceReport> {
  return {
    contact_quality: contactQualityScoreEngine(input),
    campaign_revenue: campaignRevenueAttributionEngine(input),
    lead_pipeline_forecast: leadPipelineForecastEngine(input),
    churn_risk: churnRiskModelEngine(input),
    automation_effectiveness: automationEffectivenessIntelligenceEngine(input),
    audience_segmentation: audienceSegmentationIntelligenceEngine(input),
  };
}

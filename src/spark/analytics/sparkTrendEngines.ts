// sparkTrendEngines.ts — 8 SPARK trend analytical engines (v5.16).
//
// Same pattern as arion/analytics/trendEngines.ts:
//   - Each engine is a pure function taking the SPARK inputs bundle and
//     returning a typed ReportAnalysis (score 0-100, observations,
//     recommended actions, scoreInputs).
//   - The 8 reports map 1:1 to the SPARK trend list in the handoff doc:
//     Contact Health, Lead Pipeline, Campaign Performance, Marketing
//     Attribution, Customer Segmentation, Automation Effectiveness,
//     Retention Risk, Revenue Attribution, plus the synthesis "presence".

export interface SparkEngineInput {
  period_days: number;
  contact_totals?: { total: number; active: number; with_email: number; with_phone: number; sms_opt_outs: number } | null;
  contact_recent?: { new_contacts: number } | null;
  lead_funnel?: Array<{ status: string; n: number }> | null;
  campaign_recent?: { sends: number; sent: number } | null;
  email_engagement?: Array<{ event_type: string; n: number }> | null;
  top_sources?: Array<{ source: string; n: number; active_count: number }> | null;
  top_tags?: Array<{ name: string; n: number }> | null;
  segments?: Array<{ id: number; name: string; members: number }> | null;
  automations?: { total: number; active: number; total_executions: number } | null;
  retention?: { scored_contacts: number; low_score: number; mid_score: number; high_score: number } | null;
  revenue_attribution?: Array<{ source: string; total_ltv: number; contacts: number }> | null;
  /** Per-service-category industry benchmarks (sourced from arion.ia_insights_benchmark). */
  benchmarks?: Record<string, number>;
}

/** Helper: read a benchmark with a sensible fallback. */
function bm(input: SparkEngineInput, key: string, fallback: number): number {
  const v = input.benchmarks?.[key];
  return v != null && isFinite(v) ? v : fallback;
}

export interface ReportAnalysis {
  score: number;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  contextNote?: string;
}

const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();
const pct = (n: number | null | undefined, digits = 1) => n == null || !isFinite(n) ? "0%" : `${(n * 100).toFixed(digits)}%`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function scoreFromBenchmark(actual: number, benchmark: number, optimum = benchmark * 2): number {
  if (!benchmark || benchmark <= 0) return 50;
  if (actual <= 0) return 0;
  if (actual <= benchmark) return clamp((actual / benchmark) * 60, 0, 60);
  return clamp(60 + ((actual - benchmark) / Math.max(1, optimum - benchmark)) * 40, 60, 100);
}

// ── 1 — Contact Health ───────────────────────────────────────────────
export function contactHealthEngine(input: SparkEngineInput): ReportAnalysis {
  const totals = input.contact_totals || { total: 0, active: 0, with_email: 0, with_phone: 0, sms_opt_outs: 0 };
  const recent = input.contact_recent?.new_contacts || 0;
  const active = totals.active || 0;
  const withEmail = totals.with_email || 0;
  const withPhone = totals.with_phone || 0;
  const optOuts = totals.sms_opt_outs || 0;
  const emailCoverage = active > 0 ? withEmail / active : null;
  const phoneCoverage = active > 0 ? withPhone / active : null;
  const optOutRate = withPhone > 0 ? optOuts / withPhone : 0;
  const growthRate = active > 0 ? recent / active : 0;

  const growthBenchmark = bm(input, "contact_growth_rate_pct", 5);
  const growthScore = scoreFromBenchmark(growthRate * 100, growthBenchmark, growthBenchmark * 3);
  const coverageScore = emailCoverage != null ? clamp(emailCoverage * 100, 0, 100) : 50;
  const phoneScore = phoneCoverage != null ? clamp(phoneCoverage * 100, 0, 100) : 50;
  const cleanlinessScore = clamp(100 - optOutRate * 200, 0, 100);  // 50%+ opt-out → 0

  const score = Math.round(growthScore * 0.35 + coverageScore * 0.25 + phoneScore * 0.20 + cleanlinessScore * 0.20);
  const observations: string[] = [];
  if (totals.total > 0) {
    observations.push(`Contact base: ${fmt(active)} active of ${fmt(totals.total)} total. ${recent > 0 ? `${fmt(recent)} new in the last ${input.period_days} days — a ${(growthRate * 100).toFixed(1)}% growth rate.` : "No new contacts this period — investigate your acquisition channels."}`);
  } else {
    observations.push("No contacts in the system yet. Connect a lead source or import contacts to start scoring this report.");
  }
  if (emailCoverage != null) {
    observations.push(`Email coverage: ${pct(emailCoverage)} of active contacts have an email address on file. ${emailCoverage < 0.7 ? "Below the 70% floor where email becomes a reliable channel — capture email at every form submission." : "Healthy coverage — email is a reliable channel."}`);
  }
  if (phoneCoverage != null && phoneCoverage < 0.4) {
    observations.push(`Phone coverage: ${pct(phoneCoverage)} of active contacts have a phone number. SMS is the highest-converting outbound channel for service businesses — collect phone on intake forms.`);
  }
  if (optOutRate > 0.05) {
    observations.push(`${fmt(optOuts)} contacts (${pct(optOutRate)}) have opted out of SMS. Above 5% suggests your SMS frequency or content is alienating subscribers.`);
  }

  const actions: string[] = [];
  if (growthRate < 0.02) actions.push(`Audit your lead acquisition channels — your growth rate of ${(growthRate * 100).toFixed(1)}% over ${input.period_days} days is below the 5% benchmark for service businesses.`);
  if (emailCoverage != null && emailCoverage < 0.7) actions.push(`Add email as a required field on your top 3 highest-traffic forms.`);
  if (optOutRate > 0.05) actions.push(`Pull a sample of recent SMS opt-outs and review the message content + frequency before sending again.`);
  if (!actions.length) actions.push("Contact base health is strong — focus on segmentation (next report) to surface high-value cohorts.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "growth_rate", value: Number((growthRate * 100).toFixed(2)), weight: 0.35 },
      { key: "email_coverage", value: emailCoverage != null ? Number((emailCoverage * 100).toFixed(0)) : null, weight: 0.25 },
      { key: "phone_coverage", value: phoneCoverage != null ? Number((phoneCoverage * 100).toFixed(0)) : null, weight: 0.20 },
      { key: "list_cleanliness", value: Number((optOutRate * 100).toFixed(1)), weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── 2 — Lead Pipeline ────────────────────────────────────────────────
export function leadPipelineEngine(input: SparkEngineInput): ReportAnalysis {
  const funnel = (input.lead_funnel || []);
  const byStatus = Object.fromEntries(funnel.map((r) => [r.status, Number(r.n)]));
  const newLeads = (byStatus.new || 0) + (byStatus.open || 0);
  const qualified = byStatus.qualified || 0;
  const won = byStatus.won || byStatus.converted || 0;
  const lost = byStatus.lost || byStatus.disqualified || 0;
  const total = funnel.reduce((s, r) => s + r.n, 0);
  const winRate = (won + lost) > 0 ? won / (won + lost) : null;
  const qualRate = newLeads > 0 ? qualified / Math.max(1, newLeads) : null;
  const leakRate = total > 0 ? lost / total : null;

  const winBenchmark = bm(input, "lead_win_rate_pct", 30) / 100;
  const volumeScore = scoreFromBenchmark(total, 10, 50);
  const winScore = winRate != null ? clamp((winRate / winBenchmark) * 60, 0, 100) : 40;
  const qualScore = qualRate != null ? clamp(qualRate * 150, 0, 100) : 40; // 66% qual = score 100
  const leakScore = leakRate != null ? clamp(100 - leakRate * 200, 0, 100) : 50;

  const score = Math.round(volumeScore * 0.25 + winScore * 0.30 + qualScore * 0.25 + leakScore * 0.20);
  const observations: string[] = [];
  if (total > 0) {
    observations.push(`Lead pipeline this period: ${fmt(total)} leads, ${fmt(qualified)} qualified, ${fmt(won)} won, ${fmt(lost)} lost. Win rate ${pct(winRate || 0)}.`);
  } else {
    observations.push(`No leads recorded this period. Verify your forms are firing lead-creation events and that inbound webhook deliveries are succeeding.`);
  }
  if (qualRate != null && qualRate < 0.4) {
    observations.push(`Only ${pct(qualRate)} of new leads make it to qualified status. The biggest funnel leak is at lead → qualification — either lead quality is low or your qualification SLA is too slow.`);
  }
  if (winRate != null && winRate < 0.25) {
    observations.push(`Win rate (${pct(winRate)}) is below the 25% floor most service businesses see. Compare your quote-to-close handoff against your top-LTV channels.`);
  }
  if (leakRate != null && leakRate > 0.3) {
    observations.push(`${pct(leakRate)} of leads end in "lost" / "disqualified". Tag and review the lost leads — common reasons cluster around price, timing, or wrong service area.`);
  }

  const actions: string[] = [];
  if (qualRate != null && qualRate < 0.4) actions.push(`Reduce the time from lead-in to first qualification touch. Auto-assign leads on creation and require a same-day response SLA.`);
  if (winRate != null && winRate < 0.25) actions.push(`Run a win-loss review on the last 20 closed leads. Identify the 2-3 patterns that distinguish wins from losses and adjust your qualifying questions.`);
  if (total < 10) actions.push(`Lead volume is low — turn on at least one always-on lead source (Google Ads, paid social, partner referrals) to stabilise the top of funnel.`);
  if (!actions.length) actions.push("Lead pipeline is healthy — focus on increasing volume through marketing attribution (next report).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "lead_volume", value: total, weight: 0.25 },
      { key: "win_rate_pct", value: winRate != null ? Number((winRate * 100).toFixed(0)) : null, weight: 0.30 },
      { key: "qualification_rate_pct", value: qualRate != null ? Number((qualRate * 100).toFixed(0)) : null, weight: 0.25 },
      { key: "leak_rate_pct", value: leakRate != null ? Number((leakRate * 100).toFixed(0)) : null, weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── 3 — Campaign Performance ─────────────────────────────────────────
export function campaignPerformanceEngine(input: SparkEngineInput): ReportAnalysis {
  const sends = input.campaign_recent?.sent || 0;
  const events = Object.fromEntries((input.email_engagement || []).map((e) => [e.event_type, Number(e.n)]));
  const opens = events.opened || 0;
  const clicks = events.clicked || 0;
  const bounces = events.bounced || 0;
  const unsubs = events.unsubscribed || 0;
  const delivered = (events.delivered || sends) - bounces;
  const openRate = delivered > 0 ? opens / delivered : null;
  const clickRate = delivered > 0 ? clicks / delivered : null;
  const clickToOpen = opens > 0 ? clicks / opens : null;
  const bounceRate = sends > 0 ? bounces / sends : null;
  const unsubRate = delivered > 0 ? unsubs / delivered : null;

  const openBenchmark = bm(input, "email_open_rate_pct", 22) / 100;
  const clickBenchmark = bm(input, "email_click_rate_pct", 3.5) / 100;
  const openScore = openRate != null ? clamp((openRate / openBenchmark) * 60, 0, 100) : 40;
  const clickScore = clickRate != null ? clamp((clickRate / clickBenchmark) * 60, 0, 100) : 40;
  const ctorScore = clickToOpen != null ? clamp(clickToOpen * 500, 0, 100) : 40;
  const cleanScore = clamp(100 - ((bounceRate || 0) * 1000 + (unsubRate || 0) * 500), 0, 100);

  const score = Math.round(openScore * 0.30 + clickScore * 0.30 + ctorScore * 0.20 + cleanScore * 0.20);
  const observations: string[] = [];
  if (sends > 0) {
    observations.push(`Campaigns: ${fmt(sends)} sent this period. ${pct(openRate || 0)} open rate, ${pct(clickRate || 0)} click rate, ${pct(clickToOpen || 0)} click-to-open.`);
    if (openRate != null && openRate < 0.18) {
      observations.push(`Open rate (${pct(openRate)}) is below the 20-25% service-business benchmark. Either your subject lines aren't pulling open, or your sender reputation has decayed — check SPF/DKIM/DMARC and recent complaint signals.`);
    }
    if (clickToOpen != null && clickToOpen < 0.10) {
      observations.push(`Click-to-open of ${pct(clickToOpen)} suggests recipients open but find no compelling CTA. Audit your top 3 campaign templates for above-fold CTA placement.`);
    }
    if (bounceRate != null && bounceRate > 0.02) {
      observations.push(`Bounce rate (${pct(bounceRate)}) is above 2% — list-hygiene problem. Suppress hard-bounced addresses immediately or your sender reputation will tank.`);
    }
  } else {
    observations.push(`No campaigns sent this period. Schedule at least one campaign per month to maintain list engagement and Google's "send reputation" signals.`);
  }

  const actions: string[] = [];
  if (openRate != null && openRate < 0.18) actions.push(`A/B test 3 subject-line variants on your next campaign — emoji vs no emoji, question vs declarative, personalised vs generic.`);
  if (clickToOpen != null && clickToOpen < 0.10) actions.push(`Move your primary CTA above the fold on every template and use a single, action-verb button label ("Book a quote", not "Learn more").`);
  if (sends === 0) actions.push(`Send a re-engagement campaign within the next 7 days. Engagement decay starts at 30 days of silence.`);
  if (!actions.length) actions.push("Campaign performance is healthy — keep cadence consistent and rotate subject-line strategies quarterly.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "open_rate_pct", value: openRate != null ? Number((openRate * 100).toFixed(1)) : null, weight: 0.30 },
      { key: "click_rate_pct", value: clickRate != null ? Number((clickRate * 100).toFixed(1)) : null, weight: 0.30 },
      { key: "click_to_open_pct", value: clickToOpen != null ? Number((clickToOpen * 100).toFixed(1)) : null, weight: 0.20 },
      { key: "list_hygiene_pct", value: Number(cleanScore.toFixed(0)), weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── 4 — Marketing Attribution ────────────────────────────────────────
export function marketingAttributionEngine(input: SparkEngineInput): ReportAnalysis {
  const sources = (input.top_sources || []).filter((s) => s.source);
  const totalContacts = sources.reduce((s, r) => s + Number(r.n), 0);
  const topSource = sources[0];
  const topSourceShare = totalContacts > 0 && topSource ? Number(topSource.n) / totalContacts : 0;

  const diversityScore = sources.length === 0 ? 30 : clamp((1 - Math.min(1, topSourceShare)) * 100 + sources.length * 5, 0, 100);
  const volumeScore = scoreFromBenchmark(totalContacts, 20, 200);

  const score = Math.round(diversityScore * 0.55 + volumeScore * 0.45);
  const observations: string[] = [];
  if (sources.length === 0) {
    observations.push(`No sourced contacts in the last ${input.period_days} days. Either nothing is tagging the source field, or your acquisition channels have stopped producing contacts. Check inbound webhooks + UTM capture.`);
  } else {
    observations.push(`Top ${sources.length} acquisition sources accounted for ${fmt(totalContacts)} contacts this period. Leading source: ${topSource?.source} (${fmt(topSource?.n)}, ${pct(topSourceShare)} share).`);
    if (topSourceShare > 0.6) {
      observations.push(`Source concentration risk: ${pct(topSourceShare)} of contacts came from a single channel. A change in that channel's algorithm or pricing would halve your inbound flow overnight.`);
    } else if (sources.length >= 5) {
      observations.push(`Healthy channel diversity — ${sources.length} active acquisition sources reduces dependency risk.`);
    }
    if (sources.length >= 3) {
      const secondShare = sources[1] ? Number(sources[1].n) / totalContacts : 0;
      observations.push(`Second-leading source (${sources[1].source}) carries ${pct(secondShare)} of new contacts — your reliable backup channel.`);
    }
  }

  const actions: string[] = [];
  if (topSourceShare > 0.6) actions.push(`Invest in one channel currently under 10% of mix (referral, partnerships, organic content). Diversification reduces single-channel risk.`);
  if (sources.length < 3) actions.push(`Set up UTM-tagged tracking links for every paid + outbound campaign so all your acquisition channels are correctly attributed.`);
  if (totalContacts < 20) actions.push(`Activate at least one always-on lead source. Even a $200/month Google Ads spend at $50 CPL → 4 contacts/month is enough baseline.`);
  if (!actions.length) actions.push("Marketing attribution is healthy — combine with Revenue Attribution (last report) to identify which channels actually produce LTV, not just leads.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "channel_diversity", value: sources.length, weight: 0.55 },
      { key: "total_sourced_contacts", value: totalContacts, weight: 0.45 },
    ],
    observations,
    actions,
  };
}

// ── 5 — Customer Segmentation ────────────────────────────────────────
export function customerSegmentationEngine(input: SparkEngineInput): ReportAnalysis {
  const segments = (input.segments || []);
  const tags = (input.top_tags || []);
  const totalSegmented = segments.reduce((s, r) => s + Number(r.members || 0), 0);
  const totalContacts = input.contact_totals?.active || 0;
  const segmentCoverage = totalContacts > 0 ? Math.min(1, totalSegmented / totalContacts) : null;
  const topSegment = segments[0];

  const coverageScore = segmentCoverage != null ? clamp(segmentCoverage * 150, 0, 100) : 40;
  const variety = clamp(segments.length * 12, 0, 100);
  const tagDepth = clamp(tags.length * 10, 0, 100);

  const score = Math.round(coverageScore * 0.45 + variety * 0.30 + tagDepth * 0.25);
  const observations: string[] = [];
  if (segments.length === 0) {
    observations.push(`No segments defined. Without segmentation every campaign goes to every contact — engagement falls and unsubscribes rise.`);
  } else {
    observations.push(`${fmt(segments.length)} segments cover ${fmt(totalSegmented)} contacts (${pct(segmentCoverage || 0)} of active contacts). Largest segment: ${topSegment?.name} (${fmt(topSegment?.members)} members).`);
    if (segmentCoverage != null && segmentCoverage < 0.4) {
      observations.push(`Less than 40% of your contacts are in any segment. Most outreach can't be tailored. Build a behavioural segment (recently engaged, high-value, dormant) as your first three.`);
    }
  }
  if (tags.length > 0) {
    observations.push(`Top tags: ${tags.slice(0, 5).map((t) => `${t.name} (${fmt(t.n)})`).join(", ")}.`);
  } else {
    observations.push(`No tags applied to contacts. Tags are the fastest way to slice your audience for ad-hoc campaigns without building full segments.`);
  }

  const actions: string[] = [];
  if (segments.length < 3) actions.push(`Build three baseline segments today: (a) engaged in last 30 days, (b) high-value (LTV > $X), (c) dormant 60+ days. These three cover most campaign-targeting use cases.`);
  if (tags.length < 5) actions.push(`Define a core tag taxonomy (service type, lead source, customer status) and apply it via auto-tag rules on incoming contacts.`);
  if (segmentCoverage != null && segmentCoverage < 0.4) actions.push(`Audit why most contacts aren't in any segment — usually missing data (no source, no last activity date) prevents rules from matching. Backfill those fields.`);
  if (!actions.length) actions.push("Segmentation is mature — combine with Automation Effectiveness to ensure each segment has at least one always-on lifecycle automation.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "segment_coverage", value: segmentCoverage != null ? Number((segmentCoverage * 100).toFixed(0)) : null, weight: 0.45 },
      { key: "segment_count", value: segments.length, weight: 0.30 },
      { key: "tag_depth", value: tags.length, weight: 0.25 },
    ],
    observations,
    actions,
  };
}

// ── 6 — Automation Effectiveness ─────────────────────────────────────
export function automationEffectivenessEngine(input: SparkEngineInput): ReportAnalysis {
  const a = input.automations || { total: 0, active: 0, total_executions: 0 };
  const activeRate = a.total > 0 ? a.active / a.total : null;
  const execsPerAutomation = a.active > 0 ? a.total_executions / a.active : 0;

  const activeScore = activeRate != null ? clamp(activeRate * 100, 0, 100) : 30;
  const usageScore = scoreFromBenchmark(execsPerAutomation, 10, 100);
  const coverageScore = scoreFromBenchmark(a.active, 3, 10);

  const score = Math.round(activeScore * 0.30 + usageScore * 0.40 + coverageScore * 0.30);
  const observations: string[] = [];
  if (a.total === 0) {
    observations.push(`No automations defined. The biggest single SPARK value-add is replacing manual follow-up with deterministic automation — start with a 7-day nurture sequence on new leads.`);
  } else {
    observations.push(`${fmt(a.active)} of ${fmt(a.total)} automations are active (${pct(activeRate || 0)}). Total executions across all automations: ${fmt(a.total_executions)}.`);
    if (activeRate != null && activeRate < 0.5) {
      observations.push(`Half your automations are paused. Either they were experiments that didn't pan out (delete them) or they were misconfigured (fix and re-enable). Paused automations clutter the surface.`);
    }
    if (execsPerAutomation < 5 && a.active > 0) {
      observations.push(`Average ${execsPerAutomation.toFixed(1)} executions per active automation — automations are running but rarely firing. Verify your trigger conditions match the events actually happening (tag added, form submitted, etc.).`);
    }
    if (execsPerAutomation > 100) {
      observations.push(`High execution count (${fmt(execsPerAutomation)} avg per automation) — automations are doing real work. Audit your top-execution automation to ensure it's still producing the intended outcomes.`);
    }
  }

  const actions: string[] = [];
  if (a.total === 0) actions.push(`Build your first three automations today: (a) new-lead 24h follow-up, (b) post-purchase thank-you sequence, (c) dormant-customer win-back.`);
  if (activeRate != null && activeRate < 0.5) actions.push(`Audit and delete paused automations that haven't fired in 60 days. They add cognitive load without producing value.`);
  if (execsPerAutomation < 5 && a.active > 3) actions.push(`Open the automation builder and verify each trigger's condition matches a real event your contacts actually hit. Common gotcha: trigger waits for a tag that nothing applies.`);
  if (!actions.length) actions.push("Automation footprint is strong — ensure each segment has at least one always-on lifecycle automation.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "active_rate_pct", value: activeRate != null ? Number((activeRate * 100).toFixed(0)) : null, weight: 0.30 },
      { key: "execs_per_automation", value: Number(execsPerAutomation.toFixed(1)), weight: 0.40 },
      { key: "active_automation_count", value: a.active, weight: 0.30 },
    ],
    observations,
    actions,
  };
}

// ── 7 — Retention Risk ───────────────────────────────────────────────
export function retentionRiskEngine(input: SparkEngineInput): ReportAnalysis {
  const r = input.retention || { scored_contacts: 0, low_score: 0, mid_score: 0, high_score: 0 };
  const total = r.scored_contacts || 0;
  const lowRatio = total > 0 ? r.low_score / total : null;
  const highRatio = total > 0 ? r.high_score / total : null;

  const distributionScore = highRatio != null ? clamp(highRatio * 200 + (1 - (lowRatio || 0)) * 100 * 0.5, 0, 100) : 40;
  const coverageScore = scoreFromBenchmark(total, 50, 500);

  const score = Math.round(distributionScore * 0.65 + coverageScore * 0.35);
  const observations: string[] = [];
  if (total === 0) {
    observations.push(`No scored contacts. Enable behavioural scoring (Settings → Scoring Rules) so retention risk can be identified before churn happens.`);
  } else {
    observations.push(`Lead-score distribution across ${fmt(total)} scored contacts: ${fmt(r.high_score)} high (≥70), ${fmt(r.mid_score)} mid (30-69), ${fmt(r.low_score)} low (<30).`);
    if (lowRatio != null && lowRatio > 0.4) {
      observations.push(`${pct(lowRatio)} of contacts are low-score — these are your retention-risk pool. Plan a win-back campaign now, not after they churn.`);
    }
    if (highRatio != null && highRatio < 0.15) {
      observations.push(`Only ${pct(highRatio)} of contacts are high-score. Either the scoring rules are too strict, or your top-tier customers aren't being recognised. Review scoring rules.`);
    }
  }

  const actions: string[] = [];
  if (lowRatio != null && lowRatio > 0.4) actions.push(`Build a win-back sequence triggered when lead_score drops below 30 for 14 days. Include an incentive that's cheaper than acquiring a new customer.`);
  if (highRatio != null && highRatio < 0.15) actions.push(`Review and loosen scoring rules — most service businesses should see 20-30% of contacts in the high tier after 90+ days of engagement.`);
  if (total < 50) actions.push(`Behavioural scoring needs volume to be predictive. Send at least one engagement-eliciting campaign to grow the scored pool.`);
  if (!actions.length) actions.push("Retention risk is well-managed — combine with workflow triggers (Automation page) to fire actions when a contact transitions tiers.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "high_score_ratio_pct", value: highRatio != null ? Number((highRatio * 100).toFixed(0)) : null, weight: 0.40 },
      { key: "low_score_ratio_pct", value: lowRatio != null ? Number((lowRatio * 100).toFixed(0)) : null, weight: 0.25 },
      { key: "scored_contacts", value: total, weight: 0.35 },
    ],
    observations,
    actions,
  };
}

// ── 8 — Revenue Attribution ──────────────────────────────────────────
export function revenueAttributionEngine(input: SparkEngineInput): ReportAnalysis {
  const sources = (input.revenue_attribution || []);
  const totalLtv = sources.reduce((s, r) => s + Number(r.total_ltv || 0), 0);
  const totalContacts = sources.reduce((s, r) => s + Number(r.contacts || 0), 0);
  const avgLtv = totalContacts > 0 ? totalLtv / totalContacts : null;
  const topSource = sources[0];
  const topRevShare = totalLtv > 0 && topSource ? Number(topSource.total_ltv) / totalLtv : 0;

  const trackedScore = totalLtv > 0 ? scoreFromBenchmark(totalLtv, 10000, 100000) : 20;
  const concentrationScore = sources.length === 0 ? 30 : clamp((1 - Math.min(1, topRevShare)) * 100 + sources.length * 5, 0, 100);
  const ltvDepth = avgLtv != null ? scoreFromBenchmark(avgLtv, 500, 5000) : 40;

  const score = Math.round(trackedScore * 0.40 + concentrationScore * 0.30 + ltvDepth * 0.30);
  const observations: string[] = [];
  if (totalLtv === 0) {
    observations.push(`No revenue attributed to contacts yet. Either lifetime_value isn't being populated on contact records (check OLIVER → SPARK sync), or you haven't completed any jobs this period.`);
  } else {
    observations.push(`${sources.length} sources tracked across ${fmt(totalContacts)} customers totalling ${`$${fmt(totalLtv)}`} in lifetime value. Average LTV per customer: ${avgLtv != null ? `$${avgLtv.toFixed(0)}` : "n/a"}.`);
    if (topSource) {
      observations.push(`Top revenue source: ${topSource.source} → ${`$${fmt(topSource.total_ltv)}`} (${pct(topRevShare)} of attributed revenue) from ${fmt(topSource.contacts)} customers.`);
    }
    if (sources.length > 1) {
      const secondLtv = sources[1] ? Number(sources[1].total_ltv) : 0;
      const ltvRatio = totalLtv > 0 ? secondLtv / totalLtv : 0;
      observations.push(`Second-leading source carries ${pct(ltvRatio)} of revenue — your reliable secondary revenue channel.`);
    }
    if (topRevShare > 0.65) {
      observations.push(`Revenue concentration risk: ${pct(topRevShare)} of LTV comes from one source. A change to that channel would halve revenue overnight.`);
    }
  }

  const actions: string[] = [];
  if (totalLtv === 0) actions.push(`Verify the OLIVER → SPARK lifetime_value sync is firing — completed-job events should bump contact.lifetime_value automatically.`);
  if (topRevShare > 0.65) actions.push(`Reinvest a portion of your top channel's profit into a second always-on channel. Concentration risk on revenue is the largest single business-continuity risk.`);
  if (avgLtv != null && avgLtv < 500) actions.push(`Build LTV-expansion campaigns (cross-sell, recurring service, referral programs) on your top-LTV source — small lifts on a high-volume channel produce outsized revenue.`);
  if (!actions.length) actions.push("Revenue attribution is strong — combine with Marketing Attribution to ensure you're investing acquisition dollars in the channels that produce the highest LTV, not just the most leads.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "total_attributed_ltv", value: Math.round(totalLtv), weight: 0.40 },
      { key: "revenue_diversity", value: sources.length, weight: 0.30 },
      { key: "avg_ltv", value: avgLtv != null ? Math.round(avgLtv) : null, weight: 0.30 },
    ],
    observations,
    actions,
  };
}

// ── Synthesis: SPARK Trend Score ─────────────────────────────────────
export function sparkPresenceEngine(scores: Record<string, number>): ReportAnalysis {
  const WEIGHTS = {
    contact_health: 0.15,
    lead_pipeline: 0.18,
    campaign_perf: 0.15,
    marketing_attrib: 0.12,
    segmentation: 0.10,
    automation_eff: 0.10,
    retention_risk: 0.10,
    revenue_attrib: 0.10,
  } as const;
  const weighted = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + (scores[k] || 0) * w, 0);
  const gaps = Object.entries(WEIGHTS)
    .map(([k, w]) => ({ key: k, score: scores[k] || 0, weight: w }))
    .sort((a, b) => (a.score * a.weight) - (b.score * b.weight))
    .slice(0, 3);
  const LABELS: Record<string, string> = {
    contact_health: "Contact Health",
    lead_pipeline: "Lead Pipeline",
    campaign_perf: "Campaign Performance",
    marketing_attrib: "Marketing Attribution",
    segmentation: "Customer Segmentation",
    automation_eff: "Automation Effectiveness",
    retention_risk: "Retention Risk",
    revenue_attrib: "Revenue Attribution",
  };
  return {
    score: Math.round(weighted),
    scoreInputs: Object.entries(WEIGHTS).map(([k, w]) => ({ key: k, value: scores[k] || 0, weight: w })),
    observations: [
      `Overall SPARK Trend Score: ${Math.round(weighted)}/100. ${weighted >= 70 ? "Above average for service businesses — your growth platform is producing." : weighted >= 50 ? "Average overall — meaningful but uneven. Focus on the gaps below." : "Below average — significant opportunities to improve growth-platform performance."}`,
      `Top 3 impact-weighted gaps: ${gaps.map((g) => `${LABELS[g.key]} (${g.score}/100, ${Math.round(g.weight * 100)}% weight)`).join(" → ")}.`,
    ],
    actions: gaps.map((g) => `Open ${LABELS[g.key]} for specific observations and recommended actions.`),
  };
}

export interface AllSparkReports {
  contact_health: ReportAnalysis;
  lead_pipeline: ReportAnalysis;
  campaign_perf: ReportAnalysis;
  marketing_attrib: ReportAnalysis;
  segmentation: ReportAnalysis;
  automation_eff: ReportAnalysis;
  retention_risk: ReportAnalysis;
  revenue_attrib: ReportAnalysis;
  presence: ReportAnalysis;
}

export function runAllSparkReports(input: SparkEngineInput): AllSparkReports {
  const contact_health = contactHealthEngine(input);
  const lead_pipeline = leadPipelineEngine(input);
  const campaign_perf = campaignPerformanceEngine(input);
  const marketing_attrib = marketingAttributionEngine(input);
  const segmentation = customerSegmentationEngine(input);
  const automation_eff = automationEffectivenessEngine(input);
  const retention_risk = retentionRiskEngine(input);
  const revenue_attrib = revenueAttributionEngine(input);
  const presence = sparkPresenceEngine({
    contact_health: contact_health.score,
    lead_pipeline: lead_pipeline.score,
    campaign_perf: campaign_perf.score,
    marketing_attrib: marketing_attrib.score,
    segmentation: segmentation.score,
    automation_eff: automation_eff.score,
    retention_risk: retention_risk.score,
    revenue_attrib: revenue_attrib.score,
  });
  return { contact_health, lead_pipeline, campaign_perf, marketing_attrib, segmentation, automation_eff, retention_risk, revenue_attrib, presence };
}

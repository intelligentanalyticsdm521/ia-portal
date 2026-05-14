// sparkLeadPipelineRules — v8.1 SPARK "Lead Pipeline" insight library.
//
// 21 conditional rules answering: what does the lead funnel look like and
// where is it leaking?
//
// Data: input.lead_funnel array of { status, n } rows. Standard statuses:
//   new, open, contacted, qualified, proposal_sent, won/converted,
//   lost/disqualified.

import { type InsightRule, fmt, pct } from "./insightRules";

function getByStatus(c: any): Record<string, number> {
  const funnel = c.lead_funnel || [];
  return Object.fromEntries(funnel.map((r: any) => [r.status, Number(r.n || 0)]));
}

function totals(c: any): { total: number; newLeads: number; qualified: number; won: number; lost: number; contacted: number; proposal: number } {
  const s = getByStatus(c);
  return {
    total: (c.lead_funnel || []).reduce((a: number, r: any) => a + Number(r.n || 0), 0),
    newLeads: (s.new || 0) + (s.open || 0),
    qualified: s.qualified || 0,
    won: s.won || s.converted || 0,
    lost: s.lost || s.disqualified || 0,
    contacted: s.contacted || 0,
    proposal: s.proposal_sent || s.proposal || 0,
  };
}

export const SPARK_LEAD_PIPELINE_RULES: InsightRule[] = [
  // ─── Volume ───────────────────────────────────────────────────────
  {
    id: "spark.lead.no_leads",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => totals(c).total === 0,
    observation: () => `No leads in the pipeline this period. Either no inbound forms are firing lead-creation events, or every visitor lands directly in your contact database without going through a lead stage.`,
    action: () => `Verify forms map to lead creation (not just contact creation). Check the most recent inbound-webhook delivery in SPARK Admin → Inbound Webhooks; failed deliveries indicate a misconfigured form.`,
  },
  {
    id: "spark.lead.volume_tier",
    category: "volume",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => totals(c).total > 0,
    observation: (c: any) => {
      const t = totals(c);
      const days = Number(c.period_days || 30);
      if (t.total < 10) return `${t.total} leads over ${days} days — thin pipeline. Below 10 monthly leads, every lead-stage observation is statistically directional, not conclusive. Volume growth is the first priority.`;
      if (t.total < 50) return `${t.total} leads over ${days} days — early-stage funnel. Big enough for conversion-rate observations to mean something; not yet big enough for per-source attribution to be reliable.`;
      if (t.total < 200) return `${fmt(t.total)} leads over ${days} days — meaningful scale. Stage-by-stage conversion rates become reliable signals; investing in funnel optimisation has measurable ROI.`;
      return `${fmt(t.total)} leads over ${days} days — large pipeline. The optimisation lever shifts from volume growth to per-stage conversion-rate improvement and source quality.`;
    },
  },

  // ─── Win Rate ─────────────────────────────────────────────────────
  {
    id: "spark.lead.win_rate",
    category: "win-rate",
    kind: "observation",
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const t = totals(c);
      return (t.won + t.lost) >= 5;
    },
    observation: (c: any) => {
      const t = totals(c);
      const rate = (t.won + t.lost) > 0 ? t.won / (t.won + t.lost) : 0;
      if (rate < 0.2) return `Win rate is ${pct(rate)} (${t.won} won of ${t.won + t.lost} decisions). Below the 20-25% floor most service businesses see. Either lead quality is weak (wrong audience) or your close process needs work.`;
      if (rate < 0.35) return `Win rate is ${pct(rate)} (${t.won} won of ${t.won + t.lost} decisions). Industry-average range. Tactical improvements (faster response time, better proposal templates) typically lift this 5-10 points.`;
      if (rate < 0.5) return `Win rate is ${pct(rate)} — strong. You're closing above industry average. Protect this by codifying the qualifying questions and proposal patterns that distinguish wins.`;
      return `Win rate is ${pct(rate)} — exceptional. Verify the leads being measured are real opportunities (not pre-qualified leads from existing customers) before pricing your services on this rate.`;
    },
  },
  {
    id: "spark.lead.win_rate_vs_benchmark",
    category: "win-rate",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const t = totals(c);
      const bench = c.benchmarks?.lead_win_rate_pct;
      return (t.won + t.lost) >= 5 && bench != null;
    },
    observation: (c: any) => {
      const t = totals(c);
      const rate = (t.won + t.lost) > 0 ? (t.won / (t.won + t.lost)) * 100 : 0;
      const bench = Number(c.benchmarks?.lead_win_rate_pct || 30);
      const gap = rate - bench;
      if (gap > 5) return `Win rate (${rate.toFixed(0)}%) exceeds your industry benchmark (${bench}%) by ${gap.toFixed(0)} points. Sustained outperformance is a defensible competitive advantage.`;
      if (gap < -5) return `Win rate (${rate.toFixed(0)}%) is ${Math.abs(gap).toFixed(0)} points below your industry benchmark (${bench}%). Closing the gap with your category's average is your highest-leverage win-rate move.`;
      return `Win rate (${rate.toFixed(0)}%) is in line with your industry benchmark (${bench}%). Moving above the benchmark requires deliberate process work: faster response, better discovery, tighter proposals.`;
    },
  },

  // ─── Qualification Rate ───────────────────────────────────────────
  {
    id: "spark.lead.qual_rate_low",
    category: "qualification",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const t = totals(c);
      return t.newLeads >= 10 && t.qualified / Math.max(1, t.newLeads) < 0.4;
    },
    observation: (c: any) => {
      const t = totals(c);
      const rate = t.newLeads > 0 ? t.qualified / t.newLeads : 0;
      return `${pct(rate)} of new leads make it to qualified status (${t.qualified} of ${t.newLeads}). The biggest funnel leak is at lead → qualification — either lead quality is low (acquisition is bringing wrong-fit prospects) or your qualification SLA is too slow.`;
    },
    action: () => `Reduce time from lead-in to first qualification touch. Auto-assign leads on creation, require a same-day response SLA, and audit acquisition sources for fit (high volume + low qualification rate = bad source).`,
  },
  {
    id: "spark.lead.qual_rate_healthy",
    category: "qualification",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const t = totals(c);
      return t.newLeads >= 10 && t.qualified / Math.max(1, t.newLeads) >= 0.6;
    },
    observation: (c: any) => {
      const t = totals(c);
      const rate = t.newLeads > 0 ? t.qualified / t.newLeads : 0;
      return `${pct(rate)} qualification rate — strong. Your acquisition sources are aligned with your ideal customer profile + your qualification process is fast. Protect this with continued source-mix discipline.`;
    },
  },

  // ─── Leak / Loss Analysis ─────────────────────────────────────────
  {
    id: "spark.lead.leak_rate_high",
    category: "leak",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const t = totals(c);
      return t.total >= 10 && t.lost / t.total > 0.3;
    },
    observation: (c: any) => {
      const t = totals(c);
      const rate = t.lost / t.total;
      return `${pct(rate)} of leads end in "lost" or "disqualified" (${t.lost} of ${fmt(t.total)}). High lost-share usually clusters around 3 reasons: price, timing, or wrong service area.`;
    },
    action: () => `Tag every lost lead with a reason code (price, timing, scope, no-show, etc.). After ~20 lost leads, the dominant reason becomes obvious and addressable. Wrong-service-area leads suggest a targeting fix; price losses suggest a packaging fix.`,
  },
  {
    id: "spark.lead.no_decisions",
    category: "leak",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const t = totals(c);
      return t.total >= 10 && (t.won + t.lost) === 0;
    },
    observation: (c: any) => {
      const t = totals(c);
      return `${fmt(t.total)} leads in pipeline but 0 decisions (no wins, no losses) this period. Leads are stagnating mid-funnel. Either follow-up cadence is too slow, or there's no clear "decline" stage being applied to leads that go cold.`;
    },
  },

  // ─── Stage Bottleneck Detection ───────────────────────────────────
  {
    id: "spark.lead.contacted_stagnation",
    category: "stage-bottleneck",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const s = getByStatus(c);
      const contacted = Number(s.contacted || 0);
      const qualified = Number(s.qualified || 0);
      return contacted >= 10 && qualified / Math.max(1, contacted) < 0.3;
    },
    observation: (c: any) => {
      const s = getByStatus(c);
      const contacted = Number(s.contacted || 0);
      const qualified = Number(s.qualified || 0);
      const rate = qualified / contacted;
      return `Contacted-to-qualified conversion is ${pct(rate)} (${qualified} of ${contacted}). Leads are getting touched but not advancing — typically a discovery-call quality issue. Either the call isn't asking the right qualifying questions, or the prospects don't fit and should be qualified out earlier.`;
    },
  },
  {
    id: "spark.lead.proposal_to_close",
    category: "stage-bottleneck",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const s = getByStatus(c);
      const proposal = Number(s.proposal_sent || s.proposal || 0);
      const won = Number(s.won || s.converted || 0);
      return proposal >= 5;
    },
    observation: (c: any) => {
      const s = getByStatus(c);
      const proposal = Number(s.proposal_sent || s.proposal || 0);
      const won = Number(s.won || s.converted || 0);
      const rate = proposal > 0 ? won / proposal : 0;
      if (rate < 0.3) return `Proposal-to-close conversion is ${pct(rate)} (${won} closed of ${proposal} proposals sent). Below 30% suggests proposals are reaching too-cold prospects, or proposals themselves aren't compelling. Tighten qualification before quoting; A/B test proposal structure.`;
      if (rate > 0.6) return `Proposal-to-close conversion is ${pct(rate)} — excellent. Either you're qualifying tightly before quoting (efficient) or you're under-pricing. Verify your win rate isn't being driven by leaving money on the table.`;
      return `Proposal-to-close conversion is ${pct(rate)} — within healthy range.`;
    },
  },

  // ─── Pipeline Velocity ────────────────────────────────────────────
  {
    id: "spark.lead.velocity_inferred",
    category: "velocity",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const t = totals(c);
      const days = Number(c.period_days || 30);
      return t.total >= 20 && days >= 14;
    },
    observation: (c: any) => {
      const t = totals(c);
      const days = Number(c.period_days || 30);
      const dailyVolume = (t.total / days).toFixed(1);
      const dailyDecisions = ((t.won + t.lost) / days).toFixed(1);
      return `Lead velocity: ${dailyVolume} new leads + ${dailyDecisions} decisions per day on average. Volume-to-decision ratio (${(Number(dailyVolume) / Math.max(Number(dailyDecisions), 0.1)).toFixed(1)}x) indicates how many days of acquisition feed a single closing decision.`;
    },
  },

  // ─── Source Quality (per-lead) ────────────────────────────────────
  {
    id: "spark.lead.source_unattributed",
    category: "source-quality",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      return sources.some((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
    },
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const unk = sources.find((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
      const total = sources.reduce((a: number, s: any) => a + Number(s.n || 0), 0);
      const share = total > 0 ? Math.round((Number(unk?.n || 0) / total) * 100) : 0;
      return `${share}% of leads have no source attribution. Without source data you can't measure which channels produce the highest-LTV leads — every per-source optimisation is blind until this is fixed.`;
    },
    action: () => `Add UTM parameters to every campaign + ad. Auto-populate a hidden "source" field on every form from UTM or referrer. Default phone/walk-in intake to a known source label (phone, walk-in) instead of letting them land as Unknown.`,
  },

  // ─── Distribution Health ──────────────────────────────────────────
  {
    id: "spark.lead.funnel_distribution",
    category: "distribution",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => totals(c).total >= 20,
    observation: (c: any) => {
      const t = totals(c);
      const newPct = Math.round((t.newLeads / t.total) * 100);
      const qualPct = Math.round((t.qualified / t.total) * 100);
      const wonPct = Math.round((t.won / t.total) * 100);
      const lostPct = Math.round((t.lost / t.total) * 100);
      return `Funnel snapshot: ${newPct}% new · ${qualPct}% qualified · ${wonPct}% won · ${lostPct}% lost. ${newPct > 60 ? "Heavily front-loaded — most leads haven't been worked yet, which means your conversion rates are immature signals." : qualPct > 40 ? "Stacked in qualification — leads are advancing but not closing; check the proposal-to-close path." : "Balanced distribution — your funnel is moving at a healthy rate."}`;
    },
  },

  // ─── Top Loss Source ──────────────────────────────────────────────
  {
    id: "spark.lead.lost_concentration",
    category: "leak",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => totals(c).lost >= 5,
    observation: (c: any) => {
      const t = totals(c);
      return `${t.lost} lead${t.lost === 1 ? " has" : "s have"} been marked lost or disqualified. Sample size is large enough to start finding patterns — review the most recent 10 lost leads, identify the dominant reason, and update qualifying questions to surface that disqualifier earlier.`;
    },
  },

  // ─── Time-to-First-Touch (inferred) ───────────────────────────────
  {
    id: "spark.lead.fast_response_critical",
    category: "response-time",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => totals(c).total >= 10,
    observation: () => `Research from major sales studies shows leads contacted within 5 minutes are ~9x more likely to convert than leads contacted after 30 minutes. If you don't have auto-assignment + same-day-response SLA in place, this is the highest-impact pipeline lever available.`,
  },

  // ─── Pipeline Health Score ────────────────────────────────────────
  {
    id: "spark.lead.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const t = totals(c);
      if (t.total < 20) return false;
      const winRate = (t.won + t.lost) > 0 ? t.won / (t.won + t.lost) : 0;
      const qualRate = t.newLeads > 0 ? t.qualified / t.newLeads : 0;
      const leakRate = t.lost / t.total;
      return winRate >= 0.3 && qualRate >= 0.5 && leakRate < 0.3;
    },
    observation: () => `Pipeline is healthy across all measured dimensions: win rate, qualification rate, and leak rate are all in their target ranges. Focus on volume growth — the funnel is ready to scale.`,
  },

  // ─── Volume Recommendations ───────────────────────────────────────
  {
    id: "spark.lead.low_volume_action",
    category: "volume",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => totals(c).total > 0 && totals(c).total < 10,
    observation: (c: any) => {
      const t = totals(c);
      return `${t.total} total leads — funnel is statistically thin. Every percentage observation here moves dramatically with one or two more conversions, so don't make process changes based on small samples.`;
    },
    action: () => `Stabilise the top of funnel before sweating conversion rates. Turn on at least one always-on lead source: Google Ads on your top service queries, paid social retargeting site visitors, or a referral incentive for current customers.`,
  },

  // ─── Lead → Contact Conversion ────────────────────────────────────
  {
    id: "spark.lead.contact_chain",
    category: "downstream",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const t = totals(c);
      const contacts = Number(c.contact_recent?.new_contacts || 0);
      return t.won >= 3 && contacts >= 3;
    },
    observation: (c: any) => {
      const t = totals(c);
      const contacts = Number(c.contact_recent?.new_contacts || 0);
      const ratio = contacts > 0 ? t.won / contacts : 0;
      return `${t.won} leads won → ${contacts} new contacts in the same period. If every won lead becomes a contact, the ratio approaches 1.0; lower ratios indicate either lost-to-contact-anyway flows or duplicate contact suppression filtering won leads out.`;
    },
  },

  // ─── Specific Loss Reason Patterns ────────────────────────────────
  {
    id: "spark.lead.untouched_warning",
    category: "process",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const s = getByStatus(c);
      const newLeads = Number(s.new || 0) + Number(s.open || 0);
      const t = totals(c);
      return t.total >= 10 && newLeads / t.total > 0.5;
    },
    observation: (c: any) => {
      const s = getByStatus(c);
      const newLeads = Number(s.new || 0) + Number(s.open || 0);
      const t = totals(c);
      const pct2 = Math.round((newLeads / t.total) * 100);
      return `${pct2}% of leads (${newLeads} of ${fmt(t.total)}) are still in "new" or "open" status. Either they're freshly captured this week (acceptable) or they've been sitting untouched (acquisition is outpacing follow-up capacity). Check the age of new-status leads.`;
    },
  },

  // ─── Scale + Benchmark Warning ────────────────────────────────────
  {
    id: "spark.lead.benchmark_unavailable",
    category: "benchmarks",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => totals(c).total > 0 && c.benchmarks?.lead_win_rate_pct == null,
    observation: () => `Industry benchmark data for your service category isn't seeded yet. Win-rate observations compare against a generic 25-30% baseline. As the benchmark dataset populates across the platform, your comparisons will refine automatically.`,
  },
];

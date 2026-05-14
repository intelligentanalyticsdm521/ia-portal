// sparkCampaignPerfRules — v8.2 SPARK "Campaign Performance" insight library.
//
// 22 conditional rules answering: which campaigns are driving engagement
// and bookings, and how is list-hygiene + sender reputation trending?
//
// Data: input.campaign_recent { sends, sent }, input.email_engagement
// array of { event_type, n } where event_type ∈ {sent, delivered, opened,
// clicked, bounced, unsubscribed}.

import { type InsightRule, fmt, pct } from "./insightRules";

function eventsByType(c: any): Record<string, number> {
  const arr = c.email_engagement || [];
  return Object.fromEntries(arr.map((e: any) => [e.event_type, Number(e.n || 0)]));
}

function metrics(c: any) {
  const ev = eventsByType(c);
  const sends = Number(c.campaign_recent?.sent || 0);
  const delivered = Math.max(0, Number(ev.delivered || sends) - Number(ev.bounced || 0));
  const opens = Number(ev.opened || 0);
  const clicks = Number(ev.clicked || 0);
  const bounces = Number(ev.bounced || 0);
  const unsubs = Number(ev.unsubscribed || 0);
  const complaints = Number(ev.complained || ev.spam || 0);
  return {
    sends, delivered, opens, clicks, bounces, unsubs, complaints,
    openRate: delivered > 0 ? opens / delivered : 0,
    clickRate: delivered > 0 ? clicks / delivered : 0,
    clickToOpen: opens > 0 ? clicks / opens : 0,
    bounceRate: sends > 0 ? bounces / sends : 0,
    unsubRate: delivered > 0 ? unsubs / delivered : 0,
    complaintRate: delivered > 0 ? complaints / delivered : 0,
  };
}

export const SPARK_CAMPAIGN_PERF_RULES: InsightRule[] = [
  // ─── Volume / Cadence ─────────────────────────────────────────────
  {
    id: "spark.campaign.no_sends",
    category: "cadence",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.campaign_recent?.sent || 0) === 0,
    observation: () => `No campaigns sent this period. Engagement signals (open rate, click rate, sender reputation) decay quickly without consistent sending — 30+ days of silence starts dragging on Google's send-reputation signal.`,
    action: () => `Send at least one campaign in the next 7 days. A simple newsletter-style update or a service-specific tip works; the goal is to re-establish cadence, not generate immediate conversions.`,
  },
  {
    id: "spark.campaign.send_volume",
    category: "cadence",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => metrics(c).sends > 0,
    observation: (c: any) => {
      const m = metrics(c);
      const days = Number(c.period_days || 30);
      const perWeek = (m.sends / Math.max(days / 7, 1)).toFixed(1);
      if (m.sends < 1000) return `${fmt(m.sends)} emails sent over ${days} days (~${perWeek}/week). Small sending volume — baseline metrics will swing widely with each individual campaign.`;
      if (m.sends < 10000) return `${fmt(m.sends)} emails sent over ${days} days (~${perWeek}/week). Meaningful volume; per-campaign A/B tests start to produce statistically reliable signals.`;
      return `${fmt(m.sends)} emails sent over ${days} days. Large-scale sending — deliverability discipline (sender warmup, list segmentation, engagement-based suppression) is now the single biggest lever.`;
    },
  },

  // ─── Open Rate ────────────────────────────────────────────────────
  {
    id: "spark.campaign.open_rate_low",
    category: "open-rate",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && m.openRate < 0.18;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Open rate is ${pct(m.openRate)} — below the 20-25% service-business benchmark. Either subject lines aren't pulling open, sender reputation has decayed, or campaigns are landing in promotional/spam folders. Apple Mail Privacy Protection inflates raw open rates ~20%, so true engagement is likely worse than displayed.`;
    },
    action: () => `A/B test 3 subject-line variants on your next campaign: emoji vs no emoji, question vs declarative, personalised vs generic. Run deliverability check on Sender Domains page to verify SPF/DKIM/DMARC are aligned.`,
  },
  {
    id: "spark.campaign.open_rate_healthy",
    category: "open-rate",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && m.openRate >= 0.25;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Open rate is ${pct(m.openRate)} — above industry baseline. Subject lines + sender reputation are working. Protect this with disciplined list hygiene: suppress non-openers after 6 months of silence.`;
    },
  },
  {
    id: "spark.campaign.open_rate_vs_benchmark",
    category: "open-rate",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && c.benchmarks?.email_open_rate_pct != null;
    },
    observation: (c: any) => {
      const m = metrics(c);
      const bench = Number(c.benchmarks?.email_open_rate_pct || 22);
      const actual = m.openRate * 100;
      const gap = actual - bench;
      if (Math.abs(gap) < 2) return "";
      if (gap > 0) return `Open rate (${actual.toFixed(1)}%) exceeds your industry benchmark (${bench}%) by ${gap.toFixed(1)} points. Sustained outperformance compounds over time as ISPs reward your engagement signals.`;
      return `Open rate (${actual.toFixed(1)}%) is ${Math.abs(gap).toFixed(1)} points below your industry benchmark (${bench}%). Closing this gap is your highest-leverage email move; small subject-line improvements drive measurable lift.`;
    },
  },

  // ─── Click Rate ───────────────────────────────────────────────────
  {
    id: "spark.campaign.click_rate_low",
    category: "click-rate",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && m.clickRate < 0.02;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Click rate is ${pct(m.clickRate)} — below the 2-3% baseline. Recipients are receiving + opening but not engaging with content. Either CTAs are buried, too generic, or recipients don't see relevant offers.`;
    },
    action: () => `Move your primary CTA above the fold on every template. Use a single action-verb button label ("Book a quote", not "Learn more"). Cut secondary links to 1-2 per email maximum.`,
  },
  {
    id: "spark.campaign.click_rate_vs_benchmark",
    category: "click-rate",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && c.benchmarks?.email_click_rate_pct != null;
    },
    observation: (c: any) => {
      const m = metrics(c);
      const bench = Number(c.benchmarks?.email_click_rate_pct || 3.5);
      const actual = m.clickRate * 100;
      const gap = actual - bench;
      if (Math.abs(gap) < 0.5) return "";
      if (gap > 0) return `Click rate (${actual.toFixed(2)}%) exceeds your industry benchmark (${bench}%) by ${gap.toFixed(2)} points. Strong CTA conversion — protect this with template consistency.`;
      return `Click rate (${actual.toFixed(2)}%) is ${Math.abs(gap).toFixed(2)} points below your industry benchmark (${bench}%). Lift comes from CTA placement + clarity, not from increasing send frequency.`;
    },
  },

  // ─── Click-to-Open Rate ───────────────────────────────────────────
  {
    id: "spark.campaign.ctor_low",
    category: "engagement-quality",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.opens >= 50 && m.clickToOpen < 0.10;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Click-to-open rate is ${pct(m.clickToOpen)} (${m.clicks} clicks from ${m.opens} opens). Recipients open but find no compelling reason to act. CTOR is the cleanest measure of content-to-CTA fit — under 10% means the email isn't earning the click after winning the open.`;
    },
    action: () => `Audit your top 3 campaign templates for above-fold CTA placement and 1-CTA-only design. Remove links that distract from the primary action.`,
  },
  {
    id: "spark.campaign.ctor_strong",
    category: "engagement-quality",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.opens >= 50 && m.clickToOpen >= 0.20;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Click-to-open rate is ${pct(m.clickToOpen)} — strong CTA conversion. Recipients who open are engaging with content. Replicate the winning template structures across other campaigns.`;
    },
  },

  // ─── Deliverability / List Hygiene ────────────────────────────────
  {
    id: "spark.campaign.bounce_rate_critical",
    category: "deliverability",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && m.bounceRate > 0.05;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Bounce rate is ${pct(m.bounceRate)} (${fmt(m.bounces)} of ${fmt(m.sends)}) — critical. Above 5% triggers ISP throttling and accelerates sender-reputation decay. Continued sending in this state risks landing future campaigns in spam folders permanently.`;
    },
    action: () => `Pause sending immediately. Suppress all hard-bounced addresses, run a list validation service (e.g. NeverBounce, ZeroBounce) on the remaining list, and only resume sending to validated addresses. Sender reputation recovery takes 2-4 weeks.`,
  },
  {
    id: "spark.campaign.bounce_rate_warning",
    category: "deliverability",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 100 && m.bounceRate > 0.02 && m.bounceRate <= 0.05;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Bounce rate is ${pct(m.bounceRate)} — above the 2% list-hygiene threshold. Continued sending at this rate erodes sender reputation over weeks. Suppress hard-bounced addresses immediately.`;
    },
    action: () => `Set up an automation that suppresses hard-bounced addresses on the first bounce. For soft bounces, suppress after 3 consecutive bounces on the same address.`,
  },
  {
    id: "spark.campaign.unsub_rate_high",
    category: "deliverability",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.delivered >= 200 && m.unsubRate > 0.005;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Unsubscribe rate is ${pct(m.unsubRate, 2)} — above the 0.5% threshold where subscribers are signalling content fatigue. Either frequency is too high, content isn't aligned to subscriber expectations, or you're sending to a too-broad audience without segmentation.`;
    },
    action: () => `Reduce send frequency or segment more tightly (don't send promo to everyone). Add a "manage preferences" link letting subscribers downgrade frequency instead of unsubscribing outright.`,
  },
  {
    id: "spark.campaign.complaint_rate_critical",
    category: "deliverability",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.delivered >= 200 && m.complaintRate > 0.001;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Spam-complaint rate is ${pct(m.complaintRate, 3)} — above the 0.1% ISP-imposed deliverability threshold. Continued sending at this rate causes major ISPs (Gmail, Outlook) to bulk-mark your sender as spam. Sender reputation damage compounds daily.`;
    },
    action: () => `Pause all promotional sends. Send only transactional / explicitly-requested mail until complaint rate falls below 0.1%. Audit your list source — most complaint spikes trace to a single bad acquisition source.`,
  },
  {
    id: "spark.campaign.deliverability_healthy",
    category: "deliverability",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 200 && m.bounceRate < 0.02 && m.unsubRate < 0.003 && m.complaintRate < 0.0005;
    },
    observation: () => `Deliverability signals are all in healthy ranges: bounce rate, unsubscribe rate, complaint rate all below industry thresholds. Sender reputation is in good standing.`,
  },

  // ─── Engagement-to-Conversion Bridge ──────────────────────────────
  {
    id: "spark.campaign.opens_no_clicks",
    category: "engagement-quality",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.opens >= 50 && m.clicks === 0;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `${fmt(m.opens)} opens but zero clicks this period. Either there are no clickable links in your sends (newsletters with no CTA?), or click tracking isn't configured. Verify your campaign templates include trackable links.`;
    },
  },

  // ─── Apple MPP Awareness ──────────────────────────────────────────
  {
    id: "spark.campaign.mpp_caveat",
    category: "tracking-quality",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => metrics(c).opens >= 100,
    observation: () => `Apple Mail Privacy Protection (MPP) pre-fetches images on every email it delivers, inflating raw "open" counts by ~15-25%. Click-to-open and click rate are more reliable engagement metrics than open rate alone since iOS 15+.`,
  },

  // ─── List Engagement Decay ────────────────────────────────────────
  {
    id: "spark.campaign.engagement_tier",
    category: "list-health",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => metrics(c).sends >= 100,
    observation: (c: any) => {
      const m = metrics(c);
      const engagedPct = m.delivered > 0 ? ((m.opens + m.clicks) / m.delivered) * 100 : 0;
      if (engagedPct < 15) return `Combined engagement (opens + clicks ÷ delivered) is ${engagedPct.toFixed(1)}%. Your list is signalling decay — re-engagement campaign + non-opener suppression is overdue.`;
      if (engagedPct < 30) return `Combined engagement is ${engagedPct.toFixed(1)}% — average. Quarterly re-engagement campaigns + suppression of multi-month non-openers keeps the list healthy.`;
      return `Combined engagement is ${engagedPct.toFixed(1)}% — strong. Continue current sending discipline.`;
    },
  },

  // ─── Send-Frequency Cadence ───────────────────────────────────────
  {
    id: "spark.campaign.too_frequent",
    category: "cadence",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      const days = Number(c.period_days || 30);
      const recipients = m.delivered;
      if (recipients < 100 || days < 14) return false;
      const sendsPerRecipient = m.sends / recipients;
      // If sends/recipient > 4 in 30 days, likely > weekly cadence
      return sendsPerRecipient > 4 && m.unsubRate > 0.005;
    },
    observation: (c: any) => {
      const m = metrics(c);
      const days = Number(c.period_days || 30);
      const recipients = m.delivered;
      const perRecip = (m.sends / recipients).toFixed(1);
      return `Average ${perRecip} emails per recipient over ${days} days — higher than weekly cadence. Combined with elevated unsubscribe rate, this suggests subscribers feel over-mailed. Consider reducing frequency or segmenting more tightly.`;
    },
    action: () => `Cut send frequency in half on your next campaign and watch open/unsub rates. Often a single high-value monthly email outperforms 4 frequent low-value ones.`,
  },

  // ─── Engagement Concentration ─────────────────────────────────────
  {
    id: "spark.campaign.openers_only_warning",
    category: "engagement-quality",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.opens >= 100 && m.clickToOpen < 0.05;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `Click-to-open is ${pct(m.clickToOpen)} — extremely low. Recipients are opening but finding nothing actionable. Either your emails are pure informational (no CTAs needed?) or the CTAs are invisible. Audit the last 3 templates for above-the-fold action buttons.`;
    },
  },

  // ─── Scale Warning ────────────────────────────────────────────────
  {
    id: "spark.campaign.low_sample",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => metrics(c).sends > 0 && metrics(c).sends < 100,
    observation: (c: any) => {
      const m = metrics(c);
      return `${m.sends} emails sent — small sample. Engagement rates calculated here will swing widely with each individual campaign. Statistically meaningful A/B testing requires ~500+ sends per variant.`;
    },
  },

  // ─── Summary Health ───────────────────────────────────────────────
  {
    id: "spark.campaign.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 200 && m.openRate >= 0.22 && m.clickRate >= 0.03 && m.bounceRate < 0.02 && m.unsubRate < 0.005;
    },
    observation: () => `All campaign-performance signals are healthy: open rate above benchmark, click rate above benchmark, deliverability metrics clean. Focus optimisation on segment-specific campaigns rather than broadcast tweaks.`,
  },

  // ─── Specific Channels ────────────────────────────────────────────
  {
    id: "spark.campaign.no_engagement_events",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const m = metrics(c);
      return m.sends >= 50 && m.opens === 0 && m.clicks === 0;
    },
    observation: (c: any) => {
      const m = metrics(c);
      return `${fmt(m.sends)} sends recorded but zero open/click events. Either tracking pixels aren't loading (image-blocking), engagement events aren't being received by SPARK, or all emails are bouncing/spam-foldering. Check the email-event webhook + recent delivery logs.`;
    },
    action: () => `Verify SPF/DKIM/DMARC alignment on Sender Domains page. Send a test campaign to your own email + a Gmail + an Outlook address; confirm each one opens, the open event reaches SPARK, and a tracked link click reaches SPARK.`,
  },
];

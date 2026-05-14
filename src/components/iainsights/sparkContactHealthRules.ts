// sparkContactHealthRules — v8.0 SPARK "Contact Health" insight library.
//
// 22 conditional rules answering: is my contact base growing, active,
// reachable, and clean?
//
// Data sources (from LUMEN-API /api/v1/ia-insights/inputs?product=spark):
//   - contact_totals: { total, active, with_email, with_phone, sms_opt_outs }
//   - contact_recent: { new_contacts }
//   - top_sources: top acquisition sources
//   - top_tags: tag distribution
//   - benchmarks: industry benchmark dataset
//
// Categories: growth · coverage (email/phone) · cleanliness · source mix ·
// tagging · benchmarks · data gaps · scale.
//
// SPARK rule context shape differs from ARION — SPARK uses a flat ctx
// object with the same keys as SparkEngineInput plus optional benchmarks.

import { type InsightRule, fmt, pct } from "./insightRules";

export const SPARK_CONTACT_HEALTH_RULES: InsightRule[] = [
  // ─── Growth ───────────────────────────────────────────────────────
  {
    id: "spark.contact.growth_rate",
    category: "growth",
    kind: "observation",
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.contact_totals?.active || 0) > 0,
    observation: (c: any) => {
      const totals = c.contact_totals || {};
      const recent = Number(c.contact_recent?.new_contacts || 0);
      const active = Number(totals.active || 0);
      const days = Number(c.period_days || 30);
      const rate = active > 0 ? (recent / active) * 100 : 0;
      if (recent === 0) return `Zero new contacts in the last ${days} days — your acquisition funnel is dry. Either no inbound forms are firing, or forms exist but aren't capturing visitor info. Audit the top 3 entry-page forms first.`;
      if (rate < 2) return `${fmt(recent)} new contacts in ${days} days — a ${rate.toFixed(1)}% growth rate. Below the 5% benchmark for service businesses; at this pace it takes ~20 months to double your base.`;
      if (rate < 10) return `${fmt(recent)} new contacts in ${days} days — ${rate.toFixed(1)}% growth rate. Healthy and sustainable.`;
      return `${fmt(recent)} new contacts in ${days} days — ${rate.toFixed(1)}% growth rate. Exceptional; verify quality (engagement rate per cohort) hasn't dropped to compensate.`;
    },
  },
  {
    id: "spark.contact.no_recent",
    category: "growth",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) =>
      Number(c.contact_totals?.active || 0) > 0 &&
      Number(c.contact_recent?.new_contacts || 0) === 0,
    observation: () => `No new contacts captured this period. The acquisition channel is broken or paused — every day of dry pipeline compounds into a lower revenue floor 60-90 days out.`,
    action: () => `Verify your top 3 forms fire submissions to SPARK. Check the IA Plugin connection on the website, the form-submit webhook in WordPress, and inspect the most recent inbound webhook delivery in SPARK Admin.`,
  },

  // ─── Coverage ─────────────────────────────────────────────────────
  {
    id: "spark.contact.email_coverage",
    category: "coverage",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.contact_totals?.active || 0) > 10,
    observation: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const withEmail = Number(t.with_email || 0);
      const cov = active > 0 ? withEmail / active : 0;
      if (cov < 0.5) return `${pct(cov)} email coverage (${withEmail} of ${active} active contacts have an email). Below the 50% floor where email becomes an unreliable channel; your campaigns are reaching less than half your audience.`;
      if (cov < 0.7) return `${pct(cov)} email coverage. Below the 70% floor where email is considered reliable. Each form should require an email; manual data entry should default-prompt for it.`;
      if (cov < 0.9) return `${pct(cov)} email coverage — solid. Most contacts are reachable by email; close the remaining gap on intake.`;
      return `${pct(cov)} email coverage — excellent. Email is a fully reliable channel; protect this with double-opt-in on all new sources.`;
    },
    action: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const cov = active > 0 ? Number(t.with_email || 0) / active : 0;
      if (cov >= 0.7) return "";
      return `Make email required on your top 3 highest-traffic forms. For phone-only inbound contacts (calls, walk-ins), train staff to request email at first interaction.`;
    },
  },
  {
    id: "spark.contact.phone_coverage",
    category: "coverage",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.contact_totals?.active || 0) > 10,
    observation: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const withPhone = Number(t.with_phone || 0);
      const cov = active > 0 ? withPhone / active : 0;
      if (cov < 0.3) return `Phone coverage is ${pct(cov)} — only ${withPhone} of ${active} contacts have a phone. SMS is the highest-converting outbound channel for service businesses (4-7x email conversion). Collect phone numbers on all intake forms.`;
      if (cov < 0.6) return `Phone coverage is ${pct(cov)}. Adequate to start SMS campaigns; expanding coverage compounds your reachable audience.`;
      return `Phone coverage is ${pct(cov)} — strong. SMS is fully viable as a primary channel.`;
    },
  },
  {
    id: "spark.contact.both_channels",
    category: "coverage",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const both = Math.min(Number(t.with_email || 0), Number(t.with_phone || 0));
      return active > 20 && both > 0;
    },
    observation: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const withEmail = Number(t.with_email || 0);
      const withPhone = Number(t.with_phone || 0);
      // Approximation: assume independence; min represents an upper bound on overlap
      const overlap = Math.round((withEmail / active) * (withPhone / active) * active);
      const dualPct = active > 0 ? Math.round((overlap / active) * 100) : 0;
      return `Approximately ${dualPct}% of contacts are reachable on both email and phone — your multi-channel audience. Multi-channel campaigns (email + SMS reminder) typically lift response rates 30-50% over single-channel.`;
    },
  },

  // ─── Cleanliness ──────────────────────────────────────────────────
  {
    id: "spark.contact.opt_out_rate",
    category: "cleanliness",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.contact_totals?.with_phone || 0) > 20,
    observation: (c: any) => {
      const t = c.contact_totals || {};
      const phone = Number(t.with_phone || 0);
      const opts = Number(t.sms_opt_outs || 0);
      const rate = phone > 0 ? opts / phone : 0;
      if (rate > 0.1) return `${fmt(opts)} contacts (${pct(rate)}) have opted out of SMS. Above 10% indicates frequency or content is alienating subscribers. Pause non-essential SMS campaigns and review your last 30 days of sends.`;
      if (rate > 0.05) return `${fmt(opts)} contacts (${pct(rate)}) have opted out of SMS. Approaching the 5-10% warning zone; review your SMS cadence + content quality.`;
      return `SMS opt-out rate is ${pct(rate)} — healthy. Subscribers are tolerating your cadence.`;
    },
    action: (c: any) => {
      const t = c.contact_totals || {};
      const phone = Number(t.with_phone || 0);
      const opts = Number(t.sms_opt_outs || 0);
      const rate = phone > 0 ? opts / phone : 0;
      if (rate < 0.05) return "";
      return `Audit your last 30 days of SMS sends. Reduce frequency, segment more tightly (don't send promo to everyone), and add more value per message (tips, reminders, status updates over offers).`;
    },
  },
  {
    id: "spark.contact.inactive_ratio",
    category: "cleanliness",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const t = c.contact_totals || {};
      const total = Number(t.total || 0);
      const active = Number(t.active || 0);
      return total > 50 && active / total < 0.7;
    },
    observation: (c: any) => {
      const t = c.contact_totals || {};
      const total = Number(t.total || 0);
      const active = Number(t.active || 0);
      const inactivePct = total > 0 ? Math.round(((total - active) / total) * 100) : 0;
      return `${inactivePct}% of your contact base is inactive (${fmt(total - active)} of ${fmt(total)} total). Inactive contacts drag down send rates and add to your billable contact count without producing engagement. Quarterly suppress + archive cleanup keeps the active pool focused.`;
    },
  },

  // ─── Source Mix ───────────────────────────────────────────────────
  {
    id: "spark.contact.source_concentration",
    category: "source-mix",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length > 0,
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, x: any) => s + Number(x.n || 0), 0);
      const top = sources[0];
      const share = total > 0 ? Math.round((Number(top.n || 0) / total) * 100) : 0;
      if (share > 70) return `${share}% of contacts come from a single source (${top.source}). Concentration risk — if that channel slows, your acquisition stops. Diversify with at least one additional source for resilience.`;
      if (share > 40) return `Your top source (${top.source}) accounts for ${share}% of contacts — healthy primary channel without over-concentration.`;
      return `Sources are well-distributed — your top source (${top.source}) is only ${share}% of contacts. Multi-channel acquisition is more resilient but harder to optimise per-channel.`;
    },
  },
  {
    id: "spark.contact.unattributed",
    category: "source-mix",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      return sources.some((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
    },
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const unk = sources.find((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
      const total = sources.reduce((s: number, x: any) => s + Number(x.n || 0), 0);
      const share = total > 0 ? Math.round((Number(unk?.n || 0) / total) * 100) : 0;
      return `${share}% of contacts (${fmt(Number(unk?.n || 0))}) have no source attribution. Without source data you can't measure channel ROI or compare LTV by acquisition channel — fixing this is the single most leverage data hygiene investment.`;
    },
    action: () => `Add a hidden "source" field to every form (auto-populate from UTM or referrer). For phone/walk-in intake, default the source to "phone" or "walk-in" so nothing lands as Unknown.`,
  },
  {
    id: "spark.contact.top_source_active_rate",
    category: "source-mix",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length >= 2,
    observation: (c: any) => {
      const sources = (c.top_sources || []).filter((s: any) => Number(s.n) >= 5);
      if (sources.length < 2) return "";
      const ranked = sources
        .map((s: any) => ({ name: s.source, total: Number(s.n), active: Number(s.active_count || 0), rate: Number(s.n) > 0 ? Number(s.active_count || 0) / Number(s.n) : 0 }))
        .sort((a: any, b: any) => b.rate - a.rate);
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      if (best.rate - worst.rate < 0.1) return "";
      return `Quality varies across sources: ${best.name} produces ${pct(best.rate)} active contacts, ${worst.name} produces ${pct(worst.rate)}. Shifting acquisition spend toward higher-quality sources compounds your active pool faster than growing volume on lower-quality channels.`;
    },
  },

  // ─── Tagging ──────────────────────────────────────────────────────
  {
    id: "spark.contact.untagged_dominance",
    category: "tagging",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const tags = c.top_tags || [];
      const active = Number(c.contact_totals?.active || 0);
      const taggedTotal = tags.reduce((s: number, t: any) => s + Number(t.n || 0), 0);
      return active > 20 && taggedTotal < active * 0.5;
    },
    observation: (c: any) => {
      const tags = c.top_tags || [];
      const active = Number(c.contact_totals?.active || 0);
      const taggedTotal = tags.reduce((s: number, t: any) => s + Number(t.n || 0), 0);
      const untaggedPct = active > 0 ? Math.round(((active - taggedTotal) / active) * 100) : 0;
      return `Approximately ${untaggedPct}% of your active contacts have no tags. Tags are how SPARK segments — untagged contacts can't be targeted by behavior, intent, or service interest. Auto-tag rules (by source, form, service category) close this gap without manual work.`;
    },
    action: () => `Set up auto-tag rules: tag by source (organic_search, paid_search, referral), by lead form (estimate_form, service_form), and by service interest based on the page the form was on. Set + forget; tags accumulate over time.`,
  },
  {
    id: "spark.contact.top_tag",
    category: "tagging",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Array.isArray(c.top_tags) && c.top_tags.length > 0,
    observation: (c: any) => {
      const top = c.top_tags[0];
      return `Your most-applied tag is "${top.name}" with ${fmt(Number(top.n))} contacts. Use this tag's audience as a baseline for segment quality + engagement comparisons.`;
    },
  },

  // ─── Benchmarks ───────────────────────────────────────────────────
  {
    id: "spark.contact.vs_benchmark",
    category: "benchmarks",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const bench = c.benchmarks?.contact_growth_rate_pct;
      const active = Number(c.contact_totals?.active || 0);
      const recent = Number(c.contact_recent?.new_contacts || 0);
      return bench != null && active > 0 && recent > 0;
    },
    observation: (c: any) => {
      const bench = Number(c.benchmarks?.contact_growth_rate_pct || 5);
      const active = Number(c.contact_totals?.active || 0);
      const recent = Number(c.contact_recent?.new_contacts || 0);
      const days = Number(c.period_days || 30);
      // Normalize benchmark to a period rate (benchmark is monthly)
      const periodBench = bench * (days / 30);
      const actual = (recent / active) * 100;
      const gap = actual - periodBench;
      if (gap >= 2) return `Your contact growth (${actual.toFixed(1)}% over ${days} days) exceeds your industry benchmark (${periodBench.toFixed(1)}%) by ${gap.toFixed(1)} points. Above-benchmark acquisition is a sustained competitive advantage if you can hold it.`;
      if (gap < -2) return `Your contact growth (${actual.toFixed(1)}% over ${days} days) is ${Math.abs(gap).toFixed(1)} points below your industry benchmark (${periodBench.toFixed(1)}%). The gap is recoverable — usually through stronger acquisition channels or higher-converting forms.`;
      return `Your contact growth matches the industry benchmark for your category (${periodBench.toFixed(1)}%). Sustained matching is fine; pulling ahead requires a deliberate acquisition investment.`;
    },
  },

  // ─── Volume Tiers ─────────────────────────────────────────────────
  {
    id: "spark.contact.volume_tier",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.contact_totals?.active || 0) >= 0,
    observation: (c: any) => {
      const active = Number(c.contact_totals?.active || 0);
      if (active === 0) return `Zero active contacts in SPARK. Either contacts haven't been imported, forms aren't capturing yet, or all contacts have been archived. Start with the contact-import wizard or check the inbound-webhook log.`;
      if (active < 50) return `${active} active contacts — early stage. At this volume, every contact matters; manual triage is still tractable. Focus on growing volume to 200+ before investing in segmentation.`;
      if (active < 500) return `${active} active contacts — early scale. Segmentation becomes statistically meaningful around 200+; you can begin A/B testing campaign performance with reasonable confidence.`;
      if (active < 5000) return `${fmt(active)} active contacts — meaningful scale. Automations, RFM segmentation, and per-source attribution all become reliable signals. Invest in segment-specific campaigns over broadcast.`;
      return `${fmt(active)} active contacts — large list. The challenge shifts from acquisition to deliverability + engagement health; ISPs throttle senders with poor engagement-per-send ratios.`;
    },
  },

  // ─── Specific Signals ─────────────────────────────────────────────
  {
    id: "spark.contact.email_only_warning",
    category: "coverage",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const phone = Number(t.with_phone || 0);
      return active > 30 && phone / active < 0.2;
    },
    observation: () => `Your contact base is functionally email-only — under 20% have phone numbers. This caps your channel mix at email and limits the reactivation playbook (SMS is the most effective re-engagement tool). Add phone as a strongly-encouraged field on next forms.`,
  },
  {
    id: "spark.contact.phone_only_warning",
    category: "coverage",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const email = Number(t.with_email || 0);
      return active > 30 && email / active < 0.3;
    },
    observation: () => `Your contact base is heavily phone-only — under 30% have emails. SMS is high-converting but you have no email channel for longer-form nurture sequences. Even capturing emails from your top tier (champions + recent customers) opens a higher-margin retention channel.`,
  },

  // ─── Newsletter / Welcome Coverage ────────────────────────────────
  {
    id: "spark.contact.no_welcome_automation",
    category: "automation-hooks",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const auto = c.automations;
      const active = Number(c.contact_totals?.active || 0);
      return active > 50 && (!auto || Number(auto.active || 0) === 0);
    },
    observation: () => `No active automations on a ${fmt(0)}+ contact base means new contacts get no welcome sequence + nurture path. The first 14 days after capture are the highest-engagement window — without an automated sequence, that window is wasted.`,
    action: () => `Build a 3-email welcome sequence: (1) welcome + about, (2) most valuable resource, (3) "here's how to get started / book a service." Trigger on contact creation; ~70% of contacts will open at least one.`,
  },

  // ─── Recency ──────────────────────────────────────────────────────
  {
    id: "spark.contact.engagement_window",
    category: "engagement",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const eng = c.email_engagement || [];
      const opens = eng.find((e: any) => /open/i.test(e.event_type));
      return Number(opens?.n || 0) > 0;
    },
    observation: (c: any) => {
      const eng = c.email_engagement || [];
      const opens = Number(eng.find((e: any) => /open/i.test(e.event_type))?.n || 0);
      const sends = Number(eng.find((e: any) => /sent|send/i.test(e.event_type))?.n || 0);
      const openRate = sends > 0 ? (opens / sends) * 100 : 0;
      if (openRate < 15) return `Email open rate is ${openRate.toFixed(1)}% — below the 20-25% industry baseline. Either your list is stale (re-engagement campaign needed), your subject lines are weak, or sends are hitting promotional/spam folders. Deliverability monitoring will isolate which.`;
      if (openRate < 25) return `Email open rate is ${openRate.toFixed(1)}% — at industry baseline. Subject-line A/B tests + segmented send lists typically lift this by 3-5 points.`;
      return `Email open rate is ${openRate.toFixed(1)}% — above industry baseline. Your subject lines + sender reputation are working; protect this with disciplined list hygiene (suppress non-openers after 6 months).`;
    },
  },

  // ─── Data Gaps ────────────────────────────────────────────────────
  {
    id: "spark.contact.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => !c.contact_totals || Number(c.contact_totals.active || 0) === 0,
    observation: () => `SPARK has no active contacts to analyse. Either you're brand new and haven't imported / captured any yet, or the contact-source pipeline isn't firing. Start with the contact-import wizard or verify the inbound-webhook receives form submissions.`,
    action: () => `If migrating from another CRM: use the CSV import wizard. If starting fresh: connect ARION form submissions or wire a webhook from your lead source. Either path should populate contacts within minutes.`,
  },
  {
    id: "spark.contact.scale_warning",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => {
      const active = Number(c.contact_totals?.active || 0);
      return active > 0 && active < 50;
    },
    observation: (c: any) => {
      const active = Number(c.contact_totals?.active || 0);
      return `${active} active contacts — small base. Patterns observed here are directional; statistically meaningful campaign optimisation typically requires 200+ contacts. Focus on volume growth first.`;
    },
  },

  // ─── Health Summary ───────────────────────────────────────────────
  {
    id: "spark.contact.health_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const t = c.contact_totals || {};
      const active = Number(t.active || 0);
      const email = Number(t.with_email || 0);
      const phone = Number(t.with_phone || 0);
      return active > 50 && (email / active) >= 0.7 && (phone / active) >= 0.5;
    },
    observation: () => `Your contact base is healthy across all measured dimensions: active volume above the noise floor, email + phone coverage both above the reliable-channel thresholds. Focus optimisation on engagement quality (open rates, click rates) rather than list hygiene.`,
  },
];

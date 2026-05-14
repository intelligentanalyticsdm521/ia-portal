// sparkRemainingRules — v8.3 Marketing Attribution + Customer Segmentation +
// Automation Effectiveness + Retention Risk + Revenue Attribution.
//
// Five SPARK rule libraries in one file. Each ~15-18 conditional rules
// covering the report-specific data points. Closes out the SPARK
// migration: all 8 reports now have rule-library-driven observations.

import { type InsightRule, fmt, pct } from "./insightRules";

// ════════════════════════════════════════════════════════════════════
// 1. MARKETING ATTRIBUTION (15 rules)
// ════════════════════════════════════════════════════════════════════

export const SPARK_MARKETING_ATTRIB_RULES: InsightRule[] = [
  {
    id: "spark.mktg.no_sources",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => !Array.isArray(c.top_sources) || c.top_sources.length === 0,
    observation: () => `No sourced contacts in the period. Either nothing is tagging the source field or your acquisition channels have stopped producing. Inspect inbound webhooks and UTM capture on every form.`,
    action: () => `Audit every form for a hidden "source" field auto-populated from UTM/referrer. Add default source labels for non-web channels (phone, walk-in, referral) so nothing lands as Unknown.`,
  },
  {
    id: "spark.mktg.top_source",
    category: "leadership",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length > 0,
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const top = sources[0];
      const share = total > 0 ? Number(top.n || 0) / total : 0;
      return `Leading acquisition source: ${top.source} (${fmt(Number(top.n))} contacts · ${pct(share)} share of ${fmt(total)} total).`;
    },
  },
  {
    id: "spark.mktg.concentration_risk",
    category: "risk",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      if (!sources.length) return false;
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return total > 0 && Number(sources[0].n || 0) / total > 0.6;
    },
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const top = sources[0];
      const share = total > 0 ? Number(top.n || 0) / total : 0;
      return `${pct(share)} of contacts come from a single channel (${top.source}). A change in that channel's algorithm or pricing would halve your inbound flow overnight.`;
    },
    action: () => `Invest in one channel currently under 10% of mix (referral, partnerships, organic content). Even slow growth on a backup channel materially reduces single-channel risk.`,
  },
  {
    id: "spark.mktg.diversity_healthy",
    category: "diversity",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length >= 5,
    observation: (c: any) => `${c.top_sources.length} active acquisition sources — healthy channel diversity. Multi-source acquisition is more resilient but harder to optimise per-channel; ensure each top source has owner accountability.`,
  },
  {
    id: "spark.mktg.second_source",
    category: "diversity",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length >= 2,
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const second = sources[1];
      const share = total > 0 ? Number(second.n || 0) / total : 0;
      return `Second-leading source (${second.source}) carries ${pct(share)} of new contacts — your reliable backup channel.`;
    },
  },
  {
    id: "spark.mktg.unattributed_share",
    category: "data-quality",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      return sources.some((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
    },
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const unk = sources.find((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const share = total > 0 ? Math.round((Number(unk?.n || 0) / total) * 100) : 0;
      return `${share}% of contacts have no source attribution. Every per-source ROI calculation is blind on that slice — closing this gap is the highest-leverage data-hygiene investment.`;
    },
    action: () => `Add UTM parameters to every campaign + ad. Auto-populate a hidden source field on every form. For non-web channels, default to a known label instead of Unknown.`,
  },
  {
    id: "spark.mktg.long_tail",
    category: "diversity",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length >= 8,
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const top5 = sources.slice(0, 5).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const top5Share = total > 0 ? (top5 / total) * 100 : 0;
      return `Long-tail acquisition: ${sources.length} sources tracked, top 5 = ${Math.round(top5Share)}% of volume. Long-tail channels add resilience but each typically needs a dedicated owner to optimise.`;
    },
  },
  {
    id: "spark.mktg.volume_low",
    category: "volume",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return total > 0 && total < 20;
    },
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return `${total} contacts sourced this period — low volume. At this scale, percentage shifts in source mix are statistical noise; focus on stabilising at least one always-on channel.`;
    },
    action: () => `Activate one always-on lead source: even $200/month Google Ads at $50 CPL → 4 contacts/month produces a measurable baseline.`,
  },
  {
    id: "spark.mktg.active_rate_variance",
    category: "quality",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const sources = (c.top_sources || []).filter((s: any) => Number(s.n) >= 5);
      return sources.length >= 2;
    },
    observation: (c: any) => {
      const sources = (c.top_sources || []).filter((s: any) => Number(s.n) >= 5);
      const ranked = sources
        .map((s: any) => ({ name: s.source, rate: Number(s.n) > 0 ? Number(s.active_count || 0) / Number(s.n) : 0 }))
        .sort((a: any, b: any) => b.rate - a.rate);
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      if (best.rate - worst.rate < 0.15) return "";
      return `Source quality varies: ${best.name} produces ${pct(best.rate)} active contacts, ${worst.name} produces ${pct(worst.rate)}. Shift acquisition spend toward higher-quality channels rather than scaling lower-quality ones.`;
    },
  },
  {
    id: "spark.mktg.organic_search_present",
    category: "channels",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => (c.top_sources || []).some((s: any) => /organic|seo|google$/i.test(s.source || "")),
    observation: () => `Organic search is in your top sources — compounding acquisition channel with the lowest long-run CAC. Each ranking position you hold continues paying out without fresh ad spend.`,
  },
  {
    id: "spark.mktg.paid_search_present",
    category: "channels",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => (c.top_sources || []).some((s: any) => /paid|adword|google.?ads|sem/i.test(s.source || "")),
    observation: () => `Paid search is in your top sources — fastest channel to scale (turn on budget = contacts), but acquisition stops the day spend stops. Pair with organic + referral for resilience.`,
  },
  {
    id: "spark.mktg.referral_present",
    category: "channels",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => (c.top_sources || []).some((s: any) => /referral|partner|word.?of.?mouth/i.test(s.source || "")),
    observation: () => `Referral is in your top sources — typically the highest-LTV channel for service businesses (referrals close 2-3x faster than cold leads). Build a structured referral incentive program to scale this beyond word-of-mouth.`,
  },
  {
    id: "spark.mktg.no_paid_channels",
    category: "channels",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      return sources.length >= 2 && !sources.some((s: any) => /paid|adword|google.?ads|sem|facebook|instagram|meta/i.test(s.source || ""));
    },
    observation: () => `No paid channels in your top sources. Service businesses typically use paid acquisition as a demand-stabiliser (paid baseline + organic compounder). Adding even a small always-on paid budget creates a controllable lever for slow weeks.`,
  },
  {
    id: "spark.mktg.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Array.isArray(c.top_sources) && c.top_sources.length > 0,
    observation: () => `Combine this with Revenue Attribution (last report) to identify which channels actually produce LTV, not just volume. Volume-leaders aren't always revenue-leaders.`,
  },
  {
    id: "spark.mktg.scale_warning",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return total > 0 && total < 50;
    },
    observation: (c: any) => {
      const sources = c.top_sources || [];
      const total = sources.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return `${total} attributed contacts — small sample. Per-source comparisons are directional; statistically reliable attribution decisions need 100+ contacts per source.`;
    },
  },
];

// ════════════════════════════════════════════════════════════════════
// 2. CUSTOMER SEGMENTATION (15 rules)
// ════════════════════════════════════════════════════════════════════

export const SPARK_SEGMENTATION_RULES: InsightRule[] = [
  {
    id: "spark.seg.no_segments",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => !Array.isArray(c.segments) || c.segments.length === 0,
    observation: () => `No segments defined. Without segmentation every campaign goes to every contact — engagement falls and unsubscribes rise. Segments are the foundation of every other lifecycle marketing capability.`,
    action: () => `Build three baseline segments today: (a) engaged in last 30 days, (b) high-value contacts, (c) dormant 60+ days. These three cover most campaign-targeting use cases.`,
  },
  {
    id: "spark.seg.coverage",
    category: "coverage",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Array.isArray(c.segments) && Number(c.contact_totals?.active || 0) > 0,
    observation: (c: any) => {
      const total = (c.segments || []).reduce((s: number, r: any) => s + Number(r.members || 0), 0);
      const active = Number(c.contact_totals?.active || 0);
      const cov = active > 0 ? Math.min(1, total / active) : 0;
      if (cov < 0.4) return `Segment coverage is ${pct(cov)} (${fmt(total)} segment members across ${fmt(active)} active contacts). Most outreach can't be tailored — the majority of your audience falls outside any defined segment.`;
      if (cov < 0.7) return `Segment coverage is ${pct(cov)} — partial. Most contacts are segmented but a meaningful tail isn't reachable by targeted campaigns.`;
      return `Segment coverage is ${pct(cov)} — strong. Most of your active audience is reachable through at least one segment.`;
    },
  },
  {
    id: "spark.seg.top_segment",
    category: "leadership",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Array.isArray(c.segments) && c.segments.length > 0,
    observation: (c: any) => {
      const top = c.segments[0];
      return `Largest segment: ${top.name} (${fmt(Number(top.members))} members). Use this segment as the engagement-quality baseline for comparing newer or smaller segments.`;
    },
  },
  {
    id: "spark.seg.few_segments",
    category: "depth",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Array.isArray(c.segments) && c.segments.length > 0 && c.segments.length < 3,
    observation: (c: any) => `Only ${c.segments.length} segment${c.segments.length === 1 ? "" : "s"} defined. Most service businesses need 5-8 active segments to cover lifecycle stages (lead → customer → repeat → at-risk → champion).`,
    action: () => `Add at least 2 more segments to your library. Recommended next: (a) "new contacts (last 30 days)" for welcome series, (b) "dormant 60+ days" for re-engagement.`,
  },
  {
    id: "spark.seg.healthy_depth",
    category: "depth",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.segments) && c.segments.length >= 5,
    observation: (c: any) => `${c.segments.length} segments defined — strong segmentation depth. Sufficient breadth to support distinct lifecycle, behavioural, and value-based campaigns.`,
  },
  {
    id: "spark.seg.tag_depth_low",
    category: "tagging",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Array.isArray(c.top_tags) && c.top_tags.length < 5 && Number(c.contact_totals?.active || 0) > 20,
    observation: (c: any) => `Only ${(c.top_tags || []).length} unique tags applied. Tags are the fastest way to slice your audience for ad-hoc campaigns without building full segments — a thin tag library limits targeting flexibility.`,
    action: () => `Define a core tag taxonomy: service type, lead source, customer status, opt-in preferences. Auto-tag rules on incoming contacts ensure the taxonomy fills out passively.`,
  },
  {
    id: "spark.seg.tag_depth_healthy",
    category: "tagging",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Array.isArray(c.top_tags) && c.top_tags.length >= 10,
    observation: (c: any) => `${c.top_tags.length} unique tags in use — robust tag library. Combined with segments, this gives precise audience targeting for ad-hoc campaigns.`,
  },
  {
    id: "spark.seg.top_tags",
    category: "tagging",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.top_tags) && c.top_tags.length >= 3,
    observation: (c: any) => {
      const tags = c.top_tags.slice(0, 5);
      return `Top tags: ${tags.map((t: any) => `${t.name} (${fmt(Number(t.n))})`).join(", ")}. These are the most-applied audience slices — useful as the basis for behavioural segments.`;
    },
  },
  {
    id: "spark.seg.no_tags_at_all",
    category: "tagging",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => (!Array.isArray(c.top_tags) || c.top_tags.length === 0) && Number(c.contact_totals?.active || 0) > 20,
    observation: () => `No tags applied to any contact. Tags are the fastest way to slice your audience — without them, every campaign target list has to be rebuilt by-hand from segments.`,
    action: () => `Apply your first 3 tags right now: tag your top 10 customers as "champion", your most recent 20 leads as "new_lead", and your last 30 days of openers as "engaged_email". This unlocks segment-building.`,
  },
  {
    id: "spark.seg.segment_size_balance",
    category: "balance",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.segments) && c.segments.length >= 3,
    observation: (c: any) => {
      const segs = c.segments;
      const top = segs[0];
      const total = segs.reduce((s: number, r: any) => s + Number(r.members || 0), 0);
      const topShare = total > 0 ? Number(top.members || 0) / total : 0;
      if (topShare > 0.7) return `Segment imbalance: ${top.name} carries ${pct(topShare)} of segment memberships. Most contacts share the same segment — finer segmentation will unlock more targeted campaigns.`;
      return `Segment size distribution is balanced — top segment is ${pct(topShare)} of total memberships. Healthy spread.`;
    },
  },
  {
    id: "spark.seg.lifecycle_gaps",
    category: "coverage",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.segments) && c.segments.length >= 1,
    observation: (c: any) => {
      const names = (c.segments || []).map((s: any) => String(s.name || "").toLowerCase());
      const hasEngaged = names.some((n: string) => /engag|active|recent/.test(n));
      const hasDormant = names.some((n: string) => /dormant|inactive|cold|sleep/.test(n));
      const hasHighValue = names.some((n: string) => /high.?value|champion|vip|top/.test(n));
      const missing: string[] = [];
      if (!hasEngaged) missing.push("engaged-recent");
      if (!hasDormant) missing.push("dormant");
      if (!hasHighValue) missing.push("high-value");
      if (missing.length === 0) return `Lifecycle segment coverage looks complete — engaged, dormant, and high-value all represented.`;
      return `Missing lifecycle segments: ${missing.join(" · ")}. These three categories handle ~80% of standard lifecycle marketing use cases.`;
    },
  },
  {
    id: "spark.seg.automation_pairing",
    category: "automation-hooks",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) =>
      Array.isArray(c.segments) && c.segments.length >= 3 &&
      Number(c.automations?.active || 0) < c.segments.length,
    observation: (c: any) => `You have ${c.segments.length} segments but only ${c.automations?.active || 0} active automations. Each segment ideally has at least one always-on lifecycle automation; under-automated segments are static target lists without compounding outcomes.`,
    action: () => `Pair each top 3 segment with one automation: (a) new contacts → welcome series, (b) engaged → upsell sequence, (c) dormant → re-engagement.`,
  },
  {
    id: "spark.seg.large_dormant_warning",
    category: "risk",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const segs = c.segments || [];
      return segs.some((s: any) =>
        /dormant|inactive|cold|sleep/i.test(String(s.name || "")) &&
        Number(s.members || 0) > Number(c.contact_totals?.active || 0) * 0.25
      );
    },
    observation: (c: any) => {
      const dormant = (c.segments || []).find((s: any) =>
        /dormant|inactive|cold|sleep/i.test(String(s.name || ""))
      );
      return `Large dormant pool: ${dormant.name} has ${fmt(Number(dormant.members || 0))} members. Plan a structured re-engagement campaign — every dormant contact recovered is cheaper than acquiring a new one.`;
    },
  },
  {
    id: "spark.seg.auto_tag_recommendation",
    category: "automation-hooks",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.top_tags) && c.top_tags.length > 0 && c.top_tags.length < 8,
    observation: () => `Tag library is growing but still manual. Auto-tag rules on incoming contacts (by source, form, page) compound your taxonomy passively.`,
    action: () => `Open SPARK → Admin → Auto-Tag Rules and set up tag rules by source + by form ID. Pass-through rules require zero ongoing maintenance.`,
  },
  {
    id: "spark.seg.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const segs = c.segments || [];
      const tags = c.top_tags || [];
      const active = Number(c.contact_totals?.active || 0);
      const total = segs.reduce((s: number, r: any) => s + Number(r.members || 0), 0);
      return segs.length >= 5 && tags.length >= 8 && active > 0 && (total / active) >= 0.7;
    },
    observation: () => `Segmentation is mature: 5+ segments, 8+ tags, 70%+ coverage. Focus optimisation on segment-specific campaign performance rather than building more segments.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 3. AUTOMATION EFFECTIVENESS (15 rules)
// ════════════════════════════════════════════════════════════════════

export const SPARK_AUTOMATION_EFF_RULES: InsightRule[] = [
  {
    id: "spark.auto.no_automations",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.automations?.total || 0) === 0,
    observation: () => `No automations defined. The single biggest SPARK value-add is replacing manual follow-up with deterministic automation. Every customer interaction handled manually is time + revenue you can recover.`,
    action: () => `Build your first three automations today: (a) new-lead 24-hour follow-up, (b) post-purchase thank-you + review request, (c) dormant-customer 60-day win-back.`,
  },
  {
    id: "spark.auto.active_rate_low",
    category: "active-rate",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      const total = Number(a.total || 0);
      return total >= 3 && Number(a.active || 0) / total < 0.5;
    },
    observation: (c: any) => {
      const a = c.automations || {};
      const active = Number(a.active || 0);
      const total = Number(a.total || 0);
      const rate = total > 0 ? active / total : 0;
      return `Only ${active} of ${total} automations are active (${pct(rate)}). Half or more are paused — either they were experiments that didn't pan out (delete them) or they were misconfigured (fix and re-enable). Paused automations add cognitive load without producing value.`;
    },
    action: () => `Audit each paused automation. Delete anything that hasn't fired in 60 days. Re-enable anything that was paused for a fixable reason (broken trigger, missing tag).`,
  },
  {
    id: "spark.auto.active_rate_healthy",
    category: "active-rate",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      const total = Number(a.total || 0);
      return total >= 3 && Number(a.active || 0) / total >= 0.8;
    },
    observation: (c: any) => {
      const a = c.automations || {};
      return `${a.active} of ${a.total} automations active (${pct(a.active / a.total)}). Strong automation discipline — most defined automations are actively producing outcomes.`;
    },
  },
  {
    id: "spark.auto.exec_volume_low",
    category: "execution",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.active || 0) >= 3 && Number(a.total_executions || 0) / Math.max(Number(a.active || 1), 1) < 5;
    },
    observation: (c: any) => {
      const a = c.automations || {};
      const perAuto = Number(a.active || 0) > 0 ? Number(a.total_executions || 0) / Number(a.active || 1) : 0;
      return `Average ${perAuto.toFixed(1)} executions per active automation — automations are running but rarely firing. Triggers may not match real events (tag waits for a tag nothing applies).`;
    },
    action: () => `Open each active automation. Verify its trigger condition matches an event your contacts actually hit. Common gotchas: tag-based triggers waiting on tags that don't get applied; segment triggers on segments with no rules.`,
  },
  {
    id: "spark.auto.exec_volume_strong",
    category: "execution",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.active || 0) > 0 && Number(a.total_executions || 0) / Math.max(Number(a.active || 1), 1) > 50;
    },
    observation: (c: any) => {
      const a = c.automations || {};
      const perAuto = Number(a.total_executions || 0) / Number(a.active || 1);
      return `${fmt(Number(a.total_executions))} total executions across ${a.active} automations (${perAuto.toFixed(0)} avg each). Automations are doing real work — audit the top-execution automation to confirm it's still producing the intended outcomes.`;
    },
  },
  {
    id: "spark.auto.coverage_low",
    category: "coverage",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.active || 0) > 0 && Number(a.active || 0) < 3;
    },
    observation: (c: any) => `Only ${c.automations?.active || 0} active automation${(c.automations?.active || 0) === 1 ? "" : "s"}. Most service-business CRMs benefit from 5-10 always-on automations covering acquisition, engagement, retention, and reactivation.`,
    action: () => `Identify the 3 most-repeated manual tasks in your follow-up workflow this month. Each one is a candidate for automation — start with the highest-frequency.`,
  },
  {
    id: "spark.auto.welcome_gap",
    category: "lifecycle-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const active = Number(c.automations?.active || 0);
      const contacts = Number(c.contact_recent?.new_contacts || 0);
      return contacts > 10 && active < 3;
    },
    observation: (c: any) => {
      const contacts = Number(c.contact_recent?.new_contacts || 0);
      return `${contacts} new contacts captured this period, but your automation footprint is thin (${c.automations?.active || 0} active). New contacts are landing without a welcome sequence — the first 14 days post-capture are the highest-engagement window and are currently wasted.`;
    },
    action: () => `Build a 3-message welcome sequence: welcome + value, top resource/case study, "here's how to get started / book a service." Trigger on contact creation.`,
  },
  {
    id: "spark.auto.dormancy_gap",
    category: "lifecycle-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const lowScore = Number(r.low_score || 0);
      const total = Number(r.scored_contacts || 0);
      return total > 20 && lowScore / total > 0.3 && Number(c.automations?.active || 0) < 5;
    },
    observation: () => `A meaningful share of contacts are scoring low (dormancy risk) but your automation library is thin. A re-engagement sequence triggered on score-drop is one of the highest-ROI automations available.`,
    action: () => `Build a re-engagement automation: trigger when lead_score drops below 30 for 14 days. Send a "we miss you" + incentive sequence. Even modest reactivation rates (5-10%) recover meaningful revenue.`,
  },
  {
    id: "spark.auto.review_gap",
    category: "lifecycle-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) =>
      Number(c.automations?.active || 0) < 5 &&
      // Implicit: tenant has SPARK so we can assume revenue-tied flows are valuable
      Number(c.contact_totals?.active || 0) > 50,
    observation: () => `Most service businesses with 50+ active contacts benefit from a post-service review-request automation — it lifts Google review velocity 3-5x over manual asking.`,
    action: () => `Build a "job completed → wait 24h → SMS + email review request" automation. Trigger from your job-completion event (OLIVER) or via webhook from your service-delivery system.`,
  },
  {
    id: "spark.auto.zero_executions",
    category: "execution",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.active || 0) > 0 && Number(a.total_executions || 0) === 0;
    },
    observation: () => `Active automations exist but zero executions recorded. Either triggers haven't fired since the automations were enabled, or trigger conditions don't match any real events.`,
    action: () => `Open SPARK → Automation Builder. For each active automation, click "Run history" or "Logs" — if empty, the trigger condition isn't matching anything. Test by manually firing the trigger event (e.g. add the watched tag to a test contact).`,
  },
  {
    id: "spark.auto.healthy_lifecycle",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.active || 0) >= 5 && Number(a.total_executions || 0) > 50;
    },
    observation: (c: any) => `${c.automations.active} active automations executing reliably (${fmt(Number(c.automations.total_executions))} total executions). Strong lifecycle automation footprint — focus optimisation on individual automation performance, not on volume.`,
  },
  {
    id: "spark.auto.unbalanced_executions",
    category: "execution",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.active || 0) >= 3 && Number(a.total_executions || 0) > 500;
    },
    observation: (c: any) => {
      const a = c.automations || {};
      return `${fmt(Number(a.total_executions))} total executions is significant volume. At this scale, one runaway automation can dominate engagement signals; periodically review per-automation execution counts to spot anomalies.`;
    },
  },
  {
    id: "spark.auto.scale_warning",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const a = c.automations || {};
      return Number(a.total || 0) > 0 && Number(a.total_executions || 0) < 20;
    },
    observation: () => `Automation execution volume is still building. Per-automation performance observations become statistically reliable around 100+ executions per automation.`,
  },
  {
    id: "spark.auto.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Number(c.automations?.active || 0) >= 3,
    observation: () => `Pair each automation with a measurable outcome metric (engagement rate, downstream conversion, time saved). Without an outcome metric per automation, you can't tell which ones earn their keep.`,
  },
  {
    id: "spark.auto.recommended_starter_set",
    category: "recommendations",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.automations?.active || 0) < 3 && Number(c.contact_totals?.active || 0) > 0,
    observation: () => `Recommended starter automation set for any service business: (1) new-contact welcome, (2) form-abandoned recovery, (3) post-job thank-you + review, (4) 30-day non-engagement check-in, (5) 90-day dormancy re-engagement. Even 3 of 5 covers most lifecycle stages.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 4. RETENTION RISK (15 rules)
// ════════════════════════════════════════════════════════════════════

export const SPARK_RETENTION_RISK_RULES: InsightRule[] = [
  {
    id: "spark.retention.no_scoring",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.retention?.scored_contacts || 0) === 0,
    observation: () => `No scored contacts. Behavioural lead scoring is the foundation for retention risk identification — without scores, churn happens before you see it.`,
    action: () => `Enable behavioural scoring in SPARK → Admin → Scoring Rules. Configure rules for: opens, clicks, form submissions, page views. Score recency more heavily than total count (recent engagement matters more).`,
  },
  {
    id: "spark.retention.distribution_snapshot",
    category: "distribution",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.retention?.scored_contacts || 0) > 0,
    observation: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return `${fmt(total)} scored contacts: ${fmt(Number(r.high_score || 0))} high-engagement (≥70) · ${fmt(Number(r.mid_score || 0))} mid (30-69) · ${fmt(Number(r.low_score || 0))} low (<30). The low-score pool is your retention-risk surface.`;
    },
  },
  {
    id: "spark.retention.low_score_high",
    category: "risk",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return total >= 20 && Number(r.low_score || 0) / total > 0.4;
    },
    observation: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      const ratio = total > 0 ? Number(r.low_score || 0) / total : 0;
      return `${pct(ratio)} of scored contacts are low-score (${fmt(Number(r.low_score || 0))} contacts) — these are your retention-risk pool. Plan a win-back campaign now, not after they churn.`;
    },
    action: () => `Build a multi-step win-back sequence: (1) "we miss you" + value reminder, (2) one-time incentive offer, (3) sunset notice asking for feedback. Trigger on lead_score < 30 sustained for 14 days.`,
  },
  {
    id: "spark.retention.high_score_low",
    category: "engagement",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return total >= 20 && Number(r.high_score || 0) / total < 0.15;
    },
    observation: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      const ratio = total > 0 ? Number(r.high_score || 0) / total : 0;
      return `Only ${pct(ratio)} of contacts are high-score. Either your scoring rules are too strict (and your best customers aren't being recognised) or your engagement-quality is genuinely thin. Audit scoring rules first.`;
    },
    action: () => `Review SPARK → Scoring Rules. Most service businesses should see 20-30% of contacts in the high tier after 90+ days of mature engagement. If you're below 15%, loosen the high-tier threshold or add positive-signal rules (review-left, referral-sent).`,
  },
  {
    id: "spark.retention.balanced_distribution",
    category: "distribution",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      if (total < 20) return false;
      const high = Number(r.high_score || 0) / total;
      const low = Number(r.low_score || 0) / total;
      return high >= 0.2 && low < 0.3;
    },
    observation: (c: any) => `Score distribution is healthy: meaningful high-engagement tier with manageable low-tier risk pool. Continue monitoring for shifts month-over-month.`,
  },
  {
    id: "spark.retention.thin_pool",
    category: "scale",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const total = Number(c.retention?.scored_contacts || 0);
      return total > 0 && total < 50;
    },
    observation: (c: any) => {
      const total = Number(c.retention?.scored_contacts || 0);
      return `${total} scored contacts — small sample. Score distribution observations are directional; meaningful retention-risk decisions need 200+ scored contacts.`;
    },
    action: () => `Grow the scored pool by sending engagement-eliciting campaigns. Each campaign with measurable opens/clicks bumps more contacts into the scoring system.`,
  },
  {
    id: "spark.retention.mid_score_dominance",
    category: "distribution",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return total >= 20 && Number(r.mid_score || 0) / total > 0.6;
    },
    observation: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      const ratio = Number(r.mid_score || 0) / total;
      return `${pct(ratio)} of contacts are mid-score — the "active but not engaged" majority. This pool is where activation campaigns produce the most lift; targeted offers to mid-tier contacts typically move 5-10% into the high tier.`;
    },
  },
  {
    id: "spark.retention.revenue_at_risk",
    category: "revenue",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const lowScore = Number(r.low_score || 0);
      const totalLtv = (c.revenue_attribution || []).reduce((s: number, x: any) => s + Number(x.total_ltv || 0), 0);
      return lowScore > 5 && totalLtv > 0;
    },
    observation: (c: any) => {
      const r = c.retention || {};
      const lowScore = Number(r.low_score || 0);
      const totalLtv = (c.revenue_attribution || []).reduce((s: number, x: any) => s + Number(x.total_ltv || 0), 0);
      const totalContacts = (c.revenue_attribution || []).reduce((s: number, x: any) => s + Number(x.contacts || 0), 0);
      const avgLtv = totalContacts > 0 ? totalLtv / totalContacts : 0;
      const atRisk = Math.round(lowScore * avgLtv);
      return `Approximate revenue at risk: $${fmt(atRisk)} (${lowScore} low-score contacts × $${fmt(avgLtv)} average LTV). At your historical 20% reactivation rate, a targeted campaign could recover ~$${fmt(Math.round(atRisk * 0.2))}.`;
    },
  },
  {
    id: "spark.retention.automation_pairing",
    category: "automation-hooks",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const lowScore = Number(r.low_score || 0);
      return lowScore > 10 && Number(c.automations?.active || 0) < 5;
    },
    observation: () => `Low-score contacts exist but no dedicated re-engagement automation appears active. Without automation, every dormant contact requires manual outreach — economically untenable past 50+ contacts.`,
    action: () => `Build a workflow-trigger automation: when lead_score < 30 sustained 14 days, fire a 4-step re-engagement sequence (welcome back, incentive, last-chance, sunset).`,
  },
  {
    id: "spark.retention.scoring_recency_check",
    category: "rules-config",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.retention?.scored_contacts || 0) > 50,
    observation: () => `For retention scoring to predict churn, recency must be weighted heavily (~50%+ of score). A contact who opened 100 emails 2 years ago is not engaged today. Verify your scoring rules decay engagement signals over time.`,
  },
  {
    id: "spark.retention.no_revenue_data",
    category: "data-gaps",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const lowScore = Number(c.retention?.low_score || 0);
      const hasRevenue = Array.isArray(c.revenue_attribution) && c.revenue_attribution.length > 0;
      return lowScore > 5 && !hasRevenue;
    },
    observation: () => `Retention risk is visible (low-score pool exists) but revenue impact can't be quantified — no lifetime_value data is flowing in. Connect OLIVER → SPARK sync to surface "revenue at risk" calculations alongside churn-risk pools.`,
  },
  {
    id: "spark.retention.high_pool_protection",
    category: "engagement",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return total >= 30 && Number(r.high_score || 0) / total >= 0.25;
    },
    observation: (c: any) => {
      const r = c.retention || {};
      return `${fmt(Number(r.high_score || 0))} high-engagement contacts (${pct(Number(r.high_score || 0) / Number(r.scored_contacts || 1))}). These are your champions — protect them with exclusive offers, early access, or a referral incentive program. Champion contacts are 2-3x more likely to refer than mid-tier.`;
    },
  },
  {
    id: "spark.retention.churn_window_alert",
    category: "alerts",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return total >= 50 && Number(r.low_score || 0) / total > 0.25 && Number(r.high_score || 0) / total < 0.2;
    },
    observation: (c: any) => `Distribution is shifting toward churn risk: low-score pool growing faster than high-engagement pool. Watch this ratio quarter-over-quarter — a sustained adverse shift is the leading indicator of churn 60-90 days out.`,
  },
  {
    id: "spark.retention.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      return total >= 50 && Number(r.high_score || 0) / total >= 0.2 && Number(r.low_score || 0) / total < 0.25;
    },
    observation: () => `Retention risk is well-managed: high-engagement pool above 20%, low-score risk pool below 25%. Continue monitoring and pair each tier with an always-on automation.`,
  },
  {
    id: "spark.retention.score_volatility",
    category: "data-quality",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.scored_contacts || 0);
      const mid = Number(r.mid_score || 0);
      return total >= 30 && mid / total < 0.15;
    },
    observation: () => `Mid-score pool is very thin — most contacts cluster at the extremes. Often indicates either scoring rules with bimodal weights (binary events with no middle ground) or a list with very stale and very fresh contacts but few in-between. Review scoring rules for graduation curves.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 5. REVENUE ATTRIBUTION (15 rules)
// ════════════════════════════════════════════════════════════════════

export const SPARK_REVENUE_ATTRIB_RULES: InsightRule[] = [
  {
    id: "spark.rev.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => !Array.isArray(c.revenue_attribution) || c.revenue_attribution.length === 0,
    observation: () => `No revenue attribution data flowing yet. Either lifetime_value isn't being populated on contact records (check OLIVER → SPARK sync), or no jobs have completed this period.`,
    action: () => `Verify the OLIVER → SPARK lifetime_value sync. Job-completed events should bump contact.lifetime_value automatically. Inspect the most recent platform_events for "contact.lifetime_value_updated".`,
  },
  {
    id: "spark.rev.total_volume",
    category: "volume",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      return sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0) > 0;
    },
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      const avgLtv = totalContacts > 0 ? totalLtv / totalContacts : 0;
      return `$${fmt(totalLtv)} attributed lifetime value across ${fmt(totalContacts)} customers from ${sources.length} sources — average LTV per customer: $${fmt(avgLtv)}.`;
    },
  },
  {
    id: "spark.rev.top_source",
    category: "leadership",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Array.isArray(c.revenue_attribution) && c.revenue_attribution.length > 0,
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const top = sources[0];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const share = totalLtv > 0 ? Number(top.total_ltv || 0) / totalLtv : 0;
      const topLtv = Number(top.contacts || 0) > 0 ? Number(top.total_ltv || 0) / Number(top.contacts || 0) : 0;
      return `Top revenue source: ${top.source} → $${fmt(Number(top.total_ltv))} from ${fmt(Number(top.contacts))} customers ($${fmt(topLtv)} avg LTV · ${pct(share)} of attributed revenue).`;
    },
  },
  {
    id: "spark.rev.concentration_risk",
    category: "risk",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      return totalLtv > 0 && Number(sources[0]?.total_ltv || 0) / totalLtv > 0.65;
    },
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const top = sources[0];
      const share = totalLtv > 0 ? Number(top.total_ltv || 0) / totalLtv : 0;
      return `Revenue concentration risk: ${pct(share)} of LTV comes from one channel (${top.source}). A change to that channel would halve revenue overnight. This is the largest single business-continuity risk you can address.`;
    },
    action: () => `Reinvest a portion of your top-channel profit into a second always-on channel. Diversification on revenue is more important than diversification on acquisition volume — channels can produce different LTV.`,
  },
  {
    id: "spark.rev.ltv_per_source_variance",
    category: "quality",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Array.isArray(c.revenue_attribution) && c.revenue_attribution.length >= 2,
    observation: (c: any) => {
      const sources = (c.revenue_attribution || []).filter((s: any) => Number(s.contacts) >= 3);
      if (sources.length < 2) return "";
      const withLtv = sources.map((s: any) => ({
        name: s.source,
        avgLtv: Number(s.contacts) > 0 ? Number(s.total_ltv || 0) / Number(s.contacts || 1) : 0,
      })).sort((a: any, b: any) => b.avgLtv - a.avgLtv);
      const best = withLtv[0];
      const worst = withLtv[withLtv.length - 1];
      if (worst.avgLtv === 0 || best.avgLtv / worst.avgLtv < 1.5) return "";
      return `LTV varies by source: ${best.name} produces $${fmt(best.avgLtv)} avg LTV vs ${worst.name} at $${fmt(worst.avgLtv)}. Shifting acquisition spend toward higher-LTV channels is more efficient than scaling lower-LTV channels.`;
    },
  },
  {
    id: "spark.rev.second_channel_strength",
    category: "diversity",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.revenue_attribution) && c.revenue_attribution.length >= 2,
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const second = sources[1];
      const share = totalLtv > 0 ? Number(second.total_ltv || 0) / totalLtv : 0;
      return `Second-leading revenue source (${second.source}) carries ${pct(share)} of LTV — your reliable secondary revenue channel.`;
    },
  },
  {
    id: "spark.rev.low_avg_ltv",
    category: "ltv",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      const avg = totalContacts > 0 ? totalLtv / totalContacts : 0;
      return totalLtv > 0 && avg < 500;
    },
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      const avg = totalContacts > 0 ? totalLtv / totalContacts : 0;
      return `Average LTV per customer is $${fmt(avg)} — modest. Service-business LTV typically grows through repeat bookings + cross-sells. If you're seeing one-and-done customers, the highest-leverage move is a retention/cross-sell program, not more acquisition.`;
    },
    action: () => `Build LTV-expansion campaigns on your top-LTV source: cross-sell adjacent services, set up recurring-service offers, launch a referral program with measurable incentive.`,
  },
  {
    id: "spark.rev.high_ltv_strength",
    category: "ltv",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      const avg = totalContacts > 0 ? totalLtv / totalContacts : 0;
      return avg >= 2000;
    },
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      const avg = totalContacts > 0 ? totalLtv / totalContacts : 0;
      return `Strong average LTV ($${fmt(avg)}) — protect this with retention discipline (review-response, dormancy detection, win-back automations). High-LTV businesses can spend more aggressively on acquisition since CAC payback periods are shorter.`;
    },
  },
  {
    id: "spark.rev.volume_to_revenue_mismatch",
    category: "channels",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      return Array.isArray(c.top_sources) && c.top_sources.length > 0 &&
             Array.isArray(c.revenue_attribution) && c.revenue_attribution.length > 0;
    },
    observation: (c: any) => {
      const volTop = c.top_sources[0];
      const revTop = c.revenue_attribution[0];
      if (volTop && revTop && volTop.source !== revTop.source) {
        return `Volume vs revenue mismatch: ${volTop.source} produces the most contacts, but ${revTop.source} produces the most revenue. Acquisition budget should follow revenue-quality, not just volume — re-balance accordingly.`;
      }
      return `Your highest-volume source is also your highest-revenue source (${revTop?.source}). Channel concentration is consistent on both dimensions — invest in diversifying.`;
    },
  },
  {
    id: "spark.rev.thin_sample_warning",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      return totalContacts > 0 && totalContacts < 20;
    },
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const totalContacts = sources.reduce((s: number, r: any) => s + Number(r.contacts || 0), 0);
      return `${totalContacts} attributed customers — small sample for per-source LTV decisions. Per-channel LTV becomes statistically reliable around 30+ customers per channel.`;
    },
  },
  {
    id: "spark.rev.unattributed_revenue",
    category: "data-quality",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      return sources.some((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
    },
    observation: (c: any) => {
      const sources = c.revenue_attribution || [];
      const unk = sources.find((s: any) => /^(unknown|none|null|^$)/i.test(String(s.source || "")));
      const totalLtv = sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const unkShare = totalLtv > 0 ? Number(unk?.total_ltv || 0) / totalLtv : 0;
      return `${pct(unkShare)} of attributed revenue ($${fmt(Number(unk?.total_ltv || 0))}) comes from contacts with no source. This revenue isn't allocatable to a channel for CAC/LTV decisions.`;
    },
    action: () => `Backfill source attribution on existing customers — manual data hygiene on the top 20 contacts by LTV typically reveals patterns worth keeping. For new contacts, enforce source capture at intake.`,
  },
  {
    id: "spark.rev.diversification_recommendation",
    category: "channels",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.revenue_attribution) && c.revenue_attribution.length === 1 && Number(c.revenue_attribution[0].total_ltv || 0) > 0,
    observation: (c: any) => `100% of attributed revenue comes from a single source (${c.revenue_attribution[0].source}). Either your attribution is incomplete (most likely) or you have catastrophic single-channel concentration.`,
    action: () => `Verify all contact records have source attribution. If genuinely single-source, this is your most urgent priority: get a second revenue-producing channel active within 90 days.`,
  },
  {
    id: "spark.rev.referral_strength",
    category: "channels",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.revenue_attribution) && c.revenue_attribution.some((s: any) => /referral|word.?of.?mouth/i.test(s.source || "")),
    observation: (c: any) => {
      const ref = (c.revenue_attribution || []).find((s: any) => /referral|word.?of.?mouth/i.test(s.source || ""));
      const totalLtv = (c.revenue_attribution || []).reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0);
      const share = totalLtv > 0 ? Number(ref?.total_ltv || 0) / totalLtv : 0;
      return `Referral channel produces ${pct(share)} of revenue ($${fmt(Number(ref?.total_ltv || 0))}). Referral customers typically have 2-3x the LTV of cold leads — formalising this with an incentive program could scale it materially.`;
    },
  },
  {
    id: "spark.rev.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const sources = c.revenue_attribution || [];
      return sources.reduce((s: number, r: any) => s + Number(r.total_ltv || 0), 0) > 0;
    },
    observation: () => `Pair Revenue Attribution with Marketing Attribution (volume) to identify mismatches. Channels that produce volume but not revenue waste budget; channels that produce revenue but limited volume have headroom.`,
  },
];

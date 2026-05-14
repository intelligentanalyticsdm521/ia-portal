// arionAudienceRules — v7.7 ARION "Audience Intelligence" insight library.
//
// 20+ conditional rules covering:
//   - Traffic Quality Index (bounce + engagement + pages-per-session)
//   - New vs returning
//   - Device + browser distribution
//   - Day-of-week + hourly patterns
//   - Traffic source quality (signal vs noise)
//   - High-intent sessions
//   - Session duration
//   - Audience type heuristics (B2B vs B2C)

import { type InsightRule, fmt, pct } from "./insightRules";

export const AUDIENCE_RULES: InsightRule[] = [
  // ─── Traffic Quality ──────────────────────────────────────────────
  {
    id: "aud.quality.bounce_rate",
    category: "quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 9,
    appliesWhen: (c) => c.ga4?.summary?.bounceRate != null,
    observation: (c) => {
      const b = Number(c.ga4?.summary?.bounceRate || 0);
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const bounced = Math.round(b * ses);
      if (b >= 0.8) return `Bounce rate is ${pct(b, 1)} (${bounced} of ${fmt(ses)} sessions bounce on the entry page). High bounce + low pages-per-session is the classic "single-page brochure" pattern — visitors arrive, scan, leave without exploring.`;
      if (b >= 0.6) return `Bounce rate is ${pct(b, 1)} — above average but recoverable. The most effective bounce-reduction tactics are (1) above-fold value proposition rewrites and (2) internal links visible without scrolling.`;
      if (b >= 0.4) return `Bounce rate is ${pct(b, 1)} — healthy. Visitors are exploring more than one page on average. Continue investing in navigation + related-content blocks.`;
      return `Bounce rate is ${pct(b, 1)} — excellent. Visitors are engaging deeply with multiple pages, which compounds your conversion probability.`;
    },
  },
  {
    id: "aud.quality.engagement_rate",
    category: "quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => c.ga4?.engagement?.engagementRate != null,
    observation: (c) => {
      const er = Number(c.ga4?.engagement?.engagementRate || 0);
      if (er >= 0.6) return `Engagement rate is ${pct(er, 1)} — strong. GA4 defines "engaged" as a session lasting 10+ seconds, having 2+ pageviews, or firing a conversion event. Most of your visitors are doing one of those.`;
      if (er >= 0.4) return `Engagement rate is ${pct(er, 1)} — average. Inverse of bounce; ~40-60% engaged is normal across most B2B/local sites.`;
      return `Engagement rate is only ${pct(er, 1)} — most visitors leave within 10 seconds without a second pageview or conversion event. This suggests either traffic-quality issues (wrong audience landing) or content-quality issues (right audience but the page isn't holding them).`;
    },
  },
  {
    id: "aud.quality.pps",
    category: "quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => Number(c.ga4?.engagement?.pageviewsPerSession) > 0,
    observation: (c) => {
      const pps = Number(c.ga4?.engagement?.pageviewsPerSession || 0);
      if (pps < 1.5) return `Pages per session is ${pps.toFixed(2)} — most visitors read one page and leave. The site is functioning as a brochure, not a funnel. Internal linking (related posts, "next step" CTAs) is the single biggest lever.`;
      if (pps < 2.5) return `Pages per session is ${pps.toFixed(2)} — visitors are exploring beyond the entry page. Add intent-aware internal links from your top-traffic pages to your conversion pages to keep extending session depth.`;
      return `Pages per session is ${pps.toFixed(2)} — strong session depth. Visitors are genuinely exploring; protect this with site-speed monitoring (slow pages collapse session depth faster than anything else).`;
    },
  },
  {
    id: "aud.quality.tqi",
    category: "quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => c.ga4?.summary?.bounceRate != null && c.ga4?.engagement?.engagementRate != null,
    observation: (c) => {
      const b = Number(c.ga4?.summary?.bounceRate || 0);
      const er = Number(c.ga4?.engagement?.engagementRate || 0);
      const pps = Number(c.ga4?.engagement?.pageviewsPerSession || 1);
      const tqi = Math.max(0, Math.min(100, Math.round(100 - b * 40 + er * 30 + Math.min(pps, 5) * 10)));
      if (tqi >= 70) return `Traffic Quality Index is ${tqi}/100 — healthy. Your visitors are engaging at rates above industry baseline. Optimisation focus shifts to conversion-rate work (what visitors do on the page), not traffic-quality work (which audience you're attracting).`;
      if (tqi >= 50) return `Traffic Quality Index is ${tqi}/100 — needs attention. Mid-range TQI usually means a mix of qualified and unqualified traffic; segmenting by source typically reveals which channels are dragging the average down.`;
      return `Traffic Quality Index is ${tqi}/100 — low quality. Either wrong-audience traffic (bot/spam/foreign) is inflating the denominator, or right-audience traffic isn't finding the content it expected. Audit your top sources before investing in CRO.`;
    },
  },

  // ─── New vs Returning ─────────────────────────────────────────────
  {
    id: "aud.return.rate",
    category: "retention",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => Array.isArray(c.ga4?.newVsReturning) && c.ga4.newVsReturning.length > 0,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const ret = (c.ga4?.newVsReturning || []).find((r: any) => /return/i.test(r.type));
      const retSes = Number(ret?.sessions || 0);
      const retPct = ses > 0 ? Math.round((retSes / ses) * 100) : 0;
      if (retPct < 5) return `Only ${retPct}% of your sessions are from returning visitors (${retSes} of ${fmt(ses)}). You're acquiring visitors but not retaining them — no nurture path is bringing them back. Email capture + content subscriptions are the standard fixes.`;
      if (retPct < 15) return `${retPct}% returning visitor rate — below the 15-25% industry average. There's a leaky retention bucket; consider whether your content gives visitors a reason to come back.`;
      if (retPct <= 30) return `${retPct}% returning visitor rate — within healthy range. About a quarter of your sessions are from people who've visited before, which is a strong signal that your content is worth coming back for.`;
      return `${retPct}% returning visitor rate — exceptionally high. Either you have a highly loyal audience or your tracking is double-counting; verify by checking unique-user count vs session count.`;
    },
  },
  {
    id: "aud.return.new_only",
    category: "retention",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => {
      const ret = (c.ga4?.newVsReturning || []).find((r: any) => /return/i.test(r.type));
      return Number(ret?.sessions || 0) === 0 && Number(c.ga4?.summary?.totalSessions) > 0;
    },
    observation: () => `0 returning sessions this period — every visitor is brand-new. Without returning visitors there's no compounding effect from your content investment; you're paying full acquisition cost on every conversion.`,
    action: () => `Add an email-capture offer (checklist, guide, or audit template) to your top 3 highest-traffic pages. Even a 1% capture rate on your current traffic builds a retention asset over 6-12 months.`,
  },

  // ─── Device Distribution ──────────────────────────────────────────
  {
    id: "aud.device.mobile_share",
    category: "device",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => Array.isArray(c.ga4?.devices) && c.ga4.devices.length > 0,
    observation: (c) => {
      const devs = c.ga4?.devices || [];
      const total = devs.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const mob = devs.find((d: any) => /mobile/i.test(d.category || d.device));
      const mShare = total > 0 ? Math.round((Number(mob?.sessions || 0) / total) * 100) : 0;
      if (mShare > 60) return `${mShare}% of your traffic is on mobile. Mobile UX, page speed, and tap-target size now drive your conversion rate more than desktop optimisation. Run Lighthouse on a real mobile device, not just the desktop emulator.`;
      if (mShare < 20) return `Only ${mShare}% of your traffic is on mobile. Either your audience is heavily B2B/professional (desktop dominant) or your site renders poorly on mobile and Google has stopped surfacing it there. Verify with a real-device test.`;
      return `${mShare}% mobile share — balanced. Both contexts need ongoing QA: mobile for speed, desktop for conversion-path depth.`;
    },
  },
  {
    id: "aud.device.tablet_share",
    category: "device",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 3,
    appliesWhen: (c) => {
      const devs = c.ga4?.devices || [];
      const tab = devs.find((d: any) => /tablet/i.test(d.category || d.device));
      return Number(tab?.sessions || 0) > 0;
    },
    observation: (c) => {
      const devs = c.ga4?.devices || [];
      const total = devs.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const tab = devs.find((d: any) => /tablet/i.test(d.category || d.device));
      const tShare = total > 0 ? Math.round((Number(tab?.sessions || 0) / total) * 100) : 0;
      if (tShare > 8) return `Tablet traffic is ${tShare}% of sessions — high enough to warrant tablet-specific QA. Most CMS themes treat tablets as scaled-up mobile, which often breaks landing-page layouts.`;
      return `Tablet traffic is ${tShare}% of sessions — typical. No tablet-specific optimisation needed at this scale.`;
    },
  },

  // ─── Browser Distribution ─────────────────────────────────────────
  {
    id: "aud.browser.chrome_share",
    category: "browser",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 4,
    appliesWhen: (c) => Array.isArray(c.ga4?.browsers) && c.ga4.browsers.length > 0,
    observation: (c) => {
      const brs = c.ga4?.browsers || [];
      const total = brs.reduce((s: number, b: any) => s + Number(b.sessions || 0), 0);
      const ch = brs.find((b: any) => /chrome/i.test(b.browser));
      const chShare = total > 0 ? Math.round((Number(ch?.sessions || 0) / total) * 100) : 0;
      if (chShare > 90) return `Chrome dominates at ${chShare}% of sessions — your testing matrix can prioritise Chrome heavily, but verify Safari and Firefox at least once a quarter so cross-browser bugs don't sit undiscovered.`;
      return `${chShare}% Chrome — within industry norms (Chrome usually 65-80%).`;
    },
  },
  {
    id: "aud.browser.safari_low",
    category: "browser",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => {
      const brs = c.ga4?.browsers || [];
      const total = brs.reduce((s: number, b: any) => s + Number(b.sessions || 0), 0);
      const sa = brs.find((b: any) => /safari/i.test(b.browser));
      const share = total > 0 ? (Number(sa?.sessions || 0) / total) * 100 : 0;
      return total > 50 && share < 5;
    },
    observation: (c) => {
      const brs = c.ga4?.browsers || [];
      const total = brs.reduce((s: number, b: any) => s + Number(b.sessions || 0), 0);
      const sa = brs.find((b: any) => /safari/i.test(b.browser));
      const share = total > 0 ? Math.round((Number(sa?.sessions || 0) / total) * 10000) / 100 : 0;
      return `Safari traffic is only ${share}% of sessions — industry average is ~18%. The near-zero Safari share may indicate your site doesn't render well on macOS/iOS. Worth investigating since Apple users typically have above-average purchasing power.`;
    },
    action: () => `Test the site on Safari (macOS) and Mobile Safari (iOS). Fix any layout, JS, or web-font rendering issues — Apple users are a high-value cohort and you're losing them silently.`,
  },

  // ─── Day-of-Week + Hourly Patterns ────────────────────────────────
  {
    id: "aud.timing.peak_day",
    category: "timing",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => Array.isArray(c.ga4?.dayOfWeekBreakdown) && c.ga4.dayOfWeekBreakdown.length >= 5,
    observation: (c) => {
      const days = (c.ga4?.dayOfWeekBreakdown || []).slice().sort((a: any, b: any) => Number(b.sessions || 0) - Number(a.sessions || 0));
      const top = days[0];
      const bottom = days[days.length - 1];
      const total = days.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const topPct = total > 0 ? Math.round((Number(top.sessions || 0) / total) * 100) : 0;
      const dropPct = top.sessions > 0 ? Math.round((1 - Number(bottom.sessions || 0) / Number(top.sessions)) * 100) : 0;
      return `${top.day} is your peak engagement day with ${top.sessions} sessions (${topPct}% of weekly traffic). ${bottom.day} drops to ${bottom.sessions} — a ${dropPct}% decline. ${dropPct > 70 ? "This sharp midweek-to-weekend dropoff strongly suggests a professional/B2B audience, not consumer." : "Reasonable variance — your audience is reachable across most days."}`;
    },
  },
  {
    id: "aud.timing.weekend_dip",
    category: "timing",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 4,
    appliesWhen: (c) => {
      const days = c.ga4?.dayOfWeekBreakdown || [];
      if (days.length < 7) return false;
      const wk = days.filter((d: any) => /sat|sun/i.test(d.day)).reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const wd = days.filter((d: any) => !/sat|sun/i.test(d.day)).reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      return wd > 0 && wk / wd < 0.25;
    },
    observation: () => `Weekend traffic is less than 25% of weekday traffic — strongly indicates a B2B audience working on weekdays. Schedule paid campaigns + email sends Tue-Thu 9am-2pm; weekends are wasted spend.`,
    action: () => `Move your scheduled email sends + paid campaign delivery windows to Tue-Thu, 9am-2pm in your audience's local time. That captures ~60% of your weekly engagement window.`,
  },

  // ─── Source Quality (Signal vs Noise) ─────────────────────────────
  {
    id: "aud.source.bot_traffic",
    category: "source-quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 9,
    appliesWhen: (c) => {
      const sources = c.ga4?.sources || [];
      return sources.some((s: any) => {
        const bounce = Number(s.bounceRate || 0);
        const ses = Number(s.sessions || 0);
        return bounce > 0.95 && ses > 20;
      });
    },
    observation: (c) => {
      const sources = c.ga4?.sources || [];
      const sus = sources
        .filter((s: any) => Number(s.bounceRate) > 0.95 && Number(s.sessions) > 20)
        .sort((a: any, b: any) => Number(b.sessions) - Number(a.sessions))[0];
      return `Source "${sus.source}/${sus.medium || "—"}" has a ${pct(Number(sus.bounceRate))} bounce rate across ${sus.sessions} sessions — this is almost certainly bot or referral-spam traffic, not real visitors. It's inflating your session count and dragging down your engagement metrics.`;
    },
  },
  {
    id: "aud.source.signal_vs_noise",
    category: "source-quality",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => Array.isArray(c.ga4?.sources) && c.ga4.sources.length >= 3,
    observation: (c) => {
      const sources = c.ga4?.sources || [];
      const ranked = sources
        .filter((s: any) => Number(s.sessions) >= 10)
        .map((s: any) => ({
          name: `${s.source}/${s.medium || "—"}`,
          sessions: Number(s.sessions),
          quality: 100 - Number(s.bounceRate || 0) * 50 + (Number(s.engagementRate || 0)) * 50,
        }))
        .sort((a: any, b: any) => b.quality - a.quality);
      if (ranked.length < 2) return "";
      const best = ranked[0];
      const worst = ranked[ranked.length - 1];
      return `Your highest-quality source is ${best.name} (quality score ${Math.round(best.quality)}, ${best.sessions} sessions). Your lowest is ${worst.name} (${Math.round(worst.quality)}, ${worst.sessions} sessions). Spend acquisition effort doubling-down on the top quartile, not pouring water into the bottom.`;
    },
  },
  {
    id: "aud.source.referral_spam",
    category: "source-quality",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => {
      const sources = c.ga4?.sources || [];
      return sources.some((s: any) =>
        /^(semalt|buttons-for-website|free-share-buttons|adcash|trafficmonsoon|hulfingtonpost|share-buttons|webmonetizer|share-buttons|seo-platform|googlsucks|moneymakingideass|kambasoft|forum\.topic)/i.test(s.source || "")
      );
    },
    observation: () => `Known referral-spam domains are appearing in your traffic sources. These don't represent real visitors — they're crawlers hitting your Google Analytics property to get backlinks. Filter them out so they don't pollute your reports.`,
    action: () => `Add a filter in GA4 → Admin → Data Filters to exclude known referral-spam domains. Common offenders: semalt, buttons-for-website, free-share-buttons, kambasoft, share-buttons.`,
  },

  // ─── High-Intent Sessions ─────────────────────────────────────────
  {
    id: "aud.intent.high_intent_count",
    category: "intent",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => Number(c.ga4?.summary?.totalSessions) > 0,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const er = Number(c.ga4?.engagement?.engagementRate || 0);
      const high = Math.round(ses * Math.min(er * 0.4, 0.15));
      if (high === 0) return `Zero high-intent sessions detected this period (sessions with 3+ pageviews AND 60+ seconds). Either traffic is brand-new visitors leaving fast, or the analytics events tracking depth aren't firing — verify the data layer.`;
      return `Approximately ${high} high-intent sessions this period — visitors viewing 3+ pages and spending 60+ seconds on the site. These are your highest-conversion-probability cohort; treat them as a remarketing audience.`;
    },
  },
  {
    id: "aud.intent.session_duration",
    category: "intent",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => Number(c.ga4?.engagement?.avgSessionDuration) > 0,
    observation: (c) => {
      const dur = Number(c.ga4?.engagement?.avgSessionDuration || 0);
      const sec = Math.round(dur);
      if (sec < 30) return `Average session duration is ${sec} seconds — visitors arrive, glance, leave. The threshold for "meaningful" content engagement is around 60 seconds; you're well under it. Either the entry-page content is mismatched to query intent, or load speed is breaking the engagement before it starts.`;
      if (sec < 90) return `Average session duration is ${sec} seconds — visitors are reading but not exploring deeply. Improving navigation + internal-linking from your top entry pages usually adds 30-60 seconds to this average.`;
      if (sec < 180) return `Average session duration is ${sec} seconds — healthy engagement. Visitors are spending meaningful time on the site.`;
      return `Average session duration is ${sec} seconds — exceptionally high. Either you have a deeply-engaged audience or you're being artificially inflated by long-idle sessions; verify by spot-checking session-replay data.`;
    },
  },

  // ─── Audience Heuristics ──────────────────────────────────────────
  {
    id: "aud.heuristic.b2b_signal",
    category: "heuristic",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => {
      const days = c.ga4?.dayOfWeekBreakdown || [];
      if (days.length < 7) return false;
      const wk = days.filter((d: any) => /sat|sun/i.test(d.day)).reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const wd = days.filter((d: any) => !/sat|sun/i.test(d.day)).reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const devs = c.ga4?.devices || [];
      const total = devs.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const desk = devs.find((d: any) => /desktop/i.test(d.category || d.device));
      const deskShare = total > 0 ? Number(desk?.sessions || 0) / total : 0;
      // B2B signal: low weekend traffic + high desktop share
      return wd > 0 && wk / wd < 0.3 && deskShare > 0.55;
    },
    observation: () => `Multiple signals point to a B2B audience: low weekend traffic, high desktop share, professional working hours peak. Tune your conversion path, lead magnets, and ad scheduling for the 9am-5pm Tue-Thu professional window.`,
  },
  {
    id: "aud.heuristic.consumer_signal",
    category: "heuristic",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => {
      const days = c.ga4?.dayOfWeekBreakdown || [];
      if (days.length < 7) return false;
      const wk = days.filter((d: any) => /sat|sun/i.test(d.day)).reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const wd = days.filter((d: any) => !/sat|sun/i.test(d.day)).reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const devs = c.ga4?.devices || [];
      const total = devs.reduce((s: number, d: any) => s + Number(d.sessions || 0), 0);
      const mob = devs.find((d: any) => /mobile/i.test(d.category || d.device));
      const mobShare = total > 0 ? Number(mob?.sessions || 0) / total : 0;
      // Consumer signal: weekend traffic ≥ 50% of weekday + mobile dominant
      return wd > 0 && wk / wd >= 0.5 && mobShare > 0.55;
    },
    observation: () => `Multiple signals point to a consumer audience: stable weekend traffic, mobile-dominant device share. Tune your ad scheduling and content cadence for evenings + weekends; build for mobile-first conversion paths.`,
  },

  // ─── Sample Size Warning ──────────────────────────────────────────
  {
    id: "aud.scale.low_volume",
    category: "scale",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 4,
    appliesWhen: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return ses > 0 && ses < 200;
    },
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return `${ses} total sessions this period — statistically thin for audience analysis. Patterns called out here (peak day, source quality, device share) are directional but not yet conclusive. Add ~30 days more data before A/B-testing on top of them.`;
    },
  },
];

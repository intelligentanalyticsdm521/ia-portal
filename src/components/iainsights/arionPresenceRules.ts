// arionPresenceRules — v7.9 ARION "Business Presence Score" insight library.
//
// 20 conditional rules covering the cross-channel composite of online
// presence: search visibility, local presence, content velocity, security,
// performance, and the gaps between what is being measured and what is
// still dark.

import { type InsightRule, fmt } from "./insightRules";

// Helper: derive a per-component score from the connected sources.
function components(c: any) {
  // Performance (PSI mobile)
  const psi = c.plugin?.psi || [];
  const latestPsi = psi.length > 0 ? psi[psi.length - 1] : null;
  const performance = Number(latestPsi?.mobileScore ?? latestPsi?.mobile?.performance ?? NaN);
  // Security (Wordfence overall)
  const security = Number(c.plugin?.wfFull?.overall_score ?? NaN);
  // SEO content (avg Rank Math score)
  const content = Number(c.plugin?.seoAgg?.seo?.avg_seo_score ?? NaN);
  // Local (GBP composite)
  const gbpReviewsArr = c.gbpReviews?.reviews || [];
  const responseRate = gbpReviewsArr.length > 0
    ? (gbpReviewsArr.filter((r: any) => r.replyComment).length / gbpReviewsArr.length) * 100
    : NaN;
  const avgRating = Number(c.gbpReviews?.averageRating || NaN);
  const recent30 = gbpReviewsArr.filter((r: any) => {
    if (!r.createTime) return false;
    const days = (Date.now() - new Date(r.createTime).getTime()) / 86400000;
    return days <= 30;
  }).length;
  const local = c.gbp?.connected === true
    ? Math.round(
        (isFinite(avgRating) ? (avgRating / 5) * 40 : 25) +
        Math.min(recent30 / 4, 1) * 30 +
        (isFinite(responseRate) ? (responseRate / 100) * 30 : 15)
      )
    : NaN;
  // Search visibility — derive from GSC position
  const pos = Number(c.gsc?.summary?.avgPosition || NaN);
  const search = isFinite(pos)
    ? pos <= 5 ? 95
      : pos <= 10 ? 80
      : pos <= 20 ? 55
      : pos <= 30 ? 35
      : 20
    : NaN;
  return { performance, security, content, local, search };
}

function compositeScore(c: any): { score: number | null; usable: Array<{ label: string; score: number }> } {
  const parts = components(c);
  const usable = Object.entries(parts)
    .filter(([, v]) => isFinite(v as number))
    .map(([k, v]) => ({ label: k, score: v as number }));
  if (usable.length === 0) return { score: null, usable: [] };
  const score = Math.round(usable.reduce((s, p) => s + p.score, 0) / usable.length);
  return { score, usable };
}

export const PRESENCE_RULES: InsightRule[] = [
  // ─── Composite Headline ───────────────────────────────────────────
  {
    id: "presence.composite.score",
    category: "composite",
    kind: "observation",
    dataSources: ["ga4", "gsc", "gbp", "plugin"],
    priority: 10,
    appliesWhen: (c) => compositeScore(c).usable.length > 0,
    observation: (c) => {
      const { score, usable } = compositeScore(c);
      if (score == null) return "";
      const parts = usable.map((p) => `${p.label} ${Math.round(p.score)}`).join(" · ");
      const range = score >= 75 ? "strong" : score >= 55 ? "solid" : score >= 35 ? "needs attention" : "low";
      return `Your overall business presence score is ${score}/100 (${range}), averaged across ${usable.length} measured component${usable.length === 1 ? "" : "s"}: ${parts}.`;
    },
  },
  {
    id: "presence.composite.coverage_gap",
    category: "composite",
    kind: ["observation", "action"],
    dataSources: ["ga4", "gsc", "gbp", "plugin"],
    priority: 8,
    appliesWhen: (c) => compositeScore(c).usable.length < 4,
    observation: (c) => {
      const { usable } = compositeScore(c);
      const measured = usable.map((p) => p.label);
      const all = ["performance", "security", "content", "local", "search"];
      const missing = all.filter((x) => !measured.includes(x));
      if (missing.length === 0) return "";
      return `Your presence score is averaged across ${usable.length} of 5 possible components — ${missing.join(", ")} ${missing.length === 1 ? "is not" : "are not"} connected yet. Adding the missing data sources expands the score's accuracy.`;
    },
    action: () => `Connect any missing data sources from the Connected Accounts settings — each additional source narrows the gap between measured and actual presence.`,
  },
  {
    id: "presence.composite.weakest_link",
    category: "composite",
    kind: ["observation", "action"],
    dataSources: ["ga4", "gsc", "gbp", "plugin"],
    priority: 9,
    appliesWhen: (c) => compositeScore(c).usable.length >= 2,
    observation: (c) => {
      const { usable } = compositeScore(c);
      const weakest = usable.slice().sort((a, b) => a.score - b.score)[0];
      const gap = Math.round((usable.reduce((s, p) => s + p.score, 0) / usable.length) - weakest.score);
      if (gap < 10) return "";
      return `Your weakest component is ${weakest.label} at ${Math.round(weakest.score)}/100 — ${gap} points below your average. Closing this gap is the single highest-leverage move on your overall presence score.`;
    },
    action: (c) => {
      const { usable } = compositeScore(c);
      const weakest = usable.slice().sort((a, b) => a.score - b.score)[0];
      const map: Record<string, string> = {
        performance: `Run Lighthouse on the homepage and address the top 3 opportunities — typically render-blocking JS, oversized images, and CLS.`,
        security: `Open the Security Overview page — install or reconfigure Wordfence, enable 2FA on all admin accounts, and resolve any critical scan findings.`,
        content: `Audit posts with Rank Math SEO scores below 50 — fix focus keywords, meta descriptions, and heading hierarchy on the top-traffic ones.`,
        local: `Reply to unanswered GBP reviews, publish 1 GBP post this week, and upload 3-5 photos. Each compounds your local-pack ranking.`,
        search: `Identify quick-win keywords ranking 11-20 in SE Ranking. A focused content refresh + 2-3 internal links can push them onto page 1.`,
      };
      return map[weakest.label] || "";
    },
  },
  {
    id: "presence.composite.strongest_link",
    category: "composite",
    kind: "observation",
    dataSources: ["ga4", "gsc", "gbp", "plugin"],
    priority: 4,
    appliesWhen: (c) => compositeScore(c).usable.length >= 2,
    observation: (c) => {
      const { usable } = compositeScore(c);
      const strongest = usable.slice().sort((a, b) => b.score - a.score)[0];
      if (strongest.score < 80) return "";
      return `Your strongest component is ${strongest.label} at ${Math.round(strongest.score)}/100. Protect this — high-component scores decay if maintenance is dropped.`;
    },
  },

  // ─── Component-Specific ───────────────────────────────────────────
  {
    id: "presence.search.no_position",
    category: "search-presence",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => Number(c.gsc?.summary?.avgPosition || 0) === 0,
    observation: () => `Search Console isn't reporting an average position — either the property has no ranking queries yet or GSC hasn't accumulated enough data. Until search visibility data exists, it's a missing leg of the presence composite.`,
    action: () => `Confirm GSC is verified for the site domain (not just www) and that the sitemap is submitted. Position data usually appears within 7-14 days of indexing.`,
  },
  {
    id: "presence.local.no_gbp",
    category: "local-presence",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 8,
    appliesWhen: (c) => c.gbp?.connected !== true,
    observation: () => `Google Business Profile not connected. For service businesses, local presence is often the largest single component of presence — Maps discovery is invisible without it.`,
    action: () => `Connect GBP in Settings → Connected Accounts. Local component lights up immediately once linked.`,
  },
  {
    id: "presence.security.no_wf",
    category: "security-posture",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 8,
    appliesWhen: (c) => c.plugin?.wfFull && !c.plugin.wfFull.installed,
    observation: () => `Wordfence not installed. Security posture is currently unmeasured + unprotected — a public WordPress site without a firewall is exposed to commodity attacks regardless of how careful the rest of your security is.`,
    action: () => `Install Wordfence (free tier sufficient). Enable Firewall, Login Security (2FA), and daily scans within 15 minutes of activation.`,
  },
  {
    id: "presence.performance.no_psi",
    category: "performance-posture",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 6,
    appliesWhen: (c) => {
      const psi = c.plugin?.psi;
      return !Array.isArray(psi) || psi.length === 0;
    },
    observation: () => `No PageSpeed data captured yet. The monthly PSI snapshot fires on the 1st of each month — first measurement may be a few weeks out depending on provisioning date. Run a manual snapshot from the Core Web Vitals page to get a baseline now.`,
  },
  {
    id: "presence.content.no_plugin",
    category: "content-posture",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 6,
    appliesWhen: (c) => Number(c.plugin?.seoAgg?.seo?.avg_seo_score || 0) === 0,
    observation: () => `Content-side presence is unmeasured — either the IA Plugin isn't connected, or no posts have Rank Math SEO scores populated. Connecting the plugin auto-populates within 24 hours.`,
  },

  // ─── Trend Direction ──────────────────────────────────────────────
  {
    id: "presence.trend.improving",
    category: "trend",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 5,
    appliesWhen: (c) => {
      const dates = c.gsc?.breakdowns?.dates || [];
      return dates.length >= 30;
    },
    observation: (c) => {
      const dates = (c.gsc?.breakdowns?.dates || []).slice().sort((a: any, b: any) => a.date.localeCompare(b.date));
      if (dates.length < 30) return "";
      const half = Math.floor(dates.length / 2);
      const firstClicks = dates.slice(0, half).reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
      const secondClicks = dates.slice(half).reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
      const firstImp = dates.slice(0, half).reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
      const secondImp = dates.slice(half).reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
      if (firstClicks === 0 && firstImp === 0) return "";
      const clickChange = firstClicks > 0 ? ((secondClicks - firstClicks) / firstClicks) * 100 : 0;
      const impChange = firstImp > 0 ? ((secondImp - firstImp) / firstImp) * 100 : 0;
      if (clickChange > 15 && impChange > 0) return `Search clicks grew ${Math.round(clickChange)}% over the last ${Math.round(dates.length / 2)} days — your search presence is on an upward trajectory. Continue current content + SEO investments.`;
      if (clickChange < -15) return `Search clicks declined ${Math.abs(Math.round(clickChange))}% over the last ${Math.round(dates.length / 2)} days. Decline of this magnitude usually signals an algorithm update, seasonal demand shift, or technical regression. Investigate GSC Coverage + Core Web Vitals.`;
      return "";
    },
  },

  // ─── Cross-Source Synthesis ──────────────────────────────────────
  {
    id: "presence.synthesis.cross_source_alignment",
    category: "cross-source",
    kind: "observation",
    dataSources: ["gsc", "gbp", "ga4"],
    priority: 5,
    appliesWhen: (c) => {
      return c.gbp?.connected === true && Number(c.gsc?.summary?.impressions || 0) > 0 && Number(c.ga4?.summary?.totalSessions || 0) > 0;
    },
    observation: (c) => {
      const gsc = Number(c.gsc?.summary?.impressions || 0);
      const gbp = Number(c.gbp?.metrics?.impressions || 0);
      const ga4 = Number(c.ga4?.summary?.totalSessions || 0);
      const total = gsc + gbp;
      if (total === 0) return "";
      const visitRate = ((ga4 / total) * 100).toFixed(2);
      return `Across measured surfaces this period: ${fmt(gsc)} search impressions + ${fmt(gbp)} GBP impressions → ${fmt(ga4)} website visits. End-to-end conversion from Google touch to website visit: ${visitRate}%. Every percentage point gained here is pure compounding return on your existing presence investments.`;
    },
  },
  {
    id: "presence.synthesis.review_to_traffic",
    category: "cross-source",
    kind: "observation",
    dataSources: ["gbp", "ga4"],
    priority: 5,
    appliesWhen: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const avg = Number(c.gbpReviews?.averageRating || 0);
      return c.gbp?.connected === true && reviews.length >= 5 && avg > 0;
    },
    observation: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const avg = Number(c.gbpReviews?.averageRating || 0);
      const responseRate = Math.round((reviews.filter((r: any) => r.replyComment).length / reviews.length) * 100);
      if (avg >= 4.5 && responseRate >= 70) return `Your reputation profile (${avg.toFixed(1)}★ across ${reviews.length} reviews, ${responseRate}% response rate) is a measurable competitive advantage for local-pack inclusion. Defend it — review response cadence + new-review velocity are both monitored signals.`;
      if (avg >= 4.0 && responseRate < 50) return `Your ${avg.toFixed(1)}★ rating is competitive but the ${responseRate}% review-response rate is dragging your local ranking. Catching up on replies is the single fastest local-presence lift you can make this week.`;
      return "";
    },
  },

  // ─── Coverage Snapshot ────────────────────────────────────────────
  {
    id: "presence.coverage.connected_count",
    category: "coverage",
    kind: "observation",
    dataSources: ["ga4", "gsc", "gbp", "plugin"],
    priority: 4,
    appliesWhen: () => true,
    observation: (c) => {
      const connected = [];
      if (c.ga4?.summary != null) connected.push("GA4");
      if (c.gsc?.summary?.impressions != null) connected.push("GSC");
      if (c.gbp?.connected === true) connected.push("GBP");
      if (c.bing?.connected === true) connected.push("Bing");
      if (c.seo?.connected === true) connected.push("SE Ranking");
      if (c.plugin?.wfFull?.installed === true) connected.push("Wordfence");
      if (c.plugin?.psi != null) connected.push("PSI");
      return `Data sources currently feeding presence analysis: ${connected.length > 0 ? connected.join(" · ") : "none"}. ${connected.length < 4 ? "Adding the missing sources expands the accuracy of every other observation." : "Strong cross-source coverage — most observations have enough data to be reliable."}`;
    },
  },

  // ─── Recommended Investment Direction ─────────────────────────────
  {
    id: "presence.invest.local_first",
    category: "investment",
    kind: "observation",
    dataSources: ["gbp", "gsc"],
    priority: 6,
    appliesWhen: (c) => {
      const gsc = Number(c.gsc?.summary?.impressions || 0);
      const gbp = Number(c.gbp?.metrics?.impressions || 0);
      return c.gbp?.connected === true && gbp > 0 && gsc > 0 && gbp > gsc;
    },
    observation: (c) => {
      const gsc = Number(c.gsc?.summary?.impressions || 0);
      const gbp = Number(c.gbp?.metrics?.impressions || 0);
      const ratio = (gbp / gsc).toFixed(1);
      return `GBP is delivering ${ratio}x more impressions than organic search. Local presence is your dominant surface — investment in GBP optimisation (photos, posts, reviews) has more leverage than blog content for the next quarter.`;
    },
  },
  {
    id: "presence.invest.search_first",
    category: "investment",
    kind: "observation",
    dataSources: ["gbp", "gsc"],
    priority: 6,
    appliesWhen: (c) => {
      const gsc = Number(c.gsc?.summary?.impressions || 0);
      const gbp = Number(c.gbp?.metrics?.impressions || 0);
      return Number(gsc) > 0 && (c.gbp?.connected !== true || Number(gbp) < Number(gsc) * 0.3);
    },
    observation: (c) => {
      const gsc = Number(c.gsc?.summary?.impressions || 0);
      return `Organic search (${fmt(gsc)} impressions) significantly outweighs your local presence. Content + on-page SEO have the most leverage on your overall presence right now — local optimisation is a secondary investment.`;
    },
  },

  // ─── Data Confidence ──────────────────────────────────────────────
  {
    id: "presence.confidence.scale_warning",
    category: "confidence",
    kind: "observation",
    dataSources: ["ga4", "gsc"],
    priority: 3,
    appliesWhen: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return ses > 0 && imp > 0 && ses < 200 && imp < 500;
    },
    observation: () => `Data volume is still thin (sessions < 200, impressions < 500). Presence score will become more reliable once you sustain 500+ sessions/month + 1000+ search impressions. Patterns called out here are directional in the meantime.`,
  },
];

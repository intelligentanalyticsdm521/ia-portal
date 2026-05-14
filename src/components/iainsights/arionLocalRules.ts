// arionLocalRules — v7.9 ARION "Local Presence & Reputation" insight library.
//
// 22 conditional rules covering GBP performance, review velocity + health,
// posts cadence, Q&A engagement, photo/asset completeness, NAP signals,
// local-pack visibility, and the connection between local signals and
// actual local search performance.

import { type InsightRule, fmt, pct } from "./insightRules";

export const LOCAL_RULES: InsightRule[] = [
  // ─── GBP Connection + Core Volume ─────────────────────────────────
  {
    id: "local.gbp.connection_gap",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 10,
    appliesWhen: (c) => c.gbp?.connected !== true,
    observation: () => `Google Business Profile is not connected. For a local-service business this is the single biggest local-presence blind spot — GBP often delivers more impressions than organic search, and Maps discovery is invisible without it.`,
    action: () => `Connect Google Business Profile in Settings → Connected Accounts. Once connected, ARION pulls impressions, calls, website clicks, photos viewed, direction requests, and review velocity into the Local Presence + Visibility & Reach engines.`,
  },
  {
    id: "local.gbp.impression_volume",
    category: "scale",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 7,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) >= 0,
    observation: (c) => {
      const imp = Number(c.gbp?.metrics?.impressions || 0);
      if (imp === 0) return `GBP is connected but reporting 0 impressions this period. Either the listing was recently created and hasn't accumulated visibility yet, or the listing is suppressed (verify "currently visible" in GBP).`;
      if (imp < 100) return `${imp} GBP impressions this period — minimal local visibility. New listings typically take 60-90 days to accumulate baseline impressions; verify the business category + service area are accurately configured.`;
      if (imp < 1000) return `${fmt(imp)} GBP impressions — moderate local visibility. Categories + posts + photos are the highest-leverage levers at this scale.`;
      return `${fmt(imp)} GBP impressions — strong local visibility. Protect this with consistent posting + review velocity; local signals decay faster than search rankings.`;
    },
  },

  // ─── Action Distribution ──────────────────────────────────────────
  {
    id: "local.gbp.calls_vs_clicks",
    category: "actions",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 8,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) > 0,
    observation: (c) => {
      const m = c.gbp?.metrics || {};
      const clicks = Number(m.websiteClicks || 0);
      const calls = Number(m.calls || 0);
      const directions = Number(m.directions || 0);
      const total = clicks + calls + directions;
      if (total === 0) return `Zero customer actions this period (0 website clicks, 0 calls, 0 direction requests). Either impressions aren't translating to interest (poor listing assets), or visitors are reading the listing details and self-serving without clicking through.`;
      if (calls > clicks * 2) return `${calls} calls vs ${clicks} website clicks — phone is the dominant local conversion channel. Track phone calls as a conversion in GA4 + SPARK, and keep click-to-call buttons prominent on the mobile site.`;
      if (clicks > calls * 2) return `${clicks} website clicks vs ${calls} calls — visitors prefer to research on the website before making contact. Ensure the homepage has a clear "Get a quote" path within the first scroll.`;
      return `${clicks} website clicks + ${calls} calls + ${directions} direction requests — balanced action distribution. All three are active conversion paths.`;
    },
  },
  {
    id: "local.gbp.directions_signal",
    category: "actions",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 4,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.directions || 0) > 0,
    observation: (c) => {
      const d = Number(c.gbp?.metrics?.directions || 0);
      return `${d} direction request${d === 1 ? "" : "s"} this period — visitors are planning to visit in person. If you have a physical location, this is a strong walk-in-traffic signal; if you're service-area-only, verify "service area" is configured correctly (your address shouldn't be displayed).`;
    },
  },

  // ─── Maps vs Search Surface ───────────────────────────────────────
  {
    id: "local.gbp.maps_dominant",
    category: "surface",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 6,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) > 100,
    observation: (c) => {
      const m = c.gbp?.metrics || {};
      const imp = Number(m.impressions || 0);
      const maps = Number(m.impressionsDesktopMaps || 0) + Number(m.impressionsMobileMaps || 0);
      const search = Number(m.impressionsDesktopSearch || 0) + Number(m.impressionsMobileSearch || 0);
      const mapsPct = imp > 0 ? Math.round((maps / imp) * 100) : 0;
      const searchPct = imp > 0 ? Math.round((search / imp) * 100) : 0;
      if (mapsPct > 60) return `${mapsPct}% of GBP impressions come from Maps navigation, ${searchPct}% from Search. People are looking for businesses in your area on the Maps app — citation consistency (NAP across the web), accurate categories, and address accuracy matter more than blog content for Maps ranking.`;
      if (searchPct > 60) return `${searchPct}% of GBP impressions come from Search, ${mapsPct}% from Maps. Your listing is showing up in Search results — keyword-rich GBP descriptions and posts matter more than Maps-specific citations.`;
      return `${searchPct}% Search / ${mapsPct}% Maps — balanced surface. Invest in both: descriptions + posts for Search, NAP citations + photos for Maps.`;
    },
  },
  {
    id: "local.gbp.mobile_dominance",
    category: "surface",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 5,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) > 50,
    observation: (c) => {
      const m = c.gbp?.metrics || {};
      const imp = Number(m.impressions || 0);
      const mobile = Number(m.impressionsMobileMaps || 0) + Number(m.impressionsMobileSearch || 0);
      const desktop = Number(m.impressionsDesktopMaps || 0) + Number(m.impressionsDesktopSearch || 0);
      const mobilePct = imp > 0 ? Math.round((mobile / imp) * 100) : 0;
      if (mobilePct > 70) return `${mobilePct}% of GBP impressions are mobile — local discovery is overwhelmingly happening on phones. Your photos, business hours, and description are the first impression for almost everyone who finds you. Optimise for mobile-first viewing.`;
      if (mobilePct < 30) return `Only ${mobilePct}% of GBP impressions are mobile (${100 - mobilePct}% desktop). Unusual for a local business — verify the listing is correctly serving in mobile search.`;
      return `${mobilePct}% mobile / ${100 - mobilePct}% desktop GBP impressions — typical mix.`;
    },
  },

  // ─── Reviews ──────────────────────────────────────────────────────
  {
    id: "local.reviews.no_reviews",
    category: "reviews",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 9,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbpReviews?.totalReviewCount || 0) === 0,
    observation: () => `No reviews on your GBP listing yet. The first 5 reviews carry the most local-ranking weight; reviews are also the single biggest local-trust signal a prospective customer reads.`,
    action: () => `Request reviews from your 5-10 best customers this week. Send a follow-up email after a completed job with a direct review link (use the GBP-provided short link, not the maps URL).`,
  },
  {
    id: "local.reviews.rating_distribution",
    category: "reviews",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 7,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbpReviews?.totalReviewCount || 0) > 0,
    observation: (c) => {
      const total = Number(c.gbpReviews?.totalReviewCount || 0);
      const avg = Number(c.gbpReviews?.averageRating || 0);
      if (avg >= 4.7) return `${avg.toFixed(1)}★ average across ${total} reviews — exceptional rating. Above 4.7★ separates trusted local businesses from average; protect this with quick reply cadence + responsive customer service.`;
      if (avg >= 4.3) return `${avg.toFixed(1)}★ average across ${total} reviews — solid. Most local-pack winners cluster at 4.3-4.7★; you're competitive.`;
      if (avg >= 3.8) return `${avg.toFixed(1)}★ average across ${total} reviews — below the 4.3★ threshold most local-pack winners maintain. Each new 5★ review pulls your average up toward that threshold; targeted asks to customers who left positive verbal feedback can close the gap.`;
      return `${avg.toFixed(1)}★ average across ${total} reviews — actively hurting local rankings. Below 4.0★ is a red flag for prospective customers and a measurable headwind on local-pack inclusion. Address the underlying service issues driving negative reviews before requesting new ones.`;
    },
  },
  {
    id: "local.reviews.velocity",
    category: "reviews",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 8,
    appliesWhen: (c) => c.gbp?.connected === true && Array.isArray(c.gbpReviews?.reviews),
    observation: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const recent30 = reviews.filter((r: any) => {
        if (!r.createTime) return false;
        const days = (Date.now() - new Date(r.createTime).getTime()) / 86400000;
        return days <= 30;
      }).length;
      if (recent30 === 0) return `Zero new reviews in the last 30 days. Review recency is a local ranking signal — businesses with consistent monthly velocity outrank those with stale review profiles.`;
      if (recent30 >= 5) return `${recent30} new reviews in the last 30 days — excellent velocity. Reviews are compounding local ranking signals; maintain the cadence.`;
      return `${recent30} new review${recent30 === 1 ? "" : "s"} in the last 30 days. Healthy cadence; aim for at least 1-2 per month to maintain the recency signal.`;
    },
  },
  {
    id: "local.reviews.response_rate",
    category: "reviews",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 8,
    appliesWhen: (c) => c.gbp?.connected === true && Array.isArray(c.gbpReviews?.reviews) && c.gbpReviews.reviews.length > 0,
    observation: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const unanswered = reviews.filter((r: any) => !r.replyComment).length;
      const responseRate = Math.round(((reviews.length - unanswered) / reviews.length) * 100);
      if (responseRate < 50) return `You've replied to ${responseRate}% of your ${reviews.length} visible reviews. Google explicitly factors review-response rate into local ranking; businesses replying to 80%+ outrank lower-response competitors in local-pack results.`;
      if (responseRate < 80) return `${responseRate}% review-response rate. Below the 80% threshold that meaningfully impacts local ranking. Reply to the recent unanswered reviews this week.`;
      return `${responseRate}% review-response rate — strong. Owners who reply to 80%+ of reviews see a measurable local-pack ranking lift.`;
    },
    action: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const unanswered = reviews.filter((r: any) => !r.replyComment).length;
      if (unanswered === 0) return `Maintain the weekly check-in cadence so new reviews get a reply within 48 hours, which Google weights for response-time ranking.`;
      return `Reply to your ${unanswered} unanswered review${unanswered === 1 ? "" : "s"} this week. Keep replies under 150 words: acknowledge the reviewer by name, thank them, add one specific detail about the service.`;
    },
  },
  {
    id: "local.reviews.negative_recent",
    category: "reviews",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 9,
    appliesWhen: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      return reviews.some((r: any) => {
        if (!r.createTime || !r.starRating) return false;
        const days = (Date.now() - new Date(r.createTime).getTime()) / 86400000;
        return days <= 30 && Number(r.starRating) <= 3;
      });
    },
    observation: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const recentNeg = reviews.filter((r: any) => {
        if (!r.createTime) return false;
        const days = (Date.now() - new Date(r.createTime).getTime()) / 86400000;
        return days <= 30 && Number(r.starRating) <= 3;
      });
      return `${recentNeg.length} ${recentNeg.length === 1 ? "low-star review (1-3★)" : "low-star reviews (1-3★)"} in the last 30 days. Each negative review needs a thoughtful, public reply within 48 hours — both for the reviewer and for everyone who will read it later.`;
    },
    action: () => `Reply to each low-star review individually within 48 hours. Don't argue facts; acknowledge feelings, offer a path to resolution offline, and keep the reply professional and short. Other prospective customers read these replies more than the original reviews.`,
  },

  // ─── Posts ────────────────────────────────────────────────────────
  {
    id: "local.posts.cadence",
    category: "posts",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 7,
    appliesWhen: (c) => c.gbp?.connected === true,
    observation: (c) => {
      const posts = c.gbpPosts?.posts || [];
      const recent30 = posts.filter((p: any) => {
        if (!p.createTime) return false;
        const days = (Date.now() - new Date(p.createTime).getTime()) / 86400000;
        return days <= 30;
      }).length;
      if (recent30 === 0) return `Zero GBP posts in the last 30 days. Posts are the freshness signal for your local listing — businesses that post weekly receive significantly more profile views than those that don't.`;
      if (recent30 >= 4) return `${recent30} GBP posts in the last 30 days — strong cadence. Posts boost listing freshness + give returning visitors a reason to re-engage. Maintain weekly cadence.`;
      return `${recent30} GBP post${recent30 === 1 ? "" : "s"} in the last 30 days. Weekly is the recommended cadence; you're at roughly ${(recent30 / 4).toFixed(1)} per week. A "What's New" post about a recent project takes 5 minutes.`;
    },
    action: (c) => {
      const posts = c.gbpPosts?.posts || [];
      const recent30 = posts.filter((p: any) => {
        if (!p.createTime) return false;
        const days = (Date.now() - new Date(p.createTime).getTime()) / 86400000;
        return days <= 30;
      }).length;
      if (recent30 >= 4) return "";
      return `Set a weekly calendar block to publish one GBP post — a recent job, an offer, or a seasonal update. Take 3-5 photos on every job site to fuel the queue.`;
    },
  },

  // ─── Q&A ──────────────────────────────────────────────────────────
  {
    id: "local.qanda.unanswered",
    category: "qanda",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 7,
    appliesWhen: (c) => c.gbp?.connected === true && Array.isArray(c.gbpQanda?.questions),
    observation: (c) => {
      const questions = c.gbpQanda?.questions || [];
      const unanswered = questions.filter((q: any) => q.needsReply).length;
      if (unanswered === 0 && questions.length > 0) return `All ${questions.length} customer questions on your GBP have been answered — excellent. Owner-answered Q&A is a strong trust signal and influences local ranking.`;
      if (unanswered === 0) return "";
      return `${unanswered} unanswered question${unanswered === 1 ? "" : "s"} on your GBP listing. Questions appear publicly on your listing and influence ranking — leaving them unanswered means anyone reading them sees an unresponsive business AND lets Google's algorithm flag the listing as low-engagement.`;
    },
    action: (c) => {
      const questions = c.gbpQanda?.questions || [];
      const unanswered = questions.filter((q: any) => q.needsReply).length;
      if (unanswered === 0) return "";
      return `Answer all ${unanswered} unanswered questions today — they are visible to every potential customer viewing your listing right now. Concise, helpful answers (3-4 sentences) work best.`;
    },
  },

  // ─── Photos / Assets ──────────────────────────────────────────────
  {
    id: "local.assets.photo_count",
    category: "assets",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 6,
    appliesWhen: (c) => c.gbp?.connected === true && c.gbp?.metrics?.photoCount != null,
    observation: (c) => {
      const count = Number(c.gbp?.metrics?.photoCount || 0);
      if (count < 10) return `Your GBP listing has ${count} photos. Listings with 25+ photos receive ~35% more clicks to website + 42% more direction requests than listings with <10. Photos are the single most under-invested asset on most local listings.`;
      if (count < 25) return `${count} photos on your listing — passable but below the 25+ threshold that meaningfully lifts click + direction requests. Add 3-5 photos per month (job photos, before/after, team).`;
      return `${count} photos on your listing — strong asset library. Maintain monthly additions to keep the "recently added" signal fresh.`;
    },
    action: (c) => {
      const count = Number(c.gbp?.metrics?.photoCount || 0);
      if (count >= 25) return "";
      return `Upload 3-5 photos this week. Best types for local-pack ranking: before/after work, the team on a job site, your service vehicle/equipment, and the storefront/office.`;
    },
  },
  {
    id: "local.assets.business_description",
    category: "assets",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 4,
    appliesWhen: (c) => c.gbp?.connected === true && c.gbp?.description != null,
    observation: (c) => {
      const desc = String(c.gbp?.description || "");
      const len = desc.length;
      if (len === 0) return `GBP business description is empty. Description supports your local-search keyword footprint — the first 250 characters appear in search snippets and are the strongest keyword-relevance signal.`;
      if (len < 250) return `GBP business description is ${len} characters — short. Google allows up to 750 chars; the first 250 carry the most weight but the full description still feeds the ranking algorithm. Add another paragraph covering your top services + service area.`;
      if (len < 750) return `GBP business description is ${len} characters out of 750 available. Good baseline; expand to fill more of the allowance with service-specific keywords + locations.`;
      return `GBP business description fully populated (${len} chars). Maintain it; review quarterly to ensure it still reflects current services + service area.`;
    },
  },

  // ─── Local Pack / Search Performance ──────────────────────────────
  {
    id: "local.pack.gbp_organic_overlap",
    category: "search-correlation",
    kind: "observation",
    dataSources: ["gbp", "gsc"],
    priority: 5,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) > 0 && Number(c.gsc?.summary?.impressions || 0) > 0,
    observation: (c) => {
      const gbpImp = Number(c.gbp?.metrics?.impressions || 0);
      const gscImp = Number(c.gsc?.summary?.impressions || 0);
      const ratio = gscImp > 0 ? gbpImp / gscImp : 0;
      if (ratio > 2) return `Your GBP delivers ${ratio.toFixed(1)}x more impressions than your organic search. Local visibility is significantly outpacing your search presence — this is typical for service-area businesses and means optimisation effort on GBP categories, posts, and photos has more leverage than blog content.`;
      if (ratio < 0.5) return `GBP impressions (${fmt(gbpImp)}) are less than half of organic search impressions (${fmt(gscImp)}). Your search presence outweighs your local presence — there's significant headroom to grow Maps visibility with better GBP optimisation.`;
      return `GBP (${fmt(gbpImp)} impressions) and organic search (${fmt(gscImp)}) are within range of each other — balanced Google surface area. Continue optimising both equally.`;
    },
  },

  // ─── NAP Consistency Signals ──────────────────────────────────────
  {
    id: "local.nap.address_visible",
    category: "nap",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 4,
    appliesWhen: (c) => c.gbp?.connected === true && c.gbp?.address != null,
    observation: (c) => {
      const addr = c.gbp?.address;
      const isServiceArea = c.gbp?.isServiceArea === true;
      if (isServiceArea) return `Your listing is configured as a service-area business — physical address is hidden from searchers, only service areas are shown. This is correct if you travel to customers; verify your service-area cities accurately reflect where you actively serve.`;
      if (addr) return `Your physical address is visible on the listing. This is correct for storefronts + offices. If you primarily travel to customers, consider switching to service-area mode (hides address, shows service areas instead).`;
      return "";
    },
  },

  // ─── Apple Maps / Bing Places ─────────────────────────────────────
  {
    id: "local.platforms.bing_apple_gap",
    category: "platform-gaps",
    kind: "observation",
    dataSources: ["bing"],
    priority: 3,
    appliesWhen: () => true,
    observation: () => `Bing Places and Apple Maps presence isn't tracked in IA Insights yet. Combined they account for ~8-12% of local search traffic — verifying your business on both platforms takes ~15 minutes each and adds two more search surfaces you control.`,
  },

  // ─── Data Quality ─────────────────────────────────────────────────
  {
    id: "local.data.scale_warning",
    category: "scale",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 3,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) > 0 && Number(c.gbp?.metrics?.impressions || 0) < 100,
    observation: (c) => {
      const imp = Number(c.gbp?.metrics?.impressions || 0);
      return `${imp} GBP impressions this period — thin sample. Patterns called out here (action distribution, surface mix) are directional but not yet statistically reliable. Revisit local analytics once you sustain 300+ monthly impressions.`;
    },
  },
];

// arionVisibilityRules — v7.6 ARION "Visibility & Reach" insight library.
//
// 25+ conditional rules covering:
//   - GSC core metrics (impressions, clicks, CTR, position, ratios)
//   - GA4 traffic source/share/quality
//   - Device distribution
//   - Geographic concentration
//   - GBP local visibility
//   - Bing visibility
//   - Cross-source aggregations
//   - Brand vs non-brand split
//
// Stable rule IDs are used by the quarterly review process — never
// renumber, retire instead.

import { type InsightRule, fmt, expectedCtrAt } from "./insightRules";
import { GBP_ENABLED } from "../../config/featureFlags";

export const VISIBILITY_RULES: InsightRule[] = [
  // ─── GSC Core ──────────────────────────────────────────────────────
  {
    id: "vis.gsc.impression_visit_ratio",
    category: "search-traffic",
    kind: "observation",
    dataSources: ["gsc", "ga4"],
    priority: 9,
    appliesWhen: (c) => {
      const imp = Number(c.gsc?.summary?.impressions || 0);
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return imp > 0 && ses > 0;
    },
    observation: (c) => {
      const imp = Number(c.gsc?.summary?.impressions || 0);
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const ratio = Math.round(imp / Math.max(1, ses));
      const dom = c.domain || "your site";
      return `${dom} received ${fmt(imp)} search impressions this period but only ${fmt(ses)} website visits — a ${ratio}:1 impression-to-visit ratio. For every ${ratio} people who saw the business in search, only 1 visited the website.`;
    },
  },
  {
    id: "vis.gsc.position_consideration",
    category: "search-traffic",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 8,
    appliesWhen: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      return pos > 0;
    },
    observation: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      if (pos <= 10) return `Average search position is ${pos.toFixed(1)} — you're on page 1 of Google, which puts you in the consideration set for most queries.`;
      if (pos <= 20) return `Average search position is ${pos.toFixed(1)} — you're on page 2. Page-2 results capture only ~6% of clicks compared to page 1; moving the top 5 queries onto page 1 is the single biggest visibility lever you have.`;
      if (pos <= 30) return `Average search position is ${pos.toFixed(1)} — that's deep page 2 / early page 3. Realistically you're not in the consideration set for most queries; SEO content + internal-linking work over 60-90 days is the path to recovery.`;
      return `Average search position is ${pos.toFixed(1)} — practically invisible in search. Until you publish targeted content + accumulate backlinks, organic search will not be a meaningful acquisition channel.`;
    },
  },
  {
    id: "vis.gsc.ctr_vs_benchmark",
    category: "search-traffic",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 8,
    appliesWhen: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      const ctr = Number(c.gsc?.summary?.ctr || 0);
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return pos > 0 && imp > 100 && ctr >= 0;
    },
    observation: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      const ctr = Number(c.gsc?.summary?.ctr || 0);
      const imp = Number(c.gsc?.summary?.impressions || 0);
      const expCtr = expectedCtrAt(pos);
      const gap = Number((expCtr - ctr).toFixed(2));
      if (gap > 0.5) {
        const missed = Math.round((gap / 100) * imp);
        return `At an average position of ${pos.toFixed(1)}, industry benchmark CTR is ~${expCtr}%. Your actual CTR is ${ctr.toFixed(2)}% — a ${gap.toFixed(2)}-point gap representing approximately ${fmt(missed)} additional monthly clicks you could recover by rewriting the title tags and meta descriptions on your top-impression pages.`;
      }
      if (gap < -0.5) {
        return `Your CTR (${ctr.toFixed(2)}%) is OUTPERFORMING the industry benchmark (${expCtr}%) at position ${pos.toFixed(1)}. Your snippets are working — focus optimisation on moving positions up rather than on snippet tweaks.`;
      }
      return `Your CTR (${ctr.toFixed(2)}%) matches the industry benchmark (${expCtr}%) at position ${pos.toFixed(1)}. Snippet quality is on-par; focus on raising position, not on rewriting titles.`;
    },
  },
  {
    id: "vis.gsc.clicks_volume",
    category: "search-traffic",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => Number(c.gsc?.summary?.clicks || 0) >= 0,
    observation: (c) => {
      const clicks = Number(c.gsc?.summary?.clicks || 0);
      if (clicks === 0) return `Google Search Console reports 0 clicks this period — either the property is brand-new, the analytics window is short, or your site isn't ranking on any indexed queries.`;
      if (clicks < 25) return `Only ${clicks} clicks from organic search this period — search is currently a secondary acquisition channel. To make organic a primary channel you need either more content (broader query coverage) or higher rankings (better positions on the queries you already cover).`;
      if (clicks < 100) return `${clicks} clicks from organic search this period — search is starting to deliver but is not yet at scale. Compound this with consistent content + backlinks and traffic should approximately double every 6 months.`;
      return `${fmt(clicks)} clicks from organic search this period — organic is a meaningful acquisition channel. Protect this surface area with content refreshes + technical SEO maintenance.`;
    },
  },
  {
    id: "vis.gsc.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 10,
    appliesWhen: (c) => !c.gsc || c.gsc?.summary?.impressions == null,
    observation: () => `Google Search Console is not connected (or hasn't returned data yet). Without GSC there's no visibility into search impressions, CTR, average position, or top queries — those are the inputs to most other Visibility & Reach observations.`,
    action: () => `Connect Google Search Console in Settings → Connected Accounts. GSC takes 28-90 days to accumulate enough data for meaningful trend analysis, so connecting earlier compounds the value.`,
  },

  // ─── Device Distribution ───────────────────────────────────────────
  {
    id: "vis.gsc.mobile_share",
    category: "device",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 6,
    appliesWhen: (c) => {
      const dev = c.gsc?.breakdowns?.devices;
      return Array.isArray(dev) && dev.length >= 2;
    },
    observation: (c) => {
      const dev = c.gsc?.breakdowns?.devices || [];
      const total = dev.reduce((s: number, d: any) => s + Number(d.impressions || 0), 0);
      const mobile = dev.find((d: any) => /mobile/i.test(d.device));
      if (!mobile || total === 0) return "";
      const mShare = Math.round((Number(mobile.impressions || 0) / total) * 100);
      if (mShare > 60) return `${mShare}% of your search impressions come from mobile devices. Mobile UX, page speed, and tap-target size directly drive conversion at this share — desktop-only QA is no longer sufficient.`;
      if (mShare < 30) return `Only ${mShare}% of your search impressions come from mobile, well below the ~60% global average. Either your audience skews professional/B2B (which is expected at low mobile share), or your site has technical issues preventing Google from serving you in mobile results.`;
      return `${mShare}% of search impressions come from mobile, ${100 - mShare}% from desktop — a balanced mix that suggests your audience uses both contexts. Keep both responsive QA and desktop-conversion-path optimisation on the roadmap.`;
    },
  },
  {
    id: "vis.gsc.mobile_ctr_gap",
    category: "device",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => {
      const dev = c.gsc?.breakdowns?.devices || [];
      const m = dev.find((d: any) => /mobile/i.test(d.device));
      const dk = dev.find((d: any) => /desktop/i.test(d.device));
      return m && dk && Number(m.ctr) >= 0 && Number(dk.ctr) >= 0;
    },
    observation: (c) => {
      const dev = c.gsc?.breakdowns?.devices || [];
      const m = dev.find((d: any) => /mobile/i.test(d.device));
      const dk = dev.find((d: any) => /desktop/i.test(d.device));
      const mCtr = Number(m.ctr || 0);
      const dCtr = Number(dk.ctr || 0);
      const gap = Number((dCtr - mCtr).toFixed(2));
      if (gap > 0.3) return `Your mobile CTR (${mCtr.toFixed(2)}%) is ${gap.toFixed(2)} points lower than desktop (${dCtr.toFixed(2)}%). Mobile SERPs truncate titles earlier — shorter, benefit-forward titles (under 55 chars) tend to close this gap.`;
      if (gap < -0.3) return `Your mobile CTR (${mCtr.toFixed(2)}%) is OUTPERFORMING desktop (${dCtr.toFixed(2)}%). Your title tags are working harder on mobile than desktop — this is unusual and worth preserving.`;
      return `Mobile and desktop CTR are within 0.3 points of each other — snippets are performing uniformly. Optimise for position improvement, not device-specific snippet tests.`;
    },
  },

  // ─── GA4 Traffic Sources ───────────────────────────────────────────
  {
    id: "vis.ga4.direct_share",
    category: "channels",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return ses > 0 && Array.isArray(c.ga4?.sources);
    },
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const sources = c.ga4?.sources || [];
      const direct = sources.find((s: any) => /^direct|\(direct\)/i.test(s.source));
      const directSes = Number(direct?.sessions || 0);
      const pct = ses > 0 ? Math.round((directSes / ses) * 100) : 0;
      if (pct > 50) return `Direct traffic is ${pct}% of all sessions (${directSes} of ${ses}). High direct share suggests strong brand awareness — people are typing your URL or returning from a bookmark. This is healthy but it also means search is doing less of the acquisition work than it could.`;
      if (pct > 25) return `Direct traffic is ${pct}% of sessions, which is typical for a brand with some name recognition. Search and direct together should be your top two channels.`;
      if (pct > 0) return `Direct traffic is only ${pct}% of sessions — your brand awareness is low. Building direct traffic requires repeated exposures (content, email, paid retargeting); without that, you're 100% dependent on search and referrals.`;
      return "";
    },
  },
  {
    id: "vis.ga4.referral_share",
    category: "channels",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => Array.isArray(c.ga4?.sources) && Number(c.ga4?.summary?.totalSessions) > 0,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const sources = c.ga4?.sources || [];
      const refSes = sources
        .filter((s: any) => s.medium && /referral/i.test(s.medium))
        .reduce((sum: number, s: any) => sum + Number(s.sessions || 0), 0);
      const pct = ses > 0 ? Math.round((refSes / ses) * 100) : 0;
      if (pct > 15) return `Referral traffic is ${pct}% of sessions (${refSes} from third-party sites). This is unusually high and suggests at least one strong inbound link is sending consistent traffic — worth identifying the top referrer and asking for similar placements elsewhere.`;
      if (pct > 0) return `Referral traffic accounts for ${pct}% of sessions — other websites are linking and sending visitors. Maintain those relationships; each one is also a backlink helping your search rankings.`;
      return "";
    },
  },
  {
    id: "vis.ga4.session_volume",
    category: "scale",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => Number(c.ga4?.summary?.totalSessions) >= 0,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      if (ses === 0) return `Google Analytics 4 reports 0 sessions this period. Either GA4 is misconfigured (the tracking tag is missing or filtering everything) or the site genuinely has no traffic — check the GA4 Realtime view to verify.`;
      if (ses < 100) return `${ses} total website sessions this period — at this scale every change you make is statistically noisy. Focus on getting to 500+ sessions/month before A/B testing or sweating conversion-rate optimisation.`;
      if (ses < 1000) return `${ses} total sessions this period — you're past the noise floor for trend analysis but still small enough that one viral mention or one campaign can double traffic. Capture every visit (forms, capture pages) because the absolute count of opportunities is low.`;
      return `${fmt(ses)} total sessions this period — meaningful scale. Conversion-rate optimisation, A/B testing, and channel attribution analysis all become statistically reliable at this volume.`;
    },
  },

  // ─── Geographic Concentration ──────────────────────────────────────
  {
    id: "vis.ga4.city_concentration",
    category: "geography",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => {
      const cities = c.ga4?.cities || [];
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return cities.length > 0 && ses > 0;
    },
    observation: (c) => {
      const cities = c.ga4?.cities || [];
      const top = cities[0];
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const share = Math.round((Number(top.sessions || 0) / Math.max(1, ses)) * 100);
      if (share > 40) return `${share}% of your traffic comes from ${top.city} (${top.sessions} sessions). Is this your target market — or are you missing audiences in other cities? If your service area is broader, consider city-specific landing pages.`;
      if (share > 20) return `Your top city (${top.city}) accounts for ${share}% of traffic. Healthy concentration without over-dependence on a single market.`;
      return "";
    },
  },
  {
    id: "vis.ga4.foreign_traffic",
    category: "geography",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => {
      const countries = c.ga4?.countries || [];
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      if (!countries.length || ses === 0) return false;
      const us = countries.find((co: any) => /united states|^us$/i.test(co.country));
      const usSes = Number(us?.sessions || 0);
      return usSes / Math.max(1, ses) < 0.5;
    },
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      const countries = c.ga4?.countries || [];
      const us = countries.find((co: any) => /united states|^us$/i.test(co.country));
      const usPct = Math.round((Number(us?.sessions || 0) / Math.max(1, ses)) * 100);
      const foreign = 100 - usPct;
      return `${foreign}% of your traffic comes from outside the US (${usPct}% US, ${foreign}% international). If you serve a US-only market, this is bot/scraper traffic inflating your numbers — filter it out of conversion and engagement metrics so they reflect real prospects.`;
    },
    action: () => `Add a GA4 filter to exclude non-target countries from your reports, or build a US-only audience and use that as the default lens for trend reports.`,
  },
  {
    id: "vis.ga4.country_diversity",
    category: "geography",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 4,
    appliesWhen: (c) => Array.isArray(c.ga4?.countries) && c.ga4.countries.length >= 5,
    observation: (c) => {
      const countries = c.ga4?.countries || [];
      const count = countries.length;
      return `Visitors come from ${count} different countries this period. ${count > 20 ? "Wide international reach — useful if you do digital products, problematic if you're a local service business since most of that traffic doesn't convert." : "Moderate international reach — natural for SaaS or content-driven businesses."}`;
    },
  },

  // ─── GBP Local Visibility ──────────────────────────────────────────
  {
    id: "vis.gbp.impressions_contribution",
    category: "local",
    kind: "observation",
    dataSources: ["gbp", "gsc"],
    priority: 8,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions) > 0,
    observation: (c) => {
      const gbpImp = Number(c.gbp?.metrics?.impressions || 0);
      const gscImp = Number(c.gsc?.summary?.impressions || 0);
      const total = gbpImp + gscImp;
      const gbpShare = total > 0 ? Math.round((gbpImp / total) * 100) : 0;
      if (gbpImp > gscImp) return `Your Google Business Profile delivered ${fmt(gbpImp)} impressions vs ${fmt(gscImp)} from organic search — your local listing is more visible than your search presence. This is typical for service-area businesses. Spend optimisation effort on GBP categories, photos, and posting cadence before sweating organic.`;
      return `Your Google Business Profile contributed ${fmt(gbpImp)} impressions (${gbpShare}% of total Google surface area). Your search presence outweighs your local listing — there's headroom to optimise GBP categories, photos, and posting cadence.`;
    },
  },
  {
    id: "vis.gbp.maps_vs_search",
    category: "local",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 6,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions) > 0,
    observation: (c) => {
      const m = c.gbp?.metrics || {};
      const imp = Number(m.impressions || 0);
      const maps = Number(m.impressionsDesktopMaps || 0) + Number(m.impressionsMobileMaps || 0);
      const mapsPct = imp > 0 ? Math.round((maps / imp) * 100) : 0;
      if (mapsPct > 50) return `${mapsPct}% of your GBP impressions come from Maps navigation, not Search. People are looking for businesses in your area — citation consistency (NAP across the web), categories, and address accuracy matter more than blog content for ranking in Maps.`;
      if (mapsPct > 25) return `${mapsPct}% of GBP impressions come from Maps, ${100 - mapsPct}% from Search. Balanced — invest in both: keyword-rich descriptions for Search, and accurate citations + photos for Maps.`;
      return `Only ${mapsPct}% of GBP impressions come from Maps. Most of your local visibility is in Search, not Maps — keyword-rich GBP descriptions and posts matter more than Maps-specific citations.`;
    },
  },
  {
    id: "vis.gbp.website_clicks",
    category: "local",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 7,
    appliesWhen: (c) => c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions) > 0,
    observation: (c) => {
      const m = c.gbp?.metrics || {};
      const imp = Number(m.impressions || 0);
      const clicks = Number(m.websiteClicks || 0);
      const calls = Number(m.calls || 0);
      const clickPct = imp > 0 ? ((clicks / imp) * 100).toFixed(2) : "0";
      if (calls > clicks * 2) return `${calls} GBP phone calls vs ${clicks} website clicks (${clickPct}% click-through). Phone is your dominant local conversion path — track calls as a primary conversion in GA4 + SPARK, and keep click-to-call prominent above the fold on mobile.`;
      if (clicks > calls * 2) return `${clicks} GBP website clicks vs ${calls} phone calls. The website is doing most of the local conversion work — ensure landing pages have a clear contact path within 1 scroll.`;
      return `GBP delivered ${clicks} website clicks and ${calls} phone calls this period — both channels are active. Track both in your conversion model so neither one is undervalued.`;
    },
  },
  {
    id: "vis.gbp.not_connected",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["gbp"],
    priority: 9,
    appliesWhen: (c) => GBP_ENABLED && c.gbp?.connected !== true,
    observation: () => `Google Business Profile is not connected. For a local-service business this is the single biggest visibility blind spot — GBP often delivers more impressions than organic search, and you're flying blind on Maps discoverability without it.`,
    action: () => `Connect Google Business Profile in Settings → Connected Accounts. Once connected, ARION pulls impressions, calls, website clicks, photos viewed, direction requests, and review velocity into the Local Presence + Visibility & Reach trend engines.`,
  },

  // ─── Bing Visibility ───────────────────────────────────────────────
  {
    id: "vis.bing.ctr_outperform",
    category: "bing",
    kind: "observation",
    dataSources: ["bing", "gsc"],
    priority: 6,
    appliesWhen: (c) => c.bing?.connected === true && Number(c.bing?.summary?.impressions) > 0 && Number(c.gsc?.summary?.ctr) > 0,
    observation: (c) => {
      const bCtr = Number(c.bing?.summary?.ctr || 0);
      const gCtr = Number(c.gsc?.summary?.ctr || 0);
      if (bCtr > gCtr * 1.3) return `Your Bing CTR (${bCtr.toFixed(2)}%) outperforms your Google CTR (${gCtr.toFixed(2)}%) by ${Math.round((bCtr / gCtr - 1) * 100)}%. Bing searchers are finding your results more relevant — this often indicates an underserved audience on a less competitive platform.`;
      if (bCtr < gCtr * 0.7) return `Your Bing CTR (${bCtr.toFixed(2)}%) is below your Google CTR (${gCtr.toFixed(2)}%). Bing pulls title tags differently — review how your snippets render in Bing SERPs and adjust if needed.`;
      return "";
    },
  },
  {
    id: "vis.bing.position_better",
    category: "bing",
    kind: "observation",
    dataSources: ["bing", "gsc"],
    priority: 5,
    appliesWhen: (c) => c.bing?.connected === true && Number(c.bing?.summary?.avgPosition) > 0 && Number(c.gsc?.summary?.avgPosition) > 0,
    observation: (c) => {
      const bPos = Number(c.bing?.summary?.avgPosition || 0);
      const gPos = Number(c.gsc?.summary?.avgPosition || 0);
      if (bPos < gPos - 3) return `You rank significantly better on Bing (avg position ${bPos.toFixed(1)}) than Google (${gPos.toFixed(1)}). Bing represents a lower-competition opportunity — maintaining your Bing presence is high-leverage, low-effort.`;
      return "";
    },
  },
  {
    id: "vis.bing.connect",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["bing"],
    priority: 4,
    appliesWhen: (c) => c.bing?.connected !== true,
    observation: () => `Bing Webmaster Tools is not connected. Bing accounts for ~6-8% of US search traffic — connecting takes 5 minutes and adds a second visibility channel you can monitor and optimise.`,
    action: () => `Submit your sitemap to Bing Webmaster Tools — with 0 Bing visibility currently, even basic indexing could add 10-15% additional search traffic.`,
  },

  // ─── Brand vs Non-Brand ────────────────────────────────────────────
  {
    id: "vis.gsc.brand_share_low",
    category: "brand",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => {
      const queries = c.gsc?.breakdowns?.queries;
      const domain = c.domain || "";
      return Array.isArray(queries) && queries.length > 0 && domain.length > 0;
    },
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const dom = c.domain || "";
      const brandRoot = dom.replace(/\.(com|net|org|io|co).*/i, "").split(/[-_.]/).filter(Boolean)[0]?.toLowerCase() || "";
      if (!brandRoot) return "";
      const branded = queries.filter((q: any) => q.query && q.query.toLowerCase().includes(brandRoot));
      const totalClicks = queries.reduce((s: number, q: any) => s + Number(q.clicks || 0), 0);
      const brandClicks = branded.reduce((s: number, q: any) => s + Number(q.clicks || 0), 0);
      const pct = totalClicks > 0 ? Math.round((brandClicks / totalClicks) * 100) : 0;
      if (totalClicks === 0) return "";
      if (pct < 20) return `Only ${pct}% of your search clicks come from branded queries (queries containing your brand name). Most of your search visibility is from non-brand searches — your SEO is doing the work of building awareness, which is the harder path. Increasing brand awareness through other channels (PR, content, paid) compounds your organic visibility.`;
      if (pct > 70) return `${pct}% of your search clicks are branded (people searching for you by name). Brand recognition is strong, but you're capturing very little non-brand demand. Targeted content on top non-branded service queries would expand your top-of-funnel.`;
      return `Branded queries account for ${pct}% of your search clicks — a healthy mix between brand and non-brand. Branded search is your "free retention" channel; non-brand is your acquisition channel.`;
    },
  },
  {
    id: "vis.gsc.top_opportunity_query",
    category: "search-opportunity",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 8,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.queries) && c.gsc.breakdowns.queries.length > 0,
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const scored = queries
        .map((q: any) => {
          const pos = Number(q.position ?? q.avgPosition ?? 0);
          const ctr = Number(q.ctr || 0);
          const imp = Number(q.impressions || 0);
          const eCtr = expectedCtrAt(pos);
          return { q: q.query, imp, clicks: Number(q.clicks || 0), ctr, pos, eCtr, opp: imp * Math.max(0, eCtr - ctr) };
        })
        .sort((a: any, b: any) => b.opp - a.opp);
      const top = scored[0];
      if (!top || top.opp <= 0) return "";
      const missed = Math.round(((top.eCtr - top.ctr) / 100) * top.imp);
      return `Your highest-opportunity query is "${top.q}" with ${fmt(top.imp)} impressions and only ${top.clicks} clicks (${top.ctr.toFixed(2)}% CTR) at position ${Math.round(top.pos)}. Expected CTR at that position is ~${top.eCtr}% — a sharper title tag could generate an estimated ${missed} additional monthly clicks.`;
    },
    action: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const top = queries
        .map((q: any) => ({ q: q.query, opp: Number(q.impressions || 0) * Math.max(0, expectedCtrAt(Number(q.position || 0)) - Number(q.ctr || 0)) }))
        .sort((a: any, b: any) => b.opp - a.opp)[0];
      if (!top) return "";
      return `Rewrite the title tag on the page ranking for "${top.q}" to include the exact phrase. This is your single largest recoverable-clicks opportunity at current impression volume.`;
    },
  },
  {
    id: "vis.gsc.zero_click_query",
    category: "search-opportunity",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      return queries.some((q: any) => Number(q.impressions) > 100 && Number(q.clicks) === 0);
    },
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const zeros = queries.filter((q: any) => Number(q.impressions) > 100 && Number(q.clicks) === 0);
      const top = zeros.sort((a: any, b: any) => Number(b.impressions) - Number(a.impressions))[0];
      return `${zeros.length} quer${zeros.length === 1 ? "y has" : "ies have"} 100+ impressions but 0 clicks. The biggest one — "${top.query}" at ${fmt(Number(top.impressions))} impressions — is appearing in search results but its snippet is not compelling enough for anyone to click. This is recoverable through title + meta description rewrites alone.`;
    },
  },

  // ─── Cross-Source Aggregations ─────────────────────────────────────
  {
    id: "vis.cross.total_google_surface",
    category: "cross-source",
    kind: "observation",
    dataSources: ["gsc", "gbp", "ga4"],
    priority: 6,
    appliesWhen: (c) =>
      Number(c.gsc?.summary?.impressions || 0) > 0 &&
      c.gbp?.connected === true && Number(c.gbp?.metrics?.impressions || 0) > 0,
    observation: (c) => {
      const gsc = Number(c.gsc?.summary?.impressions || 0);
      const gbp = Number(c.gbp?.metrics?.impressions || 0);
      const ga4 = Number(c.ga4?.summary?.totalSessions || 0);
      const total = gsc + gbp;
      return `Total Google surface area this period: ${fmt(total)} impressions (${fmt(gsc)} search + ${fmt(gbp)} GBP) leading to ${fmt(ga4)} website visits. Conversion from Google touch to website visit is ${total > 0 ? ((ga4 / total) * 100).toFixed(2) : "0"}% — every percentage point gained here is pure compounding return.`;
    },
  },
  {
    id: "vis.cross.bing_apple_blindspots",
    category: "cross-source",
    kind: "observation",
    dataSources: ["bing"],
    priority: 3,
    appliesWhen: (c) => c.bing?.connected !== true,
    observation: () => `Bing and Apple Maps are not connected, representing blind spots in your presence assessment. Combined they account for ~10-12% of US search traffic — a meaningful slice that's currently unmeasured.`,
  },

  // ─── GBP Asset Optimisation ────────────────────────────────────────
  {
    id: "vis.gbp.review_velocity",
    category: "local-trust",
    kind: "observation",
    dataSources: ["gbp"],
    priority: 5,
    appliesWhen: (c) => c.gbp?.connected === true && Array.isArray(c.gbpReviews?.reviews),
    observation: (c) => {
      const reviews = c.gbpReviews?.reviews || [];
      const total = Number(c.gbpReviews?.totalReviewCount || reviews.length || 0);
      const avg = Number(c.gbpReviews?.averageRating || 0);
      const recent = reviews.filter((r: any) => {
        if (!r.createTime) return false;
        const days = (Date.now() - new Date(r.createTime).getTime()) / (1000 * 60 * 60 * 24);
        return days <= 30;
      }).length;
      if (total === 0) return `No reviews on your GBP listing yet. The first 5 reviews carry the most ranking weight — request them from your best customers this week.`;
      if (recent === 0) return `Your ${avg.toFixed(1)}★ rating across ${total} reviews is solid, but you received 0 new reviews this month. Review recency is a local ranking signal — businesses with consistent monthly reviews outrank those with stale review profiles.`;
      return `You received ${recent} new review${recent === 1 ? "" : "s"} this period (${total} total at ${avg.toFixed(1)}★). Maintain monthly velocity — local pack ranking rewards consistent fresh reviews more than absolute count.`;
    },
  },
];

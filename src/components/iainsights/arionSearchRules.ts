// arionSearchRules — v7.8 ARION "Search Intelligence" insight library.
//
// 22 conditional rules focused on the GSC + SE Ranking data surface:
//   - CTR curve analysis (expected vs actual at avg position)
//   - Per-query opportunity scoring
//   - Position distribution (top 3 / top 10 / top 20 / beyond)
//   - Quick-win keywords (positions 11-20 ready to push to page 1)
//   - Decaying keywords (ranking-loss patterns)
//   - Device-specific CTR gaps
//   - Featured-snippet / position-zero presence
//   - Branded vs non-branded query split
//   - AI Overview / SGE awareness
//   - Country-specific search performance

import { type InsightRule, fmt, expectedCtrAt } from "./insightRules";

export const SEARCH_RULES: InsightRule[] = [
  // ─── CTR Curve Analysis ───────────────────────────────────────────
  {
    id: "search.ctr.gap_vs_benchmark",
    category: "ctr-curve",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 10,
    appliesWhen: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return pos > 0 && imp > 200;
    },
    observation: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      const ctr = Number(c.gsc?.summary?.ctr || 0);
      const imp = Number(c.gsc?.summary?.impressions || 0);
      const clicks = Number(c.gsc?.summary?.clicks || 0);
      const exp = expectedCtrAt(pos);
      const gap = Number((exp - ctr).toFixed(2));
      if (gap > 0.5) {
        const missed = Math.round((gap / 100) * imp);
        return `At avg position ${pos.toFixed(1)}, industry benchmark CTR is ~${exp}%. Your actual CTR is ${ctr.toFixed(2)}% across ${fmt(imp)} impressions (${clicks} clicks). This ${gap.toFixed(2)}-point gap represents approximately ${fmt(missed)} additional monthly clicks recoverable through title tag + meta description rewrites — no ranking improvement required.`;
      }
      if (gap < -0.5) return `Your CTR (${ctr.toFixed(2)}%) is OUTPERFORMING benchmark (${exp}%) at position ${pos.toFixed(1)}. Snippets are working — focus optimisation on moving positions up, not on rewriting titles.`;
      return `Your CTR (${ctr.toFixed(2)}%) matches the industry benchmark (${exp}%) at position ${pos.toFixed(1)}. Snippet quality is on-par; the recoverable upside is position movement, not snippet tweaks.`;
    },
    action: (c) => {
      const pos = Number(c.gsc?.summary?.avgPosition || 0);
      const ctr = Number(c.gsc?.summary?.ctr || 0);
      const gap = expectedCtrAt(pos) - ctr;
      if (gap <= 0.5) return "";
      return `Audit your top 10 highest-impression pages' title tags. The biggest CTR gains come from titles that (1) include the searcher's exact query phrase, (2) communicate a unique benefit, and (3) fit in 55 characters on mobile.`;
    },
  },
  {
    id: "search.ctr.benchmark_unavailable",
    category: "ctr-curve",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 5,
    appliesWhen: (c) => {
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return imp > 0 && imp < 200;
    },
    observation: (c) => {
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return `${imp} total search impressions this period — too thin to draw conclusions about CTR vs benchmark. CTR-curve analysis becomes statistically meaningful around 500+ monthly impressions; until then, focus on indexing + content coverage to grow impression volume.`;
    },
  },

  // ─── Position Distribution ────────────────────────────────────────
  {
    id: "search.position.top3_count",
    category: "position-mix",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 8,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.queries) && c.gsc.breakdowns.queries.length > 0,
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const top3 = queries.filter((q: any) => Number(q.position || q.avgPosition) > 0 && Number(q.position || q.avgPosition) <= 3).length;
      const top10 = queries.filter((q: any) => Number(q.position || q.avgPosition) > 0 && Number(q.position || q.avgPosition) <= 10).length;
      if (top3 === 0) return `0 queries ranking in positions 1-3. Top-3 captures ~50% of clicks for any query; until you rank a query there, you're capturing the long tail of the impressions you do earn.`;
      if (top3 < 5) return `${top3} quer${top3 === 1 ? "y ranks" : "ies rank"} in positions 1-3 (and ${top10} in top 10). Doubling top-3 placements is the highest-leverage SEO investment — each top-3 keyword typically captures 5-10x the clicks of a top-10 keyword.`;
      return `${top3} queries ranking in positions 1-3 — strong top-of-SERP presence. Protect these with content refreshes every 3-6 months; high-position rankings decay fastest when competitors update fresher content.`;
    },
  },
  {
    id: "search.position.beyond_top20",
    category: "position-mix",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 5,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.queries) && c.gsc.breakdowns.queries.length > 10,
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const beyond = queries.filter((q: any) => Number(q.position || q.avgPosition) > 20).length;
      const pct = Math.round((beyond / queries.length) * 100);
      if (pct > 70) return `${pct}% of your tracked queries rank beyond position 20 (${beyond} of ${queries.length}). Page 3+ rankings capture <1% of clicks regardless of impression count — these queries are exposure-only until you can promote them. Focus optimisation effort on the page-2 quick-wins instead.`;
      if (pct > 50) return `${pct}% of queries rank beyond position 20. There's a long tail of low-value rankings; the bulk of your SEO ROI will come from the smaller set of page-1 and page-2 keywords.`;
      return "";
    },
  },

  // ─── Top Opportunity Query ────────────────────────────────────────
  {
    id: "search.opp.top_query",
    category: "opportunity",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 9,
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
        .filter((s: any) => s.opp > 0)
        .sort((a: any, b: any) => b.opp - a.opp);
      const top = scored[0];
      if (!top) return `Query-level opportunity scoring requires GSC's CTR + position data per query. Currently no queries have a recoverable-CTR gap large enough to surface.`;
      const missed = Math.round(((top.eCtr - top.ctr) / 100) * top.imp);
      return `Your highest-opportunity query is "${top.q}" with ${fmt(top.imp)} impressions and only ${top.clicks} clicks (${top.ctr.toFixed(2)}% CTR) at position ${Math.round(top.pos)}. Expected CTR at that position is ~${top.eCtr}% — a sharper title tag could generate an estimated ${fmt(missed)} additional monthly clicks from this single query.`;
    },
    action: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const top = queries
        .map((q: any) => ({ q: q.query, opp: Number(q.impressions || 0) * Math.max(0, expectedCtrAt(Number(q.position || 0)) - Number(q.ctr || 0)) }))
        .sort((a: any, b: any) => b.opp - a.opp)[0];
      if (!top || top.opp <= 0) return "";
      return `Rewrite the title tag on the page ranking for "${top.q}" to include the exact query phrase. This is your single largest recoverable-clicks opportunity at current impression volume — no ranking improvement required.`;
    },
  },
  {
    id: "search.opp.zero_click_queries",
    category: "opportunity",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      return queries.some((q: any) => Number(q.impressions) > 100 && Number(q.clicks) === 0);
    },
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const zeros = queries
        .filter((q: any) => Number(q.impressions) > 100 && Number(q.clicks) === 0)
        .sort((a: any, b: any) => Number(b.impressions) - Number(a.impressions));
      const top = zeros[0];
      const totalImp = zeros.reduce((s: number, q: any) => s + Number(q.impressions || 0), 0);
      return `${zeros.length} quer${zeros.length === 1 ? "y has" : "ies have"} 100+ impressions and 0 clicks (${fmt(totalImp)} total wasted impressions). The biggest — "${top.query}" at ${fmt(Number(top.impressions))} impressions — is appearing in search results but its snippet isn't compelling enough for anyone to click. This is recoverable through title + meta description rewrites alone.`;
    },
  },

  // ─── Quick-Win Keywords (SE Ranking) ──────────────────────────────
  {
    id: "search.quickwin.page2",
    category: "quick-wins",
    kind: ["observation", "action"],
    dataSources: ["seo"],
    priority: 9,
    appliesWhen: (c) => c.seo?.connected === true && Array.isArray(c.seo?.keywords),
    observation: (c) => {
      const kws = (c.seo?.keywords || []).filter((k: any) => {
        const p = Number(k.currentPosition || 0);
        return p >= 11 && p <= 20;
      }).sort((a: any, b: any) => (Number(b.searchVolume || 0)) - Number(a.searchVolume || 0));
      if (kws.length === 0) return `All tracked keywords are either on page 1 or deeper than position 20. Expand the tracked keyword set in SE Ranking to surface new page-2 opportunities that would benefit from focused optimisation.`;
      const top = kws[0];
      const estClicks = Math.round((Number(top.searchVolume || 0)) * 0.23);
      return `${kws.length} tracked keyword${kws.length === 1 ? "" : "s"} rank in position 11-20 — your fastest path to page 1. "${top.keyword}" has ${fmt(Number(top.searchVolume || 0))} monthly searches at position ${top.currentPosition}. A focused content update + 2-3 internal links could push it into the top 10, generating an estimated ${estClicks} additional monthly visits.`;
    },
    action: (c) => {
      const kws = (c.seo?.keywords || []).filter((k: any) => {
        const p = Number(k.currentPosition || 0);
        return p >= 11 && p <= 20;
      });
      if (kws.length === 0) return "";
      return `Pick the top 3 quick-win keywords by search volume. For each: refresh the page content (add 200-400 new words, update statistics, add a 2026-relevant section) AND add internal links from your homepage + top 2 service pages. Re-check positions in 4-6 weeks.`;
    },
  },
  {
    id: "search.quickwin.top10_consolidation",
    category: "quick-wins",
    kind: "observation",
    dataSources: ["seo"],
    priority: 6,
    appliesWhen: (c) => c.seo?.connected === true && Array.isArray(c.seo?.keywords),
    observation: (c) => {
      const top10 = (c.seo?.keywords || []).filter((k: any) => {
        const p = Number(k.currentPosition || 0);
        return p >= 4 && p <= 10;
      });
      if (top10.length === 0) return "";
      return `${top10.length} keywords rank in positions 4-10 — within striking distance of the top 3. Moving from position 8 to position 3 typically triples clicks; these are higher-value quick wins than page-2 keywords if the content is already strong.`;
    },
  },

  // ─── Decaying Keywords ────────────────────────────────────────────
  {
    id: "search.decay.detected",
    category: "decay",
    kind: ["observation", "action"],
    dataSources: ["seo"],
    priority: 8,
    appliesWhen: (c) => c.seoDecay?.decaying?.length > 0,
    observation: (c) => {
      const decay = c.seoDecay?.decaying || [];
      const biggest = decay[0];
      return `${decay.length} tracked page${decay.length === 1 ? "" : "s"} dropped in rankings this period. ${biggest.url || `"${biggest.keyword}"`} fell from position ${biggest.priorPosition} to ${biggest.currentPosition} — a drop of ${biggest.change} places. Content decay is usually caused by newer, fresher content from competitors outranking older posts.`;
    },
    action: () => `Update the decaying pages with current statistics, new sections, and a fresh publish date. Recovery typically takes 2-4 weeks after the refresh, faster if you also acquire 1-2 new internal/external links to the updated page.`,
  },

  // ─── Device-Specific CTR ──────────────────────────────────────────
  {
    id: "search.device.mobile_ctr_gap",
    category: "device-ctr",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => {
      const dev = c.gsc?.breakdowns?.devices || [];
      const m = dev.find((d: any) => /mobile/i.test(d.device));
      const dk = dev.find((d: any) => /desktop/i.test(d.device));
      return m && dk && Number(m.ctr) >= 0 && Number(dk.ctr) > 0;
    },
    observation: (c) => {
      const dev = c.gsc?.breakdowns?.devices || [];
      const m = dev.find((d: any) => /mobile/i.test(d.device));
      const dk = dev.find((d: any) => /desktop/i.test(d.device));
      const gap = Number(dk.ctr) - Number(m.ctr);
      if (gap > 0.3) return `Mobile CTR (${Number(m.ctr).toFixed(2)}%) is ${gap.toFixed(2)} points below desktop (${Number(dk.ctr).toFixed(2)}%). Mobile SERPs truncate titles earlier; shorter, benefit-forward titles under 55 characters tend to close this gap.`;
      if (gap < -0.3) return `Mobile CTR (${Number(m.ctr).toFixed(2)}%) is OUTPERFORMING desktop (${Number(dk.ctr).toFixed(2)}%) — unusual and worth preserving. Your titles are working harder on mobile than desktop.`;
      return "";
    },
    action: (c) => {
      const dev = c.gsc?.breakdowns?.devices || [];
      const m = dev.find((d: any) => /mobile/i.test(d.device));
      const dk = dev.find((d: any) => /desktop/i.test(d.device));
      const gap = Number(dk?.ctr || 0) - Number(m?.ctr || 0);
      if (gap <= 0.3) return "";
      return `Test shorter title tags (under 55 characters) for your top 5 mobile-impression pages. Mobile SERPs truncate around 55-60 chars; titles longer than that lose their benefit-forward keywords in the cut.`;
    },
  },

  // ─── Featured Snippet / Position Zero ─────────────────────────────
  {
    id: "search.snippet.position_one",
    category: "featured-snippet",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 5,
    appliesWhen: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      return queries.some((q: any) => Number(q.position || q.avgPosition) >= 0.5 && Number(q.position || q.avgPosition) <= 1.5);
    },
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const ones = queries.filter((q: any) => {
        const p = Number(q.position || q.avgPosition);
        return p >= 0.5 && p <= 1.5;
      });
      return `${ones.length} quer${ones.length === 1 ? "y holds" : "ies hold"} position 1. Position 1 captures ~28% of clicks; these are your most-defended rankings. Refresh them quarterly to keep competitors from displacing you.`;
    },
  },

  // ─── Branded vs Non-Branded ───────────────────────────────────────
  {
    id: "search.brand.non_brand_dominance",
    category: "brand-mix",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 6,
    appliesWhen: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const dom = c.domain || "";
      return queries.length >= 3 && dom.length > 0;
    },
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const root = (c.domain || "").replace(/\.(com|net|org|io|co).*/i, "").split(/[-_.]/).filter(Boolean)[0]?.toLowerCase() || "";
      if (!root) return "";
      const branded = queries.filter((q: any) => q.query && q.query.toLowerCase().includes(root));
      const nonBrand = queries.filter((q: any) => q.query && !q.query.toLowerCase().includes(root));
      const totalClicks = queries.reduce((s: number, q: any) => s + Number(q.clicks || 0), 0);
      const brandClicks = branded.reduce((s: number, q: any) => s + Number(q.clicks || 0), 0);
      const nonBrandClicks = nonBrand.reduce((s: number, q: any) => s + Number(q.clicks || 0), 0);
      if (totalClicks === 0) return "";
      if (nonBrandClicks > brandClicks * 2) return `Non-branded queries deliver ${fmt(nonBrandClicks)} clicks vs ${fmt(brandClicks)} branded — your SEO is doing the brand-building work. Each non-branded ranking is also a brand impression; over time this compounds into brand recognition.`;
      if (brandClicks > nonBrandClicks * 2) return `Branded queries dominate (${fmt(brandClicks)} clicks vs ${fmt(nonBrandClicks)} non-branded). You have name recognition but you're capturing very little non-brand demand. Dedicated landing pages for your top 3 service queries would expand top-of-funnel.`;
      return `Branded (${fmt(brandClicks)} clicks) and non-branded (${fmt(nonBrandClicks)}) are reasonably balanced — your brand and your content are both doing acquisition work.`;
    },
  },

  // ─── Country-Specific ─────────────────────────────────────────────
  {
    id: "search.country.foreign_dominance",
    category: "geography",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 5,
    appliesWhen: (c) => {
      const countries = c.gsc?.breakdowns?.countries || [];
      if (countries.length < 2) return false;
      const total = countries.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
      const us = countries.find((co: any) => /usa|united states/i.test(co.country));
      const usImp = Number(us?.impressions || 0);
      return total > 1000 && usImp / total < 0.5;
    },
    observation: (c) => {
      const countries = c.gsc?.breakdowns?.countries || [];
      const total = countries.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
      const us = countries.find((co: any) => /usa|united states/i.test(co.country));
      const usPct = total > 0 ? Math.round((Number(us?.impressions || 0) / total) * 100) : 0;
      return `Only ${usPct}% of your search impressions come from US searchers. If your service area is US-only, the other ${100 - usPct}% is foreign-IP traffic — usually scrapers and rank-tracking bots. It inflates your impression count without affecting real visits.`;
    },
  },

  // ─── AI Search / SGE ──────────────────────────────────────────────
  {
    id: "search.ai.not_tracked",
    category: "ai-search",
    kind: "observation",
    dataSources: ["seo"],
    priority: 3,
    appliesWhen: (c) => c.seo?.connected !== true || c.seo?.aiOverviews == null,
    observation: () => `AI Search Results (Google AI Mode, ChatGPT, Gemini, Perplexity) tracking requires the SE Ranking AI Search add-on. As LLM-driven search captures more queries (currently estimated at 5-15% of US English search), tracking your brand presence in those responses becomes the new equivalent of tracking SERP positions.`,
  },

  // ─── Page-Level ──────────────────────────────────────────────────
  {
    id: "search.page.top_landing",
    category: "page-level",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 4,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.pages) && c.gsc.breakdowns.pages.length > 0,
    observation: (c) => {
      const pages = c.gsc?.breakdowns?.pages || [];
      const top = pages.slice().sort((a: any, b: any) => Number(b.clicks || 0) - Number(a.clicks || 0))[0];
      if (!top) return "";
      return `Your top-clicked page from organic search is ${top.page} with ${top.clicks} clicks. Protect this with quarterly content refreshes and monitor its position; the top organic-traffic page is the riskiest to lose because most other pages can't easily replace its traffic.`;
    },
  },
  {
    id: "search.page.untapped",
    category: "page-level",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 5,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.pages) && c.gsc.breakdowns.pages.length >= 3,
    observation: (c) => {
      const pages = c.gsc?.breakdowns?.pages || [];
      // High-impression but low-click pages
      const untapped = pages
        .filter((p: any) => Number(p.impressions || 0) > 500 && Number(p.ctr || 0) < 0.02)
        .sort((a: any, b: any) => Number(b.impressions || 0) - Number(a.impressions || 0));
      if (untapped.length === 0) return "";
      const top = untapped[0];
      return `${untapped.length} page${untapped.length === 1 ? "" : "s"} have 500+ impressions but under 2% CTR. The biggest — ${top.page} at ${fmt(Number(top.impressions))} impressions — is appearing in search but failing to attract clicks. Title + meta description rewrite would unlock significant traffic with no ranking change.`;
    },
  },

  // ─── Date Trend ──────────────────────────────────────────────────
  {
    id: "search.trend.declining",
    category: "trend",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 7,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.dates) && c.gsc.breakdowns.dates.length >= 30,
    observation: (c) => {
      const dates = (c.gsc?.breakdowns?.dates || []).slice().sort((a: any, b: any) => a.date.localeCompare(b.date));
      if (dates.length < 30) return "";
      const half = Math.floor(dates.length / 2);
      const firstHalfClicks = dates.slice(0, half).reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
      const secondHalfClicks = dates.slice(half).reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
      if (firstHalfClicks === 0) return "";
      const change = ((secondHalfClicks - firstHalfClicks) / firstHalfClicks) * 100;
      if (change < -15) return `Search clicks declined ${Math.abs(Math.round(change))}% over the last ${Math.round(dates.length / 2)} days vs the prior period. Decline of this magnitude usually signals (1) an algorithm update, (2) seasonal demand shift, or (3) a technical SEO regression. Check GSC Coverage + Core Web Vitals for technical signals first.`;
      if (change > 25) return `Search clicks grew ${Math.round(change)}% over the last ${Math.round(dates.length / 2)} days vs the prior period — strong upward trend. Identify which queries/pages drove the lift so the pattern can be replicated.`;
      return "";
    },
  },

  // ─── Data Gaps ────────────────────────────────────────────────────
  {
    id: "search.gap.gsc_not_connected",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["gsc"],
    priority: 10,
    appliesWhen: (c) => !c.gsc || c.gsc?.summary == null,
    observation: () => `Google Search Console is not connected. Without GSC there's no visibility into search impressions, CTR, average position, top queries, or device-specific search performance — these are the inputs to every Search Intelligence observation.`,
    action: () => `Connect Google Search Console in Settings → Connected Accounts. GSC retroactively pulls up to 16 months of data once connected, so the value compounds immediately.`,
  },
  {
    id: "search.gap.seranking_not_connected",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["seo"],
    priority: 6,
    appliesWhen: (c) => c.seo?.connected !== true,
    observation: () => `SE Ranking is not connected. Quick-win keyword analysis (positions 11-20 ready for promotion), keyword decay detection, and competitor visibility comparison all require SE Ranking data — currently disabled.`,
    action: () => `Enable the SE Ranking add-on. Even Starter-tier tracking of 10 priority keywords unlocks the quick-win + decay detection rules immediately.`,
  },

  // ─── Query Length Distribution ────────────────────────────────────
  {
    id: "search.queries.short_tail_dominance",
    category: "query-mix",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 4,
    appliesWhen: (c) => Array.isArray(c.gsc?.breakdowns?.queries) && c.gsc.breakdowns.queries.length >= 10,
    observation: (c) => {
      const queries = c.gsc?.breakdowns?.queries || [];
      const longTail = queries.filter((q: any) => (q.query || "").split(/\s+/).length >= 4);
      const longTailPct = queries.length > 0 ? Math.round((longTail.length / queries.length) * 100) : 0;
      if (longTailPct < 30) return `Only ${longTailPct}% of your ranking queries are 4+ words (long-tail). Long-tail queries have less competition AND higher purchase intent — building content for specific multi-word queries is a proven path to compounding organic growth.`;
      if (longTailPct > 70) return `${longTailPct}% of your ranking queries are long-tail (4+ words). Strong specific-intent coverage. Compete on the head terms (2-3 word phrases) for top-of-funnel awareness.`;
      return "";
    },
  },

  // ─── Scale Warning ────────────────────────────────────────────────
  {
    id: "search.scale.low_impressions",
    category: "scale",
    kind: "observation",
    dataSources: ["gsc"],
    priority: 4,
    appliesWhen: (c) => {
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return imp > 0 && imp < 500;
    },
    observation: (c) => {
      const imp = Number(c.gsc?.summary?.impressions || 0);
      return `Only ${imp} search impressions this period — the site is not yet broadly indexed or visible. The fastest paths to growing impressions are (1) creating more content (broader query coverage), (2) submitting your sitemap, and (3) earning a few backlinks to signal authority.`;
    },
  },
];

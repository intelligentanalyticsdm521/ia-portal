// arionContentRules — v7.9 ARION "Content Intelligence" insight library.
//
// 23 conditional rules covering:
//   - Page-level distribution (homepage dominance, content-to-conversion path)
//   - Content depth (thin content via plugin word count)
//   - Content freshness (age buckets: fresh / current / aging / stale)
//   - SEO health per post (Rank Math + plugin SEO detail)
//   - Content velocity (publishing cadence via plugin pace data)
//   - Content decay (SE Ranking decay detection)
//   - Top entry pages + 404s
//   - Content gaps (orphaned pages, low-engagement high-traffic)
//   - Engagement per content type
//
// Heavy use of pluginData (Shield + content age + word count + SEO
// detail) and SE Ranking decay data.

import { type InsightRule, fmt, pct } from "./insightRules";

export const CONTENT_RULES: InsightRule[] = [
  // ─── Page-Level Distribution ───────────────────────────────────────
  {
    id: "content.dist.homepage_dominance",
    category: "distribution",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => Array.isArray(c.ga4?.topPages) && c.ga4.topPages.length > 0,
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const total = pages.reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
      const home = pages.find((p: any) => p.path === "/" || /^\/?$/.test(p.path || ""));
      const homeViews = Number(home?.views || home?.pageviews || 0);
      const share = total > 0 ? Math.round((homeViews / total) * 100) : 0;
      if (share > 60) return `The homepage receives ${share}% of all pageviews (${fmt(homeViews)} of ${fmt(total)}). Most visitors see only this one page. The homepage is functioning as a brochure, not a funnel — visitors aren't being routed to deeper content that would extend session depth and engagement.`;
      if (share > 40) return `Homepage is ${share}% of pageviews — concentrated traffic but a meaningful tail is reaching deeper pages. Add more "Next: ..." style inline CTAs from the homepage to specific service / blog destinations.`;
      return `Homepage is ${share}% of pageviews — your content is well-distributed across the site. Visitors are entering on many different pages.`;
    },
  },
  {
    id: "content.dist.power_law",
    category: "distribution",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => Array.isArray(c.ga4?.topPages) && c.ga4.topPages.length >= 10,
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const total = pages.reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
      const top5 = pages.slice(0, 5).reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
      const top5Pct = total > 0 ? Math.round((top5 / total) * 100) : 0;
      if (top5Pct > 80) return `Your top 5 pages account for ${top5Pct}% of all pageviews — classic 80/20 concentration. The remaining ${pages.length - 5} pages compete for ${100 - top5Pct}% of attention. Either consolidate the long tail into the top performers, or invest in 2-3 page-2 candidates to broaden the funnel.`;
      return `Top 5 pages = ${top5Pct}% of pageviews — well-distributed across the site.`;
    },
  },

  // ─── Top Entry Pages ───────────────────────────────────────────────
  {
    id: "content.entry.top_page",
    category: "entry-pages",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 5,
    appliesWhen: (c) => Array.isArray(c.ga4?.topPages) && c.ga4.topPages.length > 0,
    observation: (c) => {
      const pages = (c.ga4?.topPages || []).slice().sort((a: any, b: any) =>
        Number(b.views || b.pageviews || 0) - Number(a.views || a.pageviews || 0)
      );
      const top = pages[0];
      if (!top) return "";
      return `Your top page is ${top.path || top.url || "(unknown)"} with ${fmt(Number(top.views || top.pageviews || 0))} pageviews. Protect this with quarterly content refreshes and watch its bounce rate — your top page is your highest-risk single point of failure.`;
    },
  },
  {
    id: "content.entry.contact_starvation",
    category: "entry-pages",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 8,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      const total = Number(c.ga4?.summary?.totalSessions || 0);
      const contact = pages.find((p: any) => /contact/i.test(p.path || ""));
      const cv = Number(contact?.views || contact?.pageviews || 0);
      return total > 0 && contact && (cv / total) < 0.1;
    },
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const contact = pages.find((p: any) => /contact/i.test(p.path || ""));
      const cv = Number(contact?.views || contact?.pageviews || 0);
      const total = Number(c.ga4?.summary?.totalSessions || 0);
      const share = total > 0 ? ((cv / total) * 100).toFixed(1) : "0";
      return `The /contact page receives only ${cv} views from ${fmt(total)} sessions (${share}%) — meaning ${(100 - Number(share)).toFixed(1)}% of visitors never see your primary conversion page. Content is not guiding visitors toward contact.`;
    },
    action: () => `Add inline "Get a quote →" links inside the top 5 service-page paragraphs (not just buttons). Content links drive ~3x higher click-through than nav links because they appear at the moment of interest.`,
  },

  // ─── 404 Detection ────────────────────────────────────────────────
  {
    id: "content.404.detected",
    category: "404",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 9,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      return pages.some((p: any) => /not found|404|page.not.found/i.test(p.title || ""));
    },
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const notFound = pages.filter((p: any) => /not found|404|page.not.found/i.test(p.title || ""));
      const sum = notFound.reduce((s: number, p: any) => s + Number(p.views || p.pageviews || 0), 0);
      return `${sum} pageviews landed on 404 / "Page not found" pages this period. Each 404 is a visitor who clicked a link and got rejected — they're high-intent and you're losing them at the worst possible moment.`;
    },
    action: () => `Identify the 404 URL paths in GA4 and either (1) restore the page, (2) 301-redirect to the closest current page, or (3) fix the broken inbound link.`,
  },

  // ─── Content Depth (Plugin Word Count) ────────────────────────────
  {
    id: "content.depth.avg_words",
    category: "depth",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 6,
    appliesWhen: (c) => Number(c.plugin?.wordCount?.avg_words) > 0,
    observation: (c) => {
      const wc = c.plugin?.wordCount;
      const avg = Number(wc?.avg_words || 0);
      const posts = Number(wc?.posts_counted || 0);
      if (avg < 300) return `Avg post depth is ${avg} words across ${posts} posts. Most posts are under the 500-word threshold most search engines treat as "thin content." Thin posts rarely rank for competitive terms.`;
      if (avg < 600) return `Avg post depth is ${avg} words — passable but below the 800-1500 range that performs best for service-business content. Updating shorter posts with new sections (FAQ, examples, before/after) typically lifts search performance.`;
      if (avg < 1500) return `Avg post depth is ${avg} words — solid mid-length content. This is the proven range for service-business content; maintain it.`;
      return `Avg post depth is ${avg} words — long-form. Strong for E-E-A-T signals and complex topics. Confirm visitor engagement (scroll depth, time on page) matches the length; if not, consider breaking into series.`;
    },
  },
  {
    id: "content.depth.thin_ratio",
    category: "depth",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 7,
    appliesWhen: (c) => {
      const wc = c.plugin?.wordCount;
      const thin = Number(wc?.buckets?.thin?.count || 0);
      const total = Number(wc?.posts_counted || 0);
      return total > 0 && thin / total > 0.3;
    },
    observation: (c) => {
      const wc = c.plugin?.wordCount;
      const thin = Number(wc?.buckets?.thin?.count || 0);
      const total = Number(wc?.posts_counted || 1);
      const ratio = Math.round((thin / total) * 100);
      return `${ratio}% of posts are under 500 words (${thin} of ${total}). Thin content rarely ranks for competitive terms — these posts are diluting your domain authority. Either expand them with depth (FAQs, case examples, internal links) or noindex them.`;
    },
    action: () => `List all thin posts, sorted by current traffic descending. Expand the top 3 to 800+ words with FAQ sections, before/after comparisons, or service-specific examples. Noindex or consolidate the rest.`,
  },

  // ─── Content Freshness ────────────────────────────────────────────
  {
    id: "content.freshness.stale_ratio",
    category: "freshness",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 8,
    appliesWhen: (c) => {
      const age = c.plugin?.age;
      if (!age) return false;
      const total = (age.fresh?.count || 0) + (age.current?.count || 0) + (age.aging?.count || 0) + (age.stale?.count || 0);
      return total > 0 && (age.stale?.count || 0) / total > 0.5;
    },
    observation: (c) => {
      const age = c.plugin?.age;
      const stale = Number(age?.stale?.count || 0);
      const total = (age.fresh?.count || 0) + (age.current?.count || 0) + (age.aging?.count || 0) + stale;
      const ratio = Math.round((stale / total) * 100);
      return `${ratio}% of your content library (${stale} of ${total} pieces) is over 1 year old. Stale content loses rankings to fresher competitors regardless of how good the original was. Refreshing top-traffic aging pages typically recovers 30-50% of lost rankings within 60 days.`;
    },
    action: () => `Identify the top 10 stale posts by current organic traffic. Refresh each with: updated statistics, new section, current-year date in the URL/title, and 2-3 new internal links. Re-check positions in 60 days.`,
  },
  {
    id: "content.freshness.healthy",
    category: "freshness",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 4,
    appliesWhen: (c) => {
      const age = c.plugin?.age;
      if (!age) return false;
      const total = (age.fresh?.count || 0) + (age.current?.count || 0) + (age.aging?.count || 0) + (age.stale?.count || 0);
      const fresh = (age.fresh?.count || 0) + (age.current?.count || 0);
      return total > 0 && fresh / total > 0.6;
    },
    observation: (c) => {
      const age = c.plugin?.age;
      const total = (age.fresh?.count || 0) + (age.current?.count || 0) + (age.aging?.count || 0) + (age.stale?.count || 0);
      const fresh = (age.fresh?.count || 0) + (age.current?.count || 0);
      const ratio = Math.round((fresh / total) * 100);
      return `${ratio}% of your library is under 90 days old — an above-average content-freshness signal to Google. Maintain the publishing cadence; freshness compounds for E-E-A-T scoring.`;
    },
  },
  {
    id: "content.freshness.no_recent",
    category: "freshness",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 7,
    appliesWhen: (c) => {
      const age = c.plugin?.age;
      return age && Number(age.fresh?.count || 0) === 0;
    },
    observation: () => `Zero posts published in the last 30 days. Search algorithms reward sites with consistent publishing cadence; a quiet content footprint signals to Google that the site may be neglected.`,
    action: () => `Publish at least 1 post per month, ideally 2. Even a 600-word service-specific FAQ or case-study format is enough to maintain freshness signals.`,
  },

  // ─── SEO Health (Plugin) ──────────────────────────────────────────
  {
    id: "content.seo.avg_score",
    category: "seo-quality",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 6,
    appliesWhen: (c) => Number(c.plugin?.seoAgg?.seo?.avg_seo_score) > 0,
    observation: (c) => {
      const score = Math.round(Number(c.plugin?.seoAgg?.seo?.avg_seo_score || 0));
      if (score >= 80) return `Average Rank Math SEO score across the library is ${score}/100 — strong on-page SEO discipline. Posts are well-optimised for title, meta, headings, and internal linking.`;
      if (score >= 60) return `Average Rank Math SEO score is ${score}/100 — passable but with room to improve. Most lift comes from (1) ensuring every post has a focus keyword, (2) including the keyword in the first paragraph, and (3) adding 3+ internal links per post.`;
      if (score >= 40) return `Average Rank Math SEO score is ${score}/100 — significant on-page issues. Most posts are missing focus keywords, meta descriptions, or both. Fixing these systematically lifts rankings even without content changes.`;
      return `Average Rank Math SEO score is ${score}/100 — critical on-page SEO gaps. Posts are publishing without title tag optimisation, meta descriptions, or focus-keyword configuration. This is a measurable headwind on every ranking.`;
    },
  },
  {
    id: "content.seo.low_score_posts",
    category: "seo-quality",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 7,
    appliesWhen: (c) => {
      const detail = c.plugin?.seoDetail?.posts;
      return Array.isArray(detail) && detail.some((p: any) => Number(p.seo_score) > 0 && Number(p.seo_score) < 50);
    },
    observation: (c) => {
      const detail = c.plugin?.seoDetail?.posts || [];
      const low = detail.filter((p: any) => Number(p.seo_score) > 0 && Number(p.seo_score) < 50);
      return `${low.length} post${low.length === 1 ? " has" : "s have"} Rank Math SEO scores below 50. These are publishing without basic on-page optimisation — the highest-leverage fixes are usually focus keyword + meta description + heading hierarchy.`;
    },
    action: () => `Sort posts by current organic traffic descending. Fix the on-page SEO for the top 5 with low scores first — that's where the click recovery is highest.`,
  },

  // ─── Content Velocity (Pace) ──────────────────────────────────────
  {
    id: "content.velocity.pace_below_monthly",
    category: "velocity",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 5,
    appliesWhen: (c) => {
      const pace = c.plugin?.pace;
      return pace && Number(pace.posts_per_month || 0) < 1;
    },
    observation: (c) => {
      const pace = Number(c.plugin?.pace?.posts_per_month || 0);
      return `Publishing pace is ${pace.toFixed(1)} posts per month. Search algorithms reward sites with consistent publishing cadence; sub-monthly cadence signals neglect. Aim for at least 2 posts per month even if shorter — consistency outranks length for freshness scoring.`;
    },
    action: () => `Set a recurring calendar block (e.g. first Friday of every month, 90 min) for writing one service-specific FAQ or case study. Format-fixed cadence beats writing-when-inspired by 10x.`,
  },
  {
    id: "content.velocity.pace_healthy",
    category: "velocity",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 3,
    appliesWhen: (c) => {
      const pace = c.plugin?.pace;
      return pace && Number(pace.posts_per_month || 0) >= 2;
    },
    observation: (c) => {
      const pace = Number(c.plugin?.pace?.posts_per_month || 0);
      return `Publishing ${pace.toFixed(1)} posts per month — healthy cadence. Consistent monthly publishing is the single biggest content-freshness signal you control.`;
    },
  },

  // ─── Content Decay (SE Ranking) ───────────────────────────────────
  {
    id: "content.decay.detected",
    category: "decay",
    kind: ["observation", "action"],
    dataSources: ["seo"],
    priority: 8,
    appliesWhen: (c) => Array.isArray(c.seoDecay?.decaying) && c.seoDecay.decaying.length > 0,
    observation: (c) => {
      const decay = c.seoDecay?.decaying || [];
      const biggest = decay[0];
      return `${decay.length} page${decay.length === 1 ? "" : "s"} dropped in rankings this period. ${biggest.url || `"${biggest.keyword}"`} fell from position ${biggest.priorPosition} to ${biggest.currentPosition} — a drop of ${biggest.change} places. Content decay is typically caused by newer, fresher competitor content outranking older posts.`;
    },
    action: () => `Update the decaying pages with current statistics, a new section, and a publish-date refresh. Recovery typically takes 2-4 weeks; faster if you also acquire 1-2 new links to the refreshed pages.`,
  },
  {
    id: "content.decay.none",
    category: "decay",
    kind: "observation",
    dataSources: ["seo"],
    priority: 3,
    appliesWhen: (c) => c.seo?.connected === true && Array.isArray(c.seoDecay?.decaying) && c.seoDecay.decaying.length === 0,
    observation: () => `No content decay detected this period — your tracked pages are holding or improving positions. Continue the current content refresh cadence.`,
  },

  // ─── Engagement per Content Type ──────────────────────────────────
  {
    id: "content.engagement.high_traffic_low_engagement",
    category: "engagement",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      return pages.some((p: any) => Number(p.views || p.pageviews || 0) > 100 && Number(p.bounceRate || 0) > 0.85);
    },
    observation: (c) => {
      const pages = (c.ga4?.topPages || []).filter((p: any) => Number(p.views || p.pageviews || 0) > 100 && Number(p.bounceRate || 0) > 0.85);
      const top = pages.sort((a: any, b: any) => Number(b.views || b.pageviews || 0) - Number(a.views || a.pageviews || 0))[0];
      return `${pages.length} page${pages.length === 1 ? "" : "s"} have 100+ views but >85% bounce rate. ${top.path || "(unknown)"} is the biggest — visitors arrive but leave immediately. Either the content doesn't match the search intent that brought them, or the above-fold experience is breaking the visit.`;
    },
  },
  {
    id: "content.engagement.services_low_traffic",
    category: "engagement",
    kind: ["observation", "action"],
    dataSources: ["ga4"],
    priority: 7,
    appliesWhen: (c) => {
      const pages = c.ga4?.topPages || [];
      const services = pages.find((p: any) => /services|service-areas?/i.test(p.path || ""));
      const home = pages.find((p: any) => p.path === "/" || /^\/?$/.test(p.path || ""));
      if (!services || !home) return false;
      const ratio = Number(home.views || home.pageviews || 0) > 0 ? Number(services.views || services.pageviews || 0) / Number(home.views || home.pageviews || 1) : 0;
      return ratio < 0.2 && Number(home.views || home.pageviews || 0) > 50;
    },
    observation: (c) => {
      const pages = c.ga4?.topPages || [];
      const services = pages.find((p: any) => /services|service-areas?/i.test(p.path || ""));
      const home = pages.find((p: any) => p.path === "/" || /^\/?$/.test(p.path || ""));
      const hv = Number(home?.views || home?.pageviews || 0);
      const sv = Number(services?.views || services?.pageviews || 0);
      const ratio = hv > 0 ? Math.round((sv / hv) * 100) : 0;
      return `Your /services page receives ${ratio}% of homepage traffic (${sv} of ${hv}). The services page is the natural next step from the homepage but it's not getting that handoff. Visitors are leaving without learning what you actually offer.`;
    },
    action: () => `Add visual service cards or a "What we do" section above the fold on the homepage that links directly to /services. Make the path obvious — visitors shouldn't have to find the services link in the nav.`,
  },

  // ─── Featured Pages ──────────────────────────────────────────────
  {
    id: "content.types.blog_vs_pages",
    category: "content-mix",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 4,
    appliesWhen: (c) => {
      const posts = Number(c.plugin?.seoAgg?.seo?.posts || 0);
      const pages = Number(c.plugin?.seoAgg?.seo?.pages || 0);
      return posts > 0 || pages > 0;
    },
    observation: (c) => {
      const posts = Number(c.plugin?.seoAgg?.seo?.posts || 0);
      const pages = Number(c.plugin?.seoAgg?.seo?.pages || 0);
      const total = posts + pages;
      if (total === 0) return "";
      if (posts === 0) return `Zero blog posts on the site (${pages} static pages). Static-page-only sites cap their organic-growth potential — every blog post is a new query opportunity that static pages can't replicate. Consider adding even a small blog (FAQ + case studies) to broaden search surface area.`;
      if (posts > pages * 5) return `Blog-heavy content profile (${posts} posts vs ${pages} pages). Strong for organic growth as long as posts are converting; verify the blog→contact path exists.`;
      return `${posts} blog posts + ${pages} static pages. Balanced content mix.`;
    },
  },

  // ─── Internal Linking ─────────────────────────────────────────────
  {
    id: "content.linking.homepage_orphans",
    category: "internal-linking",
    kind: "observation",
    dataSources: ["plugin"],
    priority: 5,
    appliesWhen: (c) => {
      const orphans = c.plugin?.risk?.orphan_pages;
      return Array.isArray(orphans) && orphans.length > 0;
    },
    observation: (c) => {
      const orphans = c.plugin?.risk?.orphan_pages || [];
      return `${orphans.length} page${orphans.length === 1 ? " is" : "s are"} orphaned — no internal links point to ${orphans.length === 1 ? "it" : "them"}. Google deprioritises orphaned pages and they accumulate no internal authority. Either link to them from related content or noindex them.`;
    },
  },

  // ─── Data Gaps ────────────────────────────────────────────────────
  {
    id: "content.gap.plugin_not_connected",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: ["plugin"],
    priority: 8,
    appliesWhen: (c) => c.plugin == null || (!c.plugin.wordCount && !c.plugin.age),
    observation: () => `IA Plugin is not connected or not yet reporting content telemetry. Without plugin data there's no visibility into content depth (word counts), freshness (age buckets), SEO scores, or publishing pace.`,
    action: () => `Install + activate the IA Plugin on the WordPress site. Once connected it auto-syncs content telemetry within 6 hours, lighting up the depth + freshness + SEO Content Intelligence rules.`,
  },
  {
    id: "content.gap.ga4_no_pages",
    category: "data-gaps",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 6,
    appliesWhen: (c) => Number(c.ga4?.summary?.totalSessions || 0) > 50 && !Array.isArray(c.ga4?.topPages),
    observation: () => `GA4 is reporting sessions but no page-level breakdown. Without per-page data there's no visibility into top entry pages, conversion paths, or page-specific bounce. Check that the page_view event is firing on every page.`,
  },

  // ─── Scale Warning ────────────────────────────────────────────────
  {
    id: "content.scale.low_volume",
    category: "scale",
    kind: "observation",
    dataSources: ["ga4"],
    priority: 3,
    appliesWhen: (c) => Number(c.ga4?.summary?.totalSessions || 0) < 100,
    observation: (c) => {
      const ses = Number(c.ga4?.summary?.totalSessions || 0);
      return `${ses} sessions this period — too thin for page-level engagement analysis. Patterns called out here are directional; revisit once you're sustaining 300+ sessions/month.`;
    },
  },
];

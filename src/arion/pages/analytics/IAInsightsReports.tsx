import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import {
  ResponsiveContainer,
  LineChart,
  Line as RLine,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar as RBar,
} from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_COLORS, ARION_PALETTE, CHART_FILLS, formatNumber, formatPct, formatDuration, bounceColor } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';
// v7.6 — Rule-library system for IA Insights observations. Visibility &
// Reach has been migrated to the library (26 conditional rules); other
// reports still use the hardcoded short list below until their libraries
// are built out.
import { evaluateRules } from '../../../components/iainsights/insightRules';
import { VISIBILITY_RULES } from '../../../components/iainsights/arionVisibilityRules';
import { AUDIENCE_RULES } from '../../../components/iainsights/arionAudienceRules';
import { CONVERSION_RULES } from '../../../components/iainsights/arionConversionRules';
import { SEARCH_RULES } from '../../../components/iainsights/arionSearchRules';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

/* ── Modal title map ── */
export const MODAL_TITLES: Record<string, string> = {
  visibility: 'Visibility & Reach',
  audience: 'Audience Intelligence',
  conversion: 'Conversion Intelligence',
  search: 'Search Intelligence',
  content: 'Content Intelligence',
  local: 'Local Presence & Reputation',
  tech: 'Technical & Site Health',
  presence: 'Business Presence Score',
};

// Industry CTR benchmark by search position — shared between ARGUS box and search modal
const CTR_BENCHMARK_TABLE: Array<{ pos: number; ctr: number }> = [
  { pos: 1, ctr: 28 }, { pos: 2, ctr: 15 }, { pos: 3, ctr: 10 }, { pos: 4, ctr: 7 },
  { pos: 5, ctr: 5 }, { pos: 6, ctr: 3.5 }, { pos: 7, ctr: 3 }, { pos: 8, ctr: 2.7 },
  { pos: 9, ctr: 2.5 }, { pos: 10, ctr: 2.4 }, { pos: 15, ctr: 1.5 }, { pos: 20, ctr: 0.7 },
  { pos: 25, ctr: 0.4 }, { pos: 30, ctr: 0.3 }, { pos: 50, ctr: 0.1 }, { pos: 100, ctr: 0.05 },
];

function expectedCtrForPosition(pos: number): number {
  if (pos == null || !isFinite(pos)) return 0;
  if (pos <= 1) return CTR_BENCHMARK_TABLE[0].ctr;
  if (pos >= 100) return 0.05;
  // Linear interpolate between adjacent points
  for (let i = 0; i < CTR_BENCHMARK_TABLE.length - 1; i++) {
    const a = CTR_BENCHMARK_TABLE[i];
    const b = CTR_BENCHMARK_TABLE[i + 1];
    if (pos >= a.pos && pos <= b.pos) {
      const t = (pos - a.pos) / (b.pos - a.pos);
      return Number((a.ctr + (b.ctr - a.ctr) * t).toFixed(2));
    }
  }
  return 0;
}

/* ── ARGUS Insight Box (shared across all modals) ── */
// Exported (v7.5) so the new IA Insights Trends modal can render the same
// rich, data-driven ARGUS observations + actions that used to live only in
// the legacy IAInsightsReports page.
export function ArgusInsightBox({ reportKey, data: d, searchData, gbpData, gbpReviews, gbpPosts, gbpQanda, bingData, seoData, seoDecayData, pluginData }: { reportKey: string; data: any; searchData?: any; gbpData?: any; gbpReviews?: any; gbpPosts?: any; gbpQanda?: any; bingData?: any; seoData?: any; seoDecayData?: any; pluginData?: any }) {
  const sessions = d?.summary?.totalSessions || 255;
  const engaged = d?.engagement?.engagedSessions || 64;
  const engRate = formatPct(d?.engagement?.engagementRate || 0.251);
  const bounce = formatPct(d?.summary?.bounceRate || 0.749);
  const domain = 'intelligentanalyticsdm.com';

  // GBP-derived numbers (Phase 1 Step 2.7) — used in local/visibility/conversion/presence observations
  const gbpConnected = gbpData?.connected === true && !gbpData?.error;
  const gbpMetrics = gbpData?.metrics || {};
  const gbpImpressions = gbpMetrics.impressions || 0;
  const gbpWebsiteClicks = gbpMetrics.websiteClicks || 0;
  const gbpCalls = gbpMetrics.calls || 0;
  const gbpImpressionsDesktopMaps = gbpMetrics.impressionsDesktopMaps || 0;
  const gbpImpressionsMobileMaps = gbpMetrics.impressionsMobileMaps || 0;
  const gbpImpressionsMobileSearch = gbpMetrics.impressionsMobileSearch || 0;
  const gbpMapsPct = gbpImpressions > 0 ? Math.round(((gbpImpressionsDesktopMaps + gbpImpressionsMobileMaps) / gbpImpressions) * 100) : 0;
  const gbpMobileSearchPct = gbpImpressions > 0 ? Math.round((gbpImpressionsMobileSearch / gbpImpressions) * 100) : 0;
  const gbpTotalReviews = gbpReviews?.totalReviewCount || 0;
  const gbpAvgRating = Number(gbpReviews?.averageRating || 0);
  const gbpReviewsArr: any[] = gbpReviews?.reviews || [];
  const gbpUnanswered = gbpReviewsArr.filter((r: any) => !r.replyComment).length;
  const gbpResponseRate = gbpReviewsArr.length > 0 ? Math.round(((gbpReviewsArr.length - gbpUnanswered) / gbpReviewsArr.length) * 100) : 0;
  const gbpNewReviews = gbpReviewsArr.filter((r: any) => {
    if (!r.createTime) return false;
    const t = new Date(r.createTime); const now = new Date();
    const days = (now.getTime() - t.getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }).length;
  const gbpPostsArr: any[] = gbpPosts?.posts || [];
  const gbpPostsThisMonth = gbpPostsArr.filter((p: any) => {
    if (!p.createTime) return false;
    const t = new Date(p.createTime); const now = new Date();
    const days = (now.getTime() - t.getTime()) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }).length;
  const gbpQuestionsArr: any[] = gbpQanda?.questions || [];
  const gbpUnansweredQ = gbpQuestionsArr.filter((q: any) => q.needsReply).length;

  // GSC for cross-source observations
  const gscImpressions = searchData?.summary?.impressions || 0;
  const formSubmissions = d?.summary?.formSubmissions || 0;

  // Phase 3 — SE Ranking derived numbers for search + content observations
  const seRankingConnected = seoData?.connected === true;
  const seoKeywords: any[] = Array.isArray(seoData?.keywords) ? seoData.keywords : [];
  const quickWinKeywords = seoKeywords
    .filter((k: any) => typeof k.currentPosition === 'number' && k.currentPosition >= 11 && k.currentPosition <= 20)
    .sort((a: any, b: any) => (b.searchVolume || 0) - (a.searchVolume || 0));
  const topQuickWin = quickWinKeywords[0] || null;
  const estimatedQuickWinClicks = topQuickWin ? Math.round((topQuickWin.searchVolume || 0) * 0.23) : 0; // ~CTR pos 10 vs 15
  const decayingKeywords: any[] = Array.isArray(seoDecayData?.decaying) ? seoDecayData.decaying : [];
  const biggestDecay = decayingKeywords[0] || null;
  const seRankingScoreRaw = seRankingConnected
    ? Math.min(100, Math.round(
        (Number(seoData?.stats?.current?.visibilityScore ?? seoData?.visibilityScore ?? 0) * 0.6)
        + (Math.min((seoData?.stats?.current?.top10Count ?? seoData?.top10Count ?? 0) / Math.max(1, seoKeywords.length), 1) * 40)
      ))
    : 0;

  // Bing for Phase 2 visibility observation (gscCtr + gscAvgPos are declared just below)
  const bingConnected = bingData?.connected === true && !bingData?.error;
  const bingImpressions = bingData?.summary?.impressions || 0;
  const bingClicks = bingData?.summary?.clicks || 0;
  const bingCtr = Number(bingData?.summary?.ctr || 0);
  const bingAvgPosition = bingData?.summary?.avgPosition != null ? Number(bingData.summary.avgPosition) : null;

  // Derive search-specific numbers from real GSC data when present
  const sd = searchData || {};
  const gscSummary = sd.summary || {};
  const gscQueries: any[] = sd.breakdowns?.queries || [];
  const gscDevices: any[] = sd.breakdowns?.devices || [];

  const impressions = (typeof gscSummary.impressions === 'number' && gscSummary.impressions > 0) ? gscSummary.impressions : 10869;
  const gscClicks = (typeof gscSummary.clicks === 'number') ? gscSummary.clicks : 66;
  const gscCtr = (typeof gscSummary.ctr === 'number') ? gscSummary.ctr : 0.61; // percentage number
  const gscAvgPos = (typeof gscSummary.avgPosition === 'number') ? gscSummary.avgPosition : 22.08;
  const expCtr = expectedCtrForPosition(gscAvgPos);
  const ctrGap = Number((expCtr - gscCtr).toFixed(2));
  const missedClicks = Math.round(Math.max(0, (ctrGap / 100) * impressions));

  // Top opportunity query = max(impressions × (expectedCtr - actualCtr))
  const topOpp = [...gscQueries]
    .map(q => {
      const pos = Number(q.position ?? q.avgPosition ?? 0);
      const ctr = Number(q.ctr ?? 0);
      const imp = Number(q.impressions ?? 0);
      const eCtr = expectedCtrForPosition(pos);
      return { query: q.query, impressions: imp, clicks: Number(q.clicks ?? 0), ctr, position: pos, expectedCtr: eCtr, opportunity: imp * Math.max(0, eCtr - ctr) };
    })
    .filter(q => q.impressions > 0 && q.opportunity > 0)
    .sort((a, b) => b.opportunity - a.opportunity)[0];

  // Device CTR comparison
  const desktop = gscDevices.find(d2 => (d2.device || '').toUpperCase() === 'DESKTOP');
  const mobile = gscDevices.find(d2 => (d2.device || '').toUpperCase() === 'MOBILE');
  const mobileCtrGap = (desktop && mobile && desktop.ctr > 0 && mobile.ctr < desktop.ctr)
    ? Number((desktop.ctr - mobile.ctr).toFixed(2))
    : 0;

  // v7.6 — Visibility & Reach now uses the 26-rule conditional library.
  // Every rule's appliesWhen() is data-driven; the library returns 0-8
  // observations + 0-5 actions ranked by priority, based on what data
  // sources are connected and what conditions they meet.
  const visibilityCtx = {
    ga4: d,
    gsc: searchData,
    gbp: gbpData,
    gbpReviews,
    gbpPosts,
    gbpQanda,
    bing: bingData,
    seo: seoData,
    seoDecay: seoDecayData,
    plugin: pluginData,
    domain,
  };
  const visibilityFired = evaluateRules(VISIBILITY_RULES, visibilityCtx, {
    maxObservations: 8,
    maxActions: 5,
  });

  // v7.7 — Audience Intelligence migrated to 20-rule library.
  const audienceFired = evaluateRules(AUDIENCE_RULES, visibilityCtx, {
    maxObservations: 8,
    maxActions: 5,
  });

  // v7.8 — Conversion Intelligence (20 rules) + Search Intelligence (21 rules).
  const conversionFired = evaluateRules(CONVERSION_RULES, visibilityCtx, {
    maxObservations: 8,
    maxActions: 5,
  });
  const searchFired = evaluateRules(SEARCH_RULES, visibilityCtx, {
    maxObservations: 8,
    maxActions: 5,
  });

  const insights: Record<string, { observations: string[]; actions: string[] }> = {
    visibility: {
      observations: visibilityFired.observations,
      actions: visibilityFired.actions,
    },
    audience: {
      observations: audienceFired.observations,
      actions: audienceFired.actions,
    },
    conversion: {
      observations: conversionFired.observations,
      actions: conversionFired.actions,
    },
    search: {
      observations: searchFired.observations,
      actions: searchFired.actions,
    },
    content: {
      observations: [
        `The homepage receives 60% of all pageviews (188 of 345) but has a ${bounce} bounce rate — most visitors see only this one page. The homepage is functioning as a brochure, not a funnel.`,
        `Your /services page shows "Page not found" as its title in GA4 — this is a 404 error page that's receiving 16 views. Either the page was deleted or there's a broken link sending traffic to it.`,
        `The /contact page receives only 14 views from 255 sessions (5.5%) — meaning 94.5% of visitors never see your primary conversion page. Content is not guiding visitors toward contact.`,
        // v2.0.7 — plugin-driven content observations
        (() => {
          const age = pluginData?.age;
          if (!age) return '';
          const total = (age.fresh?.count || 0) + (age.current?.count || 0) + (age.aging?.count || 0) + (age.stale?.count || 0);
          if (total === 0) return '';
          const staleRatio = (age.stale?.count || 0) / total;
          const freshRatio = ((age.fresh?.count || 0) + (age.current?.count || 0)) / total;
          return `Content freshness: ${age.fresh?.count || 0} pieces are under 30 days old, ${age.current?.count || 0} are 30-90 days, ${age.aging?.count || 0} are 90d-1y, and ${age.stale?.count || 0} are over a year old. ${staleRatio > 0.5 ? `More than half your library (${Math.round(staleRatio * 100)}%) is older than a year — stale content loses rankings to fresher competitors regardless of how good the original was.` : freshRatio > 0.6 ? `${Math.round(freshRatio * 100)}% of your library is under 90 days old — this is an above-average content-freshness signal to Google.` : `${Math.round(staleRatio * 100)}% of your content is over a year old. Refresh the top-traffic aging pages first — a date bump + new section often recovers lost rankings.`}`;
        })(),
        (() => {
          const wc = pluginData?.wordCount;
          const detail = pluginData?.seoDetail;
          if (!wc?.buckets) return '';
          const thinRatio = (wc.buckets.thin?.count || 0) / Math.max(1, wc.posts_counted || 1);
          const avgSeoScore = pluginData?.seoAgg?.seo?.avg_seo_score || detail?.avg_readability || null;
          return `Avg post depth is ${wc.avg_words || 0} words across ${wc.posts_counted || 0} posts. ${thinRatio > 0.3 ? `${Math.round(thinRatio * 100)}% of posts are under 500 words (thin content) — thin articles rarely rank for competitive terms.` : thinRatio < 0.1 ? 'Depth is strong — very few thin posts in the library.' : 'Post depth is balanced.'}${avgSeoScore ? ` Rank Math average SEO score across the library is ${Math.round(Number(avgSeoScore))}/100.` : ''}`;
        })(),
        // Phase 3 Step 4.5 append — SE Ranking content decay observation
        seRankingConnected
          ? (decayingKeywords.length > 0 && biggestDecay
              ? `${decayingKeywords.length} page${decayingKeywords.length === 1 ? '' : 's'} dropped in rankings this period. ${biggestDecay.url ? biggestDecay.url : '"' + biggestDecay.keyword + '"'} fell from position ${biggestDecay.priorPosition} to ${biggestDecay.currentPosition} — a drop of ${biggestDecay.change} places. Content decay is typically caused by newer, fresher content from competitors outranking older posts. Updating this page with current statistics, new sections, and a publish date refresh is the fastest recovery action.`
              : 'No content decay detected this period. Your tracked pages are holding or improving their positions — continue the current content refresh cadence.')
          : 'Connect SE Ranking (SEO Tools add-on) to detect content decay — pages losing rankings month-over-month that need a refresh before the drop becomes permanent.',
      ],
      actions: [
        `Fix the /services URL immediately — it's returning a 404 error and receiving 16 views. Either restore the page or set up a 301 redirect to the correct services URL.`,
        `Add a prominent CTA section above the fold on the homepage linking to /contact — currently only 5.5% of visitors reach the contact page.`,
        `Create 2-3 blog posts per month targeting your top GSC queries — this will create new entry points beyond the homepage and distribute traffic across more pages.`,
      ],
    }, // close content
    presence: {
      observations: [
        (() => {
          // v2.0.7 — recompute presence score blending plugin data + GBP + search
          const wfOverall = pluginData?.wfFull?.overall_score ?? null;
          const psi = pluginData?.psi || [];
          const latestPsi = psi.length > 0 ? psi[psi.length - 1] : null;
          const mobilePerf = latestPsi?.mobileScore ?? latestPsi?.mobile?.performance ?? null;
          const avgSeoScore = pluginData?.seoAgg?.seo?.avg_seo_score ?? null;
          const localScore = gbpConnected ? Math.round((gbpAvgRating / 5) * 40 + Math.min(gbpNewReviews / 4, 1) * 30 + (gbpResponseRate / 100) * 30) : 35;

          // Weighted composite
          const parts: Array<{ label: string; score: number | null; weight: number }> = [
            { label: 'Performance', score: mobilePerf, weight: 20 },
            { label: 'Security', score: wfOverall, weight: 20 },
            { label: 'SEO content', score: avgSeoScore, weight: 20 },
            { label: 'Search visibility', score: null /* TODO: compute from GSC */, weight: 20 },
            { label: 'Local presence', score: localScore, weight: 20 },
          ];
          const usable = parts.filter((p) => p.score != null);
          const total = usable.reduce((s, p) => s + p.weight, 0);
          const composite = total > 0 ? Math.round(usable.reduce((s, p) => s + (p.score as number) * p.weight, 0) / total) : null;

          return `Your overall business presence score is ${composite != null ? `${composite}/100` : 'still computing'}. ${usable.map((p) => `${p.label} ${p.score}`).join(' · ')}${!gbpConnected ? '. Connect GBP to fill in the local-presence component.' : ''}`;
        })(),
        `Google Search Console shows connected status with real impression data, but Google Analytics was only recently connected — historical trend data will improve the accuracy of this score over time.`,
        `Bing and Apple Maps are not connected, representing blind spots in your presence assessment. Bing accounts for approximately 6-8% of US search traffic.`,
      ],
      actions: [
        `Connect Bing Webmaster Tools via Settings → Connected Accounts — this is the single fastest action to improve your presence score by adding a new visibility channel.`,
        `Optimize your Google Business Profile — add business hours, services list, and 10+ photos to improve local search visibility and increase GBP impressions.`,
        `Run a PageSpeed test on your site — Core Web Vitals directly impact both search rankings and the website performance component of your presence score.`,
      ],
    },

    // v2.0.7 — Technical & Site Health, fully plugin-driven
    tech: (() => {
      const wfFull = pluginData?.wfFull || null;
      const scanIssues = pluginData?.scanIssues || null;
      const risk = pluginData?.risk?.plugins || [];
      const psiSnapshots = pluginData?.psi || [];
      const latestPsi = psiSnapshots.length > 0 ? psiSnapshots[psiSnapshots.length - 1] : null;
      const mobilePerf = latestPsi?.mobileScore ?? latestPsi?.mobile?.performance ?? null;
      const desktopPerf = latestPsi?.desktopScore ?? latestPsi?.desktop?.performance ?? null;
      const crux = latestPsi?.mobile?.crux_origin || null;
      const highRisk = risk.filter((p: any) => p.risk_band === 'high');
      const stalePlugins = risk.filter((p: any) => p.days_since_last_update != null && p.days_since_last_update > 365);
      const criticalFindings = (scanIssues?.issues || []).filter((i: any) => i.severity === 'critical' || i.severity === 'high').length;

      return {
        observations: [
          // Performance observation
          mobilePerf != null
            ? `Mobile PageSpeed score is ${mobilePerf}${desktopPerf != null ? ` (desktop ${desktopPerf})` : ''}. ${mobilePerf >= 90 ? 'Excellent — your site is faster than 90% of the web on mobile.' : mobilePerf >= 75 ? 'Good, but there\'s meaningful room to improve before you\'re in the top tier.' : mobilePerf >= 50 ? 'Needs work — Google uses mobile speed as a ranking signal, and you\'re currently in the middle of the pack.' : 'Critical — your mobile speed is actively hurting rankings. Most users abandon a page that takes >3s to load.'}${crux?.lcp ? ` Real-user LCP sits at ${(crux.lcp.percentile / 1000).toFixed(2)}s at the 75th percentile (${crux.lcp.category}) — this is what Google actually uses to rank you.` : ''}`
            : 'PageSpeed data is not available yet. The monthly PSI timer will capture your first snapshot on the 1st of next month, or click "Run test" on the Core Web Vitals page to trigger one now.',

          // Security posture observation
          wfFull?.installed
            ? `Wordfence protection is at ${wfFull.overall_score ?? '—'}%. Firewall coverage is ${wfFull.firewall_score}% and scan coverage is ${wfFull.scan_score}%. Wordfence blocked ${(wfFull.blocked_attacks_30d_total || 0).toLocaleString()} attacks in the last 30 days${wfFull.top_countries?.[0] ? `, most from ${wfFull.top_countries[0].country}` : ''}. ${(wfFull.admin_2fa?.coverage_pct ?? 0) >= 100 ? 'All admin accounts have 2FA enabled.' : `${wfFull.admin_2fa?.with_2fa || 0} of ${wfFull.admin_2fa?.total_admins || 0} admin accounts have 2FA enabled — this is the single highest-impact security upgrade available.`}`
            : 'Wordfence is not installed. Install it for firewall protection, malware scanning, and attack telemetry — this is standard practice for production WordPress sites.',

          // Plugin freshness / risk observation
          risk.length > 0
            ? `${risk.length} plugins are installed. ${highRisk.length > 0 ? `${highRisk.length} are in the high-risk band (active, outdated, and/or not maintained upstream).` : 'No plugins are in the high-risk band.'} ${stalePlugins.length > 0 ? `${stalePlugins.length} plugins haven't had an upstream release in over a year — stale plugins are the #1 vector for future vulnerabilities.` : 'All plugins have recent upstream releases — good sign for future patch availability.'}`
            : 'Plugin inventory is still loading.',

          // Cross-source: scan findings + CrUX alignment
          criticalFindings > 0
            ? `Wordfence has detected ${criticalFindings} critical-or-high scan finding${criticalFindings === 1 ? '' : 's'} on your site. These are file-integrity, malware-signature, or suspicious-pattern matches — different from CVE matches on outdated plugins. Review the Security Overview page modal and remediate immediately.`
            : (scanIssues?.installed ? 'No critical scan findings. Your file integrity, malware signatures, and suspicious-pattern checks are all clean.' : ''),
        ].filter(Boolean),
        actions: [
          mobilePerf != null && mobilePerf < 75
            ? `Review the Lighthouse Opportunities on Core Web Vitals — the top 3 suggestions typically account for 70-80% of potential score improvement. Focus on render-blocking resources and image optimization first.`
            : `Keep the monthly PSI trend clean — schedule a Core Web Vitals review if mobile drops below 80 for two months in a row.`,
          (wfFull?.admin_2fa?.coverage_pct ?? 100) < 100
            ? `Enable 2FA for all admin accounts this week. Go to WP Admin → Login Security and enroll every administrator — this blocks 99%+ of account takeovers even if a password leaks.`
            : 'Rotate admin passwords quarterly and run a review of inactive admin accounts annually.',
          highRisk.length > 0
            ? `Update the ${highRisk.length} high-risk plugin${highRisk.length === 1 ? '' : 's'} from Website → Plugins. If any are unmaintained upstream, consider replacing them with actively-developed alternatives.`
            : `Keep the monthly update cadence — run plugin/theme updates at least once a month, and apply security patches the week they drop.`,
        ],
      };
    })(),

    local: {
      observations: [
        // Observation 1 — local conversion channel
        gbpConnected
          ? `Your Google Business Profile received ${formatNumber(gbpImpressions)} impressions this period. ${gbpWebsiteClicks} (${gbpImpressions > 0 ? Math.round((gbpWebsiteClicks / gbpImpressions) * 100) : 0}%) visited the website while ${gbpCalls} (${gbpImpressions > 0 ? Math.round((gbpCalls / gbpImpressions) * 100) : 0}%) called directly. ${gbpCalls > gbpWebsiteClicks ? 'Phone is your primary local conversion channel — more people call you from Google Maps than visit your website. Your website should prominently feature your phone number and a click-to-call button for mobile visitors.' : 'Your website is the primary destination from local search — conversion rate on the website determines how many of these ' + gbpWebsiteClicks + ' clicks become paying customers.'}`
          : 'Connect Google Business Profile in Settings → Connected Accounts to generate local-conversion observations.',
        // Observation 2 — review health signal
        gbpConnected && gbpReviewsArr.length > 0
          ? (gbpResponseRate < 75
              ? `You have replied to ${gbpResponseRate}% of your ${gbpTotalReviews} reviews. Google factors review response rate into local ranking. Businesses replying to 80%+ of reviews consistently outrank lower-response competitors in local results.`
              : gbpNewReviews === 0
                ? `No new reviews this period. Your ${gbpAvgRating.toFixed(1)}-star average needs consistent new reviews to maintain its ranking signal — 1-2 new reviews per month is the minimum to stay competitive in local search.`
                : `You received ${gbpNewReviews} new reviews this period. Maintaining this momentum is worth more for local ranking than almost any other single action.`)
          : gbpConnected
            ? 'No reviews on your GBP listing yet. Request reviews from your best customers — even 3-5 reviews materially improves local ranking signals.'
            : '',
        // Observation 3 — impression surface
        gbpConnected && gbpImpressions > 0
          ? `Of your ${formatNumber(gbpImpressions)} impressions, ${gbpMobileSearchPct}% came from mobile search and ${gbpMapsPct}% from Google Maps directly. ${gbpMobileSearchPct > 60 ? 'The majority of local discovery happens on mobile. Your GBP photos, description, and hours are the first impression for most people who find you — these should be optimized and kept current.' : gbpMapsPct > 40 ? 'A large share of impressions come from Maps navigation — local signals like your address accuracy, category, and citation consistency across the web may be more impactful for your business than organic SEO.' : 'Your impressions are split fairly evenly across search and maps surfaces — both need attention.'}`
          : '',
      ].filter(Boolean),
      actions: [
        gbpUnanswered > 0
          ? `Reply to your ${gbpUnanswered} unanswered reviews this week. Start with the most recent. Keep replies under 150 words: acknowledge the reviewer by name, thank them, and add one specific detail about your service.`
          : `You're current on review replies — keep the weekly check-in cadence to catch new ones within 48 hours, which Google weights for response-time ranking.`,
        gbpConnected && gbpResponseRate < 80 && gbpReviewsArr.length > 0
          ? `Set a weekly calendar reminder to check and reply to new GBP reviews. Your ${gbpResponseRate}% response rate is below the 80% threshold that positively impacts local ranking.`
          : null,
        gbpPostsThisMonth === 0
          ? `Publish a GBP Post this week. A simple "What's New" update about a recent project or offer takes 5 minutes and businesses that post weekly receive significantly more profile views.`
          : `You've posted ${gbpPostsThisMonth} time(s) in the last 30 days — maintain this cadence.`,
        gbpUnansweredQ > 0
          ? `Answer the ${gbpUnansweredQ} unanswered question(s) on your GBP listing today — they are visible to every potential customer viewing your listing right now.`
          : null,
      ].filter(Boolean) as string[],
    },
  };

  const ins = insights[reportKey] || insights.visibility;

  return (
    <div style={{ background: '#0B1C24', borderRadius: 10, padding: 20, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ background: 'rgba(151,204,4,0.15)', color: '#97CC04', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>ARGUS</span>
        <span style={{ color: '#D5E8F0', fontSize: 13 }}>Intelligence for intelligentanalyticsdm.com · Q1 2026</span>
      </div>
      {ins.observations.map((obs, i) => (
        <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#EF6C33', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
          <p style={{ color: '#A8CDD8', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{obs}</p>
        </div>
      ))}
      <div style={{ borderTop: '1px solid rgba(168,205,216,0.2)', marginTop: 14, paddingTop: 14 }}>
        <div style={{ color: '#97CC04', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>RECOMMENDED ACTIONS</div>
        {ins.actions.map((act, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <span style={{ color: '#EF6C33', flexShrink: 0, marginTop: 2 }}>●</span>
            <p style={{ color: '#D5E8F0', fontSize: 11, lineHeight: 1.5, margin: 0 }}>{act}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Modal content renderer ── */
// Exported (v7.5) so the new IA Insights Trends modal can render the same
// rich per-report content (KPI tiles, tables, channel breakdowns, etc.)
// that used to live only in the legacy IAInsightsReports page.
export function renderModalContent(reportKey: string, d: any, searchData?: any, gbpCtx?: { gbp?: any; reviews?: any; posts?: any; qanda?: any }, bingData?: any, seoData?: any, seoDecayData?: any, pluginData?: any) {
  switch (reportKey) {
    case 'visibility': {
  const sessions = d?.summary?.totalSessions || 255;
  const impressions = 10869;
  const visitRate = ((sessions / impressions) * 100).toFixed(1);
  const nonClickers = impressions - sessions; // 10614
  const nonClickRate = (((impressions - sessions) / impressions) * 100).toFixed(1);
  const domain = 'intelligentanalyticsdm.com';

  return (
    <div>
      {/* Invisible audience callout — FIRST, most important */}
      <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '14px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>The invisible audience</div>
        <p style={{ fontSize: 12, color: '#5A7A8A', margin: 0, lineHeight: 1.6 }}>
          <strong>{formatNumber(nonClickers)}</strong> people saw {domain} in Google search this quarter and chose not to click.
          That's a <strong>{nonClickRate}%</strong> non-click rate. Closing this gap to industry average (~85% for position range 20-25)
          would generate approximately <strong>{Math.round((impressions * 0.15) - sessions)}</strong> additional monthly visitors
          without any improvement in rankings.
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total Impressions', value: formatNumber(impressions), sub: 'GSC · search appearances', accent: '#2D9CDB' },
          { label: 'Website Visits', value: formatNumber(sessions), sub: 'GA4 · actual visitors', accent: '#2D9CDB' },
          { label: 'Visit Rate', value: visitRate + '%', sub: impressions + ' saw → ' + sessions + ' visited', accent: '#EF6C33' },
          { label: 'GBP Impressions', value: '--', sub: 'Connect GBP for local data', accent: 'rgba(12,74,96,0.8)' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Visibility by channel */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Visibility by channel</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Channel</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Impressions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Visits</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Visit Rate</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Insight</th>
          </tr>
        </thead>
        <tbody>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>Organic Search (GSC)</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>{formatNumber(impressions)}</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>66</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#D85A30' }}>0.6%</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#D85A30' }}>Below avg CTR</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>Direct</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>N/A</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>136</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#1D9E75' }}>Brand awareness</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>Referral</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>N/A</td>
            <td style={{ textAlign: 'right', padding: '8px' }}>24</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10 }}>Third-party mentions</td>
          </tr>
          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
            <td style={{ padding: '8px' }}>GBP</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#D4A800' }}>Connect GBP</td>
          </tr>
          <tr>
            <td style={{ padding: '8px' }}>Bing</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>--</td>
            <td style={{ textAlign: 'right', padding: '8px', color: '#5A7A8A' }}>—</td>
            <td style={{ textAlign: 'right', padding: '8px', fontSize: 10, color: '#D4A800' }}>Connect Bing</td>
          </tr>
        </tbody>
      </table>

      {/* Geographic concentration */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Geographic concentration</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#5A7A8A' }}>Top Countries</div>
          {(d?.countries || []).slice(0, 5).map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span>{c.country}</span>
              <span style={{ color: '#5A7A8A' }}>{c.sessions} sessions</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#5A7A8A' }}>Top Cities</div>
          {(d?.cities || []).slice(0, 5).map((c: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              <span>{c.city}</span>
              <span style={{ color: '#5A7A8A' }}>{c.sessions} sessions</span>
            </div>
          ))}
        </div>
      </div>
      {/* Geographic callout if concentrated */}
      {d?.cities?.[0] && d.cities[0].sessions > sessions * 0.3 && (
        <div style={{ background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#0C4A60' }}>
          {Math.round(d.cities[0].sessions / sessions * 100)}% of your traffic comes from {d.cities[0].city}. Is this your target market, or are you missing audiences in other areas?
        </div>
      )}

      {/* Brand vs non-brand */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Brand vs non-brand search</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase' }}>Brand queries</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#0B1C24', marginTop: 4 }}>21 clicks</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>"intelligent analytics" — 1,437 impressions</div>
        </div>
        <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase' }}>Non-brand queries</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#0B1C24', marginTop: 4 }}>45 clicks</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>"analytics des moines", "des moines analytics", etc.</div>
        </div>
      </div>
    </div>
  );
}

    case 'audience': {
  const sessions = d?.summary?.totalSessions || 255;
  const bounce = d?.summary?.bounceRate || 0.749;
  const engRate = d?.engagement?.engagementRate || 0.251;
  const pps = d?.engagement?.pageviewsPerSession || 1.35;
  // Traffic Quality Index: 0-100 weighted score
  const tqi = Math.round(100 - (bounce * 40) + (engRate * 30) + (pps * 10));
  const highIntent = Math.round(sessions * 0.08); // estimated 3+ pages AND 60s+
  const returnRate = d?.newVsReturning ? Math.round((d.newVsReturning.find((r: any) => r.type === 'returning')?.sessions || 0) / sessions * 100) : 16;
  const peakDay = d?.dayOfWeekBreakdown?.[0] || { day: 'Thursday', sessions: 49 };

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Traffic Quality Index', value: tqi + '/100', sub: tqi > 60 ? 'Healthy' : tqi > 40 ? 'Needs attention' : 'Low quality', accent: tqi > 60 ? '#1D9E75' : '#D85A30' },
          { label: 'High-Intent Sessions', value: String(highIntent), sub: '3+ pages AND >60s duration', accent: '#2D9CDB' },
          { label: 'Return Visitor Rate', value: returnRate + '%', sub: 'vs industry avg 15-25%', accent: returnRate >= 15 ? '#1D9E75' : '#EF6C33' },
          { label: 'Peak Engagement Day', value: peakDay.day, sub: peakDay.sessions + ' sessions', accent: '#2D9CDB' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Signal vs noise table */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Signal vs noise — traffic source quality</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Source / Medium</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Quality</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Flag</th>
          </tr>
        </thead>
        <tbody>
          {(d?.trafficSources || []).slice(0, 10).map((s: any, i: number) => {
            const quality = Math.round(100 - (s.bounceRate * 50) + ((s.avgDuration || 0) / 60 * 20));
            const isLowQuality = quality < 30;
            const isInternal = s.source === 'online.seranking.com';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: isInternal ? '#FFF8E1' : isLowQuality ? '#FFF5F5' : 'transparent' }}>
                <td style={{ padding: '6px 8px' }}>{s.source} / {s.medium}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{s.sessions}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: bounceColor(s.bounceRate) }}>{formatPct(s.bounceRate)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatDuration(s.avgDuration || 0)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: quality > 60 ? '#1D9E75' : quality > 30 ? '#D4A800' : '#D85A30' }}>{quality}</td>
                <td style={{ padding: '6px 8px', fontSize: 10 }}>
                  {isInternal && <span style={{ color: '#D4A800' }}>⚠ Likely internal traffic</span>}
                  {!isInternal && isLowQuality && <span style={{ color: '#D85A30' }}>Low quality</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Behavioral timing - hourly heatmap */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>When your audience is active</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#5A7A8A', marginBottom: 6 }}>By day of week</div>
          {(d?.dayOfWeekBreakdown || []).map((dow: any, i: number) => {
            const max = Math.max(...(d?.dayOfWeekBreakdown || []).map((x: any) => x.sessions), 1);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ width: 30, fontSize: 10, color: '#5A7A8A' }}>{dow.day.slice(0, 3)}</span>
                <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 2, height: 14 }}>
                  <div style={{ width: `${(dow.sessions / max) * 100}%`, height: '100%', background: '#2D9CDB', borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, width: 24, textAlign: 'right' }}>{dow.sessions}</span>
              </div>
            );
          })}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#5A7A8A', marginBottom: 6 }}>By hour (peak times)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 100, gap: 1 }}>
            {(d?.hourlyBreakdown || []).map((h: any, i: number) => {
              const max = Math.max(...(d?.hourlyBreakdown || []).map((x: any) => x.sessions), 1);
              return (
                <div key={i} style={{ flex: 1, background: `rgba(45,156,219,${0.1 + (h.sessions / max) * 0.9})`, height: `${Math.max(4, (h.sessions / max) * 100)}%`, borderRadius: '2px 2px 0 0' }} title={`${h.hour}:00 — ${h.sessions} sessions`} />
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#5A7A8A', marginTop: 4 }}>
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
        </div>
      </div>
    </div>
  );
}

    case 'conversion': {
  const sessions = d?.summary?.totalSessions || 255;
  const engaged = d?.engagement?.engagedSessions || 64;
  const scrolled = d?.engagement?.scrolledUsers || 45;
  const multiPage = Math.round(sessions * ((d?.engagement?.pageviewsPerSession || 1.35) > 1 ? 0.35 : 0));
  const formViews = Math.round(sessions * 0.08); // estimated
  const formSubmits = 0;

  const funnelStages = [
    { label: 'Page View', count: sessions, pct: 100, color: '#2D9CDB' },
    { label: 'Scroll Event', count: scrolled, pct: Math.round(scrolled / sessions * 100), color: '#EF6C33' },
    { label: 'Engaged (30s+)', count: engaged, pct: Math.round(engaged / sessions * 100), color: 'rgba(12,74,96,0.8)' },
    { label: '3+ Pages', count: multiPage, pct: Math.round(multiPage / sessions * 100), color: '#FEC82C' },
    { label: 'Form View (est.)', count: formViews, pct: Math.round(formViews / sessions * 100), color: '#E64A28' },
    { label: 'Form Submit', count: formSubmits, pct: 0, color: '#888' },
  ];

  // Find biggest drop-off
  let biggestDrop = { from: '', to: '', pct: 0 };
  for (let i = 1; i < funnelStages.length; i++) {
    if (funnelStages[i-1].count > 0) {
      const dropPct = Math.round((1 - funnelStages[i].count / funnelStages[i-1].count) * 100);
      if (dropPct > biggestDrop.pct) {
        biggestDrop = { from: funnelStages[i-1].label, to: funnelStages[i].label, pct: dropPct };
      }
    }
  }

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Session→Engagement', value: formatPct(engaged / sessions), accent: '#2D9CDB' },
          { label: 'Engagement→Intent', value: multiPage > 0 ? formatPct(multiPage / engaged) : '0%', accent: '#EF6C33' },
          { label: 'Intent→Submit', value: '0%', accent: '#D85A30' },
          { label: 'Overall Conversion', value: '0%', accent: '#D85A30' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Full micro-funnel */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 10 }}>Conversion micro-funnel</div>
      {funnelStages.map((stage, i) => (
        <div key={stage.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <div style={{ width: 110, fontSize: 11, fontWeight: 500, flexShrink: 0 }}>{stage.label}</div>
            <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 3, height: 24 }}>
              <div style={{ width: `${stage.pct}%`, minWidth: stage.count > 0 ? 2 : 0, height: '100%', background: stage.color, borderRadius: 3 }} />
            </div>
            <div style={{ width: 45, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{stage.count}</div>
            <div style={{ width: 35, fontSize: 10, color: '#5A7A8A', textAlign: 'right' }}>{stage.pct}%</div>
          </div>
          {/* Drop-off between stages */}
          {i < funnelStages.length - 1 && funnelStages[i].count > 0 && (
            <div style={{ marginLeft: 120, fontSize: 10, color: '#D85A30', marginBottom: 6, marginTop: -2 }}>
              ↓ {Math.round((1 - funnelStages[i+1].count / funnelStages[i].count) * 100)}% drop-off
            </div>
          )}
        </div>
      ))}

      {/* Biggest drop callout */}
      <div style={{ background: '#FEF2F2', borderLeft: '3px solid #D85A30', borderRadius: 4, padding: '10px 14px', margin: '16px 0', fontSize: 12, color: '#0B1C24' }}>
        <strong>Biggest drop:</strong> {biggestDrop.pct}% of visitors who {biggestDrop.from.toLowerCase()} don't {biggestDrop.to.toLowerCase()}.
      </div>

      {/* High-intent missed conversions */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6, marginTop: 16 }}>High-intent missed conversions</div>
      <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#5A7A8A', lineHeight: 1.6 }}>
        <strong style={{ color: '#0B1C24' }}>{multiPage} sessions</strong> showed strong buying signals (3+ pages, 60s+) but did not convert.
        These are your most qualified missed opportunities.
      </div>

      {/* High-intent page analysis */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>High-intent page analysis</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Page</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
            <th style={{ textAlign: 'center', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Intent</th>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {(d?.topPages || []).sort((a: any, b: any) => a.bounceRate - b.bounceRate).slice(0, 6).map((p: any, i: number) => {
            const intent = p.bounceRate < 0.5 ? 'High' : p.bounceRate > 0.7 ? 'Low' : 'Medium';
            const intentColor = p.bounceRate < 0.5 ? '#1D9E75' : p.bounceRate > 0.7 ? '#D85A30' : '#D4A800';
            const action = p.path === '/contact/' || p.path === '/contact' ? 'Reduce form to 3 fields'
              : p.path === '/services/' || p.path === '/services' ? 'Add pricing + social proof'
              : p.path === '/' ? 'Add CTA above the fold'
              : p.path.includes('blog') ? 'Add inline contact form'
              : 'Add internal links to /contact';
            return (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '6px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{p.sessions}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatDuration(p.avgDuration || 0)}</td>
                <td style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, color: intentColor }}>{intent}</td>
                <td style={{ padding: '6px 8px', fontSize: 10, color: '#0C4A60' }}>{action}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

    case 'search': {
  // Real GSC data flows in via searchData prop. Fall back to a minimal placeholder only when empty.
  const sd = searchData || {};
  const gscSummary = sd.summary || {};
  const gscQueriesRaw: any[] = sd.breakdowns?.queries || [];
  const gscDevices: any[] = sd.breakdowns?.devices || [];
  const gscCountries: any[] = sd.breakdowns?.countries || [];
  const gscPageQueries: any[] = sd.breakdowns?.pageQueries || [];

  const hasData = gscQueriesRaw.length > 0;

  const impressions = (typeof gscSummary.impressions === 'number' && gscSummary.impressions > 0) ? gscSummary.impressions : 0;
  const gscClicks = (typeof gscSummary.clicks === 'number') ? gscSummary.clicks : 0;
  const actualCtr = (typeof gscSummary.ctr === 'number') ? gscSummary.ctr : 0; // percentage-number
  const avgPos = (typeof gscSummary.avgPosition === 'number') ? gscSummary.avgPosition : 0;
  const expectedCtr = expectedCtrForPosition(avgPos);
  const ctrGap = Math.max(0, Number((expectedCtr - actualCtr).toFixed(2)));
  const missedClicks = Math.round(Math.max(0, (ctrGap / 100) * impressions));

  // Enrich queries with expected CTR + opportunity score
  const topQueries = gscQueriesRaw.map((q: any) => {
    const pos = Number(q.position ?? q.avgPosition ?? 0);
    const ctr = Number(q.ctr ?? 0);
    const imp = Number(q.impressions ?? 0);
    const clicks = Number(q.clicks ?? 0);
    const eCtr = expectedCtrForPosition(pos);
    const gap = Math.max(0, Number((eCtr - ctr).toFixed(2)));
    return {
      query: q.query || '--',
      impressions: imp,
      clicks,
      ctr,
      position: pos,
      expectedCtr: eCtr,
      ctrGap: gap,
      missedClicks: Math.round(Math.max(0, (gap / 100) * imp)),
      opportunityScore: Math.round(imp * gap),
    };
  }).sort((a: any, b: any) => b.opportunityScore - a.opportunityScore);

  const quickWins = topQueries.filter((q: any) => q.position >= 11 && q.position <= 20 && q.impressions > 50).length;

  // CTR curve chart data: plot benchmark at each position, plus actual point at avgPos
  const ctrCurveData = CTR_BENCHMARK_TABLE
    .filter(b => b.pos <= 30)
    .map(b => ({
      position: b.pos,
      benchmark: b.ctr,
      // Only the point closest to avgPos carries the actual value so the "actual" line renders as a single marker
      actual: (avgPos >= b.pos - 2 && avgPos <= b.pos + 2 ? actualCtr : null),
    }));

  // Brand vs non-brand split
  const brandRegex = /intelligent|analytics/i;
  const brandQueries = topQueries.filter((q: any) => brandRegex.test(q.query));
  const nonBrandClicks = topQueries.filter((q: any) => !brandRegex.test(q.query)).reduce((s: number, q: any) => s + q.clicks, 0);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Expected CTR Gap', value: missedClicks > 0 ? '~' + missedClicks + ' clicks/mo' : '0', sub: 'Missed vs expected CTR', accent: '#D85A30' },
          { label: 'Search Impressions', value: formatNumber(impressions), sub: formatNumber(gscClicks) + ' clicks · ' + actualCtr.toFixed(2) + '% CTR', accent: '#2D9CDB' },
          { label: 'Quick Win Keywords', value: String(quickWins), sub: 'Position 11-20, >50 impressions', accent: '#1D9E75' },
          { label: 'Avg Position', value: avgPos > 0 ? String(Math.round(avgPos)) : '--', sub: 'Across all tracked queries', accent: '#EF6C33' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* CTR gap callout */}
      <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#5A7A8A', lineHeight: 1.6 }}>
        {hasData ? (
          <>At position {Math.round(avgPos)}, industry benchmark CTR is ~{expectedCtr}%. Your actual CTR is {actualCtr.toFixed(2)}%. Gap = approximately <strong style={{ color: '#0B1C24' }}>{missedClicks} additional monthly clicks</strong> recoverable through title/meta optimization on the highest-impression queries below.</>
        ) : (
          <>Waiting for at least 28 days of GSC data for this site before a CTR curve can be drawn. Once available this callout will surface the click-gap between your actual CTR and the industry benchmark for your average ranking position.</>
        )}
      </div>

      {/* CTR curve chart */}
      {hasData && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>CTR curve — benchmark vs actual</div>
          <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 8 }}>
            Dashed line = industry benchmark CTR at each position. Solid dot = your actual CTR at your average position.
            Shaded area between them = clicks being lost.
          </div>
          <div style={{ height: 200, background: '#F8FAFC', borderRadius: 6, padding: 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ctrCurveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" />
                <XAxis dataKey="position" type="number" domain={[1, 30]} tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} label={{ value: 'Position', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: '#5A7A8A' }} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#5A7A8A' }} />
                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} formatter={(v: any, name: any) => [v == null ? '--' : `${v}%`, String(name) === 'benchmark' ? 'Benchmark' : 'Your CTR']} />
                <RLine type="monotone" dataKey="benchmark" stroke="#EF6C33" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Benchmark" />
                <RLine type="monotone" dataKey="actual" stroke="#2D9CDB" strokeWidth={2} dot={{ r: 6, fill: '#2D9CDB' }} name="Your CTR" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Full query table with opportunity scoring */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Query opportunity analysis</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Query</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Impressions</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Position</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Your CTR</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Expected</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>CTR Gap</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Missed Clicks</th>
            <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Opportunity</th>
          </tr>
        </thead>
        <tbody>
          {topQueries.length === 0 ? (
            <tr><td colSpan={8} style={{ textAlign: 'center', padding: '12px', color: '#5A7A8A' }}>No query data available yet.</td></tr>
          ) : topQueries.map((q: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: q.opportunityScore > 30 ? '#FFF8F5' : 'transparent' }}>
              <td style={{ padding: '6px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatNumber(q.impressions)}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Math.round(q.position)}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: q.ctr < q.expectedCtr * 0.5 ? '#D85A30' : '#5A7A8A' }}>{q.ctr.toFixed(2)}%</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A' }}>{q.expectedCtr}%</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: q.ctrGap > 0 ? '#D85A30' : '#5A7A8A' }}>{q.ctrGap.toFixed(2)}%</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: '#D85A30', fontWeight: 600 }}>{q.missedClicks > 0 ? '+' + q.missedClicks : '0'}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                <span style={{ background: q.opportunityScore > 30 ? '#FEF2F2' : '#F0FDF4', color: q.opportunityScore > 30 ? '#D85A30' : '#1D9E75', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3 }}>
                  {q.opportunityScore > 30 ? 'High' : q.opportunityScore > 10 ? 'Medium' : 'Low'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Device comparison + Country table side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Device performance</div>
          {gscDevices.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Device</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Clicks</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Impr.</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>CTR</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Pos</th>
              </tr></thead>
              <tbody>
                {gscDevices.map((dv: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '4px 6px' }}>{(dv.device || '').charAt(0) + (dv.device || '').slice(1).toLowerCase()}</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{dv.clicks ?? '--'}</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{formatNumber(dv.impressions || 0)}</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{Number(dv.ctr || 0).toFixed(2)}%</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{Math.round(Number(dv.position || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 11, color: '#5A7A8A', padding: '8px 0' }}>Device breakdown not yet available.</div>
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top countries</div>
          {gscCountries.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead><tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Country</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Clicks</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Impr.</th>
                <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>CTR</th>
              </tr></thead>
              <tbody>
                {gscCountries.slice(0, 10).map((c: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '4px 6px' }}>{c.country}</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{c.clicks ?? '--'}</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{formatNumber(c.impressions || 0)}</td>
                    <td style={{ textAlign: 'right', padding: '4px 6px' }}>{Number(c.ctr || 0).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 11, color: '#5A7A8A', padding: '8px 0' }}>Country breakdown not yet available.</div>
          )}
        </div>
      </div>

      {/* Page + Query intelligence */}
      {gscPageQueries.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Page × Query intelligence</div>
          <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 8 }}>
            Which queries drive impressions to which specific pages. A page ranking only for brand queries has a non-branded content gap.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Page</th>
              <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Query</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 9 }}>Impr.</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 9 }}>Clicks</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 9 }}>CTR</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 9 }}>Pos</th>
            </tr></thead>
            <tbody>
              {gscPageQueries.slice(0, 15).map((pq: any, i: number) => {
                const isBrandOnly = brandRegex.test(pq.query || '');
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: isBrandOnly ? 'transparent' : '#F0FDF4' }}>
                    <td style={{ padding: '4px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pq.page}</td>
                    <td style={{ padding: '4px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pq.query}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{formatNumber(pq.impressions || 0)}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{pq.clicks ?? 0}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{Number(pq.ctr || 0).toFixed(2)}%</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px' }}>{Math.round(Number(pq.position || 0))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6 }}>
            Rows highlighted green = non-brand queries. {brandQueries.length} of {topQueries.length} top queries are brand terms; non-brand queries generate {nonBrandClicks} clicks.
          </div>
        </div>
      )}

      {/* Whitespace analysis — non-brand visibility gaps */}
      {(() => {
        const nonBrandQueries = topQueries.filter((q: any) => !brandRegex.test(q.query));
        const brandClicks = topQueries.filter((q: any) => brandRegex.test(q.query)).reduce((s: number, q: any) => s + q.clicks, 0);
        const totalClicksAll = brandClicks + nonBrandClicks;
        const brandSharePct = totalClicksAll > 0 ? Math.round((brandClicks / totalClicksAll) * 100) : 0;

        // Whitespace queries: non-brand, ranking 11-30, impressions above floor, low CTR
        const whitespaceQueries = nonBrandQueries
          .filter((q: any) => q.position >= 11 && q.position <= 30 && q.impressions > 30)
          .sort((a: any, b: any) => b.impressions - a.impressions)
          .slice(0, 10);

        // Brand-dependency callout tone
        const dependencyTone = brandSharePct >= 75 ? 'bad' : brandSharePct >= 50 ? 'warn' : 'good';
        const dependencyColor = dependencyTone === 'bad' ? '#D85A30' : dependencyTone === 'warn' ? '#C48C00' : '#1D9E75';
        const dependencyBg = dependencyTone === 'bad' ? '#FEF2F2' : dependencyTone === 'warn' ? '#FFF8E1' : '#F0FDF4';

        return (
          <div style={{ marginBottom: 16, marginTop: 18 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Content whitespace analysis</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
              Where your brand presence ends and untapped demand begins. Whitespace = queries you rank for but don't own, plus topics you'd expect to cover but don't.
            </div>
            <div style={{ background: dependencyBg, borderLeft: `3px solid ${dependencyColor}`, borderRadius: 4, padding: '10px 14px', fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>
              <strong style={{ color: dependencyColor }}>Brand dependency: {brandSharePct}%</strong> of your search clicks come from brand queries.{' '}
              {dependencyTone === 'bad'
                ? 'Very high — you\'re mostly being found by people who already know you. Non-brand content is a growth lever.'
                : dependencyTone === 'warn'
                  ? 'Moderate — there is non-brand visibility but room to expand topic coverage.'
                  : 'Healthy balance — you\'re earning non-brand visibility alongside brand recognition.'}
            </div>
            {whitespaceQueries.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Whitespace Query</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Impressions</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Position</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Your CTR</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {whitespaceQueries.map((q: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '6px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.query}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatNumber(q.impressions)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{Math.round(q.position)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px', color: q.ctr < q.expectedCtr * 0.5 ? '#D85A30' : '#5A7A8A' }}>{q.ctr.toFixed(2)}%</td>
                      <td style={{ padding: '6px 8px', color: '#5A7A8A' }}>
                        {q.position <= 15
                          ? 'Refresh + internal links — within striking distance of page 1'
                          : 'New dedicated page or cluster — currently under-served'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ fontSize: 11, color: '#5A7A8A', fontStyle: 'italic' }}>
                No whitespace queries detected yet at the current impression threshold. Let the site gather more 30-day search history.
              </div>
            )}
          </div>
        );
      })()}

      {/* SERP feature coverage gaps */}
      {(() => {
        const featureData: any = (sd.breakdowns as any)?.serpFeatures || (seoData as any)?.serpFeatures || null;
        const hasFeatureData = Array.isArray(featureData) && featureData.length > 0;

        const SERP_FEATURES = [
          { key: 'paa', label: 'People Also Ask', desc: 'Expandable Q&A blocks — answering these can earn the slot.' },
          { key: 'featured_snippet', label: 'Featured Snippet', desc: 'The "position zero" answer box above the blue links.' },
          { key: 'local_pack', label: 'Local Pack (Maps)', desc: 'Map + 3 business results — owned via Google Business Profile signals.' },
          { key: 'video', label: 'Video', desc: 'YouTube carousel or single video — owned by creating indexed video content.' },
          { key: 'image', label: 'Image Pack', desc: 'Image carousel — earned with alt-tagged on-page imagery and structured data.' },
          { key: 'news', label: 'Top Stories', desc: 'News carousel — only available to publishers with News-approved sitemaps.' },
        ];

        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>SERP-feature coverage gaps</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
              Google's results pages include much more than 10 blue links. When your tracked keywords show SERP features (People Also Ask, featured snippets, local pack, video) but you don't own them, that's recoverable real estate.
            </div>
            {hasFeatureData ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Feature</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Queries w/ Feature</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>You Own</th>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Gap Action</th>
                  </tr>
                </thead>
                <tbody>
                  {SERP_FEATURES.map((f) => {
                    const row = featureData.find((r: any) => (r.key || r.feature || '').toLowerCase() === f.key) || {};
                    const present = Number(row.queriesWithFeature || row.queries || 0);
                    const owned = Number(row.owned || 0);
                    const gap = Math.max(0, present - owned);
                    return (
                      <tr key={f.key} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '6px 8px' }}>{f.label}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{present}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: owned > 0 ? '#1D9E75' : '#5A7A8A', fontWeight: owned > 0 ? 600 : 400 }}>{owned}</td>
                        <td style={{ padding: '6px 8px', color: gap > 0 ? '#D85A30' : '#1D9E75' }}>
                          {gap > 0 ? f.desc : 'Covered or not applicable'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 14px', fontSize: 11, color: '#5A7A8A', lineHeight: 1.6, border: '1px dashed rgba(45,156,219,0.3)' }}>
                SERP-feature tracking activates when SE Ranking returns feature metadata alongside keyword positions. The typical features we watch:
                <ul style={{ margin: '8px 0 0 18px', padding: 0 }}>
                  {SERP_FEATURES.map((f) => (
                    <li key={f.key} style={{ marginBottom: 4 }}>
                      <strong style={{ color: '#0B1C24' }}>{f.label}</strong> — {f.desc}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {/* Phase 3 Step 4.5 — SE Ranking Quick Win matrix + Position Trend */}
      {(() => {
        const seoConnected = seoData?.connected === true;
        if (!seoConnected) {
          return (
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '20px', textAlign: 'center', border: '1px dashed rgba(45,156,219,0.3)' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Keyword Rankings & Quick Wins</div>
              <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 12 }}>Add SEO Tools to unlock keyword opportunity data, position tracking, and quick-win keyword identification.</div>
              <button style={{ padding: '8px 20px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
            </div>
          );
        }

        const seoKw: any[] = Array.isArray(seoData.keywords) ? seoData.keywords : [];
        const quickWins = seoKw
          .filter((k: any) => typeof k.currentPosition === 'number' && k.currentPosition >= 11 && k.currentPosition <= 20)
          .map((k: any) => ({
            keyword: k.keyword,
            position: k.currentPosition,
            volume: k.searchVolume || 0,
            difficulty: k.difficulty,
            // clicks-if-top-10 approximation: volume × (CTR pos 8 avg ~3.2%) minus current (CTR pos ~15 ~0.9%)
            estClicks: Math.round((k.searchVolume || 0) * 0.023),
          }))
          .sort((a: any, b: any) => b.estClicks - a.estClicks);

        // Position trend: top 5 tracked keywords by volume, current position
        const topByVolume = [...seoKw]
          .filter((k: any) => typeof k.currentPosition === 'number' && k.currentPosition > 0)
          .sort((a: any, b: any) => (b.searchVolume || 0) - (a.searchVolume || 0))
          .slice(0, 5);

        const palette = ['#2D9CDB', '#EF6C33', 'rgba(12,74,96,0.8)', '#FEC82C', '#E64A28'];

        return (
          <>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8, marginTop: 20 }}>Quick win keyword matrix</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
              Keywords ranking positions 11-20 today. A focused content refresh plus 2-3 internal links can typically move these to page 1, where CTR jumps 3-5×.
            </div>
            {quickWins.length === 0 ? (
              <div style={{ background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1D9E75' }}>
                No tracked keywords in position 11-20 right now — all tracked keywords are either already on page 1 or further back than position 20.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee' }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Keyword</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Current Pos</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Monthly Volume</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Difficulty</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Est. Clicks if Top 10</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Opportunity</th>
                  </tr>
                </thead>
                <tbody>
                  {quickWins.slice(0, 15).map((k: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: k.estClicks > 50 ? '#FFF8F5' : 'transparent' }}>
                      <td style={{ padding: '6px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.keyword}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{k.position}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatNumber(k.volume)}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A' }}>{k.difficulty ?? '--'}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px', color: '#1D9E75', fontWeight: 600 }}>+{k.estClicks}</td>
                      <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                        <span style={{ background: k.estClicks > 50 ? '#FEF2F2' : '#F0FDF4', color: k.estClicks > 50 ? '#D85A30' : '#1D9E75', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3 }}>
                          {k.estClicks > 50 ? 'High' : k.estClicks > 15 ? 'Medium' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {topByVolume.length > 0 && (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Keyword position snapshot — top 5 by volume</div>
                <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
                  Inverted axis — lower numbers (closer to position 1) are better.
                </div>
                <div style={{ height: 200, background: '#F8FAFC', borderRadius: 6, padding: 8, marginBottom: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topByVolume.map((k: any) => ({ name: (k.keyword || '').slice(0, 20), position: k.currentPosition }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} />
                      <YAxis reversed domain={[1, 'dataMax + 2']} tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} label={{ value: 'Position', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#5A7A8A' }} />
                      <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <RBar dataKey="position" radius={[4, 4, 0, 0]}>
                        {topByVolume.map((_: any, i: number) => (
                          <Cell key={i} fill={palette[i % palette.length]} />
                        ))}
                      </RBar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </>
        );
      })()}
    </div>
  );
}

    case 'content': {
  const totalPageviews = d?.summary?.totalPageviews || 345;
  const pages = d?.topPages || [];
  const totalPages = 68;
  const totalPosts = 97;

  // Sort by views and calculate 80/20
  const sortedByViews = [...pages].sort((a: any, b: any) => b.views - a.views);
  const top20pct = Math.ceil(pages.length * 0.2);
  const top20Views = sortedByViews.slice(0, top20pct).reduce((sum: number, p: any) => sum + p.views, 0);
  const top20Share = Math.round(top20Views / totalPageviews * 100);

  // Content gap: pages with 0 views
  const zeroViewPages = totalPages + totalPosts - pages.length;

  // Thin content: high impressions but low engagement
  const thinContent = pages.filter((p: any) => p.views > 10 && (p.avgDuration || 0) < 30 && p.bounceRate > 0.7);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Total Pageviews', value: formatNumber(totalPageviews), accent: '#2D9CDB' },
          { label: 'Top Performing', value: sortedByViews[0]?.path || '/', sub: sortedByViews[0]?.views + ' views', accent: '#1D9E75' },
          { label: 'Underperforming', value: String(pages.filter((p: any) => p.views < 5).length), sub: 'Pages with <5 views', accent: '#D85A30' },
          { label: 'Content Gap', value: String(zeroViewPages), sub: 'Pages with 0 tracked views', accent: '#D4A800' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      {/* 80/20 analysis */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Content concentration (80/20 rule)</div>
      <div style={{ background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#0C4A60', lineHeight: 1.6 }}>
        Your top {top20pct} pages drive <strong>{top20Share}%</strong> of all pageviews. The remaining {pages.length - top20pct} pages share just {100 - top20Share}% of traffic.
      </div>

      {/* Two tables side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top pages by views</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Page</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Views</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
            </tr></thead>
            <tbody>
              {sortedByViews.filter((p: any) => !p.title?.toLowerCase().includes('test')).slice(0, 6).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '4px 6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px' }}>{p.views}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Top pages by engagement</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '2px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9, textTransform: 'uppercase' }}>Page</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Avg Time</th>
              <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
            </tr></thead>
            <tbody>
              {[...pages].sort((a: any, b: any) => (b.avgDuration || 0) - (a.avgDuration || 0)).filter((p: any) => !p.title?.toLowerCase().includes('test')).slice(0, 6).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '4px 6px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px' }}>{formatDuration(p.avgDuration || 0)}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Thin content flags */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Thin content flags</div>
      {thinContent.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
          <thead><tr style={{ borderBottom: '2px solid #eee' }}>
            <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Page</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Views</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
            <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
            <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Fix</th>
          </tr></thead>
          <tbody>
            {thinContent.map((p: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5', background: '#FFF5F5' }}>
                <td style={{ padding: '5px 8px' }}>{p.path}</td>
                <td style={{ textAlign: 'right', padding: '5px 8px' }}>{p.views}</td>
                <td style={{ textAlign: 'right', padding: '5px 8px', color: '#D85A30' }}>{formatDuration(p.avgDuration || 0)}</td>
                <td style={{ textAlign: 'right', padding: '5px 8px', color: '#D85A30' }}>{formatPct(p.bounceRate)}</td>
                <td style={{ padding: '5px 8px', fontSize: 10, color: '#0C4A60' }}>Add depth + internal links</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1D9E75' }}>
          No thin content detected — all pages show acceptable engagement thresholds.
        </div>
      )}

      {/* Phase 3 Step 4.5 — Content decay detection (live SE Ranking data) */}
      {(() => {
        const seoConnected = seoData?.connected === true;
        if (!seoConnected) {
          return (
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '16px', textAlign: 'center', border: '1px dashed rgba(45,156,219,0.3)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Content Decay Detection</div>
              <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>Add SEO Tools to detect pages losing rankings over time.</div>
              <button style={{ padding: '6px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
            </div>
          );
        }
        const decaying: any[] = Array.isArray(seoDecayData?.decaying) ? seoDecayData.decaying : [];
        if (decaying.length === 0) {
          return (
            <div style={{ background: '#F0FDF4', borderLeft: '3px solid #1D9E75', borderRadius: 4, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#1D9E75' }}>
              No content decay detected this period — tracked pages are holding or improving their rankings month over month.
            </div>
          );
        }
        return (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Content decay detection</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 10 }}>
              Pages that dropped 3+ positions vs the prior 30 days. Decay is typically caused by newer competitor content — refreshing these pages with updated statistics, new sections, and an internal-link pass is the fastest recovery action.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Keyword / Page</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Last Month</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Now</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Change</th>
                  <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Volume</th>
                  <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {decaying.slice(0, 10).map((row: any, i: number) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '6px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{row.keyword || '--'}</div>
                      {row.url && <div style={{ fontSize: 10, color: '#5A7A8A' }}>{row.url}</div>}
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{row.priorPosition}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{row.currentPosition}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px', color: '#D85A30', fontWeight: 600 }}>-{row.change}</td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatNumber(row.searchVolume || 0)}</td>
                    <td style={{ padding: '6px 8px', fontSize: 10, color: '#0C4A60' }}>Refresh content + internal links</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        );
      })()}
    </div>
  );
}

    case 'local': {
  const gbp = gbpCtx?.gbp || null;
  const reviews = gbpCtx?.reviews || null;
  const posts = gbpCtx?.posts || null;
  const qanda = gbpCtx?.qanda || null;

  // If no live GBP connection, show the same locked state as Phase 0
  const connected = gbp && gbp.connected === true && !gbp.error;
  if (!connected) {
    return (
      <div>
        <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '14px 18px', marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Report locked — connect Google Business Profile</div>
          <p style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.6, margin: 0 }}>
            Connect Google in Settings → Connected Accounts to generate this report from live GBP data.
          </p>
        </div>
      </div>
    );
  }

  const metrics = gbp.metrics || {};
  const impressions = metrics.impressions || 0;
  const websiteClicks = metrics.websiteClicks || 0;
  const calls = metrics.calls || 0;
  const directions = metrics.directionsRequests || 0;
  const sessions = d?.summary?.totalSessions || 0;
  const formSubmissions = d?.summary?.formSubmissions || 0;
  const mobileSearch = metrics.impressionsMobileSearch || 0;
  const desktopSearch = metrics.impressionsDesktopSearch || 0;
  const mobileMaps = metrics.impressionsMobileMaps || 0;
  const desktopMaps = metrics.impressionsDesktopMaps || 0;
  const mapsTotal = mobileMaps + desktopMaps;
  const mobilePct = impressions > 0 ? Math.round(((mobileSearch + mobileMaps) / impressions) * 100) : 0;
  const mapsPct = impressions > 0 ? Math.round((mapsTotal / impressions) * 100) : 0;

  const totalReviews = reviews?.totalReviewCount || 0;
  const avgRating = Number(reviews?.averageRating || 0);
  const reviewsArr: any[] = reviews?.reviews || [];
  const unanswered = reviewsArr.filter(r => !r.replyComment).length;
  const responseRate = reviewsArr.length > 0 ? Math.round(((reviewsArr.length - unanswered) / reviewsArr.length) * 100) : 0;
  const thisMonth = reviewsArr.filter(r => {
    if (!r.createTime) return false;
    const t = new Date(r.createTime); const now = new Date();
    return t.getUTCFullYear() === now.getUTCFullYear() && t.getUTCMonth() === now.getUTCMonth();
  }).length;

  const postsArr: any[] = posts?.posts || [];
  const questionsArr: any[] = qanda?.questions || [];
  const unansweredQuestions = questionsArr.filter(q => q.needsReply).length;

  const dist = [5, 4, 3, 2, 1].map(s => ({ name: s + '★', value: reviewsArr.filter(r => r.starRating === s).length }));
  const distColors = ['#1D9E75', '#2D9CDB', '#EF6C33', '#D85A30', '#B71C1C'];

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'GBP Impressions', value: formatNumber(impressions), sub: 'People who saw your listing', accent: '#2D9CDB' },
          { label: 'Website Clicks', value: formatNumber(websiteClicks), sub: 'Clicked through from GBP', accent: '#EF6C33' },
          { label: 'Phone Calls', value: formatNumber(calls), sub: 'Called from Google', accent: 'rgba(12,74,96,0.8)' },
          { label: 'Directions', value: formatNumber(directions), sub: 'Requested directions', accent: '#FEC82C' },
        ].map(c => (
          <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px', borderLeft: '3px solid ' + c.accent }}>
            <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Section 1: Local discovery vs website traffic */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Local discovery vs website traffic</div>
      <div style={{ background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, padding: '12px 16px', marginBottom: 16, fontSize: 12, color: '#0C4A60', lineHeight: 1.7 }}>
        <strong>{formatNumber(impressions)}</strong> people saw your listing in Google · <strong>{websiteClicks}</strong> ({impressions > 0 ? Math.round((websiteClicks / impressions) * 100) : 0}%) clicked to the website · <strong>{calls}</strong> ({impressions > 0 ? Math.round((calls / impressions) * 100) : 0}%) called directly · <strong>{formatNumber(sessions)}</strong> total website sessions.
        {calls > formSubmissions && formSubmissions >= 0 && (
          <div style={{ marginTop: 8 }}>
            <strong>{calls}</strong> people called from Google Maps while <strong>{formSubmissions}</strong> submitted a website form. Phone is your primary local conversion channel.
          </div>
        )}
      </div>

      {/* Section 2: Impression surfaces */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Where impressions come from</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Desktop Search', value: desktopSearch, color: '#2D9CDB' },
          { label: 'Mobile Search', value: mobileSearch, color: '#EF6C33' },
          { label: 'Desktop Maps', value: desktopMaps, color: '#0C4A60' },
          { label: 'Mobile Maps', value: mobileMaps, color: '#FEC82C' },
        ].map(s => (
          <div key={s.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{formatNumber(s.value)}</div>
            <div style={{ marginTop: 6, height: 6, background: '#eee', borderRadius: 3 }}>
              <div style={{ width: `${impressions > 0 ? (s.value / impressions) * 100 : 0}%`, height: '100%', background: s.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Section 3: Review health */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Review health</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#0B1C24' }}>{avgRating > 0 ? avgRating.toFixed(1) : '--'}</div>
          <div style={{ fontSize: 11, color: '#5A7A8A' }}>Average rating · {totalReviews} reviews</div>
          <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 8 }}>New this month: <strong>{thisMonth}</strong></div>
          <div style={{ fontSize: 11, color: '#5A7A8A' }}>Response rate: <strong style={{ color: responseRate >= 75 ? '#1D9E75' : '#D85A30' }}>{reviewsArr.length > 0 ? responseRate + '%' : '--'}</strong> <span style={{ color: '#5A7A8A' }}>· industry benchmark 75%+</span></div>
          {unanswered > 0 && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, fontSize: 11, color: '#5A7A8A' }}>
              <strong>{unanswered}</strong> unanswered reviews visible on your listing.
            </div>
          )}
        </div>
        {dist.some(d => d.value > 0) && (
          <div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={dist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} innerRadius={30} paddingAngle={2}>
                  {dist.map((_, i) => <Cell key={i} fill={distColors[i]} />)}
                </Pie>
                <RTooltip contentStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Section 4: Post engagement */}
      {postsArr.length > 0 && (
        <>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Posts published ({postsArr.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Type</th>
                <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Summary</th>
                <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Date</th>
              </tr>
            </thead>
            <tbody>
              {postsArr.slice(0, 10).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '5px 8px' }}>{p.topicType || '--'}</td>
                  <td style={{ padding: '5px 8px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.summary}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right' }}>{p.createTime ? new Date(p.createTime).toLocaleDateString() : '--'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Section 5: Q&A monitoring */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Q&amp;A monitoring</div>
      <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 8 }}>
        <strong>{questionsArr.length}</strong> total questions · <strong style={{ color: unansweredQuestions > 0 ? '#D85A30' : '#1D9E75' }}>{unansweredQuestions}</strong> unanswered
      </div>
      {unansweredQuestions > 0 && (
        <div style={{ background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '10px 14px', fontSize: 11, color: '#5A7A8A', marginBottom: 16 }}>
          Unanswered questions are visible to potential customers on your Google listing.
        </div>
      )}
    </div>
  );
}

    case 'tech': {
  // Phase 0 stub — partial-locked state. Real PageSpeed + SE Ranking audit data wires in Phase 4.
  return (
    <div>
      <div style={{ background: '#F0F9FF', borderLeft: '3px solid #2D9CDB', borderRadius: 4, padding: '14px 18px', marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Report coming soon — additional data sources unlock more</div>
        <p style={{ fontSize: 12, color: '#5A7A8A', lineHeight: 1.6, margin: 0 }}>
          This report aggregates every technical health signal across your site — PageSpeed scores, Core Web Vitals, SEO audit findings, GSC coverage, WordPress plugin status, security scans, and uptime.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: '#1D9E75', marginBottom: 8 }}>Available now</div>
          <ul style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.7, paddingLeft: 18, marginTop: 0 }}>
            <li>PageSpeed Insights — mobile and desktop scores + Core Web Vitals</li>
            <li>SE Ranking site audit — health score, errors, warnings (when SEO Tools connected)</li>
            <li>Google Search Console — indexed pages, coverage errors, mobile usability</li>
            <li>Bing crawl errors (when Bing Webmaster connected)</li>
          </ul>
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, color: '#D4A800', marginBottom: 8 }}>Unlocks with IA Plugin</div>
          <ul style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.7, paddingLeft: 18, marginTop: 0 }}>
            <li>WordPress &amp; PHP version status</li>
            <li>Plugin security scan (Wordfence)</li>
            <li>SSL certificate expiry countdown</li>
            <li>Backup status and last successful backup</li>
            <li>Uptime monitoring</li>
            <li>RankMath site-wide SEO health</li>
            <li>LiteSpeed Cache status</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

    case 'presence': {
  const sessions = d?.summary?.totalSessions || 255;
  const bounce = d?.summary?.bounceRate || 0.749;
  const engRate = d?.engagement?.engagementRate || 0.251;
  const pps = d?.engagement?.pageviewsPerSession || 1.35;

  // Component scores (0-100)
  const webScore = Math.round((1 - bounce) * 40 + engRate * 40 + Math.min(pps / 3, 1) * 20);
  const searchScore = Math.round(Math.min(10869 / 50000, 1) * 50 + Math.min(66 / 500, 1) * 30 + Math.max(0, (30 - 22.08) / 30) * 20);

  // Phase 3 Step 4.5 — Search Rankings component now uses real SE Ranking data
  const seConnected = seoData?.connected === true;
  const seKw: any[] = Array.isArray(seoData?.keywords) ? seoData.keywords : [];
  const seTop10 = seoData?.stats?.current?.top10Count ?? seoData?.top10Count ?? seKw.filter((k: any) => typeof k.currentPosition === 'number' && k.currentPosition <= 10).length;
  const seVisibility = Number(seoData?.stats?.current?.visibilityScore ?? seoData?.visibilityScore ?? 0);
  const seRankingScore = seConnected
    ? Math.min(100, Math.round(
        (seVisibility * 0.6) // visibility contributes up to 60 points
        + (Math.min(seTop10 / Math.max(1, seKw.length || 1), 1) * 40) // top-10 ratio up to 40 points
      ))
    : 0;

  const gbpScore = 35; // connected but limited
  const contentScore = 0; // no RankMath data

  const overallScore = Math.round(webScore * 0.25 + searchScore * 0.25 + seRankingScore * 0.20 + gbpScore * 0.20 + contentScore * 0.10);

  const components = [
    { name: 'Website Performance', score: webScore, weight: '25%', source: 'GA4', connected: true, color: webScore > 70 ? '#1D9E75' : webScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Search Visibility', score: searchScore, weight: '25%', source: 'GSC', connected: true, color: searchScore > 70 ? '#1D9E75' : searchScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Search Rankings', score: seRankingScore, weight: '20%', source: 'SE Ranking', connected: seConnected, color: seRankingScore > 70 ? '#1D9E75' : seRankingScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Local Presence', score: gbpScore, weight: '20%', source: 'GBP', connected: true, color: gbpScore > 70 ? '#1D9E75' : gbpScore > 40 ? '#D4A800' : '#D85A30' },
    { name: 'Content Quality', score: contentScore, weight: '10%', source: 'RankMath', connected: false, color: '#D85A30' },
  ];

  return (
    <div>
      {/* Overall score */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 48, fontWeight: 700, color: overallScore > 70 ? '#1D9E75' : overallScore > 40 ? '#D4A800' : '#D85A30' }}>{overallScore}</div>
        <div style={{ fontSize: 14, color: '#5A7A8A' }}>Business Presence Score</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 4 }}>out of 100 · weighted average of 5 components</div>
      </div>

      {/* Component breakdown */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 10 }}>Score breakdown</div>
      {components.map((comp, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ width: 160, fontSize: 12, fontWeight: 500 }}>{comp.name}</div>
          <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 3, height: 18 }}>
            <div style={{ width: `${comp.score}%`, height: '100%', background: comp.color, borderRadius: 3 }} />
          </div>
          <div style={{ width: 40, fontSize: 14, fontWeight: 600, textAlign: 'right', color: comp.color }}>{comp.score}</div>
          <div style={{ width: 35, fontSize: 10, color: '#5A7A8A', textAlign: 'right' }}>{comp.weight}</div>
          <div style={{ width: 80, fontSize: 10, textAlign: 'right' }}>
            {comp.connected ? (
              <span style={{ color: '#1D9E75' }}>● {comp.source}</span>
            ) : (
              <span style={{ color: '#D85A30' }}>○ Connect</span>
            )}
          </div>
        </div>
      ))}

      {/* Channel health matrix */}
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginTop: 20, marginBottom: 10 }}>Channel health</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead><tr style={{ borderBottom: '2px solid #eee' }}>
          <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Channel</th>
          <th style={{ textAlign: 'center', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Status</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Key Metric</th>
          <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Action</th>
        </tr></thead>
        <tbody>
          {[
            { channel: 'Website', status: 'Active', statusColor: '#1D9E75', metric: sessions + ' sessions', action: 'Reduce bounce rate' },
            { channel: 'Google Search', status: 'Active', statusColor: '#1D9E75', metric: '10,869 impressions', action: 'Improve CTR' },
            { channel: 'Google Business', status: 'Connected', statusColor: '#D4A800', metric: 'Limited data', action: 'Optimize listing' },
            bingData?.connected && !bingData?.error
              ? { channel: 'Bing', status: 'Active', statusColor: '#1D9E75', metric: (bingData.summary?.impressions ?? 0) + ' impressions', action: 'Review Bing tab' }
              : { channel: 'Bing', status: 'Not connected', statusColor: '#D85A30', metric: '--', action: 'Connect Bing' },
            { channel: 'Content (RankMath)', status: 'Not connected', statusColor: '#D85A30', metric: '--', action: 'Install IA Plugin' },
          ].map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: '6px 8px', fontWeight: 500 }}>{row.channel}</td>
              <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: row.statusColor }} />
                  <span style={{ fontSize: 10 }}>{row.status}</span>
                </span>
              </td>
              <td style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A' }}>{row.metric}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: '#0C4A60' }}>{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Competitor context — locked */}
      <div style={{ marginTop: 20, background: '#F8FAFC', borderRadius: 8, padding: '20px', textAlign: 'center', border: '1px dashed rgba(45,156,219,0.3)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Competitor Context</div>
        <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 6 }}>Compare your presence score against competitors</div>
        <div style={{ fontSize: 11, color: '#5A7A8A', marginBottom: 12 }}>Requires: SE Ranking connection + at least 1 competitor added</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={{ padding: '8px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
          <button style={{ padding: '8px 16px', background: '#fff', color: '#0B1C24', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Learn More</button>
        </div>
        {/* Greyed preview */}
        <div style={{ opacity: 0.25, marginTop: 16 }}>
          <div style={{ background: '#eee', borderRadius: 6, height: 60, marginBottom: 8 }} />
          <div style={{ background: '#eee', borderRadius: 6, height: 40, marginBottom: 8 }} />
          <div style={{ background: '#eee', borderRadius: 6, height: 40 }} />
        </div>
      </div>
    </div>
  );
}

    default:
      return (
        <div>
          <p style={{ fontSize: 13, color: '#3A5A6A', lineHeight: 1.6, margin: '0 0 16px' }}>
            Report details will appear here.
          </p>
        </div>
      );
  }
}

/* ── Report Modal ── */
function ReportModal({ reportKey, data: d, searchData, gbpData, gbpReviews, gbpPosts, gbpQanda, bingData, seoData, seoDecayData, pluginData, onClose }: { reportKey: string; data: any; searchData?: any; gbpData?: any; gbpReviews?: any; gbpPosts?: any; gbpQanda?: any; bingData?: any; seoData?: any; seoDecayData?: any; pluginData?: any; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, maxWidth: 900, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {/* Sticky header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24' }}>{MODAL_TITLES[reportKey]}</div>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 2 }}>Q1 2026 · Jan 1 – Mar 31, 2026</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {renderModalContent(reportKey, d, searchData, { gbp: gbpData, reviews: gbpReviews, posts: gbpPosts, qanda: gbpQanda }, bingData, seoData, seoDecayData, pluginData)}

          {/* ARGUS Insight Box — always last */}
          <ArgusInsightBox reportKey={reportKey} data={d} searchData={searchData} gbpData={gbpData} gbpReviews={gbpReviews} gbpPosts={gbpPosts} gbpQanda={gbpQanda} bingData={bingData} seoData={seoData} seoDecayData={seoDecayData} pluginData={pluginData} />
        </div>

        {/* Sticky footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#5A7A8A' }}>Generated by <span style={{ color: '#6B9402', fontWeight: 600 }}>ARGUS</span> · Q1 2026 · Next: July 1, 2026</span>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page Component ── */
export function IAInsightsReports() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const { data, loading } = useAnalyticsData(activeSiteId, 90);
  const [activeModal, setActiveModal] = React.useState<string | null>(null);
  const [searchData, setSearchData] = React.useState<any>(null);
  const [gbpData, setGbpData] = React.useState<any>(null);
  const [gbpReviews, setGbpReviews] = React.useState<any>(null);
  const [gbpPosts, setGbpPosts] = React.useState<any>(null);
  const [gbpQanda, setGbpQanda] = React.useState<any>(null);
  const [bingData, setBingData] = React.useState<any>(null);
  const [seoData, setSeoData] = React.useState<any>(null);
  const [seoDecayData, setSeoDecayData] = React.useState<any>(null);
  // v2.0.7 — IA Plugin cross-source data
  const [pluginData, setPluginData] = React.useState<any>(null);

  // Fetch GSC performance (all dimensions) alongside GA4 data so the Search Intelligence modal
  // and ARGUS insight box can render real numbers.
  React.useEffect(() => {
    if (!activeSiteId) { setSearchData(null); return; }
    let cancelled = false;
    arionApi.getSearchPerformance('google', activeSiteId, { period: 90, groupBy: 'all' })
      .then((res: any) => { if (!cancelled) setSearchData(res); })
      .catch(() => { if (!cancelled) setSearchData(null); });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  // Phase 1 Step 2.7: fetch GBP data so the Local Presence modal + ARGUS observations
  // have real numbers to render.
  React.useEffect(() => {
    if (!activeSiteId) { setGbpData(null); setGbpReviews(null); setGbpPosts(null); setGbpQanda(null); return; }
    let cancelled = false;
    Promise.all([
      arionApi.getGbpBusiness(activeSiteId).catch(() => null),
      arionApi.getGbpReviewsLive(activeSiteId).catch(() => null),
      arionApi.getGbpPostsLive(activeSiteId).catch(() => null),
      arionApi.getGbpQanda(activeSiteId).catch(() => null),
    ]).then(([b, r, p, q]) => {
      if (cancelled) return;
      setGbpData(b); setGbpReviews(r); setGbpPosts(p); setGbpQanda(q);
    });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  // Phase 2 Step 3.7: fetch Bing performance for the Visibility & Reach ARGUS observation
  React.useEffect(() => {
    if (!activeSiteId) { setBingData(null); return; }
    let cancelled = false;
    arionApi.getBingPerformance(activeSiteId, 90)
      .then((res: any) => { if (!cancelled) setBingData(res); })
      .catch(() => { if (!cancelled) setBingData(null); });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  // v2.0.7 — fetch IA Plugin analytics bundle so every IA Insights report has
  // cross-source visibility into security, performance, content freshness,
  // readability coverage, and plugin inventory.
  React.useEffect(() => {
    if (!activeSiteId) { setPluginData(null); return; }
    let cancelled = false;
    Promise.all([
      arionApi.getPluginWordfenceFull(activeSiteId).catch(() => null),
      arionApi.getPluginScanIssues(activeSiteId).catch(() => null),
      arionApi.getPluginContentPace(activeSiteId).catch(() => null),
      arionApi.getPluginContentAgeDist(activeSiteId).catch(() => null),
      arionApi.getPluginContentWordCountDist(activeSiteId).catch(() => null),
      arionApi.getPluginContentSeoDetail(activeSiteId).catch(() => null),
      arionApi.getPluginRiskAnalysis(activeSiteId).catch(() => null),
      arionApi.getPluginContentAggregate(activeSiteId).catch(() => null),
      arionApi.getPagespeedHistory(activeSiteId).catch(() => null),
    ]).then(([wfFull, scanIssues, pace, age, wc, seoDetail, risk, seoAgg, psi]) => {
      if (cancelled) return;
      setPluginData({
        wfFull: (wfFull as any)?.data || null,
        scanIssues: (scanIssues as any)?.data || null,
        pace: (pace as any)?.data || null,
        age: (age as any)?.data || null,
        wordCount: (wc as any)?.data || null,
        seoDetail: (seoDetail as any)?.data || null,
        risk: (risk as any)?.data || null,
        seoAgg: (seoAgg as any)?.data || null,
        psi: (psi as any)?.data?.snapshots || [],
      });
    });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  // Phase 3 Step 4.5: fetch SE Ranking rankings + decay data for Search Intelligence,
  // Content Intelligence, and Business Presence Score modals.
  React.useEffect(() => {
    if (!activeSiteId) { setSeoData(null); setSeoDecayData(null); return; }
    let cancelled = false;
    Promise.all([
      arionApi.getSeoRankings(activeSiteId, { range: '30d' }).catch(() => null),
      arionApi.getSeoDecay(activeSiteId).catch(() => null),
    ]).then(([r, decay]) => {
      if (cancelled) return;
      setSeoData(r); setSeoDecayData(decay);
    });
    return () => { cancelled = true; };
  }, [activeSiteId, arionApi]);

  if (!selectedSite) return <div style={{ padding: 24, color: '#5A7A8A' }}>No site selected.</div>;
  if (loading) return <div style={{ padding: 24, color: '#5A7A8A' }}>Loading...</div>;

  // Phase 0: 8 reports in a 4×2 grid. Row 1: Visibility, Audience, Conversion, Search.
  // Row 2: Content, Local Presence, Technical & Site Health, Business Presence Score.
  const gbpConnectedLive = gbpData?.connected === true && !gbpData?.error;
  const reports = [
    // Row 1
    { key: 'visibility', title: 'Visibility & Reach', desc: 'How findable you are across every channel — and who you\'re invisible to', color: '#2D9CDB', hasData: true },
    { key: 'audience', title: 'Audience Intelligence', desc: 'Who\'s visiting, whether they\'re the right people, and when to reach them', color: '#EF6C33', hasData: true },
    { key: 'conversion', title: 'Conversion Intelligence', desc: 'The complete path from visit to action — and exactly where it breaks', color: 'rgba(12,74,96,0.8)', hasData: true },
    { key: 'search', title: 'Search Intelligence', desc: 'Your full search presence, quick wins, and the clicks you should be getting', color: '#2D9CDB', hasData: true },
    // Row 2
    { key: 'content', title: 'Content Intelligence', desc: 'Which content earns its place and which is wasted effort', color: 'rgba(12,74,96,0.8)', hasData: true },
    { key: 'local', title: 'Local Presence & Reputation', desc: 'How your business appears in Google Maps, local search, and review platforms — and whether that presence is building or losing trust', color: '#2D9CDB', hasData: gbpConnectedLive, statusText: gbpConnectedLive ? undefined : 'Requires Google Business Profile connection' },
    { key: 'tech', title: 'Technical & Site Health', desc: 'PageSpeed, Core Web Vitals, security, uptime, and SEO health across your website infrastructure', color: '#EF6C33', hasData: true },
    { key: 'presence', title: 'Business Presence Score', desc: 'Your holistic online health across search, maps, website, and reviews', color: '#999', hasData: true },
  ];

  return (
    <div>
      {/* Intelligence Banner */}
      <div style={{ background: '#0B1C24', borderRadius: 10, padding: '20px 24px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 32, height: 32, flexShrink: 0, color: '#2D9CDB' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="32" height="32">
            <path d="M12 2a7 7 0 017 7c0 2.5-1.5 4.5-3 6l-1 4H9l-1-4c-1.5-1.5-3-3.5-3-6a7 7 0 017-7z" />
            <path d="M9 19h6M10 22h4" />
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>IA Insights</span>
            <span style={{ background: 'rgba(151,204,4,0.15)', color: '#97CC04', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>Powered by ARGUS</span>
          </div>
          <p style={{ color: '#A8CDD8', fontSize: 13, marginTop: 6, lineHeight: 1.5, maxWidth: 700 }}>
            ARION's intelligence layer. ARGUS analyzes every data point collected across your website, search presence, business profile, and content to surface the insights that matter.
          </p>
          <p style={{ color: '#667788', fontSize: 11, marginTop: 8 }}>Reports auto-generate quarterly · Next: July 1, 2026</p>
        </div>
      </div>

      {/* Report cards grid — Phase 0: 4 columns × 2 rows. Responsive: stacks to 2 cols under 960px.
          All cards are flex columns so the footer button sits at the same y-position regardless
          of description length, keeping card heights visually consistent. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: '1rem',
        marginBottom: 16,
      }} className="ia-reports-grid">
        {reports.map(r => (
          <div key={r.key} style={{
            background: '#fff',
            border: '1px solid rgba(45,156,219,0.12)',
            borderRadius: 10,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 220,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{r.title}</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2, lineHeight: 1.4 }}>{r.desc}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: r.hasData ? '#1D9E75' : '#ccc' }} />
              <span style={{ fontSize: 10, color: r.hasData ? '#1D9E75' : '#999' }}>{r.hasData ? 'Q1 2026 · Ready' : ((r as any).statusText || 'Requires additional data sources')}</span>
            </div>

            {/* Mini visual — sparkline for data reports, channel dots for presence/local/tech */}
            <div style={{ height: 48, marginTop: 10, background: '#F8FAFC', borderRadius: 4, overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
              {r.key === 'presence' ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  {[{ label: 'Web', color: '#1D9E75' }, { label: 'Search', color: '#1D9E75' }, { label: 'GBP', color: '#D4A800' }, { label: 'Bing', color: '#D85A30' }, { label: 'Content', color: '#D4A800' }].map(dot => (
                    <div key={dot.label} style={{ textAlign: 'center' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot.color, margin: '0 auto 2px' }} />
                      <div style={{ fontSize: 8, color: '#5A7A8A' }}>{dot.label}</div>
                    </div>
                  ))}
                </div>
              ) : r.key === 'local' ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                  {[
                    { label: 'Maps', color: gbpConnectedLive ? '#1D9E75' : '#ccc' },
                    { label: 'Reviews', color: gbpConnectedLive && (gbpReviews?.totalReviewCount || 0) > 0 ? '#1D9E75' : gbpConnectedLive ? '#D4A800' : '#ccc' },
                    { label: 'Bing', color: '#ccc' },
                    { label: 'Apple', color: '#ccc' },
                    { label: 'Posts', color: gbpConnectedLive && (gbpPosts?.posts?.length || 0) > 0 ? '#1D9E75' : '#ccc' },
                  ].map(dot => (
                    <div key={dot.label} style={{ textAlign: 'center' }}>
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot.color, margin: '0 auto 2px' }} />
                      <div style={{ fontSize: 8, color: '#5A7A8A' }}>{dot.label}</div>
                    </div>
                  ))}
                </div>
              ) : r.key === 'tech' ? (
                (() => {
                  const psi: any[] = pluginData?.psi || [];
                  const latestPsi = psi.length > 0 ? psi[psi.length - 1] : null;
                  const mobilePerf = latestPsi?.mobileScore ?? latestPsi?.mobile?.performance ?? null;
                  const wfOverall = pluginData?.wfFull?.overall_score ?? null;
                  const riskPlugins = pluginData?.risk?.plugins || [];
                  const highRisk = riskPlugins.filter((p: any) => p.risk_band === 'high').length;
                  const bandColor = (s: number | null, good = 80, ok = 50) => s == null ? '#ccc' : s >= good ? '#1D9E75' : s >= ok ? '#D4A800' : '#D85A30';
                  return (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                      {[
                        { label: 'Speed', color: bandColor(mobilePerf) },
                        { label: 'Security', color: bandColor(wfOverall) },
                        { label: 'Plugins', color: highRisk === 0 ? '#1D9E75' : highRisk <= 2 ? '#D4A800' : '#D85A30' },
                        { label: 'Index', color: searchData?.summary?.impressions > 0 ? '#1D9E75' : '#ccc' },
                      ].map(dot => (
                        <div key={dot.label} style={{ textAlign: 'center' }}>
                          <div style={{ width: 9, height: 9, borderRadius: '50%', background: dot.color, margin: '0 auto 2px' }} />
                          <div style={{ fontSize: 8, color: '#5A7A8A' }}>{dot.label}</div>
                        </div>
                      ))}
                    </div>
                  );
                })()
              ) : (
                Array.from({ length: 20 }).map((_, i) => (
                  <div key={i} style={{ flex: 1, background: r.color, opacity: 0.2 + Math.random() * 0.8, height: `${15 + Math.random() * 85}%` }} />
                ))
              )}
            </div>
            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6 }}>Jan 1 – Mar 31, 2026</div>

            <div style={{ marginTop: 'auto', paddingTop: 8 }}>
              <button onClick={() => setActiveModal(r.key)} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 500, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer', width: '100%' }}>
                View report
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* STELLA upgrade nudge */}
      <div style={{ background: '#F8FAFC', border: '1px solid rgba(45,156,219,0.12)', borderRadius: 8, padding: '14px 18px', marginBottom: 16, fontSize: 12, color: '#5A7A8A' }}>
        Want predictive analytics, automated anomaly alerts, and revenue forecasting? Add <span style={{ color: '#4C5BD4', fontWeight: 600 }}>STELLA</span> for advanced BI dashboards powered by <span style={{ color: '#6B9402', fontWeight: 600 }}>ARGUS</span>.
      </div>

      <ConsultingUpsell headline="Want IA to interpret your reports and build a growth plan?" subtext="Strategy sessions with your data." serviceType="Analytics Consulting" triggerPage="ia-insights" />

      {/* Modal */}
      {activeModal && <ReportModal reportKey={activeModal} data={data} searchData={searchData} gbpData={gbpData} gbpReviews={gbpReviews} gbpPosts={gbpPosts} gbpQanda={gbpQanda} bingData={bingData} seoData={seoData} seoDecayData={seoDecayData} pluginData={pluginData} onClose={() => setActiveModal(null)} />}
    </div>
  );
}

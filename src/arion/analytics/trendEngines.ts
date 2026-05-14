// trendEngines.ts — 8 dedicated analytical engines for ARION Trends (v5.x).
//
// Replaces the shared insight template that produced structurally identical
// output across all 8 reports. Each engine is anchored to its report's
// business question, leads with the metric that question demands, and
// emits its own analysis structure.
//
// Each engine takes the same `EngineInput` (the bag of available data
// sources) and returns a typed `ReportAnalysis` with observations,
// recommended actions, a score 0-100, and the inputs that fed the score.
//
// The engines themselves are pure functions — no React, no fetching.
// The caller wires them into the existing IAInsightsReports component
// (or future v5.x sectioned pages) and renders the output.

// ── Shared input shape ────────────────────────────────────────────────

export interface EngineInput {
  domain?: string;
  /** GA4 data — analytics overview shape. */
  d?: any;
  /** GSC search data. */
  searchData?: any;
  /** Google Business Profile data. */
  gbpData?: any;
  gbpReviews?: any;
  gbpPosts?: any;
  gbpQanda?: any;
  /** Bing data. */
  bingData?: any;
  /** SE Ranking data. */
  seoData?: any;
  /** SE Ranking decay/rank-tracking deltas. */
  seoDecayData?: any;
  /** IA plugin snapshot. */
  pluginData?: any;
  /** Tenant service area (city/state/region or array of zips). When set,
   *  we can do the geographic relevance check called out in the spec. */
  serviceArea?: { city?: string; state?: string; regions?: string[]; zips?: string[] };
  /** Connected SPARK info — true when contacts/forms are flowing. */
  sparkConnected?: boolean;
  /** Form → contact match rate when SPARK is wired. */
  formToContactRate?: number | null;
}

export interface ReportAnalysis {
  /** 0-100 trend score for this report — used in the 4-gauge header. */
  score: number;
  /** Score breakdown — the inputs that drove the score. */
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  /** 3-5 observations specific to this report's analytical question. */
  observations: string[];
  /** 3 prioritised recommended actions. */
  actions: string[];
  /** Optional contextual note ("Singapore traffic excluded", "no GSC connected", etc.). */
  contextNote?: string;
}

// ── Shared utilities ──────────────────────────────────────────────────

function fmtNum(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return "0%";
  return `${(n * 100).toFixed(digits)}%`;
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function scoreFromBenchmark(actual: number, benchmark: number, optimum = benchmark * 2): number {
  // Linear: at <=0 → 0, at benchmark → 60, at optimum → 100.
  if (!benchmark || benchmark <= 0) return 50;
  if (actual <= 0) return 0;
  if (actual <= benchmark) return clamp((actual / benchmark) * 60, 0, 60);
  return clamp(60 + ((actual - benchmark) / Math.max(1, optimum - benchmark)) * 40, 60, 100);
}

// Industry CTR benchmark table by SERP position (shared with the existing component).
const CTR_BENCHMARK: Array<{ pos: number; ctr: number }> = [
  { pos: 1, ctr: 0.28 }, { pos: 2, ctr: 0.15 }, { pos: 3, ctr: 0.10 },
  { pos: 4, ctr: 0.07 }, { pos: 5, ctr: 0.05 }, { pos: 6, ctr: 0.035 },
  { pos: 7, ctr: 0.03 }, { pos: 8, ctr: 0.027 }, { pos: 9, ctr: 0.025 },
  { pos: 10, ctr: 0.024 }, { pos: 15, ctr: 0.015 }, { pos: 20, ctr: 0.007 },
  { pos: 25, ctr: 0.004 }, { pos: 30, ctr: 0.003 }, { pos: 50, ctr: 0.001 }, { pos: 100, ctr: 0.0005 },
];
function expectedCtrForPosition(pos: number): number {
  if (!isFinite(pos)) return 0;
  if (pos <= 1) return CTR_BENCHMARK[0].ctr;
  if (pos >= 100) return 0.0005;
  for (let i = 0; i < CTR_BENCHMARK.length - 1; i++) {
    const a = CTR_BENCHMARK[i], b = CTR_BENCHMARK[i + 1];
    if (pos >= a.pos && pos <= b.pos) {
      const t = (pos - a.pos) / (b.pos - a.pos);
      return a.ctr + (b.ctr - a.ctr) * t;
    }
  }
  return 0;
}

/** Detect sessions from geographies clearly outside the tenant's service area. */
function geographicRelevance(d: any, serviceArea?: EngineInput["serviceArea"]) {
  const geoBreakdown: any[] = d?.breakdowns?.countries || d?.breakdowns?.cities || [];
  const totalSessions = d?.summary?.totalSessions || 0;
  if (!totalSessions || geoBreakdown.length === 0) return { localShare: null, irrelevantShare: 0, irrelevantSessions: 0, topIrrelevant: [] as Array<{ name: string; sessions: number }> };

  // Treat anything outside US (or outside provided state/region) as irrelevant for a local US service biz.
  const local: Array<{ name: string; sessions: number }> = [];
  const irrelevant: Array<{ name: string; sessions: number }> = [];
  for (const row of geoBreakdown) {
    const name = String(row.country || row.city || row.label || "").trim();
    const sessions = Number(row.sessions || row.value || 0);
    if (!name || !sessions) continue;
    const isLocal = looksLocal(name, serviceArea);
    (isLocal ? local : irrelevant).push({ name, sessions });
  }
  const localSessions = local.reduce((s, r) => s + r.sessions, 0);
  const irrelevantSessions = irrelevant.reduce((s, r) => s + r.sessions, 0);
  const localShare = totalSessions > 0 ? localSessions / totalSessions : null;
  const irrelevantShare = totalSessions > 0 ? irrelevantSessions / totalSessions : 0;
  const topIrrelevant = irrelevant.sort((a, b) => b.sessions - a.sessions).slice(0, 3);
  return { localShare, irrelevantShare, irrelevantSessions, topIrrelevant };
}

function looksLocal(geoName: string, serviceArea?: EngineInput["serviceArea"]): boolean {
  const n = geoName.toLowerCase();
  // Default: assume US is "local" for the default Iowa-based test tenant.
  if (n === "united states" || n === "us" || n === "usa") return true;
  if (serviceArea?.regions?.some((r) => n.includes(r.toLowerCase()))) return true;
  if (serviceArea?.state && n.includes(String(serviceArea.state).toLowerCase())) return true;
  if (serviceArea?.city && n.includes(String(serviceArea.city).toLowerCase())) return true;
  return false;
}

// ── Engine 1 — Visibility & Reach ─────────────────────────────────────
// Business question: "Are people finding me?"
// Lead with impression-to-visit gap + geographic relevance check.
export function visibilityReachEngine(input: EngineInput): ReportAnalysis {
  const { d, searchData, gbpData, bingData, serviceArea, domain } = input;
  const sessions = d?.summary?.totalSessions || 0;
  const gscImpressions = searchData?.summary?.impressions || 0;
  const gscCtr = Number(searchData?.summary?.ctr || 0);
  const gscAvgPos = Number(searchData?.summary?.avgPosition || 0);
  const expCtr = gscAvgPos > 0 ? expectedCtrForPosition(gscAvgPos) : 0;

  const geo = geographicRelevance(d, serviceArea);
  const channels: any[] = d?.breakdowns?.channels || [];
  const channelTotal = channels.reduce((s, r) => s + Number(r.sessions || r.value || 0), 0);
  const topChannel = channels.sort((a, b) => Number(b.sessions || b.value || 0) - Number(a.sessions || a.value || 0))[0];
  const topChannelShare = (topChannel && channelTotal > 0) ? Number(topChannel.sessions || topChannel.value || 0) / channelTotal : 0;

  const brandQueries: any[] = (searchData?.breakdowns?.queries || []).filter((q: any) => /intelligent|analytics|brand/i.test(q.query || ""));
  const nonBrandImpressions = Math.max(0, gscImpressions - brandQueries.reduce((s, q) => s + Number(q.impressions || 0), 0));

  // Effective visit rate using "local" sessions if geo data available
  const localSessions = geo.localShare != null ? sessions * geo.localShare : sessions;
  const effectiveImpressionToVisit = gscImpressions > 0 ? localSessions / gscImpressions : null;

  // Score: weighted blend
  const impToVisitScore = effectiveImpressionToVisit != null
    ? scoreFromBenchmark(effectiveImpressionToVisit * 100, 1.5, 5)  // 1.5% benchmark for avg pos 15-20
    : 35;
  const localTrafficScore = geo.localShare != null ? clamp(geo.localShare * 100, 0, 100) : 50;
  const channelDiversityScore = topChannelShare > 0 ? clamp((1 - Math.min(1, topChannelShare)) * 100, 0, 100) : 50;
  const nonBrandScore = scoreFromBenchmark(nonBrandImpressions, 1000, 10000);

  const score = Math.round(
    impToVisitScore * 0.4 +
    localTrafficScore * 0.25 +
    channelDiversityScore * 0.20 +
    nonBrandScore * 0.15
  );

  const observations: string[] = [];
  if (gscImpressions > 0 && sessions > 0) {
    const ratio = Math.round(gscImpressions / Math.max(1, sessions));
    observations.push(
      `${domain || "Your site"} received ${fmtNum(gscImpressions)} search impressions this period but only ${fmtNum(sessions)} sessions — a ${ratio}:1 impression-to-visit ratio. For every ${ratio} people who saw you in search, only 1 visited.`
    );
  }
  if (geo.localShare != null && geo.irrelevantShare > 0.20) {
    const topGeo = geo.topIrrelevant.map((t) => `${t.name} (${fmtNum(t.sessions)})`).join(", ");
    observations.push(
      `${fmtPct(geo.irrelevantShare)} of sessions came from geographies outside your service area — ${topGeo}. These visitors have zero conversion relevance for a local service business. Effective local-only impression-to-visit ratio is ${fmtNum(gscImpressions / Math.max(1, localSessions))}:1.`
    );
  } else if (geo.localShare != null) {
    observations.push(`${fmtPct(geo.localShare)} of your traffic is in-region. Your visibility is reaching the right geography.`);
  }
  if (topChannel) {
    observations.push(
      `${topChannel.channel || topChannel.label} dominates traffic at ${fmtPct(topChannelShare)}. ${topChannelShare > 0.6 ? "Channel concentration risk — a single algorithm or referrer change could halve your traffic." : "Channel mix is reasonably diversified."}`
    );
  }
  if (gscCtr > 0 && expCtr > 0) {
    const gap = expCtr - gscCtr / 100;
    if (gap > 0.005) {
      observations.push(`At position ${gscAvgPos.toFixed(1)}, benchmark CTR is ~${fmtPct(expCtr)}. Your actual CTR is ${gscCtr.toFixed(2)}% — a ${fmtPct(gap)}-point gap means ~${fmtNum(gap * gscImpressions)} clicks you're leaving on the table to weak titles/meta.`);
    }
  }
  if (bingData?.connected && bingData?.summary?.impressions === 0) {
    observations.push(`Bing is connected but returned zero impressions — submit your sitemap to Bing Webmaster Tools to start collecting visibility data.`);
  }

  const actions: string[] = [];
  if (geo.irrelevantShare > 0.20) {
    actions.push(`Add a country filter or city/state attribute to your GA4 reports — your top 3 non-service-area sources (${geo.topIrrelevant.map((t) => t.name).join(", ")}) are inflating your traffic numbers without contributing to revenue.`);
  }
  if (topChannelShare > 0.6) {
    actions.push(`Diversify your traffic: invest in one channel currently <10% of mix (referral or social) to reduce dependency on ${topChannel?.channel || topChannel?.label}.`);
  }
  if (gscCtr > 0 && expCtr > gscCtr / 100) {
    actions.push(`Rewrite the title tags of your top 5 highest-impression pages to recover the ~${fmtNum((expCtr - gscCtr / 100) * gscImpressions)} missing clicks vs benchmark CTR at your average position.`);
  }
  if (!actions.length) {
    actions.push(`Your visibility profile is healthy — focus on raising rankings (Search Intelligence) to grow impression volume.`);
  }

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "impression_to_visit", value: effectiveImpressionToVisit != null ? Number((effectiveImpressionToVisit * 100).toFixed(2)) : null, weight: 0.40, note: "Recomputed using local-only sessions when geo data is available" },
      { key: "local_traffic_share", value: geo.localShare != null ? Number((geo.localShare * 100).toFixed(0)) : null, weight: 0.25 },
      { key: "channel_diversity", value: Number(((1 - topChannelShare) * 100).toFixed(0)), weight: 0.20 },
      { key: "non_brand_impressions", value: nonBrandImpressions, weight: 0.15 },
    ],
    observations,
    actions,
    contextNote: geo.irrelevantShare > 0.20 ? `Geographic noise: ${fmtPct(geo.irrelevantShare)} of sessions are outside your service area.` : undefined,
  };
}

// ── Engine 2 — Audience Intelligence ──────────────────────────────────
// Business question: "Who is actually visiting and are they the right people?"
export function audienceIntelligenceEngine(input: EngineInput): ReportAnalysis {
  const { d } = input;
  const summary = d?.summary || {};
  const eng = d?.engagement || {};
  const avgSessionDuration = Number(summary.avgSessionDuration || 0);
  const pagesPerSession = Number(summary.pagesPerSession || eng.pagesPerSession || 0);
  const bounceRate = Number(summary.bounceRate || 0);
  const engagementRate = Number(eng.engagementRate || (1 - bounceRate));

  const devices: any[] = d?.breakdowns?.devices || [];
  const totalDeviceSessions = devices.reduce((s, r) => s + Number(r.sessions || r.value || 0), 0);
  const mobile = devices.find((r) => /mobile/i.test(r.device || r.label || ""));
  const mobileShare = mobile && totalDeviceSessions > 0 ? Number(mobile.sessions || mobile.value || 0) / totalDeviceSessions : null;

  const newUsers = Number(summary.newUsers || 0);
  const totalUsers = Number(summary.totalUsers || 0);
  const newRatio = totalUsers > 0 ? newUsers / totalUsers : null;
  const returningRatio = newRatio != null ? 1 - newRatio : null;

  // Score components
  const qualityScore = scoreFromBenchmark((avgSessionDuration * pagesPerSession) || 0, 100, 300);  // 100s × 1.5 pages baseline
  const bounceScore = scoreFromBenchmark((1 - bounceRate) * 100, 30, 60);
  const mobileScore = mobileShare != null
    ? (mobileShare >= 0.4 && mobileShare <= 0.7 ? 85 : mobileShare >= 0.3 && mobileShare <= 0.8 ? 65 : 40)
    : 50;
  const balanceScore = returningRatio != null
    ? (returningRatio >= 0.15 && returningRatio <= 0.4 ? 90 : returningRatio >= 0.10 && returningRatio <= 0.5 ? 65 : 35)
    : 50;

  const score = Math.round(qualityScore * 0.35 + bounceScore * 0.25 + mobileScore * 0.20 + balanceScore * 0.20);

  const observations: string[] = [];
  if (avgSessionDuration && pagesPerSession) {
    observations.push(`Session quality: ${avgSessionDuration.toFixed(0)}s avg duration × ${pagesPerSession.toFixed(2)} pages per session. ${qualityScore < 50 ? "Visitors leave quickly without exploring — content isn't pulling them deeper." : qualityScore < 75 ? "Engagement is decent — there's room to improve depth via internal linking and longer-form content." : "Strong engagement — visitors are reading and exploring."}`);
  }
  if (bounceRate > 0) {
    observations.push(`Bounce rate sits at ${fmtPct(bounceRate)}. ${bounceRate > 0.65 ? "Above industry average for service businesses — primary causes are usually slow load, mobile UX issues, or misaligned search intent." : bounceRate > 0.45 ? "Within typical range — minor optimization can still pull it down." : "Healthy bounce rate."}`);
  }
  if (mobileShare != null) {
    observations.push(`Mobile is ${fmtPct(mobileShare)} of traffic. ${mobileShare < 0.4 ? "Significantly below the >60% mobile share most service businesses see — investigate whether mobile UX, page speed, or mobile search rankings are limiting mobile traffic." : mobileShare > 0.8 ? "Heavily mobile — desktop UX may be neglected; check desktop conversion paths." : "Healthy device mix."}`);
  }
  if (newRatio != null && returningRatio != null) {
    observations.push(`Audience split: ${fmtPct(newRatio)} new vs ${fmtPct(returningRatio)} returning. ${returningRatio < 0.10 ? "Almost everyone is a first-time visitor — strong acquisition but no return loop. Add an email capture or content subscription to start building return visits." : returningRatio > 0.4 ? "Heavy returning skew — loyal but not growing. New-content frequency or paid acquisition could expand reach." : "Balanced new/returning ratio — both ends of the funnel are working."}`);
  }
  if (!observations.length) observations.push("Audience data is still aggregating — observations will populate once GA4 returns engagement metrics.");

  const actions: string[] = [];
  if (mobileShare != null && mobileShare < 0.4) {
    actions.push("Run a PageSpeed Insights mobile test on your top 3 landing pages — sub-50 mobile performance scores correlate strongly with the depressed mobile share you're seeing.");
  }
  if (returningRatio != null && returningRatio < 0.10) {
    actions.push("Add a top-of-funnel content offer (checklist, guide, or audit) with email capture to start converting first-time visitors into a return audience.");
  }
  if (bounceRate > 0.65) {
    actions.push("Audit your top 3 entry pages — the ones with the highest bounce rate. Check for slow load times, intrusive popups, and misaligned page titles vs the queries driving traffic.");
  }
  if (!actions.length) actions.push("Audience profile is healthy — focus on conversion (Conversion Intelligence) and visibility (Visibility & Reach).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "session_quality", value: Number(((avgSessionDuration * pagesPerSession) || 0).toFixed(0)), weight: 0.35 },
      { key: "bounce_rate", value: Number(((1 - bounceRate) * 100).toFixed(0)), weight: 0.25 },
      { key: "mobile_share", value: mobileShare != null ? Number((mobileShare * 100).toFixed(0)) : null, weight: 0.20 },
      { key: "new_returning_balance", value: returningRatio != null ? Number((returningRatio * 100).toFixed(0)) : null, weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── Engine 3 — Conversion Intelligence ───────────────────────────────
// Business question: "Where does my funnel break?"
export function conversionIntelligenceEngine(input: EngineInput): ReportAnalysis {
  const { d, sparkConnected, formToContactRate, gbpData } = input;
  const summary = d?.summary || {};
  const sessions = Number(summary.totalSessions || 0);
  const formViews = Number(summary.formViews || 0);
  const formStarts = Number(summary.formStarts || 0);
  const formSubmits = Number(summary.formSubmissions || 0);
  const gbpCalls = Number(gbpData?.metrics?.calls || 0);

  const visitToFormView = sessions > 0 ? formViews / sessions : 0;
  const formViewToStart = formViews > 0 ? formStarts / formViews : 0;
  const formStartToSubmit = formStarts > 0 ? formSubmits / formStarts : 0;
  const visitToSubmit = sessions > 0 ? formSubmits / sessions : 0;

  // Identify the biggest drop-off step
  const steps = [
    { name: "visit → form view", rate: visitToFormView, lost: sessions - formViews },
    { name: "form view → form start", rate: formViewToStart, lost: formViews - formStarts },
    { name: "form start → submit", rate: formStartToSubmit, lost: formStarts - formSubmits },
  ];
  const biggestDrop = steps.filter((s) => s.lost > 0).sort((a, b) => b.lost - a.lost)[0];

  const conversionScore = scoreFromBenchmark(visitToSubmit * 100, 1.5, 4);  // 1.5% benchmark
  const formCompletionScore = scoreFromBenchmark(formStartToSubmit * 100, 50, 80);
  const ctaPlacementScore = scoreFromBenchmark(visitToFormView * 100, 8, 25);
  const closedLoopScore = sparkConnected && formToContactRate != null
    ? scoreFromBenchmark(formToContactRate * 100, 80, 95)
    : 40;

  const score = Math.round(
    conversionScore * 0.35 +
    formCompletionScore * 0.25 +
    ctaPlacementScore * 0.20 +
    closedLoopScore * 0.20
  );

  const observations: string[] = [];
  if (sessions > 0) {
    if (formSubmits === 0) {
      observations.push(`Of ${fmtNum(sessions)} sessions this period, 0 submitted a form. The funnel is broken at one of three steps — visit → form view, form view → start, or form start → submit.`);
    } else {
      observations.push(`Of ${fmtNum(sessions)} sessions, ${fmtNum(formSubmits)} submitted a form — ${fmtPct(visitToSubmit, 2)} overall conversion rate.`);
    }
  }
  if (biggestDrop) {
    const recoveryAt10 = Math.round(biggestDrop.lost * 0.1);
    observations.push(`The largest drop-off is at "${biggestDrop.name}" — ${fmtNum(biggestDrop.lost)} potential conversions lost. A 10% improvement on this step alone would produce ~${fmtNum(recoveryAt10)} additional ${biggestDrop.name.includes("submit") ? "submissions" : biggestDrop.name.includes("start") ? "starts" : "form views"}.`);
  }
  if (sparkConnected && formToContactRate != null) {
    observations.push(`SPARK closed-loop: ${fmtPct(formToContactRate)} of form submissions become contact records. ${formToContactRate < 0.7 ? "Significant fall-off between form submit and contact creation — investigate form validation, deduplication, and source attribution." : "Healthy form-to-contact rate. The closed loop is working."}`);
  } else if (!sparkConnected) {
    observations.push(`SPARK is not connected. Connect SPARK to see form-submission → contact-record conversion rate — the most valuable cross-product data point for measuring web ROI.`);
  }
  if (gbpCalls > 0 && formSubmits > 0) {
    observations.push(`GBP delivered ${fmtNum(gbpCalls)} phone calls vs ${fmtNum(formSubmits)} form submissions. ${gbpCalls > formSubmits * 2 ? "Phone is your primary conversion channel — track click-to-call in GA4 to measure the full funnel." : formSubmits > gbpCalls * 2 ? "Forms are dominant — but keep your phone number prominent for high-intent mobile visitors." : "Phone and form volumes are balanced."}`);
  }

  const actions: string[] = [];
  if (biggestDrop?.name.includes("form view → form start")) {
    actions.push("Shorten your forms to 3 fields (name + email + phone) — form-view-to-start drop usually means the form looks too long. A/B test a short form on your top landing page.");
  }
  if (biggestDrop?.name.includes("visit → form view")) {
    actions.push("Add a prominent CTA above the fold and a sticky CTA in the page header on your top 3 landing pages — only a small share of visitors are reaching a form.");
  }
  if (!sparkConnected) {
    actions.push("Connect SPARK in Settings → Integrations to surface the form-submit → contact-record conversion rate.");
  }
  if (formSubmits === 0 && sessions > 30) {
    actions.push("Run a conversion path audit: verify your forms are loading correctly, that form analytics events fire in GA4, and that your contact page is reachable from the homepage.");
  }
  if (!actions.length) actions.push("Conversion funnel is healthy — focus on driving more qualified traffic (Visibility & Reach).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "visit_to_submit", value: Number((visitToSubmit * 100).toFixed(2)), weight: 0.35 },
      { key: "form_completion", value: Number((formStartToSubmit * 100).toFixed(0)), weight: 0.25 },
      { key: "cta_placement", value: Number((visitToFormView * 100).toFixed(0)), weight: 0.20 },
      { key: "form_to_contact", value: formToContactRate != null ? Number((formToContactRate * 100).toFixed(0)) : null, weight: 0.20, note: sparkConnected ? undefined : "Locked — SPARK not connected" },
    ],
    observations,
    actions,
  };
}

// ── Engine 4 — Search Intelligence ────────────────────────────────────
// Business question: "Am I winning the searches that matter?"
export function searchIntelligenceEngine(input: EngineInput): ReportAnalysis {
  const { searchData, seoData, seoDecayData } = input;
  const summary = searchData?.summary || {};
  const impressions = Number(summary.impressions || 0);
  const clicks = Number(summary.clicks || 0);
  const ctr = Number(summary.ctr || 0);
  const avgPos = Number(summary.avgPosition || 0);
  const expCtr = avgPos > 0 ? expectedCtrForPosition(avgPos) : 0;
  const ctrGap = expCtr * 100 - ctr;

  const queries: any[] = searchData?.breakdowns?.queries || [];
  // Quick wins: queries at position 11-20 with non-trivial impressions
  const quickWins = queries
    .map((q) => ({ q: q.query, imp: Number(q.impressions || 0), clk: Number(q.clicks || 0), pos: Number(q.position || q.avgPosition || 0), ctr: Number(q.ctr || 0) }))
    .filter((q) => q.pos >= 11 && q.pos <= 20 && q.imp >= 50)
    .sort((a, b) => b.imp - a.imp);
  const topQuickWin = quickWins[0];

  // CTR-gap opportunity (high impressions, low CTR)
  const ctrOpps = queries
    .map((q) => {
      const pos = Number(q.position || q.avgPosition || 0);
      const imp = Number(q.impressions || 0);
      const eCtr = pos > 0 ? expectedCtrForPosition(pos) : 0;
      return { q: q.query, imp, pos, gap: eCtr - Number(q.ctr || 0) / 100, opp: imp * Math.max(0, eCtr - Number(q.ctr || 0) / 100) };
    })
    .filter((q) => q.imp >= 100 && q.gap > 0.005)
    .sort((a, b) => b.opp - a.opp);
  const topCtrOpp = ctrOpps[0];

  // Position clustering
  const buckets = { p1to3: 0, p4to10: 0, p11to20: 0, p21plus: 0 };
  for (const q of queries) {
    const pos = Number(q.position || q.avgPosition || 0);
    if (pos > 0 && pos <= 3) buckets.p1to3++;
    else if (pos <= 10) buckets.p4to10++;
    else if (pos <= 20) buckets.p11to20++;
    else if (pos > 20) buckets.p21plus++;
  }

  // Score components
  const positionScore = avgPos > 0 ? clamp(100 - (avgPos - 1) * 3, 0, 100) : 30;
  const ctrScore = expCtr > 0 ? clamp((ctr / 100 / expCtr) * 100, 0, 100) : 50;
  const quickWinScore = clamp(quickWins.length * 10, 0, 100);
  const brandBalance = queries.length > 0
    ? clamp((queries.filter((q) => !/brand|intelligent|analytics/i.test(q.query || "")).length / Math.max(1, queries.length)) * 100, 0, 100)
    : 50;

  const score = Math.round(
    positionScore * 0.35 +
    ctrScore * 0.25 +
    quickWinScore * 0.20 +
    brandBalance * 0.20
  );

  const observations: string[] = [];
  if (impressions > 0 && avgPos > 0) {
    observations.push(`Your search profile: ${fmtNum(impressions)} impressions, ${fmtNum(clicks)} clicks (${ctr.toFixed(2)}% CTR) at average position ${avgPos.toFixed(1)}. Expected CTR at this position is ~${(expCtr * 100).toFixed(2)}%. ${ctrGap > 0.5 ? `Closing the ${ctrGap.toFixed(2)}-point gap would add ~${fmtNum((ctrGap / 100) * impressions)} clicks at current impression volume.` : "You are at or above benchmark CTR — focus optimization on raising positions."}`);
  }
  if (topCtrOpp) {
    observations.push(`Highest-CTR opportunity: "${topCtrOpp.q}" at position ${topCtrOpp.pos.toFixed(1)} with ${fmtNum(topCtrOpp.imp)} impressions — a title rewrite alone could recover ~${fmtNum(topCtrOpp.opp)} monthly clicks.`);
  }
  if (topQuickWin) {
    observations.push(`Quickest path to page 1: "${topQuickWin.q}" at position ${topQuickWin.pos.toFixed(1)} with ${fmtNum(topQuickWin.imp)} impressions. Targeted content updates and 2-3 internal links from authoritative pages typically lift queries from positions 11-20 into the top 10.`);
  }
  if (queries.length > 0) {
    observations.push(`Position clustering: ${buckets.p1to3} queries on page 1 top-3, ${buckets.p4to10} on page 1 bottom, ${buckets.p11to20} on page 2 (quick-win bucket), ${buckets.p21plus} beyond page 2. ${buckets.p11to20 > buckets.p1to3 ? "Most of your visibility is on page 2 — there is significant upside in promoting page-2 queries." : "Distribution looks healthy."}`);
  }
  if (seoDecayData?.decaying?.length) {
    observations.push(`${seoDecayData.decaying.length} keywords dropped in rank this period — a content-decay signal. The fastest recovery is a publish-date refresh + new sections on the affected pages.`);
  }

  const actions: string[] = [];
  if (topCtrOpp) {
    actions.push(`Rewrite the title tag of the page ranking for "${topCtrOpp.q}" to include the exact query phrase and a benefit hook. This is your single highest-ROI title fix this period.`);
  }
  if (topQuickWin) {
    actions.push(`Add 200-300 words of fresh, intent-matched content + internal links to the page ranking for "${topQuickWin.q}" — page-1 promotion typically produces 5-10× more clicks than position 15.`);
  }
  if (buckets.p21plus > buckets.p11to20 + buckets.p4to10) {
    actions.push(`Most of your tracked queries rank beyond page 2. Audit your content depth and internal linking on the top 10 priority pages — thin or orphaned pages rarely move past page 3.`);
  }
  if (!actions.length) actions.push("Search performance is strong — focus on expanding your non-brand keyword footprint with new landing pages.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "avg_position", value: Number(avgPos.toFixed(1)), weight: 0.35 },
      { key: "ctr_vs_benchmark", value: Number(ctrScore.toFixed(0)), weight: 0.25 },
      { key: "quick_win_count", value: quickWins.length, weight: 0.20 },
      { key: "non_brand_balance", value: Number(brandBalance.toFixed(0)), weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── Engine 5 — Content Intelligence ──────────────────────────────────
// Business question: "Is my content earning its place?"
export function contentIntelligenceEngine(input: EngineInput): ReportAnalysis {
  const { d, pluginData, searchData } = input;
  const pages: any[] = d?.breakdowns?.pages || [];
  const totalPages = pages.length;
  const totalViews = pages.reduce((s, p) => s + Number(p.pageviews || p.views || 0), 0);
  const engagingPages = pages.filter((p) => Number(p.engagementRate || 0) > 0.4 || Number(p.engagedSessions || 0) > 5);
  const thinPages = pages.filter((p) => Number(p.pageviews || p.views || 0) < 5 && Number(p.engagementRate || 0) < 0.1);
  const engagementRatio = totalPages > 0 ? engagingPages.length / totalPages : null;
  const thinRatio = totalPages > 0 ? thinPages.length / totalPages : null;

  // Content gap: high-impression queries with no matching content on site
  const queries: any[] = searchData?.breakdowns?.queries || [];
  const orphanQueries = queries.filter((q) => Number(q.position || q.avgPosition || 0) > 30 && Number(q.impressions || 0) > 20);

  // Internal linking signals from plugin
  const pluginAge = pluginData?.age;
  const pluginThin = pluginData?.wordCount?.buckets?.thin?.count || 0;
  const pluginTotal = pluginData?.wordCount?.posts_counted || 0;
  const pluginAvgWords = pluginData?.wordCount?.avg_words || 0;

  const engagementScore = engagementRatio != null ? clamp(engagementRatio * 100, 0, 100) : 50;
  const thinPenalty = thinRatio != null ? clamp(100 - thinRatio * 200, 0, 100) : 50;  // 50% thin → score 0
  const gapScore = orphanQueries.length === 0 ? 70 : clamp(100 - orphanQueries.length * 5, 0, 100);
  const depthScore = pluginAvgWords > 0 ? scoreFromBenchmark(pluginAvgWords, 700, 1500) : 50;

  const score = Math.round(engagementScore * 0.30 + thinPenalty * 0.25 + gapScore * 0.20 + depthScore * 0.25);

  const observations: string[] = [];
  if (totalPages > 0) {
    observations.push(`Of ${fmtNum(totalPages)} pages tracked, ${fmtNum(engagingPages.length)} (${fmtPct(engagementRatio || 0)}) meet the meaningful-engagement bar (engagement rate >40% OR >5 engaged sessions). The rest are deadweight.`);
  }
  if (thinPages.length > 0) {
    observations.push(`${fmtNum(thinPages.length)} pages (${fmtPct(thinRatio || 0)} of library) are thin — under 5 views and bounce-heavy. Consolidate or improve these before they drag site-wide topical authority.`);
  }
  if (orphanQueries.length > 0) {
    const top = orphanQueries.slice(0, 3).map((q) => `"${q.query}" (${fmtNum(q.impressions)} imp)`).join(", ");
    observations.push(`${orphanQueries.length} queries get search impressions but rank past page 3 — content gap opportunities. Top candidates: ${top}.`);
  }
  if (pluginAvgWords > 0) {
    observations.push(`Average post depth is ${fmtNum(pluginAvgWords)} words across ${fmtNum(pluginTotal)} posts. ${pluginAvgWords < 500 ? "Below the 700-word floor where Google tends to view content as substantive. Expand top-traffic posts first." : pluginAvgWords > 1500 ? "Strong depth — comprehensive content earns more trust signals." : "Healthy average depth."}`);
  }
  if (pluginAge?.stale?.count > 0 && pluginAge?.fresh?.count != null) {
    const total = (pluginAge.fresh?.count || 0) + (pluginAge.current?.count || 0) + (pluginAge.aging?.count || 0) + (pluginAge.stale?.count || 0);
    if (total > 0) {
      const staleRatio = (pluginAge.stale?.count || 0) / total;
      observations.push(`${fmtPct(staleRatio)} of your content library is over a year old. Stale content loses rankings to fresher competitors — refresh the top-traffic aging pages first.`);
    }
  }

  const actions: string[] = [];
  if (thinPages.length > 0) {
    actions.push(`Audit the ${thinPages.length} thin pages and either: (a) merge them into a deeper pillar page, (b) expand each to >700 words with intent-matched H2s, or (c) noindex + 301 to the most relevant remaining page.`);
  }
  if (orphanQueries.length > 0 && orphanQueries[0]) {
    actions.push(`Create dedicated landing pages for the top 3 content-gap queries: ${orphanQueries.slice(0, 3).map((q) => `"${q.query}"`).join(", ")}. Each gets its own URL, title, meta, and 700+ words of intent-matched content.`);
  }
  if (pluginAge?.stale?.count > pluginAge?.fresh?.count + pluginAge?.current?.count) {
    actions.push(`Schedule a content refresh cadence: 2 pages per month with date bump, new section, and updated stats. Start with the highest-traffic stale pages first.`);
  }
  if (!actions.length) actions.push("Content library is healthy — focus on new topic expansion through Search Intelligence quick wins.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "engagement_pct", value: Number(((engagementRatio || 0) * 100).toFixed(0)), weight: 0.30 },
      { key: "thin_content_ratio", value: Number(((thinRatio || 0) * 100).toFixed(0)), weight: 0.25 },
      { key: "content_gap_count", value: orphanQueries.length, weight: 0.20 },
      { key: "avg_post_depth", value: pluginAvgWords, weight: 0.25 },
    ],
    observations,
    actions,
  };
}

// ── Engine 6 — Local Presence & Reputation ───────────────────────────
// Business question: "Do I look trustworthy to someone who finds me locally?"
export function localPresenceEngine(input: EngineInput): ReportAnalysis {
  const { gbpData, gbpReviews, gbpPosts, gbpQanda } = input;
  const connected = gbpData?.connected === true && !gbpData?.error;
  if (!connected) {
    return {
      score: 0,
      scoreInputs: [{ key: "gbp_connected", value: 0, weight: 1.0, note: "GBP not connected" }],
      observations: ["Google Business Profile is not connected. Connect it in Settings → Connected Accounts to see your local trust profile, review velocity, and response rate."],
      actions: ["Connect Google Business Profile to start tracking your local trust signals."],
      contextNote: "GBP not connected — local presence cannot be scored.",
    };
  }

  // Completeness score
  const completeness = Number(gbpData?.completeness || gbpData?.completenessScore || 0);
  // Review signals
  const reviews: any[] = gbpReviews?.reviews || [];
  const totalReviews = Number(gbpReviews?.totalReviewCount || reviews.length || 0);
  const avgRating = Number(gbpReviews?.averageRating || 0);
  const unanswered = reviews.filter((r: any) => !r.replyComment).length;
  const responseRate = reviews.length > 0 ? (reviews.length - unanswered) / reviews.length : 0;

  // Review velocity: count of reviews in last 30/60/90 days
  const now = Date.now();
  const days = (d: any) => d?.createTime ? (now - new Date(d.createTime).getTime()) / 86400_000 : Infinity;
  const last30 = reviews.filter((r: any) => days(r) <= 30).length;
  const last60 = reviews.filter((r: any) => days(r) <= 60 && days(r) > 30).length;
  const last90 = reviews.filter((r: any) => days(r) <= 90 && days(r) > 60).length;
  const velocityTrend = last30 > last60 && last60 > last90 ? "accelerating" : last30 < last60 && last60 < last90 ? "declining" : "flat";

  const postsCount = Number(gbpPosts?.posts?.length || 0);
  const recentPosts = (gbpPosts?.posts || []).filter((p: any) => p.createTime && (now - new Date(p.createTime).getTime()) / 86400_000 <= 30).length;
  const unansweredQuestions = (gbpQanda?.questions || []).filter((q: any) => q.needsReply).length;

  // Score
  const completenessScore = clamp(completeness, 0, 100) || (postsCount > 0 ? 70 : 50);
  const velocityScore = velocityTrend === "accelerating" ? 90 : velocityTrend === "flat" ? 60 : 30;
  const responseRateScore = clamp(responseRate * 100, 0, 100);
  const ratingScore = avgRating > 0 ? clamp(((avgRating - 3) / 2) * 100, 0, 100) : 50;
  const score = Math.round(
    completenessScore * 0.20 +
    velocityScore * 0.25 +
    responseRateScore * 0.25 +
    ratingScore * 0.30
  );

  const observations: string[] = [];
  observations.push(`Trust composite: ${avgRating.toFixed(1)}★ avg across ${fmtNum(totalReviews)} reviews, ${fmtPct(responseRate)} response rate, ${recentPosts} new posts in the last 30 days. ${score >= 70 ? "Strong local trust signal — your prospects see a credible business." : score >= 50 ? "Decent local presence — closing a few gaps (response rate, review velocity) would meaningfully strengthen it." : "Local trust signal needs work — fix the gaps below before they cost you conversions."}`);
  observations.push(`Review velocity: ${last30} new in the last 30 days, ${last60} in the prior 30, ${last90} in the 30 before that → ${velocityTrend}. ${velocityTrend === "declining" ? "Declining review velocity is a trust-decay signal even when your current rating is high. Re-engage your review request flow." : velocityTrend === "accelerating" ? "Review velocity is climbing — keep the request cadence going." : "Velocity is steady — focus on response rate and post cadence to compound trust."}`);
  if (unanswered > 0) {
    observations.push(`${unanswered} reviews are unanswered. Reviews with owner responses convert better than reviews without, and Google's local algorithm rewards engagement.`);
  }
  if (unansweredQuestions > 0) {
    observations.push(`${unansweredQuestions} questions on your profile have no owner answer. Q&A is a high-visibility surface — competitors can answer for you if you don't.`);
  }
  if (recentPosts === 0) {
    observations.push(`No GBP posts in the last 30 days. Posts decay after 7 days but are a free way to surface promotions, hours changes, and content updates in the local pack.`);
  }

  const actions: string[] = [];
  if (unanswered > 0) actions.push(`Respond to all ${unanswered} unanswered reviews this week — even a one-sentence thank-you. Response rate is a published GBP quality signal.`);
  if (velocityTrend === "declining") actions.push(`Re-launch your post-job review request — text-message review requests average 25-30% capture vs 3-5% for email.`);
  if (recentPosts === 0) actions.push(`Publish 1 GBP post per week — service highlight, customer photo, or seasonal offer. 4 posts a month keeps your local pack snippet fresh.`);
  if (!actions.length) actions.push("Local presence is strong — maintain current cadence and consider expanding to service-area pages.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "completeness", value: completenessScore, weight: 0.20 },
      { key: "review_velocity_trend", value: velocityTrend, weight: 0.25 },
      { key: "response_rate", value: Math.round(responseRate * 100), weight: 0.25 },
      { key: "rating", value: avgRating, weight: 0.30 },
    ],
    observations,
    actions,
  };
}

// ── Engine 7 — Technical & Site Health ───────────────────────────────
// Business question: "Is the foundation solid and what is the business cost of current issues?"
export function technicalHealthEngine(input: EngineInput): ReportAnalysis {
  const { pluginData } = input;
  const psi = pluginData?.psi || [];
  const latest = psi.length > 0 ? psi[psi.length - 1] : null;
  const mobilePerf = Number(latest?.mobileScore ?? latest?.mobile?.performance ?? 0);
  const desktopPerf = Number(latest?.desktopScore ?? latest?.desktop?.performance ?? 0);
  const lcpMobile = Number(latest?.mobileLcp ?? latest?.mobile?.lcp ?? 0);
  const cls = Number(latest?.mobileCls ?? latest?.mobile?.cls ?? 0);

  const wfOverall = pluginData?.wfFull?.overall_score ?? null;
  const vulnerabilities = Number(pluginData?.wfFull?.vulnerabilities_count || pluginData?.security?.vulnerabilities || 0);
  const pluginsOutdated = Number(pluginData?.plugins?.outdated_count || 0);

  const performanceScore = (mobilePerf + desktopPerf) / 2;
  const securityScore = wfOverall != null ? clamp(Number(wfOverall), 0, 100) : (vulnerabilities === 0 ? 80 : 50);
  const updatesScore = pluginsOutdated === 0 ? 100 : clamp(100 - pluginsOutdated * 10, 0, 100);
  const cwvScore = (lcpMobile > 0 && lcpMobile < 2500 ? 100 : lcpMobile < 4000 ? 60 : 30) * 0.5
                 + (cls > 0 && cls < 0.1 ? 100 : cls < 0.25 ? 60 : 30) * 0.5;

  const score = Math.round(
    performanceScore * 0.30 +
    securityScore * 0.25 +
    cwvScore * 0.25 +
    updatesScore * 0.20
  );

  const observations: string[] = [];
  if (mobilePerf > 0) {
    const lcpSec = lcpMobile / 1000;
    observations.push(`Mobile PageSpeed: ${Math.round(mobilePerf)}/100, LCP ${lcpSec.toFixed(2)}s, CLS ${cls.toFixed(3)}. ${lcpSec > 2.5 ? `A 2-second LCP improvement typically lifts service-business conversion 12-15%. Current LCP of ${lcpSec.toFixed(2)}s is leaving conversion on the table.` : "Core Web Vitals are passing — strong technical foundation."}`);
  }
  if (vulnerabilities > 0) {
    observations.push(`${vulnerabilities} known plugin vulnerabilities detected by Wordfence. Each unpatched vulnerability is an open door — even one critical-severity finding can lead to a complete site compromise and recovery costs that dwarf the cost of patching.`);
  } else {
    observations.push("No active plugin vulnerabilities — Wordfence is clean. Maintain monthly plugin updates to keep it that way.");
  }
  if (pluginsOutdated > 0) {
    observations.push(`${pluginsOutdated} plugins have updates pending. Outdated plugins are the most common WordPress attack vector — schedule monthly updates to close the window.`);
  }
  if (desktopPerf > 0 && desktopPerf < 80) {
    observations.push(`Desktop performance score is ${Math.round(desktopPerf)}. Desktop is typically easier to optimize than mobile — focus on image lazy-loading, render-blocking JS, and unused CSS.`);
  }

  const actions: string[] = [];
  if (lcpMobile > 2500) {
    actions.push(`Optimize images on the homepage: convert to WebP, set explicit dimensions, lazy-load below-fold. This is the highest-ROI LCP fix for most service-business sites.`);
  }
  if (vulnerabilities > 0) {
    actions.push(`Patch the ${vulnerabilities} flagged plugin vulnerabilities this week. Wordfence's report lists the affected plugin and severity — update or replace each.`);
  }
  if (pluginsOutdated >= 3) {
    actions.push(`Schedule a plugin maintenance window: update the ${pluginsOutdated} outdated plugins on staging first, then promote to production. Backup before each batch.`);
  }
  if (!actions.length) actions.push("Site health is solid — focus on growth (Visibility, Search, Content).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "mobile_perf", value: Math.round(mobilePerf), weight: 0.30 },
      { key: "security_score", value: Math.round(securityScore), weight: 0.25 },
      { key: "cwv_score", value: Math.round(cwvScore), weight: 0.25 },
      { key: "plugins_updates", value: Math.round(updatesScore), weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── Engine 8 — Business Presence Score (synthesis) ───────────────────
// Business question: "What does my complete online presence look like as a whole?"
// This is the ARION Trend Score composite shown in the 4-gauge header.
export function businessPresenceEngine(scores: Record<string, number>): ReportAnalysis {
  // Weights from the handoff doc:
  const WEIGHTS = {
    visibility: 0.20,
    conversion: 0.20,
    search: 0.15,
    local: 0.15,
    content: 0.12,
    audience: 0.10,
    technical: 0.08,
  } as const;

  const weighted = Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + (scores[k] || 0) * w, 0);

  // Find the 2-3 lowest scoring reports — the highest-impact gaps.
  const gaps = Object.entries(scores)
    .map(([k, s]) => ({ key: k, score: s, weight: (WEIGHTS as any)[k] || 0 }))
    .filter((g) => g.weight > 0)
    .sort((a, b) => (a.score * a.weight) - (b.score * b.weight))
    .slice(0, 3);

  const LABELS: Record<string, string> = {
    visibility: "Visibility & Reach",
    conversion: "Conversion Intelligence",
    search: "Search Intelligence",
    local: "Local Presence & Reputation",
    content: "Content Intelligence",
    audience: "Audience Intelligence",
    technical: "Technical & Site Health",
  };

  const observations: string[] = [];
  observations.push(`Overall Business Presence Score: ${Math.round(weighted)}/100. ${weighted >= 70 ? "Above average for service businesses — your online presence is doing more good than harm." : weighted >= 50 ? "Average overall — meaningful but uneven. The synthesis below identifies the gaps that would move this number the most." : "Below average — the gaps below are costing you discoverability and conversions."}`);
  if (gaps.length > 0) {
    observations.push(`Top 3 impact-weighted gaps relative to your overall: ${gaps.map((g) => `${LABELS[g.key] || g.key} (${g.score}/100, ${Math.round(g.weight * 100)}% weight)`).join(" → ")}.`);
  }
  observations.push(`A typical service business in your category scores 55-70 on this composite. Improvements compound: a 10-point lift in Conversion Intelligence has roughly the same business impact as a 10-point lift in Visibility & Reach because they're equally weighted.`);

  const actions = gaps.map((g) => {
    const handoff: Record<string, string> = {
      visibility: "Open the Visibility & Reach report and act on the geographic relevance + title-rewrite actions.",
      conversion: "Open the Conversion Intelligence report and address the largest funnel drop-off step.",
      search: "Open the Search Intelligence report and act on the top quick-win and CTR-gap queries.",
      local: "Open the Local Presence & Reputation report and start with unanswered reviews and review velocity.",
      content: "Open the Content Intelligence report and clean up thin pages or fill content gaps.",
      audience: "Open the Audience Intelligence report and address mobile UX or retention-loop gaps.",
      technical: "Open the Technical & Site Health report and patch vulnerabilities or LCP issues.",
    };
    return handoff[g.key] || `Open the ${LABELS[g.key] || g.key} report.`;
  }).slice(0, 3);

  return {
    score: clamp(Math.round(weighted), 0, 100),
    scoreInputs: Object.entries(WEIGHTS).map(([k, w]) => ({ key: k, value: scores[k] || 0, weight: w })),
    observations,
    actions,
  };
}

// ── Convenience export — run all 8 engines and assemble header data ──

export interface AllReportScores {
  visibility: ReportAnalysis;
  audience: ReportAnalysis;
  conversion: ReportAnalysis;
  search: ReportAnalysis;
  content: ReportAnalysis;
  local: ReportAnalysis;
  technical: ReportAnalysis;
  presence: ReportAnalysis;
}

export function runAllReports(input: EngineInput): AllReportScores {
  const visibility = visibilityReachEngine(input);
  const audience = audienceIntelligenceEngine(input);
  const conversion = conversionIntelligenceEngine(input);
  const search = searchIntelligenceEngine(input);
  const content = contentIntelligenceEngine(input);
  const local = localPresenceEngine(input);
  const technical = technicalHealthEngine(input);
  const presence = businessPresenceEngine({
    visibility: visibility.score,
    conversion: conversion.score,
    search: search.score,
    local: local.score,
    content: content.score,
    audience: audience.score,
    technical: technical.score,
  });
  return { visibility, audience, conversion, search, content, local, technical, presence };
}

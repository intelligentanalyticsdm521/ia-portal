/**
 * Phase 3.5 — SEO Overview (rebuild 2026-04-19 v2, post-feedback).
 *
 * Layout (top → bottom):
 *   1. Filter bar: range picker + range summary
 *   2. Standard Search Engines label (tooltip) + toggle BELOW the label
 *      using SeoFilterPills — All · Google Desktop · Google Mobile · Bing
 *   3. Standard Search Engines hero cards — always visible regardless of
 *      toggle. Big brand name, ranking number, delta (count + %).
 *      No sparklines in these cards per feedback.
 *   4. AI Search Engines cards — fed from /airt/llm. Placeholder stats for
 *      now until /airt/llm/{id}/statistics is wired.
 *   5. Key Metrics row — Search Visibility · Top 10 · Traffic Forecast ·
 *      Audit Health Score. Each card has an appropriate visual
 *      (donut for health score, sparklines for others).
 *   6. Rankings widget — 2×3 stat grid with area-chart sparklines + tiny
 *      Jumped/Dropped tabs (left side, small, green/red) + top 5 movers.
 *      Affected by the engine toggle above.
 *   7. Site Audit / Competitors / AI Search / Market Monitor / Content
 *      widgets — each with `See Full [X] Summary →` button
 *   8. Consulting upsell
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { AddonUpsell, EmptyPanel, Loading, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import { SeoRangePicker, SeoStatCard, SeoFilterPills } from '../../components/SeoUi';
import { GlossaryIcon } from '../../components/Glossary';
import { canonicalEngineLabel } from '../../utils/engineLabel';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';
import type {
  SeoRangeCode,
  SeoOverviewResponse,
  SeoHeroEngineCard,
  SeoAuditResponse,
  SeoMarketMonitorResponse,
  SeoCompetitorsResponse,
} from '../../../lib/arionApi';

type EngineFilter = 'all' | string;

export function SeoOverview() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const navigate = useNavigate();
  const [range, setRange] = React.useState<SeoRangeCode>('30d');
  const [engineFilter, setEngineFilter] = React.useState<EngineFilter>('all');
  const [moversTab, setMoversTab] = React.useState<'jumped' | 'dropped'>('jumped');

  const { data: overviewData, loading } = useArionData(
    () => activeSiteId ? arionApi.getSeoOverview(activeSiteId, range) : Promise.resolve(null),
    [activeSiteId, range]
  );
  const { data: auditData } = useArionData(
    () => activeSiteId ? arionApi.getSeoAudit(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: compData } = useArionData(
    () => activeSiteId ? arionApi.getSeoCompetitors(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: mmData } = useArionData(
    () => activeSiteId ? arionApi.getSeoMarketMonitor(activeSiteId, 30).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const o = overviewData as SeoOverviewResponse | null;
  const a = auditData as SeoAuditResponse | null;
  const comp = compData as SeoCompetitorsResponse | null;
  const mm = mmData as SeoMarketMonitorResponse | null;
  const connected = o?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Full SEO intelligence across Google, Bing, and AI search engines. Powered by SE Ranking."
        price="$24.99"
        planName="Starter"
      />
    );
  }
  if (!connected) {
    return <ErrorBanner message="SE Ranking is not connected for this site yet. Check the Keyword Rankings page to run diagnostics." />;
  }

  const standardCards: SeoHeroEngineCard[] = o!.heroCards.standard || o!.heroCards.providers || [];
  const aiCards: SeoHeroEngineCard[] = o!.heroCards.ai || [];
  const distribution = o!.distributionSeries || [];

  // Active stats for the Rankings widget — filtered by engine toggle.
  // Top hero cards are ALWAYS full (ignore toggle).
  const activeCard = engineFilter === 'all' ? null : standardCards.find((c) => c.engineId === engineFilter);
  const activeStats = activeCard?.current ?? o!.stats.current;
  const activePriorStats = activeCard?.prior ?? o!.stats.prior;
  const activeDelta = activeCard
    ? { avgPosition: activeCard.avgPositionDelta, visibilityScore: activeCard.visibilityDelta, top10Count: activeCard.top10Delta }
    : o!.stats.delta;

  // Top-N keyword counts derived from activeStats.buckets so the main numbers
  // on the Rankings widget match the Key Metrics row (unique-keyword counting,
  // not per-engine entry counting). Also compute prior + delta for each bucket.
  const buckets = activeStats.buckets || { top1: 0, top2_3: 0, top4_5: 0, top6_10: 0, top11_30: 0, top31_100: 0, notRanking: 0 };
  const priorBuckets = activePriorStats.buckets || { top1: 0, top2_3: 0, top4_5: 0, top6_10: 0, top11_30: 0, top31_100: 0, notRanking: 0 };
  const top3Count = (buckets.top1 || 0) + (buckets.top2_3 || 0);
  const top10Count = top3Count + (buckets.top4_5 || 0) + (buckets.top6_10 || 0);
  const top30Count = top10Count + (buckets.top11_30 || 0);
  const top100Count = top30Count + (buckets.top31_100 || 0);
  const priorTop3 = (priorBuckets.top1 || 0) + (priorBuckets.top2_3 || 0);
  const priorTop10 = priorTop3 + (priorBuckets.top4_5 || 0) + (priorBuckets.top6_10 || 0);
  const priorTop30 = priorTop10 + (priorBuckets.top11_30 || 0);
  const priorTop100 = priorTop30 + (priorBuckets.top31_100 || 0);
  const top3Delta = top3Count - priorTop3;
  const top10DeltaAccurate = top10Count - priorTop10;
  const top30Delta = top30Count - priorTop30;
  const top100Delta = top100Count - priorTop100;

  // Sparklines derived from distribution series
  const avgPosSparkline = distribution.map((d) => ({ date: d.date, value: weightedAvgPositionForDay(d) })).filter((p) => p.value != null) as Array<{ date: string; value: number }>;
  const top3Sparkline = distribution.map((d) => ({ date: d.date, value: (d.top1 || 0) + (d.top2_3 || 0) }));
  const top10Sparkline = distribution.map((d) => ({ date: d.date, value: (d.top1 || 0) + (d.top2_3 || 0) + (d.top4_5 || 0) + (d.top6_10 || 0) }));
  const top30Sparkline = distribution.map((d, i) => ({ date: d.date, value: top10Sparkline[i].value + (d.top11_30 || 0) }));
  const top100Sparkline = distribution.map((d, i) => ({ date: d.date, value: top30Sparkline[i].value + (d.top31_100 || 0) }));
  const visibilitySparkline = distribution.map((d) => ({
    date: d.date,
    value: Math.round(((d.top1 || 0) * 0.27 + (d.top2_3 || 0) * 0.13 + (d.top4_5 || 0) * 0.075 + (d.top6_10 || 0) * 0.03) * 100) / 100,
  }));
  const trafficForecastSparkline = distribution.map((d) => ({
    date: d.date,
    value: Math.round((d.top1 || 0) * 0.27 + (d.top2_3 || 0) * 0.13 + (d.top4_5 || 0) * 0.075),
  }));

  // Tier gating for AI cards — AI engine model AGREED 2026-08-21
  // (PRICING_REWORK_DECISIONS_2026-08-21):
  // - Google AI Overviews + Google AI Mode: Growth and above
  // - ChatGPT / Gemini: Authority
  // - Perplexity: IA Consulting only (never self-serve)
  const tier = (selectedSite?.seoAddonTier || '').toLowerCase();
  type AiGateReason = 'available' | 'upgrade_growth' | 'upgrade_authority' | 'consulting_only';
  const aiGateFor = (type: string | null): AiGateReason => {
    const t = (type || '').toLowerCase();
    if (t === 'ai_mode' || t === 'aimode' || t === 'google_ai_mode' || t === 'ai_overview' || t === 'google_ai_overview') {
      return (tier === 'growth' || tier === 'authority') ? 'available' : 'upgrade_growth';
    }
    if (t === 'chatgpt') return tier === 'authority' ? 'available' : 'upgrade_authority';
    if (t === 'gemini') return tier === 'authority' ? 'available' : 'upgrade_authority';
    if (t === 'perplexity') return 'consulting_only';
    return tier === 'authority' ? 'available' : 'upgrade_authority';
  };

  // Canonical AI engine list — always render all 5 in this order regardless of
  // whether SE Ranking has them configured on the project (Perplexity shows
  // its consulting-only state).
  const AI_CANONICAL: Array<{ type: string; label: string }> = [
    { type: 'ai_overview', label: 'Google AI Overviews' },
    { type: 'ai_mode', label: 'Google AI Mode' },
    { type: 'chatgpt', label: 'ChatGPT' },
    { type: 'gemini', label: 'Gemini' },
    { type: 'perplexity', label: 'Perplexity' },
  ];
  const aiCanonicalCards = AI_CANONICAL.map((can) => {
    const found = aiCards.find((c) => {
      const t = String(c.type || '').toLowerCase();
      if (can.type === 'ai_overview') return t === 'ai_overview' || t === 'google_ai_overview';
      if (can.type === 'ai_mode') return t === 'ai_mode' || t === 'google_ai_mode' || t === 'aimode';
      return t === can.type;
    });
    return { canonical: can, card: found ?? null };
  });

  // Canonical standard-engine list — Google / Google Mobile / Bing. Try to
  // match each engine by name/device/label. If ALL matchers fail (e.g.
  // because SE Ranking returned generic "Engine {id}" labels), fall back to
  // heuristic assignment by device: first desktop → Google, first mobile →
  // Google Mobile, rest in order for Bing.
  const nameOf = (c: SeoHeroEngineCard) => String(c.name || c.type || '').toLowerCase();
  const deviceOf = (c: SeoHeroEngineCard) => String(c.device || '').toLowerCase();
  const labelOf = (c: SeoHeroEngineCard) => `${c.label || ''} ${c.longLabel || ''}`.toLowerCase();
  const looksGeneric = (c: SeoHeroEngineCard) => /^engine\s*\d+/i.test(c.label || '') && !c.name && !c.type;

  const consumed = new Set<string>();
  const pickCard = (matcher: (c: SeoHeroEngineCard) => boolean): SeoHeroEngineCard | null => {
    const found = standardCards.find((c) => !consumed.has(c.engineId) && matcher(c));
    if (found) consumed.add(found.engineId);
    return found ?? null;
  };
  const isGoogle = (c: SeoHeroEngineCard) => /google/.test(nameOf(c)) || /google/.test(labelOf(c)) || c.type === 'google' || c.type === 'google_mobile';
  const isBing = (c: SeoHeroEngineCard) => /bing/.test(nameOf(c)) || /bing/.test(labelOf(c)) || c.type === 'bing';
  const isMobile = (c: SeoHeroEngineCard) => deviceOf(c) === 'mobile' || /mobile/.test(labelOf(c)) || c.type === 'google_mobile';

  let googleDesktopCard = pickCard((c) => isGoogle(c) && !isMobile(c));
  let googleMobileCard = pickCard((c) => isGoogle(c) && isMobile(c));
  let bingCard = pickCard(isBing);

  // Fallback: if NOTHING matched and we DO have standard cards (generic
  // labels), assign by device first, then by order.
  if (!googleDesktopCard && !googleMobileCard && !bingCard && standardCards.length > 0) {
    const unconsumed = standardCards.filter((c) => !consumed.has(c.engineId));
    // If any engine has device info, use it
    googleDesktopCard = unconsumed.find((c) => deviceOf(c) === 'desktop') || null;
    if (googleDesktopCard) consumed.add(googleDesktopCard.engineId);
    googleMobileCard = unconsumed.find((c) => deviceOf(c) === 'mobile' && !consumed.has(c.engineId)) || null;
    if (googleMobileCard) consumed.add(googleMobileCard.engineId);
    // If still no matches, fall back to order: 1st = Google, 2nd = Mobile, 3rd = Bing
    if (!googleDesktopCard && !googleMobileCard) {
      const rest = unconsumed.filter((c) => !consumed.has(c.engineId));
      if (rest[0]) { googleDesktopCard = rest[0]; consumed.add(rest[0].engineId); }
      if (rest[1]) { googleMobileCard = rest[1]; consumed.add(rest[1].engineId); }
      if (rest[2]) { bingCard = rest[2]; consumed.add(rest[2].engineId); }
    } else if (!bingCard) {
      // Only Google variants picked — leave Bing locked
      const rest = unconsumed.filter((c) => !consumed.has(c.engineId));
      if (rest[0] && looksGeneric(rest[0])) { bingCard = rest[0]; consumed.add(rest[0].engineId); }
    }
  }

  const standardCanonicalCards = [
    { canonical: { id: 'google_desktop', label: 'Google' }, card: googleDesktopCard },
    { canonical: { id: 'google_mobile', label: 'Google Mobile' }, card: googleMobileCard },
    { canonical: { id: 'bing', label: 'Bing' }, card: bingCard },
  ];

  // Any remaining engines (e.g. Yandex, DuckDuckGo) — append as-is.
  const extraStandard = standardCards.filter((c) => !consumed.has(c.engineId));

  // Audit data
  const auditConnected = a?.status === 'complete';
  const auditHealthScore = auditConnected ? (a!.healthScore ?? 0) : null;
  const auditErrors = a?.issues?.errors ?? 0;
  const auditWarnings = a?.issues?.warnings ?? 0;
  const auditNotices = a?.issues?.notices ?? 0;
  const auditPassed = a?.issues?.passed ?? 0;
  const auditPages = a?.pagesCrawled ?? 0;

  // Competitors + Market Monitor data
  const competitors = (comp?.competitors ?? []).slice(0, 5);
  const topComp = competitors[0] ?? null;
  const mmMoves = mm?.moves?.length ?? 0;
  const mmNewBacklinks = mm?.backlinks?.new?.length ?? 0;
  const mmLostBacklinks = mm?.backlinks?.lost?.length ?? 0;
  const mmPageChanges = mm?.pageChanges?.length ?? 0;

  // Engine toggle options (All + one per canonical standard engine).
  // Drive from standardCanonicalCards (which already locks Google/Bing labels
  // via the SeoOverview heuristic) so the Provider pills never show
  // SE Ranking's raw "Engine 12345" id even when individual cards lack
  // name/type metadata.
  const CANONICAL_TOGGLE_LABEL: Record<string, string> = {
    google_desktop: 'Google - Desktop',
    google_mobile: 'Google - Mobile',
    bing: 'Bing',
  };
  const toggleOptions = [
    { value: 'all' as const, label: 'All' },
    ...standardCanonicalCards
      .filter((x) => x.card)
      .map((x) => ({
        value: x.card!.engineId,
        label: CANONICAL_TOGGLE_LABEL[x.canonical.id] || canonicalEngineLabel(x.card!),
      })),
  ];

  return (
    <div>
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'keyword_movement', label: 'Keyword movement' },
        { id: 'referring_domains', label: 'Referring domains' },
        { id: 'competitor_rankings', label: 'Share of voice' },
      ]} />
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <SeoRangePicker value={range} onChange={setRange} />
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #5A7A8A)', marginLeft: 'auto' }}>
          {o!.range.label} · vs {o!.range.prior.start} to {o!.range.prior.end}
        </div>
      </div>

      {/* Project Settings — engines locked (Brandon decision 2026-06-17),
          tenant manages keywords/prompts/competitors only. */}
      <ProjectSettingsCard
        tier={tier}
        standardCards={standardCanonicalCards}
        aiPromptsAvailable={tier === 'growth' || tier === 'authority'}
        onNavigate={(p) => navigate(p)}
      />

      {/* Standard Search Engines — label + toggle below + always-visible cards */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 6, display: 'inline-flex', alignItems: 'center' }}>
        Standard Search Engines
        <GlossaryIcon termKey="position" size={12} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <span title="Provider = Google, Bing, or Mobile (Google Mobile search results tracked separately from Desktop)" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <SeoFilterPills label="Provider" options={toggleOptions.map((o) => ({ value: String(o.value), label: o.label }))} value={String(engineFilter)} onChange={(v) => setEngineFilter(v as EngineFilter)} />
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${standardCanonicalCards.length + extraStandard.length}, 1fr)`, gap: 12 }}>
        {standardCanonicalCards.map(({ canonical, card }) => (
          card ? (
            <EngineHeroCard key={canonical.id} card={card} accent="#2D9CDB" labelOverride={canonical.label} />
          ) : (
            <StandardEngineLockedCard key={canonical.id} label={canonical.label} />
          )
        ))}
        {extraStandard.map((c) => (
          <EngineHeroCard key={c.engineId} card={c} accent="#2D9CDB" labelOverride={canonicalEngineLabel(c)} />
        ))}
      </div>

      {/* AI Search Engines — always visible, always 5 cards in canonical order */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', marginTop: 24, marginBottom: 10, display: 'inline-flex', alignItems: 'center' }}>
        AI Search Engines
        <GlossaryIcon termKey="ai_mentions" size={12} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${aiCanonicalCards.length}, 1fr)`, gap: 12 }}>
        {aiCanonicalCards.map(({ canonical, card }) => (
          <AiHeroCard
            key={canonical.type}
            card={card}
            canonicalLabel={canonical.label}
            canonicalType={canonical.type}
            gate={aiGateFor(canonical.type)}
          />
        ))}
      </div>

      {/* Key Metrics row — 4 cards with visuals */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', marginTop: 24, marginBottom: 10 }}>
        Key Metrics
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <SeoStatCard
          label="Search Visibility"
          value={activeStats.visibilityScore != null ? `${activeStats.visibilityScore.toFixed(1)}%` : '—'}
          delta={activeDelta.visibilityScore}
          deltaFormat="percentage"
          deltaIsGoodWhenPositive={true}
          sparklineData={visibilitySparkline}
          sparklineColor="#EF6C33"
          accent="#EF6C33"
          termKey="search_visibility"
        />
        <SeoStatCard
          label="Top 10 Keywords"
          value={activeStats.top10Count ?? '—'}
          delta={activeDelta.top10Count}
          deltaFormat="signed"
          deltaIsGoodWhenPositive={true}
          sparklineData={top10Sparkline}
          sparklineColor="#1D9E75"
          accent="#1D9E75"
          termKey="top10_keywords"
        />
        <SeoStatCard
          label="Traffic Forecast"
          value={activeStats.trafficForecast ?? '—'}
          sub="CTR-weighted estimate"
          sparklineData={trafficForecastSparkline}
          sparklineColor="#2D9CDB"
          accent="#2D9CDB"
          termKey="traffic_forecast"
        />
        <HealthScoreStatCard score={auditHealthScore} />
      </div>

      {/* Rankings widget */}
      <WidgetContainer
        title="Keyword Rankings"
        subtitle={engineFilter === 'all' ? 'Averaged across all standard engines' : `Filtered: ${canonicalEngineLabel(activeCard)}`}
        onSeeFull={() => navigate('/app/services/arion_seo_rankings')}
        seeFullLabel="See Full Rankings Summary"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SeoStatCard
              label="Avg Position"
              value={activeStats.avgPosition != null ? String(Math.round(activeStats.avgPosition)) : '—'}
              delta={activeDelta.avgPosition}
              deltaFormat="position"
              deltaIsGoodWhenPositive={true}
              sparklineData={avgPosSparkline}
              sparklineColor="#2D9CDB"
              accent="#2D9CDB"
              termKey="avg_position"
            />
            <SeoStatCard label="Top 3" value={top3Count} delta={top3Delta} deltaFormat="signed" deltaIsGoodWhenPositive={true} sparklineData={top3Sparkline} sparklineColor="#1D9E75" accent="#1D9E75" />
            <SeoStatCard label="Top 10" value={top10Count} delta={top10DeltaAccurate} deltaFormat="signed" deltaIsGoodWhenPositive={true} sparklineData={top10Sparkline} sparklineColor="#1D9E75" accent="#1D9E75" termKey="top10_keywords" />
            <SeoStatCard
              label="Search Visibility"
              value={activeStats.visibilityScore != null ? `${activeStats.visibilityScore.toFixed(1)}%` : '—'}
              delta={activeDelta.visibilityScore}
              deltaFormat="percentage"
              deltaIsGoodWhenPositive={true}
              sparklineData={visibilitySparkline}
              sparklineColor="#EF6C33"
              accent="#EF6C33"
            />
            <SeoStatCard label="Top 30" value={top30Count} delta={top30Delta} deltaFormat="signed" deltaIsGoodWhenPositive={true} sparklineData={top30Sparkline} sparklineColor="#4285F4" accent="#4285F4" />
            <SeoStatCard label="Top 100" value={top100Count} delta={top100Delta} deltaFormat="signed" deltaIsGoodWhenPositive={true} sparklineData={top100Sparkline} sparklineColor="#7B61FF" accent="#7B61FF" />
          </div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <SmallMoverTab active={moversTab === 'jumped'} onClick={() => setMoversTab('jumped')} label="Jumped" count={o!.movers.jumped.length} tone="up" />
              <SmallMoverTab active={moversTab === 'dropped'} onClick={() => setMoversTab('dropped')} label="Dropped" count={o!.movers.dropped.length} tone="down" />
            </div>
            <MoversTable movers={moversTab === 'jumped' ? o!.movers.jumped : o!.movers.dropped} />
          </div>
        </div>
      </WidgetContainer>

      {/* Site Audit widget */}
      <WidgetContainer
        title="Site Audit"
        subtitle={auditConnected ? `Last audit ${new Date(a!.lastAuditDate || '').toLocaleDateString()}` : 'No audit data yet'}
        onSeeFull={() => navigate('/app/services/arion_seo_site_audit')}
        seeFullLabel="See Full Site Audit Summary"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <HealthScoreDonut score={auditHealthScore} />
          <IssuesBarChart errors={auditErrors} warnings={auditWarnings} notices={auditNotices} />
          <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            <SeoStatCard label="Crawled Pages" value={auditPages} accent="#4285F4" />
            <SeoStatCard label="Passed Checks" value={auditPassed} accent="#1D9E75" />
          </div>
        </div>
      </WidgetContainer>

      {/* Competitors widget */}
      <WidgetContainer
        title="Competitors"
        subtitle={competitors.length > 0 ? `${competitors.length} tracked` : 'No competitors configured'}
        onSeeFull={() => navigate('/app/services/arion_seo_competitors')}
        seeFullLabel="See Full Competitors Summary"
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <SeoStatCard label="Tracked" value={competitors.length} sub="competitors" accent="#EF6C33" />
            {topComp && (
              <SeoStatCard label="Top Competitor" value={(topComp as any).domain ?? '—'} sub={`Domain Trust ${(topComp as any).domainTrust ?? '—'}`} accent="#0C4A60" />
            )}
          </div>
          <CompetitorsMiniTable competitors={competitors as any[]} />
        </div>
      </WidgetContainer>

      {/* AI Search Results widget */}
      <WidgetContainer
        title="AI Search Results"
        subtitle={aiCards.length > 0 ? `${aiCards.length} AI engines tracked` : 'Not configured'}
        onSeeFull={() => navigate('/app/services/arion_seo_ai_search')}
        seeFullLabel="See Full AI Search Summary"
      >
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(aiCards.length, 1)}, 1fr)`, gap: 12 }}>
          {aiCards.length === 0 ? (
            <div style={{ color: '#5A7A8A', fontSize: 12, padding: 20, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
              Configure AI engines in SE Ranking to see mention tracking data.
            </div>
          ) : (
            aiCards.map((c) => (
              <div key={c.engineId} style={{ background: '#F8FAFC', borderRadius: 6, padding: '12px 14px', borderLeft: '3px solid #0C4A60' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#0B1C24' }}>{c.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#0C4A60', marginTop: 4 }}>
                  {c.placeholder ? '—' : (c.current.top10Count ?? 0)}
                </div>
                <div style={{ fontSize: 9, color: '#5A7A8A', marginTop: 2 }}>
                  {c.placeholder ? 'stats coming soon' : 'mentions'}
                </div>
              </div>
            ))
          )}
        </div>
      </WidgetContainer>

      {/* Market Monitor widget */}
      <WidgetContainer
        title="Market Monitor"
        subtitle={mm?.authorityGated ? 'Authority tier required' : 'Last 30 days'}
        onSeeFull={() => navigate('/app/services/arion_seo_market_monitor')}
        seeFullLabel="See Full Market Monitor Summary"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <SeoStatCard label="New Backlinks" value={mmNewBacklinks} sub="past 30 days" accent="#1D9E75" termKey="backlinks_new" />
          <SeoStatCard label="Lost Backlinks" value={mmLostBacklinks} sub="past 30 days" accent="#D85A30" termKey="backlinks_lost" />
          <SeoStatCard label="Page Changes" value={mmPageChanges} sub="on watched pages" accent="#4285F4" termKey="page_changes" />
          <SeoStatCard label="Competitor Moves" value={mmMoves} sub="≥5 position swings" accent="#EF6C33" termKey="competitor_moves" />
        </div>
      </WidgetContainer>

      {/* Content widget — routes to IA Content Intelligence */}
      <WidgetContainer
        title="Content"
        subtitle="Content-quality scoring and improvement opportunities"
        onSeeFull={() => navigate('/app/services/arion_analytics_ia_cross_platform')}
        seeFullLabel="See Full Content Intelligence"
      >
        <div style={{ padding: 16, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#5A7A8A', fontSize: 12, lineHeight: 1.6 }}>
          Content scoring across your site's top pages powers the Content Intelligence view.
          Flagged pages (Content Score &lt; 50) surface as refresh opportunities.
        </div>
      </WidgetContainer>

      <ConsultingUpsell
        headline="Want IA to run your SEO strategy end-to-end?"
        subtext="Our SEO strategists read these signals weekly, execute content + outreach plans, and report monthly."
        serviceType="SEO Strategy"
        triggerPage="seo-overview"
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────

/**
 * Top-row hero card for standard engines. No sparkline — just brand, big
 * number, delta (absolute + percentage).
 */
function EngineHeroCard({ card, accent, labelOverride }: { card: SeoHeroEngineCard; accent: string; labelOverride?: string }) {
  const avg = card.current.avgPosition != null ? Math.round(card.current.avgPosition) : null;
  const prior = card.prior.avgPosition != null ? Math.round(card.prior.avgPosition) : null;
  const delta = card.avgPositionDelta != null ? Math.round(card.avgPositionDelta) : null;
  // Percentage improvement: (prior - current) / prior * 100
  const deltaPct = avg != null && prior != null && prior > 0
    ? Math.round(((prior - avg) / prior) * 100)
    : null;
  const improved = delta != null && delta > 0;
  const worsened = delta != null && delta < 0;
  const tone = improved ? '#1D9E75' : worsened ? '#D85A30' : '#5A7A8A';
  const arrow = improved ? '▲' : worsened ? '▼' : '';
  const displayLabel = labelOverride || card.label;
  const looksGeneric = /^Engine\s*\d+/i.test(card.label || '');
  const subLabel = looksGeneric ? null : card.longLabel;

  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 18px', borderLeft: `3px solid ${accent}`, minHeight: 110 }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {displayLabel}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <div style={{ fontSize: 34, fontWeight: 700, color: '#0B1C24', lineHeight: 1 }}>{avg ?? '—'}</div>
        {delta != null && delta !== 0 && (
          <div style={{ fontSize: 12, fontWeight: 600, color: tone, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{arrow}</span>
            <span>{Math.abs(delta)}</span>
            {deltaPct != null && deltaPct !== 0 && (
              <span style={{ opacity: 0.85 }}>({deltaPct > 0 ? '+' : ''}{deltaPct}%)</span>
            )}
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 8 }}>
        {card.current.rankingKeywords}/{card.current.totalKeywords} ranking{subLabel ? ` · ${subLabel}` : ''}
      </div>
    </div>
  );
}

function StandardEngineLockedCard({ label }: { label: string }) {
  const accent = '#2D9CDB';
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 18px', borderLeft: `3px solid ${accent}`, minHeight: 110, position: 'relative', opacity: 0.92 }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#5A7A8A', marginTop: 8 }}>Not tracked</div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6, lineHeight: 1.5 }}>
        Upgrade to unlock {label} insights — or enable this engine in SE Ranking project setup.
      </div>
    </div>
  );
}

function AiHeroCard({ card, canonicalLabel, canonicalType, gate }: {
  card: SeoHeroEngineCard | null;
  canonicalLabel: string;
  canonicalType: string;
  gate: 'available' | 'upgrade_growth' | 'upgrade_authority' | 'consulting_only';
}) {
  const isPerplexity = canonicalType === 'perplexity';
  const accent = isPerplexity ? '#20808D' : '#0C4A60';

  // When gated OR no card data, show a compact gated-state card.
  if (gate !== 'available' || !card) {
    const messageTop = gate === 'consulting_only'
      ? 'IA Consulting'
      : gate === 'upgrade_growth'
        ? 'Upgrade to Growth'
        : gate === 'upgrade_authority'
          ? 'Upgrade to Authority'
          : 'Not configured';
    const messageBody = gate === 'consulting_only'
      ? 'Perplexity tracking is handled through IA\u2019s consulting engagements — ask your strategist to enable it.'
      : gate === 'upgrade_growth'
        ? `Upgrade to unlock ${canonicalLabel} insights — Google AI Overviews and AI Mode are included with Growth and Authority tiers.`
        : gate === 'upgrade_authority'
          ? `Upgrade to unlock ${canonicalLabel} insights — included with the Authority tier.`
          : `Enable ${canonicalLabel} tracking in your SE Ranking project to see insights.`;

    return (
      <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 18px', borderLeft: `3px solid ${accent}`, minHeight: 110, position: 'relative', opacity: 0.92 }}>
        <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{canonicalLabel}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 8 }}>{messageTop}</div>
        <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6, lineHeight: 1.5 }}>{messageBody}</div>
      </div>
    );
  }

  // Available + data present
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 18px', borderLeft: `3px solid ${accent}`, minHeight: 110, position: 'relative' }}>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{canonicalLabel}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: accent, lineHeight: 1, marginTop: 6 }}>
        {card.placeholder ? '—' : (card.current.top10Count ?? 0)}
      </div>
      <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6 }}>
        {card.placeholder ? 'Mention tracking — stats syncing' : 'mentions'}
        {card.region && <><br />{card.region}</>}
      </div>
    </div>
  );
}

function HealthScoreStatCard({ score }: { score: number | null }) {
  const value = score ?? 0;
  const color = value >= 80 ? '#1D9E75' : value >= 50 ? '#EF6C33' : '#D85A30';
  const label = value >= 80 ? 'Strong' : value >= 50 ? 'Needs Attention' : 'At Risk';
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 16px', borderLeft: `3px solid ${color}`, minHeight: 110, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
          Audit Health <GlossaryIcon termKey="health_score" size={11} />
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{score ?? '—'}</div>
        <div style={{ fontSize: 10, color, marginTop: 2, fontWeight: 600 }}>{label}</div>
      </div>
      <div style={{ width: 60, height: 60 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={[{ name: 'Score', value }, { name: 'Rest', value: 100 - value }]} dataKey="value" innerRadius={18} outerRadius={28} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={color} />
              <Cell fill="#E2E8F0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function WidgetContainer({ title, subtitle, onSeeFull, seeFullLabel, children }: { title: string; subtitle?: string; onSeeFull: () => void; seeFullLabel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 22, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button
          onClick={onSeeFull}
          style={{ padding: '6px 14px', fontSize: 11, fontWeight: 600, background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}
        >
          {seeFullLabel} →
        </button>
      </div>
      {children}
    </div>
  );
}

/** Tiny Jumped/Dropped tabs — small, left-aligned, green/red colored. */
function SmallMoverTab({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone: 'up' | 'down' }) {
  const color = tone === 'up' ? '#1D9E75' : '#D85A30';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 8px',
        fontSize: 10,
        fontWeight: 600,
        background: active ? color : 'transparent',
        color: active ? '#fff' : color,
        border: `1px solid ${color}`,
        borderRadius: 3,
        cursor: 'pointer',
      }}
    >
      {label} ({count})
    </button>
  );
}

function MoversTable({ movers }: { movers: Array<{ keyword: string; currentPosition: number | null; positionChange: number; searchVolume: number }> }) {
  const rows = movers.slice(0, 5);
  if (rows.length === 0) {
    return <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: 14 }}>No movers in this period.</div>;
  }
  return (
    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
          <th style={{ textAlign: 'left', padding: '4px 2px', fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Keyword</th>
          <th style={{ textAlign: 'right', padding: '4px 2px', fontSize: 9, color: '#94A3B8' }}>Pos</th>
          <th style={{ textAlign: 'right', padding: '4px 2px', fontSize: 9, color: '#94A3B8' }}>Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m, i) => {
          const tone = m.positionChange > 0 ? '#1D9E75' : '#D85A30';
          return (
            <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: '5px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{m.keyword}</td>
              <td style={{ textAlign: 'right', padding: '5px 2px' }}>{m.currentPosition ?? '—'}</td>
              <td style={{ textAlign: 'right', padding: '5px 2px', fontWeight: 600, color: tone }}>
                {m.positionChange > 0 ? '+' : ''}{m.positionChange}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HealthScoreDonut({ score }: { score: number | null }) {
  const value = score ?? 0;
  const remainder = 100 - value;
  const color = value >= 80 ? '#1D9E75' : value >= 50 ? '#EF6C33' : '#D85A30';
  const label = value >= 80 ? 'Strong' : value >= 50 ? 'Needs Attention' : 'At Risk';
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 4, display: 'inline-flex', alignItems: 'center' }}>
        Health Score <GlossaryIcon termKey="health_score" size={11} />
      </div>
      <div style={{ width: '100%', height: 140, position: 'relative' }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={[{ name: 'Score', value }, { name: 'Rest', value: remainder }]} dataKey="value" innerRadius={40} outerRadius={60} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={color} />
              <Cell fill="#E2E8F0" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color }}>{score ?? '—'}</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>{label}</div>
        </div>
      </div>
    </div>
  );
}

function IssuesBarChart({ errors, warnings, notices }: { errors: number; warnings: number; notices: number }) {
  const data = [
    { name: 'Errors', value: errors, fill: '#D85A30' },
    { name: 'Warnings', value: warnings, fill: '#EF6C33' },
    { name: 'Notices', value: notices, fill: '#4285F4' },
  ];
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '14px 16px' }}>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>Issues Breakdown</div>
      <div style={{ width: '100%', height: 140 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 6 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} width={30} />
            <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CompetitorsMiniTable({ competitors }: { competitors: any[] }) {
  if (competitors.length === 0) {
    return <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 12 }}>No competitors tracked.</div>;
  }
  return (
    <div style={{ background: '#F8FAFC', borderRadius: 8, padding: '10px 12px' }}>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '4px 2px', fontSize: 9, color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Competitor</th>
            <th style={{ textAlign: 'right', padding: '4px 2px', fontSize: 9, color: '#94A3B8' }}>Domain Trust</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
              <td style={{ padding: '5px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{c.domain ?? '—'}</td>
              <td style={{ textAlign: 'right', padding: '5px 2px', fontWeight: 600 }}>{c.domainTrust ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Project Settings panel — sits above the engine cards. Surfaces the locked
 * search-engine model + quick-action buttons to the management pages.
 * Brandon's locked decision 2026-06-17: tenants never change engines.
 */
function ProjectSettingsCard({
  tier,
  standardCards,
  aiPromptsAvailable,
  onNavigate,
}: {
  tier: string;
  standardCards: Array<{ canonical: { id: string; label: string }; card: SeoHeroEngineCard | null }>;
  aiPromptsAvailable: boolean;
  onNavigate: (path: string) => void;
}) {
  const tierLabel = tier ? tier[0].toUpperCase() + tier.slice(1) : 'Not set';

  const getRegion = (engineId: string): string => {
    if (engineId === 'bing') return 'Nationwide · United States';
    const card = standardCards.find((sc) => sc.canonical.id === engineId)?.card;
    if (card?.region) return card.region;
    if (card?.longLabel && /,\s+[A-Z]{2}/.test(card.longLabel)) return card.longLabel;
    return 'Your service area';
  };

  const btnStyle: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: 11,
    fontWeight: 600,
    background: '#0B1C24',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  };
  const btnDisabledStyle: React.CSSProperties = {
    ...btnStyle,
    opacity: 0.55,
    cursor: 'not-allowed',
    background: '#5A7A8A',
  };

  const engines = [
    { id: 'google_desktop', label: 'Google Desktop' },
    { id: 'google_mobile', label: 'Google Mobile' },
    { id: 'bing', label: 'Bing' },
  ];

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 18,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24' }}>Project Settings</div>
        <div style={{
          fontSize: 10,
          fontWeight: 600,
          color: '#0C4A60',
          background: '#E8F1F4',
          padding: '4px 10px',
          borderRadius: 12,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}>
          {tierLabel} tier
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 18 }}>
        <div>
          <div style={{
            fontSize: 10,
            color: '#5A7A8A',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 600,
            marginBottom: 8,
          }}>
            Tracked Search Engines (locked)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {engines.map((e) => (
              <div key={e.id} style={{ fontSize: 12, color: '#0B1C24', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  background: '#2D9CDB',
                  borderRadius: '50%',
                  flexShrink: 0,
                }} />
                <strong>{e.label}</strong>
                <span style={{ color: '#5A7A8A' }}>· {getRegion(e.id)}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 10, lineHeight: 1.5 }}>
            Engine selection is fixed by IA so historical tracking stays consistent.
            To change your service area, contact your IA strategist.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{
            fontSize: 10,
            color: '#5A7A8A',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontWeight: 600,
            marginBottom: 2,
          }}>
            Manage your project
          </div>
          <button
            onClick={() => onNavigate('/app/services/arion_seo_keywords')}
            style={btnStyle}
          >
            <span>Keywords</span><span>→</span>
          </button>
          <button
            onClick={() => aiPromptsAvailable && onNavigate('/app/services/arion_seo_ai_prompts')}
            disabled={!aiPromptsAvailable}
            style={aiPromptsAvailable ? btnStyle : btnDisabledStyle}
            title={!aiPromptsAvailable ? 'Upgrade to Growth tier to manage AI prompts' : undefined}
          >
            <span>AI Prompts</span>
            <span>{aiPromptsAvailable ? '→' : '🔒'}</span>
          </button>
          <button
            onClick={() => onNavigate('/app/services/arion_seo_competitors')}
            style={btnStyle}
          >
            <span>Competitors</span><span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Weighted avg position using bucket midpoints. */
function weightedAvgPositionForDay(d: { top1: number; top2_3: number; top4_5: number; top6_10: number; top11_30: number; top31_100: number; notRanking: number }): number | null {
  const weights = [
    { n: d.top1 || 0, mid: 1 },
    { n: d.top2_3 || 0, mid: 2.5 },
    { n: d.top4_5 || 0, mid: 4.5 },
    { n: d.top6_10 || 0, mid: 8 },
    { n: d.top11_30 || 0, mid: 20 },
    { n: d.top31_100 || 0, mid: 65 },
  ];
  const total = weights.reduce((s, w) => s + w.n, 0);
  if (total === 0) return null;
  return Math.round((weights.reduce((s, w) => s + w.n * w.mid, 0) / total) * 10) / 10;
}

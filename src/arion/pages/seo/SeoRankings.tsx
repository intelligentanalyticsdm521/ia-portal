/**
 * Phase 3.5 Keyword Rankings — VISUAL SUMMARY.
 *
 * This is the primary view: hero cards, position distribution, jumped/dropped
 * visualizations, key metrics. The old full sortable/filterable table lives
 * behind a "See Full Details" button that opens it as a modal.
 * Per-keyword detail modal opens from either view.
 */
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar as RBar, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend, Cell } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, InfoCard, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import {
  SEO_RANGE_OPTIONS,
  SeoRangePicker,
  SeoFilterPills,
  SeoStatCard,
  SeoBucketCard,
  SeoPositionHistoryChart,
  POSITION_BUCKET_COLORS,
  POSITION_BUCKET_LABELS,
} from '../../components/SeoUi';
import { SeoDiagnosticPanel } from '../../components/SeoDiagnosticPanel';
import { GlossaryIcon, GlossaryPanel } from '../../components/Glossary';
import type { SeoRangeCode, SeoKeywordRecord, SeoRankingsResponse } from '../../../lib/arionApi';
import { canonicalEngineLabel } from '../../utils/engineLabel';

type SortKey = 'keyword' | 'currentPosition' | 'positionChange' | 'searchVolume' | 'cpc' | 'competition';

// Maps a consolidated engine-toggle value ('all' | 'google-desktop' |
// 'google-mobile' | 'bing') to the legacy (provider, device) pair the
// /arion/seo/rankings endpoint expects.
function engineFilterToParams(f: string): { provider: 'all' | 'google' | 'bing'; device: 'all' | 'desktop' | 'mobile' } {
  if (f === 'google-desktop') return { provider: 'google', device: 'desktop' };
  if (f === 'google-mobile')  return { provider: 'google', device: 'mobile' };
  if (f === 'bing')           return { provider: 'bing',   device: 'all' };
  return { provider: 'all', device: 'all' };
}

export function SeoRankings() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [range, setRange] = React.useState<SeoRangeCode>('30d');
  const [engineFilter, setEngineFilter] = React.useState<string>('all');
  const [selectedKeywordId, setSelectedKeywordId] = React.useState<number | null>(null);
  const [showFullDetails, setShowFullDetails] = React.useState(false);
  const [moversTab, setMoversTab] = React.useState<'jumped' | 'dropped' | 'unchanged'>('jumped');

  const { provider, device } = engineFilterToParams(engineFilter);
  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getSeoRankings(activeSiteId, { range, provider, device }) : Promise.resolve(null),
    [activeSiteId, range, provider, device]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const r = data as SeoRankingsResponse | null;
  const connected = r?.connected === true;
  const hasSeoAddon = selectedSite?.seoAddonTier != null;

  if (!connected && !hasSeoAddon) {
    return (
      <AddonUpsell
        title="SEO Tools — Add-on not active"
        description="Track keyword positions across Google, Bing, and AI search engines. Powered by SE Ranking."
        price="$29"
        planName="Starter"
      />
    );
  }

  const keywords: SeoKeywordRecord[] = r?.keywords || [];
  const stats = r?.stats?.current;
  const priorStats = r?.stats?.prior;
  const delta = r?.stats?.delta || {};
  const engineMeta = r?.engines?.metadata || [];
  const upstreamError = r?.upstreamError;

  // Consolidated engine toggle — canonical labels only (Brandon-locked 2026-06-28).
  // Customer-facing display is ALWAYS "Google - Desktop", "Google - Mobile", "Bing".
  // SE Ranking's internal engine ids / generic "Engine N" labels never reach the UI.
  // Engines we don't formally support (Yandex, DuckDuckGo, etc.) are filtered out.
  const standardEngines = (engineMeta as any[]).filter((e) => !e.isAi);
  function canonicalEngine(e: any): { value: string; label: string } | null {
    const name = String(e.name || '').toLowerCase();
    const type = String(e.type || '').toLowerCase();
    const label = String(e.label || '').toLowerCase();
    const device = String(e.device || '').toLowerCase();
    const isGoogle = name === 'google' || type === 'google' || /google/.test(label);
    const isBing = name === 'bing' || type === 'bing' || /bing/.test(label);
    if (isGoogle) {
      return device === 'mobile'
        ? { value: 'google-mobile', label: 'Google - Mobile' }
        : { value: 'google-desktop', label: 'Google - Desktop' };
    }
    if (isBing) return { value: 'bing', label: 'Bing' };
    return null;
  }
  const seenLabels = new Set<string>();
  const uniqueToggle = [
    { value: 'all', label: 'All' },
    ...standardEngines
      .map(canonicalEngine)
      .filter((o): o is { value: string; label: string } => !!o)
      .filter((o) => (seenLabels.has(o.value) ? false : (seenLabels.add(o.value), true))),
  ];

  // Top movers — sort by positionChange
  const sortedByChange = [...keywords].sort((a, b) => Number(b.positionChange || 0) - Number(a.positionChange || 0));
  const topJumped = sortedByChange.slice(0, 5).filter((k) => k.positionChange > 0);
  const topDropped = [...sortedByChange].reverse().slice(0, 5).filter((k) => k.positionChange < 0);

  // Jumped / Dropped / Unchanged counts for the movers visual
  const jumpedCount = keywords.filter((k) => Number(k.positionChange || 0) > 0).length;
  const droppedCount = keywords.filter((k) => Number(k.positionChange || 0) < 0).length;
  const unchangedCount = keywords.length - jumpedCount - droppedCount;

  // Bucket-level origin of jumped/dropped keywords (where they live NOW).
  // Tells the "of the 9 keywords that jumped, 1 is in Top 11-30 and 8 in Top 31-100" story.
  const bucketOfKeyword = (pos: number | null): keyof typeof POSITION_BUCKET_LABELS => {
    if (pos == null || pos <= 0) return 'notRanking';
    if (pos === 1) return 'top1';
    if (pos <= 3) return 'top2_3';
    if (pos <= 5) return 'top4_5';
    if (pos <= 10) return 'top6_10';
    if (pos <= 30) return 'top11_30';
    if (pos <= 100) return 'top31_100';
    return 'notRanking';
  };
  const moversByBucket = { jumped: {}, dropped: {}, unchanged: {} } as Record<'jumped' | 'dropped' | 'unchanged', Record<string, number>>;
  for (const k of keywords) {
    const bucket = bucketOfKeyword(k.currentPosition as any);
    const lane: 'jumped' | 'dropped' | 'unchanged' = Number(k.positionChange || 0) > 0 ? 'jumped' : Number(k.positionChange || 0) < 0 ? 'dropped' : 'unchanged';
    moversByBucket[lane][bucket] = (moversByBucket[lane][bucket] || 0) + 1;
  }

  // Sparklines for hero cards derived from distributionSeries (per-engine when toggled)
  const distribution = (r?.distributionSeries || []) as Array<any>;
  const topKeywordsList = [...keywords]
    .filter((k) => typeof k.currentPosition === 'number' && (k.currentPosition as number) > 0)
    .sort((a, b) => (a.currentPosition as number) - (b.currentPosition as number))
    .slice(0, 5);

  const rangeLabel = r?.range?.label || SEO_RANGE_OPTIONS.find((o) => o.code === range)?.label || 'Last 30 days';

  // Canonical-engine caveat — flag in UI if labels are falling back
  const canonicalFallback = engineMeta.some((e: any) => e.canonical);

  return (
    <div>
      {/* Filter + See Full Details bar — consolidated engine picker (matches Overview) */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <SeoRangePicker value={range} onChange={setRange} />
        <span title="Provider = Google, Bing, or Mobile (Google Mobile search results tracked separately from Desktop)" style={{ display: 'inline-flex', alignItems: 'center' }}>
          <SeoFilterPills label="Provider" options={uniqueToggle} value={engineFilter} onChange={setEngineFilter} />
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setShowFullDetails(true)}
            style={{
              padding: '8px 16px',
              fontSize: 12,
              fontWeight: 600,
              background: '#0B1C24',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            See Full Details →
          </button>
        </div>
      </div>

      {upstreamError && (
        <ErrorBanner message={`SE Ranking returned an error. ${upstreamError.keyConfigured === false ? 'Project API key is missing on the server. ' : ''}${upstreamError.positions || ''}`} />
      )}

      {connected && !upstreamError && (
        <InfoCard title="SE Ranking — Connected">
          <p style={{ margin: 0, fontSize: 12 }}>
            <strong>{stats?.totalKeywords || 0}</strong> tracked keywords · <strong>{stats?.rankingKeywords || 0}</strong> ranking · <strong>{engineMeta.length || r?.engines?.availableIds?.length || 0}</strong> engines · <strong>{rangeLabel}</strong>
            {canonicalFallback && (
              <span title="SE Ranking does not expose per-engine metadata via API. Engine labels are canonical (Google Desktop / Mobile, Bing Desktop / Mobile) based on tier configuration. Confirm during onboarding." style={{ marginLeft: 10, fontSize: 11, color: '#D4A800', cursor: 'help' }}>
                ⓘ canonical labels
              </span>
            )}
          </p>
        </InfoCard>
      )}

      {/* Row 1: 4 Hero stat cards with sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
        <SeoStatCard
          termKey="avg_position"
          label="Avg Position"
          value={stats?.avgPosition != null ? String(Math.round(stats.avgPosition)) : '—'}
          sub={`of ${stats?.rankingKeywords || 0} ranking keywords`}
          delta={delta.avgPosition != null ? -Number(delta.avgPosition) : null}
          deltaIsGoodWhenPositive={true}
          deltaFormat="position"
          accent="#2D9CDB"
          sparklineData={distribution.map((d: any) => ({ date: d.date, value: weightedAvgPosForDay(d) })).filter((p) => p.value != null) as any}
          sparklineColor="#2D9CDB"
        />
        <SeoStatCard
          termKey="search_visibility"
          label="Search Visibility"
          value={stats?.visibilityScore != null ? `${stats.visibilityScore}%` : '—'}
          sub="CTR-weighted, all tracked"
          delta={delta.visibilityScore != null ? Number(delta.visibilityScore) : null}
          deltaIsGoodWhenPositive={true}
          deltaFormat="percentage"
          accent="#1D9E75"
          sparklineData={distribution.map((d: any) => ({
            date: d.date,
            value: Math.round(((d.top1 || 0) * 0.27 + (d.top2_3 || 0) * 0.13 + (d.top4_5 || 0) * 0.075 + (d.top6_10 || 0) * 0.03) * 100) / 100,
          }))}
          sparklineColor="#1D9E75"
        />
        <SeoStatCard
          termKey="top10_keywords"
          label="Top 10 Keywords"
          value={stats?.top10Count || 0}
          sub={`of ${stats?.totalKeywords || 0} total`}
          delta={delta.top10Count != null ? Number(delta.top10Count) : null}
          deltaIsGoodWhenPositive={true}
          accent="#EF6C33"
          sparklineData={distribution.map((d: any) => ({ date: d.date, value: (d.top1 || 0) + (d.top2_3 || 0) + (d.top4_5 || 0) + (d.top6_10 || 0) }))}
          sparklineColor="#EF6C33"
        />
        <SeoStatCard
          termKey="traffic_forecast"
          label="Traffic Forecast"
          value={stats?.trafficForecast != null ? `~${stats.trafficForecast}` : '—'}
          sub="Est. clicks/month"
          delta={delta.trafficForecast != null ? Number(delta.trafficForecast) : null}
          deltaIsGoodWhenPositive={true}
          accent="#FEC82C"
          sparklineData={distribution.map((d: any) => ({
            date: d.date,
            value: Math.round((d.top1 || 0) * 0.27 + (d.top2_3 || 0) * 0.13 + (d.top4_5 || 0) * 0.075),
          }))}
          sparklineColor="#FEC82C"
        />
      </div>

      {/* Row 2: Distribution of top positions — mini cards + big stacked area chart */}
      <div style={{ marginTop: 22, marginBottom: 10, fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', display: 'inline-flex', alignItems: 'center' }}>
        Distribution of top positions
        <GlossaryIcon termKey="position" size={12} />
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 18 }}>
          {/* Left column: 7 bucket cards (incl. Not Ranking) with mini trend lines */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {(['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100', 'notRanking'] as const).map((bk) => {
              const curCount = stats?.buckets?.[bk] || 0;
              const priorCount = priorStats?.buckets?.[bk] || 0;
              const trend = distribution.map((d: any) => ({ date: d.date, value: d[bk] || 0 }));
              return (
                <SeoStatCard
                  key={bk}
                  label={POSITION_BUCKET_LABELS[bk]}
                  value={curCount}
                  delta={curCount - priorCount}
                  deltaFormat="signed"
                  deltaIsGoodWhenPositive={bk !== 'notRanking'}
                  sparklineData={trend}
                  sparklineColor={POSITION_BUCKET_COLORS[bk]}
                  accent={POSITION_BUCKET_COLORS[bk]}
                />
              );
            })}
          </div>
          {/* Right column: line chart — 6 ranking buckets (Not Ranking excluded —
              dominates the scale and masks bucket movement). */}
          <div style={{ height: 280 }}>
            {distribution.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={distribution} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.08)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} tickFormatter={shortDate} />
                  <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} width={32} />
                  <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  {(['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100'] as const).map((bk) => (
                    <Line key={bk} type="monotone" dataKey={bk} stroke={POSITION_BUCKET_COLORS[bk]} strokeWidth={1.75} dot={false} name={POSITION_BUCKET_LABELS[bk]} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 12 }}>
                Not enough daily data to draw the trend yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Keyword movement — tabs + horizontal share bar + bucket-level breakdown */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', marginTop: 22, marginBottom: 10 }}>
        Keyword movement this period
      </div>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
        {/* Stacked share bar — constrained to 40% max width so it doesn't dominate */}
        <div style={{ maxWidth: '40%', minWidth: 320 }}>
          <MovementShareBar jumped={jumpedCount} dropped={droppedCount} unchanged={unchangedCount} total={keywords.length} />
        </div>

        {/* Three columns — bucket origin of each lane */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 14 }}>
          <MoverLane title="Jumped" lane="jumped" count={jumpedCount} buckets={moversByBucket.jumped} total={keywords.length} color="#1D9E75" topList={topJumped} onSelect={(id) => setSelectedKeywordId(id)} />
          <MoverLane title="Dropped" lane="dropped" count={droppedCount} buckets={moversByBucket.dropped} total={keywords.length} color="#D85A30" topList={topDropped} onSelect={(id) => setSelectedKeywordId(id)} />
          <MoverLane
            title="Unchanged"
            lane="unchanged"
            count={unchangedCount}
            buckets={moversByBucket.unchanged}
            total={keywords.length}
            color="#5A7A8A"
            topList={topKeywordsList}
            onSelect={(id) => setSelectedKeywordId(id)}
            narrative="These keywords held their position this period. Stable rankings are a signal your baseline SEO is working. Focus the next content cycle on movers."
          />
        </div>
      </div>

      {/* Row 4: Keyword overview — 3-column Top / Jumped / Dropped */}
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary, #0B1C24)', marginTop: 22, marginBottom: 10 }}>
        Keyword overview
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KeywordOverviewColumn title="Top Keywords" count={topKeywordsList.length} list={topKeywordsList} tone="neutral" onSelect={(id) => setSelectedKeywordId(id)} />
        <KeywordOverviewColumn title="Jumped" count={jumpedCount} list={topJumped} tone="up" onSelect={(id) => setSelectedKeywordId(id)} />
        <KeywordOverviewColumn title="Dropped" count={droppedCount} list={topDropped} tone="down" onSelect={(id) => setSelectedKeywordId(id)} />
      </div>

      {/* Row 4: Position-distribution share (visual of where your keywords live) */}
      {stats && (
        <Card title="Ranking health at a glance" style={{ marginBottom: 16 }}>
          <div style={{ height: 260, paddingTop: 4 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: 'Top 1', value: stats.buckets.top1, color: POSITION_BUCKET_COLORS.top1 },
                  { name: 'Top 2–3', value: stats.buckets.top2_3, color: POSITION_BUCKET_COLORS.top2_3 },
                  { name: 'Top 4–5', value: stats.buckets.top4_5, color: POSITION_BUCKET_COLORS.top4_5 },
                  { name: 'Top 6–10', value: stats.buckets.top6_10, color: POSITION_BUCKET_COLORS.top6_10 },
                  { name: 'Top 11–30', value: stats.buckets.top11_30, color: POSITION_BUCKET_COLORS.top11_30 },
                  { name: 'Top 31–100', value: stats.buckets.top31_100, color: POSITION_BUCKET_COLORS.top31_100 },
                  { name: 'Not Ranking', value: stats.buckets.notRanking, color: POSITION_BUCKET_COLORS.notRanking },
                ]}
                layout="vertical"
                margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
                barCategoryGap={6}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#5A7A8A' }} width={110} tickLine={false} axisLine={false} />
                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <RBar dataKey="value" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, fill: '#0B1C24', fontWeight: 600 }}>
                  {(['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100', 'notRanking'] as const).map((bk, i) => (
                    <Cell key={i} fill={POSITION_BUCKET_COLORS[bk]} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Pages — URL × keyword aggregation */}
      <div style={{ marginTop: 22 }}>
        <PagesWidget keywords={keywords} onSelectKeyword={(id) => setSelectedKeywordId(id)} />
      </div>

      {/* Diagnostic panel */}
      <SeoDiagnosticPanel siteId={activeSiteId ?? null} />

      <ConsultingUpsell
        headline="These rankings are your growth roadmap. IA builds a 90-day plan to reach page 1."
        subtext="Our SEO strategists analyze your keyword landscape and build a custom plan."
        serviceType="SEO Strategy"
        triggerPage="seo-rankings"
      />

      {/* Keyword detail modal */}
      {selectedKeywordId != null && activeSiteId && (
        <SeoKeywordDetailModal
          siteId={activeSiteId}
          keywordId={selectedKeywordId}
          onClose={() => setSelectedKeywordId(null)}
        />
      )}

      {/* Full-details modal (the sortable/filterable table) */}
      {showFullDetails && (
        <SeoFullRankingsModal
          data={r!}
          onClose={() => setShowFullDetails(false)}
          onSelectKeyword={(id) => setSelectedKeywordId(id)}
        />
      )}
    </div>
  );
}

/* ───────── Pages Widget — URL × keyword aggregation ───────── */

type PageRow = {
  url: string;
  keywordCount: number;
  top10Count: number;
  avgPosition: number | null;
  trafficForecast: number;
  jumped: number;
  dropped: number;
  keywords: SeoKeywordRecord[];
};

function ctrForPosition(p: number | null): number {
  if (!p || p <= 0) return 0;
  const table = [0.27, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02];
  if (p <= 10) return table[p - 1];
  if (p <= 30) return Math.max(0.005, 0.02 - (p - 10) * 0.001);
  return 0.005;
}

function PagesWidget({ keywords, onSelectKeyword }: { keywords: SeoKeywordRecord[]; onSelectKeyword: (id: number) => void }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'jumped' | 'dropped' | 'top'>('all');
  const [sortKey, setSortKey] = React.useState<'traffic' | 'keywords' | 'position' | 'top10'>('traffic');
  const [selectedUrl, setSelectedUrl] = React.useState<string | null>(null);

  const pages: PageRow[] = React.useMemo(() => {
    const byUrl = new Map<string, PageRow>();
    for (const k of keywords) {
      const url = k.url || '(unranked or unknown URL)';
      const ex: PageRow = byUrl.get(url) || { url, keywordCount: 0, top10Count: 0, avgPosition: null, trafficForecast: 0, jumped: 0, dropped: 0, keywords: [] };
      ex.keywordCount++;
      ex.keywords.push(k);
      if (k.currentPosition != null && k.currentPosition > 0 && k.currentPosition <= 10) ex.top10Count++;
      if (k.positionChange > 0) ex.jumped++;
      else if (k.positionChange < 0) ex.dropped++;
      ex.trafficForecast += (k.searchVolume || 0) * ctrForPosition(k.currentPosition);
      byUrl.set(url, ex);
    }
    // compute avg position per page from ranking keywords only
    for (const p of byUrl.values()) {
      const ranked = p.keywords.filter((k) => k.currentPosition != null && k.currentPosition > 0);
      p.avgPosition = ranked.length
        ? Math.round(ranked.reduce((s, k) => s + (k.currentPosition || 0), 0) / ranked.length)
        : null;
      p.trafficForecast = Math.round(p.trafficForecast);
    }
    return Array.from(byUrl.values());
  }, [keywords]);

  const filtered = pages.filter((p) => {
    if (search && !p.url.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'top' && p.top10Count === 0) return false;
    if (filter === 'jumped' && p.jumped === 0) return false;
    if (filter === 'dropped' && p.dropped === 0) return false;
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'keywords') return b.keywordCount - a.keywordCount;
    if (sortKey === 'position') return (a.avgPosition ?? 999) - (b.avgPosition ?? 999);
    if (sortKey === 'top10') return b.top10Count - a.top10Count;
    return b.trafficForecast - a.trafficForecast;
  });

  const topPages = sorted.slice(0, 30);
  const selected = selectedUrl ? pages.find((p) => p.url === selectedUrl) : null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24' }}>Pages</div>
          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>
            Your landing URLs by ranking performance — avg position, top-10 count, and traffic forecast per page
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#5A7A8A' }}>{pages.length} unique page{pages.length === 1 ? '' : 's'} tracked</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search URL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4, width: 260 }}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="all">All pages</option>
          <option value="top">Top 10 (has page-1 keywords)</option>
          <option value="jumped">Jumped (gained ground)</option>
          <option value="dropped">Dropped (lost ground)</option>
        </select>
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as any)} style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4 }}>
          <option value="traffic">Sort: Traffic forecast</option>
          <option value="keywords">Sort: Keyword count</option>
          <option value="top10">Sort: Top-10 count</option>
          <option value="position">Sort: Avg position</option>
        </select>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#5A7A8A', alignSelf: 'center' }}>
          Showing top {topPages.length} of {sorted.length}
        </div>
      </div>

      {pages.length === 0 ? (
        <div style={{ padding: 16, background: '#F8FAFC', borderRadius: 6, textAlign: 'center', color: '#94A3B8', fontSize: 11 }}>
          Landing URL data appears once SE Ranking records positions with URL attribution. Fresh projects typically populate within 24 hours.
        </div>
      ) : (
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>URL</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Keywords</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Top 10</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Avg Pos</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Traffic Forecast</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>↑ / ↓</th>
              <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {topPages.map((p) => (
              <tr key={p.url} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '8px 6px', maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.url.startsWith('http') ? (
                    <a href={p.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{p.url}</a>
                  ) : (
                    <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>{p.url}</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{p.keywordCount}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600, color: p.top10Count > 0 ? '#1D9E75' : '#94A3B8' }}>{p.top10Count}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px' }}>{p.avgPosition ?? '—'}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600 }}>{p.trafficForecast.toLocaleString()}</td>
                <td style={{ textAlign: 'right', padding: '8px 6px', fontSize: 11 }}>
                  <span style={{ color: '#1D9E75' }}>↑{p.jumped}</span> <span style={{ color: '#D85A30', marginLeft: 6 }}>↓{p.dropped}</span>
                </td>
                <td style={{ textAlign: 'right', padding: '8px 6px' }}>
                  <button onClick={() => setSelectedUrl(p.url)} style={{ fontSize: 10, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: '1px solid #2D9CDB', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                    View →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {selected && (
        <PageDetailModal page={selected} onClose={() => setSelectedUrl(null)} onSelectKeyword={(id) => { setSelectedUrl(null); onSelectKeyword(id); }} />
      )}
    </div>
  );
}

function PageDetailModal({ page, onClose, onSelectKeyword }: { page: PageRow; onClose: () => void; onSelectKeyword: (id: number) => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, width: '94vw', maxWidth: 1000, maxHeight: '88vh', display: 'flex', flexDirection: 'column', minHeight: 0 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Page Detail</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1C24', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {page.url.startsWith('http') ? <a href={page.url} target="_blank" rel="noreferrer" style={{ color: '#2D9CDB', textDecoration: 'none' }}>{page.url}</a> : page.url}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 6px', marginLeft: 12 }}>&times;</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
            <PageMetric label="Keywords" value={page.keywordCount} accent="#2D9CDB" />
            <PageMetric label="Top 10" value={page.top10Count} accent="#1D9E75" />
            <PageMetric label="Avg Position" value={page.avgPosition ?? '—'} accent="#EF6C33" />
            <PageMetric label="Traffic Forecast" value={page.trafficForecast.toLocaleString()} accent="#7B61FF" />
            <PageMetric label="Movement" value={`↑${page.jumped} ↓${page.dropped}`} accent="#5A7A8A" />
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>All keywords ranking to this page</div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#F8FAFC' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Keyword</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Position</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Change</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}>Volume</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', fontSize: 10, color: '#5A7A8A', fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {[...page.keywords].sort((a, b) => (a.currentPosition ?? 999) - (b.currentPosition ?? 999)).map((k) => {
                const chColor = k.positionChange > 0 ? '#1D9E75' : k.positionChange < 0 ? '#D85A30' : '#5A7A8A';
                return (
                  <tr key={k.keywordId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 6px', fontWeight: 500 }}>{k.keyword}</td>
                    <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600, color: k.currentPosition && k.currentPosition <= 10 ? '#1D9E75' : '#0B1C24' }}>
                      {k.currentPosition != null && k.currentPosition > 0 ? `#${k.currentPosition}` : 'Not ranking'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: 600, color: chColor }}>
                      {k.positionChange > 0 ? `+${k.positionChange}` : k.positionChange < 0 ? k.positionChange : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '8px 6px' }}>{k.searchVolume > 0 ? k.searchVolume.toLocaleString() : '—'}</td>
                    <td style={{ textAlign: 'right', padding: '8px 6px' }}>
                      <button onClick={() => onSelectKeyword(k.keywordId)} style={{ fontSize: 10, fontWeight: 600, background: 'transparent', color: '#2D9CDB', border: '1px solid #2D9CDB', borderRadius: 4, padding: '3px 8px', cursor: 'pointer' }}>
                        Detail →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PageMetric({ label, value, accent }: { label: string; value: React.ReactNode; accent: string }) {
  return (
    <div style={{ background: '#F8FAFC', borderLeft: `3px solid ${accent}`, borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 4 }}>{value}</div>
    </div>
  );
}

/* ───────── Helpers for new sections (2026-04-19 enhancements) ───────── */

function shortDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weightedAvgPosForDay(d: { top1: number; top2_3: number; top4_5: number; top6_10: number; top11_30: number; top31_100: number }): number | null {
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

function MovementShareBar({ jumped, dropped, unchanged, total }: { jumped: number; dropped: number; unchanged: number; total: number }) {
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
  return (
    <div>
      <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginBottom: 6 }}>
        Keywords in SERP — {total} tracked
      </div>
      <div style={{ display: 'flex', height: 12, borderRadius: 4, overflow: 'hidden', background: '#e2e8f0', marginBottom: 8 }}>
        <div style={{ width: `${pct(jumped)}%`, background: '#1D9E75' }} />
        <div style={{ width: `${pct(dropped)}%`, background: '#D85A30' }} />
        <div style={{ width: `${pct(unchanged)}%`, background: '#94A3B8' }} />
      </div>
      <div style={{ display: 'flex', gap: 18, fontSize: 11, color: '#5A7A8A' }}>
        <LegendDot color="#1D9E75" label={`Jumped ${jumped} (${pct(jumped).toFixed(1)}%)`} />
        <LegendDot color="#D85A30" label={`Dropped ${dropped} (${pct(dropped).toFixed(1)}%)`} />
        <LegendDot color="#94A3B8" label={`Unchanged ${unchanged} (${pct(unchanged).toFixed(1)}%)`} />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
      {label}
    </span>
  );
}

function MoverLane({
  title, lane, count, buckets, total, color, topList, onSelect, narrative,
}: {
  title: string;
  lane: 'jumped' | 'dropped' | 'unchanged';
  count: number;
  buckets: Record<string, number>;
  total: number;
  color: string;
  topList: SeoKeywordRecord[];
  onSelect: (id: number) => void;
  narrative?: string;
}) {
  const bucketOrder = ['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100', 'notRanking'] as const;
  const maxBucket = Math.max(1, ...Object.values(buckets));
  const pctOfTotal = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div style={{ background: '#F8FAFC', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1C24', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {title} ({count}) <span style={{ color: '#94A3B8', fontWeight: 400 }}>· {pctOfTotal}% of tracked</span>
        </div>
      </div>
      {narrative && (
        <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.5, marginBottom: 10, fontStyle: 'italic' }}>
          {narrative}
        </div>
      )}
      {/* Bucket breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
        {bucketOrder.map((bk) => {
          const n = buckets[bk] || 0;
          if (n === 0 && lane !== 'unchanged') return null; // hide zero rows on jumped/dropped
          const pct = count > 0 ? (n / count) * 100 : 0;
          return (
            <div key={bk} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
              <span style={{ width: 56, color: '#5A7A8A' }}>{POSITION_BUCKET_LABELS[bk]}</span>
              <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${(n / maxBucket) * 100}%`, height: '100%', background: color }} />
              </div>
              <span style={{ width: 54, textAlign: 'right', color: '#0B1C24', fontWeight: 600 }}>{n} ({pct.toFixed(0)}%)</span>
            </div>
          );
        })}
      </div>
      {/* Top 3 in this lane */}
      {topList.length > 0 && (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 600, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }}>
            Top {lane === 'unchanged' ? 'stable' : lane === 'jumped' ? 'gains' : 'drops'}
          </div>
          {topList.slice(0, 3).map((m) => (
            <button
              key={m.keywordId}
              onClick={() => onSelect(m.keywordId)}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '3px 0', fontSize: 11, background: 'transparent', border: 'none', cursor: 'pointer', color: '#0B1C24' }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160, textAlign: 'left' }}>{m.keyword}</span>
              <span style={{ color, fontWeight: 600, flexShrink: 0 }}>
                {m.positionChange > 0 ? `▲ ${m.positionChange}` : m.positionChange < 0 ? `▼ ${Math.abs(m.positionChange)}` : `#${m.currentPosition ?? '—'}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeywordOverviewColumn({
  title, count, list, tone, onSelect,
}: {
  title: string;
  count: number;
  list: SeoKeywordRecord[];
  tone: 'up' | 'down' | 'neutral';
  onSelect: (id: number) => void;
}) {
  const color = tone === 'up' ? '#1D9E75' : tone === 'down' ? '#D85A30' : '#2D9CDB';
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#0B1C24', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {title} ({count})
      </div>
      <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <th style={{ textAlign: 'left', padding: '4px 2px', fontSize: 9, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Keyword</th>
            <th style={{ textAlign: 'right', padding: '4px 2px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Pos</th>
            <th style={{ textAlign: 'right', padding: '4px 2px', fontSize: 9, color: '#94A3B8', fontWeight: 600 }}>Vol</th>
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? (
            <tr><td colSpan={3} style={{ textAlign: 'center', padding: 8, color: '#94A3B8', fontSize: 11 }}>None in this period.</td></tr>
          ) : list.slice(0, 5).map((k) => (
            <tr key={k.keywordId} style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }} onClick={() => onSelect(k.keywordId)}>
              <td style={{ padding: '5px 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{k.keyword}</td>
              <td style={{ textAlign: 'right', padding: '5px 2px' }}>
                {k.currentPosition ?? '—'}
                {k.positionChange !== 0 && (
                  <span style={{ color, fontSize: 9, marginLeft: 3 }}>
                    {k.positionChange > 0 ? `▲${k.positionChange}` : `▼${Math.abs(k.positionChange)}`}
                  </span>
                )}
              </td>
              <td style={{ textAlign: 'right', padding: '5px 2px', color: '#5A7A8A' }}>{k.searchVolume ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────── Mover card (Jumped / Dropped) ───────── */

function MoverCard({
  title,
  count,
  total,
  color,
  bg,
  movers,
  direction,
}: {
  title: string;
  count: number;
  total: number;
  color: string;
  bg: string;
  movers: SeoKeywordRecord[];
  direction: 'up' | 'down';
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const arrow = direction === 'up' ? '▲' : '▼';
  return (
    <div style={{ background: bg, borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '16px 18px', minHeight: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color, marginTop: 2 }}>{count}</div>
          <div style={{ fontSize: 11, color: '#5A7A8A' }}>{pct}% of tracked keywords</div>
        </div>
        <div style={{ fontSize: 24, color, opacity: 0.3 }}>{arrow}</div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, marginTop: 4 }}>
        Top {direction === 'up' ? 'gains' : 'drops'}
      </div>
      {movers.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', padding: '4px 0' }}>
          None this period
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {movers.slice(0, 3).map((m) => (
            <div key={m.keywordId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
              <span style={{ color: '#0B1C24', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{m.keyword}</span>
              <span style={{ color, fontWeight: 600, flexShrink: 0 }}>
                {direction === 'up' ? `▲ ${m.positionChange}` : `▼ ${Math.abs(m.positionChange)}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UnchangedCard({ count, total }: { count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ background: 'rgba(90,122,138,0.06)', borderLeft: `3px solid #5A7A8A`, borderRadius: 8, padding: '16px 18px', minHeight: 200 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Unchanged</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#5A7A8A', marginTop: 2 }}>{count}</div>
          <div style={{ fontSize: 11, color: '#5A7A8A' }}>{pct}% of tracked keywords</div>
        </div>
        <div style={{ fontSize: 24, color: '#5A7A8A', opacity: 0.3 }}>—</div>
      </div>
      <div style={{ fontSize: 11, color: '#5A7A8A', lineHeight: 1.5, marginTop: 14 }}>
        These keywords held their position this period. Stable rankings are a signal your baseline SEO is working. Focus the next content cycle on movers.
      </div>
    </div>
  );
}

/* ───────── Full details modal (the detailed sortable table) ───────── */

function SeoFullRankingsModal({
  data,
  onClose,
  onSelectKeyword,
}: {
  data: SeoRankingsResponse;
  onClose: () => void;
  onSelectKeyword: (id: number) => void;
}) {
  const [sortKey, setSortKey] = React.useState<SortKey>('currentPosition');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [showUnranked, setShowUnranked] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const keywords: SeoKeywordRecord[] = data?.keywords || [];

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'searchVolume' || k === 'cpc' || k === 'competition' ? 'desc' : 'asc'); }
  };

  const q = search.trim().toLowerCase();
  const filtered = keywords.filter((k) => {
    if (!showUnranked && (typeof k.currentPosition !== 'number' || k.currentPosition <= 0)) return false;
    if (q && !(k.keyword || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const displayed = filtered.slice().sort((a, b) => {
    const av = sortValue(a, sortKey);
    const bv = sortValue(b, sortKey);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return 0;
    return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av < bv ? 1 : -1);
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, maxWidth: 1200, width: '94vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Keyword Rankings — Full Details</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>{keywords.length} tracked keywords · {data.range.label}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
        </div>

        <div style={{ padding: '12px 24px', borderBottom: '1px solid #eef2f5', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search keywords…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #d5e0e8', borderRadius: 4, width: 220 }}
          />
          <label style={{ fontSize: 11, color: '#5A7A8A', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={showUnranked} onChange={(e) => setShowUnranked(e.target.checked)} />
            Show unranked
          </label>
          <span style={{ fontSize: 11, color: '#5A7A8A', marginLeft: 'auto' }}>
            {displayed.length} shown
          </span>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '0 24px 20px' }}>
          <GlossaryPanel
            termKeys={['position', 'change', 'volume', 'cpc', 'competition', 'engines']}
            title="What do these columns mean?"
          />
          <table className="data-table" style={{ fontSize: 12, width: '100%', marginTop: 16 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <tr>
                <Th label="Keyword" k="keyword" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Position" k="currentPosition" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" termKey="position" />
                <Th label="Change" k="positionChange" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" termKey="change" />
                <Th label="Volume" k="searchVolume" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" termKey="volume" />
                <Th label="CPC" k="cpc" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" termKey="cpc" />
                <Th label="Competition" k="competition" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" termKey="competition" />
                <th style={{ textAlign: 'center', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase', padding: '8px 6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    Engines
                    <GlossaryIcon termKey="engines" />
                  </span>
                </th>
                <th style={{ textAlign: 'right', fontSize: 10, color: '#5A7A8A', fontWeight: 600, padding: '8px 6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: '#5A7A8A', padding: 20 }}>No keywords match your filters.</td></tr>
              ) : displayed.map((k) => {
                const change = Number(k.positionChange || 0);
                const changeColor = change > 0 ? '#1D9E75' : change < 0 ? '#D85A30' : '#5A7A8A';
                const notRankingCount = (k.enginesNotRanking || []).length;
                const tooltip = notRankingCount > 0
                  ? 'Not ranking on: ' + k.enginesNotRanking.map((e) => e.engineLabel).join(', ')
                  : '';
                return (
                  <tr key={k.keywordId} style={{ cursor: 'pointer' }} onClick={() => onSelectKeyword(k.keywordId)}>
                    <td style={{ fontWeight: 500 }}>{k.keyword || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {k.currentPosition == null ? <span style={{ color: '#94A3B8', fontWeight: 400 }}>Not ranking</span> : k.currentPosition}
                    </td>
                    <td style={{ textAlign: 'right', color: changeColor, fontWeight: change !== 0 ? 600 : 400 }}>
                      {change === 0 ? '—' : change > 0 ? `▲ ${change}` : `▼ ${Math.abs(change)}`}
                    </td>
                    <td style={{ textAlign: 'right' }}>{k.searchVolume ? formatNum(k.searchVolume) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{k.cpc ? `$${Number(k.cpc).toFixed(2)}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{k.competition ? `${Math.round(Number(k.competition) * 100)}%` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span title={tooltip} style={{ fontSize: 10, color: '#5A7A8A', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: tooltip ? 'help' : 'default' }}>
                        <span style={{ color: '#1D9E75' }}>●</span> {k.rankingEngineCount} / {k.engineCount}
                        {notRankingCount > 0 && <span style={{ color: '#94A3B8', fontSize: 11 }}>ⓘ</span>}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectKeyword(k.keywordId); }}
                        style={{ fontSize: 11, padding: '4px 10px', background: 'transparent', color: '#2D9CDB', border: '1px solid #2D9CDB', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Th({ label, k, sortKey, sortDir, onClick, align = 'left', termKey }: { label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc'; onClick: (k: SortKey) => void; align?: 'left' | 'right'; termKey?: string }) {
  const active = sortKey === k;
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 10,
        color: active ? '#2D9CDB' : '#5A7A8A',
        fontWeight: 600,
        textTransform: 'uppercase',
        padding: '8px 6px',
        userSelect: 'none',
        background: '#fff',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start', width: '100%', gap: 2 }}>
        <span onClick={() => onClick(k)} style={{ cursor: 'pointer' }}>
          {label} {active && (sortDir === 'asc' ? '▲' : '▼')}
        </span>
        {termKey && <GlossaryIcon termKey={termKey} />}
      </span>
    </th>
  );
}

function sortValue(k: SeoKeywordRecord, key: SortKey): any {
  switch (key) {
    case 'keyword': return (k.keyword || '').toLowerCase();
    case 'currentPosition': return k.currentPosition;
    case 'positionChange': return k.positionChange;
    case 'searchVolume': return k.searchVolume;
    case 'cpc': return k.cpc;
    case 'competition': return k.competition;
  }
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/* ───────── Keyword detail modal (unchanged from previous version) ───────── */

function SeoKeywordDetailModal({ siteId, keywordId, onClose }: { siteId: string; keywordId: number; onClose: () => void }) {
  const { arionApi } = useArionContext();
  const [range, setRange] = React.useState<SeoRangeCode>('90d');
  const { data, loading } = useArionData(
    () => arionApi.getSeoKeywordDetail(siteId, keywordId, range),
    [siteId, keywordId, range]
  );

  const record = (data as any)?.keyword as SeoKeywordRecord | undefined;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, maxWidth: 960, width: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.5 }}>Keyword Detail</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0B1C24', marginTop: 2 }}>{record?.keyword || 'Loading…'}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SeoRangePicker value={range} onChange={setRange} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#999', padding: '0 4px' }}>&times;</button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
          {loading && !record && <Loading />}
          {record && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                <SeoStatCard label="Avg Position" value={record.currentPosition != null ? String(Math.round(record.currentPosition)) : 'Not ranking'} accent="#2D9CDB" />
                <SeoStatCard label="Ranking On" value={`${record.rankingEngineCount} / ${record.engineCount}`} sub="search engines" accent="#1D9E75" />
                <SeoStatCard label="Search Volume" value={record.searchVolume ? formatNum(record.searchVolume) : '—'} sub="monthly searches" accent="#FEC82C" />
                <SeoStatCard label="CPC" value={record.cpc ? `$${Number(record.cpc).toFixed(2)}` : '—'} sub="Google Ads benchmark" accent="#EF6C33" />
              </div>

              <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 10 }}>Position over time by search engine</div>
              <div style={{ display: 'grid', gap: 14 }}>
                {record.perEngine.map((e, i) => {
                  const palette = ['#2D9CDB', '#EF6C33', 'rgba(12,74,96,0.8)', '#FEC82C', '#E64A28', '#1D9E75'];
                  const color = palette[i % palette.length];
                  return (
                    <div key={e.engineId} style={{ border: '1px solid #eef2f5', borderRadius: 8, padding: '12px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24' }}>{canonicalEngineLabel(e)}</div>
                          <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 2 }}>
                            Ranked {e.rankingDays} of {e.rangeDays} days ({e.rankingDaysPct}%)
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: e.currentPosition != null ? color : '#94A3B8' }}>
                            {e.currentPosition != null ? `#${e.currentPosition}` : 'Not ranking'}
                          </div>
                          {e.positionChange !== 0 && (
                            <div style={{ fontSize: 11, color: e.positionChange > 0 ? '#1D9E75' : '#D85A30', fontWeight: 600 }}>
                              {e.positionChange > 0 ? '▲' : '▼'} {Math.abs(e.positionChange)}
                            </div>
                          )}
                        </div>
                      </div>
                      <SeoPositionHistoryChart series={e.series} color={color} height={140} label={canonicalEngineLabel(e)} />
                    </div>
                  );
                })}
              </div>

              {record.enginesNotRanking.length > 0 && (
                <div style={{ marginTop: 16, background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Not ranking on</div>
                  <div style={{ fontSize: 11, color: '#5A7A8A' }}>{record.enginesNotRanking.map((e) => canonicalEngineLabel(e)).join(' · ')}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

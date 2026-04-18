/**
 * Phase 3.5 Keyword Rankings — VISUAL SUMMARY.
 *
 * This is the primary view: hero cards, position distribution, jumped/dropped
 * visualizations, key metrics. The old full sortable/filterable table lives
 * behind a "See Full Details" button that opens it as a modal.
 * Per-keyword detail modal opens from either view.
 */
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar as RBar, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend, Cell } from 'recharts';
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

type SortKey = 'keyword' | 'currentPosition' | 'positionChange' | 'searchVolume' | 'cpc' | 'competition';

export function SeoRankings() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [range, setRange] = React.useState<SeoRangeCode>('30d');
  const [provider, setProvider] = React.useState<'all' | 'google' | 'bing'>('all');
  const [device, setDevice] = React.useState<'all' | 'desktop' | 'mobile'>('all');
  const [selectedKeywordId, setSelectedKeywordId] = React.useState<number | null>(null);
  const [showFullDetails, setShowFullDetails] = React.useState(false);

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

  // Provider/device pills — auto-disable based on discovered engines.
  const providersFound = new Set<string>();
  const devicesFound = new Set<string>();
  for (const e of engineMeta) {
    if (e.name) providersFound.add(e.name.toLowerCase());
    if (e.device) devicesFound.add(e.device.toLowerCase());
  }
  const providerOptions = [
    { value: 'all', label: 'All' },
    { value: 'google', label: 'Google', disabled: providersFound.size > 0 && !providersFound.has('google') },
    { value: 'bing', label: 'Bing', disabled: providersFound.size > 0 && !providersFound.has('bing') },
  ];
  const deviceOptions = [
    { value: 'all', label: 'All' },
    { value: 'desktop', label: 'Desktop', disabled: devicesFound.size > 0 && !devicesFound.has('desktop') },
    { value: 'mobile', label: 'Mobile', disabled: devicesFound.size > 0 && !devicesFound.has('mobile') },
  ];

  // Top movers — sort by positionChange
  const sortedByChange = [...keywords].sort((a, b) => Number(b.positionChange || 0) - Number(a.positionChange || 0));
  const topJumped = sortedByChange.slice(0, 5).filter((k) => k.positionChange > 0);
  const topDropped = [...sortedByChange].reverse().slice(0, 5).filter((k) => k.positionChange < 0);

  // Jumped / Dropped / Unchanged counts for the movers visual
  const jumpedCount = keywords.filter((k) => Number(k.positionChange || 0) > 0).length;
  const droppedCount = keywords.filter((k) => Number(k.positionChange || 0) < 0).length;
  const unchangedCount = keywords.length - jumpedCount - droppedCount;

  const rangeLabel = r?.range?.label || SEO_RANGE_OPTIONS.find((o) => o.code === range)?.label || 'Last 30 days';

  // Canonical-engine caveat — flag in UI if labels are falling back
  const canonicalFallback = engineMeta.some((e: any) => e.canonical);

  return (
    <div>
      {/* Filter + See Full Details bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <SeoRangePicker value={range} onChange={setRange} />
        <SeoFilterPills label="Provider" options={providerOptions} value={provider} onChange={(v) => setProvider(v as any)} />
        <SeoFilterPills label="Device" options={deviceOptions} value={device} onChange={(v) => setDevice(v as any)} />
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

      {/* Row 1: 4 Hero stat cards */}
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
        />
        <SeoStatCard
          termKey="top10_keywords"
          label="Top 10 Keywords"
          value={stats?.top10Count || 0}
          sub={`of ${stats?.totalKeywords || 0} total`}
          delta={delta.top10Count != null ? Number(delta.top10Count) : null}
          deltaIsGoodWhenPositive={true}
          accent="#EF6C33"
        />
        <SeoStatCard
          termKey="traffic_forecast"
          label="Traffic Forecast"
          value={stats?.trafficForecast != null ? `~${stats.trafficForecast}` : '—'}
          sub="Est. clicks/month"
          delta={delta.trafficForecast != null ? Number(delta.trafficForecast) : null}
          deltaIsGoodWhenPositive={true}
          accent="#FEC82C"
        />
      </div>

      {/* Row 2: Position distribution — cards + stacked area chart side by side */}
      <div style={{ marginTop: 20, marginBottom: 10, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)' }}>
        Distribution of top positions
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 16 }}>
        {(['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100', 'notRanking'] as const).map((bk) => {
          const curCount = stats?.buckets?.[bk] || 0;
          const priorCount = priorStats?.buckets?.[bk] || 0;
          return (
            <SeoBucketCard
              key={bk}
              label={POSITION_BUCKET_LABELS[bk]}
              count={curCount}
              delta={curCount - priorCount}
              color={POSITION_BUCKET_COLORS[bk]}
            />
          );
        })}
      </div>

      {/* Row 3: Movers visual — big side-by-side cards */}
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginTop: 20, marginBottom: 10 }}>
        Keyword movement this period
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <MoverCard
          title="Jumped"
          count={jumpedCount}
          total={keywords.length}
          color="#1D9E75"
          bg="rgba(29,158,117,0.06)"
          movers={topJumped}
          direction="up"
        />
        <MoverCard
          title="Dropped"
          count={droppedCount}
          total={keywords.length}
          color="#D85A30"
          bg="rgba(216,90,48,0.06)"
          movers={topDropped}
          direction="down"
        />
        <UnchangedCard count={unchangedCount} total={keywords.length} />
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
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24' }}>{e.engineLabel}</div>
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
                      <SeoPositionHistoryChart series={e.series} color={color} height={140} label={e.engineLabel} />
                    </div>
                  );
                })}
              </div>

              {record.enginesNotRanking.length > 0 && (
                <div style={{ marginTop: 16, background: '#FFF8E1', borderLeft: '3px solid #D4A800', borderRadius: 4, padding: '10px 14px' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1C24', marginBottom: 4 }}>Not ranking on</div>
                  <div style={{ fontSize: 11, color: '#5A7A8A' }}>{record.enginesNotRanking.map((e) => e.engineLabel).join(' · ')}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

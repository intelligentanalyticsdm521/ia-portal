/**
 * Phase 3.5 Keyword Rankings page.
 *
 * Layout:
 *   Row 1: Filter bar (range picker, provider, device, show-unranked toggle)
 *   Row 2: 4 hero stat cards (Total keywords, Avg Position, Visibility, Top 10) with period-over-period delta
 *   Row 3: 7 position-bucket cards (Top 1 / 2-3 / 4-5 / 6-10 / 11-30 / 31-100 / Not Ranking)
 *   Row 4: Full keyword table — every column sortable, unranked keywords kept in table
 *   Click any row → SeoKeywordDetailModal (90-day position chart + per-engine breakdown)
 */
import React from 'react';
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
import type { SeoRangeCode, SeoKeywordRecord, SeoRankingsResponse } from '../../../lib/arionApi';

type SortKey = 'keyword' | 'currentPosition' | 'positionChange' | 'searchVolume' | 'cpc' | 'competition';

export function SeoRankings() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [range, setRange] = React.useState<SeoRangeCode>('30d');
  const [provider, setProvider] = React.useState<'all' | 'google' | 'bing'>('all');
  const [device, setDevice] = React.useState<'all' | 'desktop' | 'mobile'>('all');
  const [showUnranked, setShowUnranked] = React.useState(true);
  const [sortKey, setSortKey] = React.useState<SortKey>('currentPosition');
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('asc');
  const [selectedKeywordId, setSelectedKeywordId] = React.useState<number | null>(null);

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
        description="Powered by SE Ranking. Track keyword positions across Google, Bing, and AI search engines, run site audits, monitor competitors."
        price="$29"
        planName="Starter — 5 keywords"
      />
    );
  }

  const keywords: SeoKeywordRecord[] = r?.keywords || [];
  const stats = r?.stats?.current;
  const delta = r?.stats?.delta || {};
  const engineMeta = r?.engines?.metadata || [];
  const upstreamError = r?.upstreamError;

  // Work out which provider/device filters can even render based on discovered
  // engines. If no engines have a "bing" name, hide the Bing pill etc.
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

  // Filter + sort
  const displayed = (showUnranked ? keywords : keywords.filter((k) => typeof k.currentPosition === 'number' && k.currentPosition > 0))
    .slice()
    .sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;  // nulls always last
      if (bv == null) return -1;
      if (av === bv) return 0;
      return sortDir === 'asc' ? (av < bv ? -1 : 1) : (av < bv ? 1 : -1);
    });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'searchVolume' || k === 'cpc' || k === 'competition' ? 'desc' : 'asc'); }
  };

  const rangeLabel = r?.range?.label || SEO_RANGE_OPTIONS.find((o) => o.code === range)?.label || 'Last 30 days';

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <SeoRangePicker value={range} onChange={setRange} />
        <SeoFilterPills label="Provider" options={providerOptions} value={provider} onChange={(v) => setProvider(v as any)} />
        <SeoFilterPills label="Device" options={deviceOptions} value={device} onChange={(v) => setDevice(v as any)} />
        <label style={{ fontSize: 11, color: 'var(--color-text-tertiary, #5A7A8A)', display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <input type="checkbox" checked={showUnranked} onChange={(e) => setShowUnranked(e.target.checked)} />
          Show unranked ({stats?.buckets.notRanking || 0})
        </label>
      </div>

      {upstreamError && (
        <ErrorBanner
          message={`SE Ranking returned an error. ${upstreamError.keyConfigured === false ? 'Project API key is missing on the server. ' : ''}${upstreamError.positions || ''}`}
        />
      )}

      {connected && !upstreamError && (
        <InfoCard title="SE Ranking — Connected">
          <p style={{ margin: 0, fontSize: 12 }}>
            <strong>{stats?.totalKeywords || 0}</strong> tracked keywords · <strong>{stats?.rankingKeywords || 0}</strong> ranking · <strong>{engineMeta.length || r?.engines?.availableIds?.length || 0}</strong> engines · <strong>{rangeLabel}</strong>
          </p>
        </InfoCard>
      )}

      {/* Hero stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
        <SeoStatCard
          label="Avg Position"
          value={stats?.avgPosition != null ? stats.avgPosition.toFixed(1) : '—'}
          sub={`of ${stats?.rankingKeywords || 0} ranking keywords`}
          delta={delta.avgPosition != null ? -Number(delta.avgPosition) : null}
          deltaIsGoodWhenPositive={true}
          deltaFormat="position"
          accent="#2D9CDB"
        />
        <SeoStatCard
          label="Search Visibility"
          value={stats?.visibilityScore != null ? `${stats.visibilityScore}%` : '—'}
          sub="CTR-weighted, all tracked"
          delta={delta.visibilityScore != null ? Number(delta.visibilityScore) : null}
          deltaIsGoodWhenPositive={true}
          deltaFormat="percentage"
          accent="#1D9E75"
        />
        <SeoStatCard
          label="Top 10 Keywords"
          value={stats?.top10Count || 0}
          sub={`of ${stats?.totalKeywords || 0} total`}
          delta={delta.top10Count != null ? Number(delta.top10Count) : null}
          deltaIsGoodWhenPositive={true}
          accent="#EF6C33"
        />
        <SeoStatCard
          label="Traffic Forecast"
          value={stats?.trafficForecast != null ? `~${stats.trafficForecast}` : '—'}
          sub="Est. clicks/month"
          delta={delta.trafficForecast != null ? Number(delta.trafficForecast) : null}
          deltaIsGoodWhenPositive={true}
          accent="#FEC82C"
        />
      </div>

      {/* Position-bucket cards */}
      <div style={{ marginTop: 16, marginBottom: 8, fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)' }}>Distribution of top positions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {(['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100', 'notRanking'] as const).map((bk) => {
          const curCount = stats?.buckets?.[bk] || 0;
          const priorCount = r?.stats?.prior?.buckets?.[bk] || 0;
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

      {/* Keyword table */}
      <Card title="Keyword Rankings" style={{ marginTop: 16 }}>
        <div style={{ overflow: 'auto' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <thead>
              <tr>
                <Th label="Keyword" k="keyword" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <Th label="Position" k="currentPosition" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <Th label="Change" k="positionChange" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <Th label="Volume" k="searchVolume" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <Th label="CPC" k="cpc" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <Th label="Competition" k="competition" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                <th style={{ textAlign: 'center', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase', padding: '8px 6px' }}>Engines</th>
                <th style={{ textAlign: 'right', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase', padding: '8px 6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {displayed.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-tertiary, #5A7A8A)', padding: 20 }}>No keywords match the current filters.</td></tr>
              ) : displayed.map((k) => {
                const change = Number(k.positionChange || 0);
                const changeColor = change > 0 ? '#1D9E75' : change < 0 ? '#D85A30' : 'var(--color-text-tertiary, #5A7A8A)';
                const notRankingCount = (k.enginesNotRanking || []).length;
                const tooltip = notRankingCount > 0
                  ? 'Not ranking on: ' + k.enginesNotRanking.map((e) => e.engineLabel).join(', ')
                  : '';
                return (
                  <tr
                    key={k.keywordId}
                    onClick={() => setSelectedKeywordId(k.keywordId)}
                    style={{ cursor: 'pointer' }}
                    className="seo-row"
                  >
                    <td style={{ fontWeight: 500 }}>{k.keyword || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {k.currentPosition == null ? (
                        <span style={{ color: '#94A3B8', fontWeight: 400 }}>Not ranking</span>
                      ) : (
                        k.currentPosition
                      )}
                    </td>
                    <td style={{ textAlign: 'right', color: changeColor, fontWeight: change !== 0 ? 600 : 400 }}>
                      {change === 0 ? '—' : change > 0 ? `▲ ${change}` : `▼ ${Math.abs(change)}`}
                    </td>
                    <td style={{ textAlign: 'right' }}>{k.searchVolume ? formatNum(k.searchVolume) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{k.cpc ? `$${Number(k.cpc).toFixed(2)}` : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{k.competition ? `${Math.round(Number(k.competition) * 100)}%` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        title={tooltip}
                        style={{ fontSize: 10, color: '#5A7A8A', display: 'inline-flex', alignItems: 'center', gap: 4, cursor: tooltip ? 'help' : 'default' }}
                      >
                        <span style={{ color: '#1D9E75' }}>●</span> {k.rankingEngineCount} / {k.engineCount}
                        {notRankingCount > 0 && <span style={{ color: '#94A3B8', fontSize: 11 }}>ⓘ</span>}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedKeywordId(k.keywordId); }}
                        style={{
                          fontSize: 11,
                          padding: '4px 10px',
                          background: 'transparent',
                          color: '#2D9CDB',
                          border: '1px solid #2D9CDB',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontWeight: 600,
                        }}
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
      </Card>

      {/* Detail modal */}
      {selectedKeywordId != null && activeSiteId && (
        <SeoKeywordDetailModal
          siteId={activeSiteId}
          keywordId={selectedKeywordId}
          onClose={() => setSelectedKeywordId(null)}
        />
      )}

      <SeoDiagnosticPanel siteId={activeSiteId ?? null} />

      <ConsultingUpsell
        headline="These rankings are your growth roadmap. IA builds a 90-day plan to reach page 1."
        subtext="Our SEO strategists analyze your keyword landscape and build a custom plan."
        serviceType="SEO Strategy"
        triggerPage="seo-rankings"
      />
    </div>
  );
}

function Th({ label, k, sortKey, sortDir, onClick, align = 'left' }: { label: string; k: SortKey; sortKey: SortKey; sortDir: 'asc' | 'desc'; onClick: (k: SortKey) => void; align?: 'left' | 'right' }) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onClick(k)}
      style={{
        textAlign: align,
        fontSize: 10,
        color: active ? '#2D9CDB' : '#5A7A8A',
        fontWeight: 600,
        textTransform: 'uppercase',
        padding: '8px 6px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {label} {active && (sortDir === 'asc' ? '▲' : '▼')}
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

/* ───────── Keyword detail modal ───────── */

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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
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
              {/* Top-level stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                <SeoStatCard
                  label="Avg Position"
                  value={record.currentPosition != null ? record.currentPosition.toFixed(1) : 'Not ranking'}
                  accent="#2D9CDB"
                />
                <SeoStatCard
                  label="Ranking On"
                  value={`${record.rankingEngineCount} / ${record.engineCount}`}
                  sub="search engines"
                  accent="#1D9E75"
                />
                <SeoStatCard
                  label="Search Volume"
                  value={record.searchVolume ? formatNum(record.searchVolume) : '—'}
                  sub="monthly searches"
                  accent="#FEC82C"
                />
                <SeoStatCard
                  label="CPC"
                  value={record.cpc ? `$${Number(record.cpc).toFixed(2)}` : '—'}
                  sub="Google Ads benchmark"
                  accent="#EF6C33"
                />
              </div>

              {/* Per-engine rows with individual position charts */}
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

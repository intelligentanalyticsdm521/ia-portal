/**
 * Phase 3.5 SEO Overview — the expansive SEO dashboard.
 *
 * Row 1: Hero engine cards (Google, Bing + AI engines tier-gated)
 * Row 2: Position-distribution bucket cards + stacked-area chart
 * Row 3: Jumped / Dropped / Unchanged movers
 * Row 4: Key metric cards (visibility, avg pos, top 10, traffic forecast)
 * Row 5: Cross-section widgets (placeholders for competitors, audit, etc)
 * Row 6: ARGUS alert feed
 */
import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend } from 'recharts';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, AddonUpsell, EmptyPanel, Loading, ConsultingUpsell, ErrorBanner } from '../../components/Ui';
import {
  SeoRangePicker,
  SeoStatCard,
  SeoBucketCard,
  POSITION_BUCKET_COLORS,
  POSITION_BUCKET_LABELS,
} from '../../components/SeoUi';
import type { SeoRangeCode, SeoOverviewResponse } from '../../../lib/arionApi';

const AI_ENGINE_LABELS = ['AI Overview', 'ChatGPT', 'Gemini', 'Perplexity'];

export function SeoOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [range, setRange] = React.useState<SeoRangeCode>('30d');
  const [moversTab, setMoversTab] = React.useState<'jumped' | 'dropped' | 'unchanged'>('jumped');

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getSeoOverview(activeSiteId, range) : Promise.resolve(null),
    [activeSiteId, range]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const o = data as SeoOverviewResponse | null;
  const connected = o?.connected === true;
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

  if (!connected) {
    return (
      <ErrorBanner message="SE Ranking is not connected for this site yet. Check the Keyword Rankings page to run diagnostics." />
    );
  }

  const stats = o!.stats.current;
  const delta = o!.stats.delta;
  const providers = o!.heroCards?.providers || [];
  const ai = o!.heroCards?.ai || [];
  const distSeries = o!.distributionSeries || [];
  const movers = o!.movers || { jumped: [], dropped: [], unchanged: 0 };

  // Tier gating — lower tiers see AI cards as locked previews.
  const tier = (selectedSite?.seoAddonTier || '').toLowerCase();
  const aiEnginesUnlocked: Record<string, boolean> = {
    'chatgpt': tier === 'growth' || tier === 'authority',
    'gemini': tier === 'growth' || tier === 'authority',
    'ai overview': tier === 'authority',
    'perplexity': tier === 'authority',
  };

  // Lay out AI cards: what SE Ranking actually returned + placeholders for
  // locked tiers (so the client can see what's not in their package).
  const aiCardsByName: Record<string, typeof ai[0] | null> = {};
  for (const a of ai) aiCardsByName[a.name.toLowerCase()] = a;
  const aiDisplay = AI_ENGINE_LABELS.map((label) => {
    const key = label.toLowerCase();
    const card = aiCardsByName[key] || Object.entries(aiCardsByName).find(([k]) => k.includes(key.split(' ')[0]))?.[1] || null;
    return {
      label,
      key,
      card,
      unlocked: aiEnginesUnlocked[key] ?? false,
    };
  });

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <SeoRangePicker value={range} onChange={setRange} />
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary, #5A7A8A)', marginLeft: 'auto' }}>
          {o!.range.label} · vs {o!.range.prior.start} to {o!.range.prior.end}
        </div>
      </div>

      {/* Row 1: Hero engine cards */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>Standard Search</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(providers.length, 1)}, 1fr)`, gap: 12, marginBottom: 16 }}>
        {providers.length === 0 ? (
          <div style={{ color: 'var(--color-text-tertiary, #5A7A8A)', fontSize: 12, padding: 20, textAlign: 'center', background: '#F8FAFC', borderRadius: 6 }}>
            No search engines configured. Check your SE Ranking project setup.
          </div>
        ) : providers.map((p) => (
          <SeoStatCard
            key={p.name}
            label={p.name}
            value={p.current.avgPosition != null ? `#${p.current.avgPosition.toFixed(1)}` : '—'}
            sub={`${p.current.rankingKeywords} / ${p.current.totalKeywords} ranking · ${p.devices.join(' + ') || 'all devices'}`}
            delta={p.avgPositionDelta}
            deltaFormat="position"
            deltaIsGoodWhenPositive={true}
            accent="#2D9CDB"
          />
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>AI Search Engines</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {aiDisplay.map((a) => (
          <SeoStatCard
            key={a.label}
            label={a.label}
            value={a.card?.current?.top10Count != null ? a.card.current.top10Count : '—'}
            sub={a.unlocked ? 'mentions in AI responses' : 'Upgrade to Growth / Authority'}
            delta={a.card?.visibilityDelta ?? null}
            deltaFormat="signed"
            deltaIsGoodWhenPositive={true}
            accent="#0C4A60"
            locked={!a.unlocked}
          />
        ))}
      </div>

      {/* Row 2: Position distribution */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>Distribution of top positions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 12 }}>
        {(['top1', 'top2_3', 'top4_5', 'top6_10', 'top11_30', 'top31_100', 'notRanking'] as const).map((bk) => {
          const curCount = stats.buckets[bk];
          const priorCount = o!.stats.prior.buckets[bk];
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

      {/* Stacked-area distribution chart */}
      {distSeries.length > 1 && (
        <Card title="Position distribution over time" style={{ marginBottom: 16 }}>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={distSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(45,156,219,0.12)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#5A7A8A' }} tickLine={false} />
                <RTooltip contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Area type="monotone" dataKey="top1" stackId="pos" stroke={POSITION_BUCKET_COLORS.top1} fill={POSITION_BUCKET_COLORS.top1} name="Top 1" />
                <Area type="monotone" dataKey="top2_3" stackId="pos" stroke={POSITION_BUCKET_COLORS.top2_3} fill={POSITION_BUCKET_COLORS.top2_3} name="Top 2–3" />
                <Area type="monotone" dataKey="top4_5" stackId="pos" stroke={POSITION_BUCKET_COLORS.top4_5} fill={POSITION_BUCKET_COLORS.top4_5} name="Top 4–5" fillOpacity={0.7} />
                <Area type="monotone" dataKey="top6_10" stackId="pos" stroke={POSITION_BUCKET_COLORS.top6_10} fill={POSITION_BUCKET_COLORS.top6_10} name="Top 6–10" fillOpacity={0.6} />
                <Area type="monotone" dataKey="top11_30" stackId="pos" stroke={POSITION_BUCKET_COLORS.top11_30} fill={POSITION_BUCKET_COLORS.top11_30} name="Top 11–30" fillOpacity={0.5} />
                <Area type="monotone" dataKey="top31_100" stackId="pos" stroke={POSITION_BUCKET_COLORS.top31_100} fill={POSITION_BUCKET_COLORS.top31_100} name="Top 31–100" fillOpacity={0.4} />
                <Area type="monotone" dataKey="notRanking" stackId="pos" stroke={POSITION_BUCKET_COLORS.notRanking} fill={POSITION_BUCKET_COLORS.notRanking} name="Not Ranking" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Row 3: Movers tabs */}
      <Card title="Keyword movement" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12, borderBottom: '1px solid #eef2f5' }}>
          {(['jumped', 'dropped', 'unchanged'] as const).map((tab) => {
            const count = tab === 'unchanged' ? movers.unchanged : movers[tab].length;
            const color = tab === 'jumped' ? '#1D9E75' : tab === 'dropped' ? '#D85A30' : '#5A7A8A';
            return (
              <button
                key={tab}
                onClick={() => setMoversTab(tab)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: moversTab === tab ? `2px solid ${color}` : '2px solid transparent',
                  padding: '8px 4px',
                  fontSize: 12,
                  fontWeight: moversTab === tab ? 600 : 400,
                  color: moversTab === tab ? color : '#5A7A8A',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {tab} <span style={{ background: color + '22', color, padding: '2px 8px', borderRadius: 10, fontSize: 10, marginLeft: 4 }}>{count}</span>
              </button>
            );
          })}
        </div>
        {moversTab === 'unchanged' ? (
          <div style={{ fontSize: 12, color: '#5A7A8A', padding: '10px 0' }}>{movers.unchanged} keywords held their position in this period.</div>
        ) : movers[moversTab].length === 0 ? (
          <div style={{ fontSize: 12, color: '#5A7A8A', padding: '10px 0' }}>No {moversTab} keywords in this period.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eef2f5' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Keyword</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Previous</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Current</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Change</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontSize: 10, color: '#5A7A8A', fontWeight: 600, textTransform: 'uppercase' }}>Volume</th>
              </tr>
            </thead>
            <tbody>
              {movers[moversTab].map((m) => (
                <tr key={m.keywordId} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 500 }}>{m.keyword}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A' }}>{m.previousPosition ?? '—'}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>{m.currentPosition ?? 'Not ranking'}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, color: m.positionChange > 0 ? '#1D9E75' : '#D85A30' }}>
                    {m.positionChange > 0 ? `▲ ${m.positionChange}` : `▼ ${Math.abs(m.positionChange)}`}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{m.searchVolume ? formatNum(m.searchVolume) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Row 4: Key metric cards */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary, #0B1C24)', marginBottom: 8 }}>Key metrics</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <SeoStatCard
          label="Total Keywords"
          value={stats.totalKeywords}
          sub={`${stats.rankingKeywords} ranking · ${stats.buckets.notRanking} unranked`}
          delta={delta.totalKeywords != null ? Number(delta.totalKeywords) : null}
          accent="#2D9CDB"
        />
        <SeoStatCard
          label="Avg Position"
          value={stats.avgPosition != null ? stats.avgPosition.toFixed(1) : '—'}
          delta={delta.avgPosition != null ? Number(delta.avgPosition) : null}
          deltaFormat="position"
          deltaIsGoodWhenPositive={true}
          accent="#EF6C33"
        />
        <SeoStatCard
          label="Search Visibility"
          value={`${stats.visibilityScore}%`}
          delta={delta.visibilityScore != null ? Number(delta.visibilityScore) : null}
          deltaFormat="percentage"
          accent="#1D9E75"
        />
        <SeoStatCard
          label="Traffic Forecast"
          value={`~${stats.trafficForecast}`}
          sub="est. monthly clicks"
          delta={delta.trafficForecast != null ? Number(delta.trafficForecast) : null}
          accent="#FEC82C"
        />
      </div>

      <ConsultingUpsell
        headline={stats.avgPosition && stats.avgPosition > 15 ? `Average position is ${stats.avgPosition?.toFixed(1)} — IA can build a 90-day plan to reach page 1.` : 'IA manages your SEO strategy end-to-end.'}
        subtext="Our SEO strategists analyze your full keyword landscape and execute a custom plan."
        serviceType="SEO Strategy"
        triggerPage="seo-overview"
      />
    </div>
  );
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

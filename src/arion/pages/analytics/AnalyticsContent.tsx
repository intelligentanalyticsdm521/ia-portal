import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_COLORS, ARION_PALETTE, CHART_FILLS, DELTA_COLORS, PERIOD_OPTIONS, formatNumber, formatPct, formatDuration, bounceColor, formatDelta } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';
import { AnalyticsNotConnected } from '../../analytics/AnalyticsNotConnected';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsContent() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId } = useArionContext();
  const tier = (selectedSite?.arionTier || 'standard') as keyof typeof PERIOD_OPTIONS;
  const [period, setPeriod] = useState(30);
  const [compare, setCompare] = useState<'none' | 'previous_period'>('previous_period');
  const periodOptions = PERIOD_OPTIONS[tier] || PERIOD_OPTIONS.standard;
  const canCompare = tier === 'pro' || tier === 'business';

  const { data, loading, error } = useAnalyticsData(activeSiteId, period, compare);

  // A3-1 — no blank page when GA4 isn't connected yet.
  if (data?.connected === false) return <AnalyticsNotConnected />;

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading content data...</div>;
  }
  if (error) {
    return <div style={{ padding: 32, textAlign: 'center', color: DELTA_COLORS.negative }}>{error}</div>;
  }
  if (!selectedSite) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No ARION site selected.</div>;
  }
  if (!data) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No content data available.</div>;
  }

  const totalPageviews = data.summary?.totalPageviews ?? 0;
  const pages = 68; // placeholder
  const posts = 97; // placeholder

  // Filter out test pages
  const topPages = (data.topPages ?? []).filter((p: any) => !/(test)/i.test(p.title || ''));
  const landingPages = data.landingPages ?? [];

  // Build consulting upsell message from top page data
  const topPage = topPages[0];
  const topPageViews = topPage?.views ?? topPage?.pageviews ?? 0;
  const topPageBounce = topPage?.bounceRate ?? topPage?.bounce_rate ?? 0;
  const bounceDisplay = typeof topPageBounce === 'number' && topPageBounce <= 1
    ? (topPageBounce * 100).toFixed(0)
    : typeof topPageBounce === 'number' ? topPageBounce.toFixed(0) : '0';

  return (
    <div>
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'top_pages', label: 'Top pages' },
        { id: 'page_titles_read', label: 'What gets read' },
        { id: 'engagement_by_page', label: 'Engagement by page' },
      ]} />
      {/* Period selector + comparison toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <select
          value={period}
          onChange={e => setPeriod(Number(e.target.value))}
          style={{
            padding: '5px 10px',
            borderRadius: 6,
            border: '1px solid rgba(45,156,219,0.18)',
            fontSize: 12,
            background: '#fff',
            color: '#0B1C24',
            cursor: 'pointer',
          }}
        >
          {periodOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        {canCompare && (
          <button
            onClick={() => setCompare(c => c === 'none' ? 'previous_period' : 'none')}
            style={{
              padding: '5px 10px',
              borderRadius: 6,
              border: `1px solid ${compare !== 'none' ? ARION_COLORS.sky : 'rgba(45,156,219,0.18)'}`,
              background: compare !== 'none' ? 'rgba(45,156,219,0.08)' : '#fff',
              fontSize: 12,
              color: compare !== 'none' ? ARION_COLORS.sky : '#5A7A8A',
              cursor: 'pointer',
              fontWeight: compare !== 'none' ? 600 : 400,
            }}
          >
            {compare !== 'none' ? 'Comparing' : 'Compare'}
          </button>
        )}
      </div>

      {/* Stat cards */}
      {(() => {
        const compSummary = compare !== 'none' ? data.comparison?.summary : null;
        const pvDelta = compSummary?.totalPageviews != null ? formatDelta(totalPageviews, compSummary.totalPageviews) : null;
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            <StatCard
              label="Total Pageviews"
              value={formatNumber(totalPageviews)}
              accent={ARION_COLORS.sky}
              prevValue={compSummary?.totalPageviews != null ? formatNumber(compSummary.totalPageviews) : undefined}
              delta={pvDelta ?? undefined}
            />
            <StatCard label="Pages" value={String(pages)} accent={ARION_COLORS.orange} />
            <StatCard label="Posts" value={String(posts)} accent={ARION_COLORS.coreBlueMid} />
          </div>
        );
      })()}

      {/* 2-column: Top Pages | Top Landing Pages */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Top Pages by Views */}
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20, overflow: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Top Pages by Views</div>
          {(() => {
            const compTopPages = compare !== 'none' ? (data.comparison?.topPages ?? []) : [];
            const hasCompPages = compTopPages.length > 0;
            return topPages.length > 0 ? (
              <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Page</th>
                    <th style={{ textAlign: 'right' }}>Views</th>
                    {hasCompPages && <th style={{ textAlign: 'right', fontSize: 10, color: '#8CA4B0' }}>Prev Views</th>}
                    <th style={{ textAlign: 'right' }}>Bounce Rate</th>
                    <th style={{ textAlign: 'right' }}>Avg Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((p: any, i: number) => {
                    const bounce = p.bounceRate ?? p.bounce_rate ?? 0;
                    const bounceNum = typeof bounce === 'number' ? bounce : parseFloat(bounce) || 0;
                    const normalizedBounce = bounceNum > 1 ? bounceNum / 100 : bounceNum;
                    const duration = p.avgDuration ?? p.avg_duration ?? p.avgSessionDuration ?? 0;
                    const pagePath = p.path || p.page || '--';
                    const prevPage = hasCompPages
                      ? compTopPages.find((cp: any) => (cp.path || cp.page || '--') === pagePath)
                      : null;
                    const prevViews = prevPage ? (prevPage.views ?? prevPage.pageviews ?? 0) : null;
                    return (
                      <tr key={i}>
                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={pagePath}>
                          {pagePath}
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(p.views ?? p.pageviews ?? 0)}</td>
                        {hasCompPages && (
                          <td style={{ textAlign: 'right', color: '#5A7A8A', fontSize: 11 }}>
                            {prevViews != null ? formatNumber(prevViews) : '--'}
                          </td>
                        )}
                        <td style={{ textAlign: 'right', color: bounceColor(normalizedBounce) }}>
                          {formatPct(normalizedBounce)}
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatDuration(Number(duration) || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No page data available.
              </div>
            );
          })()}
        </div>

        {/* Top Landing Pages */}
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20, overflow: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Top Landing Pages</div>
          {landingPages.length > 0 ? (
            <table className="data-table" style={{ width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Page</th>
                  <th style={{ textAlign: 'right' }}>Sessions</th>
                  <th style={{ textAlign: 'right' }}>Bounce Rate</th>
                  <th style={{ textAlign: 'right' }}>Conversions</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.map((p: any, i: number) => {
                  const bounce = p.bounceRate ?? p.bounce_rate ?? 0;
                  const bounceNum = typeof bounce === 'number' ? bounce : parseFloat(bounce) || 0;
                  const normalizedBounce = bounceNum > 1 ? bounceNum / 100 : bounceNum;
                  return (
                    <tr key={i}>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.path || p.page || ''}>
                        {p.path || p.page || '--'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(p.sessions ?? 0)}</td>
                      <td style={{ textAlign: 'right', color: bounceColor(normalizedBounce) }}>
                        {formatPct(normalizedBounce)}
                      </td>
                      <td style={{ textAlign: 'right' }}>{p.conversions ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No landing page data available.
            </div>
          )}
        </div>
      </div>

      <ConsultingUpsell
        headline={`Your top page gets ${formatNumber(topPageViews)} views but has ${bounceDisplay}% bounce rate. IA optimizes landing pages for better engagement.`}
        subtext="Content performance optimization backed by data."
        serviceType="Content Optimization"
        triggerPage="analytics-content"
      />
    </div>
  );
}

function StatCard({ label, value, accent, prevValue, delta }: {
  label: string;
  value: string;
  accent: string;
  prevValue?: string;
  delta?: { text: string; color: string };
}) {
  return (
    <div style={{
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 10,
      padding: '14px 18px',
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {delta && prevValue && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
          was {prevValue} · <span style={{ fontWeight: 500, color: delta.color }}>{delta.text}</span>
        </div>
      )}
    </div>
  );
}

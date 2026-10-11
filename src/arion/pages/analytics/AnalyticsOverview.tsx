import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useFeatureGate } from '../../../hooks/useFeatureGate';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import {
  ARION_COLORS,
  ARION_PALETTE,
  CHANNEL_COLORS,
  CHART_FILLS,
  PERIOD_OPTIONS,
  formatDuration,
  formatPct,
  formatNumber,
  bounceColor,
  formatDelta,
} from '../../analytics/chartConfig';
import { Card, ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsOverview() {
  const { selectedSite, activeSiteId } = useArionContext();
  const tier = (selectedSite?.arionTier || 'standard') as keyof typeof PERIOD_OPTIONS;
  const [period, setPeriod] = useState(30);
  const [compare, setCompare] = useState<'none' | 'previous_period'>('previous_period');
  const periodOptions = PERIOD_OPTIONS[tier] || PERIOD_OPTIONS.standard;
  // Comparing with the previous period is part of this page (catalog key
  // arion_analytics_overview); the plan question is the page's own, never a tier written here.
  const featureGate = useFeatureGate();
  const canCompare = featureGate.allows('arion_analytics_overview');

  const { data, loading } = useAnalyticsData(activeSiteId, period, compare);

  /* ── Not connected ── */
  if (data?.connected === false) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#0B1C24' }}>Connect Google Analytics</div>
        <p style={{ fontSize: 13, color: '#5A7A8A', marginBottom: 20, maxWidth: 420, margin: '0 auto 20px' }}>
          Link your GA4 property to see sessions, users, channel breakdown, and device data.
        </p>
        <a
          href="/app/settings"
          style={{
            display: 'inline-block',
            padding: '8px 24px',
            fontSize: 13,
            fontWeight: 500,
            background: ARION_COLORS.sky,
            color: '#fff',
            borderRadius: 6,
            textDecoration: 'none',
          }}
        >
          Go to Settings
        </a>
      </div>
    );
  }

  /* ── Loading ── */
  if (loading || !data) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: '#5A7A8A', fontSize: 13 }}>
        Loading analytics...
      </div>
    );
  }

  const summary = data.summary ?? { totalSessions: 0, totalUsers: 0, bounceRate: 0, avgSessionDuration: 0 };
  const sessionsByDay = data.sessionsByDay ?? [];
  const channelBreakdown = data.channelBreakdown ?? [];
  const deviceSplit = data.deviceSplit ?? { desktop: 0, mobile: 0, tablet: 0 };

  return (
    <>
      {/* ── Period selector + comparison toggle (top-right) ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 8 }}>
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

      {/* ── 4 Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        {[
          { label: 'Sessions', value: formatNumber(summary.totalSessions), accent: ARION_COLORS.sky, key: 'totalSessions' },
          { label: 'Users', value: formatNumber(summary.totalUsers), accent: ARION_COLORS.orange, key: 'totalUsers' },
          { label: 'Bounce Rate', value: formatPct(summary.bounceRate), accent: bounceColor(summary.bounceRate), key: 'bounceRate' },
          { label: 'Avg Duration', value: formatDuration(summary.avgSessionDuration), accent: ARION_COLORS.coreBlueMid, key: 'avgSessionDuration' },
        ].map(card => {
          const compSummary = data.comparison?.summary;
          const delta = compare !== 'none' && compSummary ? formatDelta(summary[card.key], compSummary[card.key]) : null;
          return (
            <div
              key={card.label}
              style={{
                background: '#fff',
                border: '1px solid rgba(45,156,219,0.12)',
                borderRadius: 6,
                padding: '10px 14px',
                borderLeft: `3px solid ${card.accent}`,
              }}
            >
              <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24' }}>{card.value}</span>
                {delta && <span style={{ fontSize: 11, fontWeight: 500, color: delta.color }}>{delta.text}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Sessions line chart ── */}
      <Card title="Sessions">
        {/* Custom legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, background: ARION_COLORS.sky }} />
          <span style={{ fontSize: 11, color: '#5A7A8A' }}>Sessions</span>
          {compare !== 'none' && (
            <>
              <span style={{ display: 'inline-block', width: 12, height: 0, borderTop: '2px dashed #5A7A8A', marginLeft: 8 }} />
              <span style={{ fontSize: 11, color: '#5A7A8A' }}>Previous period</span>
            </>
          )}
        </div>
        <div style={{ maxHeight: 200, height: 180 }}>
          <Line
            data={{
              labels: sessionsByDay.map((d: any) => d.date),
              datasets: [
                {
                  label: 'Sessions',
                  data: sessionsByDay.map((d: any) => d.sessions),
                  borderColor: ARION_COLORS.sky,
                  backgroundColor: CHART_FILLS.skyLight,
                  borderWidth: 2,
                  fill: true,
                  tension: 0.3,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                },
                ...(compare !== 'none' && data.comparison?.sessionsByDay ? [{
                  label: 'Previous Period',
                  data: (() => {
                    const comp = data.comparison.sessionsByDay.map((d: any) => d.sessions);
                    const pad = sessionsByDay.length - comp.length;
                    return pad > 0 ? [...Array(pad).fill(null), ...comp] : comp;
                  })(),
                  borderColor: '#EF6C33',
                  borderDash: [4, 3],
                  borderWidth: 1.5,
                  fill: false,
                  tension: 0.3,
                  pointRadius: 0,
                  pointHoverRadius: 3,
                  backgroundColor: 'transparent',
                }] : []),
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
              scales: {
                x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
              },
            }}
          />
        </div>
      </Card>

      {/* ── 2-column: Channel bar + Device doughnut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 10, marginTop: 10, maxHeight: 220 }}>
        {/* Channel horizontal bar */}
        <Card title="Channel Breakdown">
          {/* Custom legend with comparison deltas */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
            {channelBreakdown.map((c: any, i: number) => {
              const prevChannel = compare !== 'none' && data.comparison?.channelBreakdown
                ? data.comparison.channelBreakdown.find((p: any) => p.channel === c.channel) : null;
              const delta = prevChannel ? formatDelta(c.sessions, prevChannel.sessions) : null;
              return (
                <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: CHANNEL_COLORS[c.channel] || ARION_PALETTE[i % 5],
                  }} />
                  <span style={{ fontSize: 10, color: '#5A7A8A' }}>
                    {c.channel}: {formatNumber(c.sessions)}
                    {delta && <span style={{ color: delta.color, marginLeft: 3, fontWeight: 500 }}>{delta.text}</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ maxHeight: 150 }}>
            <Bar
              data={{
                labels: channelBreakdown.map((c: any) => c.channel),
                datasets: [{
                  data: channelBreakdown.map((c: any) => c.sessions),
                  backgroundColor: channelBreakdown.map((c: any, i: number) => CHANNEL_COLORS[c.channel] || ARION_PALETTE[i % 5]),
                  borderRadius: 3,
                  barThickness: 16,
                }],
              }}
              options={{
                indexAxis: 'y' as const,
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                  x: { beginAtZero: true, ticks: { font: { size: 9 } } },
                  y: { ticks: { font: { size: 10 } } },
                },
              }}
            />
          </div>
        </Card>

        {/* Device doughnut */}
        <Card title="Devices">
          <div style={{ position: 'relative', maxWidth: 140, margin: '0 auto' }}>
            <Doughnut
              data={{
                labels: ['Desktop', 'Mobile', 'Tablet'],
                datasets: [{
                  data: [deviceSplit.desktop, deviceSplit.mobile, deviceSplit.tablet],
                  backgroundColor: [ARION_COLORS.sky, ARION_COLORS.orange, ARION_COLORS.coreBlueMid],
                  borderWidth: 0,
                }],
              }}
              options={{
                responsive: true,
                cutout: '68%',
                plugins: { legend: { display: false } },
              }}
            />
          </div>
          {/* Custom legend with comparison deltas */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 6 }}>
            {[
              { label: 'Desktop', color: ARION_COLORS.sky, value: deviceSplit.desktop, key: 'desktop' },
              { label: 'Mobile', color: ARION_COLORS.orange, value: deviceSplit.mobile, key: 'mobile' },
              { label: 'Tablet', color: ARION_COLORS.coreBlueMid, value: deviceSplit.tablet, key: 'tablet' },
            ].map(d => {
              const prevDevice = compare !== 'none' && data.comparison?.deviceSplit ? data.comparison.deviceSplit[d.key] : null;
              const currentPct = (d.value / 100).toFixed(1);
              const prevPct = prevDevice != null ? (prevDevice / 100).toFixed(1) : null;
              const ppDiff = prevPct != null ? (d.value / 100 - prevDevice / 100).toFixed(1) : null;
              return (
                <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                  <span style={{ fontSize: 10, color: '#5A7A8A' }}>{d.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#0B1C24' }}>{formatPct(d.value / 100)}</span>
                  {ppDiff != null && (
                    <span style={{ fontSize: 9, color: Number(ppDiff) >= 0 ? '#1D9E75' : '#D85A30' }}>
                      ({Number(ppDiff) >= 0 ? '↑' : '↓'} {Math.abs(Number(ppDiff))}pp)
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Consulting upsell ── */}
      <ConsultingUpsell
        headline="Want IA to interpret this data and build a growth plan? We turn analytics into actions."
        subtext="Data-driven growth strategies from our analytics team."
        serviceType="Analytics Consulting"
        triggerPage="analytics-overview"
      />
    </>
  );
}

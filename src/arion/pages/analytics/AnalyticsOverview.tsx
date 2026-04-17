import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
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
} from '../../analytics/chartConfig';
import { Card, ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsOverview() {
  const { selectedSite, activeSiteId } = useArionContext();
  const tier = (selectedSite?.arionTier || 'standard') as keyof typeof PERIOD_OPTIONS;
  const [period, setPeriod] = useState(30);
  const periodOptions = PERIOD_OPTIONS[tier] || PERIOD_OPTIONS.standard;

  const { data, loading } = useAnalyticsData(activeSiteId, period);

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
      {/* ── Period selector (top-right) ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <select
          value={period}
          onChange={e => setPeriod(Number(e.target.value))}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid rgba(45,156,219,0.18)',
            fontSize: 13,
            background: '#fff',
            color: '#0B1C24',
            cursor: 'pointer',
          }}
        >
          {periodOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* ── 4 Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Sessions', value: formatNumber(summary.totalSessions), accent: ARION_COLORS.sky },
          { label: 'Users', value: formatNumber(summary.totalUsers), accent: ARION_COLORS.orange },
          { label: 'Bounce Rate', value: formatPct(summary.bounceRate), accent: bounceColor(summary.bounceRate) },
          { label: 'Avg Session Duration', value: formatDuration(summary.avgSessionDuration), accent: ARION_COLORS.coreBlueMid },
        ].map(card => (
          <div
            key={card.label}
            style={{
              background: '#fff',
              border: '1px solid rgba(45,156,219,0.12)',
              borderRadius: 8,
              padding: '14px 16px',
              borderLeft: `3px solid ${card.accent}`,
            }}
          >
            <div style={{ fontSize: 10, color: '#5A7A8A', textTransform: 'uppercase', letterSpacing: 0.4 }}>{card.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0B1C24', marginTop: 4 }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ── Sessions line chart ── */}
      <Card title="Sessions">
        {/* Custom legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ display: 'inline-block', width: 12, height: 3, borderRadius: 2, background: ARION_COLORS.sky }} />
          <span style={{ fontSize: 11, color: '#5A7A8A' }}>Sessions</span>
        </div>
        <Line
          data={{
            labels: sessionsByDay.map((d: any) => d.date),
            datasets: [{
              label: 'Sessions',
              data: sessionsByDay.map((d: any) => d.sessions),
              borderColor: ARION_COLORS.sky,
              backgroundColor: CHART_FILLS.skyLight,
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
              pointHoverRadius: 4,
            }],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, tooltip: { mode: 'index' as const, intersect: false } },
            scales: {
              x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
              y: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.05)' } },
            },
          }}
        />
      </Card>

      {/* ── 2-column: Channel bar + Device doughnut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginTop: 12 }}>
        {/* Channel horizontal bar */}
        <Card title="Channel Breakdown">
          {/* Custom legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
            {channelBreakdown.map((c: any, i: number) => (
              <div key={c.channel} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: CHANNEL_COLORS[c.channel] || ARION_PALETTE[i % 5],
                }} />
                <span style={{ fontSize: 11, color: '#5A7A8A' }}>{c.channel}</span>
              </div>
            ))}
          </div>
          <Bar
            data={{
              labels: channelBreakdown.map((c: any) => c.channel),
              datasets: [{
                data: channelBreakdown.map((c: any) => c.sessions),
                backgroundColor: channelBreakdown.map((c: any, i: number) => CHANNEL_COLORS[c.channel] || ARION_PALETTE[i % 5]),
                borderRadius: 4,
                barThickness: 20,
              }],
            }}
            options={{
              indexAxis: 'y' as const,
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                y: { ticks: { font: { size: 11 } } },
              },
            }}
          />
        </Card>

        {/* Device doughnut */}
        <Card title="Devices">
          <div style={{ position: 'relative', maxWidth: 220, margin: '0 auto' }}>
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
          {/* Custom legend */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 12 }}>
            {[
              { label: 'Desktop', color: ARION_COLORS.sky, value: deviceSplit.desktop },
              { label: 'Mobile', color: ARION_COLORS.orange, value: deviceSplit.mobile },
              { label: 'Tablet', color: ARION_COLORS.coreBlueMid, value: deviceSplit.tablet },
            ].map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: d.color }} />
                <span style={{ fontSize: 11, color: '#5A7A8A' }}>{d.label}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#0B1C24' }}>{formatPct(d.value / 100)}</span>
              </div>
            ))}
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

import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import {
  ARION_COLORS,
  PERIOD_OPTIONS,
  formatDuration,
  formatPct,
  formatNumber,
  bounceColor,
  formatDelta,
} from '../../analytics/chartConfig';
import { Card, ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsTraffic() {
  const { selectedSite, activeSiteId } = useArionContext();
  const tier = (selectedSite?.arionTier || 'standard') as keyof typeof PERIOD_OPTIONS;
  const [period, setPeriod] = useState(30);
  const [compare, setCompare] = useState<'none' | 'previous_period'>('previous_period');
  const periodOptions = PERIOD_OPTIONS[tier] || PERIOD_OPTIONS.standard;
  const canCompare = tier === 'pro' || tier === 'business';

  const { data, loading } = useAnalyticsData(activeSiteId, period, compare);

  /* ── Not connected ── */
  if (data?.connected === false) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: '#0B1C24' }}>Connect Google Analytics</div>
        <p style={{ fontSize: 13, color: '#5A7A8A', marginBottom: 20, maxWidth: 420, margin: '0 auto 20px' }}>
          Link your GA4 property to see traffic sources, device breakdown, and landing pages.
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

  const summary = data.summary ?? { totalSessions: 0, totalUsers: 0, pagesPerSession: 0, engagementRate: 0 };
  const trafficSources = data.trafficSources ?? [];
  const deviceSplit = data.deviceSplit ?? { desktop: 0, mobile: 0, tablet: 0 };
  const landingPages = data.landingPages ?? [];
  const totalSessions = summary.totalSessions || 1; // avoid division by zero

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: 11,
    fontWeight: 600,
    color: '#5A7A8A',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    borderBottom: '1px solid rgba(45,156,219,0.12)',
  };
  const tdStyle: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 13,
    color: '#0B1C24',
    borderBottom: '1px solid rgba(0,0,0,0.04)',
  };

  return (
    <>
      {/* ── Period selector + comparison toggle ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Sessions', value: formatNumber(summary.totalSessions), accent: ARION_COLORS.sky, key: 'totalSessions' },
          { label: 'Users', value: formatNumber(summary.totalUsers), accent: ARION_COLORS.orange, key: 'totalUsers' },
          { label: 'Pages / Session', value: (summary.pagesPerSession ?? 0).toFixed(1), accent: ARION_COLORS.coreBlueMid, key: 'pagesPerSession' },
          { label: 'Engagement Rate', value: formatPct(summary.engagementRate ?? 0), accent: ARION_COLORS.gold, key: 'engagementRate' },
        ].map(card => {
          const compSummary = data.comparison?.summary;
          const delta = compare !== 'none' && compSummary ? formatDelta(summary[card.key], compSummary[card.key]) : null;
          return (
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 600, color: '#0B1C24' }}>{card.value}</span>
                {delta && <span style={{ fontSize: 11, fontWeight: 500, color: delta.color }}>{delta.text}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2-column: Traffic Sources table + Device doughnut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginBottom: 12 }}>
        {/* Traffic Sources table */}
        <Card title="Traffic Sources">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Source / Medium</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                  {compare !== 'none' && data.comparison?.trafficSources && (
                    <>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Prev</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Change</th>
                    </>
                  )}
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bounce Rate</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Avg Duration</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {trafficSources.length > 0 ? trafficSources.map((s: any, i: number) => {
                  const pctTotal = totalSessions > 0 ? (s.sessions / totalSessions) : 0;
                  const sourceName = s.sourceMedium ?? s.source ?? '--';
                  const prevSource = compare !== 'none' && data.comparison?.trafficSources
                    ? data.comparison.trafficSources.find((p: any) => (p.sourceMedium ?? p.source ?? '--') === sourceName) : null;
                  const delta = prevSource ? formatDelta(s.sessions ?? 0, prevSource.sessions ?? 0) : null;
                  return (
                    <tr key={i}>
                      <td style={tdStyle}>{sourceName}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(s.sessions ?? 0)}</td>
                      {compare !== 'none' && data.comparison?.trafficSources && (
                        <>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#5A7A8A' }}>
                            {prevSource ? formatNumber(prevSource.sessions ?? 0) : '--'}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: delta?.color ?? '#5A7A8A', fontWeight: 500 }}>
                            {delta?.text ?? '--'}
                          </td>
                        </>
                      )}
                      <td style={{ ...tdStyle, textAlign: 'right', color: bounceColor(s.bounceRate ?? 0) }}>
                        {formatPct(s.bounceRate ?? 0)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatDuration(s.avgSessionDuration ?? 0)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPct(pctTotal)}</td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={compare !== 'none' && data.comparison?.trafficSources ? 7 : 5} style={{ ...tdStyle, textAlign: 'center', color: '#5A7A8A' }}>No traffic source data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Device doughnut */}
        <Card title="Devices">
          <div style={{ position: 'relative', maxWidth: 200, margin: '0 auto' }}>
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

      {/* ── Landing Pages table (locked on Standard) ── */}
      <div style={{ position: 'relative' }}>
        {tier === 'standard' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(240,243,246,0.85)',
            borderRadius: 8,
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24', marginBottom: 6 }}>Upgrade to Pro</div>
            <p style={{ fontSize: 13, color: '#5A7A8A', margin: 0, textAlign: 'center', maxWidth: 320 }}>
              Landing page analytics are available on the Pro tier and above.
            </p>
          </div>
        )}
        <Card title="Landing Pages">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Page</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Sessions</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Bounce Rate</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Avg Duration</th>
                </tr>
              </thead>
              <tbody>
                {landingPages.length > 0 ? landingPages.map((p: any, i: number) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.page ?? p.path ?? '--'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatNumber(p.sessions ?? 0)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: bounceColor(p.bounceRate ?? 0) }}>
                      {formatPct(p.bounceRate ?? 0)}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{formatDuration(p.avgSessionDuration ?? 0)}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: '#5A7A8A' }}>No landing page data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ── Consulting upsell ── */}
      <ConsultingUpsell
        headline="Not sure which traffic sources to invest in? IA builds channel-specific growth strategies."
        subtext="Channel optimization based on your traffic data."
        serviceType="Analytics Consulting"
        triggerPage="analytics-traffic"
      />
    </>
  );
}

import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_COLORS, ARION_PALETTE, CHART_FILLS, DELTA_COLORS, PERIOD_OPTIONS, formatNumber, formatPct, formatDuration, bounceColor, formatDelta } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';
import { AnalyticsNotConnected } from '../../analytics/AnalyticsNotConnected';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsAudience() {
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
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading audience data...</div>;
  }
  if (error) {
    return <div style={{ padding: 32, textAlign: 'center', color: DELTA_COLORS.negative }}>{error}</div>;
  }
  if (!selectedSite) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No ARION site selected.</div>;
  }
  if (!data) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No audience data available.</div>;
  }

  // -- Stat card values --
  const newRow = data.newVsReturning?.find((r: any) => r.type === 'new' || r.type === 'New');
  const retRow = data.newVsReturning?.find((r: any) => r.type === 'returning' || r.type === 'Returning');
  const newUsers = newRow?.users ?? 0;
  const returningUsers = retRow?.users ?? 0;
  const scrollDepth = data.engagement?.scrolledUsers ?? 0;
  const eventsPerSession = data.engagement?.eventsPerSession ?? 0;

  // -- New vs Returning doughnut --
  const totalNvr = newUsers + returningUsers;
  const newPct = totalNvr > 0 ? ((newUsers / totalNvr) * 100).toFixed(1) : '0.0';
  const retPct = totalNvr > 0 ? ((returningUsers / totalNvr) * 100).toFixed(1) : '0.0';

  const nvrData = {
    labels: ['New', 'Returning'],
    datasets: [{
      data: [newUsers, returningUsers],
      backgroundColor: ['#2D9CDB', '#EF6C33'],
      borderWidth: 0,
    }],
  };

  // -- Browser doughnut --
  const browsers = data.browsers ?? [];
  const top3 = browsers.slice(0, 3);
  const otherSum = browsers.slice(3).reduce((sum: number, b: any) => sum + (b.sessions || b.users || 0), 0);
  const browserLabels = [...top3.map((b: any) => b.browser || b.name || 'Unknown'), ...(otherSum > 0 ? ['Other'] : [])];
  const browserValues = [...top3.map((b: any) => b.sessions || b.users || 0), ...(otherSum > 0 ? [otherSum] : [])];
  const browserColorMap: Record<string, string> = {
    Chrome: '#2D9CDB',
    Safari: '#EF6C33',
    Edge: ARION_COLORS.coreBlueMid,
    Other: '#FEC82C',
  };
  const browserColors = browserLabels.map(l => browserColorMap[l] || ARION_PALETTE[browserLabels.indexOf(l) % ARION_PALETTE.length]);

  const browserData = {
    labels: browserLabels,
    datasets: [{
      data: browserValues,
      backgroundColor: browserColors,
      borderWidth: 0,
    }],
  };

  // -- Day of Week bar --
  const dayBreakdown = data.dayOfWeekBreakdown ?? [];
  const daySessions = dayBreakdown.map((d: any) => d.sessions || 0);
  const medianSessions = [...daySessions].sort((a: number, b: number) => a - b)[Math.floor(daySessions.length / 2)] || 0;
  const dayLabels = dayBreakdown.map((d: any) => d.day || d.dayOfWeek || '');
  const dayColors = daySessions.map((s: number) => s >= medianSessions ? '#2D9CDB' : '#EF6C33');

  const prevDayBreakdown = compare !== 'none' ? (data.comparison?.dayOfWeekBreakdown ?? []) : [];
  const prevDaySessions = dayLabels.map((label: string) => {
    const prev = prevDayBreakdown.find((d: any) => (d.day || d.dayOfWeek || '') === label);
    return prev ? (prev.sessions || 0) : null;
  });

  const dayOfWeekData = {
    labels: dayLabels,
    datasets: [
      {
        label: 'Current',
        data: daySessions,
        backgroundColor: dayColors,
        borderWidth: 0,
        borderRadius: 3,
      },
      ...(prevDaySessions.some((v: any) => v != null) ? [{
        label: 'Previous',
        data: prevDaySessions.map((v: any) => v ?? 0),
        backgroundColor: 'rgba(45,156,219,0.18)',
        borderWidth: 0,
        borderRadius: 3,
      }] : []),
    ],
  };

  // -- Hourly heatmap --
  const hourly = data.hourlyBreakdown ?? [];
  const hourSessions = hourly.map((h: any) => h.sessions || 0);
  const maxHour = Math.max(...hourSessions, 1);

  return (
    <div>
      {/* Period selector + comparison toggle */}
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

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
        <StatCard label="New Users" value={formatNumber(newUsers)} accent={ARION_COLORS.sky} />
        <StatCard label="Returning Users" value={formatNumber(returningUsers)} accent={ARION_COLORS.orange} />
        <StatCard label="Scroll Depth" value={formatNumber(scrollDepth)} accent={ARION_COLORS.coreBlueMid} />
        <StatCard label="Events / Session" value={eventsPerSession.toFixed(1)} accent={ARION_COLORS.coreBlueMid} />
      </div>

      {/* 2-column: New vs Returning | Browser */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '12px 16px', maxHeight: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>New vs Returning</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 120, height: 120, maxHeight: 180 }}>
              <Doughnut
                data={nvrData}
                options={{ responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }}
              />
            </div>
            <div>
              {(() => {
                const compNew = compare !== 'none' && data.comparison?.newVsReturning
                  ? data.comparison.newVsReturning.find((r: any) => r.type === 'new' || r.type === 'New') : null;
                const compRet = compare !== 'none' && data.comparison?.newVsReturning
                  ? data.comparison.newVsReturning.find((r: any) => r.type === 'returning' || r.type === 'Returning') : null;
                const prevNewCount = compNew?.users ?? null;
                const prevRetCount = compRet?.users ?? null;
                const newDelta = prevNewCount != null ? formatDelta(newUsers, prevNewCount) : null;
                const retDelta = prevRetCount != null ? formatDelta(returningUsers, prevRetCount) : null;
                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2D9CDB' }} />
                      <span style={{ fontSize: 11 }}>
                        New: {formatNumber(newUsers)} ({newPct}%)
                      </span>
                    </div>
                    {newDelta && prevNewCount != null && (
                      <div style={{ fontSize: 10, color: '#5A7A8A', marginLeft: 16, marginBottom: 6 }}>
                        was {formatNumber(prevNewCount)} · <span style={{ color: newDelta.color, fontWeight: 500 }}>{newDelta.text}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#EF6C33' }} />
                      <span style={{ fontSize: 11 }}>
                        Returning: {formatNumber(returningUsers)} ({retPct}%)
                      </span>
                    </div>
                    {retDelta && prevRetCount != null && (
                      <div style={{ fontSize: 10, color: '#5A7A8A', marginLeft: 16 }}>
                        was {formatNumber(prevRetCount)} · <span style={{ color: retDelta.color, fontWeight: 500 }}>{retDelta.text}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '12px 16px', maxHeight: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Browser Distribution</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 120, height: 120, maxHeight: 180 }}>
              <Doughnut
                data={browserData}
                options={{ responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }}
              />
            </div>
            <div>
              {browserLabels.map((label, i) => {
                const prevBrowsers = compare !== 'none' ? (data.comparison?.browsers ?? []) : [];
                const prevBrowser = prevBrowsers.find((b: any) => (b.browser || b.name || 'Unknown') === label);
                const prevCount = prevBrowser ? (prevBrowser.sessions || prevBrowser.users || 0) : null;
                const delta = prevCount != null ? formatDelta(browserValues[i], prevCount) : null;
                return (
                  <div key={label} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: browserColors[i] }} />
                      <span style={{ fontSize: 11 }}>{label}: {formatNumber(browserValues[i])}</span>
                    </div>
                    {delta && prevCount != null && (
                      <div style={{ fontSize: 10, color: '#5A7A8A', marginLeft: 16 }}>
                        was {formatNumber(prevCount)} · <span style={{ color: delta.color, fontWeight: 500 }}>{delta.text}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 2-column: Day of Week | Hourly Heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '12px 16px', maxHeight: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Sessions by Day of Week</div>
          <div style={{ maxHeight: 150 }}>
            <Bar
              data={dayOfWeekData}
              options={{
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: { enabled: true },
                },
                scales: {
                  x: { display: false },
                  y: { grid: { display: false }, ticks: { font: { size: 10 } } },
                },
              }}
            />
          </div>
        </div>

        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '12px 16px', maxHeight: 200 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Hourly Traffic</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 24 }}>
            {hourSessions.map((s: number, i: number) => (
              <div
                key={i}
                style={{
                  width: `calc(100% / 24)`,
                  height: 24,
                  background: `rgba(45,156,219, ${s / maxHour})`,
                  borderRight: i < 23 ? '1px solid var(--card-bg, #fff)' : 'none',
                }}
                title={`${i}:00 — ${s} sessions`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>11pm</span>
          </div>
        </div>
      </div>

      <ConsultingUpsell
        headline="84% of your visitors are new. IA builds retention strategies to grow your returning audience."
        subtext="Audience retention backed by data."
        serviceType="Audience Optimization"
        triggerPage="analytics-audience"
      />
    </div>
  );
}

/* Reusable stat card */
function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      background: 'var(--card-bg, #fff)',
      border: '1px solid var(--border, #e5e7eb)',
      borderRadius: 6,
      padding: '10px 14px',
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

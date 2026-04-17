import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_COLORS, ARION_PALETTE, CHART_FILLS, DELTA_COLORS, formatNumber, formatPct, formatDuration, bounceColor } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsAudience() {
  const { selectedSite, activeSiteId } = useArionContext();
  const { data, loading, error } = useAnalyticsData(activeSiteId);

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

  const dayOfWeekData = {
    labels: dayLabels,
    datasets: [{
      data: daySessions,
      backgroundColor: dayColors,
      borderWidth: 0,
      borderRadius: 3,
    }],
  };

  // -- Hourly heatmap --
  const hourly = data.hourlyBreakdown ?? [];
  const hourSessions = hourly.map((h: any) => h.sessions || 0);
  const maxHour = Math.max(...hourSessions, 1);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="New Users" value={formatNumber(newUsers)} accent={ARION_COLORS.sky} />
        <StatCard label="Returning Users" value={formatNumber(returningUsers)} accent={ARION_COLORS.orange} />
        <StatCard label="Scroll Depth" value={formatNumber(scrollDepth)} accent={ARION_COLORS.coreBlueMid} />
        <StatCard label="Events / Session" value={eventsPerSession.toFixed(1)} accent={ARION_COLORS.coreBlueMid} />
      </div>

      {/* 2-column: New vs Returning | Browser */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>New vs Returning</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 160, height: 160 }}>
              <Doughnut
                data={nvrData}
                options={{ responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }}
              />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#2D9CDB' }} />
                <span style={{ fontSize: 13 }}>New: {formatNumber(newUsers)} ({newPct}%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#EF6C33' }} />
                <span style={{ fontSize: 13 }}>Returning: {formatNumber(returningUsers)} ({retPct}%)</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Browser Distribution</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 160, height: 160 }}>
              <Doughnut
                data={browserData}
                options={{ responsive: true, maintainAspectRatio: true, cutout: '68%', plugins: { legend: { display: false }, tooltip: { enabled: true } } }}
              />
            </div>
            <div>
              {browserLabels.map((label, i) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: browserColors[i] }} />
                  <span style={{ fontSize: 13 }}>{label}: {formatNumber(browserValues[i])}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 2-column: Day of Week | Hourly Heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Sessions by Day of Week</div>
          <Bar
            data={dayOfWeekData}
            options={{
              indexAxis: 'y',
              responsive: true,
              plugins: {
                legend: { display: false },
                tooltip: { enabled: true },
              },
              scales: {
                x: { display: false },
                y: { grid: { display: false }, ticks: { font: { size: 11 } } },
              },
            }}
          />
        </div>

        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Hourly Traffic</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: 32 }}>
            {hourSessions.map((s: number, i: number) => (
              <div
                key={i}
                style={{
                  width: `calc(100% / 24)`,
                  height: 32,
                  background: `rgba(45,156,219, ${s / maxHour})`,
                  borderRight: i < 23 ? '1px solid var(--card-bg, #fff)' : 'none',
                }}
                title={`${i}:00 — ${s} sessions`}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
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
      borderRadius: 10,
      padding: '14px 18px',
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

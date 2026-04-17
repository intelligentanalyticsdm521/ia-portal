import React, { useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_COLORS, ARION_PALETTE, CHART_FILLS, DELTA_COLORS, PERIOD_OPTIONS, formatNumber, formatPct, formatDuration, bounceColor } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

export function AnalyticsConversions() {
  const { selectedSite, activeSiteId } = useArionContext();
  const tier = (selectedSite?.arionTier || 'standard') as keyof typeof PERIOD_OPTIONS;
  const [period, setPeriod] = useState(30);
  const [compare, setCompare] = useState<'none' | 'previous_period'>('previous_period');
  const periodOptions = PERIOD_OPTIONS[tier] || PERIOD_OPTIONS.standard;
  const canCompare = tier === 'pro' || tier === 'business';

  const { data, loading, error } = useAnalyticsData(activeSiteId, period, compare);

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading conversion data...</div>;
  }
  if (error) {
    return <div style={{ padding: 32, textAlign: 'center', color: DELTA_COLORS.negative }}>{error}</div>;
  }
  if (!selectedSite) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No ARION site selected.</div>;
  }
  if (!data) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>No conversion data available.</div>;
  }

  const engagedSessions = data.engagement?.engagedSessions ?? 0;
  const pageviewsPerSession = data.engagement?.pageviewsPerSession ?? 0;
  const engagementRate = data.engagement?.engagementRate ?? 0;
  const eventsPerSession = data.engagement?.eventsPerSession ?? 0;
  const newUsers = data.engagement?.newUsers ?? 0;
  const scrolledUsers = data.engagement?.scrolledUsers ?? 0;

  return (
    <div>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard label="Form Submissions" value="0" accent={ARION_COLORS.sky} />
        <StatCard label="Engaged Sessions" value={formatNumber(engagedSessions)} accent={ARION_COLORS.orange} />
        <StatCard label="Pages / Session" value={pageviewsPerSession.toFixed(1)} accent={ARION_COLORS.coreBlueMid} />
      </div>

      {/* Form Submissions Line Chart */}
      <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Form Submissions Over Time</div>
        <Line
          data={{
            labels: data?.sessionsByDay?.map((d: any) => d.date) || [],
            datasets: [{
              label: 'Form Submissions',
              data: data?.sessionsByDay?.map(() => 0) || [],
              borderColor: ARION_COLORS.sky,
              backgroundColor: CHART_FILLS.skyLight,
              borderWidth: 2,
              fill: true,
              tension: 0.3,
              pointRadius: 0,
            }],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              x: { ticks: { maxTicksLimit: 8, font: { size: 10 } }, grid: { display: false } },
              y: { beginAtZero: true, suggestedMax: 10 },
            },
          }}
        />
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Form submissions will appear here once visitors complete forms on your site.
        </div>
      </div>

      {/* Key Engagement Metrics */}
      <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 10, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Key Engagement Metrics</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <HealthRow label="Engaged Sessions" value={formatNumber(engagedSessions)} />
          <HealthRow label="Engagement Rate" value={formatPct(engagementRate)} />
          <HealthRow label="Events / Session" value={eventsPerSession.toFixed(1)} />
          <HealthRow label="Pages / Session" value={pageviewsPerSession.toFixed(1)} />
          <HealthRow label="New Users" value={formatNumber(newUsers)} />
          <HealthRow label="Scrolled Users" value={formatNumber(scrolledUsers)} />
        </div>
      </div>

      <ConsultingUpsell
        headline="0 form submissions this month. IA audits forms and landing pages to improve conversion rates."
        subtext="Conversion rate optimization backed by data."
        serviceType="Conversion Optimization"
        triggerPage="analytics-conversions"
      />
    </div>
  );
}

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

function HealthRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '10px 0',
      borderBottom: '1px solid var(--border, #e5e7eb)',
      fontSize: 13,
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

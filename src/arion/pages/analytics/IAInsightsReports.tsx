import React from 'react';
import { useArionContext } from '../../useArionContext';
import { ConsultingUpsell } from '../../components/Ui';

const reports = [
  { title: 'Monthly Overview', desc: 'Sessions, users, and traffic trends', color: '#2D9CDB', hasData: true },
  { title: 'Traffic Sources', desc: 'Channel performance and source quality', color: '#EF6C33', hasData: true },
  { title: 'Conversion Analysis', desc: 'Form submissions and engagement metrics', color: 'rgba(12,74,96,0.8)', hasData: true },
  { title: 'SEO Performance', desc: 'Search visibility, clicks, and rankings', color: '#2D9CDB', hasData: true },
  { title: 'Content Performance', desc: 'Top pages, engagement, and thin content', color: 'rgba(12,74,96,0.8)', hasData: true },
  { title: 'Competitor Benchmark', desc: 'Keyword gaps and position comparison', color: '#999', hasData: false },
];

export function IAInsightsReports() {
  const { selectedSite } = useArionContext();

  if (!selectedSite) {
    return <div style={{ padding: 24, color: '#5A7A8A' }}>No site selected.</div>;
  }

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', margin: 0 }}>IA Insights</h2>
          <span style={{ fontSize: 11, color: '#5A7A8A' }}>Powered by ARGUS</span>
        </div>
        <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 6 }}>
          Reports auto-generate each quarter. Next report: July 1, 2026.
        </div>
      </div>

      {/* ── Report Cards 3x2 Grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
        {reports.map((r) => (
          <div
            key={r.title}
            style={{
              background: '#fff',
              border: '1px solid rgba(45,156,219,0.12)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24' }}>{r.title}</div>
            <div style={{ fontSize: 11, color: '#5A7A8A', marginTop: 2 }}>{r.desc}</div>

            {/* Status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: r.hasData ? '#1D9E75' : '#ccc',
                }}
              />
              <span style={{ fontSize: 10, color: r.hasData ? '#1D9E75' : '#999' }}>
                {r.hasData ? 'Q1 2026 report ready' : 'Requires SE Ranking'}
              </span>
            </div>

            {/* Mini sparkline placeholder */}
            <div
              style={{
                height: 32,
                marginTop: 10,
                background: '#F2F6F9',
                borderRadius: 4,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              {r.hasData &&
                Array.from({ length: 15 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      background: r.color,
                      opacity: 0.3 + Math.random() * 0.7,
                      height: `${20 + Math.random() * 80}%`,
                    }}
                  />
                ))}
            </div>

            <div style={{ fontSize: 10, color: '#5A7A8A', marginTop: 6 }}>Jan 1 &ndash; Mar 31, 2026</div>

            <button
              style={{
                marginTop: 8,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 500,
                background: '#0B1C24',
                color: '#fff',
                border: 'none',
                borderRadius: 5,
                cursor: 'pointer',
              }}
            >
              View full report
            </button>
          </div>
        ))}
      </div>

      {/* ── STELLA Upgrade Nudge ── */}
      <div
        style={{
          background: 'rgba(45,156,219,0.04)',
          border: '1px solid rgba(45,156,219,0.12)',
          borderRadius: 10,
          padding: '14px 18px',
          marginBottom: 16,
          fontSize: 12,
          color: '#5A7A8A',
        }}
      >
        Want predictive analytics? Add STELLA for advanced BI dashboards.
      </div>

      {/* ── Consulting Upsell ── */}
      <ConsultingUpsell
        headline="Want IA to interpret your reports and build a growth plan? Talk to IA →"
        subtext="Strategy sessions included with Business plan."
        serviceType="Analytics Consulting"
        triggerPage="ia-insights-reports"
      />
    </div>
  );
}

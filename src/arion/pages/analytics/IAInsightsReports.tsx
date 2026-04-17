import React from 'react';
import { useArionContext } from '../../useArionContext';
import { ConsultingUpsell } from '../../components/Ui';

const reports = [
  { key: 'overview', title: 'Monthly Overview', desc: 'Sessions, users, and traffic trends', color: '#2D9CDB', hasData: true },
  { key: 'traffic', title: 'Traffic Sources', desc: 'Channel performance and source quality', color: '#2D9CDB', hasData: true },
  { key: 'conversion', title: 'Conversion Analysis', desc: 'Form submissions and engagement metrics', color: '#2D9CDB', hasData: true },
  { key: 'seo', title: 'SEO Performance', desc: 'Search visibility, clicks, and rankings', color: '#2D9CDB', hasData: true },
  { key: 'content', title: 'Content Performance', desc: 'Top pages, engagement, and thin content', color: '#2D9CDB', hasData: true },
  { key: 'competitor', title: 'Competitor Benchmark', desc: 'Keyword gaps and position comparison', color: '#ccc', hasData: false },
];

const MODAL_TITLES: Record<string, string> = {
  overview: 'Monthly Overview',
  traffic: 'Traffic Sources',
  conversion: 'Conversion Analysis',
  seo: 'SEO Performance',
  content: 'Content Performance',
  competitor: 'Competitor Benchmark',
};

const MODAL_SUMMARIES: Record<string, string> = {
  overview: 'A high-level summary of sessions, unique users, and traffic trends over the quarter. Use this report to track growth patterns and identify seasonal shifts.',
  traffic: 'Breaks down where your visitors come from — direct, organic search, social, referral, and paid channels. Understand which sources drive the most engaged traffic.',
  conversion: 'Analyzes form submissions, click-through rates, and engagement metrics. Identify which pages convert visitors into leads and where drop-offs occur.',
  seo: 'Tracks your search engine visibility including impressions, clicks, average position, and keyword rankings. Monitor organic search health over time.',
  content: 'Evaluates individual page performance including views, time on page, bounce rate, and thin content flags. Find your top performers and underperformers.',
  competitor: 'Compares your keyword positions and domain authority against competitors. Identify keyword gaps and opportunities to gain market share.',
};

function renderModalContent(reportKey: string) {
  return (
    <div>
      <p style={{ fontSize: 13, color: '#3A5A6A', lineHeight: 1.6, margin: '0 0 16px' }}>
        {MODAL_SUMMARIES[reportKey] || 'Report details will appear here.'}
      </p>
      <div
        style={{
          background: '#F2F6F9',
          borderRadius: 8,
          height: 220,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#5A7A8A',
          fontSize: 13,
          border: '1px dashed rgba(45,156,219,0.25)',
          marginBottom: 20,
        }}
      >
        Chart area — detailed visualizations coming soon
      </div>
    </div>
  );
}

function ReportModal({ reportKey, onClose }: { reportKey: string; onClose: () => void }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: 12, maxWidth: 900, width: '90vw', maxHeight: '85vh', overflow: 'auto', padding: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24' }}>{MODAL_TITLES[reportKey]}</div>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 2 }}>Jan 1 – Mar 31, 2026 · Q1 2026</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {renderModalContent(reportKey)}
        </div>

        {/* ARGUS Insight Box */}
        <div style={{ margin: '0 24px 20px', background: '#0B1C24', borderRadius: 10, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ background: '#97CC04', color: '#0B1C24', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 3 }}>ARGUS</span>
            <span style={{ color: '#A8CDD8', fontSize: 12 }}>Insights · Q1 2026</span>
          </div>
          <div style={{ color: '#A8CDD8', fontSize: 12, lineHeight: 1.6 }}>
            <p>1. Your site received 255 sessions this quarter with 216 unique users, showing steady organic growth.</p>
            <p>2. Direct traffic accounts for 53% of all sessions (136), suggesting strong brand awareness. Organic search contributes 18% (46 sessions) with room for growth.</p>
            <p>3. Desktop users dominate at 87% of sessions. Your mobile experience only captures 13% of traffic, indicating a potential optimization opportunity.</p>
          </div>
          <div style={{ borderTop: '1px solid rgba(168,205,216,0.2)', marginTop: 12, paddingTop: 12 }}>
            <div style={{ color: '#97CC04', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>RECOMMENDED ACTIONS</div>
            <div style={{ color: '#A8CDD8', fontSize: 12, lineHeight: 1.6 }}>
              <p style={{ display: 'flex', gap: 8 }}><span style={{ color: '#EF6C33', flexShrink: 0 }}>●</span> Audit your mobile site experience — with only 13% mobile traffic vs industry average of 55%, there may be UX issues.</p>
              <p style={{ display: 'flex', gap: 8 }}><span style={{ color: '#EF6C33', flexShrink: 0 }}>●</span> Increase content publishing frequency to boost organic search from the current 46 sessions.</p>
              <p style={{ display: 'flex', gap: 8 }}><span style={{ color: '#EF6C33', flexShrink: 0 }}>●</span> Set up Google Analytics goal tracking for form submissions to measure conversion rates.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 24px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#5A7A8A' }}>Generated by ARGUS · Q1 2026 · Next: July 1, 2026</span>
          <button onClick={onClose} style={{ padding: '8px 16px', background: '#0B1C24', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

export function IAInsightsReports() {
  const { selectedSite } = useArionContext();
  const [activeModal, setActiveModal] = React.useState<string | null>(null);

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
            key={r.key}
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
              onClick={() => setActiveModal(r.key)}
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

      {activeModal && <ReportModal reportKey={activeModal} onClose={() => setActiveModal(null)} />}
    </div>
  );
}

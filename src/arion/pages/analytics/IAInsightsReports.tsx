import React from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { useArionContext } from '../../useArionContext';
import { useAnalyticsData } from '../../analytics/useAnalyticsData';
import { ARION_PALETTE, formatNumber, formatPct, formatDuration, bounceColor } from '../../analytics/chartConfig';
import { ConsultingUpsell } from '../../components/Ui';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip);

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

function renderModalContent(reportKey: string, d: any) {
  switch (reportKey) {
    case 'overview':
      return (
        <div>
          {/* 4 stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Sessions', value: formatNumber(d?.summary?.totalSessions || 0) },
              { label: 'Users', value: formatNumber(d?.summary?.totalUsers || 0) },
              { label: 'Bounce Rate', value: formatPct(d?.summary?.bounceRate || 0) },
              { label: 'Avg Session', value: formatDuration(d?.summary?.avgSessionDuration || 0) },
            ].map(c => (
              <div key={c.label} style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>{c.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1C24', marginTop: 2 }}>{c.value}</div>
              </div>
            ))}
          </div>
          {/* Sessions line chart */}
          <div style={{ height: 200, marginBottom: 16 }}>
            <Line data={{
              labels: (d?.sessionsByDay || []).map((s: any) => s.date),
              datasets: [{ label: 'Sessions', data: (d?.sessionsByDay || []).map((s: any) => s.sessions), borderColor: '#2D9CDB', backgroundColor: 'rgba(45,156,219,0.07)', borderWidth: 2, fill: true, tension: 0.3, pointRadius: 0 }]
            }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6, font: { size: 9 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { font: { size: 9 } } } } }} />
          </div>
          {/* Channel breakdown bar */}
          <div style={{ height: 160 }}>
            <Bar data={{
              labels: (d?.channelBreakdown || []).map((c: any) => c.channel),
              datasets: [{ data: (d?.channelBreakdown || []).map((c: any) => c.sessions), backgroundColor: (d?.channelBreakdown || []).map((_: any, i: number) => ARION_PALETTE[i % 5]), borderRadius: 3, barThickness: 14 }]
            }} options={{ indexAxis: 'y' as const, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 10 } } } } }} />
          </div>
        </div>
      );

    case 'traffic':
      return (
        <div>
          {/* Source quality table */}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1C24', marginBottom: 8 }}>Source Quality Comparison</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #eee' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: '#5A7A8A', fontSize: 10, textTransform: 'uppercase' }}>Source / Medium</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>Avg Time</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: '#5A7A8A', fontSize: 10 }}>% Total</th>
              </tr>
            </thead>
            <tbody>
              {(d?.trafficSources || []).map((s: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '6px 8px' }}>{s.source} / {s.medium}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{s.sessions}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', color: bounceColor(s.bounceRate) }}>{formatPct(s.bounceRate)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatDuration(s.avgDuration || 0)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{d?.summary?.totalSessions ? Math.round(s.sessions / d.summary.totalSessions * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Geographic breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top Countries</div>
              {(d?.countries || []).slice(0, 5).map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span>{c.country}</span><span style={{ color: '#5A7A8A' }}>{c.sessions}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Top Cities</div>
              {(d?.cities || []).slice(0, 5).map((c: any, i: number) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span>{c.city}</span><span style={{ color: '#5A7A8A' }}>{c.sessions}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'conversion': {
      const engStages = [
        { label: 'Sessions', value: d?.summary?.totalSessions || 0 },
        { label: 'Engaged Sessions', value: d?.engagement?.engagedSessions || 0 },
        { label: 'Scrolled Users', value: d?.engagement?.scrolledUsers || 0 },
        { label: 'Multi-page Sessions', value: Math.round((d?.engagement?.pageviewsPerSession || 1) > 1 ? (d?.summary?.totalSessions || 0) * 0.35 : 0) },
      ];
      const engMax = Math.max(...engStages.map(s => s.value), 1);
      return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Engagement Funnel</div>
          {engStages.map((s, i) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ width: 120, fontSize: 11, flexShrink: 0 }}>{s.label}</div>
              <div style={{ flex: 1, background: '#F2F6F9', borderRadius: 3, height: 22 }}>
                <div style={{ width: `${(s.value / engMax) * 100}%`, height: '100%', background: ARION_PALETTE[i], borderRadius: 3 }} />
              </div>
              <div style={{ width: 40, fontSize: 12, fontWeight: 600, textAlign: 'right' }}>{s.value}</div>
            </div>
          ))}
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 16, marginBottom: 8 }}>High-Intent Pages</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead><tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Page</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Sessions</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Bounce</th>
              <th style={{ textAlign: 'right', padding: '5px 8px', color: '#5A7A8A', fontSize: 10 }}>Intent</th>
            </tr></thead>
            <tbody>
              {(d?.topPages || []).sort((a: any, b: any) => a.bounceRate - b.bounceRate).slice(0, 5).map((p: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '5px 8px' }}>{p.path}</td>
                  <td style={{ textAlign: 'right', padding: '5px 8px' }}>{p.sessions}</td>
                  <td style={{ textAlign: 'right', padding: '5px 8px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                  <td style={{ textAlign: 'right', padding: '5px 8px', color: p.bounceRate < 0.5 ? '#1D9E75' : p.bounceRate > 0.7 ? '#D85A30' : '#5A7A8A', fontWeight: 600 }}>
                    {p.bounceRate < 0.5 ? 'High' : p.bounceRate > 0.7 ? 'Low' : 'Medium'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'seo':
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>Impressions</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>10,869</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>Clicks</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>66</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>CTR</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>0.21%</div>
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 6, padding: '10px 12px' }}>
              <div style={{ fontSize: 9, color: '#5A7A8A', textTransform: 'uppercase' }}>Avg Position</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>22.1</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginBottom: 16 }}>GSC data for the last 90 days. Keyword rankings require SE Ranking connection.</div>
          {/* SE Ranking locked section */}
          <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 20, textAlign: 'center', opacity: 0.5, marginTop: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0B1C24' }}>Keyword Rankings</div>
            <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 4 }}>Add SEO Tools to unlock keyword rankings and position tracking</div>
            <button style={{ marginTop: 10, padding: '8px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
          </div>
        </div>
      );

    case 'content':
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top Pages by Views</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Page</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Views</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
                </tr></thead>
                <tbody>
                  {(d?.topPages || []).slice(0, 5).map((p: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px' }}>{p.views}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Top Pages by Engagement</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr style={{ borderBottom: '1px solid #eee' }}>
                  <th style={{ textAlign: 'left', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Page</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Avg Time</th>
                  <th style={{ textAlign: 'right', padding: '5px 6px', color: '#5A7A8A', fontSize: 9 }}>Bounce</th>
                </tr></thead>
                <tbody>
                  {(d?.topPages || []).sort((a: any, b: any) => (b.avgDuration || 0) - (a.avgDuration || 0)).slice(0, 5).map((p: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                      <td style={{ padding: '4px 6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.path}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px' }}>{formatDuration(p.avgDuration || 0)}</td>
                      <td style={{ textAlign: 'right', padding: '4px 6px', color: bounceColor(p.bounceRate) }}>{formatPct(p.bounceRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      );

    case 'competitor':
      return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#0B1C24' }}>SE Ranking Connection Required</div>
          <div style={{ fontSize: 12, color: '#5A7A8A', marginTop: 6, maxWidth: 400, margin: '6px auto 16px' }}>
            Competitor benchmarking uses SE Ranking to track competitor keyword positions, visibility scores, and keyword gaps.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button style={{ padding: '8px 16px', background: '#EF6C33', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add SEO Tools</button>
            <button style={{ padding: '8px 16px', background: '#fff', color: '#0B1C24', border: '1px solid #ddd', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Learn More</button>
          </div>
          {/* Greyed preview sections */}
          <div style={{ opacity: 0.3, marginTop: 24 }}>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Visibility Score Comparison</div>
              <div style={{ height: 80, background: '#eee', borderRadius: 4, marginTop: 8 }} />
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16, marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Keyword Gap Analysis</div>
              <div style={{ height: 60, background: '#eee', borderRadius: 4, marginTop: 8 }} />
            </div>
            <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Position Comparison</div>
              <div style={{ height: 60, background: '#eee', borderRadius: 4, marginTop: 8 }} />
            </div>
          </div>
        </div>
      );

    default:
      return (
        <div>
          <p style={{ fontSize: 13, color: '#3A5A6A', lineHeight: 1.6, margin: '0 0 16px' }}>
            {MODAL_SUMMARIES[reportKey] || 'Report details will appear here.'}
          </p>
        </div>
      );
  }
}

function ReportModal({ reportKey, onClose, analyticsData }: { reportKey: string; onClose: () => void; analyticsData: any }) {
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
          {renderModalContent(reportKey, analyticsData)}
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
  const { selectedSite, activeSiteId } = useArionContext();
  const [activeModal, setActiveModal] = React.useState<string | null>(null);
  const { data: analyticsData } = useAnalyticsData(activeSiteId, 90);

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

      {activeModal && <ReportModal reportKey={activeModal} onClose={() => setActiveModal(null)} analyticsData={analyticsData} />}
    </div>
  );
}

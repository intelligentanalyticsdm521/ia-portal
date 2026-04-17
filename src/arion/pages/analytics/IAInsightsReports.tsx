import React from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, Loading, TierGate, ConsultingUpsell } from '../../components/Ui';

type ReportType =
  | 'monthly-overview'
  | 'traffic-sources'
  | 'conversion-analysis'
  | 'seo-performance'
  | 'content-performance'
  | 'competitor-benchmark';

interface ReportTemplate {
  type: ReportType;
  title: string;
  description: string;
  cadence: 'monthly' | 'quarterly';
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  { type: 'monthly-overview', title: 'Monthly Overview', description: 'A high-level summary of traffic, conversions, and engagement trends for the current month.', cadence: 'monthly' },
  { type: 'traffic-sources', title: 'Traffic Sources', description: 'Breakdown of where your visitors come from: organic, paid, social, referral, and direct channels.', cadence: 'monthly' },
  { type: 'conversion-analysis', title: 'Conversion Analysis', description: 'Tracks goal completions, conversion rates, and identifies drop-off points in your funnel.', cadence: 'quarterly' },
  { type: 'seo-performance', title: 'SEO Performance', description: 'Organic search metrics including keyword rankings, impressions, clicks, and CTR over time.', cadence: 'monthly' },
  { type: 'content-performance', title: 'Content Performance', description: 'Identifies top-performing pages and blog posts by engagement, time on page, and conversions.', cadence: 'quarterly' },
  { type: 'competitor-benchmark', title: 'Competitor Benchmark', description: 'Compares your key metrics against industry benchmarks and identified competitors.', cadence: 'quarterly' },
];

/** Compute the next report date based on cadence */
function getNextReportDate(cadence: 'monthly' | 'quarterly'): string {
  const now = new Date();
  if (cadence === 'monthly') {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  // quarterly: next quarter start
  const qMonth = Math.ceil((now.getMonth() + 1) / 3) * 3;
  const next = new Date(now.getFullYear(), qMonth, 1);
  return next.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function IAInsightsReports() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  /* Fetch past reports if the API supports it */
  const { data: pastReports, loading: reportsLoading } = useArionData(
    () => activeSiteId ? arionApi.getAnalyticsReport(activeSiteId, 'all' as any).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const pastMap: Record<string, any[]> = {};
  if (pastReports && typeof pastReports === 'object') {
    const items = Array.isArray(pastReports) ? pastReports : (pastReports as any)?.items ?? [];
    items.forEach((r: any) => {
      const key = r.type ?? r.reportType ?? '';
      if (!pastMap[key]) pastMap[key] = [];
      pastMap[key].push(r);
    });
  }

  return (
    <TierGate currentTier={tier} requiredTier="pro" featureName="IA Insights Reports">
      <div>
        {/* ARGUS branding */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'right' }}>
          Powered by <strong>ARGUS</strong>
        </div>

        {/* Report template cards — auto-schedule format */}
        <div className="grid2">
          {REPORT_TEMPLATES.map((r) => {
            const past = pastMap[r.type] ?? [];
            const nextDate = getNextReportDate(r.cadence);
            return (
              <Card key={r.type} title={r.title}>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{r.description}</div>

                {/* Schedule info */}
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                  Next report: auto-generated {r.cadence}
                </div>

                {/* Mini placeholder chart area */}
                <div style={{
                  height: 48,
                  background: 'var(--bg-muted, #f3f4f6)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'flex-end',
                  padding: '0 8px 4px',
                  gap: 3,
                  marginBottom: 10,
                }}>
                  {[35, 50, 40, 65, 55, 70, 60, 80, 72, 85].map((h, i) => (
                    <div key={i} style={{
                      flex: 1,
                      height: `${h}%`,
                      background: 'var(--accent, #3b82f6)',
                      opacity: 0.25,
                      borderRadius: '2px 2px 0 0',
                    }} />
                  ))}
                </div>

                {/* Past reports or next date */}
                {past.length > 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {past.slice(0, 3).map((p: any, i: number) => (
                      <div key={i} style={{ marginBottom: 2 }}>
                        {p.date ?? p.createdAt ?? 'Past report'}{p.title ? ` — ${p.title}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Next {r.cadence} report: {nextDate}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        <ConsultingUpsell
          headline="Want IA to interpret your reports and build a growth plan?"
          subtext="Strategy sessions included with Business plan."
          serviceType="Analytics Consulting"
          triggerPage="ia-insights-reports"
        />
      </div>
    </TierGate>
  );
}

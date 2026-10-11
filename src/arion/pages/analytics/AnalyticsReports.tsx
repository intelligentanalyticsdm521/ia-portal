import React from 'react';
import { useArionContext } from '../../useArionContext';
import { Card, TierGate, EmptyPanel, ConsultingUpsell } from '../../components/Ui';

const REPORT_TEMPLATES = [
  { title: 'Best Day & Time to Post', type: 'best-day-time', description: 'Discover when your audience is most active and engaged.' },
  { title: 'Lead Source Quality', type: 'lead-source-quality', description: 'Compare which traffic sources generate the highest-quality leads.' },
  { title: 'Content Performance', type: 'content-performance', description: 'Identify your top-performing blog posts and landing pages.' },
  { title: 'Monthly Traffic Summary', type: 'monthly-overview', description: 'A concise overview of sessions, users, and conversions each month.' },
  { title: 'Goal Completion Funnel', type: 'conversion-analysis', description: 'Track how visitors move through your key conversion paths.' },
  { title: 'Device & Browser Report', type: 'traffic-sources', description: 'Understand which devices and browsers your visitors use.' },
];

export function AnalyticsReports() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const [results, setResults] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState<Record<string, boolean>>({});

  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const viewReport = async (reportType: string) => {
    if (!activeSiteId) return;
    setLoading(prev => ({ ...prev, [reportType]: true }));
    try {
      const result = await arionApi.getAnalyticsReport(activeSiteId, reportType);
      setResults(prev => ({ ...prev, [reportType]: result }));
    } finally {
      setLoading(prev => ({ ...prev, [reportType]: false }));
    }
  };

  return (
    <div>
      <TierGate featureKey="arion_analytics_reports" featureName="Curated analytics reports">
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          Reports compare current month vs last month when generated.
        </div>
        <div className="grid2">
          {REPORT_TEMPLATES.map((r) => (
            <Card key={r.title} title={r.title}>
              <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>
              <button className="btn" style={{ marginTop: 12 }}
                onClick={() => viewReport(r.type)}
                disabled={loading[r.type]}>
                {loading[r.type] ? 'Loading...' : 'View Report'}
              </button>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Next report: auto-generated monthly</div>
              {results[r.type] && (
                <pre style={{ fontSize: 10, marginTop: 8, whiteSpace: 'pre-wrap', background: 'var(--arion-sky-tint)', padding: 8, borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
                  {JSON.stringify(results[r.type], null, 2)}
                </pre>
              )}
            </Card>
          ))}
        </div>
      </TierGate>

      <ConsultingUpsell
        headline="Want IA to interpret these reports and recommend next steps? Book a strategy session."
        subtext="Monthly strategy sessions with your analytics data."
        serviceType="Analytics Consulting"
        triggerPage="analytics-reports"
      />
    </div>
  );
}

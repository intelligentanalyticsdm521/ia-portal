import React from 'react';
import { useArionContext } from '../../useArionContext';
import { Card, Loading, ErrorBanner, TierGate, ConsultingUpsell } from '../../components/Ui';

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
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  { type: 'monthly-overview', title: 'Monthly Overview', description: 'A high-level summary of traffic, conversions, and engagement trends for the current month.' },
  { type: 'traffic-sources', title: 'Traffic Sources', description: 'Breakdown of where your visitors come from: organic, paid, social, referral, and direct channels.' },
  { type: 'conversion-analysis', title: 'Conversion Analysis', description: 'Tracks goal completions, conversion rates, and identifies drop-off points in your funnel.' },
  { type: 'seo-performance', title: 'SEO Performance', description: 'Organic search metrics including keyword rankings, impressions, clicks, and CTR over time.' },
  { type: 'content-performance', title: 'Content Performance', description: 'Identifies top-performing pages and blog posts by engagement, time on page, and conversions.' },
  { type: 'competitor-benchmark', title: 'Competitor Benchmark', description: 'Compares your key metrics against industry benchmarks and identified competitors.' },
];

export function IAInsightsReports() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  const [loadingMap, setLoadingMap] = React.useState<Record<string, boolean>>({});
  const [resultsMap, setResultsMap] = React.useState<Record<string, any>>({});
  const [errorMap, setErrorMap] = React.useState<Record<string, string | null>>({});

  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const handleGenerate = async (reportType: ReportType) => {
    if (!activeSiteId) return;
    setLoadingMap((prev) => ({ ...prev, [reportType]: true }));
    setErrorMap((prev) => ({ ...prev, [reportType]: null }));
    setResultsMap((prev) => ({ ...prev, [reportType]: null }));
    try {
      const result = await arionApi.getAnalyticsReport(activeSiteId, reportType);
      setResultsMap((prev) => ({ ...prev, [reportType]: result }));
    } catch (err: any) {
      setErrorMap((prev) => ({ ...prev, [reportType]: err?.message ?? 'Failed to generate report.' }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [reportType]: false }));
    }
  };

  return (
    <TierGate currentTier={tier} requiredTier="pro" featureName="IA Insights Reports">
      <div>
        {/* ARGUS branding */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'right' }}>
          Powered by <strong>ARGUS</strong>
        </div>

        {/* Report template cards */}
        <div className="grid2">
          {REPORT_TEMPLATES.map((r) => (
            <Card key={r.type} title={r.title}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>{r.description}</div>

              <button
                className="btn"
                disabled={loadingMap[r.type] || !activeSiteId}
                onClick={() => handleGenerate(r.type)}
              >
                {loadingMap[r.type] ? 'Generating...' : 'Generate Report'}
              </button>

              {errorMap[r.type] && (
                <div style={{ marginTop: 8 }}>
                  <ErrorBanner message={errorMap[r.type]!} />
                </div>
              )}

              {resultsMap[r.type] && (
                <div style={{ marginTop: 12, padding: 12, background: 'var(--card-bg-alt, #f9fafb)', borderRadius: 8, fontSize: 12 }}>
                  <strong>Report Generated</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                    {typeof resultsMap[r.type] === 'string'
                      ? resultsMap[r.type]
                      : JSON.stringify(resultsMap[r.type], null, 2)}
                  </pre>
                </div>
              )}
            </Card>
          ))}
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

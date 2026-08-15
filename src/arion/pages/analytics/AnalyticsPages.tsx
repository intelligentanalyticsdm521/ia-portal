import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, TierGate, EmptyPanel, Loading, PlatformTabs, ConsultingUpsell } from '../../components/Ui';
import { ReportBar } from '../../../components/insights/ReportBar';
import { useArionInsightsPayload } from '../../../hooks/useArionInsightsPayload';

export function AnalyticsPages() {
  // Reports covering THIS function (Brandon 2026-08-14). Declared above
  // any early return — a hook below one runs on some renders only.
  const insightsPayload = useArionInsightsPayload();

  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider] = useState<'google'>('google');

  const { data: analytics, loading: analyticsLoading } = useArionData(
    () => activeSiteId ? arionApi.getAnalytics(provider, activeSiteId) : Promise.resolve(null),
    [activeSiteId, provider]
  );

  if (analyticsLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const a = analytics as Record<string, any> | null;
  const topPages = (a?.breakdowns?.topPages as any[]) ?? [];

  return (
    <TierGate currentTier={tier} requiredTier="pro" featureName="Page drill-down analytics">
      <ReportBar detail={insightsPayload?.detail} reports={[
        { id: 'top_pages', label: 'Top pages' },
        { id: 'engagement_by_page', label: 'Engagement by page' },
        { id: 'page_titles_read', label: 'What gets read' },
      ]} />
      <PlatformTabs
        tabs={[{ key: 'google', label: 'Google' }]}
        active={provider}
        onChange={() => {}}
      />

      <Card title="Top Pages">
        <table className="data-table">
          <thead>
            <tr><th>Page</th><th>Sessions</th><th>Avg Time</th><th>Bounce Rate</th></tr>
          </thead>
          <tbody>
            {topPages.length > 0 ? topPages.map((p: any, i: number) => (
              <tr key={i}>
                <td>{p.page ?? p.path ?? '--'}</td>
                <td>{p.sessions ?? '--'}</td>
                <td>{p.avgTime ?? p.avg_time ?? '--'}</td>
                <td>{p.bounceRate ?? p.bounce_rate ?? '--'}</td>
              </tr>
            )) : (
              <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No page data available</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <ConsultingUpsell
        headline="Want IA to analyze your top-performing content? We find patterns others miss."
        subtext="Content performance analysis and optimization."
        serviceType="Analytics Consulting"
        triggerPage="analytics-pages"
      />
    </TierGate>
  );
}

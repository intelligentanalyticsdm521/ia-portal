import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, TierGate, EmptyPanel, Loading, PlatformTabs, ConsultingUpsell } from '../../components/Ui';

export function AnalyticsPages() {
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

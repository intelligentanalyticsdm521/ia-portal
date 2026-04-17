import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, TierGate, EmptyPanel, Loading, PlatformTabs, ConsultingUpsell } from '../../components/Ui';
import { DonutChart } from '../../components/Charts';

export function AnalyticsTraffic() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider, setProvider] = useState<'google' | 'bing'>('google');

  const { data: analytics, loading: analyticsLoading } = useArionData(
    () => activeSiteId ? arionApi.getAnalytics(provider, activeSiteId) : Promise.resolve(null),
    [activeSiteId, provider]
  );

  if (analyticsLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const a = analytics as Record<string, any> | null;
  const topSources = (a?.breakdowns?.topSources as any[]) ?? [];
  const devices = (a?.breakdowns?.devices as any[]) ?? [];
  const ga4Connected = a != null && (topSources.length > 0 || devices.length > 0);

  return (
    <TierGate currentTier={tier} requiredTier="standard" featureName="Traffic channel and device analytics">
      <PlatformTabs
        tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]}
        active={provider}
        onChange={(t: string) => setProvider(t as 'google' | 'bing')}
      />

      {/* GA4 not-connected prompt */}
      {!ga4Connected && (
        <Card title="Connect Google Analytics">
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Connect Google Analytics to view traffic data</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Link your GA4 property to see channel distribution, device breakdown, and traffic sources.
            </p>
            <a href="/app/settings" className="btn" style={{ display: 'inline-block', padding: '8px 20px', fontSize: 13 }}>
              Go to Settings
            </a>
          </div>
        </Card>
      )}

      {ga4Connected && topSources.length > 0 && (
        <Card title="Channel Distribution">
          <DonutChart
            data={topSources.map((s: any) => ({
              name: s.channel ?? s.source ?? 'Unknown',
              value: Number(s.sessions) || 0,
            }))}
            dataKey="value"
            nameKey="name"
            height={250}
          />
        </Card>
      )}

      {ga4Connected && devices.length > 0 && (
        <Card title="Device Distribution">
          <DonutChart
            data={devices.map((d: any) => ({
              name: d.device ?? d.name ?? 'Unknown',
              value: Number(d.sessions ?? d.share ?? d.percent) || 0,
            }))}
            dataKey="value"
            nameKey="name"
            height={250}
          />
        </Card>
      )}

      {ga4Connected && (
        <Card title="Channel Breakdown">
          <table className="data-table">
            <thead>
              <tr><th>Channel</th><th>Sessions</th><th>%</th><th>Change</th></tr>
            </thead>
            <tbody>
              {topSources.length > 0 ? topSources.map((s: any, i: number) => (
                <tr key={i}>
                  <td>{s.channel ?? s.source ?? '--'}</td>
                  <td>{s.sessions ?? '--'}</td>
                  <td>{s.percent ?? '--'}</td>
                  <td className={Number(s.change) >= 0 ? 'pos' : 'neg'}>{s.change ?? '--'}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No traffic data available</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {ga4Connected && (
        <Card title="Device Split">
          <table className="data-table">
            <thead>
              <tr><th>Device</th><th>Share</th></tr>
            </thead>
            <tbody>
              {devices.length > 0 ? devices.map((d: any, i: number) => (
                <tr key={i}>
                  <td>{d.device ?? d.name ?? '--'}</td>
                  <td>{d.share ?? d.percent ?? '--'}</td>
                </tr>
              )) : (
                <tr><td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No device data available</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      {/* Pro tier features messaging */}
      {tier === 'standard' && (
        <Card title="Advanced Traffic Analytics">
          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ fontWeight: 500, marginBottom: 6, color: 'var(--text)' }}>Upgrade to Pro</div>
            <p style={{ margin: 0 }}>Get advanced traffic segmentation, custom date ranges, landing page analysis, and user flow visualization.</p>
          </div>
        </Card>
      )}

      <ConsultingUpsell
        headline="Not sure which traffic sources to invest in? IA builds channel-specific growth strategies."
        subtext="Channel optimization based on your traffic data."
        serviceType="Analytics Consulting"
        triggerPage="analytics-traffic"
      />
    </TierGate>
  );
}

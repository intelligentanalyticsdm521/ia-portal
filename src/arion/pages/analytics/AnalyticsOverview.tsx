import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, TierGate, MiniBarChart, EmptyPanel, Loading, PlatformTabs, ConsultingUpsell } from '../../components/Ui';
import { AreaTrendChart } from '../../components/Charts';

export function AnalyticsOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider, setProvider] = useState<'google' | 'bing'>('google');
  const [period] = useState('30d');

  const { data: analyticsData, loading: analyticsLoading } = useArionData(
    () => activeSiteId ? arionApi.getAnalytics(provider, activeSiteId) : Promise.resolve(null),
    [activeSiteId, provider]
  );

  const { data: overview, loading: ovLoading } = useArionData(
    () => activeSiteId ? arionApi.getOverview(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: forms, loading: formsLoading } = useArionData(
    () => activeSiteId ? arionApi.getForms(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (ovLoading || formsLoading || analyticsLoading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const ov = overview as Record<string, any> | null;
  const ad = analyticsData as Record<string, any> | null;
  const formsData = forms as any;
  const formCountApi = ov?.overview?.formSubmissions30d;
  const formCountForms = formsData?.meta?.total ?? (Array.isArray(formsData) ? formsData.length : null);
  const formCount = formCountApi ?? formCountForms ?? '--';
  const sessions = ad?.summary?.sessions ?? ov?.overview?.sessions ?? '--';
  const sessionsDelta = ad?.summary?.sessionsDelta ?? null;
  const gscClicks = ad?.summary?.clicks ?? ov?.overview?.clicks ?? '--';
  const clicksDelta = ad?.summary?.clicksDelta ?? null;
  const gscImpressions = ad?.summary?.impressions ?? ov?.overview?.impressions ?? '--';
  const impressionsDelta = ad?.summary?.impressionsDelta ?? null;
  const trafficValues = ad?.summary?.trafficLast30Days ?? ov?.overview?.trafficLast30Days;

  const ga4Connected = sessions !== '--';

  const fmtDelta = (d: number | null) => d == null ? '' : d >= 0 ? ` (+${d}%)` : ` (${d}%)`;

  return (
    <TierGate currentTier={tier} requiredTier="standard" featureName="Analytics — sessions, conversions, traffic insights">
      {/* Header row with platform tabs and period selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <PlatformTabs
          tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]}
          active={provider}
          onChange={(t: string) => setProvider(t as 'google' | 'bing')}
        />
        <select
          value={period}
          disabled
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border, #d1d5db)',
            fontSize: 13,
            background: 'var(--card-bg, #fff)',
            color: 'var(--text, #111)',
            cursor: 'default',
          }}
          title="More date ranges available on Pro tier"
        >
          <option value="30d">Last 30 Days</option>
          <option value="7d" disabled>Last 7 Days (Pro)</option>
          <option value="90d" disabled>Last 90 Days (Pro)</option>
          <option value="12m" disabled>Last 12 Months (Pro)</option>
        </select>
      </div>

      {/* Website Sessions chart or GA4 connect prompt */}
      {ga4Connected ? (
        <Card title={`Website Sessions — Last 30 Days${fmtDelta(sessionsDelta)}`}>
          {Array.isArray(trafficValues) && trafficValues.length > 0 ? (
            <AreaTrendChart
              data={trafficValues.map((v: number, i: number) => ({ label: `Day ${i + 1}`, sessions: v }))}
              dataKey="sessions"
              xKey="label"
              color="#2D9CDB"
              height={220}
            />
          ) : (
            <MiniBarChart values={Array.isArray(trafficValues) ? trafficValues : []} height={56} />
          )}
          <div style={{ textAlign: 'right', fontSize: 22, fontWeight: 700, marginTop: 8 }}>{sessions}</div>
        </Card>
      ) : (
        <Card title="Website Sessions">
          <div style={{ padding: '32px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>Connect Google Analytics</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Connect your GA4 property to see website session data here.
            </p>
            <a href="/app/settings" className="btn" style={{ display: 'inline-block', padding: '8px 20px', fontSize: 13 }}>
              Go to Settings
            </a>
          </div>
        </Card>
      )}

      {/* Compact stat summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Form Submissions (30d)</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{formCount}</div>
        </div>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Search Clicks (30d){fmtDelta(clicksDelta)}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{gscClicks}</div>
        </div>
        <div style={{ background: 'var(--card-bg, #fff)', border: '1px solid var(--border, #e5e7eb)', borderRadius: 8, padding: '10px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Impressions (30d){fmtDelta(impressionsDelta)}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{gscImpressions}</div>
        </div>
      </div>

      {/* Channel Breakdown placeholder */}
      <Card title="Channel Breakdown">
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {ga4Connected
            ? 'Channel breakdown data is loading from your analytics provider.'
            : 'Connect GA4 to see channel data'}
        </div>
      </Card>

      <ConsultingUpsell
        headline="Want IA to interpret this data and build a growth plan? We turn analytics into actions."
        subtext="Data-driven growth strategies from our analytics team."
        serviceType="Analytics Consulting"
        triggerPage="analytics-overview"
      />
    </TierGate>
  );
}

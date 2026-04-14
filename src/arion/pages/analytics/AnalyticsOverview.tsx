import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { StatCard, Card, TierGate, MiniBarChart, EmptyPanel, Loading, PlatformTabs, ConsultingUpsell } from '../../components/Ui';
import { AreaTrendChart, DonutChart } from '../../components/Charts';

export function AnalyticsOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider, setProvider] = useState<'google' | 'bing'>('google');

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
  const bookingRequests = ov?.overview?.bookingRequests30d ?? '--';
  const sessions = ad?.summary?.sessions ?? ov?.overview?.sessions ?? '--';
  const sessionsDelta = ad?.summary?.sessionsDelta ?? null;
  const gscClicks = ad?.summary?.clicks ?? ov?.overview?.clicks ?? '--';
  const clicksDelta = ad?.summary?.clicksDelta ?? null;
  const gscImpressions = ad?.summary?.impressions ?? ov?.overview?.impressions ?? '--';
  const impressionsDelta = ad?.summary?.impressionsDelta ?? null;
  const trafficValues = ad?.summary?.trafficLast30Days ?? ov?.overview?.trafficLast30Days;

  const fmtDelta = (d: number | null) => d == null ? '' : d >= 0 ? ` (+${d}%)` : ` (${d}%)`;

  return (
    <TierGate currentTier={tier} requiredTier="standard" featureName="Analytics — sessions, conversions, traffic insights">
      <PlatformTabs
        tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]}
        active={provider}
        onChange={(t: string) => setProvider(t as 'google' | 'bing')}
      />

      <div className="grid4">
        <StatCard label="Form Submissions (30d)" value={formCount} />
        <StatCard label="Booking Requests (30d)" value={bookingRequests} />
        <StatCard label={`Search Clicks (30d)${fmtDelta(clicksDelta)}`} value={gscClicks} />
        <StatCard label={`Search Impressions (30d)${fmtDelta(impressionsDelta)}`} value={gscImpressions} />
      </div>

      {sessions !== '--' && (
        <Card title={`Sessions — Last 30 Days${fmtDelta(sessionsDelta)}`}>
          <StatCard label={`${provider === 'google' ? 'GA4' : 'Bing'} Sessions`} value={sessions} />
          {Array.isArray(trafficValues) && trafficValues.length > 0 && (
            <AreaTrendChart
              data={trafficValues.map((v: number, i: number) => ({ label: `Day ${i + 1}`, sessions: v }))}
              dataKey="sessions"
              xKey="label"
              color="#2D9CDB"
              height={200}
            />
          )}
          <MiniBarChart values={Array.isArray(trafficValues) ? trafficValues : []} height={56} />
        </Card>
      )}

      {(formCount !== '--' || bookingRequests !== '--') && (
        <Card title="Submissions vs Bookings">
          <DonutChart
            data={[
              { name: 'Form Submissions', value: typeof formCount === 'number' ? formCount : parseInt(formCount) || 0 },
              { name: 'Booking Requests', value: typeof bookingRequests === 'number' ? bookingRequests : parseInt(bookingRequests as string) || 0 },
            ].filter((d) => d.value > 0)}
            dataKey="value"
            nameKey="name"
            height={200}
          />
        </Card>
      )}
      <ConsultingUpsell
        headline="Want IA to interpret this data and build a growth plan? We turn analytics into actions."
        subtext="Data-driven growth strategies from our analytics team."
        serviceType="Analytics Consulting"
        triggerPage="analytics-overview"
      />
    </TierGate>
  );
}

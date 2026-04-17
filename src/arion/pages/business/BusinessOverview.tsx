import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, StatCard, InfoCard, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';

export function BusinessOverview() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getMyBusiness('google', activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  const { data: insightsData } = useArionData(
    () => activeSiteId ? arionApi.getGbpInsights(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as Record<string, any> | null;
  const profile = d?.profile ?? null;
  const ins = insightsData as Record<string, any> | null;
  const metrics = ins?.data ?? ins ?? {};

  return (
    <div>
      {!profile?.connected && (
        <InfoCard title="Google Business Profile — Not Connected">
          <p style={{ margin: 0 }}>Connect your Google Business Profile to see reviews, insights, and manage your listing.</p>
        </InfoCard>
      )}

      {/* GBP stat row */}
      <div className="stat-row" style={{ marginTop: 12 }}>
        <StatCard label="Search Impressions" value={metrics.search_impressions ?? metrics.searchImpressions ?? '--'} />
        <StatCard label="Direction Requests" value={metrics.direction_requests ?? metrics.directionRequests ?? '--'} />
        <StatCard label="Website Clicks" value={metrics.website_clicks ?? metrics.websiteClicks ?? '--'} />
        <StatCard label="Phone Calls" value={metrics.call_clicks ?? metrics.callClicks ?? '--'} />
      </div>

      <Card title="Google Business Profile">
        {profile ? (
          <div className="profile-fields">
            <div className="field-row"><strong>Business Name</strong><span>{profile.displayName ?? '--'}</span></div>
            <div className="field-row"><strong>Phone</strong><span>{profile.phone ?? '--'}</span></div>
            <div className="field-row"><strong>Website</strong><span>{profile.websiteUrl ?? '--'}</span></div>
            <div className="field-row"><strong>Address</strong><span>{profile.address == null ? '--' : typeof profile.address === 'string' ? profile.address : [profile.address.addressLines, profile.address.locality, profile.address.administrativeArea, profile.address.postalCode, profile.address.regionCode].flat().filter(Boolean).join(', ') || '--'}</span></div>
            <div className="field-row"><strong>Categories</strong><span>{profile.primaryCategory ?? '--'}</span></div>
          </div>
        ) : (
          <EmptyPanel message="No Google Business Profile data available." />
        )}
      </Card>

      <ConsultingUpsell
        headline="Dominate local search. IA manages your entire local presence — GBP, Bing, Apple Maps."
        subtext="Full-service local SEO management included with Pro+ plans."
        serviceType="Local SEO"
        triggerPage="business-overview"
      />
    </div>
  );
}

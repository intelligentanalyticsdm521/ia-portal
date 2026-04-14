import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { MetricCard, Card, EmptyPanel, Loading, ConsultingUpsell } from '../../components/Ui';
import { MultiLineChart } from '../../components/Charts';

export function BusinessInsights() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getGbpInsights(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as Record<string, any> | null;
  const snapshots = (d?.data as any[]) ?? [];

  if (snapshots.length === 0) {
    return (
      <div>
        <div className="mcards">
          <MetricCard label="Search Impressions" value="--" />
          <MetricCard label="Website Clicks" value="--" />
          <MetricCard label="Direction Requests" value="--" />
          <MetricCard label="Phone Calls" value="--" />
        </div>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: '24px 0' }}>
          Data will populate once GBP insights sync begins.
        </div>
        <ConsultingUpsell
          headline="IA manages your entire local presence — GBP, Bing, Apple Maps."
          subtext="Full-service local SEO management included with Pro+ plans."
          serviceType="Local SEO"
          triggerPage="business-insights"
        />
      </div>
    );
  }

  const totals = snapshots.reduce(
    (acc: any, s: any) => ({
      searchImpressions: acc.searchImpressions + (Number(s.search_impressions) || 0),
      websiteClicks: acc.websiteClicks + (Number(s.website_clicks) || 0),
      directionRequests: acc.directionRequests + (Number(s.direction_requests) || 0),
      callClicks: acc.callClicks + (Number(s.call_clicks) || 0),
    }),
    { searchImpressions: 0, websiteClicks: 0, directionRequests: 0, callClicks: 0 }
  );

  return (
    <>
      <div className="mcards">
        <MetricCard label="Search Impressions" value={totals.searchImpressions.toLocaleString()} />
        <MetricCard label="Website Clicks" value={totals.websiteClicks.toLocaleString()} />
        <MetricCard label="Direction Requests" value={totals.directionRequests.toLocaleString()} />
        <MetricCard label="Phone Calls" value={totals.callClicks.toLocaleString()} />
      </div>

      {snapshots.length > 0 && (
        <Card title="30-Day Trend">
          <MultiLineChart
            data={snapshots.map((s: any) => ({
              date: s.snapshot_date ?? '',
              search_impressions: Number(s.search_impressions) || 0,
              website_clicks: Number(s.website_clicks) || 0,
              direction_requests: Number(s.direction_requests) || 0,
            }))}
            xKey="date"
            lines={[
              { dataKey: 'search_impressions', color: '#2D9CDB', name: 'Impressions' },
              { dataKey: 'website_clicks', color: '#EF6C33', name: 'Website Clicks' },
              { dataKey: 'direction_requests', color: '#16A34A', name: 'Directions' },
            ]}
            height={250}
          />
        </Card>
      )}

      <Card title="30-Day Detail">
        <table className="tbl">
          <thead>
            <tr><th>Date</th><th>Search Impressions</th><th>Map Views</th><th>Website Clicks</th><th>Directions</th><th>Calls</th></tr>
          </thead>
          <tbody>
            {snapshots.map((s: any, i: number) => (
              <tr key={i}>
                <td>{s.snapshot_date ?? '--'}</td>
                <td>{s.search_impressions ?? '--'}</td>
                <td>{s.map_views ?? '--'}</td>
                <td>{s.website_clicks ?? '--'}</td>
                <td>{s.direction_requests ?? '--'}</td>
                <td>{s.call_clicks ?? '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <ConsultingUpsell
        headline={`${totals.directionRequests} direction requests this month — IA maximizes your local visibility.`}
        subtext="Local SEO management drives more calls, visits, and directions."
        serviceType="Local SEO"
        triggerPage="business-insights"
      />
    </>
  );
}

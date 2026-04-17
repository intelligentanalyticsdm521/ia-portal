import { StatCard, Card, Loading, EmptyPanel, ConsultingUpsell, InfoCard } from '../../components/Ui';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';

export function WebsiteContent() {
  const { selectedSite, activeSiteId, arionApi, loading } = useArionContext();

  const { data: hosting, loading: hL } = useArionData(
    () => activeSiteId ? arionApi.getHosting(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  const { data: overview, loading: oL } = useArionData(
    () => activeSiteId ? arionApi.getOverview(activeSiteId) : Promise.resolve(null),
    [activeSiteId]
  );
  // Fetch GA4 analytics for page view data
  const { data: analytics } = useArionData(
    () => activeSiteId ? arionApi.getAnalytics('google', activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );

  if (loading || hL || oL) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No site selected." />;

  const h = (hosting as Record<string, any>) ?? {};
  const ov = (overview as Record<string, any>) ?? {};
  const content = h.content ?? {};
  const pages = content.pages ?? '--';
  const posts = content.posts ?? '--';
  const formCount = ov?.overview?.formSubmissions30d ?? '--';
  const recentPages = Array.isArray(content.recentPages) ? content.recentPages : [];
  const recentPosts = Array.isArray(content.recentPosts) ? content.recentPosts : [];

  // Check GA4 connection status from overview
  const gaConnected = ov?.integrations?.googleAnalytics === true;

  // Build a lookup of page path -> view counts from GA4 page data
  const gaData = analytics as Record<string, any> | null;
  const pageRows = (gaData?.data?.pages ?? gaData?.breakdowns?.pages ?? []) as any[];
  const viewLookup: Record<string, { views7d: number; views30d: number }> = {};
  for (const row of pageRows) {
    const path = row.page_path || row.pagePath || row.path || '';
    viewLookup[path] = {
      views7d: row.views_7d ?? row.views7d ?? row.screenPageViews7d ?? 0,
      views30d: row.views_30d ?? row.views30d ?? row.screenPageViews ?? row.screenPageViews30d ?? 0,
    };
  }

  const getViews = (item: any) => {
    const slug = item.slug || '';
    const path = `/${slug}` === '/' ? '/' : `/${slug}/`;
    const match = viewLookup[path] || viewLookup[`/${slug}`] || viewLookup[slug] || null;
    return { views7d: match?.views7d ?? '--', views30d: match?.views30d ?? '--' };
  };

  const renderTitle = (item: any) => {
    if (!item.title) return '--';
    return typeof item.title === 'string' ? item.title : item.title.rendered || '--';
  };

  return (
    <div>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <StatCard label="Pages" value={String(pages)} />
        <StatCard label="Blog Posts" value={String(posts)} />
        <StatCard label="Forms" value={String(formCount)} />
      </div>

      {!gaConnected && (
        <InfoCard title="Google Analytics Not Connected">
          <p style={{ margin: 0 }}>Connect Google Analytics to see 7-day and 30-day page view data. View counts will show '--' until GA4 is linked.</p>
        </InfoCard>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Card title="Top Pages">
          {recentPages.length > 0 ? (
            <table className="tbl">
              <thead><tr><th>Title</th><th>Last Modified</th><th>7d Views</th><th>30d Views</th></tr></thead>
              <tbody>
                {recentPages.map((p: any) => {
                  const v = getViews(p);
                  return (
                    <tr key={p.id}>
                      <td><a href={p.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 12 }}>{renderTitle(p)}</a></td>
                      <td>{p.modified ? new Date(p.modified).toLocaleDateString() : '--'}</td>
                      <td>{String(v.views7d)}</td>
                      <td>{String(v.views30d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyPanel message="No page data available." />
          )}
        </Card>

        <Card title="Top Posts">
          {recentPosts.filter((p: any) => { const title = typeof p.title === 'string' ? p.title : p.title?.rendered || ''; return title.toLowerCase() !== 'test'; }).length > 0 ? (
            <table className="tbl">
              <thead><tr><th>Title</th><th>Last Modified</th><th>7d Views</th><th>30d Views</th></tr></thead>
              <tbody>
                {recentPosts.filter((p: any) => { const title = typeof p.title === 'string' ? p.title : p.title?.rendered || ''; return title.toLowerCase() !== 'test'; }).map((p: any) => {
                  const v = getViews(p);
                  return (
                    <tr key={p.id}>
                      <td><a href={p.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 12 }}>{renderTitle(p)}</a></td>
                      <td>{p.modified ? new Date(p.modified).toLocaleDateString() : '--'}</td>
                      <td>{String(v.views7d)}</td>
                      <td>{String(v.views30d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <EmptyPanel message="No post data available." />
          )}
        </Card>

        <Card title="Most Recent Pages">
          {recentPages.length > 0 ? (
            <table className="tbl">
              <thead><tr><th>Title</th><th>Last Modified</th></tr></thead>
              <tbody>
                {[...recentPages].sort((a: any, b: any) => new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime()).map((p: any) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 12 }}>{renderTitle(p)}</td>
                    <td>{p.modified ? new Date(p.modified).toLocaleDateString() : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel message="No page data available." />
          )}
        </Card>

        <Card title="Most Recent Posts">
          {recentPosts.filter((p: any) => { const title = typeof p.title === 'string' ? p.title : p.title?.rendered || ''; return title.toLowerCase() !== 'test'; }).length > 0 ? (
            <table className="tbl">
              <thead><tr><th>Title</th><th>Last Modified</th></tr></thead>
              <tbody>
                {[...recentPosts].filter((p: any) => { const title = typeof p.title === 'string' ? p.title : p.title?.rendered || ''; return title.toLowerCase() !== 'test'; }).sort((a: any, b: any) => new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime()).map((p: any) => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 12 }}>{renderTitle(p)}</td>
                    <td>{p.modified ? new Date(p.modified).toLocaleDateString() : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel message="No post data available." />
          )}
        </Card>
      </div>

      <ConsultingUpsell
        headline="Need professional content? IA writes and optimizes pages for your audience and search engines."
        subtext="Professional content writing and optimization services."
        serviceType="Content Writing"
        triggerPage="website-content"
      />
    </div>
  );
}

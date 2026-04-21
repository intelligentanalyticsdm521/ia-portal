import React from 'react';
import { StatCard, Card, Loading, EmptyPanel, ConsultingUpsell, InfoCard, HealthRow } from '../../components/Ui';
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
  // Plugin content aggregate — live from IA plugin
  const { data: contentAgg } = useArionData(
    () => activeSiteId ? arionApi.getPluginContentAggregate(activeSiteId).catch(() => null) : Promise.resolve(null),
    [activeSiteId]
  );
  // Recent content changes from push webhooks
  const { data: changesLog } = useArionData(
    () => activeSiteId ? arionApi.getPluginUpdatesLog(activeSiteId).catch(() => null) : Promise.resolve(null),
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

  // Plugin content aggregate data
  const caEnv = (contentAgg as any) || {};
  const caConnected = caEnv.plugin_status === 'connected';
  const caData = caEnv.data || {};
  const caSummary = caData.summary || null;
  const caSeo = caData.seo || null;

  return (
    <div>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <StatCard label="Pages" value={String(caSummary?.pages_published ?? pages)} />
        <StatCard label="Blog Posts" value={String(caSummary?.posts_published ?? posts)} />
        <StatCard label="Media Library" value={caSummary?.media_count != null ? caSummary.media_count.toLocaleString() : '—'} />
        <StatCard label="Forms" value={String(formCount)} />
      </div>

      {/* Content Health (plugin-sourced) */}
      {caConnected && caSummary && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Card title="Content publishing state">
            <HealthRow status="ok" label="Published posts" value={caSummary.posts_published ?? 0} />
            <HealthRow status={caSummary.posts_draft > 10 ? 'warn' : 'ok'} label="Drafts" value={caSummary.posts_draft ?? 0} />
            <HealthRow status={caSummary.posts_scheduled > 0 ? 'ok' : 'warn'} label="Scheduled" value={caSummary.posts_scheduled ?? 0} />
            <HealthRow status="ok" label="Pending review" value={caSummary.posts_pending ?? 0} />
            <HealthRow status="ok" label="Last published" value={caSummary.last_published ? new Date(caSummary.last_published).toLocaleDateString() : '—'} />
            <HealthRow status={caSummary.avg_word_count != null && caSummary.avg_word_count < 300 ? 'warn' : 'ok'} label="Avg word count (last 20)" value={caSummary.avg_word_count ?? '—'} />
            <HealthRow status={caSummary.posts_missing_featured_image > 0 ? 'warn' : 'ok'} label="Posts missing featured image" value={caSummary.posts_missing_featured_image ?? 0} />
          </Card>

          <Card title="SEO metadata (Rank Math)">
            {!caSeo?.installed ? (
              <div style={{ padding: 12, color: '#5A7A8A', fontSize: 12, background: '#F8FAFC', borderRadius: 4 }}>
                Rank Math is not installed. Install it to track SEO scores, focus keywords, and meta description completeness per post.
              </div>
            ) : (
              <div>
                <HealthRow status={caSeo.avg_seo_score != null && caSeo.avg_seo_score >= 70 ? 'ok' : 'warn'} label="Avg SEO score" value={caSeo.avg_seo_score != null ? `${caSeo.avg_seo_score}/100` : '—'} />
                <HealthRow status={caSeo.posts_with_seo_score > 0 ? 'ok' : 'warn'} label="Posts with SEO score" value={`${caSeo.posts_with_seo_score ?? 0} of ${caSeo.total_published ?? 0}`} />
                <HealthRow status={caSeo.posts_score_below_50 > 0 ? 'warn' : 'ok'} label="Low-score posts (< 50)" value={caSeo.posts_score_below_50 ?? 0} />
                <HealthRow status={caSeo.posts_missing_meta_desc > 0 ? 'warn' : 'ok'} label="Missing meta description" value={caSeo.posts_missing_meta_desc ?? 0} />
                <HealthRow status={caSeo.posts_missing_focus_kw > 0 ? 'warn' : 'ok'} label="Missing focus keyword" value={caSeo.posts_missing_focus_kw ?? 0} />
                <HealthRow status={caSeo.posts_noindex > 0 ? 'warn' : 'ok'} label="Marked noindex" value={caSeo.posts_noindex ?? 0} />
              </div>
            )}
          </Card>
        </div>
      )}

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

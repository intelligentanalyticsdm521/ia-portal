import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, HealthRow, Loading, ErrorBanner, ConsultingUpsell } from '../../components/Ui';

export function SearchBingIndexNow() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();

  const { data, loading, error } = useArionData(
    () => activeSiteId ? arionApi.getSearchSitemaps('bing', activeSiteId) : Promise.resolve(null),
    [activeSiteId],
  );

  if (loading) return <Loading />;
  if (error) return <ErrorBanner message={error} />;
  if (!selectedSite) return <div style={{ padding: 24, color: 'var(--text-muted)' }}>No site selected.</div>;

  const d = data as Record<string, any> | null;
  const sitemaps = (d?.data?.sitemaps as any[]) ?? [];
  const indexNowActive = sitemaps.some((s: any) => s.indexNow || s.protocol === 'indexnow');
  const lastSubmission = sitemaps.find((s: any) => s.lastSubmitted || s.last_submitted);
  const lastDate = lastSubmission?.lastSubmitted ?? lastSubmission?.last_submitted ?? '--';
  const pagesThisMonth = sitemaps.reduce((sum: number, s: any) => sum + (Number(s.pagesSubmitted ?? s.pages_submitted ?? 0)), 0);

  // Only show actual IndexNow submissions, not generic sitemap entries
  const indexNowSubmissions = sitemaps.filter((s: any) => s.indexNow || s.protocol === 'indexnow');
  const recentSubmissions = indexNowSubmissions.length > 0
    ? indexNowSubmissions.slice(0, 5).map((s: any, i: number) => ({
        url: s.url ?? `Page ${i + 1}`,
        status: s.status ?? 'Submitted',
        date: s.lastSubmitted ?? s.last_submitted ?? '--',
      }))
    : [];

  return (
    <div>
      {/* IndexNow status */}
      <Card title="IndexNow Status">
        <HealthRow
          label="IndexNow Protocol"
          status={indexNowActive ? 'ok' : 'warn'}
          value={indexNowActive ? 'Active' : 'Inactive'}
        />
        <HealthRow
          label="Last Submission"
          status={lastDate !== '--' ? 'ok' : 'warn'}
          value={lastDate}
        />
        <HealthRow
          label="Pages Submitted This Month"
          status={pagesThisMonth > 0 ? 'ok' : 'warn'}
          value={String(pagesThisMonth)}
        />
      </Card>

      {/* Recent submissions table */}
      <Card title="Recent Submissions">
        {recentSubmissions.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr><th>URL</th><th>Status</th><th>Date</th></tr>
            </thead>
            <tbody>
              {recentSubmissions.map((s, i) => (
                <tr key={i}>
                  <td>{s.url}</td>
                  <td>
                    <span style={{
                      color: s.status === 'Accepted' ? 'var(--arion-green, #22c55e)' : 'var(--text-muted)',
                      fontWeight: 600,
                      fontSize: 12,
                    }}>
                      {s.status}
                    </span>
                  </td>
                  <td>{s.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            No submissions yet.
          </div>
        )}
      </Card>

      <Card title="IndexNow Key">
        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>
          An IndexNow key verifies your site ownership for instant indexing notifications to Bing.
        </p>
        <button
          className="abtn abtn-sky"
          onClick={() => alert('IndexNow key generation coming soon')}
        >
          Generate IndexNow Key
        </button>
      </Card>

      <ConsultingUpsell
        headline="Faster indexing means your content ranks sooner"
        subtext="IndexNow integration included with ARION."
        serviceType="SEO Strategy"
        triggerPage="search-bing-indexnow"
      />
    </div>
  );
}

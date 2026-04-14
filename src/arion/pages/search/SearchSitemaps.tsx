import { useState } from 'react';
import { useArionContext } from '../../useArionContext';
import { useArionData } from '../../useArionData';
import { Card, PlatformTabs, EmptyPanel, Loading, InfoCard, ConsultingUpsell } from '../../components/Ui';

export function SearchSitemaps() {
  const { selectedSite, activeSiteId, arionApi } = useArionContext();
  const tier = selectedSite?.arionTier || 'standard';
  const [provider, setProvider] = useState<string>('google');
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);

  const { data, loading } = useArionData(
    () => activeSiteId ? arionApi.getConsole(provider, activeSiteId) : Promise.resolve(null),
    [activeSiteId, provider]
  );

  if (loading) return <Loading />;
  if (!selectedSite) return <EmptyPanel message="No ARION site selected." />;

  const d = data as Record<string, any> | null;
  const sitemaps = (d?.sitemaps as any[]) ?? [];
  const domain = selectedSite.primaryDomain || '';

  // Known sitemap URLs for WordPress sites
  const knownSitemaps = domain ? [
    { url: `https://${domain}/sitemap_index.xml`, type: 'Rank Math', source: 'plugin' },
    { url: `https://${domain}/wp-sitemap.xml`, type: 'WordPress Core', source: 'core' },
  ] : [];

  // Merge API sitemaps with known sitemaps (deduplicate by URL)
  const apiUrls = new Set(sitemaps.map((s: any) => s.url));
  const allSitemaps = [
    ...sitemaps,
    ...knownSitemaps.filter(k => !apiUrls.has(k.url)).map(k => ({ url: k.url, type: k.type, status: 'Detected', lastSubmitted: null, urlsDiscovered: null })),
  ];

  return (
    <>
      <PlatformTabs
        tabs={[{ key: 'google', label: 'Google' }, { key: 'bing', label: 'Bing' }]}
        active={provider}
        onChange={setProvider}
      />

      <Card title="Sitemaps">
        {allSitemaps.length > 0 ? (
          <table className="tbl">
            <thead>
              <tr><th>URL</th><th>Type</th><th>Status</th><th>Last Submitted</th><th>URLs Discovered</th><th></th></tr>
            </thead>
            <tbody>
              {allSitemaps.map((s: any, i: number) => (
                <tr key={i}>
                  <td>{s.url ?? '--'}</td>
                  <td>{s.type ?? '--'}</td>
                  <td>{s.status ?? '--'}</td>
                  <td>{s.lastSubmitted ?? s.last_submitted ?? '--'}</td>
                  <td>{s.urlsDiscovered ?? s.urls_discovered ?? '--'}</td>
                  <td>{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--arion-sky)', fontSize: 12 }}>View</a> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyPanel message="No sitemaps detected. Ensure a sitemap plugin (e.g. Rank Math) is active." />
        )}
      </Card>

      <div style={{ marginTop: '1rem' }}>
        <button
          className="abtn abtn-sky"
          disabled={generating || !activeSiteId}
          onClick={async () => {
            setGenerating(true);
            setGenResult(null);
            try {
              const result = await arionApi.generateSitemap(activeSiteId!);
              setGenResult(result);
            } catch {
              alert('Failed to generate sitemap');
            } finally {
              setGenerating(false);
            }
          }}
        >
          {generating ? 'Submitting...' : 'Resubmit to Search Engines'}
        </button>
      </div>

      {genResult && (
        <div style={{ marginTop: '1rem' }}>
          <InfoCard title="Sitemap Submission Result">
            <p><strong>URLs found:</strong> {genResult.urls}</p>
            {genResult.sitemapUrl && (
              <p><strong>Sitemap URL:</strong> <a href={genResult.sitemapUrl} target="_blank" rel="noreferrer">{genResult.sitemapUrl}</a></p>
            )}
            {!genResult.sitemapDetected && (
              <p style={{ color: '#b45309' }}>No sitemap detected at standard locations. Ensure a sitemap plugin (e.g. Rank Math) is active.</p>
            )}
            {genResult.submittedTo?.length > 0 ? (
              <p><strong>Submitted to:</strong> {genResult.submittedTo.join(', ')}</p>
            ) : (
              <p style={{ color: '#6b7280' }}>Not submitted to any search engine (check integration connections).</p>
            )}
          </InfoCard>
        </div>
      )}

      <ConsultingUpsell
        headline="A well-structured sitemap helps Google find your content faster. IA manages it."
        subtext="Sitemap optimization and submission management."
        serviceType="SEO Strategy"
        triggerPage="search-sitemaps"
      />
    </>
  );
}

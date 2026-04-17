import { useEffect, useMemo, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAccessToken } from '../../auth/useAccessToken';
import { useAppState } from '../../app/AppState';
import { ArionApiError, getArionOverview, type OverviewResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel } from './ArionServiceLayout';
import { useArionSites } from './useArionSites';


interface Props { service: PortalService; status: ServiceStatus }

export function ArionOverviewPage({ service, status }: Props) {
  const apiBaseUrl = import.meta.env.VITE_ARION_API_BASE_URL;
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const { sites, selectedSite, selectedSiteId, setSelectedSiteId, loading: loadingSites, error: sitesError, refresh } = useArionSites();
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Interactive features moved to ARION Client App

  useEffect(() => {
    async function run() {
      if (!activeTenantId || !apiBaseUrl || !selectedSiteId) {
        setData(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const res = await getArionOverview({ baseUrl: apiBaseUrl, bearerToken: token.accessToken, tenantId: activeTenantId, siteId: selectedSiteId });
        setData(res);
      } catch (err) {
        if (err instanceof ArionApiError) setError(`Unable to load overview (${err.status}).`);
        else setError('Unable to load overview.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [activeTenantId, apiBaseUrl, getToken, selectedSiteId]);

  const metrics = useMemo(() => [
    { label: 'Users', value: data?.overview.users ?? '—' },
    { label: 'Sessions', value: data?.overview.sessions ?? '—' },
    { label: 'Search Clicks', value: data?.overview.clicks ?? '—' },
    { label: 'Impressions', value: data?.overview.impressions ?? '—' },
    { label: 'CTR', value: formatPercent(data?.overview.ctr) },
    { label: 'Avg Position', value: formatNumber(data?.overview.avgPosition) },
    { label: 'Site Count', value: data?.permissions.siteCount ?? sites.length },
    { label: 'SEO Package', value: data?.seo.seoPackageCode ?? 'Not enabled' }
  ], [data, sites.length]);

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
    >
      {!selectedSite ? (
        <EmptyPanel title="No ARION sites found" body="Create your first ARION website to begin tracking analytics, console, hosting, maps, and SEO data." />
      ) : (
        <>
          {/* Compact 4x2 stat grid for overview */}
          <div className="grid gap-2 grid-cols-2 md:grid-cols-4 mb-4">
            {metrics.map((item) => (
              <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">{item.value}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ArionCard title="Integrations" subtitle="Connection status across Google, Bing, Apple, and SEO providers">
              <div className="grid gap-3 sm:grid-cols-2">
                {renderStatus('Google Analytics', data?.integrations.googleAnalytics)}
                {renderStatus('Search Console', data?.integrations.googleSearchConsole)}
                {renderStatus('Google Business', data?.integrations.googleBusinessProfile)}
                {renderStatus('Bing Webmaster', data?.integrations.bingWebmaster)}
                {renderStatus('Apple Business', data?.integrations.appleBusinessConnect)}
                {renderStatus('SEO Project', data?.integrations.seRankingProject)}
              </div>
            </ArionCard>
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <ArionCard title="Hosting" subtitle="Website health and maintenance posture">
              <SimpleList rows={[
                ['Site status', data?.hosting.siteStatus || '—'],
                ['SSL', data?.hosting.sslStatus || '—'],
                ['WordPress', data?.hosting.wordpressVersion || '—'],
                ['PHP', data?.hosting.phpVersion || '—'],
                ['Plugin updates', formatNumber(data?.hosting.pluginUpdatesAvailable)],
                ['Performance score', formatNumber(data?.hosting.performanceScore)]
              ]} />
            </ArionCard>
            <ArionCard title="Console" subtitle="Search visibility summary from Google Search Console snapshots">
              <SimpleList rows={[
                ['Clicks', formatNumber(data?.overview.clicks)],
                ['Impressions', formatNumber(data?.overview.impressions)],
                ['CTR', formatPercent(data?.overview.ctr)],
                ['Average position', formatNumber(data?.overview.avgPosition)]
              ]} />
            </ArionCard>
            <ArionCard title="SEO" subtitle="SE Ranking package and most recent SEO snapshot">
              <SimpleList rows={[
                ['Package', data?.seo.seoPackageCode || '—'],
                ['Visibility', formatNumber(data?.seo.visibilityScore)],
                ['Audit score', formatNumber(data?.seo.auditScore)],
                ['Tracked keywords', formatNumber(data?.seo.trackedKeywords)],
                ['Tracked competitors', formatNumber(data?.seo.trackedCompetitors)],
                ['Tracked models', formatNumber(data?.seo.trackedModels)]
              ]} />
            </ArionCard>
          </div>
        </>
      )}
    </ArionServiceLayout>
  );
}

function renderStatus(label: string, connected?: boolean) {
  return (
    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-sm font-medium text-slate-900">{label}</div>
      <div className={`mt-1 text-xs font-semibold ${connected ? 'text-emerald-600' : 'text-slate-500'}`}>{connected ? 'Connected' : 'Not connected'}</div>
    </div>
  );
}

function formatPercent(value?: number | null) { return value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`; }
function formatNumber(value?: number | null) { return value === null || value === undefined ? '—' : Number(value).toLocaleString(); }
function SimpleList({ rows }: { rows: Array<[string, string]> }) {
  return <div className="space-y-2">{rows.map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-900">{value}</span></div>)}</div>;
}

export default ArionOverviewPage;

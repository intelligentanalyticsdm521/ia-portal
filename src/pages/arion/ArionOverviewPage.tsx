import { useEffect, useMemo, useState } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAccessToken } from '../../auth/useAccessToken';
import { useAppState } from '../../app/AppState';
import { ArionApiError, connectGoogle, getArionOverview, type OverviewResponse } from '../../lib/arionApi';
import { ArionCard, ArionServiceLayout, EmptyPanel, SiteActionLink, StatGrid } from './ArionServiceLayout';
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
  const [connecting, setConnecting] = useState(false);

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

  async function handleGoogleConnect() {
    if (!activeTenantId || !apiBaseUrl || !selectedSiteId) return;
    setConnecting(true);
    try {
      const token = await getToken();
      const res = await connectGoogle({
        baseUrl: apiBaseUrl,
        bearerToken: token.accessToken,
        tenantId: activeTenantId,
        siteId: selectedSiteId,
        setupMode: 'ARION_AUTO_SETUP',
        returnUrl: window.location.href
      });
      window.location.assign(res.authUrl);
    } catch (err) {
      console.error(err);
      setError('Unable to start Google connection flow.');
      setConnecting(false);
    }
  }

  return (
    <ArionServiceLayout
      service={service}
      status={status}
      sites={sites}
      selectedSiteId={selectedSiteId}
      onSelectSite={setSelectedSiteId}
      loading={loadingSites || loading}
      error={sitesError || error}
      actions={<div className="flex flex-wrap gap-2">
        <button type="button" disabled={!data?.permissions.canCreateSite} className={`rounded-lg px-3 py-2 text-sm font-medium shadow-sm ${data?.permissions.canCreateSite ? 'bg-slate-900 text-white hover:bg-slate-800' : 'border border-slate-200 bg-slate-100 text-slate-400'}`}>Create New Website</button>
        <button type="button" onClick={handleGoogleConnect} disabled={connecting || !selectedSiteId} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 shadow-sm hover:bg-sky-100">
          {connecting ? 'Connecting…' : 'Connect Google'}
        </button>
      </div>}
    >
      {!selectedSite ? (
        <EmptyPanel title="No ARION sites found" body="Create your first ARION website to begin tracking analytics, console, hosting, maps, and SEO data." />
      ) : (
        <>
          <StatGrid items={metrics} />
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
            <ArionCard title="Quick Links" subtitle="Jump directly into the customer-facing website and key managed resources.">
              <div className="flex flex-wrap gap-2">
                <SiteActionLink href={selectedSite.wpUrl}>Go To Website</SiteActionLink>
                <SiteActionLink href={data?.myBusiness.google.resourceUrl}>Go To Google Business Profile</SiteActionLink>
                <SiteActionLink href={data?.myBusiness.apple.resourceUrl}>Go To Apple Business Connect</SiteActionLink>
                <SiteActionLink href={data?.myBusiness.bing.resourceUrl}>Go To Bing Places</SiteActionLink>
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
